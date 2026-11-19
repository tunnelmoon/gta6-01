// Keyboard and mouse input. Tracks held keys, edge-triggered presses, and
// mouse look deltas. Pointer lock is requested on canvas click during play;
// mouse look also works without lock via movement deltas while dragging.
export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  mouseDown = false;
  mouseDownLeft = false;
  mouseDownRight = false;
  mouseClicked = false;
  wheelDelta = 0;
  pointerLocked = false;
  private canvas: HTMLCanvasElement;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.pressed.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseDownLeft = true;
        this.mouseClicked = true;
        this.requestLock();
      } else if (e.button === 2) {
        this.mouseDownRight = true;
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouseDown = false;
        this.mouseDownLeft = false;
      } else if (e.button === 2) {
        this.mouseDownRight = false;
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    window.addEventListener('wheel', (e) => {
      this.wheelDelta += e.deltaY;
    }, { passive: true });
  }

  requestLock(): void {
    try {
      if (document.pointerLockElement !== this.canvas) {
        const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (p && typeof p.catch === 'function') p.catch(() => undefined);
      }
    } catch {
      // Headless or denied: mouse look degrades gracefully.
    }
  }

  releaseLock(): void {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch {
      // ignore
    }
  }

  down(...names: string[]): boolean {
    return names.some((n) => this.keys.has(n));
  }

  wasPressed(...names: string[]): boolean {
    return names.some((n) => this.pressed.has(n));
  }

  consumeMouse(): { dx: number; dy: number } {
    const out = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return out;
  }

  endFrame(): void {
    this.pressed.clear();
    this.mouseClicked = false;
    this.wheelDelta = 0;
  }

  onKeyPress(handler: (e: KeyboardEvent) => void): void {
    this.onKey = handler;
    window.addEventListener('keydown', handler);
  }
}
