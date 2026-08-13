// public/admin/admin.js — login-only admin panel (management sections come later).
//
// Uses the vendored PocketBase JS SDK (vendor/pocketbase.umd.js, MIT, loaded locally — never
// from a CDN) against the `web_admins` auth collection. The SDK's default authStore
// (`LocalAuthStore`) persists the session token to localStorage; per this phase's security
// requirements the admin session must NOT survive closing the tab, so a small custom
// in-memory store is passed to the `PocketBase` constructor instead. It mirrors the SDK's own
// `BaseAuthStore` (token/record kept purely as instance fields, no storage backend) since that
// class itself isn't exposed as a UMD global — only the default `PocketBase` export is.
(function () {
  // Clickjacking mitigation: the CSP `frame-ancestors 'none'` set via <meta> in admin/index.html
  // is silently ignored by browsers outside of an HTTP response header, which static hosting
  // (GitHub Pages) cannot set for this project today. This is the only mitigation reachable from
  // the page itself: bail out immediately if the admin login is ever loaded inside a frame.
  if (window.top !== window.self) {
    document.documentElement.innerHTML = '';
    window.top.location = window.self.location;
    return;
  }

  function InMemoryAuthStore() {
    this._token = '';
    this._record = null;
    this._callbacks = [];
  }
  InMemoryAuthStore.prototype = {
    get token() { return this._token; },
    get record() { return this._record; },
    get model() { return this._record; },
    get isValid() { return !!this._token; },
    get isSuperuser() { return false; },
    save: function (token, record) {
      this._token = token || '';
      this._record = record || null;
      this._trigger();
    },
    clear: function () {
      this._token = '';
      this._record = null;
      this._trigger();
    },
    onChange: function (callback, fireImmediately) {
      var self = this;
      this._callbacks.push(callback);
      if (fireImmediately) callback(this._token, this._record);
      return function unsubscribe() {
        var idx = self._callbacks.indexOf(callback);
        if (idx !== -1) self._callbacks.splice(idx, 1);
      };
    },
    _trigger: function () {
      var self = this;
      this._callbacks.forEach(function (cb) { cb(self._token, self._record); });
    },
  };

  var cfg = window.XOW_CONFIG || {};
  var pb = new PocketBase(cfg.pocketbaseUrl, new InMemoryAuthStore());

  var loginCard = document.getElementById('adminLoginCard');
  var dashboardCard = document.getElementById('adminDashboardCard');
  var form = document.getElementById('adminLoginForm');
  var emailInput = document.getElementById('adminEmail');
  var passwordInput = document.getElementById('adminPassword');
  var errorEl = document.getElementById('adminLoginError');
  var welcomeNameEl = document.getElementById('adminWelcomeName');
  var logoutBtn = document.getElementById('adminLogoutBtn');
  var submitBtn = document.getElementById('admin_submit');

  function t(key) {
    if (!window.XowI18n) return key;
    return window.XowI18n.translate(window.XowI18n.getBrowserLanguage(), key);
  }

  function showDashboard() {
    loginCard.hidden = true;
    dashboardCard.hidden = false;
    var record = pb.authStore.record;
    var name = (record && (record.display_name || record.email)) || '';
    welcomeNameEl.textContent = name;
  }

  function showLogin() {
    dashboardCard.hidden = true;
    loginCard.hidden = false;
    form.reset();
    errorEl.textContent = '';
  }

  function setBusy(busy) {
    submitBtn.disabled = busy;
    emailInput.disabled = busy;
    passwordInput.disabled = busy;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorEl.textContent = '';
    setBusy(true);

    pb.collection(cfg.adminCollection).authWithPassword(emailInput.value.trim(), passwordInput.value)
      .then(function () {
        showDashboard();
      })
      .catch(function (err) {
        // Generic message regardless of cause — never reveal whether the email exists.
        var status = err && err.status;
        errorEl.textContent = (status === 400 || status === 401 || status === 403)
          ? t('admin_error_invalid')
          : t('admin_error_generic');
      })
      .finally(function () {
        setBusy(false);
      });
  });

  logoutBtn.addEventListener('click', function () {
    pb.authStore.clear();
    showLogin();
  });

  if (pb.authStore.isValid) {
    showDashboard();
  } else {
    showLogin();
  }
})();
