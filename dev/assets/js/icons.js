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
