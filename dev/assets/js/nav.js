// XowApp public website — shared header nav + footer, injected into every top-level page.
// Expects a `<div id="xow-nav-root"></div>` and a `<div id="xow-footer-root"></div>` in the
// page body, and `<body data-page="...">` so the current page's nav link can be highlighted.
// No inline handlers (CSP script-src has no 'unsafe-inline'): everything is wired below with
// addEventListener after the markup is injected via innerHTML (which never executes
// embedded <script> tags, so this is compliant, not just "workaround-compliant").
(function () {
  var NAV_LINKS = [
    { page: 'index', href: 'index.html', key: 'nav_home' },
    { page: 'about', href: 'about.html', key: 'nav_about' },
    { page: 'historia', href: 'historia.html', key: 'nav_story' },
    { page: 'vision', href: 'vision.html', key: 'nav_vision' },
    { page: 'transparencia', href: 'transparencia.html', key: 'nav_transparency' },
    { page: 'donar', href: 'donar.html', key: 'nav_donate', cta: true },
  ];

  var LANG_LABELS = {
    en: 'English', es: 'Español', ca: 'Català', fr: 'Français',
    it: 'Italiano', de: 'Deutsch', ro: 'Română', pt: 'Português',
  };

  function headerMarkup(currentPage) {
    var links = NAV_LINKS.map(function (link) {
      var classes = ['xow-nav-link'];
      if (link.cta) classes.push('xow-nav-cta');
      if (link.page === currentPage) classes.push('is-active');
      return '<a class="' + classes.join(' ') + '" href="' + link.href + '" id="' + link.key + '"></a>';
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
          '<a class="xow-nav-link xow-nav-admin" href="admin/index.html" id="nav_admin" target="_blank" rel="noopener noreferrer">' +
            '<svg class="icon"><use href="#i-open_in_new"></use></svg><span data-i18n-key="nav_admin"></span>' +
          '</a>' +
        '</nav>' +
        '<div class="xow-header-controls">' +
          '<div class="xow-nav-pickers">' +
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
    return (
      '<div class="xow-footer-inner">' +
        '<p class="xow-footer-tagline" id="footer_tagline"></p>' +
        '<div class="xow-footer-links">' +
          '<a href="privacy.html" id="footer_privacy"></a>' +
          '<a href="safety.html" id="footer_safety"></a>' +
          '<a href="admin/index.html" data-i18n-key="nav_admin" target="_blank" rel="noopener noreferrer"></a>' +
        '</div>' +
        '<p class="xow-footer-rights">&copy; 2026 XowApp. <span id="footer_rights"></span></p>' +
      '</div>'
    );
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
