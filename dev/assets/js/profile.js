// XowApp public website — perfil.html logic (profile view + "danger zone" account deletion).
(function () {
  var session = null;

  // Clickjacking guard. The page's CSP declares `frame-ancestors 'none'`, but that directive
  // is IGNORED when the policy is delivered in a <meta http-equiv> tag (it is header-only per
  // spec), and GitHub Pages cannot set response headers -- so nothing actually stops this page
  // from being framed. It hosts an irreversible account-deletion flow, so bust out of any
  // frame before rendering anything.
  try {
    if (window.top !== window.self) {
      window.top.location = window.self.location;
      return;
    }
  } catch (err) {
    // Cross-origin access to window.top threw, which itself means we are framed by a
    // different origin. Blank the document rather than render a framable delete flow.
    document.documentElement.textContent = '';
    return;
  }

  function translate(key) {
    if (!window.XowI18n) return key;
    return window.XowI18n.translate(window.XowI18n.getBrowserLanguage(), key) || key;
  }

  // Small, deliberate duplication of user-menu.js's avatar-node builder: these are two
  // independent page scripts (not a shared module system here), and the logic is short
  // enough that a shared helper isn't worth the extra file/load-order coupling.
  function buildAvatarNode(sessionObj, sizeClass) {
    var info = window.XowAuth.getAvatarInfo(sessionObj);
    if (info && info.type === 'image') {
      var img = document.createElement('img');
      img.className = 'xow-avatar-img ' + sizeClass;
      img.src = info.url;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', function onErr() {
        img.removeEventListener('error', onErr);
        var fallback = buildInitialsNode(sessionObj, sizeClass);
        if (img.parentNode) img.parentNode.replaceChild(fallback, img);
      });
      return img;
    }
    return buildInitialsNode(sessionObj, sizeClass);
  }

  function buildInitialsNode(sessionObj, sizeClass) {
    var info = window.XowAuth.getAvatarInfo(sessionObj);
    var el = document.createElement('div');
    el.className = 'xow-avatar-initials ' + sizeClass;
    if (info) {
      el.style.background = info.color;
      el.textContent = info.initials;
    }
    return el;
  }

  function renderProfile() {
    var card = document.getElementById('profileCard');
    var avatarWrap = document.getElementById('profileAvatarWrap');
    var nameValue = document.getElementById('profileNameValue');
    var emailValue = document.getElementById('profileEmailValue');
    var userIdValue = document.getElementById('profileUserIdValue');

    if (avatarWrap) avatarWrap.appendChild(buildAvatarNode(session, 'avatar-lg'));
    // All three of these come straight from the Google ID token / the session object --
    // textContent only, never innerHTML, even though the values are already sanitized by
    // JSON.parse upstream.
    if (nameValue) nameValue.textContent = session.displayName || '—';
    if (emailValue) emailValue.textContent = session.email || '—';
    if (userIdValue) userIdValue.textContent = session.userId || '—';

    if (card) card.hidden = false;
  }

  function expectedConfirmValue() {
    var email = session.email || '';
    var at = email.indexOf('@');
    if (at <= 0) return null; // no usable local-part -- confirmation can never match, stays disabled
    return email.substring(0, at).toLowerCase();
  }

  function wireDeleteModal() {
    var deleteBtn = document.getElementById('profileDeleteBtn');
    var overlay = document.getElementById('deleteModalOverlay');
    var input = document.getElementById('deleteConfirmInput');
    var confirmBtn = document.getElementById('deleteModalConfirmBtn');
    var cancelBtn = document.getElementById('deleteModalCancelBtn');
    var errorEl = document.getElementById('deleteModalError');

    function closeModal() {
      overlay.hidden = true;
      input.value = '';
      confirmBtn.disabled = true;
      errorEl.textContent = '';
    }

    function openModal() {
      input.value = '';
      confirmBtn.disabled = true;
      errorEl.textContent = '';
      overlay.hidden = false;
      input.focus();
    }

    deleteBtn.addEventListener('click', openModal);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) closeModal();
    });

    input.addEventListener('input', function () {
      var expected = expectedConfirmValue();
      var typed = input.value.trim().toLowerCase();
      confirmBtn.disabled = !(expected && typed === expected);
    });

    confirmBtn.addEventListener('click', function () {
      var expected = expectedConfirmValue();
      var typed = input.value.trim().toLowerCase();
      if (!expected || typed !== expected) return; // defensive -- button should already be disabled

      confirmBtn.disabled = true;
      errorEl.textContent = '';

      window.XowAuth.deleteAccount()
        .then(function (result) {
          if (result.status === 200 && result.data && result.data.deleted) {
            window.XowAuth.logout();
            window.location.href = 'index.html';
            return;
          }
          if (result.status === 401) {
            // The session was already invalid server-side -- show why before leaving instead
            // of a bare redirect (see the comment on deleteAccount() in auth.js). No data was
            // deleted in this case (the request never reached the purge, requireAuth rejected
            // it), so there is nothing to warn about beyond the expired session itself.
            errorEl.textContent = translate('profile_delete_error_session_expired');
            setTimeout(function () {
              window.XowAuth.logout();
              window.location.href = 'index.html';
            }, 1500);
            return;
          }
          errorEl.textContent = (result.data && result.data.error) || translate('profile_delete_error_generic');
          confirmBtn.disabled = false;
        })
        .catch(function () {
          errorEl.textContent = translate('profile_delete_error_generic');
          confirmBtn.disabled = false;
        });
    });
  }

  function init() {
    session = window.XowAuth && window.XowAuth.getSession();
    if (!session) {
      window.location.href = 'index.html';
      return;
    }

    renderProfile();
    wireDeleteModal();

    document.addEventListener('xow:authchange', function () {
      if (!window.XowAuth.getSession()) {
        window.location.href = 'index.html';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
