// Keyboard + mouse input. Tracks held keys, edge-triggered presses
// (cleared once per frame by the game loop), and pointer-lock mouse deltas.
export class Input {
    keys = new Set();
    pressed = new Set();
    mouseDX = 0;
    mouseDY = 0;
    mouseDown = false;
    mouseRight = false;
    mouseDownPressed = false;
    mouseRightPressed = false;
    locked = false;
    element;
    onKey = null;
    constructor(element) {
        this.element = element;
        window.addEventListener('keydown', (e) => {
            if (e.repeat)
                return;
            this.keys.add(e.code);
            this.pressed.add(e.code);
            if (this.onKey)
                this.onKey(e);
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
            if (e.button === 0)
                this.mouseDown = false;
            if (e.button === 2)
                this.mouseRight = false;
        });
        document.addEventListener('mousemove', (e) => {
            if (!this.locked)
                return;
            this.mouseDX += e.movementX;
            this.mouseDY += e.movementY;
        });
        document.addEventListener('pointerlockchange', () => {
            this.locked = document.pointerLockElement === element;
        });
        element.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    setKeyHandler(fn) {
        this.onKey = fn;
    }
    requestLock() {
        if (!this.locked) {
            try {
                const p = this.element.requestPointerLock();
                if (p && typeof p.catch === 'function')
                    p.catch(() => undefined);
            }
            catch {
                // pointer lock unavailable (headless); mouse still works via deltas
            }
        }
    }
    held(code) {
        return this.keys.has(code);
    }
    wasPressed(code) {
        return this.pressed.has(code);
    }
    axis(neg, pos) {
        let v = 0;
        if (this.keys.has(neg))
            v -= 1;
        if (this.keys.has(pos))
            v += 1;
        return v;
    }
    consumeMouse() {
        const out = { dx: this.mouseDX, dy: this.mouseDY };
        this.mouseDX = 0;
        this.mouseDY = 0;
        return out;
    }
    endFrame() {
        this.pressed.clear();
        this.mouseDownPressed = false;
        this.mouseRightPressed = false;
    }
}
