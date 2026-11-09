/**
 * Ввод песочницы: один слой для мыши и пальца.
 *
 * Короткое нажатие без протяжки — удар по точке. Протянул — облёт камеры.
 * Колесо или щипок двумя пальцами — приближение. Пока палец лежит на экране
 * и ещё не поехал, показывается прицел: игрок видит, куда прилетит, до того
 * как отпустит.
 */
const DRAG_PX = 9;          // после этого сдвига нажатие считается протяжкой
const TAP_MS = 700;         // и дольше этого — тоже не удар

export class StrikeInput {
  constructor(el) {
    this.el = el;
    this.enabled = true;
    this.onStrike = null;    // (ndcX, ndcY)
    this.onAim = null;       // (ndcX, ndcY) | (null) — прицел убрать
    this.onOrbit = null;     // (dxRad, dyRad)
    this.onZoom = null;      // (multiplier)
    this.onDragState = null; // (bool)

    this.points = new Map();
    this.dragged = false;
    this.downT = 0;
    this.startX = 0; this.startY = 0;
    this.lastX = 0; this.lastY = 0;
    this.pinchDist = 0;
    this.touch = false;

    el.addEventListener('pointerdown', (e) => this._down(e));
    el.addEventListener('pointermove', (e) => this._move(e));
    el.addEventListener('pointerup', (e) => this._up(e));
    el.addEventListener('pointercancel', (e) => this._cancel(e));
    el.addEventListener('pointerleave', (e) => this._leave(e));
    el.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _ndc(e) {
    const r = this.el.getBoundingClientRect();
    return [
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    ];
  }

  _down(e) {
    if (!this.enabled) return;
    if (e.pointerType === 'touch') this.touch = true;
    this.el.setPointerCapture?.(e.pointerId);
    this.points.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.points.size === 2) {
      // начался щипок — прицел убираем, удара не будет
      const [a, b] = [...this.points.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.dragged = true;
      if (this.onAim) this.onAim(null);
      return;
    }
    if (this.points.size > 2) return;

    this.dragged = false;
    this.downT = performance.now();
    this.startX = this.lastX = e.clientX;
    this.startY = this.lastY = e.clientY;
    // правая кнопка — только облёт
    if (e.button === 2) this.dragged = true;
    else if (this.onAim) this.onAim(...this._ndc(e));
  }

  _move(e) {
    if (!this.enabled) return;
    const p = this.points.get(e.pointerId);

    // щипок
    if (this.points.size === 2 && p) {
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...this.points.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDist > 4 && d > 4 && this.onZoom) this.onZoom(this.pinchDist / d);
      this.pinchDist = d;
      return;
    }

    if (!p) {
      // мышь без нажатия — просто наводим прицел
      if (!this.touch && this.onAim && this.points.size === 0) this.onAim(...this._ndc(e));
      return;
    }

    p.x = e.clientX; p.y = e.clientY;
    const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
    this.lastX = e.clientX; this.lastY = e.clientY;

    if (!this.dragged) {
      const moved = Math.hypot(e.clientX - this.startX, e.clientY - this.startY);
      if (moved < DRAG_PX) {
        if (this.onAim) this.onAim(...this._ndc(e));
        return;
      }
      this.dragged = true;
      if (this.onAim) this.onAim(null);
      if (this.onDragState) this.onDragState(true);
    }

    const h = this.el.clientHeight || 720;
    if (this.onOrbit) this.onOrbit((dx / h) * 2.6, (dy / h) * 2.2);
  }

  _up(e) {
    if (!this.enabled) { this.points.delete(e.pointerId); return; }
    const had = this.points.delete(e.pointerId);
    this.el.releasePointerCapture?.(e.pointerId);
    if (this.points.size === 1) {
      // из щипка вышли — второй палец продолжает вести камеру
      const p = [...this.points.values()][0];
      this.lastX = p.x; this.lastY = p.y;
      return;
    }
    if (!had) return;
    if (this.onDragState) this.onDragState(false);

    const quick = performance.now() - this.downT < TAP_MS;
    if (!this.dragged && quick && e.button !== 2) {
      if (this.onStrike) this.onStrike(...this._ndc(e));
    }
    if (this.touch && this.onAim) this.onAim(null);
    this.dragged = false;
  }

  _cancel(e) {
    this.points.delete(e.pointerId);
    this.dragged = false;
    if (this.onAim) this.onAim(null);
    if (this.onDragState) this.onDragState(false);
  }

  _leave(e) {
    if (this.points.size === 0 && this.onAim) this.onAim(null);
  }

  _wheel(e) {
    if (!this.enabled) return;
    e.preventDefault();
    if (this.onZoom) this.onZoom(e.deltaY > 0 ? 1.12 : 0.89);
  }

  reset() {
    this.points.clear();
    this.dragged = false;
    if (this.onAim) this.onAim(null);
  }
}
