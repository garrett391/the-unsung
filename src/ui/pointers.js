// The waypoint pointer's looks, a trial in the pause menu (owner, 26 Nov 2026: samples A to N, K by default).
// mode 'edge': the first kind, on an oval inside the screen's edge (or over the place when it is in view);
// mode 'ring': on the javelin warning's circle round him (a tester's idea), pointing the way;
// mode 'ground': a ring lying on the ground round his feet with a point on its rim.
// Every glyph is drawn pointing up; `s` is its size in px (w by h when not square), `vb` its viewBox, `css` goes on the svg.
// `arc` adds the faint ring and lit stretch (L). The javelin warning's own shape is in hud.js (threats).
const G1 = '#f0c860', IN = '#3a2a08';
export const POINTERS = [
  { id: 'k', name: 'K. Chevron on the circle', mode: 'ring', s: 30,
    svg: '<path d="M2 11l10-10 10 10"/><path d="M2 21l10-10 10 10" style="opacity:.5"/>',
    css: `fill:none;stroke:${G1};stroke-width:2.9;stroke-linecap:round;stroke-linejoin:round` },
  { id: 'j', name: 'J. Javelin mark in gold', mode: 'ring', w: 60, h: 26, vb: '0 0 60 26',
    svg: `<path d="M5 23Q30 3 55 23" style="stroke:${G1};fill:none;stroke-width:5;stroke-linecap:round"/><path d="M30 0l8 10h-16z" style="stroke:none"/>` },
  { id: 'l', name: 'L. Lit stretch of a ring', mode: 'ring', s: 16, out: 9, arc: true, svg: '<path d="M12 3l10 13H2z"/>' },
  { id: 'm', name: 'M. Bead with a tail', mode: 'ring', s: 24, vb: '-12 -12 24 24',
    svg: `<defs><linearGradient id="wbt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${G1}"/><stop offset="1" stop-color="${G1}" stop-opacity="0"/></linearGradient></defs><path d="M-5 0L0 26 5 0z" style="fill:url(#wbt);stroke:none"/><path d="M0 -11l7 9a7 7 0 1 1-14 0z"/>` },
  { id: 'n', name: 'N. Ring on the ground', mode: 'ground', svg: '' },
  { id: 'a', name: 'A. Gold dart', mode: 'edge', svg: '<path d="M12 1.5l8.5 20-8.5-5.2-8.5 5.2z"/>' },
  { id: 'b', name: 'B. Double chevron', mode: 'edge',
    svg: '<path d="M4.5 12.5L12 5l7.5 7.5"/><path d="M4.5 20.5L12 13l7.5 7.5" style="opacity:.5"/>',
    css: `fill:none;stroke:${G1};stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round` },
  { id: 'c', name: 'C. Compass needle', mode: 'edge', s: 34,
    svg: `<path d="M12 0L16 12H8z" style="fill:${G1}"/><path d="M8 12h8l-4 12z" style="fill:#4a4f5a"/><circle cx="12" cy="12" r="1.6" style="fill:#2a1d06;stroke:none"/>`,
    css: 'stroke:#2a1d06;stroke-width:1' },
  { id: 'd', name: 'D. Ring and tip', mode: 'edge',
    svg: `<circle cx="12" cy="12" r="8.5" style="fill:rgba(10,8,4,.45);stroke:${G1};stroke-width:1.8"/><path d="M12 -3.5l4.6 6.2h-9.2z"/><circle cx="12" cy="12" r="2.4" style="stroke:none"/>` },
  { id: 'e', name: 'E. Sword point', mode: 'edge',
    svg: `<path d="M12 -2L14.6 5V16H9.4V5z" style="fill:#dfe4ea;stroke:#2c3038;stroke-width:.9"/><path d="M12 1v14" style="stroke:#9aa3b0;stroke-width:.8;fill:none"/><path d="M5.5 16h13v2.6h-13z" style="stroke-width:.9"/><path d="M10.8 18.6h2.4v4h-2.4z" style="fill:#6b4423;stroke:#2a1a0a;stroke-width:.7"/><circle cx="12" cy="23.6" r="1.4" style="stroke-width:.7"/>` },
  { id: 'f', name: 'F. Broadhead', mode: 'edge', svg: '<path d="M12 0L19.5 13.5 14 11 13.2 21.5H10.8L10 11 4.5 13.5z"/>' },
  { id: 'g', name: 'G. Ember', mode: 'edge', s: 30,
    svg: '<defs><linearGradient id="wtl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd978" stop-opacity=".95"/><stop offset="1" stop-color="#ff9a30" stop-opacity="0"/></linearGradient><radialGradient id="whd"><stop offset="0" stop-color="#fffbe8"/><stop offset=".6" stop-color="#ffd978"/><stop offset="1" stop-color="#ff9a30" stop-opacity="0"/></radialGradient></defs><path d="M8.2 7L12 25 15.8 7z" style="fill:url(#wtl)"/><circle cx="12" cy="6" r="6.5" style="fill:url(#whd)"/><circle cx="12" cy="6" r="2.6" style="fill:#fffbe8"/>',
    css: 'stroke:none;filter:drop-shadow(0 0 2px rgba(0,0,0,.9)) drop-shadow(0 0 6px rgba(255,190,80,.95)) drop-shadow(0 0 14px rgba(255,150,40,.6))' },
  { id: 'h', name: 'H. Running carets', mode: 'edge', cls: 'rip',
    svg: '<path d="M6 7l6-6 6 6"/><path d="M6 15l6-6 6 6"/><path d="M6 23l6-6 6 6"/>',
    css: `fill:none;stroke:${G1};stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round` },
  { id: 'i', name: 'I. Pale caret', mode: 'edge',
    svg: '<path d="M12 4.5c.6 0 1.1.3 1.4.9l6.6 12.4c.6 1.1-.4 2.3-1.6 1.9L12.6 17.8c-.4-.1-.8-.1-1.2 0L5.6 19.7c-1.2.4-2.2-.8-1.6-1.9L10.6 5.4c.3-.6.8-.9 1.4-.9z"/>',
    css: 'fill:#f3ead6;stroke:none;filter:drop-shadow(0 0 2px #000) drop-shadow(0 1px 4px rgba(0,0,0,.85))' },
];
export const pointer = (id) => POINTERS.find((p) => p.id === id) || POINTERS[0];
