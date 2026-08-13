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

  var loadingEl, mockNoticeEl, cardsEl, tiersEl, lastResult;

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

  function renderAll() {
    renderFunding();
    renderTiers();
  }

  function init() {
    loadingEl = document.getElementById('fundingLoadingNotice');
    mockNoticeEl = document.getElementById('fundingMockNotice');
    cardsEl = document.getElementById('fundingCards');
    tiersEl = document.getElementById('donarTiers');
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
