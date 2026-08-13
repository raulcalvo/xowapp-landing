// donar.html — funding status cards (shared with transparencia.html via funding.js) plus the
// 6 donation tiers.
//
// Tier amounts/emojis are mirrored from lib/models/funding_phase.dart (kDonationTiersEur /
// kDonationTierEmojis) so they always match what's shown inside the app (donar_tier_note says
// exactly that). The content spec provides 7 short "quote" lines (donar_quote_coffee..piggy) —
// one more than the 6 monetary tiers, because that set doubles as the donate-FAB's rotating
// emoji captions. The first 6 are paired 1:1 with the tiers below; "piggy" is used as a
// standalone closing line under the tier grid (see #donar_quote_piggy in donar.html) rather
// than being dropped.
(function () {
  var TIER_AMOUNTS_EUR = [2, 5, 10, 15, 30, 100];
  var TIER_EMOJIS = ['🙂', '😄', '🤩', '🥳', '🚀', '🤯'];
  var TIER_QUOTE_KEYS = [
    'donar_quote_coffee', 'donar_quote_pizza', 'donar_quote_heart',
    'donar_quote_rocket', 'donar_quote_handshake', 'donar_quote_gift',
  ];

  // sessionStorage key donate-fab.js writes (KEY_FAB_ENTRY there) with the exact emoji shown
  // on the FAB at click time -- read once here and cleared, so the banner below only appears
  // for that one navigation, never on a direct visit/reload of donar.html.
  var FAB_ENTRY_KEY = 'xow_donate_fab_entry';

  // Same emoji -> quote mapping as DonationsView._getQuoteKey in the app, pointed at the
  // donate-FAB's own emoji set (donar_quote_coffee..piggy, already used above for the tier
  // cards and the piggy note -- see the file header comment).
  var EMOJI_QUOTE_KEYS = {
    '☕': 'donar_quote_coffee',
    '🍕': 'donar_quote_pizza',
    '❤️': 'donar_quote_heart',
    '🚀': 'donar_quote_rocket',
    '🤝': 'donar_quote_handshake',
    '🎁': 'donar_quote_gift',
    '🐷': 'donar_quote_piggy',
  };

  var loadingEl, mockNoticeEl, cardsEl, tiersEl, lastResult;
  var quoteBannerEl, quoteEmojiEl, quoteTextEl, activeQuoteEmoji;

  function renderFunding() {
    if (!lastResult) return;
    var lang = window.XowI18n ? window.XowI18n.getBrowserLanguage() : 'en';
    window.XowFunding.renderFundingCards(cardsEl, lastResult, lang);
    cardsEl.hidden = false;
    mockNoticeEl.hidden = !(lastResult.isMock || lastResult.isPlaceholder);
  }

  function renderTiers() {
    var lang = window.XowI18n ? window.XowI18n.getBrowserLanguage() : 'en';
    var html = TIER_AMOUNTS_EUR.map(function (amount, idx) {
      var quote = window.XowI18n ? window.XowI18n.translate(lang, TIER_QUOTE_KEYS[idx]) : '';
      return (
        '<div class="xow-tier-card">' +
          '<div class="xow-tier-emoji" aria-hidden="true">' + TIER_EMOJIS[idx] + '</div>' +
          '<div class="xow-tier-amount">' + amount + ' €</div>' +
          '<div class="xow-tier-quote">' + quote + '</div>' +
        '</div>'
      );
    }).join('');
    tiersEl.innerHTML = html;
  }

  function renderQuoteBanner() {
    if (!quoteBannerEl || !activeQuoteEmoji) return;
    var lang = window.XowI18n ? window.XowI18n.getBrowserLanguage() : 'en';
    var key = EMOJI_QUOTE_KEYS[activeQuoteEmoji] || EMOJI_QUOTE_KEYS['☕'];
    quoteEmojiEl.textContent = activeQuoteEmoji;
    quoteTextEl.textContent = window.XowI18n ? window.XowI18n.translate(lang, key) : '';
  }

  function renderAll() {
    renderFunding();
    renderTiers();
    renderQuoteBanner();
  }

  function init() {
    loadingEl = document.getElementById('fundingLoadingNotice');
    mockNoticeEl = document.getElementById('fundingMockNotice');
    cardsEl = document.getElementById('fundingCards');
    tiersEl = document.getElementById('donarTiers');
    quoteBannerEl = document.getElementById('donarQuoteBanner');
    quoteEmojiEl = document.getElementById('donarQuoteEmoji');
    quoteTextEl = document.getElementById('donarQuoteText');

    // Independent of XowFunding below -- the quote banner has nothing to do with the funding
    // cards, so it shouldn't be skipped if that script failed to load.
    try {
      var enteredEmoji = sessionStorage.getItem(FAB_ENTRY_KEY);
      if (enteredEmoji) {
        sessionStorage.removeItem(FAB_ENTRY_KEY);
        activeQuoteEmoji = enteredEmoji;
        if (quoteBannerEl) quoteBannerEl.hidden = false;
        renderQuoteBanner();
      }
    } catch (e) {
      // Storage unavailable -- banner just stays hidden, same as a direct visit.
    }

    if (!window.XowFunding) return;

    renderTiers();

    window.XowFunding.loadFundingStatus().then(function (result) {
      lastResult = result;
      loadingEl.hidden = true;
      renderFunding();
    });

    document.addEventListener('xow:langchange', renderAll);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
