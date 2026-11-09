/**
 * Единый ввод для ПК и мобильных.
 * Мобильные контролы пишут в те же поля, поэтому игровой код не знает,
 * откуда пришло управление.
 */
export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.moveX = 0; this.moveZ = 0;
    this.lookX = 0; this.lookY = 0;
    this.jumpHeld = false; this.jumpPressed = false;
    this.useHeld = false; this.usePressed = false;
    this.altPressed = false;
    this.sprint = false;
    this.slotRequest = -1;
    this.padSlot = -1;
    this.slotCycle = 0;
    // экранные контролы пишут сюда, чтобы не спорить с клавиатурой
    this.stickX = 0; this.stickZ = 0; this.stickSprint = false;
    this.padJump = false;
    this.pausePressed = false;
    this.enabled = false;
    this.locked = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.touchMode = false;
    this.lockFails = 0;
    this.onPointerLockChange = null;
    this.onEscape = null;

    this._dragId = null;
    this._dragX = 0; this._dragY = 0;

    this._bind();
  }

  _bind() {
    const kd = (e) => {
      if (!this.enabled) return;
      const c = e.code;
      if (c === 'Escape') { this.pausePressed = true; if (this.onEscape) this.onEscape(); return; }
      if (this.keys.has(c)) return;
      this.keys.add(c);
      if (c === 'Space') { this.jumpPressed = true; e.preventDefault(); }
      // цифры 1..9 выбирают предмет в панели
      const dm = /^(?:Digit|Numpad)([1-9])$/.exec(c);
      if (dm) this.slotRequest = +dm[1] - 1;
      if (c === 'KeyQ') this.slotCycle = 1;
      if (c === 'KeyF' || c === 'KeyE') this.altPressed = true;
      if (c === 'Tab') e.preventDefault();
    };
    const ku = (e) => { this.keys.delete(e.code); };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', () => { this.keys.clear(); this.useHeld = false; });

    /* --- мышь ---
       Основной режим — pointer lock. Но он может быть недоступен
       (встроенный webview, политика браузера, повторный запрос сразу после
       Esc). Поэтому есть полноценный запасной режим: зажал кнопку — крутишь
       камеру, короткий клик без движения — действие предметом. */
    this._drag = null;
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.touchMode) return;
      e.preventDefault();
      if (this.locked) {
        if (e.button === 0 || e.button === 2) { this.useHeld = true; this.usePressed = true; }
        return;
      }
      this._drag = { moved: 0, t: performance.now(), btn: e.button };
      this.requestLock();
    });
    const up = (e) => {
      if (this._drag && !this.locked) {
        const dt = performance.now() - this._drag.t;
        if (this._drag.moved < 9 && dt < 450) this.usePressed = true;   // это был клик
      }
      this._drag = null;
      this.useHeld = false;
    };
    window.addEventListener('mouseup', up);
    window.addEventListener('blur', up);
    // контекстное меню браузера в игре не нужно нигде: ПКМ — это действие
    window.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || this.touchMode) return;
      const mx = e.movementX || 0, my = e.movementY || 0;
      if (this.locked) {
        this.lookX += mx * 0.0022 * this.sensitivity;
        this.lookY += my * 0.0022 * this.sensitivity * (this.invertY ? -1 : 1);
      } else if (this._drag) {
        this._drag.moved += Math.abs(mx) + Math.abs(my);
        this.lookX += mx * 0.0030 * this.sensitivity;
        this.lookY += my * 0.0030 * this.sensitivity * (this.invertY ? -1 : 1);
        if (this._drag.moved > 9) this.useHeld = false;
      }
    });
    // колесо работает и при экранных контролах — мышь остаётся полноценной
    window.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      this.slotCycle = e.deltaY > 0 ? 1 : -1;
    }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) this.lockFails = 0;
      if (this.onPointerLockChange) this.onPointerLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; this.lockFails++; });
  }

  requestLock() {
    if (this.touchMode || this.locked) return;
    if (this.lockFails >= 3) return;          // браузер не даёт — играем перетаскиванием
    if (!this.canvas.requestPointerLock) { this.lockFails = 99; return; }
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.lockFails++; });
    } catch (e) { this.lockFails++; }
  }
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) {
      this.keys.clear();
      this.useHeld = false; this.jumpHeld = false; this.padJump = false;
      this.moveX = 0; this.moveZ = 0;
      this.stickX = 0; this.stickZ = 0; this.stickSprint = false;
      this.lookX = 0; this.lookY = 0;
      this.exitLock();
    }
  }

  /**
   * Вызывается раз в кадр до логики.
   * Клавиатура и экранный стик работают одновременно: пока нажаты клавиши,
   * приоритет у них, иначе движение берётся со стика. Поэтому клавиши
   * остаются опцией и на площадках, где обязательна игра одной мышью.
   */
  poll() {
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }
    if (!x && !z) { x = this.stickX; z = this.stickZ; }
    this.moveX = x; this.moveZ = z;
    this.jumpHeld = this.padJump || this.keys.has('Space');
    this.sprint = this.stickSprint ||
      this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  /** Сбрасывает «нажатия одного кадра». */
  endFrame() {
    this.jumpPressed = false;
    this.usePressed = false;
    this.altPressed = false;
    this.slotRequest = -1;
    this.padSlot = -1;
    this.slotCycle = 0;
    this.pausePressed = false;
    this.lookX = 0; this.lookY = 0;
  }
}
