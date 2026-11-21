// Keyboard + mouse input. Tracks held keys, edge-triggered presses
// (cleared once per frame by the game loop), and pointer-lock mouse deltas.
export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  mouseDown = false;
  mouseRight = false;
  mouseDownPressed = false;
  mouseRightPressed = false;
  locked = false;
  private element: HTMLElement;
  private onKey: ((e: KeyboardEvent) => void) | null = null;

  constructor(element: HTMLElement) {
    this.element = element;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (this.onKey) this.onKey(e);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
    element.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseDownPressed = true;
      }
      if (e.button === 2) {
        this.mouseRight = true;
        this.mouseRightPressed = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.mouseRight = false;
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === element;
    });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setKeyHandler(fn: (e: KeyboardEvent) => void): void {
    this.onKey = fn;
  }

  requestLock(): void {
    if (!this.locked) {
      try {
        const p = this.element.requestPointerLock() as unknown as Promise<void> | undefined;
        if (p && typeof p.catch === 'function') p.catch(() => undefined);
      } catch {
        // pointer lock unavailable (headless); mouse still works via deltas
      }
    }
  }

  held(code: string): boolean {
    return this.keys.has(code);
  }
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }
  axis(neg: string, pos: string): number {
    let v = 0;
    if (this.keys.has(neg)) v -= 1;
    if (this.keys.has(pos)) v += 1;
    return v;
  }
  consumeMouse(): { dx: number; dy: number } {
    const out = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return out;
  }
  endFrame(): void {
    this.pressed.clear();
    this.mouseDownPressed = false;
    this.mouseRightPressed = false;
  }
}
