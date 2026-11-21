// HUD: every DOM readout, menu, toast, subtitle and banner. The HTML
// structure lives in game/index.html; this class owns its state.
import { RADIO } from './config.js';

export interface HudState {
  health: number;
  armor: number;
  cash: number;
  speedMph: number;
  inVehicle: boolean;
  vehHp: number;
  vehHpMax: number;
  stars: number;
  weaponName: string;
  clip: number;
  reserve: number;
  district: string;
  objectiveTitle: string;
  objectiveStep: string;
  objectiveDist: number;
  radio: string;
  wanted: boolean;
}

export interface MenuCallbacks {
  onNewGame: () => void;
  onContinue: () => void;
  onResume: () => void;
  onRestartMission: () => void;
  onSave: () => void;
  onQuit: () => void;
  onQuality: (q: 'low' | 'medium' | 'high') => void;
  onVolume: (v: number) => void;
}

export class HUD {
  private el: Record<string, HTMLElement> = {};
  private lastDistrict = '';
  private districtTimer = 0;
  private toastTimer: number | null = null;
  private subtitleTimer: number | null = null;
  private hitTimer = 0;
  private damageFlash = 0;

  constructor(private cb: MenuCallbacks) {
    const ids = [
      'hud-live', 'hud', 'stars', 'cash', 'weapon-name', 'weapon-ammo', 'health-fill', 'armor-fill',
      'speed-num', 'speed-label', 'veh-hp-fill', 'veh-hp-row', 'district', 'objective-title',
      'objective-step', 'objective-dist', 'radio', 'crosshair', 'hitmarker', 'toast',
      'subtitle', 'subtitle-speaker', 'subtitle-line', 'damage', 'letterbox-top',
      'letterbox-bottom', 'interact', 'vault-wrap', 'vault-fill', 'title-screen',
      'pause-menu', 'ending-screen', 'controls-screen', 'btn-new', 'btn-continue',
      'btn-resume', 'btn-restart', 'btn-save', 'btn-quit', 'btn-controls', 'btn-back',
      'quality', 'volume', 'ending-stats', 'loading', 'shop-panel', 'shop-title',
      'shop-items', 'shop-close', 'minimap', 'wasted',
    ];
    for (const id of ids) {
      const e = document.getElementById(id);
      if (e) this.el[id] = e;
    }
    this.bind('btn-new', () => cb.onNewGame());
    this.bind('btn-continue', () => cb.onContinue());
    this.bind('btn-resume', () => cb.onResume());
    this.bind('btn-restart', () => cb.onRestartMission());
    this.bind('btn-save', () => cb.onSave());
    this.bind('btn-quit', () => cb.onQuit());
    this.bind('btn-controls', () => this.show('controls-screen'));
    this.bind('btn-back', () => this.hide('controls-screen'));
    this.bind('shop-close', () => this.hide('shop-panel'));
    const q = this.el['quality'] as HTMLSelectElement | undefined;
    if (q) q.addEventListener('change', () => cb.onQuality(q.value as 'low' | 'medium' | 'high'));
    const v = this.el['volume'] as HTMLInputElement | undefined;
    if (v) v.addEventListener('input', () => cb.onVolume(Number(v.value) / 100));
  }

  private bind(id: string, fn: () => void): void {
    const e = this.el[id];
    if (e) e.addEventListener('click', fn);
  }
  show(id: string): void {
    this.el[id]?.classList.remove('hidden');
  }
  hide(id: string): void {
    this.el[id]?.classList.add('hidden');
  }
  isShown(id: string): boolean {
    return !!this.el[id] && !this.el[id].classList.contains('hidden');
  }

  setLoading(text: string): void {
    const e = this.el['loading'];
    if (e) e.textContent = text;
  }
  hideLoading(): void {
    this.hide('loading');
  }

  showTitle(hasSave: boolean): void {
    this.show('title-screen');
    this.hide('pause-menu');
    this.hide('ending-screen');
    const c = this.el['btn-continue'];
    if (c) c.classList.toggle('hidden', !hasSave);
  }
  hideTitle(): void {
    this.hide('title-screen');
  }
  // The live HUD (minimap, bars, cash, stars, objective) starts hidden
  // in the HTML and is shown only while actually playing, so the title
  // screen stays clean and every gameplay shot carries the HUD.
  showLive(): void {
    this.show('hud-live');
  }
  hideLive(): void {
    this.hide('hud-live');
  }
  showPause(): void {
    this.show('pause-menu');
  }
  hidePause(): void {
    this.hide('pause-menu');
  }
  showEnding(stats: string): void {
    const e = this.el['ending-stats'];
    if (e) e.textContent = stats;
    this.show('ending-screen');
  }
  hideEnding(): void {
    this.hide('ending-screen');
  }

  toast(msg: string): void {
    const e = this.el['toast'];
    if (!e) return;
    e.textContent = msg;
    e.classList.remove('hidden');
    e.classList.add('show');
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      e.classList.remove('show');
      e.classList.add('hidden');
    }, 3200);
  }

  subtitle(speaker: string, line: string): void {
    const s = this.el['subtitle'];
    const sp = this.el['subtitle-speaker'];
    const ln = this.el['subtitle-line'];
    if (!s || !sp || !ln) return;
    sp.textContent = speaker;
    ln.textContent = line;
    s.classList.remove('hidden');
    if (this.subtitleTimer !== null) window.clearTimeout(this.subtitleTimer);
    this.subtitleTimer = window.setTimeout(() => s.classList.add('hidden'), 3400);
  }
  clearSubtitle(): void {
    this.el['subtitle']?.classList.add('hidden');
  }

  letterbox(on: boolean): void {
    this.el['letterbox-top']?.classList.toggle('on', on);
    this.el['letterbox-bottom']?.classList.toggle('on', on);
  }

  hitmarker(): void {
    this.hitTimer = 0.25;
    const h = this.el['hitmarker'];
    if (h) h.classList.add('show');
  }

  damage(): void {
    this.damageFlash = 1;
  }

  setInteract(text: string | null): void {
    const e = this.el['interact'];
    if (!e) return;
    if (text) {
      e.textContent = text;
      e.classList.remove('hidden');
    } else {
      e.classList.add('hidden');
    }
  }

  setVaultProgress(p: number | null): void {
    const w = this.el['vault-wrap'];
    const f = this.el['vault-fill'];
    if (!w || !f) return;
    if (p === null) {
      w.classList.add('hidden');
      return;
    }
    w.classList.remove('hidden');
    f.style.width = `${Math.round(p * 100)}%`;
  }

  showShop(title: string, items: { label: string; price: number; canAfford: boolean; onBuy: () => void }[]): void {
    const panel = this.el['shop-panel'];
    const t = this.el['shop-title'];
    const list = this.el['shop-items'];
    if (!panel || !t || !list) return;
    t.textContent = title;
    list.innerHTML = '';
    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'shop-row';
      const label = document.createElement('span');
      label.textContent = item.label;
      const btn = document.createElement('button');
      btn.className = 'shop-buy';
      btn.textContent = `$${item.price}`;
      btn.disabled = !item.canAfford;
      btn.addEventListener('click', () => {
        item.onBuy();
        this.hide('shop-panel');
      });
      row.appendChild(label);
      row.appendChild(btn);
      list.appendChild(row);
    }
    panel.classList.remove('hidden');
  }

  hideShop(): void {
    this.hide('shop-panel');
  }

  update(s: HudState, dt: number): void {
    // stars
    const starsEl = this.el['stars'];
    if (starsEl) {
      const spans = starsEl.children;
      for (let i = 0; i < spans.length; i++) {
        spans[i].classList.toggle('lit', i < s.stars);
      }
      starsEl.classList.toggle('hot', s.stars > 0);
    }
    const cash = this.el['cash'];
    if (cash) cash.textContent = `$${s.cash.toLocaleString('en-US')}`;
    const wn = this.el['weapon-name'];
    if (wn) wn.textContent = s.weaponName;
    const wa = this.el['weapon-ammo'];
    if (wa) {
      wa.textContent = s.clip === Infinity ? '∞' : `${s.clip} / ${s.reserve === Infinity ? '∞' : s.reserve}`;
    }
    const hf = this.el['health-fill'];
    if (hf) hf.style.width = `${Math.max(0, Math.min(100, s.health))}%`;
    const af = this.el['armor-fill'];
    if (af) af.style.width = `${Math.max(0, Math.min(100, s.armor))}%`;
    const sp = this.el['speed-num'];
    if (sp) sp.textContent = s.inVehicle ? `${Math.round(s.speedMph)}` : '';
    const sl = this.el['speed-label'];
    if (sl) sl.textContent = s.inVehicle ? 'MPH' : '';
    const vr = this.el['veh-hp-row'];
    if (vr) vr.classList.toggle('hidden', !s.inVehicle);
    const vf = this.el['veh-hp-fill'];
    if (vf) vf.style.width = `${Math.max(0, Math.min(100, (s.vehHp / Math.max(1, s.vehHpMax)) * 100))}%`;
    // district banner
    if (s.district !== this.lastDistrict) {
      this.lastDistrict = s.district;
      this.districtTimer = 2.6;
      const d = this.el['district'];
      if (d) {
        d.textContent = s.district;
        d.classList.remove('hidden');
        d.classList.add('show');
      }
    }
    if (this.districtTimer > 0) {
      this.districtTimer -= dt;
      if (this.districtTimer <= 0) {
        this.el['district']?.classList.add('hidden');
        this.el['district']?.classList.remove('show');
      }
    }
    // objective
    const ot = this.el['objective-title'];
    if (ot) ot.textContent = s.objectiveTitle;
    const os = this.el['objective-step'];
    if (os) os.textContent = s.objectiveStep;
    const od = this.el['objective-dist'];
    if (od) od.textContent = s.objectiveDist > 0 ? `${Math.round(s.objectiveDist)}m` : '';
    // radio
    const r = this.el['radio'];
    if (r) r.textContent = s.radio;
    // hitmarker decay
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.el['hitmarker']?.classList.remove('show');
    }
    // damage vignette decay
    if (this.damageFlash > 0) {
      this.damageFlash = Math.max(0, this.damageFlash - dt * 1.6);
      const d = this.el['damage'];
      if (d) d.style.opacity = `${this.damageFlash * 0.55}`;
    }
  }

  showWasted(): void {
    const w = this.el['wasted'];
    if (!w) return;
    w.classList.remove('hidden');
    window.setTimeout(() => w.classList.add('hidden'), 2200);
  }

  radioName(i: number): string {
    return RADIO[i]?.name ?? '';
  }
}
