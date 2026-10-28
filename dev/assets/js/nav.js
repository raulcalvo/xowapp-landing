// XowApp public website — shared header nav + footer, injected into every top-level page.
// Expects a `<div id="xow-nav-root"></div>` and a `<div id="xow-footer-root"></div>` in the
// page body, and `<body data-page="...">` so the current page's nav link can be highlighted.
// No inline handlers (CSP script-src has no 'unsafe-inline'): everything is wired below with
// addEventListener after the markup is injected via innerHTML (which never executes
// embedded <script> tags, so this is compliant, not just "workaround-compliant").
(function () {
  // Four sections plus the download CTA. "What we believe", "Project status" and "Donate"
  // live in the footer (FOOTER_LINKS): the header is for people deciding whether to use the
  // app, and asking for money before showing the product put them off.
  var NAV_LINKS = [
    { page: 'index', href: 'index.html', key: 'nav_home', icon: 'home' },
    { page: 'como-funciona', href: 'como-funciona.html', key: 'nav_how', icon: 'schema' },
    { page: 'historia', href: 'historia.html', key: 'nav_story', icon: 'menu_book' },
    { page: 'about', href: 'about.html', key: 'nav_about', icon: 'person' },
    { page: 'download', href: 'index.html#descargar', key: 'nav_download', cta: true },
  ];

  var FOOTER_LINKS = [
    { href: 'vision.html', key: 'nav_vision' },
    { href: 'transparencia.html', key: 'nav_transparency' },
    { href: 'donar.html', key: 'nav_donate', donate: true },
    { href: 'privacy.html', key: 'footer_privacy' },
    { href: 'safety.html', key: 'footer_safety' },
  ];

  var LANG_LABELS = {
    en: 'English', es: 'Español', ca: 'Català', fr: 'Français',
    it: 'Italiano', de: 'Deutsch', ro: 'Română', pt: 'Português',
    pl: 'Polski', zh: '中文', ja: '日本語', da: 'Dansk', ar: 'العربية',
  };

  // Short closed-box form for the language picker once the section nav no longer fits on the
  // header row (see NAV_COMPACT_QUERY below) -- "CAT" for Catalan to stay unambiguous next to
  // "CA" (which reads as Canada in every other language-picker convention), everything else a
  // plain ISO 639-1 code.
  var LANG_CODES = {
    en: 'EN', es: 'ES', ca: 'CAT', fr: 'FR',
    it: 'IT', de: 'DE', ro: 'RO', pt: 'PT',
    pl: 'PL', zh: 'ZH', ja: 'JA', da: 'DA', ar: 'AR',
  };

  var NAV_COMPACT_QUERY = '(max-width: 1180px)';

  // Session-only flag set by app-entry.js (?ref=app -- the entry point linked from the mobile
  // app). When set, every donate/support prompt on the site (the footer's
  // "Donar" link, the header FAB in donate-fab.js, and any [data-donate-cta] element on
  // the current page) stays hidden for the rest of this browser tab's session, so a page
  // opened from an in-app link never surfaces an alternative-payment call to action --
  // App Store/Play Store review guidelines restrict exactly that.
  function isDonateHidden() {
    try { return sessionStorage.getItem('xow_hide_donate') === '1'; } catch (e) { return false; }
  }

  function headerMarkup(currentPage) {
    var visibleNavLinks = NAV_LINKS;
    var links = visibleNavLinks.map(function (link) {
      var classes = ['xow-nav-link'];
      if (link.cta) classes.push('xow-nav-cta');
      if (link.page === currentPage) classes.push('is-active');
      var iconHtml = (link.icon && !link.cta)
        ? '<span class="xow-nav-icon"><svg class="icon"><use href="#i-' + link.icon + '"></use></svg></span>'
        : '';
      return (
        '<a class="' + classes.join(' ') + '" href="' + link.href + '" data-i18n-key="' + link.key + '" data-i18n-attr="title,aria-label" data-i18n-text="false">' +
          iconHtml +
          '<span class="xow-nav-text" id="' + link.key + '"></span>' +
        '</a>'
      );
    }).join('');

    var langOptions = window.XowI18n.SUPPORTED_LANGS.map(function (code) {
      return '<option value="' + code + '">' + LANG_LABELS[code] + '</option>';
    }).join('');

    // Single row inside the sticky `.xow-header`: brand (left), the section menu (middle,
    // collapses into a hamburger dropdown once it doesn't fit), and the theme/language
    // pickers (right, always visible). One row instead of two stacked ones means the fixed
    // header only ever needs to be as tall as its shortest content -- the pickers -- instead
    // of a brand row plus a separate menu row, which is what left a large empty gap above the
    // page content, especially on mobile.
    return (
      '<div class="xow-header-bar">' +
        '<a class="xow-brand" href="index.html">' +
          '<img class="xow-brand-logo" src="logo.png" alt="XowApp" width="32" height="32">' +
          '<span>XowApp</span>' +
        '</a>' +
        '<nav class="xow-nav" id="xowNav">' +
          links +
        '</nav>' +
        '<div class="xow-header-controls">' +
          '<div class="xow-nav-pickers" id="xowNavPickers">' +
            '<div class="picker-container">' +
              '<svg class="icon"><use href="#i-dark_mode"></use></svg>' +
              '<select class="picker-select" id="themeSelect">' +
                '<option value="system" data-i18n-key="theme_system"></option>' +
                '<option value="dark" data-i18n-key="theme_dark"></option>' +
                '<option value="light" data-i18n-key="theme_light"></option>' +
              '</select>' +
            '</div>' +
            '<div class="picker-container">' +
              '<svg class="icon"><use href="#i-language"></use></svg>' +
              '<select class="picker-select" id="langSelect">' + langOptions + '</select>' +
            '</div>' +
          '</div>' +
          '<button class="xow-hamburger" id="xowNavToggle" type="button" aria-label="Menu" aria-expanded="false">' +
            '<svg class="icon"><use href="#i-menu"></use></svg>' +
          '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function footerMarkup() {
    var links = FOOTER_LINKS.filter(function (l) { return !(l.donate && isDonateHidden()); }).map(function (l) {
      return '<a href="' + l.href + '" data-i18n-key="' + l.key + '"></a>';
    }).join('');
    return (
      '<div class="xow-footer-inner">' +
        '<div class="xow-footer-brand">' +
          '<p class="xow-footer-tagline" id="footer_tagline"></p>' +
          '<p class="xow-footer-made" id="footer_made"></p>' +
        '</div>' +
        '<nav class="xow-footer-links">' + links + '</nav>' +
        '<p class="xow-footer-rights">&copy; 2026 XowApp. <span id="footer_rights"></span></p>' +
      '</div>'
    );
  }

  // Pages that end with a "coming soon to your phone" band before the footer, so no page is a
  // dead end. The home page has its own download section; the donation and profile pages
  // have a different job.
  var PREFOOTER_SKIP = ['index', 'donar', 'perfil'];

  function storeBadge(iconPath, store) {
    return (
      '<span class="xow-store" aria-disabled="true">' +
        '<svg class="xow-store-icon" viewBox="0 0 24 24" aria-hidden="true">' + iconPath + '</svg>' +
        '<span class="xow-store-text"><small data-i18n-key="store_soon"></small><b>' + store + '</b></span>' +
      '</span>'
    );
  }

  function prefooterMarkup() {
    return (
      '<h2 class="xow-h2" data-i18n-key="home_dl_title"></h2>' +
      '<p data-i18n-key="home_dl_body"></p>' +
      '<div class="xow-stores xow-stores-center">' +
        storeBadge('<path d="M5 3.5v17l14-8.5z"/>', 'Google Play') +
        storeBadge('<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>', 'App Store') +
      '</div>'
    );
  }

  // Swaps the language picker's option labels between full names and LANG_CODES depending on
  // whether the header is currently in its compact (section nav collapsed to hamburger) state.
  // Real textContent, not a CSS truncation trick -- see the NAV_COMPACT_QUERY comment above.
  function syncCompactPickers(langSelect, compact) {
    if (!langSelect) return;
    Array.prototype.forEach.call(langSelect.options, function (opt) {
      opt.textContent = compact ? (LANG_CODES[opt.value] || opt.value) : (LANG_LABELS[opt.value] || opt.value);
    });
  }

  function wireHeader(header) {
    var toggle = header.querySelector('#xowNavToggle');
    var nav = header.querySelector('#xowNav');
    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        var isOpen = nav.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      });
    }

    var themeSelect = header.querySelector('#themeSelect');
    if (themeSelect) {
      themeSelect.addEventListener('change', function (e) {
        window.XowI18n.changeTheme(e.target.value);
      });
    }

    var langSelect = header.querySelector('#langSelect');
    if (langSelect) {
      langSelect.addEventListener('change', function (e) {
        window.XowI18n.changeLanguage(e.target.value);
      });
    }

    if (window.matchMedia) {
      var mql = window.matchMedia(NAV_COMPACT_QUERY);
      syncCompactPickers(langSelect, mql.matches);
      var onChange = function (e) { syncCompactPickers(langSelect, e.matches); };
      if (mql.addEventListener) mql.addEventListener('change', onChange);
      else if (mql.addListener) mql.addListener(onChange); // Safari <14 fallback
    }
  }

  function inject() {
    var navRoot = document.getElementById('xow-nav-root');
    var footerRoot = document.getElementById('xow-footer-root');
    var currentPage = document.body.getAttribute('data-page') || '';

    if (navRoot) {
      var header = document.createElement('header');
      header.className = 'xow-header';
      header.innerHTML = headerMarkup(currentPage);
      navRoot.replaceWith(header);
      wireHeader(header);
    }

    if (footerRoot && PREFOOTER_SKIP.indexOf(currentPage) === -1) {
      var band = document.createElement('section');
      band.className = 'xow-prefooter';
      band.id = 'descargar';
      band.innerHTML = prefooterMarkup();
      footerRoot.parentNode.insertBefore(band, footerRoot);
    }

    if (footerRoot) {
      var footer = document.createElement('footer');
      footer.className = 'xow-footer';
      footer.innerHTML = footerMarkup();
      footerRoot.replaceWith(footer);
    }

    // Re-run translations now that the nav/footer markup (with its own ids/data-i18n-key
    // attributes) exists in the DOM — i18n.js may have already run once before this.
    if (window.XowI18n) {
      window.XowI18n.applyTranslations(window.XowI18n.getBrowserLanguage());
    }

    // Content-level donate CTAs elsewhere on the page (about.html's funding blurb,
    // transparencia.html's closing CTA) -- the nav's own "Donar" link is already filtered
    // out of headerMarkup() above; this catches the rest, wherever a page marks one.
    if (isDonateHidden()) {
      var ctas = document.querySelectorAll('[data-donate-cta]');
      for (var i = 0; i < ctas.length; i++) ctas[i].hidden = true;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
