// XowApp public website — detects arrival from a link inside the mobile app (?ref=app) and
// sets the same session-only "hide donate" flag that donate-fab.js and nav.js already check
// (see the comment on isDonateHidden() in either of those files for what it suppresses and
// why: Apple/Google app review guidelines restrict prominent alternative-payment prompts
// reachable from a link inside the app).
//
// Loaded FIRST, before every other page script, so the flag is set before donate-fab.js/nav.js
// decide what to render -- no separate entry page/redirect needed, and no visible URL jump:
// the ?ref=app param is stripped from the address bar via history.replaceState (no reload)
// right after being read, so the page the visitor sees is indistinguishable from a normal
// visit to the same URL.
//
// sessionStorage, not localStorage: it should only cover this one browsing session (this tab,
// until it's closed) -- a normal visitor who later opens the site directly in a new tab must
// still see donations promoted normally.
(function () {
  try {
    var params = new URLSearchParams(location.search);
    if (params.get('ref') !== 'app') return;

    sessionStorage.setItem('xow_hide_donate', '1');

    params.delete('ref');
    var rest = params.toString();
    var cleanUrl = location.pathname + (rest ? '?' + rest : '') + location.hash;
    history.replaceState(null, '', cleanUrl);
  } catch (err) {
    // URLSearchParams/sessionStorage/history unavailable -- worst case the donate prompts
    // show normally, same as a plain link without ?ref=app would have.
  }
})();
