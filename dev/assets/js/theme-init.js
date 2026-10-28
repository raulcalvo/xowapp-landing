// XowApp public website — applies the saved (or system) colour theme before the first paint.
// Loaded synchronously in <head> so a dark-mode visitor never sees the light page flash
// while the rest of the scripts load at the end of <body>; i18n.js keeps it in sync after that.
(function () {
  try {
    var mode = localStorage.getItem('xowapp_landing_theme') || 'system';
    if (mode === 'system') {
      mode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', mode);
  } catch (err) {
    // Storage blocked -- i18n.js still applies the theme once it loads.
  }
})();
