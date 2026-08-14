// donar.html — funding status cards (shared with transparencia.html via funding.js) plus the
// donation amount slider.
//
// The amount selector is a straight port of _buildAmountSelector in
// lib/views/donations_view.dart: the same 6 fixed amounts (kDonationTiersEur), the same mood
// emoji per amount (kDonationTierEmojis), and the same "blurb" copy per amount
// (donations_tier_blurb_<amount> in app_localizations.dart, mirrored here as
// donar_tier_blurb_<amount>) -- moving the slider changes the emoji, the big amount value and
// the blurb together, exactly like the app's Slider does. There's no real payment here (no
// IAP on the web), so amountLabel is always the fixed "<amount> €" form -- the app's other
// branch (a live store price) doesn't apply.
(function () {
  var TIER_AMOUNTS_EUR = [2, 5, 10, 15, 30, 100];
  var TIER_EMOJIS = ['🙂', '😄', '🤩', '🥳', '🚀', '🤯'];
  var TIER_BLURB_KEYS = [
    'donar_tier_blurb_2', 'donar_tier_blurb_5', 'donar_tier_blurb_10',
    'donar_tier_blurb_15', 'donar_tier_blurb_30', 'donar_tier_blurb_100',
  ];
  // Mirrors kDonationProductIds in lib/models/funding_phase.dart -- kept in sync on the pay
  // button via data-product-id/data-amount-eur (see renderAmountSelector) so that wiring up
  // the real Stripe call later is just "read this button's dataset and charge that", with no
  // slider-reading logic to duplicate.
  var TIER_PRODUCT_IDS = ['donation_2', 'donation_5', 'donation_10', 'donation_15', 'donation_30', 'donation_100'];
  var DEFAULT_TIER_INDEX = 2; // 10€, same default as _DonationsViewState._selectedTierIndex.

  // sessionStorage key donate-fab.js writes (KEY_FAB_ENTRY there) with the exact emoji shown
  // on the FAB at click time -- read once here and cleared, so the banner below only appears
  // for that one navigation, never on a direct visit/reload of donar.html.
  var FAB_ENTRY_KEY = 'xow_donate_fab_entry';

  // Same emoji -> quote mapping as DonationsView._getQuoteKey in the app, pointed at the
  // donate-FAB's own emoji set (donar_quote_coffee..piggy -- text now copied verbatim from
  // the app's donations_quote_* strings, see i18n-data.js).
  var EMOJI_QUOTE_KEYS = {
    '☕': 'donar_quote_coffee',
    '🍕': 'donar_quote_pizza',
    '❤️': 'donar_quote_heart',
    '🚀': 'donar_quote_rocket',
    '🤝': 'donar_quote_handshake',
    '🎁': 'donar_quote_gift',
    '🐷': 'donar_quote_piggy',
  };

  var loadingEl, mockNoticeEl, cardsEl, lastResult;
  var quoteBannerEl, quoteEmojiEl, quoteTextEl, activeQuoteEmoji;
  var sliderEl, amountEmojiEl, amountValueEl, amountBlurbEl, payButtonEl;
  var selectedTierIndex = DEFAULT_TIER_INDEX;

  function renderFunding() {
    if (!lastResult) return;
    var lang = window.XowI18n ? window.XowI18n.getBrowserLanguage() : 'en';
    window.XowFunding.renderFundingCards(cardsEl, lastResult, lang);
    cardsEl.hidden = false;
    mockNoticeEl.hidden = !(lastResult.isMock || lastResult.isPlaceholder);
  }

  function renderAmountSelector() {
    if (!sliderEl) return;
    var lang = window.XowI18n ? window.XowI18n.getBrowserLanguage() : 'en';
    var amount = TIER_AMOUNTS_EUR[selectedTierIndex];
    var blurb = window.XowI18n ? window.XowI18n.translate(lang, TIER_BLURB_KEYS[selectedTierIndex]) : '';
    amountEmojiEl.textContent = TIER_EMOJIS[selectedTierIndex];
    amountValueEl.textContent = amount + ' €';
    amountBlurbEl.textContent = blurb || '';
    sliderEl.value = String(selectedTierIndex);
    // Drives the CSS gradient fill in .xow-amount-slider (see theme.css) -- there's no
    // selector for "the filled portion of a range track", so the fill % is computed here and
    // handed to CSS as a custom property, same trick on every input/rerender.
    var fillPct = (selectedTierIndex / (TIER_AMOUNTS_EUR.length - 1)) * 100;
    sliderEl.style.setProperty('--fill', fillPct + '%');

    // Keeps the (currently disabled) pay button in sync with the slider so that turning on
    // real Stripe donations later is just "read this button's dataset and charge that amount"
    // -- see the TIER_PRODUCT_IDS comment above.
    if (payButtonEl) {
      payButtonEl.dataset.amountEur = String(amount);
      payButtonEl.dataset.productId = TIER_PRODUCT_IDS[selectedTierIndex];
    }
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
    renderAmountSelector();
    renderQuoteBanner();
  }

  function init() {
    loadingEl = document.getElementById('fundingLoadingNotice');
    mockNoticeEl = document.getElementById('fundingMockNotice');
    cardsEl = document.getElementById('fundingCards');
    quoteBannerEl = document.getElementById('donarQuoteBanner');
    quoteEmojiEl = document.getElementById('donarQuoteEmoji');
    quoteTextEl = document.getElementById('donarQuoteText');
    sliderEl = document.getElementById('donarAmountSlider');
    amountEmojiEl = document.getElementById('donarAmountEmoji');
    amountValueEl = document.getElementById('donarAmountValue');
    amountBlurbEl = document.getElementById('donarAmountBlurb');
    payButtonEl = document.getElementById('donar_stripe_cta_disabled');

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

    renderAmountSelector();
    if (sliderEl) {
      sliderEl.addEventListener('input', function () {
        selectedTierIndex = Number(sliderEl.value);
        renderAmountSelector();
      });
    }

    if (!window.XowFunding) return;

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
