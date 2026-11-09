/**
 * Экранное управление — один слой для пальца и для мыши.
 *
 * Всё построено на pointer-событиях, поэтому мышь, палец и стилус проходят
 * через один и тот же код. Отсюда два режима:
 *
 *  touch — левая половина экрана: плавающий джойстик (база появляется под
 *          пальцем), правая: обзор перетаскиванием, двойное касание — прыжок.
 *  mouse — джойстик стоит на месте в углу и таскается курсором, обзор —
 *          перетаскиванием левой кнопкой, зажатая правая ведёт вперёд,
 *          короткий клик — действие предметом. Клавиатура при этом
 *          продолжает работать, но она не нужна: игра полностью проходится
 *          одной мышью (требование YouTube Playables).
 *
 * Контролы пишут в отдельные поля InputManager (stickX/stickZ/padJump/padSlot),
 * чтобы не спорить с клавиатурой: клавиши имеют приоритет, экранный стик
 * подхватывает управление, когда клавиши отпущены.
 */
import { t } from '../core/I18n.js';

export class MobileControls {
  constructor(input, root) {
    this.input = input;
    this.root = root;
    this.zone = root.querySelector('#stick-zone');
    this.base = root.querySelector('#stick-base');
    this.knob = root.querySelector('#stick-knob');
    this.active = false;
    this.mouseMode = false;

    this.stickId = null;
    this.lookId = null;
    this.stickOrigin = { x: 0, y: 0 };
    this.lastLook = { x: 0, y: 0 };
    this.lookVel = { x: 0, y: 0 };
    this.maxR = 60;
    this.doubleTapT = 0;
    this.haptics = true;
    this.autoRun = false;
    this._click = null;

    this.onSlot = null;
    this.onJump = null;

    this._bind();
  }

  /** @param {'touch'|'mouse'} mode */
  enable(mode = 'touch') {
    this.active = true;
    this.mouseMode = mode === 'mouse';
    this.input.touchMode = true;          // InputManager не берёт мышь на себя
    document.body.classList.add('touch');
    document.body.classList.toggle('mouse-ui', this.mouseMode);
    this._resize();
    if (this.mouseMode) {
      // курсор один, поэтому джойстик стоит на месте и всегда виден
      this.base.classList.add('on');
      this.knob.style.transform = '';
      this.zone.dataset.hint = t('ctrl.move');
    }
  }
  disable() {
    this.active = false;
    this.mouseMode = false;
    this.input.touchMode = false;
    document.body.classList.remove('touch', 'mouse-ui');
    this._releaseStick();
  }

  /** Короткая вибрация — тактильный отклик. Выключается в настройках. */
  buzz(ms) {
    if (!this.haptics || this.mouseMode) return;
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { } }
  }

  _resize() {
    if (this.mouseMode) {
      const r = this.base.getBoundingClientRect();
      this.maxR = Math.max(30, r.width * 0.5);
      return;
    }
    // радиус джойстика от размера экрана, но в разумных пределах
    this.maxR = Math.round(Math.min(86, Math.max(48, Math.min(window.innerWidth, window.innerHeight) * 0.13)));
  }

  /** Центр неподвижной базы — начало отсчёта для мыши. */
  _baseCenter() {
    const r = this.base.getBoundingClientRect();
    return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 };
  }

  _releaseStick() {
    this.stickId = null;
    this.knob.style.transform = '';
    if (!this.mouseMode) this.base.classList.remove('on');
    this.input.stickX = 0; this.input.stickZ = 0; this.input.stickSprint = false;
  }

  _isUI(x, y) {
    const el = document.elementFromPoint(x, y);
    return !!(el && el.closest(
      '.tbtn, .stick-zone, .hud-row, .hotbar, .slot, button, .panel, .screen.modal.active'));
  }

  _bind() {
    window.addEventListener('resize', () => this._resize());

    /* ---------- джойстик ---------- */
    this.zone.addEventListener('pointerdown', (e) => {
      if (!this.active || !this.input.enabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      if (this.stickId !== null) return;
      this._resize();
      this.stickId = e.pointerId;
      if (this.mouseMode) {
        const c = this._baseCenter();
        this.stickOrigin.x = c.x; this.stickOrigin.y = c.y;
      } else {
        // база появляется прямо под пальцем — не надо целиться в круг
        this.stickOrigin.x = e.clientX; this.stickOrigin.y = e.clientY;
        this.base.style.left = (e.clientX - this.maxR) + 'px';
        this.base.style.bottom = (window.innerHeight - e.clientY - this.maxR) + 'px';
        this.base.style.width = this.base.style.height = (this.maxR * 2) + 'px';
        this.base.classList.add('on');
        this.knob.style.transform = '';
      }
      try { this.zone.setPointerCapture(e.pointerId); } catch (err) { }
      this._stickTo(e.clientX, e.clientY);
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      if (e.pointerId === this.stickId) {
        this._stickTo(e.clientX, e.clientY);
      } else if (e.pointerId === this.lookId) {
        const dx = e.clientX - this.lastLook.x;
        const dy = e.clientY - this.lastLook.y;
        this.lastLook.x = e.clientX; this.lastLook.y = e.clientY;
        // накапливаем скорость и раздаём её сглаженно в poll()
        this.lookVel.x += dx;
        this.lookVel.y += dy;
        if (this._click) this._click.moved += Math.abs(dx) + Math.abs(dy);
      }
    });

    const endHandler = (e) => {
      if (e.pointerId === this.stickId) this._releaseStick();
      if (e.pointerId === this.lookId) {
        this.lookId = null;
        // короткий клик мышью по миру — действие предметом
        if (this._click && this._click.moved < 9 &&
          performance.now() - this._click.t < 450) this.input.usePressed = true;
        this._click = null;
      }
      if (e.pointerType === 'mouse' && e.button === 2) this.autoRun = false;
    };
    window.addEventListener('pointerup', endHandler);
    window.addEventListener('pointercancel', endHandler);
    window.addEventListener('blur', () => {
      this.autoRun = false;
      this._releaseStick();
      this.lookId = null; this._click = null;
    });

    /* ---------- зона обзора: весь экран, кроме элементов интерфейса ---------- */
    window.addEventListener('pointerdown', (e) => {
      if (!this.active || !this.input.enabled) return;
      if (e.pointerId === this.stickId) return;
      if (this._isUI(e.clientX, e.clientY)) return;

      if (e.pointerType === 'mouse') {
        // правая кнопка — «идти вперёд», левая — обзор и клик действием
        if (e.button === 2) { this.autoRun = true; e.preventDefault(); return; }
        if (e.button !== 0) return;
        this._click = { moved: 0, t: performance.now() };
      }
      if (this.lookId !== null) return;
      this.lookId = e.pointerId;
      this.lastLook.x = e.clientX; this.lastLook.y = e.clientY;
      if (e.pointerType !== 'mouse') {
        // двойное касание — прыжок
        const now = performance.now();
        if (now - this.doubleTapT < 280) {
          this.input.jumpPressed = true;
          this.buzz(8);
        }
        this.doubleTapT = now;
      }
    });

    /* ---------- кнопки ---------- */
    const bind = (sel, down, up) => {
      const el = this.root.querySelector(sel);
      if (!el) return;
      const press = (e) => {
        if (!this.input.enabled) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        el.classList.add('down');
        try { el.setPointerCapture(e.pointerId); } catch (err) { }
        down();
      };
      const release = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        el.classList.remove('down');
        if (up) up();
      };
      el.addEventListener('pointerdown', press);
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('pointerleave', release);
    };
    bind('[data-touch=jump]',
      () => { this.input.jumpPressed = true; this.input.padJump = true; this.buzz(8); },
      () => { this.input.padJump = false; });
    bind('[data-touch=use]',
      () => { this.input.usePressed = true; this.input.useHeld = true; this.buzz(14); },
      () => { this.input.useHeld = false; });
    bind('[data-touch=slot0]', () => { this.input.padSlot = 0; this.buzz(6); });
    bind('[data-touch=slot1]', () => { this.input.padSlot = 1; this.buzz(6); });
  }

  /** Пересчитывает положение ручки и вектор движения. */
  _stickTo(px, py) {
    let dx = px - this.stickOrigin.x;
    let dy = py - this.stickOrigin.y;
    const l = Math.hypot(dx, dy);
    const m = this.maxR;
    if (l > m) {
      const k = m / l;
      if (!this.mouseMode) {
        // палец увели дальше края — база «едет» следом, стик не залипает
        this.stickOrigin.x += dx * (1 - k);
        this.stickOrigin.y += dy * (1 - k);
        this.base.style.left = (this.stickOrigin.x - m) + 'px';
        this.base.style.bottom = (window.innerHeight - this.stickOrigin.y - m) + 'px';
      }
      dx *= k; dy *= k;
    }
    this.knob.style.transform = `translate(${dx}px,${dy}px)`;
    const nx = dx / m, ny = dy / m;
    const dead = this.mouseMode ? 0.10 : 0.14;
    const mag = Math.hypot(nx, ny);
    if (mag < dead) { this.input.stickX = 0; this.input.stickZ = 0; }
    else {
      // мягкая кривая: близко к центру идём медленно и точно
      const norm = Math.min(1, (mag - dead) / (1 - dead));
      const k = (norm * norm * 0.35 + norm * 0.65) / mag;
      this.input.stickX = nx * k;
      this.input.stickZ = ny * k;
    }
    this.input.stickSprint = mag > 0.9;
  }

  /** Вызывается раз в кадр: сглаженно отдаёт накопленный поворот камеры. */
  poll(dt) {
    if (!this.active) return;
    // зажатая правая кнопка ведёт вперёд, если стик не тронут
    if (this.autoRun && this.stickId === null) {
      this.input.stickX = 0; this.input.stickZ = -1;
      this._wasAutoRun = true;
    } else if (this._wasAutoRun) {
      this._wasAutoRun = false;
      if (this.stickId === null) { this.input.stickX = 0; this.input.stickZ = 0; }
    }
    const k = Math.min(1, dt * (this.mouseMode ? 40 : 26));  // сглаживание дрожи
    const dx = this.lookVel.x * k;
    const dy = this.lookVel.y * k;
    this.lookVel.x -= dx; this.lookVel.y -= dy;
    if (Math.abs(this.lookVel.x) < 0.01) this.lookVel.x = 0;
    if (Math.abs(this.lookVel.y) < 0.01) this.lookVel.y = 0;
    // чувствительность привязана к размеру экрана, чтобы на планшете
    // и на телефоне поворот на тот же жест был одинаковым
    const s = (this.mouseMode ? 5.2 : 3.2) / Math.max(360, window.innerWidth);
    this.input.lookX += dx * s * this.input.sensitivity;
    this.input.lookY += dy * s * this.input.sensitivity * (this.input.invertY ? -1 : 1);
  }

  setActiveSlot(i) {
    const b0 = this.root.querySelector('[data-touch=slot0]');
    const b1 = this.root.querySelector('[data-touch=slot1]');
    if (b0) b0.classList.toggle('active', i === 0);
    if (b1) b1.classList.toggle('active', i === 1);
  }

  /** Иконка кнопки заряда — показывает выбранный тип. */
  setChargeIcon(url) {
    const b = this.root.querySelector('[data-touch=slot0] span');
    if (!b || !url) return;
    b.className = 'slot-img';
    b.style.backgroundImage = url;
    b.style.width = '1.6em'; b.style.height = '1.6em';
  }
}

/**
 * Сенсорный режим включаем не только по строке браузера: гибридные
 * устройства и планшеты часто врут. Дополнительно ловим первое касание.
 */
export function isTouchDevice() {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const hasTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const ua = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|Opera Mini|Windows Phone/i.test(navigator.userAgent);
  return hasTouch && (ua || coarse);
}
