// transparencia.html — loads and renders the public funding status.
(function () {
  var loadingEl, mockNoticeEl, cardsEl, lastResult;

  function render() {
    if (!lastResult) return;
    var lang = window.XowI18n ? window.XowI18n.getBrowserLanguage() : 'en';
    window.XowFunding.renderFundingCards(cardsEl, lastResult, lang);
    cardsEl.hidden = false;
    mockNoticeEl.hidden = !(lastResult.isMock || lastResult.isPlaceholder);
  }

  function init() {
    loadingEl = document.getElementById('fundingLoadingNotice');
    mockNoticeEl = document.getElementById('fundingMockNotice');
    cardsEl = document.getElementById('fundingCards');
    if (!cardsEl || !window.XowFunding) return;

    window.XowFunding.loadFundingStatus().then(function (result) {
      lastResult = result;
      loadingEl.hidden = true;
      render();
    });

    document.addEventListener('xow:langchange', render);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
