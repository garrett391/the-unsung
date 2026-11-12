import * as THREE from 'three';
import { buildWorld, MOUTH, CAMPFIRE } from './world.js';
import { Player, Corin, Enemy, Vessa, Extra, Stretcher, campSoldiers, SKILLS } from './actors.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { FX } from './fx.js';
import { Director, STAGES, runStory, stageIndex } from './story.js';
import { Minimap } from './minimap.js';
import { angleDiff, angleTo, clamp, rand, pick, TAU } from './util.js';

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SPAWNS = [[-15, 6], [15, 6], [-15.5, 15], [15.5, 15], [-8, 20], [8, 20], [0, 20.5], [-12, 0], [12, 0]];

class Game {
  constructor(data) {
    this.data = data || {};
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 420);
    this.eng = { portrait: false };
    this.resize = this.resize.bind(this);
    addEventListener('resize', this.resize);
    this.resize();

    this.input = new Input(this.canvas);
    this.ui = new UI(this.input);
    this.audio = new Audio();
    this.fx = new FX(this.scene);
    this.world = buildWorld(this.scene);
    this.director = new Director(this);
    this.cam = new CameraRig(this);
    if (REDUCED) this.cam.shake = () => {};
    this.player = new Player(this);
    this.corin = new Corin(this);
    this.enemies = [];
    this.extras = [];
    this.stretchers = [];
    this.tokens = new Set();
    this.maxTokens = 2;
    this.hold = { active: false, paused: false, progress: 0, spawnT: 0, far: false };
    this.flags = { ...(this.data.flags || {}) };
    this.clock = 0;
    this.timeScale = 1;
    this.hitStopT = 0;
    this.paused = false;
    this.freezeAI = false;
    this.sparring = false;
    this.listeners = {};
    this.stageListeners = [];
    this.checkpointIndex = 0;
    this.stageIndex = 0;
    this.started = false;
    this.ended = false;
    this.cinematic = false;
    this.blindOn = false;
    this.bossOn = false;
    this.sayT = 0;
    this.deathT = 0;
    this.confirmTap = false;
    this.autoAdvance = false;
    this.soldiersMesh = campSoldiers(this.scene);
    this.makeReticle();
    this.makeMarker();
    this.makePlantedSword();
    this.makeHearts();
    this.on('enemyDied', ({ target }) => {
      if (target.type !== 'vessa' && Math.random() < 0.42) this.dropHeart(target.pos.x, target.pos.z);
    });
    this.save();

    const S = this.input;
    const $ = (id) => document.getElementById(id);
    S.bindTouch($('stick-zone'), $('stick-base'), $('stick-knob'), {
      attack: document.querySelector('.tb[data-b="attack"]'),
      shield: document.querySelector('.tb[data-b="shield"]'),
      roll: document.querySelector('.tb[data-b="roll"]'),
      lock: document.querySelector('.tb[data-b="lock"]'),
    });
    const prevDevice = this.input.onDevice;
    this.input.onDevice = (d) => { prevDevice && prevDevice(d); this.updateTouch(); };
    this.setupScreens();
    this.minimap = new Minimap(document.getElementById('minimap'), this);
    this.input.onDevice = ((prev) => (d) => { prev && prev(d); requestAnimationFrame(() => this.minimap.resize()); })(this.input.onDevice);

    // title: the camp at night, camera drifting
    STAGES[0].setup(this);
    this.player.controlEnabled = false;
    this.cam.mode = 'orbit';
    this.cam.orbitCenter = { x: 0, z: 3 };
    this.cam.orbit = 0.6;
    this.ui.hudVisible(false);
    this.ui.fade(0, 0);
    this.last = performance.now();
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  resize() {
    const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
    this.eng.portrait = h > w * 1.05;
    const target = this.eng.portrait ? 520 : 380;
    const s = Math.min(1, target / h);
    this.renderer.setSize(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), false);
    this.camera.aspect = w / h;
    this.camera.fov = this.eng.portrait ? 74 : 58;
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- loop
  frame(now) {
    requestAnimationFrame(this.frame);
    const rdt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const I = this.input;
    I.update();
    if (this.started && !this.ended && I.pressed('pause')) this.togglePause();
    if (!this.paused) {
      this.clock += rdt;
      this.confirmTap = I.confirmPressed();
      if (this.hitStopT > 0) this.hitStopT -= rdt;
      else this.step(rdt * this.timeScale, rdt);
      this.director.update();
      this.director.updateTweens(rdt * this.timeScale, rdt);
      this.tickTimers(rdt);
    }
    this.cam.update(this.paused ? 0 : rdt);
    this.world.update(this.clock, this.camera.position);
    this.fx.update(this.paused ? 0 : rdt * this.timeScale);
    this.ui.update(rdt);
    if (this.started && !this.cinematic && !this.paused) this.minimap.draw(rdt);
    this.renderer.render(this.scene, this.camera);
  }

  step(dt, rdt) {
    this.player.update(dt);
    this.corin.update(dt);
    for (const e of this.enemies) e.update(dt);
    for (const x of this.extras) x.update(dt);
    this.resolveCollisions();
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.removed) {
        if (e.tele) e.tele.remove();
        e.dispose();
        this.tokens.delete(e);
        this.enemies.splice(i, 1);
        if (this.player.lock === e) this.player.lock = null;
      }
    }
    this.updateHold(dt);
    this.updatePickups(dt);
    this.updateReticle(rdt);
    this.updateMarker(rdt);
    this.ui.hearts(this.player.hp, this.player.maxHp);
    if (this.bossOn && this.vessa) this.ui.boss("Vessa, the Witches' Hand", this.vessa.hp / this.vessa.maxHp);
    const dF = Math.hypot(this.player.pos.x - CAMPFIRE.x, this.player.pos.z - CAMPFIRE.z);
    this.audio.crackle = this.world.dawn > 0.5 ? 0 : clamp(1 - dF / 16, 0, 1);
    if (Math.random() < dt * 9) this.fx.ember(CAMPFIRE.x, 0.6, CAMPFIRE.z);
    if (Math.random() < dt * 2.5) this.fx.ember(-4.0, 3.0, -11.7);
    if (Math.random() < dt * 2.5) this.fx.ember(4.0, 3.0, -11.7);
  }

  tickTimers(rdt) {
    if (this.sayT > 0) {
      this.sayT -= rdt;
      if (this.sayT <= 0) this.ui.subtitle(null);
    }
    if (this.deathT > 0) {
      const before = this.deathT;
      this.deathT -= rdt;
      if (before > 1.5 && this.deathT <= 1.5) {
        this.ui.fade(1, 0.7);
        this.ui.card("That isn't how it happened.");
      }
      if (this.deathT <= 0) {
        this.deathT = 0;
        this.director.abort({ respawn: true });
      }
    }
  }

  resolveCollisions() {
    const list = [this.player];
    if (this.corin.solid && this.corin.rig.root.visible && this.corin.state !== 'dead') list.push(this.corin);
    for (const e of this.enemies) if (e.alive && e.rig.root.visible && e.state !== 'script' && !e.entering) list.push(e);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if ((a.y || 0) > 0.6 || (b.y || 0) > 0.6) continue;
        if (a.state === 'script' || b.state === 'script') continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz), m = a.radius + b.radius;
        if (d >= m || d < 1e-5) continue;
        const push = m - d, nx = dx / d, nz = dz / d;
        const wa = a === this.player ? 0.2 : 0.5, wb = b === this.player ? 0.2 : 0.5, s = wa + wb;
        a.pos.x -= nx * push * (wa / s); a.pos.z -= nz * push * (wa / s);
        b.pos.x += nx * push * (wb / s); b.pos.z += nz * push * (wb / s);
      }
    }
    for (const a of list) if (a.state !== 'script') a.confine();
  }

  // ---------------------------------------------------------------- queries
  hittables() {
    const l = this.enemies.filter((e) => e.alive && e.rig.root.visible && e.state !== 'script');
    if (this.sparring && this.corin.alive && !this.corin.dead) l.push(this.corin);
    return l;
  }
  findLockTarget(p, maxD = 15) {
    const cands = this.enemies.filter((e) => e.lockable() && e.state !== 'script');
    if (this.sparring && this.corin.lockable()) cands.push(this.corin);
    const camA = Math.atan2(this.cam.fwdX, this.cam.fwdZ);
    let best = null, bs = 1e9;
    for (const e of cands) {
      const d = p.dist(e);
      if (d > maxD) continue;
      const s = d + Math.abs(angleDiff(camA, p.angleTo(e))) * 4;
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }
  softTarget(p, range, half) {
    let best = null, bd = 1e9;
    for (const e of this.hittables()) {
      const d = p.dist(e) - e.radius;
      if (d > range || Math.abs(angleDiff(p.facing, p.angleTo(e))) > half) continue;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  nearestEnemy(pos, r) {
    let best = null, bd = 1e9;
    for (const e of this.enemies) {
      if (!e.alive || !e.rig.root.visible || e.state === 'flee' || e.state === 'script') continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
      if (d < r && d < bd) { bd = d; best = e; }
    }
    return best;
  }
  liveEnemies() { return this.enemies.filter((e) => e.alive && e.state !== 'flee').length; }
  takeToken(e, force) {
    if (this.tokens.has(e)) return true;
    if (!force && this.tokens.size >= this.maxTokens) return false;
    this.tokens.add(e);
    return true;
  }
  releaseToken(e) { this.tokens.delete(e); }
  panOf(pos) {
    const dx = pos.x - this.camera.position.x, dz = pos.z - this.camera.position.z;
    const d = Math.hypot(dx, dz) || 1;
    return clamp((dx * -this.cam.fwdZ + dz * this.cam.fwdX) / d, -1, 1);
  }
  volOf(pos) {
    const d = Math.hypot(pos.x - this.player.pos.x, pos.z - this.player.pos.z);
    return clamp(1.4 / (1 + d * 0.12), 0.2, 1.2);
  }
  onEnemyWindup(e) {
    if (!this.blindOn) return;
    const v = new THREE.Vector3(e.pos.x, 1.2, e.pos.z).project(this.camera);
    if (v.z > 1 || v.x > 0.08) this.ui.danger();
  }
  onPlayerDeath() {
    this.deathT = 3.0;
    this.player.controlEnabled = false;
  }
  hitStop(t) { this.hitStopT = Math.max(this.hitStopT, t); }
  callout(text) { this.ui.callout(text); }
  say(who, text, sec) { this.ui.subtitle(who, text); this.sayT = sec; }

  // ---------------------------------------------------------------- events
  on(type, fn) {
    (this.listeners[type] ||= new Set()).add(fn);
    return () => this.listeners[type].delete(fn);
  }
  onStage(type, fn) {
    const off = this.on(type, fn);
    this.stageListeners.push(off);
    return off;
  }
  clearStageListeners() {
    for (const off of this.stageListeners) off();
    this.stageListeners = [];
  }
  emit(type, data) {
    const s = this.listeners[type];
    if (s) for (const fn of [...s]) fn(data || {});
  }

  // ---------------------------------------------------------------- world control
  learn(skill) {
    const P = this.player;
    if (P.skills.has(skill)) return;
    P.skills.add(skill);
    const S = SKILLS[skill];
    if (S) {
      this.ui.toast(S.name, S.how);
      this.audio.chime();
    }
    this.save();
  }
  spawn(type, x, z, o = {}) {
    const e = new Enemy(this, type, x, z, o);
    e.facing = angleTo(x, z, this.player.pos.x, this.player.pos.z);
    this.enemies.push(e);
    return e;
  }
  spawnVessa(x, z) {
    const v = new Vessa(this, x, z);
    v.facing = angleTo(x, z, this.player.pos.x, this.player.pos.z);
    this.enemies.push(v);
    this.vessa = v;
    return v;
  }
  addExtra(x, z, facing) {
    const m = new Extra(this, x, z, facing);
    this.extras.push(m);
    return m;
  }
  removeExtra(m) {
    m.dispose();
    this.extras = this.extras.filter((x) => x !== m);
  }
  clearEnemies() {
    for (const e of this.enemies) { if (e.tele) e.tele.remove(); e.dispose(); }
    this.enemies = [];
    this.tokens.clear();
    this.vessa = null;
    this.player.lock = null;
  }
  resetWorld(o) {
    this.clearEnemies();
    for (const m of this.extras) m.dispose();
    this.extras = [];
    this.fx.clear();
    this.clearPickups();
    this.stopHold();
    this.timeScale = 1;
    this.hitStopT = 0;
    this.freezeAI = false;
    this.sparring = !!o.sparring;
    this.deathT = 0;
    const P = this.player;
    P.reset(o.player[0], o.player[1], o.player[2]);
    P.hp = P.maxHp;
    P.controlEnabled = false;
    P.rig.scar.visible = !!o.scar;
    if (o.skills) for (const s of o.skills) P.skills.add(s);
    const C = this.corin;
    C.rig.weapon.group.visible = true;
    if (o.corin === 'dead') {
      C.reset(-1.7, -8.6, -1.45, 'dead');
      C.setState('dead');
      C.dead = true;
      C.solid = false;
    } else if (o.corin) {
      C.reset(o.corin[0], o.corin[1], o.corin[2], o.corin[3]);
    }
    this.soldiersMesh.visible = !!o.soldiers;
    this.blind(!!o.blind);
    this.world.setDawn(0);
    this.bossBar(false);
    this.planted.visible = false;
    this.ui.objective('');
    this.ui.hint('');
    this.ui.progress(null);
    this.ui.subtitle(null);
    this.ui.hideDialogue();
    this.ui.chronicleClose();
    this.setCinematic(false);
    this.marker(null);
    if (o.music) this.audio.setMusic(o.music);
    this.cam.release();
  }
  campSoldiers(v) { this.soldiersMesh.visible = v; }
  blind(on) { this.blindOn = on; this.ui.blind(on); }
  bossBar(on) { this.bossOn = on; if (!on) this.ui.boss(null); }
  setCinematic(on) {
    this.cinematic = on;
    this.ui.letterbox(on);
    this.ui.hudVisible(!on && this.started);
    this.updateTouch();
  }
  updateTouch() {
    this.ui.touchVisible(this.started && !this.cinematic && !this.ended && !this.paused && this.input.device === 'touch');
  }
  startHold(progress) {
    this.hold = { active: true, paused: false, progress, spawnT: 1.2, far: false };
    if (!this.stretchers.length) for (let i = 0; i < 4; i++) this.stretchers.push(new Stretcher(this, i));
    for (const s of this.stretchers) s.setProgress(progress, this.clock);
  }
  stopHold() {
    if (this.hold.far) this.ui.hint('');
    this.hold.far = false;
    this.hold.active = false;
    for (const s of this.stretchers) s.group.visible = false;
    this.ui.progress(null);
  }
  updateHold(dt) {
    const H = this.hold;
    if (!H.active) return;
    const P = this.player;
    const near = Math.hypot(P.pos.x - MOUTH.x, P.pos.z - MOUTH.z) < 7.5;
    if (!H.paused && P.alive) {
      if (near) H.progress = Math.min(1, H.progress + dt / 56);
      if (!near && !H.far) { H.far = true; this.ui.hint("Get back to the Narrows. The stretchers can't move without cover."); }
      if (near && H.far) { H.far = false; this.ui.hint(''); }
      H.spawnT -= dt;
      const cap = this.corin.dead ? 5 : 4;
      if (H.spawnT <= 0 && this.liveEnemies() < cap && H.progress < 0.985) {
        H.spawnT = rand(2.0, 3.2);
        const shield = H.progress > 0.2 && Math.random() < 0.3;
        const [x, z] = pick(SPAWNS);
        this.spawn(shield ? 'shield' : 'raider', x + rand(-1, 1), z + rand(-1, 1));
      }
    }
    let done = 0;
    for (const s of this.stretchers) { s.setProgress(H.progress, this.clock); if (s.done) done++; }
    this.ui.progress(H.progress, `Wounded carried to safety: ${done} of 4`);
  }

  // ---------------------------------------------------------------- props
  makeReticle() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd27a, depthTest: false, transparent: true, opacity: 0.95, fog: false });
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 4), mat);
      const a = (i / 3) * TAU;
      c.position.set(Math.sin(a) * 0.42, 0, Math.cos(a) * 0.42);
      c.rotation.x = Math.PI;
      c.renderOrder = 999;
      g.add(c);
    }
    g.visible = false;
    this.scene.add(g);
    this.reticle = g;
  }
  updateReticle(dt) {
    const L = this.player.lock;
    if (!L || !L.rig.root.visible) { this.reticle.visible = false; return; }
    this.reticle.visible = true;
    const h = 2.3 * (L.rig.scale || 1) + (L.y || 0);
    this.reticle.position.set(L.pos.x, h + Math.sin(this.clock * 6) * 0.06, L.pos.z);
    this.reticle.rotation.y += dt * 2.5;
  }
  makeMarker() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 7, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0x9ff0e2, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.y = 3.5;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0xbff8ee }));
    gem.position.y = 2.3;
    g.add(beam, gem);
    g.visible = false;
    this.scene.add(g);
    this.markerObj = g;
    this.markerGem = gem;
  }
  marker(x, z) {
    if (x == null) { this.markerObj.visible = false; return; }
    this.markerObj.position.set(x, 0, z);
    this.markerObj.visible = true;
  }
  updateMarker(dt) {
    if (!this.markerObj.visible) return;
    this.markerGem.rotation.y += dt * 2;
    this.markerGem.position.y = 2.3 + Math.sin(this.clock * 3) * 0.15;
  }
  makeHearts() {
    const s = new THREE.Shape();
    s.moveTo(0, 0.25);
    s.bezierCurveTo(0, 0.3, -0.05, 0.4, -0.2, 0.4);
    s.bezierCurveTo(-0.45, 0.4, -0.45, 0.12, -0.45, 0.12);
    s.bezierCurveTo(-0.45, -0.05, -0.3, -0.22, 0, -0.4);
    s.bezierCurveTo(0.3, -0.22, 0.45, -0.05, 0.45, 0.12);
    s.bezierCurveTo(0.45, 0.12, 0.45, 0.4, 0.2, 0.4);
    s.bezierCurveTo(0.05, 0.4, 0, 0.3, 0, 0.25);
    this.heartGeo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false, curveSegments: 4 });
    this.heartGeo.center();
    this.heartMat = new THREE.MeshLambertMaterial({ color: 0xd8333a, emissive: 0x6a0c10, flatShading: true });
    this.pickups = [];
  }
  dropHeart(x, z) {
    const m = new THREE.Mesh(this.heartGeo, this.heartMat);
    m.scale.setScalar(0.75);
    m.position.set(x, 0.7, z);
    this.scene.add(m);
    this.pickups.push({ m, t: 0 });
  }
  updatePickups(dt) {
    const P = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      p.m.rotation.y += dt * 2.6;
      p.m.position.y = 0.7 + Math.sin(p.t * 3) * 0.12;
      p.m.visible = p.t < 10 || Math.floor(p.t * 8) % 2 === 0;
      const got = P.alive && Math.hypot(P.pos.x - p.m.position.x, P.pos.z - p.m.position.z) < 1.15;
      if (got) {
        P.hp = Math.min(P.maxHp, P.hp + 2);
        this.audio.heart();
        this.fx.burst(p.m.position.x, 0.8, p.m.position.z, 10, 0xff8a8a, 2);
      }
      if (got || p.t > 14) {
        this.scene.remove(p.m);
        this.pickups.splice(i, 1);
      }
    }
  }
  clearPickups() {
    for (const p of this.pickups) this.scene.remove(p.m);
    this.pickups.length = 0;
  }
  makePlantedSword() {
    const s = this.corin.rig.weapon.group.clone(true);
    s.visible = false;
    this.scene.add(s);
    this.planted = s;
  }
  plantSword(x, z) {
    this.planted.position.set(x, 0.95, z);
    this.planted.rotation.set(0.12, 0.6, 0.08);
    this.planted.visible = true;
  }

  // ---------------------------------------------------------------- screens
  setupScreens() {
    const $ = (id) => document.getElementById(id);
    $('btn-begin').addEventListener('click', () => this.begin(0));
    const cont = $('btn-continue');
    const cp = this.data.cp;
    if (cp > 0 && STAGES[cp] && STAGES[cp].checkpoint) {
      cont.hidden = false;
      cont.addEventListener('click', () => {
        for (const s of this.data.skills || []) this.player.skills.add(s);
        this.begin(cp);
      });
    }
    $('pause-btn').addEventListener('click', (e) => { e.stopPropagation(); this.togglePause(); });
    $('btn-resume').addEventListener('click', () => this.togglePause(false));
    $('btn-restart').addEventListener('click', () => {
      this.togglePause(false);
      this.director.abort({ respawn: true });
    });
    $('btn-sound').addEventListener('click', () => {
      this.audio.setMuted(!this.audio.muted);
      $('btn-sound').textContent = `Sound: ${this.audio.muted ? 'off' : 'on'}`;
    });
    $('btn-again').addEventListener('click', () => this.playAgain());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.started && !this.ended) this.togglePause(true);
    });
  }
  begin(index) {
    this.audio.init();
    this.ui.el.title.classList.add('gone');
    this.started = true;
    this.ended = false;
    this.ui.hudVisible(true);
    this.updateTouch();
    this.cam.mode = 'follow';
    this.player.controlEnabled = false;
    runStory(this, index).catch((e) => console.error(e));
  }
  togglePause(v) {
    const p = v ?? !this.paused;
    if (p === this.paused) return;
    this.paused = p;
    this.ui.el.pause.classList.toggle('show', p);
    if (p) {
      this.ui.setSkills([...this.player.skills].map((k) => SKILLS[k]).filter(Boolean), this.ui.el.pauseSkills);
      this.ui.refreshDevice();
      if (this.audio.ctx) this.audio.ctx.suspend().catch(() => {});
    } else {
      if (this.audio.ctx) this.audio.ctx.resume().catch(() => {});
      this.input.releaseAll();
    }
    this.updateTouch();
  }
  showEnd() {
    this.ended = true;
    this.updateTouch();
    this.ui.chronicleClose();
    this.ui.setSkills([...this.player.skills].map((k) => SKILLS[k]).filter(Boolean), this.ui.el.endSkills);
    this.ui.el.end.classList.add('show');
    this.ui.hudVisible(false);
  }
  playAgain() {
    this.ui.el.end.classList.remove('show');
    this.ended = false;
    this.player.skills = new Set();
    this.flags = {};
    this.checkpointIndex = 0;
    this.save();
    this.ui.fade(1, 0);
    this.ui.hudVisible(true);
    runStory(this, 0).catch((e) => console.error(e));
  }
  save() {
    this.snapshot = { cp: this.checkpointIndex, skills: [...this.player.skills], flags: { ...this.flags } };
  }
}

function start(data) {
  const game = new Game(data && typeof data === 'object' ? data : {});
  window.claude?.hot?.snapshot?.(() => game.snapshot || {});
  window.__unsung = {
    game,
    jump: (name) => game.director.abort({ respawn: true, jump: stageIndex(name) }),
    stages: STAGES.map((s) => s.name),
  };
}
if (window.claude?.hot?.ready) window.claude.hot.ready(start);
else start(window.claude?.hot?.data ?? {});
void Extra;
