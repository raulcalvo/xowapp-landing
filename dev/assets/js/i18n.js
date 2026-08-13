// XowApp public website — shared i18n engine.
//
// Same mechanism the original public/index.html used (a translations object keyed by
// language, text injected into the DOM by element `id`), generalized so every page can
// reuse it instead of carrying its own inline `translations` object:
//   - `document.getElementById(key)` — if an element's id matches a dictionary key, its
//     textContent is set to the translated string (same pattern index.html already used).
//   - `[data-i18n-key="key"]` — any element (including <title>) can opt in explicitly,
//     which lets the same key drive text in more than one place, or drive elements whose
//     id can't double as the dictionary key.
//   - `[data-i18n-attr]` — optional attribute list (e.g. `data-i18n-attr="aria-label"`) so
//     a single element can get both its text and an attribute translated from the same key.
// Falls back to English when a key is missing for the active language.
(function () {
  var STORAGE_LANG = 'xowapp_landing_lang';
  var STORAGE_THEME = 'xowapp_landing_theme';
  var SUPPORTED_LANGS = ['en', 'es', 'ca', 'fr', 'it', 'de', 'ro', 'pt'];

  function dict() {
    return window.XOW_I18N || {};
  }

  function translate(lang, key) {
    var table = dict();
    var entry = (table[lang] && table[lang][key] != null) ? table[lang][key] : null;
    if (entry == null) entry = (table.en && table.en[key] != null) ? table.en[key] : null;
    return entry;
  }

  function getBrowserLanguage() {
    var saved = localStorage.getItem(STORAGE_LANG);
    if (saved && SUPPORTED_LANGS.indexOf(saved) !== -1) return saved;
    var navLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
    for (var i = 0; i < SUPPORTED_LANGS.length; i++) {
      if (navLang.indexOf(SUPPORTED_LANGS[i]) === 0) return SUPPORTED_LANGS[i];
    }
    return 'en';
  }

  function applyTranslations(lang) {
    var table = dict();
    var langTable = table[lang] || table.en || {};
    Object.keys(langTable).forEach(function (key) {
      var el = document.getElementById(key);
      if (el) el.textContent = translate(lang, key);
    });

    document.querySelectorAll('[data-i18n-key]').forEach(function (el) {
      // Elements that only want an attribute translated (e.g. the donate FAB, whose
      // visible content is an emoji, not text) opt out of the textContent overwrite below
      // with data-i18n-text="false" — otherwise this would wipe out their child markup.
      if (el.getAttribute('data-i18n-text') === 'false') return;
      var key = el.getAttribute('data-i18n-key');
      var value = translate(lang, key);
      if (value == null) return;
      el.textContent = value;
    });

    document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-key') || el.id;
      var value = translate(lang, key);
      if (value == null) return;
      el.getAttribute('data-i18n-attr').split(',').forEach(function (attr) {
        el.setAttribute(attr.trim(), value);
      });
    });

    document.documentElement.lang = lang;
    var langSelect = document.getElementById('langSelect');
    if (langSelect) langSelect.value = lang;
  }

  function changeLanguage(lang) {
    localStorage.setItem(STORAGE_LANG, lang);
    applyTranslations(lang);
    document.dispatchEvent(new CustomEvent('xow:langchange', { detail: { lang: lang } }));
  }

  function getSystemTheme() {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  }

  function applyTheme(mode) {
    var active = mode === 'system' ? getSystemTheme() : mode;
    document.documentElement.setAttribute('data-theme', active);
    var themeSelect = document.getElementById('themeSelect');
    if (themeSelect) themeSelect.value = mode;
  }

  function changeTheme(mode) {
    localStorage.setItem(STORAGE_THEME, mode);
    applyTheme(mode);
  }

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      var saved = localStorage.getItem(STORAGE_THEME) || 'system';
      if (saved === 'system') applyTheme('system');
    });
  }

  function init() {
    applyTranslations(getBrowserLanguage());
    applyTheme(localStorage.getItem(STORAGE_THEME) || 'system');
  }

  window.XowI18n = {
    SUPPORTED_LANGS: SUPPORTED_LANGS,
    translate: translate,
    getBrowserLanguage: getBrowserLanguage,
    applyTranslations: applyTranslations,
    changeLanguage: changeLanguage,
    applyTheme: applyTheme,
    changeTheme: changeTheme,
    getSystemTheme: getSystemTheme,
    init: init,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
