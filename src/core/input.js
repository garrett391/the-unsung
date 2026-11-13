import { G } from './game.js';
import { clamp, $ } from './util.js';

// I holds the live stick and held buttons; taps go into the player's input buffer.
export const I = { mx: 0, my: 0, block: false, heavy: false, touch: false };
export const keys = {};
export const coarse = matchMedia('(pointer:coarse)').matches;
// Camera sensitivity, 0.25..2, kept between visits where storage allows.
export const opts = { sens: 1 };
try { const v = +localStorage.getItem('unsung.sens'); if (v >= 0.25 && v <= 2) opts.sens = v; } catch (_) { /* no storage */ }
export function setSens(v) { opts.sens = v; try { localStorage.setItem('unsung.sens', String(v)); } catch (_) { /* no storage */ } }
let stick = null, look = null, mBlock = false, tHeavy = false, mHeavy = false, touchT = -9;
// Drop every held input. Called whenever the browser may have swallowed a release
// (focus loss, context menu, pointer lock change, pause).
export function releaseAll() { for (const k in keys) keys[k] = false; mHeavy = tHeavy = mBlock = false; I.heavy = I.block = false; }

export function press(a) { if (G.player && G.running && !G.paused && G.time >= (G.pressOkT || 0)) G.player.buf = { a, t: G.time }; }
export function toggleLock() { if (G.running && G.player.controlEnabled) G.player.toggleLock(); }
export function showTouch() {
  if (I.touch) return;
  I.touch = true; $('touch').style.display = 'block';
}
// Label for an action in hints, matched to the device in use.
export function label(a) {
  const t = I.touch || coarse;
  return { move: t ? 'the left thumb' : 'W A S D', l: t ? 'STRIKE' : 'J / click', h: t ? 'HEAVY' : 'K / right-click', b: t ? 'GUARD' : 'L / Shift',
    d: t ? 'DODGE' : 'Space', k: t ? 'LOCK' : 'F' }[a];
}

export function initInput(canvas, cam) {
  // A lost Shift release (e.g. Shift + right-click opening a context menu) would leave the
  // guard up forever, so every event that reports modifier state resyncs it.
  const syncShift = (e) => { if (!e.shiftKey) keys.ShiftLeft = keys.ShiftRight = false; };
  addEventListener('keydown', (e) => {
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.code !== 'ShiftLeft' && e.code !== 'ShiftRight') syncShift(e);
    if (e.repeat) return;
    if (e.code === 'Escape' || e.code === 'KeyP') { G.togglePause?.(); return; }
    if (G.paused) return;
    if (e.code === 'Enter' || e.code === 'Space') G.confirm = true;
    keys[e.code] = true;
    if (G.talking) return; // in dialogue, keys only advance it
    if (e.code === 'KeyJ') press('l');
    else if (e.code === 'KeyK') press('h');
    else if (e.code === 'Space') press('d');
    else if (e.code === 'KeyF' || e.code === 'Tab') toggleLock();
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; syncShift(e); });
  addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { releaseAll(); if (document.hidden) G.pause?.(true); });
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') touchT = performance.now();
    if (e.target === canvas || e.target.closest?.('#dlg, #chron')) G.confirm = true;
  });
  // Phones: a quick second tap is a double-tap, which zooms the page. Taps on the game itself
  // never need the browser's default; on buttons and sliders only a rapid second tap is dropped.
  let tapT = -9;
  document.addEventListener('touchend', (e) => {
    const now = performance.now(), fast = now - tapT < 400; tapT = now;
    if ((fast || !e.target.closest?.('button, input, summary, a')) && e.cancelable) e.preventDefault();
  }, { passive: false });
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  addEventListener('contextmenu', (e) => { e.preventDefault(); releaseAll(); });
  // Mouse buttons use mousedown/up: unlike pointer events, these fire for every button
  // even while another is held (a "chord"), so a held right button can't get lost.
  canvas.addEventListener('mousedown', (e) => {
    if (performance.now() - touchT < 1000) return; // emulated mouse event after a touch
    syncShift(e);
    if (!G.running || G.paused) return;
    if (document.pointerLockElement !== canvas) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* refused */ } }
    if (G.talking) return; // a click in dialogue only advances it
    if (e.button === 0) press('l');
    else if (e.button === 2) { mHeavy = true; press('h'); }
    else if (e.button === 1) { toggleLock(); e.preventDefault(); }
  });
  addEventListener('mouseup', (e) => { if (e.button === 2) mHeavy = false; });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas) { releaseAll(); if (G.running && !G.paused && !I.touch) G.pause?.(true); }
  });
  const elS = $('stick'), elK = $('knob');
  canvas.addEventListener('pointerdown', (e) => {
    if (!G.running || e.pointerType === 'mouse') return;
    showTouch();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    if (e.clientX < innerWidth * 0.45 && !stick) {
      stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      elS.style.display = elK.style.display = 'block';
      elS.style.left = elK.style.left = e.clientX + 'px'; elS.style.top = elK.style.top = e.clientY + 'px';
    } else if (!look) look = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      syncShift(e); if (!(e.buttons & 2)) mHeavy = false;
      if (document.pointerLockElement === canvas && !G.paused) { const k = opts.sens; cam.yaw -= e.movementX * 0.0021 * k; cam.pitch = clamp(cam.pitch + e.movementY * 0.0016 * k, 0.05, 1.1); cam.manualT = G.time; }
      return;
    }
    if (stick && e.pointerId === stick.id) {
      let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const m = Math.hypot(dx, dy), R = 52;
      if (m > R) { dx *= R / m; dy *= R / m; }
      I.mx = dx / R; I.my = -dy / R; elK.style.left = stick.ox + dx + 'px'; elK.style.top = stick.oy + dy + 'px';
    } else if (look && e.pointerId === look.id) {
      const k = opts.sens; cam.yaw -= (e.clientX - look.x) * 0.009 * k; cam.pitch = clamp(cam.pitch + (e.clientY - look.y) * 0.005 * k, 0.05, 1.1);
      look.x = e.clientX; look.y = e.clientY; cam.manualT = G.time;
    }
  });
  const pUp = (e) => {
    if (e.pointerType === 'mouse') return;
    if (stick && e.pointerId === stick.id) { stick = null; I.mx = I.my = 0; elS.style.display = elK.style.display = 'none'; }
    if (look && e.pointerId === look.id) look = null;
  };
  canvas.addEventListener('pointerup', pUp); canvas.addEventListener('pointercancel', pUp);
  document.querySelectorAll('#touch button').forEach((b) => {
    const a = b.dataset.a;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      b.classList.add('on');
      if (a === 'p') { G.togglePause?.(); return; }
      if (a === 'l') press('l'); else if (a === 'h') { tHeavy = true; press('h'); } else if (a === 'd') press('d');
      else if (a === 'b') mBlock = true; else if (a === 'k') toggleLock();
    });
    const up = () => { b.classList.remove('on'); if (a === 'h') tHeavy = false; if (a === 'b') mBlock = false; };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
  });
}

export function pollInput(cam) {
  if (!stick) {
    const x = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), y = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), m = Math.hypot(x, y) || 1;
    I.mx = x / m; I.my = y / m;
  }
  I.block = mBlock || !!(keys.KeyL || keys.ShiftLeft || keys.ShiftRight);
  I.heavy = mHeavy || tHeavy || !!keys.KeyK;
  const cy = (keys.KeyQ || keys.ArrowLeft ? 1 : 0) - (keys.KeyE || keys.ArrowRight ? 1 : 0);
  if (cy) { cam.yaw += cy * 2.0 * opts.sens * G.rdt; cam.manualT = G.time; }
  const cp = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
  if (cp) cam.pitch = clamp(cam.pitch + cp * 1.2 * G.rdt, 0.05, 1.1);
}
