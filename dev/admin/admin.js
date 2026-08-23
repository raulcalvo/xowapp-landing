// public/admin/admin.js — Interactive Funding Management Admin Dashboard
//
// Zero-Knowledge Architecture Note:
// Uses the local in-memory auth store (InMemoryAuthStore) to authenticate against `web_admins`.
// Admin credentials and access tokens are strictly kept in-memory for the lifetime of the tab
// and NEVER stored in persistent localStorage.
(function () {
  'use strict';

  // Clickjacking mitigation: bail out immediately if loaded inside a frame
  if (typeof window !== 'undefined' && window.top && window.self && window.top !== window.self) {
    document.documentElement.innerHTML = '';
    window.top.location = window.self.location;
    return;
  }

  // ------------------------------------------------------------------
  // In-Memory Auth Store (Session disappears upon tab closure)
  // ------------------------------------------------------------------
  function InMemoryAuthStore() {
    this._token = '';
    this._record = null;
    this._callbacks = [];
  }
  InMemoryAuthStore.prototype = {
    get token() { return this._token; },
    get record() { return this._record; },
    get model() { return this._record; },
    get isValid() { return !!this._token; },
    get isSuperuser() { return false; },
    save: function (token, record) {
      this._token = token || '';
      this._record = record || null;
      this._trigger();
    },
    clear: function () {
      this._token = '';
      this._record = null;
      this._trigger();
    },
    onChange: function (callback, fireImmediately) {
      var self = this;
      this._callbacks.push(callback);
      if (fireImmediately) callback(this._token, this._record);
      return function unsubscribe() {
        var idx = self._callbacks.indexOf(callback);
        if (idx !== -1) self._callbacks.splice(idx, 1);
      };
    },
    _trigger: function () {
      var self = this;
      this._callbacks.forEach(function (cb) { cb(self._token, self._record); });
    },
  };

  var cfg = (typeof window !== 'undefined' && window.XOW_CONFIG) || {};
  var pb = (typeof PocketBase !== 'undefined') ? new PocketBase(cfg.pocketbaseUrl || '', new InMemoryAuthStore()) : null;

  var SETTINGS_COLLECTION = cfg.fundingSettingsCollection || 'funding_settings';
  var PHASES_COLLECTION = cfg.fundingPhasesCollection || 'funding_phases';
  var EXPENSES_COLLECTION = cfg.fundingExpensesCollection || 'funding_expenses';
  var INCOMES_COLLECTION = cfg.fundingIncomesCollection || 'funding_incomes';
  var PUBLIC_STATUS_COLLECTION = cfg.fundingCollection || 'funding_public_status';

  // ------------------------------------------------------------------
  // State Management
  // ------------------------------------------------------------------
  var state = {
    settings: {
      id: null,
      project_start_date: '2026-01-01',
      google_fee_pct: 15.0,
      apple_fee_pct: 15.0,
      stripe_fee_pct: 1.5,
      stripe_fee_fixed_eur: 0.25,
      tax_rate_pct: 19.0,
      currency: 'EUR',
    },
    phases: [],
    expenses: [],
    incomes: [],
    publicStatusRecord: null,
    deleteTarget: null, // { type: 'expense'|'income'|'phase', id: string, name: string }
    isSyncing: false,
  };

  // ------------------------------------------------------------------
  // DOM Element References
  // ------------------------------------------------------------------
  var doc = typeof document !== 'undefined' ? document : {
    getElementById: function () { return null; },
    querySelectorAll: function () { return []; },
  };

  var el = {
    loginShell: doc.getElementById('adminLoginShell'),
    loginForm: doc.getElementById('adminLoginForm'),
    emailInput: doc.getElementById('adminEmail'),
    passwordInput: doc.getElementById('adminPassword'),
    loginError: doc.getElementById('adminLoginError'),
    loginSubmitBtn: doc.getElementById('admin_submit'),

    dashboardApp: doc.getElementById('adminDashboardApp'),
    adminWelcomeName: doc.getElementById('adminWelcomeName'),
    adminUserAvatar: doc.getElementById('adminUserAvatar'),
    lastSyncStatusText: doc.getElementById('lastSyncStatusText'),
    adminLogoutBtn: doc.getElementById('adminLogoutBtn'),
    btnSyncPublic: doc.getElementById('btnSyncPublic'),

    // KPIs
    kpiGrossValue: doc.getElementById('kpiGrossValue'),
    kpiNetValue: doc.getElementById('kpiNetValue'),
    kpiMonthlyCostValue: doc.getElementById('kpiMonthlyCostValue'),
    kpiRunwayValue: doc.getElementById('kpiRunwayValue'),
    kpiRunwaySub: doc.getElementById('kpiRunwaySub'),

    // Phases Visualizer
    adminPhasesContainer: doc.getElementById('adminPhasesContainer'),

    // Tabs
    tabBtnExpenses: doc.getElementById('tabBtnExpenses'),
    tabBtnPhases: doc.getElementById('tabBtnPhases'),
    tabBtnIncomes: doc.getElementById('tabBtnIncomes'),
    tabBtnSettings: doc.getElementById('tabBtnSettings'),
    panelExpenses: doc.getElementById('panelExpenses'),
    panelPhases: doc.getElementById('panelPhases'),
    panelIncomes: doc.getElementById('panelIncomes'),
    panelSettings: doc.getElementById('panelSettings'),

    // Phases Table
    phasesTableBody: doc.getElementById('phasesTableBody'),
    phasesEmptyState: doc.getElementById('phasesEmptyState'),
    btnOpenAddPhaseModal: doc.getElementById('btnOpenAddPhaseModal'),

    // Expenses Table
    expensesTableBody: doc.getElementById('expensesTableBody'),
    expensesEmptyState: doc.getElementById('expensesEmptyState'),
    btnOpenAddExpenseModal: doc.getElementById('btnOpenAddExpenseModal'),

    // Incomes Table
    incomesTableBody: doc.getElementById('incomesTableBody'),
    incomesEmptyState: doc.getElementById('incomesEmptyState'),
    btnOpenAddIncomeModal: doc.getElementById('btnOpenAddIncomeModal'),

    // Settings Form
    adminSettingsForm: doc.getElementById('adminSettingsForm'),
    setStartDate: doc.getElementById('setStartDate'),
    setCurrency: doc.getElementById('setCurrency'),
    setGoogleFee: doc.getElementById('setGoogleFee'),
    setAppleFee: doc.getElementById('setAppleFee'),
    setStripePct: doc.getElementById('setStripePct'),
    setStripeFixed: doc.getElementById('setStripeFixed'),
    setTaxRate: doc.getElementById('setTaxRate'),
    btnSaveSettings: doc.getElementById('btnSaveSettings'),

    // Phase Modal
    modalPhaseBackdrop: doc.getElementById('modalPhaseBackdrop'),
    modalPhaseTitle: doc.getElementById('modalPhaseTitle'),
    btnClosePhaseModal: doc.getElementById('btnClosePhaseModal'),
    btnCancelPhase: doc.getElementById('btnCancelPhase'),
    formPhase: doc.getElementById('formPhase'),
    phaseEditId: doc.getElementById('phaseEditId'),
    phaseOrder: doc.getElementById('phaseOrder'),
    phaseName: doc.getElementById('phaseName'),
    phaseDesc: doc.getElementById('phaseDesc'),
    phaseLangTabs: doc.getElementById('phaseLangTabs'),
    btnAutoTranslatePhase: doc.getElementById('btnAutoTranslatePhase'),
    btnAutoTranslateText: doc.getElementById('btnAutoTranslateText'),
    phaseActiveLangBadge: doc.getElementById('phaseActiveLangBadge'),
    phaseActiveLangDescBadge: doc.getElementById('phaseActiveLangDescBadge'),

    // Expense Modal
    modalExpenseBackdrop: doc.getElementById('modalExpenseBackdrop'),
    modalExpenseTitle: doc.getElementById('modalExpenseTitle'),
    btnCloseExpenseModal: doc.getElementById('btnCloseExpenseModal'),
    btnCancelExpense: doc.getElementById('btnCancelExpense'),
    formExpense: doc.getElementById('formExpense'),
    expenseEditId: doc.getElementById('expenseEditId'),
    expConcept: doc.getElementById('expConcept'),
    expAmount: doc.getElementById('expAmount'),
    expType: doc.getElementById('expType'),
    expPhasesCheckboxGroup: doc.getElementById('expPhasesCheckboxGroup'),
    expDate: doc.getElementById('expDate'),
    expIsActive: doc.getElementById('expIsActive'),
    expNotes: doc.getElementById('expNotes'),

    // Income Modal
    modalIncomeBackdrop: doc.getElementById('modalIncomeBackdrop'),
    modalIncomeTitle: doc.getElementById('modalIncomeTitle'),
    btnCloseIncomeModal: doc.getElementById('btnCloseIncomeModal'),
    btnCancelIncome: doc.getElementById('btnCancelIncome'),
    formIncome: doc.getElementById('formIncome'),
    incomeEditId: doc.getElementById('incomeEditId'),
    incConcept: doc.getElementById('incConcept'),
    incDate: doc.getElementById('incDate'),
    incSource: doc.getElementById('incSource'),
    incGross: doc.getElementById('incGross'),
    incFee: doc.getElementById('incFee'),
    incTax: doc.getElementById('incTax'),
    incNet: doc.getElementById('incNet'),
    calcPreviewFee: doc.getElementById('calcPreviewFee'),
    calcPreviewTax: doc.getElementById('calcPreviewTax'),
    calcPreviewNet: doc.getElementById('calcPreviewNet'),
    incExtId: doc.getElementById('incExtId'),
    incIsRecurring: doc.getElementById('incIsRecurring'),
    incNotes: doc.getElementById('incNotes'),

    // Delete Modal
    modalDeleteBackdrop: doc.getElementById('modalDeleteBackdrop'),
    btnCloseDeleteModal: doc.getElementById('btnCancelDelete'),
    btnConfirmDelete: doc.getElementById('btnConfirmDelete'),
    deleteConfirmMessage: doc.getElementById('deleteConfirmMessage'),

    // Toast
    toastContainer: doc.getElementById('toastContainer'),
  };

  // ------------------------------------------------------------------
  // Helper Functions
  // ------------------------------------------------------------------
  function t(key) {
    if (!window.XowI18n) return key;
    return window.XowI18n.translate(window.XowI18n.getBrowserLanguage(), key);
  }

  function formatEur(val) {
    var n = Number(val) || 0;
    try {
      return new Intl.NumberFormat(window.XowI18n ? window.XowI18n.getBrowserLanguage() : 'es', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);
    } catch (e) {
      return n.toFixed(2) + ' €';
    }
  }

  function formatMonthYear(date) {
    try {
      return new Intl.DateTimeFormat(window.XowI18n ? window.XowI18n.getBrowserLanguage() : 'es', {
        month: 'long',
        year: 'numeric',
      }).format(date);
    } catch (e) {
      return date.toISOString().slice(0, 7);
    }
  }

  function clamp01(n) {
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function addMonthsClamped(date, months) {
    var y = date.getFullYear();
    var m = date.getMonth();
    var lastDayOfTargetMonth = new Date(y, m + months + 1, 0).getDate();
    var day = Math.min(date.getDate(), lastDayOfTargetMonth);
    return new Date(y, m + months, day);
  }

  function showToast(message, type) {
    if (!el.toastContainer) return;
    var toast = document.createElement('div');
    toast.className = 'xow-toast ' + (type || 'info');
    var icon = type === 'error' ? 'warning' : 'check_circle';
    toast.innerHTML = '<svg class="icon icon-sm"><use href="#i-' + icon + '"></use></svg><span>' + message + '</span>';
    el.toastContainer.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 250);
    }, 4000);
  }

  // ------------------------------------------------------------------
  // Financial Math & Funding Cascade
  // ------------------------------------------------------------------
  function parseDateParts(dateStr) {
    if (!dateStr) return new Date(2026, 0, 1);
    if (dateStr instanceof Date) return dateStr;
    var parts = String(dateStr).split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return new Date(dateStr);
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

      var phaseState;
      if (isCovered) {
        phaseState = 'covered';
      } else if (!activeAssigned) {
        phaseState = 'active';
        activeAssigned = true;
      } else {
        phaseState = 'pending';
      }

      var fundedUntil = null;
      if (phaseState === 'active' && phase.monthlyCostEur > 0) {
        var months = Math.floor(allocated / phase.monthlyCostEur);
        fundedUntil = addMonthsClamped(now, months);
      }

      result.push({
        phase: phase,
        state: phaseState,
        allocatedEur: allocated,
        progress: progress,
        fundedUntil: fundedUntil,
      });
    });

    return result;
  }

  function calculateIncomeNet(gross, source, settings) {
    var g = Math.max(0, Number(gross) || 0);
    if (g <= 0) return { gross: 0, fee: 0, tax: 0, net: 0 };

    if (source === 'founder_investment') {
      return { gross: g, fee: 0, tax: 0, net: g };
    }

    var fee = 0;
    if (source === 'google_play') {
      var googleFeePct = (settings && settings.google_fee_pct != null && !isNaN(Number(settings.google_fee_pct)))
        ? Number(settings.google_fee_pct)
        : 15.0;
      fee = g * (googleFeePct / 100);
    } else if (source === 'apple_appstore') {
      var appleFeePct = (settings && settings.apple_fee_pct != null && !isNaN(Number(settings.apple_fee_pct)))
        ? Number(settings.apple_fee_pct)
        : 15.0;
      fee = g * (appleFeePct / 100);
    } else if (source === 'stripe_web') {
      var stripeFeePct = (settings && settings.stripe_fee_pct != null && !isNaN(Number(settings.stripe_fee_pct)))
        ? Number(settings.stripe_fee_pct)
        : 1.5;
      var stripeFeeFixed = (settings && settings.stripe_fee_fixed_eur != null && !isNaN(Number(settings.stripe_fee_fixed_eur)))
        ? Number(settings.stripe_fee_fixed_eur)
        : 0.25;
      fee = (g * (stripeFeePct / 100)) + stripeFeeFixed;
    }
    fee = Math.round(fee * 100) / 100;

    var afterFee = Math.max(0, g - fee);
    var taxRatePct = (settings && settings.tax_rate_pct != null && !isNaN(Number(settings.tax_rate_pct)))
      ? Number(settings.tax_rate_pct)
      : 19.0;
    var tax = afterFee * (taxRatePct / 100);
    tax = Math.round(tax * 100) / 100;

    var net = Math.max(0, Math.round((afterFee - tax) * 100) / 100);
    return { gross: g, fee: fee, tax: tax, net: net };
  }

  function computeFinancialAggregation(customState, customNow) {
    var st = customState || state;
    var now = customNow || new Date();

    // 1. Incomes sum
    var totalGross = 0;
    var totalNet = 0;
    var totalFees = 0;
    var totalTaxes = 0;

    (st.incomes || []).forEach(function (inc) {
      totalGross += Number(inc.gross_amount_eur) || 0;
      totalNet += Number(inc.net_amount_eur) || 0;
      totalFees += Number(inc.platform_fee_eur) || 0;
      totalTaxes += Number(inc.tax_amount_eur) || 0;
    });

    // 2. Base phases list (generic, sorted by order)
    var rawPhases = (st.phases && st.phases.length) ? st.phases.slice() : [
      { id: 'survival', key: 'survival', name: 'Fase 1: Supervivencia', description: 'Servidores básicos y mantenimiento', order: 1 },
      { id: 'infra', key: 'infra', name: 'Fase 2: Infraestructura', description: 'Almacenamiento escalable R2 y monitorización', order: 2 },
      { id: 'pro', key: 'pro', name: 'Fase 3: Profesionalización', description: 'Equipo dedicado, RGPD y registro de marca', order: 3 },
    ];
    rawPhases.sort(function (a, b) { return (Number(a.order) || 1) - (Number(b.order) || 1); });

    function getApplicablePhases(exp) {
      var p = exp && exp.applicable_phases;
      if (Array.isArray(p)) return p;
      if (typeof p === 'string' && p.trim()) {
        try {
          var parsed = JSON.parse(p);
          if (Array.isArray(parsed)) return parsed;
          return [p.trim()];
        } catch (e) {
          return [p.trim()];
        }
      }
      return rawPhases[0] ? [rawPhases[0].id] : [];
    }

    function expenseAppliesToPhase(exp, ph) {
      var phases = getApplicablePhases(exp);
      if (!phases.length) return false;
      return phases.indexOf(ph.id) !== -1 ||
             (ph.key && phases.indexOf(ph.key) !== -1) ||
             (ph.name && phases.indexOf(ph.name) !== -1);
    }

    var phaseMonthly = {};
    var phaseOneOff = {};
    rawPhases.forEach(function (ph) {
      phaseMonthly[ph.id] = 0;
      phaseOneOff[ph.id] = 0;
    });

    var totalActiveMonthly = 0;
    var totalSpentOneOff = 0;

    (st.expenses || []).forEach(function (exp) {
      var amt = Number(exp.amount_eur) || 0;
      var isActive = exp.is_active !== false;

      rawPhases.forEach(function (ph) {
        if (expenseAppliesToPhase(exp, ph)) {
          if (exp.type === 'monthly') {
            if (isActive) {
              phaseMonthly[ph.id] += amt;
            }
          } else {
            phaseOneOff[ph.id] += amt;
          }
        }
      });

      if (exp.type === 'monthly') {
        if (isActive) totalActiveMonthly += amt;
      } else {
        if (exp.payment_date) {
          var pDate = parseDateParts(exp.payment_date);
          if (pDate <= now) totalSpentOneOff += amt;
        }
      }
    });

    // 3. Dynamic target (bucket) calculation based purely on configured active expenses.
    // Each phase target is 1 year (12 months) of its monthly expenses + one-off expenses for that phase.
    var computedPhases = rawPhases.map(function (ph, idx) {
      var m = phaseMonthly[ph.id] || 0;
      var o = phaseOneOff[ph.id] || 0;
      var bucket = (m * 12) + o;

      var phaseExpensesList = (st.expenses || []).filter(function (exp) {
        if (exp.is_active === false) return false;
        return expenseAppliesToPhase(exp, ph);
      }).map(function (exp) {
        return {
          concept: exp.concept || '',
          amount_eur: Number(exp.amount_eur) || 0,
          type: exp.type || 'monthly',
        };
      });

      var nameMap = parseI18nField(ph.name);
      var descMap = parseI18nField(ph.description || ph.desc);

      var primaryName = (nameMap && (nameMap.es || nameMap.en)) ? (nameMap.es || nameMap.en) : (typeof ph.name === 'string' ? ph.name : ('Fase ' + (idx + 1)));
      var primaryDesc = (descMap && (descMap.es || descMap.en)) ? (descMap.es || descMap.en) : (ph.description || ph.desc || '');

      return {
        id: ph.id,
        key: ph.key || ph.id || ('phase_' + (idx + 1)),
        name: Object.keys(nameMap).length > 0 ? nameMap : primaryName,
        desc: Object.keys(descMap).length > 0 ? descMap : primaryDesc,
        order: Number(ph.order) || (idx + 1),
        monthlyCostEur: m,
        bucketEur: bucket,
        expenses: phaseExpensesList,
      };
    });

    // 4. Spent to date (monthly costs accrued since project_start_date + paid one-off costs)
    var startDate = (st.settings && st.settings.project_start_date)
      ? parseDateParts(st.settings.project_start_date)
      : new Date(2026, 0, 1);
    var monthsPassed = 0;
    if (startDate <= now) {
      monthsPassed = (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth());
      if (monthsPassed < 0) monthsPassed = 0;
    }
    var totalSpent = (totalActiveMonthly * monthsPassed) + totalSpentOneOff;
    var netBalance = Math.max(0, totalNet - totalSpent);

    // 5. Cascade assignment based on current available net money in cash (netBalance).
    var phaseStatuses = computeFundingStatus(computedPhases, netBalance, now);

    // 6. Active runway calculation
    var activePhaseStatus = phaseStatuses.find(function (s) { return s.state === 'active'; });
    var activeMonthlyCost = (activePhaseStatus && activePhaseStatus.phase.monthlyCostEur > 0)
      ? activePhaseStatus.phase.monthlyCostEur
      : totalActiveMonthly;

    var activeAllocated = activePhaseStatus ? activePhaseStatus.allocatedEur : netBalance;
    var runwayMonths = activeMonthlyCost > 0 ? Math.floor(activeAllocated / activeMonthlyCost) : 0;
    var runwayDate = activeMonthlyCost > 0 ? addMonthsClamped(now, runwayMonths) : null;

    return {
      totalGross: totalGross,
      totalNet: totalNet,
      totalFees: totalFees,
      totalTaxes: totalTaxes,
      totalSpent: totalSpent,
      netBalance: netBalance,
      totalActiveMonthly: totalActiveMonthly,
      phases: computedPhases,
      phaseStatuses: phaseStatuses,
      activeMonthlyCost: activeMonthlyCost,
      runwayMonths: runwayMonths,
      runwayDate: runwayDate,
    };
  }

  // ------------------------------------------------------------------
  // UI Rendering
  // ------------------------------------------------------------------
  function renderDashboard() {
    var agg = computeFinancialAggregation();

    // 1. KPIs
    el.kpiGrossValue.textContent = formatEur(agg.totalGross);
    el.kpiNetValue.textContent = formatEur(agg.netBalance);
    el.kpiMonthlyCostValue.textContent = formatEur(agg.totalActiveMonthly) + '/mes';

    if (agg.activeMonthlyCost > 0) {
      el.kpiRunwayValue.textContent = agg.runwayMonths + ' ' + t('admin_months_covered');
      el.kpiRunwaySub.textContent = t('admin_funded_until_prefix') + ' ' + (agg.runwayDate ? formatMonthYear(agg.runwayDate) : '-');
    } else {
      el.kpiRunwayValue.textContent = 'Objetivo puntual';
      el.kpiRunwaySub.textContent = 'Fase activa sin coste recurrente mensual';
    }

    // 2. Phases Cards
    var phasesHtml = '';
    agg.phaseStatuses.forEach(function (st) {
      var badgeKey = 'admin_badge_' + st.state;
      var pct = Math.round(st.progress * 100);

      var badgeClass = st.state === 'covered' ? 'xow-badge-covered'
        : st.state === 'active' ? 'xow-badge-active'
        : 'xow-badge-pending';
      var badgeIcon = st.state === 'covered' ? 'check_circle' : 'schedule';

      var phName = (typeof st.phase.name === 'object' && st.phase.name)
        ? (st.phase.name.es || st.phase.name.en || firstNonEmptyTranslation(st.phase.name) || '-')
        : (st.phase.name || '-');

      var phDesc = (typeof st.phase.desc === 'object' && st.phase.desc)
        ? (st.phase.desc.es || st.phase.desc.en || firstNonEmptyTranslation(st.phase.desc) || '')
        : (st.phase.desc || st.phase.description || '');

      phasesHtml += '<div class="xow-admin-phase-card ' + st.state + '">';
      phasesHtml += '  <div class="xow-admin-phase-head">';
      phasesHtml += '    <div>';
      phasesHtml += '      <div class="xow-admin-phase-name">' + escapeHtml(phName) + '</div>';
      if (phDesc) {
        phasesHtml += '      <div class="xow-admin-phase-desc">' + escapeHtml(phDesc) + '</div>';
      }
      phasesHtml += '    </div>';
      phasesHtml += '    <span class="xow-badge ' + badgeClass + '">';
      phasesHtml += '      <svg class="icon icon-sm"><use href="#i-' + badgeIcon + '"></use></svg>';
      phasesHtml += '      ' + t(badgeKey);
      phasesHtml += '    </span>';
      phasesHtml += '  </div>';

      phasesHtml += '  <div class="xow-progress-track" style="margin-top: 14px;">';
      phasesHtml += '    <div class="xow-progress-fill" style="width: ' + pct + '%;"></div>';
      phasesHtml += '  </div>';

      phasesHtml += '  <div class="xow-admin-phase-progress-info">';
      phasesHtml += '    <span class="xow-admin-phase-allocated">' + formatEur(st.allocatedEur) + ' (' + pct + '%)</span>';
      phasesHtml += '    <span class="xow-admin-phase-target">' + t('admin_target') + ': ' + formatEur(st.phase.bucketEur) + '</span>';
      phasesHtml += '  </div>';

      if (st.state === 'active' && st.fundedUntil && st.phase.monthlyCostEur > 0) {
        phasesHtml += '  <div class="xow-admin-phase-meta">';
        phasesHtml += '    <svg class="icon icon-sm"><use href="#i-schedule"></use></svg>';
        phasesHtml += '    <span>' + t('admin_funded_until_prefix') + ': <strong>' + formatMonthYear(st.fundedUntil) + '</strong></span>';
        phasesHtml += '  </div>';
      }

      phasesHtml += '</div>';
    });
    el.adminPhasesContainer.innerHTML = phasesHtml;

    // 3. Phases Table
    renderPhasesTable(agg);

    // 4. Expenses Table
    renderExpensesTable(agg);

    // 5. Incomes Table
    renderIncomesTable();

    // 6. Settings Form inputs
    renderSettingsForm();

    // 7. Last sync badge
    if (state.publicStatusRecord) {
      var d = new Date(state.publicStatusRecord.updated || state.publicStatusRecord.created);
      el.lastSyncStatusText.textContent = t('admin_last_sync') + ': ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + d.toLocaleDateString() + ')';
    } else {
      el.lastSyncStatusText.textContent = 'Aún no sincronizado en PocketBase';
    }
  }

  function renderPhasesTable(agg) {
    if (!el.phasesTableBody) return;
    var phases = (agg && agg.phases) ? agg.phases : (state.phases || []);
    if (!phases.length) {
      el.phasesTableBody.innerHTML = '';
      if (el.phasesEmptyState) el.phasesEmptyState.hidden = false;
      return;
    }
    if (el.phasesEmptyState) el.phasesEmptyState.hidden = true;

    var rows = '';
    phases.forEach(function (ph) {
      var nameObj = (typeof ph.name === 'object' && ph.name) ? ph.name : parseI18nField(ph.name);
      var descObj = (typeof ph.desc === 'object' && ph.desc) ? ph.desc : ((typeof ph.description === 'object' && ph.description) ? ph.description : parseI18nField(ph.description || ph.desc));

      var nameText = (nameObj && (nameObj.es || nameObj.en || firstNonEmptyTranslation(nameObj))) || ph.name || '-';
      var descText = (descObj && (descObj.es || descObj.en || firstNonEmptyTranslation(descObj))) || ph.description || ph.desc || '-';

      var langCount = Object.keys(nameObj || {}).length;
      var langBadge = langCount > 1 ? ' <span class="xow-badge" style="font-size:11px; padding: 2px 6px;">' + langCount + ' idiomas</span>' : '';

      rows += '<tr>';
      rows += '  <td><span class="xow-badge" style="font-weight: 700;">#' + (ph.order || 1) + '</span></td>';
      rows += '  <td><strong>' + escapeHtml(nameText) + '</strong>' + langBadge + '</td>';
      rows += '  <td><span style="color: var(--text-muted); font-size: 13px;">' + escapeHtml(descText) + '</span></td>';
      rows += '  <td class="cell-num">' + formatEur(ph.monthlyCostEur || 0) + '/mes</td>';
      rows += '  <td class="cell-num" style="color: var(--teal-accent); font-weight: 700;">' + formatEur(ph.bucketEur || 0) + '</td>';
      rows += '  <td>';
      rows += '    <div class="cell-actions">';
      rows += '      <button type="button" class="xow-btn-icon" data-phase-edit-id="' + ph.id + '" title="' + t('admin_btn_edit') + '">';
      rows += '        <svg class="icon icon-sm"><use href="#i-edit"></use></svg>';
      rows += '      </button>';
      rows += '      <button type="button" class="xow-btn-icon danger" data-phase-delete-id="' + ph.id + '" title="' + t('admin_btn_delete') + '">';
      rows += '        <svg class="icon icon-sm"><use href="#i-delete"></use></svg>';
      rows += '      </button>';
      rows += '    </div>';
      rows += '  </td>';
      rows += '</tr>';
    });
    el.phasesTableBody.innerHTML = rows;
  }

  function renderExpensesTable(agg) {
    if (!el.expensesTableBody) return;
    if (!state.expenses.length) {
      el.expensesTableBody.innerHTML = '';
      el.expensesEmptyState.hidden = false;
      return;
    }
    el.expensesEmptyState.hidden = true;

    var phasesMap = {};
    var currentPhases = (agg && agg.phases) ? agg.phases : (state.phases || []);
    currentPhases.forEach(function (p) {
      phasesMap[p.id] = p.name;
      if (p.key) phasesMap[p.key] = p.name;
    });

    var rows = '';
    state.expenses.forEach(function (exp) {
      var phases = Array.isArray(exp.applicable_phases) ? exp.applicable_phases : ['survival'];
      var phaseBadges = phases.map(function (p) {
        var lbl = phasesMap[p] || (p === 'survival' ? 'Fase 1' : p === 'infra' ? 'Fase 2' : p === 'pro' ? 'Fase 3' : p);
        return '<span class="xow-badge" style="font-size: 11px; padding: 2px 6px;">' + escapeHtml(lbl) + '</span>';
      }).join(' ');

      var typeBadge = exp.type === 'monthly'
        ? '<span class="xow-badge" style="color: var(--teal-accent);">' + t('admin_type_monthly') + '</span>'
        : '<span class="xow-badge" style="color: var(--text-muted);">' + t('admin_type_one_off') + '</span>';

      var statusChecked = exp.is_active !== false ? 'checked' : '';
      var activeLabel = exp.is_active !== false
        ? '<span style="color: #22c55e; font-size: 12px; font-weight: 600;">Activo</span>'
        : '<span style="color: var(--text-muted); font-size: 12px;">Inactivo</span>';

      rows += '<tr>';
      rows += '  <td><strong>' + escapeHtml(exp.concept || '-') + '</strong></td>';
      rows += '  <td>' + typeBadge + '</td>';
      rows += '  <td>' + phaseBadges + '</td>';
      rows += '  <td>' + (exp.payment_date || '-') + '</td>';
      rows += '  <td class="cell-num">' + formatEur(exp.amount_eur) + '</td>';
      rows += '  <td>';
      rows += '    <label class="xow-checkbox-pill" style="padding: 3px 8px; font-size: 11px;">';
      rows += '      <input type="checkbox" data-expense-toggle-id="' + exp.id + '" ' + statusChecked + '>';
      rows += '      ' + activeLabel;
      rows += '    </label>';
      rows += '  </td>';
      rows += '  <td>';
      rows += '    <div class="cell-actions">';
      rows += '      <button type="button" class="xow-btn-icon" data-expense-edit-id="' + exp.id + '" title="' + t('admin_btn_edit') + '">';
      rows += '        <svg class="icon icon-sm"><use href="#i-edit"></use></svg>';
      rows += '      </button>';
      rows += '      <button type="button" class="xow-btn-icon danger" data-expense-delete-id="' + exp.id + '" title="' + t('admin_btn_delete') + '">';
      rows += '        <svg class="icon icon-sm"><use href="#i-delete"></use></svg>';
      rows += '      </button>';
      rows += '    </div>';
      rows += '  </td>';
      rows += '</tr>';
    });
    el.expensesTableBody.innerHTML = rows;
  }

  function renderIncomesTable() {
    if (!el.incomesTableBody) return;
    if (!state.incomes.length) {
      el.incomesTableBody.innerHTML = '';
      el.incomesEmptyState.hidden = false;
      return;
    }
    el.incomesEmptyState.hidden = true;

    var sourceLabels = {
      founder_investment: 'Inversión propia',
      google_play: 'Google Play',
      apple_appstore: 'App Store',
      stripe_web: 'Stripe Web',
    };

    var rows = '';
    state.incomes.forEach(function (inc) {
      var srcLabel = sourceLabels[inc.source] || inc.source || '-';
      var srcColor = inc.source === 'founder_investment' ? 'var(--indigo-accent)' : 'var(--teal-accent)';

      rows += '<tr>';
      rows += '  <td>' + (inc.date || '-') + '</td>';
      rows += '  <td><strong>' + escapeHtml(inc.concept || '-') + '</strong></td>';
      rows += '  <td><span class="xow-badge" style="color: ' + srcColor + ';">' + srcLabel + '</span></td>';
      rows += '  <td class="cell-num">' + formatEur(inc.gross_amount_eur) + '</td>';
      rows += '  <td class="cell-num" style="color: var(--text-muted);">' + formatEur(inc.platform_fee_eur) + '</td>';
      rows += '  <td class="cell-num" style="color: var(--text-muted);">' + formatEur(inc.tax_amount_eur) + '</td>';
      rows += '  <td class="cell-num" style="color: var(--teal-accent); font-weight: 700;">' + formatEur(inc.net_amount_eur) + '</td>';
      rows += '  <td>';
      rows += '    <div class="cell-actions">';
      rows += '      <button type="button" class="xow-btn-icon" data-income-edit-id="' + inc.id + '" title="' + t('admin_btn_edit') + '">';
      rows += '        <svg class="icon icon-sm"><use href="#i-edit"></use></svg>';
      rows += '      </button>';
      rows += '      <button type="button" class="xow-btn-icon danger" data-income-delete-id="' + inc.id + '" title="' + t('admin_btn_delete') + '">';
      rows += '        <svg class="icon icon-sm"><use href="#i-delete"></use></svg>';
      rows += '      </button>';
      rows += '    </div>';
      rows += '  </td>';
      rows += '</tr>';
    });
    el.incomesTableBody.innerHTML = rows;
  }

  function renderSettingsForm() {
    var s = state.settings;
    if (el.setStartDate) el.setStartDate.value = s.project_start_date || '2026-01-01';
    if (el.setCurrency) el.setCurrency.value = s.currency || 'EUR';
    if (el.setGoogleFee) el.setGoogleFee.value = s.google_fee_pct != null ? s.google_fee_pct : 15.0;
    if (el.setAppleFee) el.setAppleFee.value = s.apple_fee_pct != null ? s.apple_fee_pct : 15.0;
    if (el.setStripePct) el.setStripePct.value = s.stripe_fee_pct != null ? s.stripe_fee_pct : 1.5;
    if (el.setStripeFixed) el.setStripeFixed.value = s.stripe_fee_fixed_eur != null ? s.stripe_fee_fixed_eur : 0.25;
    if (el.setTaxRate) el.setTaxRate.value = s.tax_rate_pct != null ? s.tax_rate_pct : 19.0;
  }

  function renderExpensePhaseCheckboxes(selectedPhases) {
    if (!el.expPhasesCheckboxGroup) return;
    var phases = (state.phases && state.phases.length) ? state.phases.slice() : [
      { id: 'survival', key: 'survival', name: 'Fase 1: Supervivencia', order: 1 },
      { id: 'infra', key: 'infra', name: 'Fase 2: Infraestructura', order: 2 },
      { id: 'pro', key: 'pro', name: 'Fase 3: Profesionalización', order: 3 },
    ];
    phases.sort(function (a, b) { return (Number(a.order) || 1) - (Number(b.order) || 1); });

    var selected = Array.isArray(selectedPhases) ? selectedPhases : [phases[0].id];
    var html = '';
    phases.forEach(function (ph) {
      var isChecked = selected.indexOf(ph.id) !== -1 || (ph.key && selected.indexOf(ph.key) !== -1);
      html += '<label class="xow-checkbox-pill">';
      html += '  <input type="checkbox" name="applicable_phases" value="' + ph.id + '" ' + (isChecked ? 'checked' : '') + '>';
      html += '  <span>' + escapeHtml(ph.name) + '</span>';
      html += '</label>';
    });
    el.expPhasesCheckboxGroup.innerHTML = html;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ------------------------------------------------------------------
  // Data Fetching & Synchronization
  // ------------------------------------------------------------------
  function loadAllData() {
    var pSettings = pb.collection(SETTINGS_COLLECTION).getFullList({ sort: '-created' })
      .then(function (list) {
        if (list && list.length) {
          state.settings = Object.assign({}, state.settings, list[0]);
        }
      })
      .catch(function () { /* use default settings */ });

    var pPhases = pb.collection(PHASES_COLLECTION).getFullList({ sort: 'order,created' })
      .then(function (list) {
        if (list && list.length) {
          state.phases = list;
        } else {
          // If collection is empty, seed defaults
          return seedDefaultPhases();
        }
      })
      .catch(function () {
        state.phases = [
          { id: 'survival', key: 'survival', name: 'Fase 1: Supervivencia', description: 'Servidores básicos y mantenimiento', order: 1 },
          { id: 'infra', key: 'infra', name: 'Fase 2: Infraestructura', description: 'Almacenamiento escalable R2 y monitorización', order: 2 },
          { id: 'pro', key: 'pro', name: 'Fase 3: Profesionalización', description: 'Equipo dedicado, RGPD y registro de marca', order: 3 },
        ];
      });

    var pExpenses = pb.collection(EXPENSES_COLLECTION).getFullList({ sort: '-created' })
      .then(function (list) {
        state.expenses = list || [];
      })
      .catch(function () { state.expenses = []; });

    var pIncomes = pb.collection(INCOMES_COLLECTION).getFullList({ sort: '-date,-created' })
      .then(function (list) {
        state.incomes = list || [];
      })
      .catch(function () { state.incomes = []; });

    var pPublic = pb.collection(PUBLIC_STATUS_COLLECTION).getFullList({ sort: '-created', perPage: 1 })
      .then(function (list) {
        state.publicStatusRecord = (list && list.length) ? list[0] : null;
      })
      .catch(function () { state.publicStatusRecord = null; });

    return Promise.all([pSettings, pPhases, pExpenses, pIncomes, pPublic])
      .then(function () {
        renderDashboard();
      })
      .catch(function (err) {
        console.error('Error loading admin data:', err);
        showToast('Error cargando los datos de PocketBase', 'error');
      });
  }

  function seedDefaultPhases() {
    var defaults = [
      { name: 'Fase 1: Supervivencia', description: 'Servidores básicos, dominio y mantenimiento', order: 1, key: 'survival', is_active: true },
      { name: 'Fase 2: Infraestructura', description: 'Almacenamiento escalable R2/Minio y monitorización', order: 2, key: 'infra', is_active: true },
      { name: 'Fase 3: Profesionalización', description: 'Equipo dedicado, RGPD, registro de marca y asesoría', order: 3, key: 'pro', is_active: true },
    ];
    var promises = defaults.map(function (item) {
      return pb.collection(PHASES_COLLECTION).create(item).catch(function () { return item; });
    });
    return Promise.all(promises).then(function (createdList) {
      state.phases = createdList;
    });
  }

  function syncAndPublish() {
    if (state.isSyncing) return;
    state.isSyncing = true;
    el.btnSyncPublic.disabled = true;

    var agg = computeFinancialAggregation();
    var payload = {
      total_raised_eur: agg.totalNet,
      phases: agg.phaseStatuses.map(function (st) {
        return {
          id: st.phase.id,
          key: st.phase.key,
          name: st.phase.name,
          desc: st.phase.desc,
          order: st.phase.order,
          monthly_cost_eur: st.phase.monthlyCostEur,
          bucket_eur: st.phase.bucketEur,
          allocated_eur: st.allocatedEur,
          progress: st.progress,
          state: st.state,
          funded_until: st.fundedUntil ? st.fundedUntil.toISOString() : null,
          expenses: st.phase.expenses || [],
        };
      }),
      is_placeholder: false,
      notes: 'Sincronizado desde panel admin el ' + new Date().toLocaleString(),
    };

    var promise;
    if (state.publicStatusRecord && state.publicStatusRecord.id) {
      promise = pb.collection(PUBLIC_STATUS_COLLECTION).update(state.publicStatusRecord.id, payload);
    } else {
      promise = pb.collection(PUBLIC_STATUS_COLLECTION).create(payload);
    }

    promise
      .then(function (record) {
        state.publicStatusRecord = record;
        showToast(t('admin_sync_success'), 'success');
        renderDashboard();
      })
      .catch(function (err) {
        console.error('Sync failed:', err);
        showToast(t('admin_sync_error'), 'error');
      })
      .finally(function () {
        state.isSyncing = false;
        el.btnSyncPublic.disabled = false;
      });
  }

  // ------------------------------------------------------------------
  // Real-Time Calculation for Income Modal
  // ------------------------------------------------------------------
  function updateIncomeModalCalc() {
    var gross = Number(el.incGross.value) || 0;
    var source = el.incSource.value;
    var calc = calculateIncomeNet(gross, source, state.settings);

    el.calcPreviewFee.textContent = formatEur(calc.fee);
    el.calcPreviewTax.textContent = formatEur(calc.tax);
    el.calcPreviewNet.textContent = formatEur(calc.net);

    el.incFee.value = calc.fee;
    el.incTax.value = calc.tax;
    el.incNet.value = calc.net;
  }

  // ------------------------------------------------------------------
  // Modal Handlers (Phases & Expenses & Incomes & Delete)
  // ------------------------------------------------------------------
  var currentPhaseLang = 'es';
  var phaseTranslations = { name: {}, description: {} };
  // Stable identifier for the phase being edited, independent of the UI language tab. Kept
  // separate from `phaseTranslations` because it must survive even when every visible name
  // input is blank (see openPhaseModal / the phase form submit handler below). Without this,
  // every admin-created/edited phase lost its `key` on save (the payload never included one),
  // so both the public website and the app fell back to the phase's raw PocketBase record id
  // as its "name" -- the reported unreadable code that doesn't change with language.
  var currentPhaseKey = '';

  // Finds the first genuinely non-empty translation in an i18n map, in insertion order.
  // Object.values(map)[0] is NOT good enough here: a partially-filled map (e.g. some languages
  // saved as an empty string by a failed/partial auto-translate) can have its *first* key be
  // empty while a later one holds real text, which silently produced blank-content saves.
  function firstNonEmptyTranslation(map) {
    if (!map) return '';
    var found = Object.keys(map).map(function (k) { return map[k]; }).find(function (v) {
      return !!(v && String(v).trim());
    });
    return found || '';
  }

  // Deterministic, human-readable slug for a phase's `key` field, derived from its name so it
  // stays stable across re-saves (unlike falling back to the auto-generated record id).
  function slugifyPhaseKey(text) {
    var base = String(text || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return base || '';
  }

  function parseI18nField(field) {
    if (!field) return {};
    if (typeof field === 'object' && !Array.isArray(field)) return field;
    if (typeof field === 'string') {
      var trimmed = field.trim();
      if (trimmed.indexOf('{') === 0 && trimmed.lastIndexOf('}') === (trimmed.length - 1)) {
        try {
          var parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object') return parsed;
        } catch (e) {}
      }
      return { es: trimmed };
    }
    return {};
  }

  function updatePhaseLangUI() {
    if (!el.phaseName || !el.phaseDesc) return;
    el.phaseName.value = phaseTranslations.name[currentPhaseLang] || '';
    el.phaseDesc.value = phaseTranslations.description[currentPhaseLang] || '';

    if (el.phaseActiveLangBadge) el.phaseActiveLangBadge.textContent = currentPhaseLang.toUpperCase();
    if (el.phaseActiveLangDescBadge) el.phaseActiveLangDescBadge.textContent = currentPhaseLang.toUpperCase();

    if (el.phaseLangTabs) {
      el.phaseLangTabs.querySelectorAll('.xow-lang-tab').forEach(function (tab) {
        var lang = tab.getAttribute('data-phase-lang');
        var isActive = lang === currentPhaseLang;
        tab.classList.toggle('is-active', isActive);

        var hasContent = !!(phaseTranslations.name[lang] || phaseTranslations.description[lang]);
        tab.classList.toggle('has-content', hasContent);
      });
    }
  }

  function saveCurrentPhaseInputsToLang() {
    if (!el.phaseName || !el.phaseDesc) return;
    var nameVal = el.phaseName.value.trim();
    var descVal = el.phaseDesc.value.trim();
    if (nameVal) phaseTranslations.name[currentPhaseLang] = nameVal;
    else delete phaseTranslations.name[currentPhaseLang];

    if (descVal) phaseTranslations.description[currentPhaseLang] = descVal;
    else delete phaseTranslations.description[currentPhaseLang];
  }

  function openPhaseModal(phase) {
    if (!el.formPhase) return;
    el.formPhase.reset();
    currentPhaseLang = 'es';

    if (phase) {
      el.modalPhaseTitle.textContent = t('admin_modal_phase_edit');
      el.phaseEditId.value = phase.id;
      el.phaseOrder.value = phase.order || 1;

      var nameMap = parseI18nField(phase.name);
      var descMap = parseI18nField(phase.description || phase.desc);

      if (Object.keys(nameMap).length === 0 && phase.name) {
        nameMap.es = String(phase.name);
      }
      if (Object.keys(descMap).length === 0 && (phase.description || phase.desc)) {
        descMap.es = String(phase.description || phase.desc);
      }

      phaseTranslations = {
        name: Object.assign({}, nameMap),
        description: Object.assign({}, descMap),
      };
      // Preserve the phase's existing key so re-saving it doesn't lose it. If it never had
      // one (legacy data from before keys were tracked), leave it blank -- the submit handler
      // below derives a stable slug from the name instead of falling back to the record id.
      currentPhaseKey = (phase.key && String(phase.key).trim()) || '';
    } else {
      el.modalPhaseTitle.textContent = t('admin_modal_phase_create');
      el.phaseEditId.value = '';
      el.phaseOrder.value = (state.phases.length + 1);
      phaseTranslations = {
        name: {},
        description: {},
      };
      currentPhaseKey = '';
    }

    updatePhaseLangUI();
    el.modalPhaseBackdrop.classList.add('open');
  }

  function closePhaseModal() {
    if (el.modalPhaseBackdrop) el.modalPhaseBackdrop.classList.remove('open');
  }

  function openExpenseModal(expense) {
    el.formExpense.reset();
    if (expense) {
      el.modalExpenseTitle.textContent = t('admin_modal_expense_edit');
      el.expenseEditId.value = expense.id;
      el.expConcept.value = expense.concept || '';
      el.expAmount.value = expense.amount_eur || '';
      el.expType.value = expense.type || 'monthly';
      el.expDate.value = expense.payment_date || '';
      el.expIsActive.checked = expense.is_active !== false;
      el.expNotes.value = expense.notes || '';
      renderExpensePhaseCheckboxes(expense.applicable_phases);
    } else {
      el.modalExpenseTitle.textContent = t('admin_modal_expense_create');
      el.expenseEditId.value = '';
      el.expDate.value = new Date().toISOString().slice(0, 10);
      el.expIsActive.checked = true;
      renderExpensePhaseCheckboxes(null);
    }
    el.modalExpenseBackdrop.classList.add('open');
  }

  function closeExpenseModal() {
    el.modalExpenseBackdrop.classList.remove('open');
  }

  function openIncomeModal(income) {
    el.formIncome.reset();
    if (income) {
      el.modalIncomeTitle.textContent = t('admin_modal_income_edit');
      el.incomeEditId.value = income.id;
      el.incConcept.value = income.concept || '';
      el.incDate.value = income.date || '';
      el.incSource.value = income.source || 'founder_investment';
      el.incGross.value = income.gross_amount_eur || '';
      el.incExtId.value = income.external_id || '';
      el.incIsRecurring.checked = !!income.is_recurring;
      el.incNotes.value = income.notes || '';
    } else {
      el.modalIncomeTitle.textContent = t('admin_modal_income_create');
      el.incomeEditId.value = '';
      el.incDate.value = new Date().toISOString().slice(0, 10);
      el.incSource.value = 'founder_investment';
      el.incGross.value = '';
      el.incIsRecurring.checked = false;
    }
    updateIncomeModalCalc();
    el.modalIncomeBackdrop.classList.add('open');
  }

  function closeIncomeModal() {
    el.modalIncomeBackdrop.classList.remove('open');
  }

  function openDeleteModal(type, id, name) {
    state.deleteTarget = { type: type, id: id, name: name };
    el.deleteConfirmMessage.textContent = '¿Eliminar "' + name + '"? Esta acción no se puede deshacer.';
    el.modalDeleteBackdrop.classList.add('open');
  }

  function closeDeleteModal() {
    state.deleteTarget = null;
    el.modalDeleteBackdrop.classList.remove('open');
  }

  // ------------------------------------------------------------------
  // Event Listeners Setup
  // ------------------------------------------------------------------
  function setupEvents() {
    // 1. Login Form Submit
    el.loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      el.loginError.textContent = '';
      el.loginSubmitBtn.disabled = true;
      el.emailInput.disabled = true;
      el.passwordInput.disabled = true;

      pb.collection(cfg.adminCollection || 'web_admins').authWithPassword(el.emailInput.value.trim(), el.passwordInput.value)
        .then(function () {
          showDashboardView();
        })
        .catch(function (err) {
          var status = err && err.status;
          el.loginError.textContent = (status === 400 || status === 401 || status === 403)
            ? t('admin_error_invalid')
            : t('admin_error_generic');
        })
        .finally(function () {
          el.loginSubmitBtn.disabled = false;
          el.emailInput.disabled = false;
          el.passwordInput.disabled = false;
        });
    });

    // 2. Logout Button
    el.adminLogoutBtn.addEventListener('click', function () {
      pb.authStore.clear();
      showLoginView();
    });

    // 3. Tabs Switching
    var tabButtons = [el.tabBtnExpenses, el.tabBtnPhases, el.tabBtnIncomes, el.tabBtnSettings].filter(Boolean);
    var tabPanels = [el.panelExpenses, el.panelPhases, el.panelIncomes, el.panelSettings].filter(Boolean);

    tabButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetTab = btn.getAttribute('data-tab');
        tabButtons.forEach(function (b) {
          var isActive = b === btn;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        tabPanels.forEach(function (panel) {
          var isTarget = panel.id.toLowerCase().indexOf(targetTab) !== -1;
          panel.classList.toggle('active', isTarget);
        });
      });
    });

    // 4. Modal Open/Close Buttons & Phase Translation Events
    if (el.phaseLangTabs) {
      el.phaseLangTabs.addEventListener('click', function (e) {
        var tab = e.target.closest('.xow-lang-tab');
        if (!tab) return;
        saveCurrentPhaseInputsToLang();
        currentPhaseLang = tab.getAttribute('data-phase-lang') || 'es';
        updatePhaseLangUI();
      });
    }

    var TARGET_LANGS = ['es', 'en', 'ca', 'fr', 'it', 'de', 'ro', 'pt'];

    function translateSingleClient(text, fromLang, toLang) {
      if (!text || fromLang === toLang) return Promise.resolve(text);
      var url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) +
        '&langpair=' + encodeURIComponent(fromLang) + '|' + encodeURIComponent(toLang);
      return fetch(url)
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.responseData && data.responseData.translatedText) {
            var t = data.responseData.translatedText.trim();
            if (t && t.indexOf('MYMEMORY WARNING') === -1) return t;
          }
          return text;
        })
        .catch(function () { return text; });
    }

    function autoTranslateClientSide(fromLang, sourceName, sourceDesc) {
      var promises = TARGET_LANGS.map(function (lang) {
        if (lang === fromLang) return Promise.resolve();
        var pName = sourceName ? translateSingleClient(sourceName, fromLang, lang) : Promise.resolve('');
        var pDesc = sourceDesc ? translateSingleClient(sourceDesc, fromLang, lang) : Promise.resolve('');
        return Promise.all([pName, pDesc]).then(function (res) {
          if (res[0] && res[0].trim()) phaseTranslations.name[lang] = res[0].trim();
          if (res[1] && res[1].trim()) phaseTranslations.description[lang] = res[1].trim();
        });
      });
      return Promise.all(promises);
    }

    if (el.btnAutoTranslatePhase) {
      el.btnAutoTranslatePhase.addEventListener('click', function () {
        saveCurrentPhaseInputsToLang();

        var sourceName = (el.phaseName ? el.phaseName.value.trim() : '') || phaseTranslations.name[currentPhaseLang] || phaseTranslations.name.es || phaseTranslations.name.en || '';
        var sourceDesc = (el.phaseDesc ? el.phaseDesc.value.trim() : '') || phaseTranslations.description[currentPhaseLang] || phaseTranslations.description.es || phaseTranslations.description.en || '';

        if (!sourceName && !sourceDesc) {
          showToast('Escribe al menos el nombre en un idioma para auto-traducir', 'error');
          return;
        }

        // El texto origen NUNCA se borra ni se sobreescribe con vacío
        phaseTranslations.name[currentPhaseLang] = sourceName;
        if (sourceDesc) phaseTranslations.description[currentPhaseLang] = sourceDesc;

        var btnText = el.btnAutoTranslateText;
        if (btnText) btnText.textContent = 'Traduciendo...';
        el.btnAutoTranslatePhase.disabled = true;

        var token = pb.authStore && pb.authStore.token ? pb.authStore.token : '';

        fetch(cfg.pocketbaseUrl.replace(/\/$/, '') + '/api/xow/translate-phase', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? ('Bearer ' + token) : '',
          },
          body: JSON.stringify({
            from: currentPhaseLang,
            texts: {
              name: sourceName,
              description: sourceDesc,
            },
          }),
        })
          .then(function (res) {
            if (!res.ok) throw new Error('Backend hook fallback');
            return res.json();
          })
          .then(function (data) {
            var hasOtherTranslations = false;
            if (data && data.name) {
              Object.keys(data.name).forEach(function (k) {
                var val = data.name[k];
                if (val && typeof val === 'string' && val.trim()) {
                  phaseTranslations.name[k] = val.trim();
                  if (k !== currentPhaseLang) hasOtherTranslations = true;
                }
              });
            }
            if (data && data.description) {
              Object.keys(data.description).forEach(function (k) {
                var val = data.description[k];
                if (val && typeof val === 'string' && val.trim()) {
                  phaseTranslations.description[k] = val.trim();
                }
              });
            }

            if (!hasOtherTranslations) {
              return autoTranslateClientSide(currentPhaseLang, sourceName, sourceDesc);
            }
          })
          .catch(function () {
            return autoTranslateClientSide(currentPhaseLang, sourceName, sourceDesc);
          })
          .then(function () {
            // Asegurar que ningún idioma quede vacío
            TARGET_LANGS.forEach(function (lang) {
              if (!phaseTranslations.name[lang] && sourceName) {
                phaseTranslations.name[lang] = sourceName;
              }
              if (!phaseTranslations.description[lang] && sourceDesc) {
                phaseTranslations.description[lang] = sourceDesc;
              }
            });

            updatePhaseLangUI();
            showToast('✨ Traducciones generadas con éxito en los 8 idiomas', 'success');
          })
          .catch(function (err) {
            console.error('Auto-translate error:', err);
            updatePhaseLangUI();
            showToast('Traducción completada con fallback', 'success');
          })
          .finally(function () {
            if (btnText) btnText.textContent = '✨ Auto-traducir con IA';
            el.btnAutoTranslatePhase.disabled = false;
          });
      });
    }

    if (el.btnOpenAddPhaseModal) {
      el.btnOpenAddPhaseModal.addEventListener('click', function () { openPhaseModal(null); });
    }
    if (el.btnClosePhaseModal) el.btnClosePhaseModal.addEventListener('click', closePhaseModal);
    if (el.btnCancelPhase) el.btnCancelPhase.addEventListener('click', closePhaseModal);

    el.btnOpenAddExpenseModal.addEventListener('click', function () { openExpenseModal(null); });
    el.btnCloseExpenseModal.addEventListener('click', closeExpenseModal);
    el.btnCancelExpense.addEventListener('click', closeExpenseModal);

    el.btnOpenAddIncomeModal.addEventListener('click', function () { openIncomeModal(null); });
    el.btnCloseIncomeModal.addEventListener('click', closeIncomeModal);
    el.btnCancelIncome.addEventListener('click', closeIncomeModal);

    el.btnCloseDeleteModal.addEventListener('click', closeDeleteModal);

    // 5. Live Calculation listeners in Income Modal
    el.incGross.addEventListener('input', updateIncomeModalCalc);
    el.incSource.addEventListener('change', updateIncomeModalCalc);

    // 6. Phase Form Submit (Create / Update)
    if (el.formPhase) {
      el.formPhase.addEventListener('submit', function (e) {
        e.preventDefault();
        saveCurrentPhaseInputsToLang();

        var id = el.phaseEditId.value;
        var currentInputName = el.phaseName ? el.phaseName.value.trim() : '';
        var currentInputDesc = el.phaseDesc ? el.phaseDesc.value.trim() : '';

        if (currentInputName && !phaseTranslations.name[currentPhaseLang]) {
          phaseTranslations.name[currentPhaseLang] = currentInputName;
        }
        if (currentInputDesc && !phaseTranslations.description[currentPhaseLang]) {
          phaseTranslations.description[currentPhaseLang] = currentInputDesc;
        }

        // firstNonEmptyTranslation (not Object.values(...)[0]) because a partially-filled map
        // can have an empty string as its *first* key (e.g. left behind by a failed per-language
        // translation call) while a later key holds the real text -- picking index 0 blindly
        // was how a phase could end up saved with no readable name in any language.
        var primaryName = phaseTranslations.name[currentPhaseLang] || phaseTranslations.name.es || phaseTranslations.name.en || firstNonEmptyTranslation(phaseTranslations.name) || currentInputName;
        var primaryDesc = phaseTranslations.description[currentPhaseLang] || phaseTranslations.description.es || phaseTranslations.description.en || firstNonEmptyTranslation(phaseTranslations.description) || currentInputDesc;

        if (!primaryName) {
          showToast('La fase necesita un nombre en al menos un idioma antes de guardar', 'error');
          return;
        }

        // Si solo se introdujo en 1 idioma o faltan otros, poblar los 8 idiomas con el texto introducido
        TARGET_LANGS.forEach(function (lang) {
          if (!phaseTranslations.name[lang] && primaryName) {
            phaseTranslations.name[lang] = primaryName;
          }
          if (!phaseTranslations.description[lang] && primaryDesc) {
            phaseTranslations.description[lang] = primaryDesc;
          }
        });

        var namePayload = JSON.stringify(phaseTranslations.name);
        var descPayload = JSON.stringify(phaseTranslations.description);

        // Always send a stable, human-derived key: preserve the one the phase already had
        // (set when opening the edit modal), or derive a fresh slug from its name. Without
        // this, every admin-saved phase left `key` unset, so both the public website and the
        // app fell back to the phase's raw PocketBase record id as its displayed "name".
        var phaseKey = currentPhaseKey || slugifyPhaseKey(primaryName) || ('phase_' + Date.now().toString(36));
        currentPhaseKey = phaseKey;

        var data = {
          order: Number(el.phaseOrder.value) || 1,
          name: namePayload,
          description: descPayload,
          key: phaseKey,
          is_active: true,
        };

        var promise = id
          ? pb.collection(PHASES_COLLECTION).update(id, data)
          : pb.collection(PHASES_COLLECTION).create(data);

        promise
          .then(function (record) {
            if (id) {
              var idx = state.phases.findIndex(function (x) { return x.id === id; });
              if (idx !== -1) state.phases[idx] = record;
            } else {
              state.phases.push(record);
            }
            state.phases.sort(function (a, b) { return (Number(a.order) || 1) - (Number(b.order) || 1); });
            closePhaseModal();
            renderDashboard();
            showToast('Fase guardada con éxito', 'success');
          })
          .catch(function (err) {
            console.error('Save phase failed:', err);
            showToast('Error al guardar la fase', 'error');
          });
      });
    }

    // 7. Expense Form Submit (Create / Update)
    el.formExpense.addEventListener('submit', function (e) {
      e.preventDefault();
      var id = el.expenseEditId.value;
      var selectedPhases = [];
      document.querySelectorAll('#formExpense input[name="applicable_phases"]:checked').forEach(function (cb) {
        selectedPhases.push(cb.value);
      });

      var data = {
        concept: el.expConcept.value.trim(),
        amount_eur: Number(el.expAmount.value) || 0,
        type: el.expType.value,
        applicable_phases: selectedPhases,
        payment_date: el.expDate.value || '',
        is_active: el.expIsActive.checked,
        notes: el.expNotes.value.trim(),
      };

      var promise = id
        ? pb.collection(EXPENSES_COLLECTION).update(id, data)
        : pb.collection(EXPENSES_COLLECTION).create(data);

      promise
        .then(function (record) {
          if (id) {
            var idx = state.expenses.findIndex(function (x) { return x.id === id; });
            if (idx !== -1) state.expenses[idx] = record;
          } else {
            state.expenses.unshift(record);
          }
          closeExpenseModal();
          renderDashboard();
          showToast('Gasto guardado con éxito', 'success');
        })
        .catch(function (err) {
          console.error('Save expense failed:', err);
          showToast('Error al guardar el gasto', 'error');
        });
    });

    // 8. Income Form Submit (Create / Update)
    el.formIncome.addEventListener('submit', function (e) {
      e.preventDefault();
      var id = el.incomeEditId.value;
      var gross = Number(el.incGross.value) || 0;
      var source = el.incSource.value;
      var calc = calculateIncomeNet(gross, source, state.settings);

      var data = {
        concept: el.incConcept.value.trim(),
        date: el.incDate.value || new Date().toISOString().slice(0, 10),
        source: source,
        gross_amount_eur: calc.gross,
        platform_fee_eur: calc.fee,
        tax_amount_eur: calc.tax,
        net_amount_eur: calc.net,
        is_recurring: el.incIsRecurring.checked,
        external_id: el.incExtId.value.trim(),
        notes: el.incNotes.value.trim(),
      };

      var promise = id
        ? pb.collection(INCOMES_COLLECTION).update(id, data)
        : pb.collection(INCOMES_COLLECTION).create(data);

      promise
        .then(function (record) {
          if (id) {
            var idx = state.incomes.findIndex(function (x) { return x.id === id; });
            if (idx !== -1) state.incomes[idx] = record;
          } else {
            state.incomes.unshift(record);
          }
          closeIncomeModal();
          renderDashboard();
          showToast('Ingreso guardado con éxito', 'success');
        })
        .catch(function (err) {
          console.error('Save income failed:', err);
          showToast('Error al guardar el ingreso', 'error');
        });
    });

    // 9. Delete Confirmation Execution
    el.btnConfirmDelete.addEventListener('click', function () {
      if (!state.deleteTarget) return;
      var target = state.deleteTarget;
      var col = target.type === 'expense' ? EXPENSES_COLLECTION
        : target.type === 'phase' ? PHASES_COLLECTION
        : INCOMES_COLLECTION;

      pb.collection(col).delete(target.id)
        .then(function () {
          if (target.type === 'expense') {
            state.expenses = state.expenses.filter(function (x) { return x.id !== target.id; });
          } else if (target.type === 'phase') {
            state.phases = state.phases.filter(function (x) { return x.id !== target.id; });
          } else {
            state.incomes = state.incomes.filter(function (x) { return x.id !== target.id; });
          }
          closeDeleteModal();
          renderDashboard();
          showToast('Registro eliminado con éxito', 'success');
        })
        .catch(function (err) {
          console.error('Delete failed:', err);
          showToast('Error al eliminar el registro', 'error');
        });
    });

    // 10. Settings Form Submit
    el.adminSettingsForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {
        project_start_date: el.setStartDate.value || '2026-01-01',
        currency: el.setCurrency.value.trim() || 'EUR',
        google_fee_pct: Number(el.setGoogleFee.value) || 15.0,
        apple_fee_pct: Number(el.setAppleFee.value) || 15.0,
        stripe_fee_pct: Number(el.setStripePct.value) || 1.5,
        stripe_fee_fixed_eur: Number(el.setStripeFixed.value) || 0.25,
        tax_rate_pct: Number(el.setTaxRate.value) || 19.0,
      };

      var promise = state.settings.id
        ? pb.collection(SETTINGS_COLLECTION).update(state.settings.id, data)
        : pb.collection(SETTINGS_COLLECTION).create(data);

      promise
        .then(function (record) {
          state.settings = Object.assign({}, state.settings, record);
          showToast(t('admin_settings_saved'), 'success');
          renderDashboard();
        })
        .catch(function (err) {
          console.error('Save settings failed:', err);
          showToast('Error al guardar la configuración', 'error');
        });
    });

    // 11. Sync & Publish Button
    el.btnSyncPublic.addEventListener('click', syncAndPublish);

    // 12. Phases Table Actions (Edit, Delete)
    if (el.phasesTableBody) {
      el.phasesTableBody.addEventListener('click', function (e) {
        var editBtn = e.target.closest('[data-phase-edit-id]');
        if (editBtn) {
          var editId = editBtn.getAttribute('data-phase-edit-id');
          var phase = state.phases.find(function (x) { return x.id === editId; });
          if (phase) openPhaseModal(phase);
          return;
        }

        var delBtn = e.target.closest('[data-phase-delete-id]');
        if (delBtn) {
          var delId = delBtn.getAttribute('data-phase-delete-id');
          var delPhase = state.phases.find(function (x) { return x.id === delId; });
          if (delPhase) openDeleteModal('phase', delId, delPhase.name);
          return;
        }
      });
    }

    // 13. Expenses Table Actions (Edit, Delete, Toggle Active)
    el.expensesTableBody.addEventListener('click', function (e) {
      var editBtn = e.target.closest('[data-expense-edit-id]');
      if (editBtn) {
        var editId = editBtn.getAttribute('data-expense-edit-id');
        var expense = state.expenses.find(function (x) { return x.id === editId; });
        if (expense) openExpenseModal(expense);
        return;
      }

      var delBtn = e.target.closest('[data-expense-delete-id]');
      if (delBtn) {
        var delId = delBtn.getAttribute('data-expense-delete-id');
        var delExp = state.expenses.find(function (x) { return x.id === delId; });
        if (delExp) openDeleteModal('expense', delId, delExp.concept);
        return;
      }
    });

    el.expensesTableBody.addEventListener('change', function (e) {
      var toggle = e.target.closest('[data-expense-toggle-id]');
      if (toggle) {
        var toggleId = toggle.getAttribute('data-expense-toggle-id');
        var isChecked = toggle.checked;
        pb.collection(EXPENSES_COLLECTION).update(toggleId, { is_active: isChecked })
          .then(function (record) {
            var idx = state.expenses.findIndex(function (x) { return x.id === toggleId; });
            if (idx !== -1) state.expenses[idx] = record;
            renderDashboard();
            showToast('Estado del gasto actualizado', 'info');
          })
          .catch(function (err) {
            console.error('Toggle expense failed:', err);
            toggle.checked = !isChecked;
            showToast('Error actualizando estado del gasto', 'error');
          });
      }
    });

    // 14. Incomes Table Actions (Edit, Delete)
    el.incomesTableBody.addEventListener('click', function (e) {
      var editBtn = e.target.closest('[data-income-edit-id]');
      if (editBtn) {
        var editId = editBtn.getAttribute('data-income-edit-id');
        var income = state.incomes.find(function (x) { return x.id === editId; });
        if (income) openIncomeModal(income);
        return;
      }

      var delBtn = e.target.closest('[data-income-delete-id]');
      if (delBtn) {
        var delId = delBtn.getAttribute('data-income-delete-id');
        var delInc = state.incomes.find(function (x) { return x.id === delId; });
        if (delInc) openDeleteModal('income', delId, delInc.concept);
        return;
      }
    });
  }

  // ------------------------------------------------------------------
  // View Switcher
  // ------------------------------------------------------------------
  function showDashboardView() {
    el.loginShell.hidden = true;
    el.dashboardApp.hidden = false;

    var record = pb.authStore.record;
    var name = (record && (record.display_name || record.email)) || 'Admin';
    el.adminWelcomeName.textContent = name;
    el.adminUserAvatar.textContent = name.slice(0, 2).toUpperCase();

    loadAllData();
  }

  function showLoginView() {
    el.dashboardApp.hidden = true;
    el.loginShell.hidden = false;
    el.loginForm.reset();
    el.loginError.textContent = '';
  }

  // ------------------------------------------------------------------
  // Public Exports (for testing and programmatic access)
  // ------------------------------------------------------------------
  var adminMath = {
    computeFundingStatus: computeFundingStatus,
    calculateIncomeNet: calculateIncomeNet,
    computeFinancialAggregation: computeFinancialAggregation,
    addMonthsClamped: addMonthsClamped,
    clamp01: clamp01,
    state: state,
    firstNonEmptyTranslation: firstNonEmptyTranslation,
    slugifyPhaseKey: slugifyPhaseKey,
  };

  if (typeof window !== 'undefined') {
    window.XowAdminMath = adminMath;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = adminMath;
  }

  // ------------------------------------------------------------------
  // Initialization
  // ------------------------------------------------------------------
  if (typeof document !== 'undefined' && el.loginShell && el.dashboardApp && pb) {
    setupEvents();

    if (pb.authStore.isValid) {
      showDashboardView();
    } else {
      showLoginView();
    }
  }
})();
