// XowApp public website — shared runtime config.
// No secrets here: the PocketBase URL and collection names are public by design
// (the collections themselves are what carry the real access rules).
window.XOW_CONFIG = {
  pocketbaseUrl: 'https://pocketbase.raulcalvo.com',
  fundingCollection: 'funding_public_status',
  adminCollection: 'web_admins',
  // OAuth *client id* for the "dev" environment -- public by design (native/installed and
  // web client ids are meant to be embedded in client code, they are not a secret; see the
  // comment above ALLOWED_AUDIENCES_FALLBACK in pocketbase/pb_hooks/google_auth.pb.js).
  // TODO(prod): reemplazar por el Client ID de producción antes de publicar fuera de /dev/
  googleClientId: '1028865929134-kipc65s5qvdogdtjs3urlortkfs5h5g0.apps.googleusercontent.com',
};
