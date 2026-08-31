// XowApp public website — minimal Material-Symbols-style outline icon sprite.
// Injected as a hidden <svg><symbol>...</symbol></svg> sprite so pages can do:
//   <svg class="icon"><use href="#i-lock"></use></svg>
// Icons are hand-drawn simple outlines (not vendored from any icon font/CDN), 24x24
// viewBox, stroke-based (fill:none, stroke:currentColor via .icon in theme.css).
(function () {
  var SPRITE_ID = 'xow-icon-sprite';

  var SYMBOLS = {
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    shield: '<path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z"/>',
    photo_library: '<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 20h11a2 2 0 0 0 2-2V7"/><circle cx="8" cy="10" r="1.3"/><path d="M4 17l3.5-4 3 3.2L14 12l3 4.5"/>',
    favorite: '<path d="M12 20s-7-4.35-9.5-8.5C.7 8 2 4.5 5.5 4a5 5 0 0 1 6.5 2.5A5 5 0 0 1 18.5 4C22 4.5 23.3 8 21.5 11.5 19 15.65 12 20 12 20z"/>',
    visibility_off: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c5 0 9 3.5 10.5 7-.55 1.3-1.4 2.55-2.45 3.6M6.6 6.6C4.4 8 2.7 10 1.5 12c1.5 3.5 5.5 7 10.5 7 1.4 0 2.75-.25 4-.7"/><path d="M9.5 10.2a3 3 0 0 0 4.3 4.2"/>',
    groups: '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.6"/><path d="M2.5 20c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5"/><path d="M14.8 15.2c2.4.2 4.2 2.3 4.2 4.8"/>',
    download: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 20h16"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="M5 5l14 14M19 5L5 19"/>',
    light_mode: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/>',
    dark_mode: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
    language: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.8 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.8-3.8-9S9.5 5.6 12 3z"/>',
    volunteer_activism: '<path d="M12 13s-4-2.6-4-5.6A2.9 2.9 0 0 1 11 4.5c.5.5.9 1.1 1 1.6.1-.5.5-1.1 1-1.6A2.9 2.9 0 0 1 16 7.4c0 3-4 5.6-4 5.6z"/><path d="M3 15l3.5-1.2a2 2 0 0 1 1.4 0L12 15h3.5a1.5 1.5 0 0 1 0 3H10"/><path d="M3 14.5V20M21 14.5V20"/><path d="M12 15l6.5-2.2a1.6 1.6 0 0 1 2 2.1L15 19.5l-4.5 1L3 19"/>',
    open_in_new: '<path d="M14 4h6v6"/><path d="M20 4L10 14"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
    check_circle: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.6L16.5 9"/>',
    schedule: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l4 2.3"/>',
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>',
    qr_code: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM18 14h3v3h-3zM14 18h3v3h-3zM18 18h3v3h-3z"/><circle cx="6.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="6.5" r="1.5"/><circle cx="6.5" cy="17.5" r="1.5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    vpn_key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L19 4h3v3l-2 2h-2v2l-2 2h-2l-1.3 1.3"/>',
    send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
    delete: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
    lock_open: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0"/>',
    cloud_off: '<path d="M22.6 17.5A5.5 5.5 0 0 0 18 10h-1.3A7.5 7.5 0 0 0 3.2 13M5.1 17.5A4.5 4.5 0 0 0 9.5 21h10a4.5 4.5 0 0 0 3.1-3.5M2 2l20 20"/>',
    smartphone: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><circle cx="12" cy="18" r="1"/>',
    sync_alt: '<path d="M21 17H7l4-4M3 7h14l-4 4"/>',
    face_woman: '<circle cx="12" cy="12" r="9"/><path d="M7 11c1-2.5 3.5-3.5 5-3.5s4 1 5 3.5M9 13.5v.5M15 13.5v.5M10 17a3 3 0 0 0 4 0"/>',
    face_man: '<circle cx="12" cy="12" r="9"/><path d="M8 8.5c2-1 6-1 8 0M9 13v.5M15 13v.5M10 16.5a3 3 0 0 0 4 0"/>',
    safe_box: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="12" cy="12" r="3.5"/><path d="M12 10.5v1.5l1 1M15.5 12H18M6 12h2.5"/>',
    arrow_forward: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    arrow_down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    fingerprint: '<path d="M12 10a2 2 0 0 0-2 2c0 2.2 1.8 4 4 4s4-1.8 4-4a6 6 0 0 0-12 0c0 3.3 2.7 6 6 6m0-16a10 10 0 0 0-10 10c0 4 2.5 7.5 6 9m10-3c1.2-1.7 2-3.8 2-6a10 10 0 0 0-4-8"/>',
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r="0.75"/>',
    menu_book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    lightbulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
    schema: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="9" y="14" width="6" height="6" rx="1.5"/><path d="M7 10v1.5a1.5 1.5 0 0 0 1.5 1.5h1m6-3v1.5a1.5 1.5 0 0 1-1.5 1.5h-1"/>',
    account_circle: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="9.7" r="3.2"/><path d="M5.8 18.3a6.6 6.6 0 0 1 12.4 0"/>',
    logout: '<path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3"/><path d="M15.5 16.5L21 12l-5.5-4.5"/><path d="M21 12H9"/>',
    warning: '<path d="M12 3.2L21.5 20H2.5L12 3.2z"/><path d="M12 9.5v4.6"/><circle cx="12" cy="17.3" r="0.9"/>',
    info: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="8" r="0.9"/><path d="M11 11h1.4v6H11"/>',
    add: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    payments: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/><circle cx="12" cy="15" r="2"/>',
    trending_up: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
    receipt_long: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    block: '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
    person_search: '<circle cx="10" cy="8" r="4"/><path d="M2 20c0-4 4-6 8-6"/><circle cx="17" cy="17" r="3"/><path d="M19.5 19.5L22 22"/>',
    filter_list: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    verified_user: '<path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  };

  function buildSpriteMarkup() {
    var symbols = Object.keys(SYMBOLS).map(function (name) {
      return '<symbol id="i-' + name + '" viewBox="0 0 24 24">' + SYMBOLS[name] + '</symbol>';
    }).join('');
    return '<svg id="' + SPRITE_ID + '" hidden xmlns="http://www.w3.org/2000/svg">' + symbols + '</svg>';
  }

  function inject() {
    if (document.getElementById(SPRITE_ID)) return;
    var holder = document.createElement('div');
    holder.innerHTML = buildSpriteMarkup();
    var svg = holder.firstChild;
    document.body.insertBefore(svg, document.body.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
