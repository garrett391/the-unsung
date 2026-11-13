// Shared game state. Systems import G instead of reaching into each other.
export const G = {
  time: 0, rdt: 0, hitstop: 0, slow: 0, shake: 0, timeScale: 1,
  scene: null, camera: null, renderer: null,
  player: null, corin: null, enemies: [], spar: false,
  running: false, cinematic: false, freezeAI: false, maxAtk: 2, kills: 0,
  stage: 0, checkpoint: 0, runId: 0, confirm: false, auto: false,
  hold: null, boss: null,
  listeners: new Set(),
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit(kind, data) { for (const fn of [...this.listeners]) fn(kind, data || {}); },
  // Everything the player's sword and lock-on can reach.
  targets() { return this.spar && this.corin ? [this.corin, ...this.enemies] : this.enemies; },
};
