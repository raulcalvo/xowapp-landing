// XowApp public website — shared runtime config.
// No secrets here: the PocketBase URL and collection names are public by design
// (the collections themselves are what carry the real access rules).
window.XOW_CONFIG = {
  pocketbaseUrl: 'https://pocketbase.raulcalvo.com',
  fundingCollection: 'funding_public_status',
  adminCollection: 'web_admins',
};
