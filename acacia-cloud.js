/* ===== acacia-cloud: shared Supabase layer for the Acacia apps (same project as Books) =====
   - Sign in / sign up against the same accounts Books uses (table app_accounts)
   - New companies + users show up in Support (acacia_company_status, app_accounts, acacia_app_usage)
   - Each app's data is saved per company in acacia_app_data and loaded on any device
   Needs acacia_apps_cloud.sql to be run once in Supabase. Offline: falls back to this browser's copy. */
(function (w) {
  'use strict';
  var URL_ = 'https://xglsampckermarjpczdf.supabase.co';
  var KEY_ = 'sb_publishable_x-dPR7pzhvJgag9soW0I8w_yfKTmi6A';
  var H = { apikey: KEY_, Authorization: 'Bearer ' + KEY_, 'Content-Type': 'application/json' };
  var cfg = null, ctx = null, timer = 0, hbTimer = 0;
  var rawSet = Storage.prototype.setItem;
  var low = function (v) { return String(v == null ? '' : v).trim().toLowerCase(); };
  var enc = encodeURIComponent;
  var isCloudId = function (id) { return /^(ACC-\d+|company_[A-Za-z0-9_]+)$/i.test(String(id || '')); };
  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }

  async function req(path, opt) {
    var ctl = w.AbortController ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, 12000) : null;
    try {
      var r = await fetch(URL_ + '/rest/v1/' + path, Object.assign({ headers: H, signal: ctl ? ctl.signal : undefined }, opt || {}));
      if (t) clearTimeout(t);
      return r;
    } catch (e) { if (t) clearTimeout(t); throw err('offline', 'Cannot reach the Acacia cloud. Check your internet connection.'); }
  }
  async function rpc(name, args) {
    var r = await req('rpc/' + name, { method: 'POST', body: JSON.stringify(args || {}) });
    var j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) {
      var m = (j && (j.message || j.hint)) || ('HTTP ' + r.status);
      var e = err(/already exists|exists/i.test(m) ? 'exists' : (r.status === 404 ? 'missing' : 'rpc'), m); e.status = r.status; throw e;
    }
    return j;
  }

  /* same hashing as Books: SHA-256 of "salt:password" */
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function newSalt() { var a = new Uint8Array(16); crypto.getRandomValues(a); return hex(a); }
  async function hash(pass, salt) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pass))); }
  async function verify(d, pass) {
    d = d || {};
    if (d.passwordHash && d.passwordSalt) return (await hash(pass, d.passwordSalt)) === d.passwordHash;
    return typeof d.password === 'string' && d.password === pass;
  }
  function mapRole(r, d) { return cfg && cfg.mapRole ? cfg.mapRole(r, d) : (/^admin/i.test(String(r || '')) ? 'Administrator' : (r || 'Administrator')); }

  /* deleted / suspended companies are blocked (fails open if the cloud can't be reached) */
  async function gate(cid, login) {
    try { if ((await rpc('acx_account_state', { p_company: low(cid), p_login: low(login) })) === 'deleted') return 'This account was removed by Acacia support.'; } catch (e) {}
    try {
      var r = await req('acacia_company_status?select=status&company_id=eq.' + enc(cid));
      if (r.ok) { var j = await r.json(); var s = j[0] && j[0].status; if (s === 'pending') return 'Your company is waiting for approval by Acacia support. You will be able to sign in as soon as it is approved.'; if (s && s !== 'active') return 'Your company account is "' + s + '". Please contact Acacia support.'; }
    } catch (e) {}
    /* paid add-on apps: the company's subscription must include this app (fails open if the status row can't be read) */
    try {
      var ADDON = { crm: 'Acacia CRM', projects: 'Acacia Projects', payroll: 'Acacia Payroll', sell: 'Acacia Sell' };
      var appKey = low(cfg && cfg.app), appName = ADDON[appKey];
      if (appName) {
        var r2 = await req('acacia_company_status?select=*&company_id=eq.' + enc(cid));
        if (r2.ok) {
          var row = (await r2.json())[0];
          if (row) {
            var plan = low(row.plan), apps = String(row.apps || '').split(',').map(function (x) { return low(x); }).filter(Boolean);
            var lapsed = row.paid_until && !isNaN(new Date(row.paid_until)) && new Date(row.paid_until) < new Date();
            if (lapsed || (row.downgraded_at && plan === 'free' && !row.paid_until)) return 'Your Acacia subscription has expired, so ' + appName + ' is locked. Renew it in Books (Subscription) to continue.';
            var legacy = row.all_apps === null || row.all_apps === undefined;      /* companies created before apps were recorded stay open */
            var all = row.all_apps === true || low(row.all_apps) === 'true' || plan === 'all access' || apps.indexOf('*') > -1 || apps.indexOf('all') > -1;
            if (!legacy && !all && apps.indexOf(appKey) < 0) return appName + " is not part of your company's subscription. Ask your company admin to add it under Subscription in Books, or upgrade to All Access.";
          }
        }
      }
    } catch (e) {}
    return null;
  }

  async function signIn(email, pass, company) {
    email = low(email);
    var r = await req('app_accounts?select=login_id,username,company_id,data&login_id=eq.' + enc(email));
    if (!r.ok) throw err('offline', 'Could not read accounts (' + r.status + '). Run acacia_apps_cloud.sql in Supabase.');
    var rows = await r.json(), ok = [], cn = low(company);
    if (cn) rows = rows.filter(function (x) { var d = x.data || {}; return low(d.companyName) === cn || low(x.company_id) === cn || (d.previousCompanyNames || []).map(low).indexOf(cn) > -1; });
    for (var i = 0; i < rows.length; i++) if (await verify(rows[i].data, pass)) ok.push(rows[i]);
    if (!ok.length) return null;
    var row = ok[0];
    if (ok.length > 1) {
      var pick = w.prompt('This login belongs to more than one company:\n' + ok.map(function (x, n) { return (n + 1) + '. ' + ((x.data && x.data.companyName) || x.company_id) + ' (' + x.company_id + ')'; }).join('\n') + '\n\nType the number to open:', '1');
      row = ok[(parseInt(pick, 10) || 1) - 1] || ok[0];
    }
    var msg = await gate(row.company_id, email); if (msg) throw err('blocked', msg);
    var d = row.data || {};
    return { companyId: row.company_id, company: d.companyName || '', name: d.fullName || d.username || email.split('@')[0], email: email, role: mapRole(d.role, d), passwordHash: d.passwordHash, passwordSalt: d.passwordSalt };
  }

  async function register(o) {
    var salt = newSalt(), h = await hash(o.password, salt);
    var id = await rpc('acx_register_company', { p_company: o.company, p_name: o.name, p_email: low(o.email), p_hash: h, p_salt: salt, p_app: cfg.app, p_plan: o.plan || '', p_billing: o.billing || 'monthly' });
    var blocked = await gate(id, o.email);
    return { companyId: id, passwordHash: h, passwordSalt: salt, blocked: blocked };
  }

  /* teammates added inside an app (CRM Users & Roles). The app's own role is kept per app; Books sees admin/user */
  var booksRole = function (r) { return /^admin/i.test(String(r || '')) ? 'admin' : 'user'; };
  async function addUser(o) {
    var salt = newSalt(), h = await hash(o.password, salt);
    await rpc('acx_add_user', { p_company: o.companyId, p_name: o.name, p_email: low(o.email), p_role: booksRole(o.role), p_hash: h, p_salt: salt, p_app: cfg.app, p_app_role: o.role || '' });
    return { passwordHash: h, passwordSalt: salt };
  }
  function setRole(companyId, email, role) { return rpc('acx_set_user_role', { p_company: companyId, p_email: low(email), p_role: booksRole(role), p_app: cfg.app, p_app_role: role || '' }); }
  function removeUser(companyId, email) { return rpc('acx_remove_user', { p_company: companyId, p_email: low(email) }); }

  /* keep a copy of cloud users in this browser so the app's own session code keeps working (and offline sign-in) */
  function cacheUser(usersKey, u) {
    try {
      var list = JSON.parse(localStorage.getItem(usersKey) || '[]');
      var rec = { companyId: u.companyId, company: u.company, name: u.name, email: low(u.email), role: u.role, passwordHash: u.passwordHash, passwordSalt: u.passwordSalt };
      var i = list.findIndex(function (x) { return low(x.email) === rec.email && x.companyId === rec.companyId; });
      if (i > -1) { list[i] = Object.assign({}, list[i], rec); delete list[i].password; } else list.push(rec);
      rawSet.call(localStorage, usersKey, JSON.stringify(list));
    } catch (e) {}
  }
  function verifyLocal(u, pass) { return verify(u, pass); }

  /* accounts that only ever existed in this browser get a cloud company; their data and teammates move with them.
     'all' is the local users array: it is updated in place (caller saves it). Returns the signed-in user's new record. */
  async function migrate(u, pass, all) {
    var oldId = u.companyId, same = (all || [u]).filter(function (x) { return x.companyId === oldId; });
    var owner = same.find(function (x) { return /^admin/i.test(String(x.role || 'Administrator')) && x.password; }) || u;
    var ownerPass = owner === u ? pass : owner.password;
    var r = await register({ company: owner.company, name: owner.name, email: owner.email, password: ownerPass });
    for (var i = 0; i < same.length; i++) {
      var x = same[i];
      if (x === owner) { x.passwordHash = r.passwordHash; x.passwordSalt = r.passwordSalt; }
      else {
        var pw = x === u ? pass : x.password;
        if (pw) { try { var h = await addUser({ companyId: r.companyId, name: x.name, email: x.email, password: pw, role: x.role || 'Administrator' }); x.passwordHash = h.passwordHash; x.passwordSalt = h.passwordSalt; } catch (e) { continue; } }
        else continue;
      }
      delete x.password; x.companyId = r.companyId;
    }
    var o = cfg.dataKey(oldId), n = cfg.dataKey(r.companyId), v = localStorage.getItem(o);
    if (v != null) { rawSet.call(localStorage, n, v); localStorage.removeItem(o); rawSet.call(localStorage, dirtyKey(r.companyId), '1'); }
    return same.find(function (x) { return low(x.email) === low(u.email) && x.companyId === r.companyId; }) || null;
  }

  /* ---- data sync (one JSON blob per company per app) ---- */
  function tsKey(c) { return 'acx_ts_' + cfg.app + '_' + (c || ctx.companyId); }
  function dirtyKey(c) { return 'acx_dirty_' + cfg.app + '_' + (c || ctx.companyId); }
  async function pullRow(app) {
    var r = await req('acacia_app_data?select=value,updated_at&key=eq.data&company_id=eq.' + enc(ctx.companyId) + '&app=eq.' + enc(app));
    if (!r.ok) return null; var j = await r.json(); return j[0] || null;
  }
  async function pushNow() {
    if (!ctx || !isCloudId(ctx.companyId)) return false;
    var v = localStorage.getItem(cfg.dataKey(ctx.companyId)); if (v == null) return false;
    try {
      var r = await req('acacia_app_data?on_conflict=company_id,app,key', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=representation' }), body: JSON.stringify({ company_id: ctx.companyId, app: cfg.app, key: 'data', value: v }) });
      if (r.ok) { var j = await r.json(); rawSet.call(localStorage, tsKey(), (j[0] && j[0].updated_at) || ''); localStorage.removeItem(dirtyKey()); return true; }
    } catch (e) {}
    return false;
  }
  function schedule() {
    if (!ctx || !isCloudId(ctx.companyId)) return;
    rawSet.call(localStorage, dirtyKey(), '1');
    clearTimeout(timer); timer = setTimeout(pushNow, 2500);
  }
  function flush() {
    if (!ctx || !isCloudId(ctx.companyId) || localStorage.getItem(dirtyKey()) !== '1') return;
    clearTimeout(timer);
    var v = localStorage.getItem(cfg.dataKey(ctx.companyId)); if (v == null) return;
    try {
      fetch(URL_ + '/rest/v1/acacia_app_data?on_conflict=company_id,app,key', { method: 'POST', keepalive: v.length < 60000, headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ company_id: ctx.companyId, app: cfg.app, key: 'data', value: v }) }).then(function (r) { if (r.ok) localStorage.removeItem(dirtyKey()); }).catch(function () {});
    } catch (e) {}
  }
  async function pullData() {
    var row = await pullRow(cfg.app);
    var dirty = localStorage.getItem(dirtyKey()) === '1', last = localStorage.getItem(tsKey());
    if (row && !dirty && row.updated_at !== last) { rawSet.call(localStorage, cfg.dataKey(ctx.companyId), row.value); rawSet.call(localStorage, tsKey(), row.updated_at); }
    else if (!row) { if (localStorage.getItem(cfg.dataKey(ctx.companyId)) != null) await pushNow(); }
    else if (dirty) await pushNow();
  }
  /* read-only copies of another app's data (e.g. Expenses reads Payroll) */
  async function pullExtras() {
    var ex = cfg.readFrom || [];
    for (var i = 0; i < ex.length; i++) { try { var row = await pullRow(ex[i].app); if (row) rawSet.call(localStorage, ex[i].dataKey(ctx.companyId), row.value); } catch (e) {} }
  }

  function heartbeat() {
    if (!ctx || !isCloudId(ctx.companyId) || !ctx.email) return;
    var k = 'acx_hb_' + ctx.companyId + '_' + cfg.app + '_' + ctx.email;
    if (Date.now() - Number(localStorage.getItem(k) || 0) < 3e5) return;
    rawSet.call(localStorage, k, String(Date.now()));
    try { fetch(URL_ + '/rest/v1/rpc/acx_heartbeat', { method: 'POST', headers: H, keepalive: true, body: JSON.stringify({ p_company: ctx.companyId, p_app: cfg.app, p_user: ctx.email, p_role: String(ctx.role || '') }) }).catch(function () {}); } catch (e) {}
  }

  /* called when a user enters the app: returns 'ok' | 'local' | 'blocked:<message>' */
  async function start(user) {
    ctx = { companyId: user.companyId, email: low(user.email), role: user.role || '' };
    if (!isCloudId(ctx.companyId)) return 'local';
    var msg = await gate(ctx.companyId, ctx.email); if (msg) return 'blocked:' + msg;
    try { await pullData(); await pullExtras(); } catch (e) {}
    heartbeat(); clearInterval(hbTimer); hbTimer = setInterval(function () { heartbeat(); }, 3e5);
    return 'ok';
  }
  function stop() { flush(); clearInterval(hbTimer); ctx = null; }

  function init(c) {
    cfg = c;
    Storage.prototype.setItem = function (k, v) {
      rawSet.apply(this, arguments);
      try { if (this === w.localStorage && ctx && k === cfg.dataKey(ctx.companyId)) schedule(); } catch (e) {}
    };
    w.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
  }

  /* sign-up plan note: reads #regPlan / #regBilling and shows what the company will pay */
  w.acxPlanChanged = function () {
    var s = document.getElementById('regPlan'), b = document.getElementById('regBilling'), n = document.getElementById('regPlanNote');
    if (!s || !n) return;
    var o = s.options[s.selectedIndex], p = Number((o && o.getAttribute('data-price')) || 0), y = !!b && b.value === 'yearly';
    var f = function (x) { return 'KES ' + x.toLocaleString('en-US'); };
    n.textContent = y ? f(p * 10) + ' for the year (2 months free). Billed after Acacia support approves your account.' : f(p) + ' per month. Billed after Acacia support approves your account.';
  };
  setTimeout(function () { try { if (w.acxPlanChanged) w.acxPlanChanged(); } catch (e) {} }, 0);

  w.AcaciaCloud = { init: init, signIn: signIn, register: register, addUser: addUser, setRole: setRole, removeUser: removeUser, cacheUser: cacheUser, verifyLocal: verifyLocal, migrate: migrate, start: start, stop: stop, flush: flush, isCloudId: isCloudId, gate: gate, URL: URL_, KEY: KEY_, rpc: rpc, req: req };
})(window);
