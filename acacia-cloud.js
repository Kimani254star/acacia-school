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
    try { if (/^(deleted|deactivated)$/.test(String(await rpc('acx_account_state', { p_company: low(cid), p_login: low(login) })))) return 'This company account has been deactivated or removed. Contact Acacia support.'; } catch (e) {}
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
    /* passwords are checked inside Postgres (acx_login); the browser never sees a hash */
    var rows;
    try { rows = await rpc('acx_login', { p_email: email, p_password: pass, p_company: company || null }); }
    catch (e) { if (e.code === 'missing') return signInLegacy(email, pass, company); throw e; }   /* acx_login not installed yet: remove this line once step2_secure_login.sql is run */
    if (!Array.isArray(rows) || !rows.length) return null;
    return finishSignIn(rows, email);
  }

  async function finishSignIn(ok, email) {
    var row = ok[0];
    if (ok.length > 1) {
      var pick = w.prompt('This login belongs to more than one company:\n' + ok.map(function (x, n) { return (n + 1) + '. ' + ((x.data && x.data.companyName) || x.company_id) + ' (' + x.company_id + ')'; }).join('\n') + '\n\nType the number to open:', '1');
      row = ok[(parseInt(pick, 10) || 1) - 1] || ok[0];
    }
    var msg = await gate(row.company_id, email); if (msg) throw err('blocked', msg);
    try { if (row.session && w.AcxSession) w.AcxSession.add(row.session); } catch (e) {}   /* session token for row-level security */
    var d = row.data || {};
    return { companyId: row.company_id, company: d.companyName || '', name: d.fullName || d.username || email.split('@')[0], email: email, role: mapRole(d.role, d) };
  }

  /* OLD path (reads the hash into the browser). Only used until acx_login exists. */
  async function signInLegacy(email, pass, company) {
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
      Object.keys(rec).forEach(function (k) { if (rec[k] === undefined) delete rec[k]; });
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

  /* ---- data sync (one JSON blob per company per app) ----
     Record-level three-way merge + compare-and-swap push, so several people editing the same company at once do not overwrite each other.
       base = the copy last agreed with the cloud (acx_base_*), local = this browser's copy, remote = the cloud's copy.
     - records (arrays of objects that have an id) are merged one by one; a record edited on one side and deleted on the other is kept
     - a field changed on both sides keeps this browser's value; counters (next..., ...number) keep the larger value
     - a push only succeeds if the cloud copy is still the one we merged with (updated_at must match); otherwise we merge again */
  var syncTimer = 0, syncBusy = false, pendingRender = false, hookReload = null, hookRender = null;
  function tsKey(c) { return 'acx_ts_' + cfg.app + '_' + (c || ctx.companyId); }
  function dirtyKey(c) { return 'acx_dirty_' + cfg.app + '_' + (c || ctx.companyId); }
  function baseKey(c) { return 'acx_base_' + cfg.app + '_' + (c || ctx.companyId); }

  /*MERGE-START*/
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
    return JSON.stringify(v);
  }
  function same(a, b) { return canon(a) === canon(b); }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function idKeyFor(arrs) {
    var cands = ['id', '_id', 'uid'];
    for (var i = 0; i < cands.length; i++) {
      var c = cands[i];
      var ok = arrs.every(function (a) {
        var seen = {};
        return a.every(function (x) {
          if (!isObj(x) || x[c] == null || x[c] === '') return false;
          var k = String(x[c]); if (seen[k]) return false; seen[k] = 1; return true;
        });
      });
      if (ok) return c;
    }
    return null;
  }
  function mergeArr(b, l, r) {
    var k = idKeyFor([b, l, r]), out = [], seen = {};
    if (k) {
      var mb = {}, ml = {}, mr = {};
      b.forEach(function (x) { mb[x[k]] = x; }); l.forEach(function (x) { ml[x[k]] = x; }); r.forEach(function (x) { mr[x[k]] = x; });
      var take = function (id) {
        if (seen[id]) return; seen[id] = 1;
        var inB = id in mb, inL = id in ml, inR = id in mr;
        if (inL && inR) out.push(merge3(mb[id], ml[id], mr[id]));
        else if (inL) { if (!inB || !same(mb[id], ml[id])) out.push(ml[id]); }
        else if (inR) { if (!inB || !same(mb[id], mr[id])) out.push(mr[id]); }
      };
      r.forEach(function (x) { take(x[k]); }); l.forEach(function (x) { take(x[k]); });
      return out;
    }
    /* no ids: treat the array as a set of values */
    var sb = {}, sl = {}, sr = {};
    b.forEach(function (x) { sb[canon(x)] = 1; }); l.forEach(function (x) { sl[canon(x)] = 1; }); r.forEach(function (x) { sr[canon(x)] = 1; });
    var add = function (x) {
      var c = canon(x); if (seen[c]) return; seen[c] = 1;
      var inB = c in sb, inL = c in sl, inR = c in sr;
      if ((inL && inR) || (inL && !inB) || (inR && !inB)) out.push(x);
    };
    r.forEach(add); l.forEach(add);
    return out;
  }
  function merge3(b, l, r, name) {
    if (same(l, r)) return l;
    if (same(b, l)) return r;
    if (same(b, r)) return l;
    if (Array.isArray(l) && Array.isArray(r)) return mergeArr(Array.isArray(b) ? b : [], l, r);
    if (isObj(l) && isObj(r)) {
      var bb = isObj(b) ? b : {}, out = {}, keys = {};
      [l, r, bb].forEach(function (o) { Object.keys(o).forEach(function (k) { keys[k] = 1; }); });
      Object.keys(keys).forEach(function (k) {
        var inB = k in bb, inL = k in l, inR = k in r;
        if (inL && inR) out[k] = merge3(bb[k], l[k], r[k], k);
        else if (inL) { if (!inB || !same(bb[k], l[k])) out[k] = l[k]; }
        else if (inR) { if (!inB || !same(bb[k], r[k])) out[k] = r[k]; }
      });
      return out;
    }
    if (typeof l === 'number' && typeof r === 'number' && /^(next|counter|seq)|(number|counter|seq)$/i.test(name || '')) return Math.max(l, r);
    return l;
  }
  function mergeValue(baseStr, localStr, remoteStr) {
    var p = function (s) { try { return JSON.parse(s); } catch (e) { return undefined; } };
    var l = p(localStr), r = p(remoteStr);
    if (l === undefined) return remoteStr;
    if (r === undefined) return localStr;
    return JSON.stringify(merge3(baseStr == null ? undefined : p(baseStr), l, r));
  }
  /*MERGE-END*/

  async function getRow() {
    var r = await req('acacia_app_data?select=value,updated_at&key=eq.data&company_id=eq.' + enc(ctx.companyId) + '&app=eq.' + enc(cfg.app));
    if (!r.ok) throw err('offline', 'Could not read data (' + r.status + ')');
    var j = await r.json(), row = j[0] || null;
    if (row && typeof row.value !== 'string') row.value = JSON.stringify(row.value);
    return row;
  }
  /* compare-and-swap write: succeeds only if the cloud copy still has updated_at = prevTs (or does not exist yet when prevTs is empty) */
  async function casPush(v, prevTs) {
    var now = new Date().toISOString(), r, j;
    try {
      if (!prevTs) {
        r = await req('acacia_app_data', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'return=representation' }), body: JSON.stringify({ company_id: ctx.companyId, app: cfg.app, key: 'data', value: v, updated_at: now }) });
        if (r.status === 409) return 'conflict';
      } else {
        r = await req('acacia_app_data?key=eq.data&company_id=eq.' + enc(ctx.companyId) + '&app=eq.' + enc(cfg.app) + '&updated_at=eq.' + enc(prevTs), { method: 'PATCH', headers: Object.assign({}, H, { Prefer: 'return=representation' }), body: JSON.stringify({ value: v, updated_at: now }) });
      }
      if (!r.ok) return 'error';
      j = await r.json();
      if (!j[0]) return 'conflict';
      return { ts: j[0].updated_at };
    } catch (e) { return 'error'; }
  }
  function commit(v, ts) {
    rawSet.call(localStorage, tsKey(), ts || '');
    rawSet.call(localStorage, baseKey(), v);
    localStorage.removeItem(dirtyKey());
  }
  async function syncNow() {
    if (!ctx || !isCloudId(ctx.companyId) || syncBusy) return false;
    syncBusy = true;
    var changed = false;
    try {
      for (var n = 0; n < 4; n++) {
        var dk = cfg.dataKey(ctx.companyId), local = localStorage.getItem(dk), res, row = await getRow();
        var last = localStorage.getItem(tsKey()), dirty = localStorage.getItem(dirtyKey()) === '1';
        if (!row) {
          if (local == null) break;
          res = await casPush(local, null);
          if (res === 'conflict') continue;
          if (res === 'error') break;
          if (localStorage.getItem(dk) === local) commit(local, res.ts);
          break;
        }
        if (row.updated_at === last) {                       /* cloud unchanged since our last sync */
          if (!dirty || local == null) break;
          if (local === row.value) { commit(local, row.updated_at); break; }
          res = await casPush(local, row.updated_at);
          if (res === 'conflict') continue;
          if (res === 'error') break;
          if (localStorage.getItem(dk) === local) commit(local, res.ts);
          break;
        }
        if (!dirty || local == null) {                       /* cloud moved on, nothing of ours to keep: take the cloud copy */
          rawSet.call(localStorage, dk, row.value); commit(row.value, row.updated_at); changed = true; break;
        }
        var merged = mergeValue(localStorage.getItem(baseKey()), local, row.value);
        if (merged === row.value) {
          if (localStorage.getItem(dk) === local) { rawSet.call(localStorage, dk, merged); commit(merged, row.updated_at); changed = true; }
          break;
        }
        res = await casPush(merged, row.updated_at);
        if (res === 'conflict') continue;
        if (localStorage.getItem(dk) !== local) break;       /* edited while we were saving: leave it, the next sync merges it in */
        rawSet.call(localStorage, dk, merged); changed = true;
        if (res === 'error') { rawSet.call(localStorage, baseKey(), row.value); break; }
        commit(merged, res.ts);
        break;
      }
    } catch (e) {}
    syncBusy = false;
    if (changed) applyRemote();
    return changed;
  }
  function schedule() {
    if (!ctx || !isCloudId(ctx.companyId)) return;
    rawSet.call(localStorage, dirtyKey(), '1');
    clearTimeout(timer); timer = setTimeout(function () { syncNow(); }, 2500);
  }
  /* page closing: one last compare-and-swap write; it only goes through if nobody else saved since our last sync (otherwise it stays unsaved and is merged next time) */
  function flush() {
    if (!ctx || !isCloudId(ctx.companyId) || localStorage.getItem(dirtyKey()) !== '1') return;
    clearTimeout(timer);
    var v = localStorage.getItem(cfg.dataKey(ctx.companyId)), last = localStorage.getItem(tsKey());
    if (v == null || !last) return;
    var dk = dirtyKey();
    try {
      fetch(URL_ + '/rest/v1/acacia_app_data?key=eq.data&company_id=eq.' + enc(ctx.companyId) + '&app=eq.' + enc(cfg.app) + '&updated_at=eq.' + enc(last), { method: 'PATCH', keepalive: v.length < 60000, headers: Object.assign({}, H, { Prefer: 'return=representation' }), body: JSON.stringify({ value: v, updated_at: new Date().toISOString() }) })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (j && j.length) localStorage.removeItem(dk); })
        .catch(function () {});
    } catch (e) {}
  }
  async function pullData() { await syncNow(); }

  /* the app registers two callbacks: reload (re-read its in-memory data from storage) and render (redraw the current screen) */
  function onRemote(reload, render) { hookReload = reload; hookRender = render; }
  function typing() {
    var a = document.activeElement;
    return !!a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable) && a.type !== 'button' && a.type !== 'checkbox' && a.type !== 'radio';
  }
  function paint() {
    if (!pendingRender || typing()) return;
    pendingRender = false;
    try { if (hookRender) hookRender(); } catch (e) { console.error(e); }
  }
  function applyRemote() {
    try { if (hookReload) hookReload(); } catch (e) { console.error(e); }
    pendingRender = true; paint();
  }
  function startPoll() { clearInterval(syncTimer); syncTimer = setInterval(function () { if (document.hidden) return; paint(); syncNow(); }, 30000); }
  function stopPoll() { clearInterval(syncTimer); syncTimer = 0; }

  /* read-only copies of another app's data (e.g. Expenses reads Payroll) */
  async function pullRow(app) {
    var r = await req('acacia_app_data?select=value,updated_at&key=eq.data&company_id=eq.' + enc(ctx.companyId) + '&app=eq.' + enc(app));
    var j = r.ok ? await r.json() : []; var row = j[0] || null;
    if (row && typeof row.value !== 'string') row.value = JSON.stringify(row.value);
    return row;
  }
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
    startPoll(); heartbeat(); clearInterval(hbTimer); hbTimer = setInterval(function () { heartbeat(); }, 3e5);
    return 'ok';
  }
  function stop() { flush(); stopPoll(); clearInterval(hbTimer); ctx = null; }

  function init(c) {
    cfg = c;
    Storage.prototype.setItem = function (k, v) {
      rawSet.apply(this, arguments);
      try { if (this === w.localStorage && ctx && k === cfg.dataKey(ctx.companyId)) schedule(); } catch (e) {}
    };
    w.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); else syncNow(); });
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

  w.AcaciaCloud = { onRemote: onRemote, sync: syncNow, init: init, signIn: signIn, register: register, addUser: addUser, setRole: setRole, removeUser: removeUser, cacheUser: cacheUser, verifyLocal: verifyLocal, migrate: migrate, start: start, stop: stop, flush: flush, isCloudId: isCloudId, gate: gate, URL: URL_, KEY: KEY_, rpc: rpc, req: req };
})(window);
