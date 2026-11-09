/* Acacia login - same sign in / create account flow as Acacia Inventory (company name, email, password).
 * Needs acacia-cloud.js loaded first. Usage: AcaciaLogin.init({app:'hospital', name:'Acacia Hospital', color:'#1f6b4f', price:800});
 * The session is stored under "acacia_session", the same key the other Acacia apps use, so one sign in covers every app on the same site. */
(function (w) {
  'use strict';
  var KEY = 'acacia_session', cfg = {};
  w.acxSession = function () { return ses(); };
  w.toggleSupportPopup = function () {
    var p = document.getElementById('aclSup'); if (p) { p.remove(); return; }
    p = document.createElement('div'); p.id = 'aclSup';
    p.style.cssText = 'position:fixed;right:11rem;top:5rem;z-index:9000;width:280px;max-width:calc(100vw - 24px);background:#fff;color:#1b1b1b;border-radius:12px;box-shadow:0 12px 40px #0006;padding:16px;font-size:14px;line-height:1.6';
    p.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><b>Acacia Support</b><button type="button" style="border:0;background:none;font-size:18px;cursor:pointer" aria-label="Close">\u2715</button></div><p style="margin:8px 0 0">Call us:<br><a href="tel:0717346231">0717 346 231</a><br><a href="tel:0731858997">0731 858 997</a></p><p style="margin:8px 0 0">Email:<br><a href="mailto:developeracaciabooks@gmail.com">developeracaciabooks@gmail.com</a></p>';
    p.querySelector('button').onclick = function () { p.remove(); }; document.body.appendChild(p);
  };
  function ses() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function $(id) { return document.getElementById(id); }
  function show(el, m) { el.textContent = m; el.hidden = false; }
  function style() {
    var s = document.createElement('style');
    s.textContent = '#aclOv{position:fixed;inset:0;z-index:100;background:' + cfg.color + ';display:grid;place-items:center;padding:16px;overflow:auto;font-family:inherit}' +
      '.acl-card{background:#fff;color:#1b1b1b;border-radius:16px;width:100%;max-width:420px;box-shadow:0 20px 50px #0006;overflow:hidden}' +
      'html[data-theme=dark] .acl-card{background:#1c2430;color:#eceff4}' +
      '.acl-head{text-align:center;padding:22px 20px 12px;border-bottom:1px solid #8884}.acl-head img{width:64px;height:64px;border-radius:14px;background:#fdfcf8;object-fit:contain}.acl-head h1{margin:10px 0 2px;font-size:22px}.acl-head p{margin:0;font-size:13px;opacity:.7}' +
      '.acl-tabs{display:flex;border-bottom:1px solid #8884}.acl-tabs button{flex:1;padding:12px;background:none;border:0;border-bottom:3px solid transparent;font:inherit;font-weight:700;color:inherit;opacity:.6;cursor:pointer}.acl-tabs button.on{opacity:1;border-bottom-color:' + cfg.color + '}' +
      '.acl-card form{padding:18px 20px;display:flex;flex-direction:column;gap:10px}.acl-card form[hidden]{display:none}.acl-card label{font-size:12px;font-weight:700;opacity:.75}' +
      '.acl-card input:not([type=checkbox]),.acl-card select{width:100%;height:40px;padding:0 10px;border:1px solid #8886;border-radius:8px;font:inherit;background:transparent;color:inherit}.acl-card select option{color:#222;background:#fff}' +
      '.acl-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.acl-go{height:42px;border:0;border-radius:8px;background:' + cfg.color + ';color:#fff;font:inherit;font-weight:700;cursor:pointer}' +
      '.acl-err{color:#d33;font-size:12px;margin:0}.acl-err[hidden]{display:none}.acl-note{font-size:12px;opacity:.7;margin:0}.acl-chk{display:flex;gap:8px;align-items:flex-start;font-size:12px;font-weight:400!important}' +
      '#aclOut{position:fixed;right:64px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:40;height:42px;padding:0 14px;border-radius:21px;border:1px solid rgba(128,128,128,.45);background:var(--panel,#fff);color:inherit;font:inherit;font-size:13px;cursor:pointer;box-shadow:0 2px 8px #0003}' +
      'html[data-theme=dark] #aclOut{background:#1f2937;color:#eee}';
    document.head.appendChild(s);
  }
  function build() {
    var land = cfg.landing ? landing() : null;
    var price = cfg.price || 800, f = function (x) { return 'KES ' + x.toLocaleString('en-US'); };
    var o = document.createElement('div'); o.id = 'aclOv';
    o.innerHTML = '<div class="acl-card"><div class="acl-head"><img src="logo.png" alt="Acacia logo"><h1>' + cfg.name + '</h1><p>Sign in or create your workspace account.</p></div>' +
      '<div class="acl-tabs"><button type="button" id="aclTi" class="on">Sign In</button><button type="button" id="aclTu">Create Account</button></div>' +
      '<form id="aclSi"><div><label>Company name</label><input id="siCompany" required placeholder="Exactly as registered (or company ID)"></div>' +
      '<div><label>Email</label><input id="siEmail" type="email" required placeholder="you@example.com"></div>' +
      '<div><label>Password</label><input id="siPass" type="password" required></div>' +
      '<button class="acl-go">Sign In</button><p class="acl-err" id="siError" hidden></p><p class="acl-note">Use the company name, email and password of your Acacia account.</p></form>' +
      '<form id="aclSu" hidden><div><label>Company name</label><input id="suCompany" required></div>' +
      '<div class="acl-two"><div><label>First name</label><input id="suFirst" required></div><div><label>Last name</label><input id="suLast" required></div></div>' +
      '<div><label>Email</label><input id="suEmail" type="email" required placeholder="you@example.com"></div>' +
      '<div><label>Password</label><input id="suPass" type="password" required minlength="6"></div>' +
      '<div><label>Plan</label><select id="regPlan" onchange="acxPlanChanged()"><option value="' + cfg.app + '_standard" data-price="' + price + '">' + cfg.name + ' \u2014 ' + f(price) + ' / month</option></select></div>' +
      '<div><label>Billing</label><select id="regBilling" onchange="acxPlanChanged()"><option value="monthly">Monthly</option><option value="yearly">Full year (2 months free)</option></select></div>' +
      '<p class="acl-note" id="regPlanNote"></p><label class="acl-chk"><input type="checkbox" required>I agree to the Acacia Terms &amp; Privacy Policy.</label>' +
      '<button class="acl-go">Create Account</button><p class="acl-err" id="suError" hidden></p><p class="acl-note">Creates a new company account. Acacia support approves new accounts before you can sign in.</p></form></div>';
    document.body.appendChild(o);
    var hide = function (on) { document.documentElement.style.overflow = on ? 'hidden' : ''; };
    if (land) { o.style.display = 'none'; hide(true); var back = document.createElement('a'); back.textContent = '\u2190 Back to site'; back.href = '#'; back.style.cssText = 'display:block;padding:12px 20px 0;font-size:13px;color:inherit;opacity:.75'; o.firstChild.insertBefore(back, o.firstChild.children[1]); back.onclick = function (e) { e.preventDefault(); o.style.display = 'none'; land.style.display = 'block'; hide(true); };
      w.addEventListener('message', function (e) { var m = e.data && e.data.acx; if (!m) return; land.style.display = 'none'; o.style.display = 'grid'; tab(m !== 'register'); }); }
    function tab(s) { $('aclTi').className = s ? 'on' : ''; $('aclTu').className = s ? '' : 'on'; $('aclSi').hidden = !s; $('aclSu').hidden = s; }
    $('aclTi').onclick = function () { tab(true); }; $('aclTu').onclick = function () { tab(false); };
    if (w.acxPlanChanged) w.acxPlanChanged();
    $('aclSi').onsubmit = async function (e) {
      e.preventDefault(); $('siError').hidden = true;
      var company = $('siCompany').value.trim(), email = $('siEmail').value.trim().toLowerCase(), pass = $('siPass').value, u = null;
      if (!company || !email || !pass) return show($('siError'), 'Please enter your company name, email and password.');
      try { u = await AcaciaCloud.signIn(email, pass, company); }
      catch (err) { return show($('siError'), err.code === 'blocked' ? err.message : 'Could not reach Acacia. Check your internet connection and try again.'); }
      if (!u) return show($('siError'), 'That email and password combination was not found.');
      localStorage.setItem(KEY, JSON.stringify({ email: u.email, name: u.name, companyId: u.companyId, companyName: u.company })); location.reload();
    };
    $('aclSu').onsubmit = async function (e) {
      e.preventDefault(); $('suError').hidden = true;
      var company = $('suCompany').value.trim(), email = $('suEmail').value.trim().toLowerCase(), pass = $('suPass').value;
      if (!company || !email) return show($('suError'), 'Company name and email are required.');
      if (pass.length < 6) return show($('suError'), 'Password must be at least 6 characters.');
      var name = ($('suFirst').value + ' ' + $('suLast').value).trim() || email, r;
      try { r = await AcaciaCloud.register({ company: company, name: name, email: email, password: pass, plan: $('regPlan').value, billing: $('regBilling').value }); }
      catch (err) { return show($('suError'), err.code === 'exists' ? 'This company already has an account with that email - use Sign In instead.' : (err.code === 'offline' ? 'Could not reach Acacia. Check your internet connection and try again.' : (err.message || 'Could not create the account.'))); }
      if (r.blocked) return show($('suError'), 'Account created. ' + r.blocked);
      localStorage.setItem(KEY, JSON.stringify({ email: email, name: name, companyId: r.companyId, companyName: company })); location.reload();
    };
  }
  function landing() {
    var f = document.createElement('iframe'); f.id = 'aclLand'; f.src = cfg.landing; f.title = 'Acacia'; f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:90;background:#fff';
    document.body.appendChild(f); return f;
  }
  function init(c) {
    cfg = c; AcaciaCloud.init({ app: c.app, dataKey: function (x) { return 'acx_' + c.app + '_local_' + x; } });
    style(); var s = ses();
    if (!s) { build(); return; }
    var b = document.createElement('button'); b.id = 'aclOut'; b.type = 'button'; b.textContent = 'Sign out'; b.title = (s.name || s.email) + ' \u00b7 ' + (s.companyName || '');
    b.onclick = function () { try { AcaciaCloud.stop(); } catch (e) {} localStorage.removeItem(KEY); location.reload(); };
    document.body.appendChild(b);
    var m = document.querySelector('main'); if (m) m.classList.add('acxsb-pad');
  }
  w.AcaciaLogin = { init: init, session: ses, companyId: function () { var s = ses(); return s ? s.companyId : 'guest'; } };
})(window);
