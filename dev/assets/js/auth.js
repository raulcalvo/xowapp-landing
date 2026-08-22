// XowApp public website — web login module (window.XowAuth).
//
// Zero-Knowledge web login: authenticates against an EXISTING app account via a real
// Google Sign-In, never creates one from the web (see the createIfMissing flag on
// pocketbase/pb_hooks/google_auth.pb.js). Session lives only in sessionStorage (cleared
// when the tab closes) -- deliberately NOT the vendored public/admin/vendor/pocketbase.umd.js
// SDK, whose LocalAuthStore persists to localStorage, which is exactly what this avoids.
// Two plain fetch() calls are all the backend integration this needs.
//
// The ID token's decoded payload (name/email/picture) is used ONLY to paint the UI on this
// device -- it is never sent anywhere as-is (only the full raw idToken JWT goes to the
// backend, which verifies it against Google itself) and never written back to PocketBase.
(function () {
  var SESSION_KEY = 'xow_web_session';
  var GSI_SCRIPT_ID = 'xow-gsi-client';
  var GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
  var GSI_LOAD_TIMEOUT_MS = 10000;
  var EXP_SKEW_SECONDS = 30; // treat a session as expired 30s before its real exp

  function pocketbaseUrl() {
    return (window.XOW_CONFIG && window.XOW_CONFIG.pocketbaseUrl) || '';
  }

  function googleClientId() {
    return (window.XOW_CONFIG && window.XOW_CONFIG.googleClientId) || '';
  }

  // Decodes a JWT's payload segment for LOCAL DISPLAY ONLY -- this is not a signature
  // verification (the server already did that against Google for the Google ID token; the
  // PocketBase token's own signature is verified by PocketBase itself on every API call that
  // uses it). Never used to authorize anything client-side.
  function decodeJwtPayload(token) {
    try {
      var parts = String(token || '').split('.');
      if (parts.length < 2) return null;
      var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var binary = atob(b64);
      var percentEncoded = '';
      for (var i = 0; i < binary.length; i++) {
        var hex = binary.charCodeAt(i).toString(16);
        if (hex.length === 1) hex = '0' + hex;
        percentEncoded += '%' + hex;
      }
      return JSON.parse(decodeURIComponent(percentEncoded));
    } catch (err) {
      return null;
    }
  }

  function dispatchAuthChange() {
    document.dispatchEvent(new CustomEvent('xow:authchange'));
  }

  function saveSession(session) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (err) {
      // Storage unavailable (private mode, etc.) -- session just won't persist across a
      // reload within the same tab; not worth failing the whole login over.
    }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (err) {}
  }

  function getSession() {
    var raw;
    try {
      raw = sessionStorage.getItem(SESSION_KEY);
    } catch (err) {
      return null;
    }
    if (!raw) return null;
    var session;
    try {
      session = JSON.parse(raw);
    } catch (parseErr) {
      clearSession();
      return null;
    }
    if (!session || !session.token || !session.userId || !session.exp) {
      clearSession();
      return null;
    }
    if (Date.now() / 1000 >= session.exp - EXP_SKEW_SECONDS) {
      clearSession();
      return null;
    }
    return session;
  }

  function logout() {
    clearSession();
    try {
      if (window.google && google.accounts && google.accounts.id && typeof google.accounts.id.disableAutoSelect === 'function') {
        google.accounts.id.disableAutoSelect();
      }
    } catch (err) {}
    dispatchAuthChange();
  }

  // Loads https://accounts.google.com/gsi/client on demand (never on page load) -- the app's
  // account-creation-only policy plus Zero-Knowledge both point the same way: don't contact
  // Google at all until the visitor has actively chosen to sign in. Resolves immediately if
  // already loaded from a previous attempt on this page.
  function loadGoogleScript() {
    return new Promise(function (resolve, reject) {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        resolve();
        return;
      }

      var timeoutId = setTimeout(function () {
        reject(new Error('timeout'));
      }, GSI_LOAD_TIMEOUT_MS);

      function onReady() {
        clearTimeout(timeoutId);
        if (window.google && window.google.accounts && window.google.accounts.id) resolve();
        else reject(new Error('script loaded but Google Identity Services is unavailable'));
      }
      function onFail() {
        clearTimeout(timeoutId);
        reject(new Error('could not load Google Identity Services'));
      }

      var script = document.getElementById(GSI_SCRIPT_ID);
      if (script) {
        script.addEventListener('load', onReady, { once: true });
        script.addEventListener('error', onFail, { once: true });
        return;
      }

      script = document.createElement('script');
      script.id = GSI_SCRIPT_ID;
      script.src = GSI_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.addEventListener('load', onReady, { once: true });
      script.addEventListener('error', onFail, { once: true });
      document.head.appendChild(script);
    });
  }

  function handleCredentialResponse(response, callbacks) {
    callbacks = callbacks || {};
    var idToken = response && response.credential;
    if (!idToken) {
      if (callbacks.onError) callbacks.onError(new Error('missing_credential'));
      return;
    }

    // Client-only UI hints, never authoritative and never re-sent as-is.
    var payload = decodeJwtPayload(idToken);
    var googlePicture = (payload && payload.picture) || '';
    var displayName = (payload && payload.name) || '';
    var email = (payload && payload.email) || '';

    var base = pocketbaseUrl();
    fetch(base + '/api/xowapp/google-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: idToken, createIfMissing: false }),
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () { return {}; })
          .then(function (data) { return { status: res.status, data: data }; });
      })
      .then(function (result) {
        if (result.status === 200 && result.data && result.data.token) {
          var record = result.data.record || {};
          var pbPayload = decodeJwtPayload(result.data.token);
          var exp = (pbPayload && pbPayload.exp) || Math.floor(Date.now() / 1000) + 3600;

          // The PocketBase auth record already carries the app-uploaded avatar (if any) --
          // reading it here, once, from the login response avoids a second authenticated
          // fetch just to look up the same record again.
          var pbAvatarUrl = '';
          if (record.avatar) {
            var coll = record.collectionName || 'users';
            pbAvatarUrl = base + '/api/files/' + coll + '/' + record.id + '/' + record.avatar;
          }

          var session = {
            token: result.data.token,
            userId: record.id || '',
            avatarUrl: googlePicture,
            pbAvatarUrl: pbAvatarUrl,
            displayName: displayName,
            email: email,
            exp: exp,
          };
          saveSession(session);
          dispatchAuthChange();
          if (callbacks.onSuccess) callbacks.onSuccess(session);
        } else if (result.status === 404) {
          if (callbacks.onNoAccount) callbacks.onNoAccount();
          else if (callbacks.onError) callbacks.onError(new Error('no_account'));
        } else {
          if (callbacks.onError) callbacks.onError(new Error((result.data && result.data.error) || 'http_' + result.status));
        }
      })
      .catch(function (err) {
        if (callbacks.onError) callbacks.onError(err);
      });
  }

  // Loads GIS if needed, then renders the OFFICIAL Google button into `container`. Deliberately
  // never uses One Tap / google.accounts.id.prompt() -- only the explicit button, per the
  // feature plan. `container` is cleared via textContent first (never innerHTML with anything
  // outside our own control), then handed to Google's own renderButton().
  function startSignIn(container, callbacks) {
    callbacks = callbacks || {};
    loadGoogleScript()
      .then(function () {
        var clientId = googleClientId();
        if (!clientId) {
          throw new Error('missing_client_id');
        }
        google.accounts.id.initialize({
          client_id: clientId,
          callback: function (response) { handleCredentialResponse(response, callbacks); },
          auto_select: false,
          itp_support: true,
        });
        container.textContent = '';
        google.accounts.id.renderButton(container, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
          logo_alignment: 'left',
        });
        if (callbacks.onRendered) callbacks.onRendered();
      })
      .catch(function (err) {
        if (callbacks.onError) callbacks.onError(err);
      });
  }

  // POST /api/xowapp/delete-account. Deliberately does NOT call logout() itself on a 401
  // (expired/invalid session server-side): dispatchAuthChange() is synchronous, and
  // profile.js's own 'xow:authchange' listener redirects to the home page the instant it
  // fires -- if that ran here, it would fire *before* the caller's own .then() gets a chance
  // to show any message, turning a 401 into a silent redirect with no feedback shown. The
  // caller (profile.js) is responsible for logging out once it has had a chance to react.
  function deleteAccount() {
    var session = getSession();
    if (!session) {
      return Promise.reject(new Error('not_signed_in'));
    }
    var base = pocketbaseUrl();
    return fetch(base + '/api/xowapp/delete-account', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': session.token,
      },
      body: JSON.stringify({}),
    }).then(function (res) {
      return res
        .json()
        .catch(function () { return {}; })
        .then(function (data) { return { status: res.status, data: data }; });
    });
  }

  // Deterministic hue from the userId (a stable string) -- not a security-sensitive
  // computation, just a cheap, repeatable way to give the same account the same fallback
  // avatar color across devices/sessions without ever storing a color anywhere.
  function colorForUserId(id) {
    var str = String(id || '');
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    var hue = Math.abs(hash) % 360;
    return 'hsl(' + hue + ', 60%, 45%)';
  }

  // Avatar cascade: Google ID token picture -> PocketBase-stored avatar (already resolved at
  // login time, see handleCredentialResponse) -> initials over a deterministic color.
  function getAvatarInfo(session) {
    if (!session) return null;
    var url = session.avatarUrl || session.pbAvatarUrl || '';
    if (url) return { type: 'image', url: url };
    var source = session.email || session.displayName || session.userId || '?';
    var initial = source.trim().charAt(0).toUpperCase() || '?';
    return { type: 'initials', initials: initial, color: colorForUserId(session.userId || '') };
  }

  window.XowAuth = {
    getSession: getSession,
    logout: logout,
    startSignIn: startSignIn,
    deleteAccount: deleteAccount,
    getAvatarInfo: getAvatarInfo,
  };
})();
