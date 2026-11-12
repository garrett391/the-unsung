const $ = (id) => document.getElementById(id);

const LABELS = {
  kb: { attack: 'J', shield: 'K', roll: 'Space', lock: 'L', move: 'WASD', pause: 'Esc', side: 'A / D' },
  touch: { attack: 'Sword', shield: 'Shield', roll: 'Roll', lock: 'Lock', move: 'left thumb', pause: 'II', side: 'stick left / right' },
  pad: { attack: 'B', shield: 'RT', roll: 'A', lock: 'LT', move: 'left stick', pause: 'Start', side: 'stick left / right' },
};
const HEART = (fill) => {
  // fill: 0 empty, 0.5 half, 1 full
  const id = 'h' + Math.random().toString(36).slice(2, 7);
  const path = 'M12 21.2s-7.4-4.7-9.8-9.3C.6 8.4 2.6 3.8 6.8 3.8c2.3 0 3.8 1.3 5.2 3.2 1.4-1.9 2.9-3.2 5.2-3.2 4.2 0 6.2 4.6 4.6 8.1-2.4 4.6-9.8 9.3-9.8 9.3z';
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><clipPath id="${id}"><rect x="0" y="0" width="${24 * fill}" height="24"/></clipPath></defs>
  <path d="${path}" class="h-empty"/><path d="${path}" class="h-full" clip-path="url(#${id})"/></svg>`;
};

export class UI {
  constructor(input) {
    this.input = input;
    this.el = {
      hearts: $('hearts'), objective: $('objective'), objText: $('obj-text'), progress: $('progress'), progFill: $('progress-fill'), progLabel: $('progress-label'),
      prompt: $('prompt'), toast: $('toast'), callout: $('callout'), boss: $('boss'), bossName: $('boss-name'), bossFill: $('boss-fill'),
      dlg: $('dialogue'), dlgWho: $('dlg-who'), dlgText: $('dlg-text'), subtitle: $('subtitle'),
      fade: $('fade'), flash: $('flash'), letterbox: $('letterbox'), blind: $('blind'), danger: $('danger'),
      chron: $('chronicle'), chronHead: $('chron-head'), chronLines: $('chron-lines'), chronTap: $('chron-tap'),
      title: $('title'), titleControls: $('title-controls'), pause: $('pause'), pauseControls: $('pause-controls'), pauseSkills: $('pause-skills'),
      end: $('end'), endSkills: $('end-skills'), touch: $('touch'), hud: $('hud'), cards: $('cards'), cardText: $('card-text'),
    };
    this.dialogueOpen = false;
    this.full = '';
    this.shown = 0;
    this.typeT = 0;
    this.hintTpl = '';
    this.objTpl = '';
    this.toastT = 0;
    this.calloutT = 0;
    this.dangerT = 0;
    this.lastHearts = '';
    input.onDevice = () => this.refreshDevice();
    // taps on overlays count as confirm taps
    for (const k of ['dlg', 'chron', 'cards', 'subtitle']) this.el[k].addEventListener('pointerdown', () => { input.tapped = true; });
    this.refreshDevice();
  }
  key(b) {
    const L = LABELS[this.input.device] || LABELS.kb;
    return `<kbd>${L[b] ?? b}</kbd>`;
  }
  fmt(tpl) {
    return tpl.replace(/\{(\w+)\}/g, (_, b) => this.key(b));
  }
  refreshDevice() {
    const d = this.input.device;
    document.body.dataset.device = d;
    this.el.prompt.innerHTML = this.fmt(this.hintTpl);
    this.renderControls(this.el.titleControls);
    this.renderControls(this.el.pauseControls);
  }
  renderControls(el) {
    if (!el) return;
    const d = this.input.device;
    const rows = d === 'touch'
      ? [['Move', 'left thumb'], ['Sword', 'tap; hold to charge a spin'], ['Shield', 'hold'], ['Roll', 'tap'], ['Lock on', 'tap to toggle']]
      : d === 'pad'
        ? [['Move', 'left stick'], ['Sword', 'B, hold to charge a spin'], ['Shield', 'RT, hold'], ['Roll', 'A'], ['Lock on', 'LT'], ['Pause', 'Start']]
        : [['Move', 'WASD or arrows'], ['Sword', 'J or click, hold to charge a spin'], ['Shield', 'K or right-click, hold'], ['Roll', 'Space'], ['Lock on', 'L or Tab'], ['Pause', 'Esc']];
    el.innerHTML = `<dl>${rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>`;
  }
  hearts(hp, max) {
    const key = hp + '/' + max;
    if (key === this.lastHearts) return;
    this.lastHearts = key;
    let h = '';
    for (let i = 0; i < max / 2; i++) h += `<span class="heart">${HEART(Math.max(0, Math.min(1, (hp - i * 2) / 2)))}</span>`;
    this.el.hearts.innerHTML = h;
  }
  hudVisible(v) { this.el.hud.classList.toggle('off', !v); }
  objective(tpl) {
    this.objTpl = tpl || '';
    this.el.objText.innerHTML = this.fmt(this.objTpl);
    this.el.objective.classList.toggle('show', !!tpl);
  }
  progress(frac, label) {
    if (frac == null) { this.el.progress.classList.remove('show'); return; }
    this.el.progress.classList.add('show');
    this.el.progFill.style.width = `${Math.round(frac * 100)}%`;
    this.el.progLabel.textContent = label || '';
  }
  hint(tpl) {
    this.hintTpl = tpl || '';
    this.el.prompt.innerHTML = this.fmt(this.hintTpl);
    this.el.prompt.classList.toggle('show', !!tpl);
  }
  toast(name, howTpl) {
    const t = this.el.toast;
    t.querySelector('.name').textContent = name;
    t.querySelector('.how').innerHTML = this.fmt(howTpl || '');
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    this.toastT = 4.4;
  }
  callout(text) {
    const c = this.el.callout;
    c.textContent = text;
    c.classList.remove('show');
    void c.offsetWidth;
    c.classList.add('show');
    this.calloutT = 1.1;
  }
  boss(name, frac) {
    if (name == null) { this.el.boss.classList.remove('show'); return; }
    this.el.boss.classList.add('show');
    this.el.bossName.textContent = name;
    this.el.bossFill.style.width = `${Math.max(0, frac) * 100}%`;
  }
  // ---- dialogue
  showLine(who, text, cls = '') {
    this.dialogueOpen = true;
    this.el.dlg.className = 'show ' + cls;
    this.el.dlgWho.textContent = who || '';
    this.el.dlgWho.style.display = who ? '' : 'none';
    this.full = text;
    this.shown = 0;
    this.typeT = 0;
    this.el.dlgText.textContent = '';
    this.el.dlg.classList.remove('done');
  }
  lineComplete() { return this.shown >= this.full.length; }
  completeLine() {
    this.shown = this.full.length;
    this.el.dlgText.textContent = this.full;
    this.el.dlg.classList.add('done');
  }
  hideDialogue() {
    this.dialogueOpen = false;
    this.el.dlg.className = '';
  }
  subtitle(who, text) {
    const s = this.el.subtitle;
    if (!text) { s.classList.remove('show'); return; }
    s.innerHTML = who ? `<b>${who}</b> ${text}` : text;
    s.classList.add('show');
  }
  card(text) {
    const c = this.el.cards;
    if (!text) { c.classList.remove('show'); return; }
    this.el.cardText.innerHTML = text;
    c.classList.remove('show');
    void c.offsetWidth;
    c.classList.add('show');
  }
  // ---- chronicle page
  chronicleOpen(head) {
    this.el.chronHead.innerHTML = head;
    this.el.chronLines.innerHTML = '';
    this.el.chron.classList.add('show');
    this.el.chronTap.classList.remove('show');
  }
  chronicleLine(html, cls = '') {
    const p = document.createElement('p');
    p.innerHTML = html;
    if (cls) p.className = cls;
    this.el.chronLines.appendChild(p);
    this.el.chronTap.classList.add('show');
    return p;
  }
  chronicleTap(text) { this.el.chronTap.textContent = text; }
  chronicleClose() { this.el.chron.classList.remove('show'); }
  // ---- screen effects
  fade(alpha, dur = 0.6) {
    const f = this.el.fade;
    f.style.transition = `opacity ${dur}s ease`;
    f.style.opacity = String(alpha);
  }
  flash(color = '#fff', dur = 0.5, peak = 1) {
    const f = this.el.flash;
    f.style.transition = 'none';
    f.style.background = color;
    f.style.opacity = String(peak);
    void f.offsetWidth;
    f.style.transition = `opacity ${dur}s ease-out`;
    f.style.opacity = '0';
  }
  damage() { this.flash('radial-gradient(ellipse at center, rgba(179,38,42,0) 40%, rgba(179,38,42,0.75) 100%)', 0.45); }
  letterbox(on) { this.el.letterbox.classList.toggle('on', on); document.body.classList.toggle('cinema', on); }
  blind(on) { this.el.blind.classList.toggle('on', on); }
  danger() {
    const d = this.el.danger;
    d.classList.remove('pulse');
    void d.offsetWidth;
    d.classList.add('pulse');
  }
  touchVisible(v) { this.el.touch.classList.toggle('show', v); }
  update(dt) {
    if (this.dialogueOpen && this.shown < this.full.length) {
      this.typeT += dt * 46;
      const n = Math.min(this.full.length, Math.floor(this.typeT));
      if (n !== this.shown) {
        this.shown = n;
        this.el.dlgText.textContent = this.full.slice(0, n);
        if (n >= this.full.length) this.el.dlg.classList.add('done');
      }
    }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.classList.remove('show'); }
    if (this.calloutT > 0) { this.calloutT -= dt; if (this.calloutT <= 0) this.el.callout.classList.remove('show'); }
  }
  setSkills(list, el) {
    el.innerHTML = list.length
      ? `<ul>${list.map((s) => `<li><b>${s.name}</b><span>${this.fmt(s.how)}</span></li>`).join('')}</ul>`
      : '<p>No hidden skills learned yet.</p>';
  }
}
