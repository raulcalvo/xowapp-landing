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
  // Session-Backed Auth Store (Preserves login on F5/refresh, wiped on tab close)
  // ------------------------------------------------------------------
  var AUTH_STORAGE_KEY = 'xow_admin_auth';

  function SessionAuthStore() {
    this._token = '';
    this._record = null;
    this._callbacks = [];
    this._load();
  }
  SessionAuthStore.prototype = {
    get token() { return this._token; },
    get record() { return this._record; },
    get model() { return this._record; },
    get isValid() { return !!this._token; },
    get isSuperuser() { return false; },
    _load: function () {
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          var raw = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
          if (raw) {
            var data = JSON.parse(raw);
            this._token = data.token || '';
            this._record = data.record || null;
          }
        }
      } catch (e) {
        this._token = '';
        this._record = null;
      }
    },
    save: function (token, record) {
      this._token = token || '';
      this._record = record || null;
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          if (this._token) {
            window.sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
              token: this._token,
              record: this._record,
            }));
          } else {
            window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
          }
        }
      } catch (e) {}
      this._trigger();
    },
    clear: function () {
      this._token = '';
      this._record = null;
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
          window.sessionStorage.removeItem('xow_admin_active_section');
        }
      } catch (e) {}
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
  var pb = (typeof PocketBase !== 'undefined') ? new PocketBase(cfg.pocketbaseUrl || '', new SessionAuthStore()) : null;

  var SETTINGS_COLLECTION = cfg.fundingSettingsCollection || 'funding_settings';
  var PHASES_COLLECTION = cfg.fundingPhasesCollection || 'funding_phases';
  var EXPENSES_COLLECTION = cfg.fundingExpensesCollection || 'funding_expenses';
  var INCOMES_COLLECTION = cfg.fundingIncomesCollection || 'funding_incomes';
  var PUBLIC_STATUS_COLLECTION = cfg.fundingCollection || 'funding_public_status';
  var REPORTS_COLLECTION = 'reports';
  var USERS_COLLECTION = 'users';
  var RESERVED_HANDLES_COLLECTION = 'reserved_handles';
  var SYSTEM_EVENTS_COLLECTION = 'system_events';
  var ALBUMS_COLLECTION = 'albums';
  var SERVER_TRANSFERS_COLLECTION = 'server_transfers';

  // ------------------------------------------------------------------
  // State Management
  // ------------------------------------------------------------------
  var state = {
    activeMainSection: 'dashboard',
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

    // Analytics Dashboard State
    analyticsGranularity: 'day', // 'day', 'week', 'month', 'year'
    analyticsActiveParams: ['new_users', 'reports', 'transfers_delivered', 'transfers_transit', 'user_deletions'],
    analyticsRawData: {
      users: [],
      reports: [],
      transfers: [],
      systemEvents: [],
      albums: []
    },
    analyticsCurrentKpis: {
      totalUsers: 0,
      activeUsers24h: 0,
      activeUsers7d: 0,
      totalReports: 0,
      pendingReports: 0,
      transfersTransit: 0,
      transfersDelivered: 0,
      userDeletions: 0,
      activeAlbums: 0
    },

    // Reports Module State
    reports: [],
    reportsFilter: {
      search: '',
      status: '',
      category: '',
      content: '',
      blocked: '',
      sort: 'created_desc',
    },
    selectedReport: null,
    reportsSubscribed: false,

    // Users Module State
    activeUserTab: 'directory',
    users: [],
    userSearchHandle: '',
    userSearchName: '',
    userStatusFilter: 'all',
    selectedUser: null,
    userReportsReceived: [],
    userReportsMade: [],
    reservedHandles: [],
    selectedReservedHandle: null,
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

    // Main Module Navigation
    tabNavDashboard: doc.getElementById('tabNavDashboard'),
    tabNavFunding: doc.getElementById('tabNavFunding'),
    tabNavReports: doc.getElementById('tabNavReports'),
    tabNavUsers: doc.getElementById('tabNavUsers'),
    reportsPendingBadge: doc.getElementById('reportsPendingBadge'),
    secDashboard: doc.getElementById('secDashboard'),
    secFunding: doc.getElementById('secFunding'),
    secReports: doc.getElementById('secReports'),
    secUsers: doc.getElementById('secUsers'),

    // Analytics Dashboard KPIs & Chart
    kpiTotalUsersValue: doc.getElementById('kpiTotalUsersValue'),
    kpiActiveUsersSub: doc.getElementById('kpiActiveUsersSub'),
    kpiTotalReportsValue: doc.getElementById('kpiTotalReportsValue'),
    kpiPendingReportsSub: doc.getElementById('kpiPendingReportsSub'),
    kpiTransfersTransitValue: doc.getElementById('kpiTransfersTransitValue'),
    kpiTransfersTransitSub: doc.getElementById('kpiTransfersTransitSub'),
    kpiTransfersDeliveredValue: doc.getElementById('kpiTransfersDeliveredValue'),
    kpiTransfersDeliveredSub: doc.getElementById('kpiTransfersDeliveredSub'),
    kpiUserDeletionsValue: doc.getElementById('kpiUserDeletionsValue'),
    kpiUserDeletionsSub: doc.getElementById('kpiUserDeletionsSub'),
    kpiActiveAlbumsValue: doc.getElementById('kpiActiveAlbumsValue'),
    kpiActiveAlbumsSub: doc.getElementById('kpiActiveAlbumsSub'),
    analyticsLastUpdatedText: doc.getElementById('analyticsLastUpdatedText'),

    chartParameterPills: doc.getElementById('chartParameterPills'),
    analyticsChartContainer: doc.getElementById('analyticsChartContainer'),
    analyticsChartSvg: doc.getElementById('analyticsChartSvg'),
    chartTooltip: doc.getElementById('chartTooltip'),
    btnGranularityDay: doc.getElementById('btnGranularityDay'),
    btnGranularityWeek: doc.getElementById('btnGranularityWeek'),
    btnGranularityMonth: doc.getElementById('btnGranularityMonth'),
    btnGranularityYear: doc.getElementById('btnGranularityYear'),

    // Funding KPIs
    kpiGrossValue: doc.getElementById('kpiGrossValue'),
    kpiNetValue: doc.getElementById('kpiNetValue'),
    kpiMonthlyCostValue: doc.getElementById('kpiMonthlyCostValue'),
    kpiRunwayValue: doc.getElementById('kpiRunwayValue'),
    kpiRunwaySub: doc.getElementById('kpiRunwaySub'),

    // Phases Visualizer
    adminPhasesContainer: doc.getElementById('adminPhasesContainer'),

    // Funding Tabs
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

    // Reports Module Elements
    kpiRepTotal: doc.getElementById('kpiRepTotal'),
    kpiRepTotalSub: doc.getElementById('kpiRepTotalSub'),
    kpiRepPending: doc.getElementById('kpiRepPending'),
    kpiRepPendingSub: doc.getElementById('kpiRepPendingSub'),
    kpiRepResolved: doc.getElementById('kpiRepResolved'),
    kpiRepResolvedSub: doc.getElementById('kpiRepResolvedSub'),
    kpiRepSla: doc.getElementById('kpiRepSla'),
    kpiRepAvgTime: doc.getElementById('kpiRepAvgTime'),
    repCategoryChips: doc.getElementById('repCategoryChips'),
    repContentChips: doc.getElementById('repContentChips'),
    repSearchInput: doc.getElementById('repSearchInput'),
    repStatusFilter: doc.getElementById('repStatusFilter'),
    repCategoryFilter: doc.getElementById('repCategoryFilter'),
    repContentFilter: doc.getElementById('repContentFilter'),
    repBlockedFilter: doc.getElementById('repBlockedFilter'),
    repSortSelect: doc.getElementById('repSortSelect'),
    btnRefreshReports: doc.getElementById('btnRefreshReports'),
    reportsTableBody: doc.getElementById('reportsTableBody'),
    reportsEmptyState: doc.getElementById('reportsEmptyState'),

    // Reports Detail Modal
    modalReportDetailBackdrop: doc.getElementById('modalReportDetailBackdrop'),
    modalReportDetailTitle: doc.getElementById('modalReportDetailTitle'),
    modalRepStatusBadge: doc.getElementById('modalRepStatusBadge'),
    btnCloseReportDetailModal: doc.getElementById('btnCloseReportDetailModal'),
    repDetailId: doc.getElementById('repDetailId'),
    repDetailIdText: doc.getElementById('repDetailIdText'),
    repDetailDateText: doc.getElementById('repDetailDateText'),
    repDetailContentTypeText: doc.getElementById('repDetailContentTypeText'),
    repDetailCategoryText: doc.getElementById('repDetailCategoryText'),
    repDetailReporterText: doc.getElementById('repDetailReporterText'),
    repDetailTargetText: doc.getElementById('repDetailTargetText'),
    btnViewReporterUser: doc.getElementById('btnViewReporterUser'),
    btnViewTargetUser: doc.getElementById('btnViewTargetUser'),
    repDetailAlbumIdText: doc.getElementById('repDetailAlbumIdText'),
    repDetailBlockedText: doc.getElementById('repDetailBlockedText'),
    repDetailDescriptionText: doc.getElementById('repDetailDescriptionText'),
    formReportModeration: doc.getElementById('formReportModeration'),
    repModStatus: doc.getElementById('repModStatus'),
    repModAction: doc.getElementById('repModAction'),
    repModNotes: doc.getElementById('repModNotes'),
    btnBanReportedUser: doc.getElementById('btnBanReportedUser'),
    btnDismissReport: doc.getElementById('btnDismissReport'),
    btnSaveReportResolution: doc.getElementById('btnSaveReportResolution'),

    // Users Module Elements
    tabBtnUserDirectory: doc.getElementById('tabBtnUserDirectory'),
    tabBtnUserReserved: doc.getElementById('tabBtnUserReserved'),
    panelUserDirectory: doc.getElementById('panelUserDirectory'),
    panelUserReserved: doc.getElementById('panelUserReserved'),
    userSearchHandleInput: doc.getElementById('userSearchHandleInput'),
    userSearchNameInput: doc.getElementById('userSearchNameInput'),
    userStatusFilter: doc.getElementById('userStatusFilter'),
    btnRefreshUsers: doc.getElementById('btnRefreshUsers'),
    usersTableBody: doc.getElementById('usersTableBody'),
    usersEmptyState: doc.getElementById('usersEmptyState'),
    usersCountLabel: doc.getElementById('usersCountLabel'),

    // User Profile Modal
    modalUserDetailBackdrop: doc.getElementById('modalUserDetailBackdrop'),
    modalUserAvatar: doc.getElementById('modalUserAvatar'),
    modalUserName: doc.getElementById('modalUserName'),
    modalUserHandle: doc.getElementById('modalUserHandle'),
    modalUserStatusBadge: doc.getElementById('modalUserStatusBadge'),
    btnCloseUserDetailModal: doc.getElementById('btnCloseUserDetailModal'),
    modalUserId: doc.getElementById('modalUserId'),
    modalUserIdText: doc.getElementById('modalUserIdText'),
    modalUserTrustText: doc.getElementById('modalUserTrustText'),
    modalUserLocaleText: doc.getElementById('modalUserLocaleText'),
    modalUserVersionText: doc.getElementById('modalUserVersionText'),
    modalUserCreatedText: doc.getElementById('modalUserCreatedText'),
    modalUserLastSeenText: doc.getElementById('modalUserLastSeenText'),
    modalUserBanBanner: doc.getElementById('modalUserBanBanner'),
    modalUserBanReasonText: doc.getElementById('modalUserBanReasonText'),
    modalUserReportsReceivedCount: doc.getElementById('modalUserReportsReceivedCount'),
    modalUserReportsReceivedList: doc.getElementById('modalUserReportsReceivedList'),
    modalUserReportsMadeCount: doc.getElementById('modalUserReportsMadeCount'),
    modalUserReportsMadeList: doc.getElementById('modalUserReportsMadeList'),
    btnToggleUserBan: doc.getElementById('btnToggleUserBan'),
    btnToggleUserBanText: doc.getElementById('btnToggleUserBanText'),
    btnDismissUserDetail: doc.getElementById('btnDismissUserDetail'),

    // Reserved Handles Elements
    btnRefreshReserved: doc.getElementById('btnRefreshReserved'),
    btnOpenAddReservedModal: doc.getElementById('btnOpenAddReservedModal'),
    reservedHandlesTableBody: doc.getElementById('reservedHandlesTableBody'),
    reservedEmptyState: doc.getElementById('reservedEmptyState'),
    modalReservedHandleBackdrop: doc.getElementById('modalReservedHandleBackdrop'),
    btnCloseReservedModal: doc.getElementById('btnCloseReservedModal'),
    formReservedHandle: doc.getElementById('formReservedHandle'),
    reservedHandleInput: doc.getElementById('reservedHandleInput'),
    reservedReasonInput: doc.getElementById('reservedReasonInput'),
    btnCancelReserved: doc.getElementById('btnCancelReserved'),
    btnSaveReserved: doc.getElementById('btnSaveReserved'),

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

      var phName = resolvePhaseText(st.phase.name, '-');
      var phDesc = resolvePhaseText(st.phase.desc || st.phase.description, '');

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

      var nameText = resolvePhaseText(ph.name, '-');
      var descText = resolvePhaseText(ph.description || ph.desc, '-');

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
      // p.name is an i18n object here (agg.phases comes from computeFinancialAggregation),
      // not a plain string -- resolve it to a displayable string, or the badge below would
      // render the literal text "[object Object]" for every phase (via escapeHtml's implicit
      // String() coercion).
      var label = resolvePhaseText(p.name, p.key || p.id);
      phasesMap[p.id] = label;
      if (p.key) phasesMap[p.key] = label;
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

  function escapePbFilter(str) {
    if (!str) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/'/g, "\\'");
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

    var pReports = loadReports().catch(function () { /* handled */ });

    return Promise.all([pSettings, pPhases, pExpenses, pIncomes, pPublic, pReports])
      .then(function () {
        if (state.activeMainSection === 'funding') {
          renderDashboard();
        } else if (state.activeMainSection === 'reports') {
          renderReportsSection();
        } else if (state.activeMainSection === 'users') {
          if (state.activeUserTab === 'directory') loadUsers();
          else loadReservedHandles();
        }
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

  // Resolves a phase name/description field -- which can arrive as a plain string, an i18n
  // object ({es:..., en:...}), or a JSON-encoded string of one, depending on where it came
  // from -- to a single displayable string, never the raw object. Passing an object straight
  // into escapeHtml()/string concatenation silently renders the literal text "[object Object]"
  // instead of throwing, which is exactly how it reached the phases table, the summary cards,
  // and the expenses table's phase badges (all three read fields that are already i18n objects
  // once they come from computeFinancialAggregation's output, not raw PocketBase records).
  function resolvePhaseText(field, fallback) {
    var obj = (typeof field === 'object' && field !== null) ? field : parseI18nField(field);
    var resolved = obj && (obj.es || obj.en || firstNonEmptyTranslation(obj));
    return resolved || (fallback !== undefined ? fallback : '-');
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
  // Analytics Dashboard & Historical Chart Module
  // ------------------------------------------------------------------
  var ANALYTICS_PARAMETERS = {
    new_users: { id: 'new_users', labelKey: 'admin_param_new_users', labelDefault: 'Nuevos Usuarios', color: '#10B981', defaultActive: true },
    reports: { id: 'reports', labelKey: 'admin_param_reports', labelDefault: 'Denuncias', color: '#EF4444', defaultActive: true },
    transfers_delivered: { id: 'transfers_delivered', labelKey: 'admin_param_transfers_delivered', labelDefault: 'Ficheros Enviados y Recibidos (Borrados)', color: '#3B82F6', defaultActive: true },
    transfers_transit: { id: 'transfers_transit', labelKey: 'admin_param_transfers_transit', labelDefault: 'Ficheros Enviados no Recibidos', color: '#F59E0B', defaultActive: true },
    user_deletions: { id: 'user_deletions', labelKey: 'admin_param_user_deletions', labelDefault: 'Bajas de Usuarios', color: '#8B5CF6', defaultActive: true },
    albums_created: { id: 'albums_created', labelKey: 'admin_param_albums_created', labelDefault: 'Nuevos Álbumes Creados', color: '#06B6D4', defaultActive: false },
    active_users: { id: 'active_users', labelKey: 'admin_param_active_users', labelDefault: 'Usuarios Activos', color: '#F97316', defaultActive: false }
  };

  function getWeekNumber(d) {
    var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  function getYearWeekKey(d) {
    var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    var year = date.getUTCFullYear();
    var yearStart = new Date(Date.UTC(year, 0, 1));
    var weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    return year + '-W' + (weekNo < 10 ? '0' + weekNo : weekNo);
  }

  function buildDateBuckets(granularity, refDate) {
    var now = refDate ? new Date(refDate) : new Date();
    var buckets = [];

    if (granularity === 'day') {
      for (var i = 29; i >= 0; i--) {
        var d = new Date(now.getTime() - i * 86400000);
        var key = d.toISOString().slice(0, 10);
        var label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
        buckets.push({ key: key, label: label, date: d });
      }
    } else if (granularity === 'week') {
      for (var i = 11; i >= 0; i--) {
        var d = new Date(now.getTime() - i * 7 * 86400000);
        var key = getYearWeekKey(d);
        var label = 'W' + getWeekNumber(d);
        buckets.push({ key: key, label: label, date: d });
      }
    } else if (granularity === 'month') {
      for (var i = 11; i >= 0; i--) {
        var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        var label = d.toLocaleDateString([], { month: 'short', year: '2-digit' });
        buckets.push({ key: key, label: label, date: d });
      }
    } else if (granularity === 'year') {
      for (var i = 4; i >= 0; i--) {
        var yr = now.getFullYear() - i;
        var key = String(yr);
        var label = String(yr);
        buckets.push({ key: key, label: label, date: new Date(yr, 0, 1) });
      }
    }
    return buckets;
  }

  function extractBucketKey(dateString, granularity) {
    if (!dateString) return null;
    var d = new Date(dateString);
    if (isNaN(d.getTime())) return null;

    if (granularity === 'day') {
      return d.toISOString().slice(0, 10);
    } else if (granularity === 'week') {
      return getYearWeekKey(d);
    } else if (granularity === 'month') {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    } else if (granularity === 'year') {
      return String(d.getFullYear());
    }
    return null;
  }

  function buildAnalyticsTimeSeries(rawData, granularity, refDate) {
    var buckets = buildDateBuckets(granularity, refDate);
    var bucketMap = {};
    var paramKeys = Object.keys(ANALYTICS_PARAMETERS);

    buckets.forEach(function (b, index) {
      bucketMap[b.key] = index;
      b.counts = {};
      paramKeys.forEach(function (k) {
        b.counts[k] = 0;
      });
    });

    var users = (rawData && rawData.users) || [];
    var reports = (rawData && rawData.reports) || [];
    var transfers = (rawData && rawData.transfers) || [];
    var systemEvents = (rawData && rawData.systemEvents) || [];
    var albums = (rawData && rawData.albums) || [];

    // 1. New Users
    users.forEach(function (u) {
      var k = extractBucketKey(u.created, granularity);
      if (k in bucketMap) buckets[bucketMap[k]].counts.new_users++;
    });

    // 2. Reports
    reports.forEach(function (r) {
      var k = extractBucketKey(r.created || r.timestamp, granularity);
      if (k in bucketMap) buckets[bucketMap[k]].counts.reports++;
    });

    // 3. Transfers in Transit (Pending)
    transfers.forEach(function (t) {
      var k = extractBucketKey(t.created, granularity);
      if (k in bucketMap) buckets[bucketMap[k]].counts.transfers_transit++;
    });

    // 4. System Events (Transfers delivered / User deletions)
    systemEvents.forEach(function (ev) {
      var k = extractBucketKey(ev.created, granularity);
      if (k in bucketMap) {
        if (ev.event_type === 'transfer_completed') {
          buckets[bucketMap[k]].counts.transfers_delivered++;
        } else if (ev.event_type === 'user_deleted') {
          buckets[bucketMap[k]].counts.user_deletions++;
        }
      }
    });

    // 5. Albums created
    albums.forEach(function (a) {
      var k = extractBucketKey(a.created, granularity);
      if (k in bucketMap) buckets[bucketMap[k]].counts.albums_created++;
    });

    // 6. Active Users (by last_seen)
    users.forEach(function (u) {
      if (u.last_seen) {
        var k = extractBucketKey(u.last_seen, granularity);
        if (k in bucketMap) buckets[bucketMap[k]].counts.active_users++;
      }
    });

    return buckets;
  }

  function computeCurrentKpis(rawData, refDate) {
    var now = refDate ? new Date(refDate).getTime() : Date.now();
    var users = (rawData && rawData.users) || [];
    var reports = (rawData && rawData.reports) || [];
    var transfers = (rawData && rawData.transfers) || [];
    var systemEvents = (rawData && rawData.systemEvents) || [];
    var albums = (rawData && rawData.albums) || [];

    var active24h = 0;
    var active7d = 0;
    users.forEach(function (u) {
      if (u.last_seen) {
        var diff = now - new Date(u.last_seen).getTime();
        if (diff >= 0 && diff <= 24 * 3600000) active24h++;
        if (diff >= 0 && diff <= 7 * 24 * 3600000) active7d++;
      }
    });

    var pendingReports = 0;
    reports.forEach(function (r) {
      if (!r.status || r.status === 'pending') pendingReports++;
    });

    var transfersDelivered = 0;
    var userDeletions = 0;
    systemEvents.forEach(function (ev) {
      if (ev.event_type === 'transfer_completed') transfersDelivered++;
      else if (ev.event_type === 'user_deleted') userDeletions++;
    });

    return {
      totalUsers: users.length,
      activeUsers24h: active24h,
      activeUsers7d: active7d,
      totalReports: reports.length,
      pendingReports: pendingReports,
      transfersTransit: transfers.length,
      transfersDelivered: transfersDelivered,
      userDeletions: userDeletions,
      activeAlbums: albums.length,
    };
  }

  function renderCurrentKpis(kpis) {
    if (!kpis) return;
    if (el.kpiTotalUsersValue) el.kpiTotalUsersValue.textContent = kpis.totalUsers.toLocaleString();
    if (el.kpiActiveUsersSub) el.kpiActiveUsersSub.textContent = kpis.activeUsers24h + ' activos (24h) · ' + kpis.activeUsers7d + ' (7d)';
    if (el.kpiTotalReportsValue) el.kpiTotalReportsValue.textContent = kpis.totalReports.toLocaleString();
    if (el.kpiPendingReportsSub) el.kpiPendingReportsSub.textContent = kpis.pendingReports + ' pendientes de moderación';
    if (el.kpiTransfersTransitValue) el.kpiTransfersTransitValue.textContent = kpis.transfersTransit.toLocaleString();
    if (el.kpiTransfersTransitSub) el.kpiTransfersTransitSub.textContent = 'Enviados, pendientes de descarga';
    if (el.kpiTransfersDeliveredValue) el.kpiTransfersDeliveredValue.textContent = kpis.transfersDelivered.toLocaleString();
    if (el.kpiTransfersDeliveredSub) el.kpiTransfersDeliveredSub.textContent = 'Completados y purgados del servidor';
    if (el.kpiUserDeletionsValue) el.kpiUserDeletionsValue.textContent = kpis.userDeletions.toLocaleString();
    if (el.kpiUserDeletionsSub) el.kpiUserDeletionsSub.textContent = 'Cuentas eliminadas (Derecho al olvido)';
    if (el.kpiActiveAlbumsValue) el.kpiActiveAlbumsValue.textContent = kpis.activeAlbums.toLocaleString();
    if (el.kpiActiveAlbumsSub) el.kpiActiveAlbumsSub.textContent = 'Álbumes activos en la red E2EE';
    if (el.analyticsLastUpdatedText) {
      var d = new Date();
      el.analyticsLastUpdatedText.textContent = 'Actualizado: ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }

  function renderParameterPills() {
    if (!el.chartParameterPills) return;
    var html = '';
    Object.keys(ANALYTICS_PARAMETERS).forEach(function (paramId) {
      var p = ANALYTICS_PARAMETERS[paramId];
      var isActive = state.analyticsActiveParams.indexOf(paramId) !== -1;
      var label = t(p.labelKey) || p.labelDefault;
      html += '<button type="button" class="xow-param-pill ' + (isActive ? 'active' : '') + '" data-param-id="' + p.id + '" style="border-color: ' + (isActive ? p.color : 'rgba(255,255,255,0.1)') + '">';
      html += '  <span class="xow-param-dot" style="background: ' + p.color + '"></span>';
      html += '  <span>' + escapeHtml(label) + '</span>';
      html += '</button>';
    });
    el.chartParameterPills.innerHTML = html;
  }

  function renderAnalyticsChart() {
    if (!el.analyticsChartSvg) return;

    var buckets = buildAnalyticsTimeSeries(state.analyticsRawData, state.analyticsGranularity);
    var activeParams = state.analyticsActiveParams.filter(function (id) {
      return id in ANALYTICS_PARAMETERS;
    });

    var svgW = 960;
    var svgH = 380;
    var padL = 55;
    var padR = 30;
    var padT = 30;
    var padB = 45;
    var plotW = svgW - padL - padR;
    var plotH = svgH - padT - padB;

    // Find max value across active series in all buckets
    var maxVal = 0;
    buckets.forEach(function (b) {
      activeParams.forEach(function (pId) {
        var v = b.counts[pId] || 0;
        if (v > maxVal) maxVal = v;
      });
    });

    var maxY = Math.max(5, Math.ceil(maxVal * 1.2));

    var svg = '';

    // Defs for Gradients
    svg += '<defs>';
    activeParams.forEach(function (pId) {
      var color = ANALYTICS_PARAMETERS[pId].color;
      svg += '<linearGradient id="grad_' + pId + '" x1="0" y1="0" x2="0" y2="1">';
      svg += '  <stop offset="0%" stop-color="' + color + '" stop-opacity="0.3"/>';
      svg += '  <stop offset="100%" stop-color="' + color + '" stop-opacity="0.0"/>';
      svg += '</linearGradient>';
    });
    svg += '</defs>';

    // Horizontal Grid Lines & Y Axis Labels (4 divisions)
    for (var i = 0; i <= 4; i++) {
      var yFraction = i / 4;
      var yVal = Math.round(maxY * (1 - yFraction));
      var yPos = padT + yFraction * plotH;

      svg += '<line class="xow-chart-grid-line" x1="' + padL + '" y1="' + yPos + '" x2="' + (svgW - padR) + '" y2="' + yPos + '"/>';
      svg += '<text class="xow-chart-axis-label" x="' + (padL - 10) + '" y="' + (yPos + 4) + '" text-anchor="end">' + yVal + '</text>';
    }

    // X Axis baseline
    svg += '<line class="xow-chart-axis-line" x1="' + padL + '" y1="' + (padT + plotH) + '" x2="' + (svgW - padR) + '" y2="' + (padT + plotH) + '"/>';

    var numBuckets = buckets.length;
    var getX = function (index) {
      if (numBuckets <= 1) return padL + plotW / 2;
      return padL + (index / (numBuckets - 1)) * plotW;
    };
    var getY = function (val) {
      return padT + plotH - (val / maxY) * plotH;
    };

    // X Axis Labels (Thinning out if needed to prevent label crowding)
    var step = 1;
    if (numBuckets > 20) step = Math.ceil(numBuckets / 10);
    else if (numBuckets > 10) step = 2;

    for (var bIdx = 0; bIdx < numBuckets; bIdx++) {
      if (bIdx % step === 0 || bIdx === numBuckets - 1) {
        var bx = getX(bIdx);
        svg += '<text class="xow-chart-axis-label" x="' + bx + '" y="' + (padT + plotH + 22) + '" text-anchor="middle">' + escapeHtml(buckets[bIdx].label) + '</text>';
      }
    }

    // Render Series Area and Paths
    activeParams.forEach(function (pId) {
      var pDef = ANALYTICS_PARAMETERS[pId];
      if (numBuckets === 0) return;

      var points = [];
      for (var idx = 0; idx < numBuckets; idx++) {
        var vx = getX(idx);
        var vy = getY(buckets[idx].counts[pId] || 0);
        points.push({ x: vx, y: vy, val: buckets[idx].counts[pId] || 0 });
      }

      // Smooth Cubic Bezier Spline Path
      var lineD = 'M ' + points[0].x + ' ' + points[0].y;
      for (var p = 0; p < points.length - 1; p++) {
        var p0 = points[p];
        var p1 = points[p + 1];
        var mx = (p0.x + p1.x) / 2;
        lineD += ' C ' + mx + ' ' + p0.y + ', ' + mx + ' ' + p1.y + ', ' + p1.x + ' ' + p1.y;
      }

      var areaD = lineD + ' L ' + points[points.length - 1].x + ' ' + (padT + plotH) + ' L ' + points[0].x + ' ' + (padT + plotH) + ' Z';

      // Area fill
      svg += '<path class="xow-chart-series-area" d="' + areaD + '" fill="url(#grad_' + pId + ')"/>';

      // Line stroke
      svg += '<path class="xow-chart-series-path" d="' + lineD + '" stroke="' + pDef.color + '"/>';

      // Data Points
      points.forEach(function (pt, ptIdx) {
        svg += '<circle class="xow-chart-point" cx="' + pt.x + '" cy="' + pt.y + '" r="3.5" fill="' + pDef.color + '" stroke="#0F172A" data-bucket-idx="' + ptIdx + '" data-param-id="' + pId + '"/>';
      });
    });

    // Crosshair line (hidden initially)
    svg += '<line class="xow-chart-crosshair" id="chartCrosshairLine" x1="0" y1="' + padT + '" x2="0" y2="' + (padT + plotH) + '" style="display: none;"/>';

    el.analyticsChartSvg.innerHTML = svg;
    setupChartInteractions(buckets, activeParams, padL, padR, padT, plotW, plotH);
  }

  function setupChartInteractions(buckets, activeParams, padL, padR, padT, plotW, plotH) {
    if (!el.analyticsChartContainer || !el.chartTooltip) return;

    var crosshair = doc.getElementById('chartCrosshairLine');

    el.analyticsChartContainer.onmousemove = function (e) {
      var rect = el.analyticsChartContainer.getBoundingClientRect();
      var mouseX = e.clientX - rect.left;
      var mouseY = e.clientY - rect.top;

      // Scale coordinates to SVG viewBox (960x380)
      var svgScaleX = 960 / rect.width;
      var svgX = mouseX * svgScaleX;

      if (svgX < padL || svgX > (960 - padR) || buckets.length === 0) {
        if (crosshair) crosshair.style.display = 'none';
        el.chartTooltip.hidden = true;
        return;
      }

      // Find nearest bucket
      var numBuckets = buckets.length;
      var ratio = (svgX - padL) / plotW;
      var nearestIdx = Math.round(ratio * (numBuckets - 1));
      nearestIdx = Math.max(0, Math.min(numBuckets - 1, nearestIdx));

      var bucket = buckets[nearestIdx];
      var bucketSvgX = numBuckets <= 1 ? (padL + plotW / 2) : (padL + (nearestIdx / (numBuckets - 1)) * plotW);

      if (crosshair) {
        crosshair.setAttribute('x1', bucketSvgX);
        crosshair.setAttribute('x2', bucketSvgX);
        crosshair.style.display = '';
      }

      // Build Tooltip HTML
      var ttHtml = '<div class="xow-chart-tooltip-date">' + escapeHtml(bucket.label) + ' (' + escapeHtml(bucket.key) + ')</div>';
      activeParams.forEach(function (pId) {
        var pDef = ANALYTICS_PARAMETERS[pId];
        var val = bucket.counts[pId] || 0;
        var pName = t(pDef.labelKey) || pDef.labelDefault;
        ttHtml += '<div class="xow-chart-tooltip-item">';
        ttHtml += '  <div class="xow-chart-tooltip-label">';
        ttHtml += '    <span class="xow-param-dot" style="background: ' + pDef.color + '"></span>';
        ttHtml += '    <span>' + escapeHtml(pName) + ':</span>';
        ttHtml += '  </div>';
        ttHtml += '  <span class="xow-chart-tooltip-val">' + val.toLocaleString() + '</span>';
        ttHtml += '</div>';
      });

      el.chartTooltip.innerHTML = ttHtml;
      el.chartTooltip.hidden = false;

      // Position Tooltip
      var ttWidth = el.chartTooltip.offsetWidth || 190;
      var leftPos = mouseX + 16;
      if (leftPos + ttWidth > rect.width - 16) {
        leftPos = mouseX - ttWidth - 16;
      }
      var topPos = Math.max(10, Math.min(rect.height - 120, mouseY - 20));

      el.chartTooltip.style.left = leftPos + 'px';
      el.chartTooltip.style.top = topPos + 'px';
    };

    el.analyticsChartContainer.onmouseleave = function () {
      if (crosshair) crosshair.style.display = 'none';
      if (el.chartTooltip) el.chartTooltip.hidden = true;
    };
  }

  function loadDashboardAnalytics() {
    renderParameterPills();

    var pUsers = pb.collection(USERS_COLLECTION).getFullList({ sort: '-created' }).catch(function () { return []; });
    var pReports = pb.collection(REPORTS_COLLECTION).getFullList({ sort: '-created' }).catch(function () { return []; });
    var pTransfers = pb.collection(SERVER_TRANSFERS_COLLECTION).getFullList({ sort: '-created' }).catch(function () { return []; });
    var pEvents = pb.collection(SYSTEM_EVENTS_COLLECTION).getFullList({ sort: '-created' }).catch(function () { return []; });
    var pAlbums = pb.collection(ALBUMS_COLLECTION).getFullList({ sort: '-created' }).catch(function () { return []; });

    return Promise.all([pUsers, pReports, pTransfers, pEvents, pAlbums])
      .then(function (results) {
        state.analyticsRawData = {
          users: results[0] || [],
          reports: results[1] || [],
          transfers: results[2] || [],
          systemEvents: results[3] || [],
          albums: results[4] || []
        };

        state.analyticsCurrentKpis = computeCurrentKpis(state.analyticsRawData);
        renderCurrentKpis(state.analyticsCurrentKpis);
        renderAnalyticsChart();
      })
      .catch(function (err) {
        console.error('Error loading dashboard analytics:', err);
        showToast('Error cargando métricas analíticas: ' + ((err && err.message) || 'desconocido'), 'error');
      });
  }

  // ------------------------------------------------------------------
  // Main Module Navigation
  // ------------------------------------------------------------------
  function switchMainSection(sectionName) {
    if (!sectionName) sectionName = 'dashboard';
    state.activeMainSection = sectionName;

    try {
      if (typeof window !== 'undefined') {
        if (window.sessionStorage) window.sessionStorage.setItem('xow_admin_active_section', sectionName);
        if (window.location.hash !== '#' + sectionName) {
          history.replaceState(null, '', '#' + sectionName);
        }
      }
    } catch (e) {}

    var navTabs = [el.tabNavDashboard, el.tabNavFunding, el.tabNavReports, el.tabNavUsers].filter(Boolean);
    navTabs.forEach(function (tab) {
      var sec = tab.getAttribute('data-main-section');
      var isActive = sec === sectionName;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    if (el.secDashboard) {
      el.secDashboard.hidden = (sectionName !== 'dashboard');
      el.secDashboard.classList.toggle('active', sectionName === 'dashboard');
    }
    if (el.secFunding) {
      el.secFunding.hidden = (sectionName !== 'funding');
      el.secFunding.classList.toggle('active', sectionName === 'funding');
    }
    if (el.secReports) {
      el.secReports.hidden = (sectionName !== 'reports');
      el.secReports.classList.toggle('active', sectionName === 'reports');
    }
    if (el.secUsers) {
      el.secUsers.hidden = (sectionName !== 'users');
      el.secUsers.classList.toggle('active', sectionName === 'users');
    }

    if (sectionName === 'dashboard') {
      loadDashboardAnalytics();
    } else if (sectionName === 'funding') {
      renderDashboard();
    } else if (sectionName === 'reports') {
      loadReports();
    } else if (sectionName === 'users') {
      if (state.activeUserTab === 'directory') {
        loadUsers();
      } else {
        loadReservedHandles();
      }
    }
  }

  function switchUserTab(tabName) {
    state.activeUserTab = tabName;

    var userTabs = [el.tabBtnUserDirectory, el.tabBtnUserReserved].filter(Boolean);
    userTabs.forEach(function (tab) {
      var t = tab.getAttribute('data-user-tab');
      var isActive = t === tabName;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    if (el.panelUserDirectory) el.panelUserDirectory.classList.toggle('active', tabName === 'directory');
    if (el.panelUserReserved) el.panelUserReserved.classList.toggle('active', tabName === 'reserved');

    if (tabName === 'directory') {
      loadUsers();
    } else {
      loadReservedHandles();
    }
  }

  // ------------------------------------------------------------------
  // Reports (UGC) Moderation Module
  // ------------------------------------------------------------------
  function calculateReportMetrics(reports) {
    var total = (reports && reports.length) || 0;
    var pending = 0;
    var inReview = 0;
    var actionTaken = 0;
    var dismissed = 0;

    var categoryCounts = {
      spam: 0,
      harassment: 0,
      inappropriate: 0,
      impersonation: 0,
      other: 0,
    };

    var contentCounts = {
      album: 0,
      message: 0,
      user: 0,
      media: 0,
    };

    var totalDurationMs = 0;
    var resolvedCountWithDates = 0;
    var within24hCount = 0;

    (reports || []).forEach(function (r) {
      var st = (r.status || 'pending').toLowerCase();
      if (st === 'pending') pending++;
      else if (st === 'in_review') inReview++;
      else if (st === 'action_taken') actionTaken++;
      else if (st === 'dismissed') dismissed++;
      else pending++;

      var cat = (r.abuse_category || 'other').toLowerCase();
      if (categoryCounts[cat] !== undefined) categoryCounts[cat]++;
      else categoryCounts.other = (categoryCounts.other || 0) + 1;

      var cnt = (r.content_type || 'album').toLowerCase();
      if (contentCounts[cnt] !== undefined) contentCounts[cnt]++;
      else contentCounts[cnt] = 1;

      if (r.resolved_at && r.created) {
        var tCreated = new Date(r.created).getTime();
        var tResolved = new Date(r.resolved_at).getTime();
        if (!isNaN(tCreated) && !isNaN(tResolved) && tResolved >= tCreated) {
          var diff = tResolved - tCreated;
          totalDurationMs += diff;
          resolvedCountWithDates++;
          if (diff <= 24 * 3600 * 1000) {
            within24hCount++;
          }
        }
      }
    });

    var resolvedTotal = actionTaken + dismissed;
    var slaPct = resolvedCountWithDates > 0 ? (within24hCount / resolvedCountWithDates) * 100 : 100;
    var avgTimeHours = resolvedCountWithDates > 0 ? (totalDurationMs / resolvedCountWithDates) / (3600 * 1000) : 0;

    return {
      total: total,
      pending: pending,
      inReview: inReview,
      actionTaken: actionTaken,
      dismissed: dismissed,
      resolvedTotal: resolvedTotal,
      categoryCounts: categoryCounts,
      contentCounts: contentCounts,
      slaPct: slaPct,
      avgTimeHours: avgTimeHours,
    };
  }

  function filterReports(reports, filter) {
    if (!reports) return [];
    var search = (filter.search || '').trim().toLowerCase();
    var status = (filter.status || '').trim().toLowerCase();
    var category = (filter.category || '').trim().toLowerCase();
    var content = (filter.content || '').trim().toLowerCase();
    var blocked = filter.blocked;
    var sort = filter.sort || 'created_desc';

    var filtered = reports.filter(function (r) {
      var rStatus = (r.status || 'pending').toLowerCase();
      if (status && rStatus !== status) return false;

      var rCat = (r.abuse_category || 'other').toLowerCase();
      if (category && rCat !== category) return false;

      var rContent = (r.content_type || '').toLowerCase();
      if (content && rContent !== content) return false;

      if (blocked === 'true' && !r.is_blocked) return false;
      if (blocked === 'false' && r.is_blocked) return false;

      if (search) {
        var str = [
          r.id,
          r.reporter_id,
          r.target_user_id,
          r.album_id,
          r.description,
          r.moderation_notes,
        ].filter(Boolean).join(' ').toLowerCase();
        if (str.indexOf(search) === -1) return false;
      }

      return true;
    });

    filtered.sort(function (a, b) {
      if (sort === 'created_asc') {
        return new Date(a.created || 0) - new Date(b.created || 0);
      }
      if (sort === 'pending_first') {
        var aPending = (a.status || 'pending') === 'pending' || a.status === 'in_review';
        var bPending = (b.status || 'pending') === 'pending' || b.status === 'in_review';
        if (aPending && !bPending) return -1;
        if (!aPending && bPending) return 1;
        return new Date(b.created || 0) - new Date(a.created || 0);
      }
      return new Date(b.created || 0) - new Date(a.created || 0);
    });

    return filtered;
  }

  function loadReports() {
    return pb.collection(REPORTS_COLLECTION).getFullList({ sort: '-created' })
      .then(function (list) {
        state.reports = list || [];
        renderReportsSection();
        subscribeReportsRealtime();
      })
      .catch(function (err) {
        console.error('Error loading reports:', err);
        var status = err && err.status;
        if (status === 403) {
          showToast('Error 403: web_admins no tiene permisos para listar la colección reports en PocketBase', 'error');
        } else {
          showToast('Error cargando denuncias de PocketBase: ' + ((err && err.message) || 'desconocido'), 'error');
        }
      });
  }

  function subscribeReportsRealtime() {
    if (state.reportsSubscribed || !pb) return;
    try {
      pb.collection(REPORTS_COLLECTION).subscribe('*', function (e) {
        if (e.action === 'create') {
          var exists = state.reports.some(function (r) { return r.id === e.record.id; });
          if (!exists) {
            state.reports.unshift(e.record);
            showToast('🚨 Nueva denuncia recibida #' + e.record.id.slice(0, 6), 'info');
          }
        } else if (e.action === 'update') {
          var idx = state.reports.findIndex(function (r) { return r.id === e.record.id; });
          if (idx !== -1) {
            state.reports[idx] = e.record;
          } else {
            state.reports.unshift(e.record);
          }
        } else if (e.action === 'delete') {
          state.reports = state.reports.filter(function (r) { return r.id !== e.record.id; });
        }
        renderReportsSection();
      }).then(function () {
        state.reportsSubscribed = true;
      }).catch(function (err) {
        console.warn('Realtime reports subscription failed:', err);
      });
    } catch (e) {
      console.warn('Realtime subscription not available:', e);
    }
  }

  function renderReportsSection() {
    if (!el.secReports) return;

    var metrics = calculateReportMetrics(state.reports);

    if (el.kpiRepTotal) el.kpiRepTotal.textContent = String(metrics.total);
    if (el.kpiRepPending) el.kpiRepPending.textContent = String(metrics.pending + metrics.inReview);
    if (el.kpiRepPendingSub) el.kpiRepPendingSub.textContent = metrics.pending + ' pendientes, ' + metrics.inReview + ' en revisión';
    if (el.kpiRepResolved) el.kpiRepResolved.textContent = String(metrics.resolvedTotal);
    if (el.kpiRepResolvedSub) el.kpiRepResolvedSub.textContent = metrics.actionTaken + ' acción tomada, ' + metrics.dismissed + ' desestimadas';
    if (el.kpiRepSla) el.kpiRepSla.textContent = metrics.slaPct.toFixed(1) + '%';
    if (el.kpiRepAvgTime) {
      el.kpiRepAvgTime.textContent = metrics.avgTimeHours > 0
        ? 'Tiempo medio: ' + metrics.avgTimeHours.toFixed(1) + 'h'
        : 'Tiempo medio: -';
    }

    var pendingCount = metrics.pending + metrics.inReview;
    if (el.reportsPendingBadge) {
      if (pendingCount > 0) {
        el.reportsPendingBadge.hidden = false;
        el.reportsPendingBadge.textContent = String(pendingCount);
      } else {
        el.reportsPendingBadge.hidden = true;
      }
    }

    if (el.repCategoryChips) {
      var catLabels = {
        spam: 'Spam / Publicidad',
        harassment: 'Acoso / Odio',
        inappropriate: 'Contenido Inapropiado',
        impersonation: 'Suplantación',
        other: 'Otros',
      };
      var chipsHtml = '';
      Object.keys(metrics.categoryCounts).forEach(function (cat) {
        var count = metrics.categoryCounts[cat];
        var lbl = catLabels[cat] || cat;
        chipsHtml += '<div class="xow-chip"><span>' + escapeHtml(lbl) + '</span><span class="xow-chip-count">' + count + '</span></div>';
      });
      el.repCategoryChips.innerHTML = chipsHtml;
    }

    if (el.repContentChips) {
      var contentLabels = {
        album: 'Álbum',
        message: 'Mensaje / Chat',
        user: 'Perfil / Usuario',
        media: 'Foto / Vídeo',
      };
      var cntHtml = '';
      Object.keys(metrics.contentCounts).forEach(function (cnt) {
        var count = metrics.contentCounts[cnt];
        var lbl = contentLabels[cnt] || cnt;
        cntHtml += '<div class="xow-chip"><span>' + escapeHtml(lbl) + '</span><span class="xow-chip-count">' + count + '</span></div>';
      });
      el.repContentChips.innerHTML = cntHtml;
    }

    var filtered = filterReports(state.reports, state.reportsFilter);
    if (!filtered.length) {
      if (el.reportsTableBody) el.reportsTableBody.innerHTML = '';
      if (el.reportsEmptyState) el.reportsEmptyState.hidden = false;
      return;
    }
    if (el.reportsEmptyState) el.reportsEmptyState.hidden = true;

    var rows = '';
    filtered.forEach(function (r) {
      var statusClass = r.status || 'pending';
      var statusLabel = {
        pending: 'Pendiente',
        in_review: 'En Revisión',
        action_taken: 'Acción Tomada',
        dismissed: 'Desestimada',
      }[statusClass] || statusClass;

      var actionLabel = {
        none: 'Ninguna',
        user_blocked: 'Usuario Baneado',
        warning_issued: 'Advertencia',
        content_flagged: 'Contenido Marcado',
        dismissed: 'Desestimada',
      }[r.action_taken || 'none'] || (r.action_taken || '-');

      var dateStr = r.created ? new Date(r.created).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '-';
      var reporterShort = r.reporter_id ? r.reporter_id.slice(0, 10) + '...' : '-';
      var targetShort = r.target_user_id ? r.target_user_id.slice(0, 10) + '...' : '-';

      rows += '<tr>';
      rows += '  <td><span style="font-size: 12.5px; color: var(--text-muted);">' + escapeHtml(dateStr) + '</span></td>';
      rows += '  <td><span class="xow-badge" style="font-size: 11px;">' + escapeHtml(r.content_type || 'album') + '</span></td>';
      rows += '  <td><strong>' + escapeHtml(r.abuse_category || 'other') + '</strong></td>';
      rows += '  <td><span class="font-mono" style="font-size: 12px;" title="' + escapeHtml(r.reporter_id || '') + '">' + escapeHtml(reporterShort) + '</span></td>';
      rows += '  <td><span class="font-mono" style="font-size: 12px; color: var(--teal-accent);" title="' + escapeHtml(r.target_user_id || '') + '">' + escapeHtml(targetShort) + '</span></td>';
      rows += '  <td><span class="xow-badge ' + statusClass + '">' + escapeHtml(statusLabel) + '</span></td>';
      rows += '  <td><span style="font-size: 12px; color: var(--text-muted);">' + escapeHtml(actionLabel) + '</span></td>';
      rows += '  <td>';
      rows += '    <div class="cell-actions">';
      rows += '      <button type="button" class="btn btn-secondary btn-xs" data-report-detail-id="' + r.id + '" title="Ver detalle y moderar">';
      rows += '        <svg class="icon icon-sm"><use href="#i-flag"></use></svg>';
      rows += '        <span>Moderar</span>';
      rows += '      </button>';
      rows += '    </div>';
      rows += '  </td>';
      rows += '</tr>';
    });

    if (el.reportsTableBody) el.reportsTableBody.innerHTML = rows;
  }

  function openReportModal(report) {
    if (!report) return;
    state.selectedReport = report;

    if (el.repDetailId) el.repDetailId.value = report.id;
    if (el.repDetailIdText) el.repDetailIdText.textContent = report.id;
    if (el.repDetailDateText) el.repDetailDateText.textContent = report.created ? new Date(report.created).toLocaleString() : '-';
    if (el.repDetailContentTypeText) el.repDetailContentTypeText.textContent = report.content_type || 'album';
    if (el.repDetailCategoryText) el.repDetailCategoryText.textContent = report.abuse_category || 'other';
    if (el.repDetailReporterText) el.repDetailReporterText.textContent = report.reporter_id || '-';
    if (el.repDetailTargetText) el.repDetailTargetText.textContent = report.target_user_id || '-';
    if (el.repDetailAlbumIdText) el.repDetailAlbumIdText.textContent = report.album_id || '-';
    if (el.repDetailBlockedText) {
      el.repDetailBlockedText.textContent = report.is_blocked ? 'Sí (Bloqueado por usuario)' : 'No';
      el.repDetailBlockedText.style.color = report.is_blocked ? '#ef4444' : 'inherit';
    }
    if (el.repDetailDescriptionText) {
      el.repDetailDescriptionText.textContent = report.description || '(Sin descripción proporcionada)';
    }

    var status = report.status || 'pending';
    if (el.modalRepStatusBadge) {
      el.modalRepStatusBadge.className = 'xow-badge ' + status;
      el.modalRepStatusBadge.textContent = {
        pending: 'Pendiente',
        in_review: 'En Revisión',
        action_taken: 'Acción Tomada',
        dismissed: 'Desestimada',
      }[status] || status;
    }

    if (el.repModStatus) el.repModStatus.value = status;
    if (el.repModAction) el.repModAction.value = report.action_taken || 'none';
    if (el.repModNotes) el.repModNotes.value = report.moderation_notes || '';

    if (el.modalReportDetailBackdrop) el.modalReportDetailBackdrop.classList.add('open');
  }

  function closeReportModal() {
    state.selectedReport = null;
    if (el.modalReportDetailBackdrop) el.modalReportDetailBackdrop.classList.remove('open');
  }

  function saveReportResolution(reportId, status, actionTaken, notes) {
    var adminEmail = (pb.authStore && pb.authStore.record && pb.authStore.record.email) || 'Admin';
    var isResolved = (status === 'action_taken' || status === 'dismissed');

    var data = {
      status: status,
      action_taken: actionTaken,
      moderation_notes: notes,
      resolved_at: isResolved ? new Date().toISOString() : '',
      resolved_by: isResolved ? adminEmail : '',
    };

    return pb.collection(REPORTS_COLLECTION).update(reportId, data)
      .then(function (updated) {
        var idx = state.reports.findIndex(function (r) { return r.id === reportId; });
        if (idx !== -1) state.reports[idx] = updated;
        showToast('Resolución de denuncia guardada', 'success');
        closeReportModal();
        renderReportsSection();
      })
      .catch(function (err) {
        console.error('Save report resolution error:', err);
        showToast('Error guardando resolución de denuncia', 'error');
      });
  }

  function banReportedUserFromReport(report) {
    if (!report || !report.target_user_id) {
      showToast('No hay ID de usuario denunciado para bloquear', 'error');
      return;
    }

    if (!confirm('¿Estás seguro de que deseas banear y bloquear al usuario denunciado (' + report.target_user_id + ')?')) return;

    var adminEmail = (pb.authStore && pb.authStore.record && pb.authStore.record.email) || 'Admin';

    pb.collection(USERS_COLLECTION).update(report.target_user_id, {
      is_banned: true,
      ban_reason: 'Baneado por moderación debido a denuncia #' + report.id,
    })
      .then(function () {
        return pb.collection(REPORTS_COLLECTION).update(report.id, {
          status: 'action_taken',
          action_taken: 'user_blocked',
          moderation_notes: (report.moderation_notes ? report.moderation_notes + '\n' : '') + 'Usuario bloqueado por administración.',
          resolved_at: new Date().toISOString(),
          resolved_by: adminEmail,
        });
      })
      .then(function (updatedReport) {
        var idx = state.reports.findIndex(function (r) { return r.id === report.id; });
        if (idx !== -1) state.reports[idx] = updatedReport;
        showToast('Usuario bloqueado y denuncia resuelta', 'success');
        closeReportModal();
        renderReportsSection();
      })
      .catch(function (err) {
        console.error('Ban user from report error:', err);
        showToast('Error al bloquear usuario denunciado', 'error');
      });
  }

  function dismissReportFromModal(report) {
    if (!report) return;
    if (!confirm('¿Deseas desestimar esta denuncia?')) return;

    var adminEmail = (pb.authStore && pb.authStore.record && pb.authStore.record.email) || 'Admin';

    pb.collection(REPORTS_COLLECTION).update(report.id, {
      status: 'dismissed',
      action_taken: 'dismissed',
      resolved_at: new Date().toISOString(),
      resolved_by: adminEmail,
    })
      .then(function (updatedReport) {
        var idx = state.reports.findIndex(function (r) { return r.id === report.id; });
        if (idx !== -1) state.reports[idx] = updatedReport;
        showToast('Denuncia desestimada', 'info');
        closeReportModal();
        renderReportsSection();
      })
      .catch(function (err) {
        console.error('Dismiss report error:', err);
        showToast('Error desestimando denuncia', 'error');
      });
  }

  // ------------------------------------------------------------------
  // Users & Reserved Handles Module
  // ------------------------------------------------------------------
  var userSearchDebounceTimer = null;

  function loadUsers() {
    if (el.userSearchHandleInput) state.userSearchHandle = el.userSearchHandleInput.value;
    if (el.userSearchNameInput) state.userSearchName = el.userSearchNameInput.value;
    if (el.userStatusFilter) state.userStatusFilter = el.userStatusFilter.value;

    var filterParts = [];
    var handleQuery = (state.userSearchHandle || '').trim().replace(/^@+/, '');
    var nameQuery = (state.userSearchName || '').trim();

    if (handleQuery) {
      filterParts.push('handle ~ "' + escapePbFilter(handleQuery) + '"');
    }
    if (nameQuery) {
      filterParts.push('name ~ "' + escapePbFilter(nameQuery) + '"');
    }
    if (state.userStatusFilter === 'active') {
      filterParts.push('is_banned != true');
    } else if (state.userStatusFilter === 'banned') {
      filterParts.push('is_banned = true');
    }

    var filterStr = filterParts.join(' && ');

    if (el.usersCountLabel) el.usersCountLabel.textContent = 'Buscando usuarios...';

    return pb.collection(USERS_COLLECTION).getList(1, 50, {
      sort: '-created',
      filter: filterStr || undefined,
    })
      .then(function (result) {
        state.users = (result && result.items) || [];
        renderUsersSection(result ? result.totalItems : 0);
      })
      .catch(function (err) {
        console.error('Error loading users:', err);
        state.users = [];
        renderUsersSection(0);
        var status = err && err.status;
        if (status === 403) {
          showToast('Error 403: web_admins no tiene permisos para listar la colección users en PocketBase', 'error');
        } else {
          showToast('Error buscando usuarios en PocketBase: ' + ((err && err.message) || 'desconocido'), 'error');
        }
      });
  }

  function renderUsersSection(totalCount) {
    if (!el.usersTableBody) return;

    if (!state.users.length) {
      el.usersTableBody.innerHTML = '';
      if (el.usersEmptyState) el.usersEmptyState.hidden = false;
      if (el.usersCountLabel) el.usersCountLabel.textContent = '0 usuarios encontrados';
      return;
    }
    if (el.usersEmptyState) el.usersEmptyState.hidden = true;
    if (el.usersCountLabel) {
      el.usersCountLabel.textContent = 'Mostrando ' + state.users.length + ' de ' + (totalCount || state.users.length) + ' usuarios';
    }

    var rows = '';
    state.users.forEach(function (u) {
      var name = u.name || 'Sin nombre';
      var handle = u.handle ? '@' + u.handle : '-';
      var initials = (name.slice(0, 2) || 'XA').toUpperCase();
      var isBanned = !!u.is_banned;
      var statusBadge = isBanned
        ? '<span class="xow-badge banned">Baneado</span>'
        : '<span class="xow-badge active">Activo</span>';

      var createdStr = u.created ? new Date(u.created).toLocaleDateString() : '-';
      var lastSeenStr = u.last_seen ? new Date(u.last_seen).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '-';

      rows += '<tr>';
      rows += '  <td>';
      rows += '    <div style="display: flex; align-items: center; gap: 10px;">';
      rows += '      <div class="xow-user-avatar-sm">' + escapeHtml(initials) + '</div>';
      rows += '      <strong>' + escapeHtml(name) + '</strong>';
      rows += '    </div>';
      rows += '  </td>';
      rows += '  <td><span style="color: var(--teal-accent); font-weight: 600;">' + escapeHtml(handle) + '</span></td>';
      rows += '  <td><span class="xow-badge" style="font-size: 11px;">' + (u.trust_score !== undefined ? u.trust_score : '-') + '</span></td>';
      rows += '  <td><span style="color: var(--text-muted); font-size: 12.5px;">' + escapeHtml(createdStr) + '</span></td>';
      rows += '  <td><span style="color: var(--text-muted); font-size: 12.5px;">' + escapeHtml(lastSeenStr) + '</span></td>';
      rows += '  <td>' + statusBadge + '</td>';
      rows += '  <td>';
      rows += '    <div class="cell-actions">';
      rows += '      <button type="button" class="btn btn-secondary btn-xs" data-user-detail-id="' + u.id + '" title="Ver Ficha Detallada">';
      rows += '        <svg class="icon icon-sm"><use href="#i-person"></use></svg>';
      rows += '        <span>Ficha</span>';
      rows += '      </button>';
      if (isBanned) {
        rows += '      <button type="button" class="btn btn-secondary btn-xs" data-user-unban-id="' + u.id + '" title="Reactivar Usuario" style="color: #10b981;">';
        rows += '        <span>Reactivar</span>';
        rows += '      </button>';
      } else {
        rows += '      <button type="button" class="btn btn-danger btn-xs" data-user-ban-id="' + u.id + '" title="Suspender Usuario">';
        rows += '        <span>Banear</span>';
        rows += '      </button>';
      }
      rows += '    </div>';
      rows += '  </td>';
      rows += '</tr>';
    });

    el.usersTableBody.innerHTML = rows;
  }

  function openUserModal(userId) {
    if (!userId) return;

    var safeUserId = escapePbFilter(userId);
    var existingUser = state.users.find(function (u) { return u.id === userId; });
    var pUser = existingUser ? Promise.resolve(existingUser) : pb.collection(USERS_COLLECTION).getOne(userId).catch(function () { return null; });

    var pReportsReceived = pb.collection(REPORTS_COLLECTION).getList(1, 20, {
      filter: 'target_user_id = "' + safeUserId + '"',
      sort: '-created',
    }).catch(function () { return { items: [] }; });

    var pReportsMade = pb.collection(REPORTS_COLLECTION).getList(1, 20, {
      filter: 'reporter_id = "' + safeUserId + '"',
      sort: '-created',
    }).catch(function () { return { items: [] }; });

    Promise.all([pUser, pReportsReceived, pReportsMade])
      .then(function (results) {
        var user = results[0];
        var repReceived = (results[1] && results[1].items) || [];
        var repMade = (results[2] && results[2].items) || [];

        if (!user) {
          showToast('Usuario no encontrado en PocketBase', 'error');
          return;
        }

        state.selectedUser = user;
        state.userReportsReceived = repReceived;
        state.userReportsMade = repMade;

        var name = user.name || 'Sin nombre';
        var handle = user.handle ? '@' + user.handle : '(sin @handle)';
        var initials = (name.slice(0, 2) || 'XA').toUpperCase();
        var isBanned = !!user.is_banned;

        if (el.modalUserId) el.modalUserId.value = user.id;
        if (el.modalUserAvatar) el.modalUserAvatar.textContent = initials;
        if (el.modalUserName) el.modalUserName.textContent = name;
        if (el.modalUserHandle) el.modalUserHandle.textContent = handle;

        if (el.modalUserStatusBadge) {
          el.modalUserStatusBadge.className = isBanned ? 'xow-badge banned' : 'xow-badge active';
          el.modalUserStatusBadge.textContent = isBanned ? 'Baneado' : 'Activo';
        }

        if (el.modalUserIdText) el.modalUserIdText.textContent = user.id;
        if (el.modalUserTrustText) el.modalUserTrustText.textContent = String(user.trust_score !== undefined ? user.trust_score : '-');
        if (el.modalUserLocaleText) el.modalUserLocaleText.textContent = user.locale || 'es';
        if (el.modalUserVersionText) el.modalUserVersionText.textContent = (user.app_version || '-') + (user.app_build ? ' (' + user.app_build + ')' : '');
        if (el.modalUserCreatedText) el.modalUserCreatedText.textContent = user.created ? new Date(user.created).toLocaleString() : '-';
        if (el.modalUserLastSeenText) el.modalUserLastSeenText.textContent = user.last_seen ? new Date(user.last_seen).toLocaleString() : '-';

        if (el.modalUserBanBanner) {
          el.modalUserBanBanner.hidden = !isBanned;
          if (el.modalUserBanReasonText) el.modalUserBanReasonText.textContent = user.ban_reason || 'Sin motivo especificado.';
        }

        if (el.btnToggleUserBanText) {
          el.btnToggleUserBanText.textContent = isBanned ? 'Reactivar / Desbloquear Cuenta' : 'Suspender / Bloquear Cuenta';
        }
        if (el.btnToggleUserBan) {
          el.btnToggleUserBan.className = isBanned ? 'btn btn-primary' : 'btn btn-danger';
        }

        if (el.modalUserReportsReceivedCount) el.modalUserReportsReceivedCount.textContent = String(repReceived.length);
        if (el.modalUserReportsReceivedList) {
          if (!repReceived.length) {
            el.modalUserReportsReceivedList.innerHTML = '<p class="xow-text-muted" style="font-size: 13px;">Sin denuncias registradas.</p>';
          } else {
            var recHtml = '';
            repReceived.forEach(function (r) {
              recHtml += '<div class="xow-history-item">';
              recHtml += '  <div><strong>' + escapeHtml(r.abuse_category || 'other') + '</strong> <span style="color:var(--text-muted); font-size:11.5px;">(' + (r.created ? new Date(r.created).toLocaleDateString() : '-') + ')</span></div>';
              recHtml += '  <span class="xow-badge ' + (r.status || 'pending') + '">' + escapeHtml(r.status || 'pending') + '</span>';
              recHtml += '</div>';
            });
            el.modalUserReportsReceivedList.innerHTML = recHtml;
          }
        }

        if (el.modalUserReportsMadeCount) el.modalUserReportsMadeCount.textContent = String(repMade.length);
        if (el.modalUserReportsMadeList) {
          if (!repMade.length) {
            el.modalUserReportsMadeList.innerHTML = '<p class="xow-text-muted" style="font-size: 13px;">Sin denuncias realizadas.</p>';
          } else {
            var madeHtml = '';
            repMade.forEach(function (r) {
              madeHtml += '<div class="xow-history-item">';
              madeHtml += '  <div><strong>' + escapeHtml(r.abuse_category || 'other') + '</strong> <span style="color:var(--text-muted); font-size:11.5px;">(' + (r.created ? new Date(r.created).toLocaleDateString() : '-') + ')</span></div>';
              madeHtml += '  <span class="xow-badge ' + (r.status || 'pending') + '">' + escapeHtml(r.status || 'pending') + '</span>';
              madeHtml += '</div>';
            });
            el.modalUserReportsMadeList.innerHTML = madeHtml;
          }
        }

        if (el.modalUserDetailBackdrop) el.modalUserDetailBackdrop.classList.add('open');
      })
      .catch(function (err) {
        console.error('Error opening user modal:', err);
        showToast('Error cargando ficha de usuario', 'error');
      });
  }

  function closeUserModal() {
    state.selectedUser = null;
    if (el.modalUserDetailBackdrop) el.modalUserDetailBackdrop.classList.remove('open');
  }

  function toggleUserBan(user) {
    if (!user) return;
    var currentlyBanned = !!user.is_banned;

    if (currentlyBanned) {
      if (!confirm('¿Deseas reactivar la cuenta de @' + (user.handle || user.name) + '?')) return;
      pb.collection(USERS_COLLECTION).update(user.id, { is_banned: false, ban_reason: '' })
        .then(function (updated) {
          var idx = state.users.findIndex(function (u) { return u.id === user.id; });
          if (idx !== -1) state.users[idx] = updated;
          showToast('Cuenta de usuario reactivada con éxito', 'success');
          closeUserModal();
          renderUsersSection();
        })
        .catch(function (err) {
          console.error('Unban user error:', err);
          showToast('Error reactivando la cuenta', 'error');
        });
    } else {
      var reason = prompt('Motivo de la suspensión / baneo de @' + (user.handle || user.name) + ':', 'Violación de Términos de Servicio / Conducta Inapropiada');
      if (reason === null) return;
      reason = reason.trim() || 'Suspendido por administración.';

      pb.collection(USERS_COLLECTION).update(user.id, { is_banned: true, ban_reason: reason })
        .then(function (updated) {
          var idx = state.users.findIndex(function (u) { return u.id === user.id; });
          if (idx !== -1) state.users[idx] = updated;
          showToast('Cuenta de usuario suspendida / baneada', 'success');
          closeUserModal();
          renderUsersSection();
        })
        .catch(function (err) {
          console.error('Ban user error:', err);
          showToast('Error suspendiendo la cuenta', 'error');
        });
    }
  }

  function loadReservedHandles() {
    return pb.collection(RESERVED_HANDLES_COLLECTION).getFullList({ sort: 'handle' })
      .then(function (list) {
        state.reservedHandles = list || [];
        renderReservedHandles();
      })
      .catch(function (err) {
        console.error('Error loading reserved handles:', err);
        state.reservedHandles = [];
        renderReservedHandles();
      });
  }

  function renderReservedHandles() {
    if (!el.reservedHandlesTableBody) return;

    if (!state.reservedHandles.length) {
      el.reservedHandlesTableBody.innerHTML = '';
      if (el.reservedEmptyState) el.reservedEmptyState.hidden = false;
      return;
    }
    if (el.reservedEmptyState) el.reservedEmptyState.hidden = true;

    var rows = '';
    state.reservedHandles.forEach(function (item) {
      var dateStr = item.created ? new Date(item.created).toLocaleDateString() : '-';
      rows += '<tr>';
      rows += '  <td><strong style="color: var(--teal-accent);">@' + escapeHtml(item.handle || '-') + '</strong></td>';
      rows += '  <td><span style="color: var(--text-main); font-size: 13px;">' + escapeHtml(item.reason || 'Protección de sistema') + '</span></td>';
      rows += '  <td><span style="color: var(--text-muted); font-size: 12.5px;">' + escapeHtml(item.created_by || 'Admin') + '</span></td>';
      rows += '  <td><span style="color: var(--text-muted); font-size: 12.5px;">' + escapeHtml(dateStr) + '</span></td>';
      rows += '  <td>';
      rows += '    <div class="cell-actions">';
      rows += '      <button type="button" class="xow-btn-icon danger" data-reserved-delete-id="' + item.id + '" data-reserved-handle="' + escapeHtml(item.handle || '') + '" title="Eliminar reserva">';
      rows += '        <svg class="icon icon-sm"><use href="#i-delete"></use></svg>';
      rows += '      </button>';
      rows += '    </div>';
      rows += '  </td>';
      rows += '</tr>';
    });

    el.reservedHandlesTableBody.innerHTML = rows;
  }

  function openAddReservedModal() {
    if (el.formReservedHandle) el.formReservedHandle.reset();
    if (el.modalReservedHandleBackdrop) el.modalReservedHandleBackdrop.classList.add('open');
  }

  function closeAddReservedModal() {
    if (el.modalReservedHandleBackdrop) el.modalReservedHandleBackdrop.classList.remove('open');
  }

  function saveReservedHandle(rawHandle, reason) {
    var clean = String(rawHandle || '').replace(/^@+/, '').trim().toLowerCase();
    var pattern = /^[a-z0-9_-]{3,30}$/;

    if (!pattern.test(clean)) {
      showToast('Formato de handle no válido (3-30 chars, minúsculas, números, guiones)', 'error');
      return;
    }

    var adminEmail = (pb.authStore && pb.authStore.record && pb.authStore.record.email) || 'Admin';

    pb.collection(RESERVED_HANDLES_COLLECTION).create({
      handle: clean,
      reason: reason ? reason.trim() : 'Reserva administrativa',
      created_by: adminEmail,
    })
      .then(function (record) {
        state.reservedHandles.push(record);
        state.reservedHandles.sort(function (a, b) { return (a.handle || '').localeCompare(b.handle || ''); });
        closeAddReservedModal();
        renderReservedHandles();
        showToast('Handle @' + clean + ' reservado con éxito', 'success');
      })
      .catch(function (err) {
        console.error('Create reserved handle error:', err);
        showToast('Error: El handle ya está reservado o hubo un error', 'error');
      });
  }

  function deleteReservedHandle(id, handle) {
    if (!confirm('¿Eliminar la reserva del handle @' + handle + '?')) return;

    pb.collection(RESERVED_HANDLES_COLLECTION).delete(id)
      .then(function () {
        state.reservedHandles = state.reservedHandles.filter(function (h) { return h.id !== id; });
        renderReservedHandles();
        showToast('Reserva del handle eliminada', 'success');
      })
      .catch(function (err) {
        console.error('Delete reserved handle error:', err);
        showToast('Error eliminando la reserva', 'error');
      });
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
    if (el.incomesTableBody) {
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

    // 15. Main Module Navigation
    var mainNavTabs = [el.tabNavFunding, el.tabNavReports, el.tabNavUsers].filter(Boolean);
    mainNavTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var sec = tab.getAttribute('data-main-section');
        if (sec) switchMainSection(sec);
      });
    });

    // 16. Reports Filtering and Actions
    if (el.repSearchInput) {
      el.repSearchInput.addEventListener('input', function (e) {
        state.reportsFilter.search = e.target.value;
        renderReportsSection();
      });
    }
    if (el.repStatusFilter) {
      el.repStatusFilter.addEventListener('change', function (e) {
        state.reportsFilter.status = e.target.value;
        renderReportsSection();
      });
    }
    if (el.repCategoryFilter) {
      el.repCategoryFilter.addEventListener('change', function (e) {
        state.reportsFilter.category = e.target.value;
        renderReportsSection();
      });
    }
    if (el.repContentFilter) {
      el.repContentFilter.addEventListener('change', function (e) {
        state.reportsFilter.content = e.target.value;
        renderReportsSection();
      });
    }
    if (el.repBlockedFilter) {
      el.repBlockedFilter.addEventListener('change', function (e) {
        state.reportsFilter.blocked = e.target.value;
        renderReportsSection();
      });
    }
    if (el.repSortSelect) {
      el.repSortSelect.addEventListener('change', function (e) {
        state.reportsFilter.sort = e.target.value;
        renderReportsSection();
      });
    }
    if (el.btnRefreshReports) {
      el.btnRefreshReports.addEventListener('click', function () {
        loadReports().then(function () {
          showToast('Denuncias actualizadas', 'info');
        });
      });
    }
    if (el.reportsTableBody) {
      el.reportsTableBody.addEventListener('click', function (e) {
        var detailBtn = e.target.closest('[data-report-detail-id]');
        if (detailBtn) {
          var repId = detailBtn.getAttribute('data-report-detail-id');
          var report = state.reports.find(function (r) { return r.id === repId; });
          if (report) openReportModal(report);
        }
      });
    }

    // 17. Report Detail Modal Actions
    if (el.btnCloseReportDetailModal) {
      el.btnCloseReportDetailModal.addEventListener('click', closeReportModal);
    }
    if (el.btnViewReporterUser) {
      el.btnViewReporterUser.addEventListener('click', function () {
        if (state.selectedReport && state.selectedReport.reporter_id) {
          openUserModal(state.selectedReport.reporter_id);
        }
      });
    }
    if (el.btnViewTargetUser) {
      el.btnViewTargetUser.addEventListener('click', function () {
        if (state.selectedReport && state.selectedReport.target_user_id) {
          openUserModal(state.selectedReport.target_user_id);
        }
      });
    }
    if (el.formReportModeration) {
      el.formReportModeration.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!state.selectedReport) return;
        saveReportResolution(
          state.selectedReport.id,
          el.repModStatus.value,
          el.repModAction.value,
          el.repModNotes.value.trim()
        );
      });
    }
    if (el.btnBanReportedUser) {
      el.btnBanReportedUser.addEventListener('click', function () {
        if (state.selectedReport) banReportedUserFromReport(state.selectedReport);
      });
    }
    if (el.btnDismissReport) {
      el.btnDismissReport.addEventListener('click', function () {
        if (state.selectedReport) dismissReportFromModal(state.selectedReport);
      });
    }

    // 18. Users Subtabs (Directory vs Reserved Handles)
    var userSubTabs = [el.tabBtnUserDirectory, el.tabBtnUserReserved].filter(Boolean);
    userSubTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var t = tab.getAttribute('data-user-tab');
        if (t) switchUserTab(t);
      });
    });

    // 19. Users Directory Search & Actions
    function triggerDebouncedUserSearch() {
      if (userSearchDebounceTimer) clearTimeout(userSearchDebounceTimer);
      userSearchDebounceTimer = setTimeout(function () {
        loadUsers();
      }, 300);
    }

    if (el.userSearchHandleInput) {
      el.userSearchHandleInput.addEventListener('input', function (e) {
        state.userSearchHandle = e.target.value;
        triggerDebouncedUserSearch();
      });
      el.userSearchHandleInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (userSearchDebounceTimer) clearTimeout(userSearchDebounceTimer);
          loadUsers();
        }
      });
    }
    if (el.userSearchNameInput) {
      el.userSearchNameInput.addEventListener('input', function (e) {
        state.userSearchName = e.target.value;
        triggerDebouncedUserSearch();
      });
      el.userSearchNameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (userSearchDebounceTimer) clearTimeout(userSearchDebounceTimer);
          loadUsers();
        }
      });
    }
    if (el.userStatusFilter) {
      el.userStatusFilter.addEventListener('change', function (e) {
        state.userStatusFilter = e.target.value;
        loadUsers();
      });
    }
    if (el.btnRefreshUsers) {
      el.btnRefreshUsers.addEventListener('click', function () {
        if (userSearchDebounceTimer) clearTimeout(userSearchDebounceTimer);
        loadUsers().then(function () {
          showToast('Búsqueda de usuarios completada', 'info');
        });
      });
    }
    if (el.usersTableBody) {
      el.usersTableBody.addEventListener('click', function (e) {
        var detailBtn = e.target.closest('[data-user-detail-id]');
        if (detailBtn) {
          var uId = detailBtn.getAttribute('data-user-detail-id');
          openUserModal(uId);
          return;
        }

        var banBtn = e.target.closest('[data-user-ban-id]');
        if (banBtn) {
          var banId = banBtn.getAttribute('data-user-ban-id');
          var userToBan = state.users.find(function (u) { return u.id === banId; });
          if (userToBan) toggleUserBan(userToBan);
          return;
        }

        var unbanBtn = e.target.closest('[data-user-unban-id]');
        if (unbanBtn) {
          var unbanId = unbanBtn.getAttribute('data-user-unban-id');
          var userToUnban = state.users.find(function (u) { return u.id === unbanId; });
          if (userToUnban) toggleUserBan(userToUnban);
          return;
        }
      });
    }

    // 20. User Detail Modal Actions
    if (el.btnCloseUserDetailModal) {
      el.btnCloseUserDetailModal.addEventListener('click', closeUserModal);
    }
    if (el.btnDismissUserDetail) {
      el.btnDismissUserDetail.addEventListener('click', closeUserModal);
    }
    if (el.btnToggleUserBan) {
      el.btnToggleUserBan.addEventListener('click', function () {
        if (state.selectedUser) toggleUserBan(state.selectedUser);
      });
    }

    // 21. Reserved Handles Actions
    if (el.btnRefreshReserved) {
      el.btnRefreshReserved.addEventListener('click', function () {
        loadReservedHandles().then(function () {
          showToast('Lista de handles actualizada', 'info');
        });
      });
    }
    if (el.btnOpenAddReservedModal) {
      el.btnOpenAddReservedModal.addEventListener('click', openAddReservedModal);
    }
    if (el.btnCloseReservedModal) {
      el.btnCloseReservedModal.addEventListener('click', closeAddReservedModal);
    }
    if (el.btnCancelReserved) {
      el.btnCancelReserved.addEventListener('click', closeAddReservedModal);
    }
    if (el.formReservedHandle) {
      el.formReservedHandle.addEventListener('submit', function (e) {
        e.preventDefault();
        saveReservedHandle(el.reservedHandleInput.value, el.reservedReasonInput.value);
      });
    }
    if (el.reservedHandlesTableBody) {
      el.reservedHandlesTableBody.addEventListener('click', function (e) {
        var delBtn = e.target.closest('[data-reserved-delete-id]');
        if (delBtn) {
          var delId = delBtn.getAttribute('data-reserved-delete-id');
          var handle = delBtn.getAttribute('data-reserved-handle');
          deleteReservedHandle(delId, handle);
        }
      });
    }

    // 22. Analytics Dashboard & Granularity Events
    var granButtons = [el.btnGranularityDay, el.btnGranularityWeek, el.btnGranularityMonth, el.btnGranularityYear].filter(Boolean);
    granButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var g = btn.getAttribute('data-granularity');
        if (!g) return;
        state.analyticsGranularity = g;
        granButtons.forEach(function (b) {
          b.classList.toggle('active', b === btn);
        });
        renderAnalyticsChart();
      });
    });

    if (el.chartParameterPills) {
      el.chartParameterPills.addEventListener('click', function (e) {
        var pill = e.target.closest('.xow-param-pill');
        if (pill) {
          var pId = pill.getAttribute('data-param-id');
          if (pId) {
            var idx = state.analyticsActiveParams.indexOf(pId);
            if (idx !== -1) {
              if (state.analyticsActiveParams.length > 1) {
                state.analyticsActiveParams.splice(idx, 1);
              } else {
                showToast('Debe haber al menos un parámetro activo en la gráfica', 'info');
                return;
              }
            } else {
              state.analyticsActiveParams.push(pId);
            }
            renderParameterPills();
            renderAnalyticsChart();
          }
        }
      });
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', function () {
        if (state.activeMainSection === 'dashboard') {
          renderAnalyticsChart();
        }
      });
    }

    // 23. Main Navigation Tab Events
    var mainNavTabs = [el.tabNavDashboard, el.tabNavFunding, el.tabNavReports, el.tabNavUsers].filter(Boolean);
    mainNavTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var sec = tab.getAttribute('data-main-section');
        if (sec) switchMainSection(sec);
      });
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

    if (pb && pb.collection) {
      pb.collection(cfg.adminCollection || 'web_admins').authRefresh()
        .then(function (authData) {
          if (authData && authData.record) {
            var rec = authData.record;
            var updatedName = rec.display_name || rec.email || 'Admin';
            el.adminWelcomeName.textContent = updatedName;
            el.adminUserAvatar.textContent = updatedName.slice(0, 2).toUpperCase();
          }
        })
        .catch(function (err) {
          console.warn('Auth refresh warning:', err);
          if (err && (err.status === 401 || err.status === 403)) {
            pb.authStore.clear();
            showLoginView();
          }
        });
    }

    var initialSection = 'dashboard';
    try {
      var hash = window.location.hash ? window.location.hash.slice(1).toLowerCase() : '';
      if (hash === 'dashboard' || hash === 'reports' || hash === 'users' || hash === 'funding') {
        initialSection = hash;
      } else if (window.sessionStorage) {
        var savedSec = window.sessionStorage.getItem('xow_admin_active_section');
        if (savedSec === 'dashboard' || savedSec === 'reports' || savedSec === 'users' || savedSec === 'funding') {
          initialSection = savedSec;
        }
      }
    } catch (e) {}

    loadAllData();
    switchMainSection(initialSection);
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
    calculateReportMetrics: calculateReportMetrics,
    filterReports: filterReports,
    escapePbFilter: escapePbFilter,
    addMonthsClamped: addMonthsClamped,
    clamp01: clamp01,
    state: state,
    SessionAuthStore: SessionAuthStore,
    firstNonEmptyTranslation: firstNonEmptyTranslation,
    resolvePhaseText: resolvePhaseText,
    slugifyPhaseKey: slugifyPhaseKey,
    buildDateBuckets: buildDateBuckets,
    buildAnalyticsTimeSeries: buildAnalyticsTimeSeries,
    computeCurrentKpis: computeCurrentKpis,
    ANALYTICS_PARAMETERS: ANALYTICS_PARAMETERS,
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
