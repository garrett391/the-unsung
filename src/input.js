// Unified input: keyboard + mouse, touch (virtual stick and buttons), gamepad.
const BUTTONS = ['attack', 'shield', 'roll', 'lock', 'pause', 'confirm'];
const KEYMAP = {
  KeyJ: 'attack', KeyK: 'shield', ShiftLeft: 'shield', ShiftRight: 'shield', Space: 'roll',
  KeyL: 'lock', Tab: 'lock', KeyQ: 'lock', Escape: 'pause', KeyP: 'pause', Enter: 'confirm',
};
const MOVEKEYS = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.src = { kb: {}, mouse: {}, touch: {}, pad: {}, virt: {} };
    this.cur = {};
    this.prev = {};
    this.queued = {};
    this.keysDown = new Set();
    this.move = { x: 0, y: 0 };
    this.stick = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
    this.virtMove = null;
    this.device = matchMedia('(pointer: coarse)').matches ? 'touch' : 'kb';
    this.tapped = false;
    this.onDevice = null;
    this.bind();
  }
  setDevice(d) {
    if (this.device !== d) { this.device = d; if (this.onDevice) this.onDevice(d); }
  }
  bind() {
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const b = KEYMAP[e.code];
      if (b || MOVEKEYS[e.code]) e.preventDefault();
      this.setDevice('kb');
      if (e.repeat) return;
      this.keysDown.add(e.code);
      if (b) { this.src.kb[b] = true; this.queued[b] = true; }
      if (e.code === 'Space' || e.code === 'KeyJ') this.queued.confirm = true;
    });
    addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
      const b = KEYMAP[e.code];
      if (b) {
        // a button may be bound to several keys
        let still = false;
        for (const k of this.keysDown) if (KEYMAP[k] === b) still = true;
        if (!still) this.src.kb[b] = false;
      }
    });
    addEventListener('blur', () => this.releaseAll());
    const cv = this.canvas;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    // Touch taps come through pointer events. Mouse buttons use mousedown/mouseup,
    // which fire for every button: pointerdown does not fire for a second button
    // pressed while another is held, so a right-held shield + left click was lost.
    this.lastTouch = -1e9;
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      this.lastTouch = performance.now();
      this.setDevice('touch');
      this.tapped = true;
    });
    cv.addEventListener('mousedown', (e) => {
      if (performance.now() - this.lastTouch < 900) return; // emulated mouse after a tap
      this.setDevice('kb');
      if (e.button === 0) { this.src.mouse.attack = true; this.queued.attack = true; this.queued.confirm = true; }
      if (e.button === 2) { this.src.mouse.shield = true; this.queued.shield = true; }
      if (e.button === 1) { this.queued.lock = true; e.preventDefault(); }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.src.mouse.attack = false;
      if (e.button === 2) this.src.mouse.shield = false;
    });
  }
  // touch controls (DOM built by the UI)
  bindTouch(stickZone, stickBase, stickKnob, buttons) {
    const R = 52;
    const setKnob = () => {
      stickKnob.style.transform = `translate(${this.stick.x * R}px, ${-this.stick.y * R}px)`;
    };
    stickZone.addEventListener('pointerdown', (e) => {
      if (this.stick.id !== null) return;
      e.preventDefault();
      this.setDevice('touch');
      this.stick.id = e.pointerId;
      this.stick.ox = e.clientX;
      this.stick.oy = e.clientY;
      stickZone.setPointerCapture?.(e.pointerId);
      stickBase.style.left = `${e.clientX}px`;
      stickBase.style.top = `${e.clientY}px`;
      stickBase.classList.add('active');
      this.stick.x = this.stick.y = 0;
      setKnob();
    });
    stickZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stick.id) return;
      let dx = (e.clientX - this.stick.ox) / R, dy = -(e.clientY - this.stick.oy) / R;
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      this.stick.x = dx;
      this.stick.y = dy;
      setKnob();
    });
    const end = (e) => {
      if (e.pointerId !== this.stick.id) return;
      this.stick.id = null;
      this.stick.x = this.stick.y = 0;
      stickBase.classList.remove('active');
      stickBase.style.left = '';
      stickBase.style.top = '';
      setKnob();
    };
    stickZone.addEventListener('pointerup', end);
    stickZone.addEventListener('pointercancel', end);
    for (const [name, el] of Object.entries(buttons)) {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setDevice('touch');
        el.setPointerCapture?.(e.pointerId);
        this.src.touch[name] = true;
        this.queued[name] = true;
        if (name === 'attack' || name === 'roll') this.queued.confirm = true;
        el.classList.add('down');
      });
      const up = (e) => {
        this.src.touch[name] = false;
        el.classList.remove('down');
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    }
  }
  releaseAll() {
    for (const s of Object.values(this.src)) for (const k in s) s[k] = false;
    this.keysDown.clear();
    this.stick.x = this.stick.y = 0;
  }
  // test hooks
  virtual(name, down) {
    this.src.virt[name] = down;
    if (down) this.queued[name] = true;
  }
  update() {
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    let px = 0, py = 0;
    const P = this.src.pad;
    if (pad) {
      const b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
      const prevPad = { ...P };
      P.roll = b(0);
      P.attack = b(1) || b(2);
      P.lock = b(6) || b(4) || b(3);
      P.shield = b(7) || b(5);
      P.pause = b(9);
      P.confirm = b(0) || b(1);
      for (const k of BUTTONS) if (P[k] && !prevPad[k]) { this.queued[k] = true; this.setDevice('pad'); }
      px = pad.axes[0] || 0;
      py = -(pad.axes[1] || 0);
      if (b(12)) py = 1;
      if (b(13)) py = -1;
      if (b(14)) px = -1;
      if (b(15)) px = 1;
      const m = Math.hypot(px, py);
      if (m < 0.22) { px = py = 0; } else { this.setDevice('pad'); const k = Math.min(1, (m - 0.22) / 0.7) / m; px *= k; py *= k; }
    }
    this.prev = this.cur;
    const cur = {};
    for (const k of BUTTONS) cur[k] = !!(this.src.kb[k] || this.src.mouse[k] || this.src.touch[k] || this.src.pad[k] || this.src.virt[k]);
    this.cur = cur;
    this.pressedNow = {};
    for (const k of BUTTONS) this.pressedNow[k] = !!this.queued[k] || (cur[k] && !this.prev[k]);
    this.queued = {};
    this.tapNow = this.tapped;
    this.tapped = false;
    // movement
    let kx = 0, ky = 0;
    for (const k of this.keysDown) {
      const v = MOVEKEYS[k];
      if (v) { kx += v[0]; ky += v[1]; }
    }
    const km = Math.hypot(kx, ky);
    if (km > 0) { kx /= km; ky /= km; }
    const cands = [[kx, ky], [this.stick.x, this.stick.y], [px, py]];
    if (this.virtMove) cands.push(this.virtMove);
    let best = [0, 0], bm = 0;
    for (const c of cands) {
      const m = Math.hypot(c[0], c[1]);
      if (m > bm) { bm = m; best = c; }
    }
    this.move.x = best[0];
    this.move.y = best[1];
  }
  pressed(b) { return !!this.pressedNow[b]; }
  down(b) { return !!this.cur[b]; }
  confirmPressed() {
    return this.pressed('confirm') || this.pressed('attack') || this.pressed('roll') || this.tapNow;
  }
}
