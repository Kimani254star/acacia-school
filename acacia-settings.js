/* acacia-settings.js - one "Settings" page with three tabs, same idea as Books:
     Organization Profile  (logo, name, business details, completeness)
     User Management       (add teammates who can sign in, change roles, remove)
     Appearance            (sidebar colour, text colour, font - from acacia-appearance.js)
   Used by Acacia School and Acacia Hospital (same file). Everything is saved inside the app's own per-company data,
   so it syncs to every device. Teammates are real accounts (same login as Books and the other apps).
   Usage:  ACX_SET.mount(element, { app:'School', store:function(){return S}, save:save, roles:[...], types:[...], defaultType:'School' }) */
(function (w) {
  'use strict';
  var css = document.createElement('style');
  css.textContent =
    '.acxs{--acx:var(--navy,var(--g,#1e3a8a))}' +
    '.acxs-hero{display:flex;gap:14px;align-items:center;flex-wrap:wrap;border:1px solid var(--line,#d9dee8);border-radius:10px;padding:14px;margin-bottom:14px}' +
    '.acxs-logo{width:76px;height:76px;border-radius:12px;border:1px dashed var(--line,#aab3c5);display:flex;align-items:center;justify-content:center;font-size:30px;overflow:hidden;cursor:pointer;flex:none}' +
    '.acxs-logo img{width:100%;height:100%;object-fit:contain}' +
    '.acxs-hero h2{margin:0 0 2px;font-size:18px}.acxs-meta{color:var(--mute,#667);font-size:13px}' +
    '.acxs-chip{display:inline-block;border:1px solid var(--line,#d9dee8);border-radius:99px;padding:2px 10px;font-size:12px;margin:6px 6px 0 0}' +
    '.acxs-bar{height:7px;border-radius:99px;background:rgba(128,128,128,.25);overflow:hidden;margin-top:8px;max-width:280px}' +
    '.acxs-bar i{display:block;height:100%;background:var(--acx);border-radius:99px}' +
    '.acxs textarea{width:100%;min-height:70px;padding:8px;border:1px solid #aab3c5;border-radius:6px;font:inherit;background:Field;color:FieldText;resize:vertical}' +
    '.acxs .full{grid-column:1/-1}' +
    '.acxs-note{color:var(--mute,#667);font-size:13px;margin:0 0 10px}' +
    '.acxs-msg{margin:8px 0 0;font-size:13px;min-height:18px}.acxs-msg.err{color:#b3392f}.acxs-msg.ok{color:#1d6b3d}' +
    '.acxs-you{display:inline-block;margin-left:6px;border-radius:99px;background:var(--acx);color:#fff;font-size:11px;padding:1px 8px}' +
    '.acxs-danger{background:none;border:0;color:#b3392f;cursor:pointer;font:inherit}' +
    '.acxs-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#111827;color:#fff;padding:10px 16px;border-radius:8px;z-index:9500;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.3)}';
  (document.head || document.documentElement).appendChild(css);

  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var low = function (s) { return String(s == null ? '' : s).trim().toLowerCase(); };
  function session() { try { return (w.AcaciaLogin && w.AcaciaLogin.session && w.AcaciaLogin.session()) || {}; } catch (e) { return {}; } }
  function toast(t) { var d = document.createElement('div'); d.className = 'acxs-toast'; d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 2600); }
  var isAdminRole = function (r) { return /^admin/i.test(String(r || '')); };

  var CURRENCIES = ['KES', 'USD', 'EUR', 'GBP', 'UGX', 'TZS', 'RWF', 'ZAR', 'NGN', 'GHS', 'ETB', 'AED', 'INR'];
  var ORG_FIELDS = [
    ['name', 'Organization name', 'text'], ['type', 'Business type', 'select'], ['industry', 'Industry / sector', 'text'],
    ['location', 'Country / city', 'text'], ['address', 'Address', 'text'], ['phone', 'Phone', 'tel'], ['email', 'Email', 'email'],
    ['website', 'Website', 'text'], ['pin', 'Tax PIN', 'text'], ['reg', 'Registration number', 'text'], ['vat', 'VAT number', 'text'], ['currency', 'Currency', 'select']
  ];
  var COMPLETE = ['name', 'type', 'location', 'address', 'phone', 'email', 'pin', 'reg', 'currency', 'logo'];

  var tab = 'org';

  function mount(el, cfg, which) {
    if (which) tab = which;
    var store = cfg.store();
    if (!store.org || typeof store.org !== 'object') store.org = {};
    if (!Array.isArray(store.team)) store.team = [];
    var ses = session(), me = low(ses.email), cid = ses.companyId;
    /* the person who created the company is the first Administrator */
    if (me && !store.team.some(function (u) { return low(u.email) === me; }) && !store.team.length) {
      store.team.push({ name: ses.name || me, email: me, role: 'Administrator' }); cfg.save();
    }
    var mine = store.team.filter(function (u) { return low(u.email) === me; })[0];
    var admin = !mine || isAdminRole(mine.role);

    function draw() {
      el.classList.add('acxs');
      el.innerHTML =
        '<div class="tabs">' +
        [['org', 'Organization Profile'], ['users', 'User Management'], ['appearance', 'Appearance']].map(function (t) { return '<button type="button" data-tab="' + t[0] + '" class="' + (tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') +
        '</div><div id="acxsBody"></div>';
      var body = el.querySelector('#acxsBody');
      if (tab === 'org') orgTab(body); else if (tab === 'users') usersTab(body); else appearanceTab(body);
    }
    el.onclick = function (e) {
      var b = e.target.closest('[data-tab]'); if (b) { tab = b.getAttribute('data-tab'); draw(); }
    };

    /* ---------------- Organization Profile ---------------- */
    function pct(o) { var n = 0; COMPLETE.forEach(function (k) { if (o[k]) n++; }); return Math.round(100 * n / COMPLETE.length); }
    function orgTab(body) {
      var o = store.org;
      if (!o.name) o.name = ses.companyName || ses.company || '';
      if (!o.type) o.type = cfg.defaultType || (cfg.types && cfg.types[0]) || '';
      if (!o.currency) o.currency = 'KES';
      var p = pct(o);
      body.innerHTML =
        '<div class="acxs-hero"><div class="acxs-logo" id="acxsLogo" title="' + (admin ? 'Click to upload your logo' : 'Logo') + '">' + (o.logo ? '<img alt="Logo" src="' + E(o.logo) + '">' : '🏢') + '</div>' +
        '<div style="flex:1;min-width:200px"><h2>' + E(o.name || 'Organization Profile') + '</h2><div class="acxs-meta">' + E([o.type, o.location].filter(Boolean).join(' · ') || 'Complete your profile below') + '</div>' +
        '<span class="acxs-chip">ID: <b>' + E(cid || '—') + '</b></span>' + (o.updated ? '<span class="acxs-chip">Updated: ' + E(String(o.updated).slice(0, 10)) + '</span>' : '') +
        '<div class="acxs-bar" title="' + p + '% complete"><i style="width:' + p + '%"></i></div><div class="acxs-meta">Profile ' + p + '% complete</div></div></div>' +
        '<input type="file" id="acxsFile" accept="image/*" hidden>' +
        '<div class="box"><form id="acxsOrg">' +
        ORG_FIELDS.map(function (f) {
          var k = f[0], v = o[k] || '', inp;
          if (f[2] === 'select') {
            var opts = k === 'type' ? (cfg.types || [o.type]) : CURRENCIES;
            if (v && opts.indexOf(v) < 0) opts = opts.concat([v]);
            inp = '<select name="' + k + '"' + (admin ? '' : ' disabled') + '>' + opts.map(function (x) { return '<option' + (x === v ? ' selected' : '') + '>' + E(x) + '</option>'; }).join('') + '</select>';
          } else inp = '<input name="' + k + '" type="' + f[2] + '" value="' + E(v) + '"' + (admin ? '' : ' disabled') + (k === 'name' ? ' required' : '') + '>';
          return '<div><label>' + f[1] + '</label>' + inp + '</div>';
        }).join('') +
        '<div class="full"><label>Mission</label><textarea name="mission"' + (admin ? '' : ' disabled') + '>' + E(o.mission || '') + '</textarea></div>' +
        '<div class="full"><label>Vision</label><textarea name="vision"' + (admin ? '' : ' disabled') + '>' + E(o.vision || '') + '</textarea></div>' +
        (admin ? '<div class="full"><button class="btn" type="submit">Save profile</button></div>' : '<div class="full acxs-note">Only an Administrator can change the organization profile.</div>') +
        '</form></div>';
      if (!admin) return;
      var logo = body.querySelector('#acxsLogo'), file = body.querySelector('#acxsFile');
      logo.onclick = function () { file.click(); };
      file.onchange = function () {
        var f = file.files && file.files[0]; if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          var im = new Image();
          im.onload = function () {
            var s = Math.min(1, 240 / Math.max(im.width, im.height)), c = document.createElement('canvas');
            c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
            c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
            store.org.logo = c.toDataURL('image/png'); store.org.updated = new Date().toISOString(); cfg.save(); toast('Logo updated'); orgTab(body);
          };
          im.src = rd.result;
        };
        rd.readAsDataURL(f);
      };
      body.querySelector('#acxsOrg').onsubmit = function (e) {
        e.preventDefault();
        var fd = new FormData(e.target), n = {};
        ORG_FIELDS.forEach(function (f) { n[f[0]] = String(fd.get(f[0]) || '').trim(); });
        n.mission = String(fd.get('mission') || '').trim(); n.vision = String(fd.get('vision') || '').trim();
        if (!n.name) return toast('Organization name is required.');
        Object.keys(n).forEach(function (k) { store.org[k] = n[k]; });
        store.org.updated = new Date().toISOString(); cfg.save(); toast('Organization profile saved'); orgTab(body);
      };
    }

    /* ---------------- User Management ---------------- */
    function usersTab(body) {
      var roles = cfg.roles || ['Administrator', 'User'], team = store.team;
      body.innerHTML =
        '<p class="acxs-note">' + team.length + ' user' + (team.length === 1 ? '' : 's') + ' in ' + E(store.org.name || ses.companyName || 'this organization') + '. Users sign in with their email, the company name and the password you set - the same login as the other Acacia apps.</p>' +
        (admin ? '<div class="box"><form id="acxsAdd"><div><label>Full name</label><input name="name" required></div><div><label>Email</label><input name="email" type="email" required></div>' +
          '<div><label>Temporary password</label><input name="pass" type="password" minlength="6" placeholder="At least 6 characters" required></div>' +
          '<div><label>Role</label><select name="role">' + roles.map(function (r, i) { return '<option' + (r === (cfg.defaultRole || roles[roles.length - 1]) ? ' selected' : '') + '>' + E(r) + '</option>'; }).join('') + '</select></div>' +
          '<div><button class="btn" type="submit">Add user</button></div></form><div class="acxs-msg" id="acxsMsg"></div></div>' : '') +
        '<div class="box"><div class="wrap"><table><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr>' +
        team.map(function (u, i) {
          var self = low(u.email) === me;
          return '<tr><td>' + E(u.name) + (self ? '<span class="acxs-you">You</span>' : '') + '</td><td>' + E(u.email) + '</td><td>' +
            (admin ? '<select data-role="' + i + '">' + roles.map(function (r) { return '<option' + (r === u.role ? ' selected' : '') + '>' + E(r) + '</option>'; }).join('') + (roles.indexOf(u.role) < 0 ? '<option selected>' + E(u.role) + '</option>' : '') + '</select>' : E(u.role)) +
            '</td><td>' + (admin && !self ? '<button type="button" class="acxs-danger" data-rm="' + i + '">Remove</button>' : '') + '</td></tr>';
        }).join('') + '</table></div></div>';
      var msg = function (t, cls) { var m = body.querySelector('#acxsMsg'); if (m) { m.textContent = t; m.className = 'acxs-msg ' + (cls || ''); } };
      var cloud = w.AcaciaCloud && w.AcaciaCloud.isCloudId && w.AcaciaCloud.isCloudId(cid);
      var add = body.querySelector('#acxsAdd');
      if (add) add.onsubmit = async function (e) {
        e.preventDefault();
        var fd = new FormData(add), name = String(fd.get('name')).trim(), email = low(fd.get('email')), pass = String(fd.get('pass')), role = String(fd.get('role'));
        if (!name || !email || pass.length < 6) return msg('Enter a name, an email and a password of at least 6 characters.', 'err');
        if (team.some(function (u) { return low(u.email) === email; })) return msg('That email is already a user here.', 'err');
        var btn = add.querySelector('button'); btn.disabled = true; msg('Adding…');
        try { if (cloud) await w.AcaciaCloud.addUser({ companyId: cid, name: name, email: email, password: pass, role: role }); }
        catch (err) { btn.disabled = false; return msg(err.code === 'exists' ? 'That email already has an account in this company.' : (err.code === 'offline' ? 'Could not reach Acacia. Check your internet connection.' : (err.message || 'Could not add the user.')), 'err'); }
        team.push({ name: name, email: email, role: role, added: new Date().toISOString().slice(0, 10) }); cfg.save();
        toast(name + ' added as ' + role); usersTab(body);
      };
      body.onchange = function (e) {
        var s = e.target.closest('[data-role]'); if (!s) return;
        var i = Number(s.getAttribute('data-role')), u = team[i], role = s.value;
        var admins = team.filter(function (x) { return isAdminRole(x.role); }).length;
        if (isAdminRole(u.role) && !isAdminRole(role) && admins <= 1) { toast('Keep at least one Administrator.'); return usersTab(body); }
        u.role = role; cfg.save();
        if (cloud) { try { w.AcaciaCloud.setRole(cid, u.email, role).catch(function () {}); } catch (x) {} }
        toast(u.name + ' is now ' + role);
        if (low(u.email) === me) { mine = u; admin = isAdminRole(role); draw(); }
      };
      body.onclick = function (e) {
        var b = e.target.closest('[data-rm]'); if (!b) return;
        var i = Number(b.getAttribute('data-rm')), u = team[i];
        if (!u || low(u.email) === me) return;
        if (!confirm('Remove ' + u.name + ' from ' + (store.org.name || 'this organization') + '?')) return;
        team.splice(i, 1); cfg.save();
        if (cloud) { try { w.AcaciaCloud.removeUser(cid, u.email).catch(function () {}); } catch (x) {} }
        toast(u.name + ' removed'); usersTab(body);
      };
    }

    /* ---------------- Appearance ---------------- */
    function appearanceTab(body) {
      body.innerHTML = '<p class="acxs-note">Sidebar colour, text colour, font and font size. This only changes how the app looks on this device.</p><div data-acacia-appearance></div>';
      try { if (w.AcaciaAppearance && w.AcaciaAppearance.mount) w.AcaciaAppearance.mount(); } catch (e) {}
    }

    draw();
  }
  w.ACX_SET = { mount: mount };
})(window);
