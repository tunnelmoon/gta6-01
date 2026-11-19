// HUD: all DOM chrome. Health/armor/speed/vehicle bars bottom-left beside
// the minimap, stars/cash/weapon top-right, district banner, objective,
// subtitles, interact prompt, toasts, and every menu (title, pause, shop,
// wasted/busted, story complete, controls). Width-only bars: the fill
// element's style.width carries the value.
import { RadioStation } from './audio.js';

export type MenuName = 'title' | 'pause' | 'shop' | 'dead' | 'complete' | 'controls' | 'none';

export interface HudCallbacks {
  onNewGame(): void;
  onContinue(): void;
  onResume(): void;
  onRestartMission(): void;
  onSave(): void;
  onQuitToTitle(): void;
  onQuality(q: string): void;
  onShopBuy(item: string): void;
  onCloseShop(): void;
  onToggleMap(): void;
}

export class Hud {
  root: HTMLElement;
  private starsEl: HTMLElement;
  private cashEl: HTMLElement;
  private weaponEl: HTMLElement;
  private ammoEl: HTMLElement;
  private healthFill: HTMLElement;
  private armorFill: HTMLElement;
  private speedEl: HTMLElement;
  private speedVal: HTMLElement;
  private vehicleHpFill: HTMLElement;
  private vehicleRow: HTMLElement;
  private districtEl: HTMLElement;
  private radioEl: HTMLElement;
  private objectiveEl: HTMLElement;
  private subtitleEl: HTMLElement;
  private subtitleSpeaker: HTMLElement;
  private subtitleText: HTMLElement;
  private promptEl: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private menus = new Map<MenuName, HTMLElement>();
  private cb: HudCallbacks;

  constructor(cb: HudCallbacks) {
    this.cb = cb;
    this.root = document.getElementById('hud')!;
    this.starsEl = document.getElementById('stars')!;
    this.cashEl = document.getElementById('cash')!;
    this.weaponEl = document.getElementById('weapon-name')!;
    this.ammoEl = document.getElementById('weapon-ammo')!;
    this.healthFill = document.getElementById('health-fill')!;
    this.armorFill = document.getElementById('armor-fill')!;
    this.speedEl = document.getElementById('speed')!;
    this.speedVal = document.getElementById('speed-val')!;
    this.vehicleHpFill = document.getElementById('vehhp-fill')!;
    this.vehicleRow = document.getElementById('vehhp-row')!;
    this.districtEl = document.getElementById('district')!;
    this.radioEl = document.getElementById('radio')!;
    this.objectiveEl = document.getElementById('objective')!;
    this.subtitleEl = document.getElementById('subtitle')!;
    this.subtitleSpeaker = document.getElementById('subtitle-speaker')!;
    this.subtitleText = document.getElementById('subtitle-text')!;
    this.promptEl = document.getElementById('prompt')!;
    this.toastEl = document.getElementById('toast')!;
    for (const name of ['title', 'pause', 'shop', 'dead', 'complete', 'controls'] as MenuName[]) {
      const el = document.getElementById('menu-' + name);
      if (el) this.menus.set(name, el);
    }
    this.wireButtons();
  }

  private wireButtons(): void {
    const bind = (id: string, fn: () => void) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => {
        fn();
      });
    };
    bind('btn-newgame', () => this.cb.onNewGame());
    bind('btn-continue', () => this.cb.onContinue());
    bind('btn-controls', () => this.showMenu('controls'));
    bind('btn-controls-back', () => this.showMenu('title'));
    bind('btn-resume', () => this.cb.onResume());
    bind('btn-restart-mission', () => this.cb.onRestartMission());
    bind('btn-save', () => this.cb.onSave());
    bind('btn-quit', () => this.cb.onQuitToTitle());
    bind('btn-map', () => this.cb.onToggleMap());
    bind('btn-dead-retry', () => this.cb.onResume());
    bind('btn-complete-roam', () => this.cb.onResume());
    bind('btn-shop-close', () => this.cb.onCloseShop());
    for (const item of ['armor', 'ammo', 'repair', 'respray']) {
      bind('shop-' + item, () => this.cb.onShopBuy(item));
    }
    for (const q of ['low', 'medium', 'high']) {
      bind('quality-' + q, () => this.cb.onQuality(q));
    }
  }

  showMenu(name: MenuName): void {
    for (const [key, el] of this.menus) {
      el.classList.toggle('visible', key === name);
    }
    this.root.classList.toggle('menu-open', name !== 'none');
  }

  hideMenus(): void {
    this.showMenu('none');
  }

  setHealth(hp: number, armor: number): void {
    this.healthFill.style.width = Math.max(0, Math.min(100, hp)) + '%';
    this.armorFill.style.width = Math.max(0, Math.min(100, armor)) + '%';
  }

  setCash(cash: number): void {
    this.cashEl.textContent = '$' + Math.floor(cash).toLocaleString('en-US');
  }

  setStars(n: number): void {
    const stars = '★★★★★';
    const filled = stars.slice(0, n);
    const empty = stars.slice(n);
    this.starsEl.innerHTML = '<span class="star-on">' + filled + '</span><span class="star-off">' + empty + '</span>';
  }

  setWeapon(name: string, clip: number, reserve: number, hasMag: boolean): void {
    this.weaponEl.textContent = name;
    this.ammoEl.textContent = hasMag ? clip + ' / ' + reserve : '';
  }

  setSpeed(mph: number, inVehicle: boolean, vehicleHpPct: number): void {
    this.speedEl.style.display = inVehicle ? 'block' : 'none';
    this.speedVal.textContent = inVehicle ? String(Math.round(mph)) : '';
    this.vehicleRow.style.display = inVehicle ? 'flex' : 'none';
    this.vehicleHpFill.style.width = Math.max(0, Math.min(100, vehicleHpPct)) + '%';
  }

  setDistrict(name: string): void {
    if (this.districtEl.textContent !== name) {
      this.districtEl.textContent = name;
      this.districtEl.classList.remove('pop');
      void this.districtEl.offsetWidth;
      this.districtEl.classList.add('pop');
    }
  }

  setRadio(station: RadioStation): void {
    this.radioEl.textContent = station === 'wave' ? 'SOLMAR WAVE 104.5' : station === 'heat' ? 'DORADO HEAT 98.2' : 'RADIO OFF';
  }

  setObjective(text: string): void {
    this.objectiveEl.textContent = text;
    this.objectiveEl.style.display = text ? 'block' : 'none';
  }

  showSubtitle(speaker: string, text: string): void {
    this.subtitleSpeaker.textContent = speaker;
    this.subtitleText.textContent = text;
    this.subtitleEl.classList.add('visible');
  }

  clearSubtitle(): void {
    this.subtitleEl.classList.remove('visible');
  }

  showPrompt(text: string): void {
    this.promptEl.textContent = text;
    this.promptEl.classList.add('visible');
  }

  hidePrompt(): void {
    this.promptEl.classList.remove('visible');
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('visible'), 3200);
  }

  setDeadTitle(kind: 'WASTED' | 'BUSTED'): void {
    const el = document.getElementById('dead-title');
    if (el) el.textContent = kind;
  }

  setCompleteStats(cash: number, timeMin: number): void {
    const el = document.getElementById('complete-stats');
    if (el) el.textContent = 'Cash earned: $' + Math.floor(cash).toLocaleString('en-US') + ' - Time: ' + timeMin + ' min - Solmar is yours.';
  }

  setShopPrices(discount: boolean, armor: number, ammo: number, repair: number, respray: number): void {
    const set = (id: string, v: number) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '$' + v;
    };
    set('price-armor', armor);
    set('price-ammo', ammo);
    set('price-repair', repair);
    set('price-respray', respray);
    const note = document.getElementById('shop-note');
    if (note) note.textContent = discount ? 'Story complete: 50% discount applied.' : 'Pay once, drive forever.';
  }

  setContinueVisible(visible: boolean): void {
    const el = document.getElementById('btn-continue');
    if (el) el.style.display = visible ? 'block' : 'none';
  }

  setHudVisible(v: boolean): void {
    const el = document.getElementById('hud-live');
    if (el) el.style.display = v ? 'block' : 'none';
  }

  setLoading(done: boolean): void {
    const el = document.getElementById('loading');
    if (el) el.style.display = done ? 'none' : 'flex';
  }

  setLoadingText(text: string): void {
    const el = document.getElementById('loading-text');
    if (el) el.textContent = text;
  }
}
