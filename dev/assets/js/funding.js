// XowApp public website — funding status (transparencia.html + donar.html share this).
//
// Fetches the single aggregated record from the public `funding_public_status` PocketBase
// collection. If the request fails, times out (>4s), or there simply are no records yet
// (collection not seeded on the backend, or genuinely empty), this falls back to LOCAL mock
// data mirrored from lib/models/funding_phase.dart (kMockTotalRaisedEur / kFundingPhases) and
// flags the result as mock so the UI can show the `transparencia_status_unavailable` notice
// next to the illustrative numbers (see the "mock fallback + honesty banner" design note in
// the coding summary for why both — the mock data and that specific disclaimer text — are
// shown together).
//
// `computeFundingStatus` below is a line-for-line port of the cascade algorithm in
// lib/models/funding_phase.dart (`computeFundingStatus` + `addMonthsClamped`), so the public
// website and the app compute identical phase states from the same raw numbers.
(function () {
  var FETCH_TIMEOUT_MS = 4000;

  // Mirrors lib/models/funding_phase.dart verbatim.
  var MOCK_TOTAL_RAISED_EUR = 9500.0;
  var MOCK_PHASES = [
    { key: 'survival', monthlyCostEur: 300, bucketEur: 7200 },
    { key: 'infra', monthlyCostEur: 800, bucketEur: 19200 },
    { key: 'pro', monthlyCostEur: 0, bucketEur: 15000 },
  ];

  var PHASE_TEXT_KEYS = {
    survival: { name: 'transparencia_phase_survival_name', desc: 'transparencia_phase_survival_desc' },
    infra: { name: 'transparencia_phase_infra_name', desc: 'transparencia_phase_infra_desc' },
    pro: { name: 'transparencia_phase_pro_name', desc: 'transparencia_phase_pro_desc' },
  };

  function clamp01(n) {
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  // Adds `months` calendar months to `date`, clamping the day-of-month so e.g. Jan 31 + 1
  // month lands on Feb 28/29 instead of overflowing into March. Mirrors addMonthsClamped in
  // lib/models/funding_phase.dart.
  function addMonthsClamped(date, months) {
    var y = date.getFullYear();
    var m = date.getMonth(); // 0-based
    var lastDayOfTargetMonth = new Date(y, m + months + 1, 0).getDate();
    var day = Math.min(date.getDate(), lastDayOfTargetMonth);
    return new Date(y, m + months, day);
  }

  function computeFundingStatus(phases, totalRaisedEur, now) {
    var remaining = totalRaisedEur < 0 || !isFinite(totalRaisedEur) ? 0 : totalRaisedEur;
    var activeAssigned = false;
    var result = [];

    phases.forEach(function (phase) {
      var bucket = phase.bucketEur > 0 ? phase.bucketEur : 0;
      var allocated = remaining >= bucket ? bucket : Math.max(0, remaining);
      remaining -= allocated;

      var isCovered = bucket > 0 && allocated >= bucket;
      var progress = bucket > 0 ? clamp01(allocated / bucket) : (isCovered ? 1 : 0);

      var state;
      if (isCovered) {
        state = 'covered';
      } else if (!activeAssigned) {
        state = 'active';
        activeAssigned = true;
      } else {
        state = 'pending';
      }

      var fundedUntil = null;
      if (state === 'active' && phase.monthlyCostEur > 0) {
        var months = Math.floor(allocated / phase.monthlyCostEur);
        fundedUntil = addMonthsClamped(now, months);
      }

      result.push({
        phase: phase,
        state: state,
        allocatedEur: allocated,
        progress: progress,
        fundedUntil: fundedUntil,
      });
    });

    return result;
  }

  function fetchWithTimeout(url, timeoutMs) {
    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (controller) controller.abort();
    }, timeoutMs);
    return fetch(url, controller ? { signal: controller.signal } : {}).finally(function () {
      clearTimeout(timer);
    });
  }

  function mockResult() {
    return {
      isMock: true,
      isPlaceholder: true,
      totalRaisedEur: MOCK_TOTAL_RAISED_EUR,
      statuses: computeFundingStatus(MOCK_PHASES, MOCK_TOTAL_RAISED_EUR, new Date()),
    };
  }

  function loadFundingStatus() {
    var cfg = window.XOW_CONFIG || {};
    if (!cfg.pocketbaseUrl || !cfg.fundingCollection) {
      return Promise.resolve(mockResult());
    }
    var url = cfg.pocketbaseUrl.replace(/\/$/, '') +
      '/api/collections/' + encodeURIComponent(cfg.fundingCollection) + '/records?perPage=1&sort=-created';

    return fetchWithTimeout(url, FETCH_TIMEOUT_MS)
      .then(function (res) {
        if (!res.ok) throw new Error('funding_public_status request failed: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var items = (data && data.items) || [];
        if (!items.length) return mockResult();

        var record = items[0];
        var rawPhases = record.phases;
        if (typeof rawPhases === 'string') {
          try { rawPhases = JSON.parse(rawPhases); } catch (e) { rawPhases = []; }
        }

        var phases = Array.isArray(rawPhases) && rawPhases.length ? rawPhases.map(function (p, idx) {
          var pExps = p.expenses;
          if (typeof pExps === 'string') {
            try { pExps = JSON.parse(pExps); } catch (e) { pExps = []; }
          }
          return {
            id: p.id,
            key: p.key || ('phase_' + (idx + 1)),
            name: p.name,
            desc: p.desc || p.description,
            order: Number(p.order) || (idx + 1),
            monthlyCostEur: Number(p.monthly_cost_eur) || 0,
            bucketEur: Number(p.bucket_eur) || 0,
            expenses: Array.isArray(pExps) ? pExps : [],
          };
        }) : MOCK_PHASES;
        var totalRaisedEur = Number(record.total_raised_eur) || 0;

        return {
          isMock: false,
          isPlaceholder: !!record.is_placeholder,
          totalRaisedEur: totalRaisedEur,
          statuses: computeFundingStatus(phases, totalRaisedEur, new Date()),
        };
      })
      .catch(function () {
        return mockResult();
      });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatEur(n, lang) {
    try {
      return new Intl.NumberFormat(lang || 'en', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
    } catch (e) {
      return Math.round(n) + ' €';
    }
  }

  function formatMonthYear(date, lang) {
    try {
      return new Intl.DateTimeFormat(lang || 'en', { month: 'long', year: 'numeric' }).format(date);
    } catch (e) {
      return date.toISOString().slice(0, 7);
    }
  }

  function badgeMarkup(state, lang) {
    var key = state === 'covered' ? 'transparencia_covered_badge'
      : state === 'active' ? 'transparencia_active_badge'
      : 'transparencia_pending_badge';
    var cls = 'xow-badge xow-badge-' + state;
    var icon = state === 'covered' ? 'check_circle' : state === 'active' ? 'schedule' : 'schedule';
    var text = window.XowI18n ? window.XowI18n.translate(lang, key) : key;
    return '<span class="' + cls + '"><svg class="icon icon-sm"><use href="#i-' + icon + '"></use></svg>' + text + '</span>';
  }

  function renderFundingCards(container, result, lang) {
    if (!container) return;
    var t = function (key) { return window.XowI18n ? window.XowI18n.translate(lang, key) : key; };

    var html = '';
    html += '<div class="xow-funding-total">';
    html += '<div class="xow-funding-total-value">' + formatEur(result.totalRaisedEur, lang) + '</div>';
    html += '<div class="xow-funding-total-label">' + t('transparencia_total_label') + '</div>';
    html += '</div>';

    result.statuses.forEach(function (status, idx) {
      var textKeys = PHASE_TEXT_KEYS[status.phase.key] || { name: '', desc: '' };

      var nameVal = status.phase.name;
      if (typeof nameVal === 'string' && nameVal.indexOf('{') === 0) {
        try { nameVal = JSON.parse(nameVal); } catch (e) {}
      }
      var name = (typeof nameVal === 'object' && nameVal)
        ? (nameVal[lang] || nameVal.es || nameVal.en || Object.values(nameVal)[0])
        : (nameVal || (textKeys.name ? t(textKeys.name) : ('Fase ' + (idx + 1))));

      var descVal = status.phase.desc || status.phase.description;
      if (typeof descVal === 'string' && descVal.indexOf('{') === 0) {
        try { descVal = JSON.parse(descVal); } catch (e) {}
      }
      var desc = (typeof descVal === 'object' && descVal)
        ? (descVal[lang] || descVal.es || descVal.en || Object.values(descVal)[0])
        : (descVal || (textKeys.desc ? t(textKeys.desc) : ''));

      var pct = Math.round(status.progress * 100);

      html += '<div class="xow-phase-card" data-phase-index="' + idx + '">';
      html += '<div class="xow-phase-head">';
      html += '<div><div class="xow-phase-name">' + escapeHtml(name) + '</div><div class="xow-phase-desc">' + escapeHtml(desc) + '</div></div>';
      html += badgeMarkup(status.state, lang);
      html += '</div>';
      html += '<div class="xow-progress-track"><div class="xow-progress-fill" data-progress-pct="' + pct + '"></div></div>';

      var meta = '';
      if (status.state === 'active' && status.fundedUntil) {
        meta = t('transparencia_active_badge') + ' — ' + formatMonthYear(status.fundedUntil, lang);
      }
      if (meta) html += '<div class="xow-phase-meta">' + meta + '</div>';

      html += '<button type="button" class="xow-phase-toggle">' +
        '<svg class="icon icon-sm"><use href="#i-open_in_new"></use></svg>' +
        t('transparencia_expand_cta') + '</button>';

      var exps = status.phase.expenses || [];
      html += '<div class="xow-phase-detail">';
      html += '  <div class="xow-phase-breakdown-summary">';
      html += '    <div class="xow-phase-breakdown-metric"><span>' + t('transparencia_breakdown_allocated_label') + ':</span> <strong>' + formatEur(status.allocatedEur, lang) + '</strong></div>';
      html += '    <div class="xow-phase-breakdown-metric"><span>' + t('transparencia_breakdown_target_label') + ':</span> <strong>' + formatEur(status.phase.bucketEur, lang) + '</strong></div>';
      if (status.phase.monthlyCostEur > 0) {
        html += '    <div class="xow-phase-breakdown-metric"><span>' + t('transparencia_breakdown_monthly') + ':</span> <strong>' + formatEur(status.phase.monthlyCostEur, lang) + '/mes</strong></div>';
      }
      html += '  </div>';

      if (exps && exps.length > 0) {
        html += '  <div class="xow-phase-expenses-box">';
        html += '    <div class="xow-phase-expenses-header">' + t('transparencia_breakdown_title') + '</div>';
        html += '    <div class="xow-phase-expenses-list">';
        exps.forEach(function (exp) {
          var isMonthly = exp.type === 'monthly';
          var typeLabel = isMonthly ? t('transparencia_breakdown_monthly') : t('transparencia_breakdown_oneoff');
          var badgeCls = isMonthly ? 'xow-badge xow-badge-monthly' : 'xow-badge xow-badge-oneoff';
          var amountStr = formatEur(exp.amount_eur, lang) + (isMonthly ? '/mes' : '');
          html += '      <div class="xow-phase-expense-item">';
          html += '        <span class="xow-phase-expense-name">' + escapeHtml(exp.concept || 'Gasto operativo') + '</span>';
          html += '        <span class="' + badgeCls + '">' + typeLabel + '</span>';
          html += '        <span class="xow-phase-expense-amount">' + amountStr + '</span>';
          html += '      </div>';
        });
        html += '    </div>';
        html += '  </div>';
      } else {
        html += '  <div class="xow-phase-expenses-empty">' + t('transparencia_breakdown_no_expenses') + '</div>';
      }

      html += '</div>'; // .xow-phase-detail
      html += '</div>'; // .xow-phase-card
    });

    container.innerHTML = html;

    // Progress bar widths are set via the CSSOM (element.style.width), not an inline
    // style="" attribute in the markup above — the page's CSP has no 'unsafe-inline' for
    // style-src, and direct .style property assignment (unlike setAttribute('style', ...))
    // is exempt from that restriction.
    container.querySelectorAll('.xow-progress-fill[data-progress-pct]').forEach(function (el) {
      el.style.width = el.getAttribute('data-progress-pct') + '%';
    });

    container.querySelectorAll('.xow-phase-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.closest('.xow-phase-card').classList.toggle('is-expanded');
      });
    });
  }

  window.XowFunding = {
    computeFundingStatus: computeFundingStatus,
    loadFundingStatus: loadFundingStatus,
    renderFundingCards: renderFundingCards,
    formatEur: formatEur,
    MOCK_TOTAL_RAISED_EUR: MOCK_TOTAL_RAISED_EUR,
    MOCK_PHASES: MOCK_PHASES,
  };
})();
