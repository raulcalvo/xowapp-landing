(function () {
  // Auto-detect whether we are running in the development / staging environment:
  // 1. Path is under '/dev/' (e.g. GitHub Pages https://raulcalvo.github.io/xowapp-landing/dev/ or https://xowapp.com/dev/)
  // 2. Subdomain is 'dev.' (e.g. https://dev.xowapp.com)
  // 3. Local testing (localhost / 127.0.0.1)
  // 4. Explicit override via query string '?env=dev'
  var isDev = (typeof window !== 'undefined' && window.location) ? (
    window.location.pathname.indexOf('/dev/') !== -1 ||
    window.location.pathname.indexOf('/dev') === 0 ||
    window.location.hostname.indexOf('dev.') === 0 ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.search.indexOf('env=dev') !== -1
  ) : false;

  window.XOW_CONFIG = {
    isDev: isDev,
    pocketbaseUrl: isDev ? 'https://dev.pocketbase.xowapp.com' : 'https://pocketbase.raulcalvo.com',
    fundingCollection: 'funding_public_status',
    fundingSettingsCollection: 'funding_settings',
    fundingExpensesCollection: 'funding_expenses',
    fundingIncomesCollection: 'funding_incomes',
    adminCollection: 'web_admins',
    // OAuth *client id* for the "dev" environment -- public by design (native/installed and
    // web client ids are meant to be embedded in client code, they are not a secret; see the
    // comment above ALLOWED_AUDIENCES_FALLBACK in pocketbase/pb_hooks/google_auth.pb.js).
    // TODO(prod): reemplazar por el Client ID de producción antes de publicar fuera de /dev/
    googleClientId: '1028865929134-kipc65s5qvdogdtjs3urlortkfs5h5g0.apps.googleusercontent.com',
  };
})();
