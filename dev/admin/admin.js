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
    expenses: [],
    incomes: [],
    publicStatusRecord: null,
    deleteTarget: null, // { type: 'expense'|'income', id: string, name: string }
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

    // Phases
    adminPhasesContainer: doc.getElementById('adminPhasesContainer'),

    // Tabs
    tabBtnExpenses: doc.getElementById('tabBtnExpenses'),
    tabBtnIncomes: doc.getElementById('tabBtnIncomes'),
    tabBtnSettings: doc.getElementById('tabBtnSettings'),
    panelExpenses: doc.getElementById('panelExpenses'),
    panelIncomes: doc.getElementById('panelIncomes'),
    panelSettings: doc.getElementById('panelSettings'),

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

    // 2. Expenses breakdown by phase
    var phaseMonthly = { survival: 0, infra: 0, pro: 0 };
    var phaseOneOff = { survival: 0, infra: 0, pro: 0 };
    var totalActiveMonthly = 0;
    var totalSpentOneOff = 0;

    (st.expenses || []).forEach(function (exp) {
      var amt = Number(exp.amount_eur) || 0;
      var isActive = exp.is_active !== false;
      var phases = Array.isArray(exp.applicable_phases) ? exp.applicable_phases : ['survival'];

      if (exp.type === 'monthly') {
        if (isActive) {
          totalActiveMonthly += amt;
          phases.forEach(function (p) {
            if (phaseMonthly[p] !== undefined) phaseMonthly[p] += amt;
          });
        }
      } else {
        // one_off: always adds to phase target bucket
        phases.forEach(function (p) {
          if (phaseOneOff[p] !== undefined) phaseOneOff[p] += amt;
        });
        // Only counts as already spent if it has an explicit payment date <= now
        if (exp.payment_date) {
          var pDate = parseDateParts(exp.payment_date);
          if (pDate <= now) totalSpentOneOff += amt;
        }
      }
    });

    // 3. Dynamic target (bucket) calculation based purely on configured active expenses.
    // As defined: each phase target is 1 year (12 months) of its monthly expenses + one-off expenses for that phase.
    var p1Monthly = phaseMonthly.survival;
    var p1Bucket = (p1Monthly * 12) + phaseOneOff.survival;

    var p2Monthly = phaseMonthly.infra;
    var p2Bucket = (p2Monthly * 12) + phaseOneOff.infra;

    var p3Monthly = phaseMonthly.pro;
    var p3Bucket = (p3Monthly * 12) + phaseOneOff.pro;

    var phases = [
      { key: 'survival', monthlyCostEur: p1Monthly, bucketEur: p1Bucket },
      { key: 'infra', monthlyCostEur: p2Monthly, bucketEur: p2Bucket },
      { key: 'pro', monthlyCostEur: p3Monthly, bucketEur: p3Bucket },
    ];

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
    // As time passes and expenses are consumed, netBalance decreases and phases roll back if no new income arrives.
    var phaseStatuses = computeFundingStatus(phases, netBalance, now);

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
      phases: phases,
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
    agg.phaseStatuses.forEach(function (st, idx) {
      var phaseKey = st.phase.key;
      var nameKey = 'admin_phase_' + (idx + 1) + '_name';
      var descKey = 'admin_phase_' + (idx + 1) + '_desc';
      var badgeKey = 'admin_badge_' + st.state;
      var pct = Math.round(st.progress * 100);

      var badgeClass = st.state === 'covered' ? 'xow-badge-covered'
        : st.state === 'active' ? 'xow-badge-active'
        : 'xow-badge-pending';
      var badgeIcon = st.state === 'covered' ? 'check_circle' : 'schedule';

      phasesHtml += '<div class="xow-admin-phase-card ' + st.state + '">';
      phasesHtml += '  <div class="xow-admin-phase-head">';
      phasesHtml += '    <div>';
      phasesHtml += '      <div class="xow-admin-phase-name">' + t(nameKey) + '</div>';
      phasesHtml += '      <div class="xow-admin-phase-desc">' + t(descKey) + '</div>';
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

    // 3. Expenses Table
    renderExpensesTable();

    // 4. Incomes Table
    renderIncomesTable();

    // 5. Settings Form inputs
    renderSettingsForm();

    // 6. Last sync badge
    if (state.publicStatusRecord) {
      var d = new Date(state.publicStatusRecord.updated || state.publicStatusRecord.created);
      el.lastSyncStatusText.textContent = t('admin_last_sync') + ': ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + d.toLocaleDateString() + ')';
    } else {
      el.lastSyncStatusText.textContent = 'Aún no sincronizado en PocketBase';
    }
  }

  function renderExpensesTable() {
    if (!state.expenses.length) {
      el.expensesTableBody.innerHTML = '';
      el.expensesEmptyState.hidden = false;
      return;
    }
    el.expensesEmptyState.hidden = true;

    var rows = '';
    state.expenses.forEach(function (exp) {
      var phases = Array.isArray(exp.applicable_phases) ? exp.applicable_phases : ['survival'];
      var phaseBadges = phases.map(function (p) {
        var lbl = p === 'survival' ? 'Fase 1' : p === 'infra' ? 'Fase 2' : 'Fase 3';
        return '<span class="xow-badge" style="font-size: 11px; padding: 2px 6px;">' + lbl + '</span>';
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

  function escapeHtml(str) {
    return String(str)
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

    return Promise.all([pSettings, pExpenses, pIncomes, pPublic])
      .then(function () {
        renderDashboard();
      })
      .catch(function (err) {
        console.error('Error loading admin data:', err);
        showToast('Error cargando los datos de PocketBase', 'error');
      });
  }

  function syncAndPublish() {
    if (state.isSyncing) return;
    state.isSyncing = true;
    el.btnSyncPublic.disabled = true;

    var agg = computeFinancialAggregation();
    var payload = {
      total_raised_eur: agg.totalNet,
      phases: agg.phases.map(function (p) {
        return {
          key: p.key,
          monthly_cost_eur: p.monthlyCostEur,
          bucket_eur: p.bucketEur,
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
  // Modal Handlers (Expenses & Incomes & Delete)
  // ------------------------------------------------------------------
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

      var phases = Array.isArray(expense.applicable_phases) ? expense.applicable_phases : ['survival'];
      document.querySelectorAll('#formExpense input[name="applicable_phases"]').forEach(function (cb) {
        cb.checked = phases.indexOf(cb.value) !== -1;
      });
    } else {
      el.modalExpenseTitle.textContent = t('admin_modal_expense_create');
      el.expenseEditId.value = '';
      el.expDate.value = new Date().toISOString().slice(0, 10);
      el.expIsActive.checked = true;
      document.querySelectorAll('#formExpense input[name="applicable_phases"]').forEach(function (cb) {
        cb.checked = cb.value === 'survival';
      });
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
    var tabButtons = [el.tabBtnExpenses, el.tabBtnIncomes, el.tabBtnSettings];
    var tabPanels = [el.panelExpenses, el.panelIncomes, el.panelSettings];

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

    // 4. Modal Open/Close Buttons
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

    // 6. Expense Form Submit (Create / Update)
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

    // 7. Income Form Submit (Create / Update)
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

    // 8. Delete Confirmation Execution
    el.btnConfirmDelete.addEventListener('click', function () {
      if (!state.deleteTarget) return;
      var target = state.deleteTarget;
      var col = target.type === 'expense' ? EXPENSES_COLLECTION : INCOMES_COLLECTION;

      pb.collection(col).delete(target.id)
        .then(function () {
          if (target.type === 'expense') {
            state.expenses = state.expenses.filter(function (x) { return x.id !== target.id; });
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

    // 9. Settings Form Submit
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

    // 10. Sync & Publish Button
    el.btnSyncPublic.addEventListener('click', syncAndPublish);

    // 11. Table Delegated Actions (Edit, Delete, Toggle Active)
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
