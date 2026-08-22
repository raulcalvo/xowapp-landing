// XowApp public website — account avatar + dropdown in the header.
// Mounts into #xowNavPickers via appendChild, same pattern donate-fab.js already uses (see
// its own comment on that mount point) -- loaded AFTER donate-fab.js in every page so it ends
// up to the right of it. Requires auth.js (window.XowAuth) to already be loaded.
(function () {
  var menuEl = null;
  var toggleEl = null;
  var toggleAvatarSlot = null;
  var dropdownEl = null;
  var isOpen = false;

  function applyTranslations() {
    if (window.XowI18n) {
      window.XowI18n.applyTranslations(window.XowI18n.getBrowserLanguage());
    }
  }

  function translate(key) {
    if (!window.XowI18n) return key;
    return window.XowI18n.translate(window.XowI18n.getBrowserLanguage(), key) || key;
  }

  // Builds a DOM node for the user's avatar (image or initials-on-color) -- never innerHTML
  // with the image URL or any Google-sourced text, always real DOM nodes / textContent / the
  // `src` property.
  function buildAvatarNode(session, extraClass) {
    var info = window.XowAuth.getAvatarInfo(session);
    if (info && info.type === 'image') {
      var img = document.createElement('img');
      img.className = 'xow-avatar-img' + (extraClass ? ' ' + extraClass : '');
      img.src = info.url;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', function onErr() {
        img.removeEventListener('error', onErr);
        var fallback = buildInitialsNode(session, extraClass);
        if (img.parentNode) img.parentNode.replaceChild(fallback, img);
      });
      return img;
    }
    return buildInitialsNode(session, extraClass);
  }

  function buildInitialsNode(session, extraClass) {
    var info = window.XowAuth.getAvatarInfo(session);
    var el = document.createElement('div');
    el.className = 'xow-avatar-initials' + (extraClass ? ' ' + extraClass : '');
    if (info) {
      el.style.background = info.color;
      el.textContent = info.initials;
    }
    return el;
  }

  function renderToggle() {
    if (!toggleAvatarSlot) return;
    toggleAvatarSlot.textContent = '';
    var session = window.XowAuth.getSession();
    if (session) {
      toggleAvatarSlot.appendChild(buildAvatarNode(session, 'avatar-sm'));
      toggleEl.setAttribute('aria-label', translate('auth_avatar_aria'));
      toggleEl.title = translate('auth_avatar_aria');
    } else {
      var holder = document.createElement('span');
      holder.className = 'xow-avatar-guest-icon';
      holder.innerHTML = '<svg class="icon"><use href="#i-account_circle"></use></svg>';
      toggleAvatarSlot.appendChild(holder);
      toggleEl.setAttribute('aria-label', translate('auth_avatar_aria'));
      toggleEl.title = translate('auth_avatar_aria');
    }
  }

  function showAuthError(container, key) {
    var el = container.querySelector('.xow-user-auth-error');
    if (!el) return;
    el.textContent = translate(key);
    el.hidden = false;
  }

  function classifyStartSignInError(err) {
    var message = (err && err.message) || String(err || '');
    if (message === 'missing_client_id') return 'auth_error_google_load';
    if (message === 'timeout') return 'auth_error_google_load';
    if (message.indexOf('load') !== -1 || message.indexOf('unavailable') !== -1) return 'auth_error_google_load';
    return 'auth_error_network';
  }

  function renderGuestDropdown() {
    dropdownEl.innerHTML =
      '<div class="xow-user-dropdown-guest">' +
        '<p class="xow-user-login-heading" id="auth_login_button"></p>' +
        '<div class="xow-gsi-slot" id="xowGsiSlot"></div>' +
        '<p class="xow-user-signup-notice" id="auth_login_signup_notice"></p>' +
        '<p class="xow-user-auth-error" hidden></p>' +
      '</div>';
    applyTranslations();

    var slot = dropdownEl.querySelector('#xowGsiSlot');
    window.XowAuth.startSignIn(slot, {
      onError: function (err) {
        showAuthError(dropdownEl, classifyStartSignInError(err));
      },
      onNoAccount: function () {
        showAuthError(dropdownEl, 'auth_error_no_account');
      },
      onSuccess: function () {
        closeDropdown();
        renderToggle();
      },
    });
  }

  function renderAccountDropdown(session) {
    dropdownEl.innerHTML =
      '<div class="xow-user-dropdown-header">' +
        '<div class="xow-user-dropdown-avatar"></div>' +
        '<span class="xow-user-dropdown-email"></span>' +
      '</div>' +
      '<a class="xow-user-dropdown-link" href="perfil.html">' +
        '<svg class="icon"><use href="#i-account_circle"></use></svg>' +
        '<span id="auth_menu_profile"></span>' +
      '</a>' +
      '<button class="xow-user-dropdown-link xow-user-dropdown-logout" type="button" id="xowLogoutBtn">' +
        '<svg class="icon"><use href="#i-logout"></use></svg>' +
        '<span id="auth_menu_logout"></span>' +
      '</button>';

    var avatarSlot = dropdownEl.querySelector('.xow-user-dropdown-avatar');
    if (avatarSlot) avatarSlot.appendChild(buildAvatarNode(session, 'avatar-md'));

    var emailEl = dropdownEl.querySelector('.xow-user-dropdown-email');
    if (emailEl) emailEl.textContent = session.email || ''; // textContent only -- Google-sourced

    applyTranslations();

    var logoutBtn = dropdownEl.querySelector('#xowLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        window.XowAuth.logout();
        closeDropdown();
        renderToggle();
      });
    }
  }

  function renderDropdownContent() {
    var session = window.XowAuth.getSession();
    if (session) {
      renderAccountDropdown(session);
    } else {
      renderGuestDropdown();
    }
  }

  function openDropdown() {
    if (isOpen) return;
    isOpen = true;
    renderDropdownContent();
    dropdownEl.hidden = false;
    toggleEl.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onDocumentClick, true);
    document.addEventListener('keydown', onDocumentKeydown, true);
  }

  function closeDropdown() {
    if (!isOpen) return;
    isOpen = false;
    dropdownEl.hidden = true;
    dropdownEl.textContent = '';
    toggleEl.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocumentClick, true);
    document.removeEventListener('keydown', onDocumentKeydown, true);
  }

  function onDocumentClick(e) {
    if (menuEl && !menuEl.contains(e.target)) {
      closeDropdown();
    }
  }

  function onDocumentKeydown(e) {
    if (e.key === 'Escape') {
      closeDropdown();
      toggleEl.focus();
    }
  }

  function buildMarkup() {
    menuEl = document.createElement('div');
    menuEl.className = 'xow-user-menu';
    menuEl.id = 'xowUserMenu';

    toggleEl = document.createElement('button');
    toggleEl.type = 'button';
    toggleEl.className = 'xow-user-avatar-btn';
    toggleEl.id = 'xowUserMenuToggle';
    toggleEl.setAttribute('aria-haspopup', 'true');
    toggleEl.setAttribute('aria-expanded', 'false');

    toggleAvatarSlot = document.createElement('span');
    toggleAvatarSlot.className = 'xow-user-avatar-slot';
    toggleEl.appendChild(toggleAvatarSlot);

    dropdownEl = document.createElement('div');
    dropdownEl.className = 'xow-user-dropdown';
    dropdownEl.id = 'xowUserDropdown';
    dropdownEl.hidden = true;

    toggleEl.addEventListener('click', function () {
      if (isOpen) closeDropdown();
      else openDropdown();
    });

    menuEl.appendChild(toggleEl);
    menuEl.appendChild(dropdownEl);
  }

  function inject() {
    if (document.getElementById('xowUserMenu')) return;

    buildMarkup();

    var mountPoint = document.getElementById('xowNavPickers') || document.body;
    mountPoint.appendChild(menuEl);

    renderToggle();
    applyTranslations();

    document.addEventListener('xow:authchange', function () {
      closeDropdown();
      renderToggle();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
