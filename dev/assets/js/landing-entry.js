// XowApp public website — entry point for links opened from the mobile app (public/landing.html).
//
// Apple/Google app review guidelines restrict prominent alternative-payment prompts reachable
// from a link inside the app, so a page opened this way must never surface XowApp's "Donate"
// call to action. Rather than maintaining a second copy of index.html's content (which would
// drift out of sync over time), this sets a session-only flag and redirects straight to the
// normal homepage: donate-fab.js and nav.js both check the same flag and suppress every
// donate/support prompt on the site (the header FAB, the "Donar" nav link, and any
// [data-donate-cta] element) for as long as this flag is set.
//
// sessionStorage, not localStorage: it should only cover this one browsing session (this tab,
// until it's closed) -- a normal visitor who later opens the site directly in a new tab must
// still see donations promoted normally.
//
// No <noscript> fallback: this static site has no server-side routing to redirect a JS-less
// visitor with, and every other page already requires JS for its nav/i18n to render at all.
try {
  sessionStorage.setItem('xow_hide_donate', '1');
} catch (err) {
  // Storage unavailable (private mode, etc.) -- still redirect; worst case the destination
  // page shows the normal donate prompts, same as a plain link to index.html would have.
}
location.replace('index.html');
