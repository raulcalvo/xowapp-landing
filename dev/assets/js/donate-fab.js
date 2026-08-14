// XowApp public website — "donate" button.
// Inline button in the header's picker row (right of the language picker) linking to
// donar.html, with a rotating emoji (persisted across navigation via localStorage) and an
// occasional "wiggle" animation. Hidden on donar.html itself via
// `[data-page="donar"] .xow-fab { display: none }` in theme.css.
(function () {
  var EMOJIS = ['☕', '🍕', '❤️', '🚀', '🤝', '🎁', '🐷'];
  var KEY_CURRENT = 'xow_donation_emoji_current';
  var KEY_LAST_CHANGE = 'xow_donation_emoji_last_change';
  var KEY_TARGET_DURATION = 'xow_donation_emoji_target_duration';
  // sessionStorage, not localStorage: a one-shot marker consumed by donar.js on load (see
  // KEY_FAB_ENTRY there) so the quote banner only appears when donar.html is reached by
  // actually tapping this button -- not on a direct visit/reload/other link to donar.html.
  var KEY_FAB_ENTRY = 'xow_donate_fab_entry';

  var EMOJI_MIN_MS = 120000;
  var EMOJI_MAX_MS = 300000;
  var WIGGLE_MIN_MS = 6000;
  var WIGGLE_MAX_MS = 12000;
  var WIGGLE_DURATION_MS = 600;

  var emojiTimer = null;
  var wiggleTimer = null;
  var buttonEl = null;
  var emojiEl = null;

  function randomBetween(min, max) {
    return Math.floor(min + Math.random() * (max - min));
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function pickNewEmoji(excluding) {
    var pool = EMOJIS.filter(function (e) { return e !== excluding; });
    return pool[Math.floor(Math.random() * pool.length)] || EMOJIS[0];
  }

  function readState() {
    var current = localStorage.getItem(KEY_CURRENT) || EMOJIS[0];
    var lastChange = parseInt(localStorage.getItem(KEY_LAST_CHANGE) || '0', 10);
    var targetDuration = parseInt(localStorage.getItem(KEY_TARGET_DURATION) || '0', 10);
    if (!lastChange || !targetDuration) {
      lastChange = Date.now();
      targetDuration = randomBetween(EMOJI_MIN_MS, EMOJI_MAX_MS);
      localStorage.setItem(KEY_CURRENT, current);
      localStorage.setItem(KEY_LAST_CHANGE, String(lastChange));
      localStorage.setItem(KEY_TARGET_DURATION, String(targetDuration));
    }
    return { current: current, lastChange: lastChange, targetDuration: targetDuration };
  }

  function advanceEmojiIfDue(state) {
    var elapsed = Date.now() - state.lastChange;
    if (elapsed >= state.targetDuration) {
      var next = pickNewEmoji(state.current);
      var now = Date.now();
      var duration = randomBetween(EMOJI_MIN_MS, EMOJI_MAX_MS);
      localStorage.setItem(KEY_CURRENT, next);
      localStorage.setItem(KEY_LAST_CHANGE, String(now));
      localStorage.setItem(KEY_TARGET_DURATION, String(duration));
      return { current: next, lastChange: now, targetDuration: duration };
    }
    return state;
  }

  function render(emoji) {
    if (emojiEl) emojiEl.textContent = emoji;
  }

  function scheduleEmojiRotation() {
    clearTimeout(emojiTimer);
    var state = advanceEmojiIfDue(readState());
    render(state.current);
    var remaining = Math.max(1000, state.targetDuration - (Date.now() - state.lastChange));
    emojiTimer = setTimeout(function () {
      var rotated = advanceEmojiIfDue(readState());
      render(rotated.current);
      scheduleEmojiRotation();
    }, remaining);
  }

  function scheduleWiggle() {
    clearTimeout(wiggleTimer);
    if (prefersReducedMotion()) return;
    var delay = randomBetween(WIGGLE_MIN_MS, WIGGLE_MAX_MS);
    wiggleTimer = setTimeout(function () {
      if (buttonEl) {
        buttonEl.classList.add('is-wiggling');
        setTimeout(function () {
          buttonEl.classList.remove('is-wiggling');
        }, WIGGLE_DURATION_MS);
      }
      scheduleWiggle();
    }, delay);
  }

  function pauseTimers() {
    clearTimeout(emojiTimer);
    clearTimeout(wiggleTimer);
  }

  function resumeTimers() {
    scheduleEmojiRotation();
    scheduleWiggle();
  }

  function inject() {
    if (document.body.getAttribute('data-page') === 'donar') return;
    if (document.getElementById('xowDonateFab')) return;

    buttonEl = document.createElement('a');
    buttonEl.id = 'xowDonateFab';
    buttonEl.className = 'xow-fab';
    buttonEl.href = 'donar.html';
    buttonEl.setAttribute('data-i18n-key', 'donate_fab_aria');
    buttonEl.setAttribute('data-i18n-attr', 'aria-label,title');
    // This button's visible content is only the emoji span appended below — it must never
    // get its textContent overwritten by the generic [data-i18n-key] translation pass (that
    // used to happen here, wiping out the emoji span and leaving a bare text label behind).
    buttonEl.setAttribute('data-i18n-text', 'false');

    emojiEl = document.createElement('span');
    emojiEl.setAttribute('aria-hidden', 'true');
    buttonEl.appendChild(emojiEl);

    // Captured synchronously on click, before the browser follows the href -- this is the
    // static-site equivalent of the app passing `initialEmoji` to DonationsView when its
    // shortcut button is tapped (see donation_shortcut_button.dart).
    buttonEl.addEventListener('click', function () {
      try {
        sessionStorage.setItem(KEY_FAB_ENTRY, emojiEl.textContent || '');
      } catch (e) {
        // Storage unavailable (private mode, etc.) -- the banner just won't show; not worth
        // blocking navigation over.
      }
    });

    // Mount next to the language picker inside the header (nav.js gives that row a stable id);
    // fall back to document.body if the header hasn't rendered that far for some reason, so
    // this degrades gracefully instead of losing the button entirely.
    var mountPoint = document.getElementById('xowNavPickers') || document.body;
    mountPoint.appendChild(buttonEl);

    var state = readState();
    render(state.current);

    resumeTimers();

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        pauseTimers();
      } else {
        resumeTimers();
      }
    });

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
