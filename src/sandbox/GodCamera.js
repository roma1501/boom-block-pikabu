/**
 * Камера «взгляд бога».
 *
 * Сама медленно облетает постройку, как в главном меню, но игрок в любой
 * момент может взять её в руки: тянуть — повернуть, колесо или щипок —
 * приблизить. После того как игрок отпустил, облёт возвращается плавно,
 * с той точки, где его оставили, — камера никогда не «прыгает».
 *
 * Тряска и толчок от взрыва живут здесь же: в песочнице нет игрока,
 * а ощущение удара нужно.
 */
import * as THREE from 'three';

const _off = new THREE.Vector3();

export class GodCamera {
  constructor(camera) {
    this.cam = camera;
    this.target = new THREE.Vector3();
    this.lookHeight = 3.5;

    this.yaw = 0;
    this.pitch = 0.42;
    this.dist = 40;

    this.minDist = 16;
    this.maxDist = 90;
    this.minPitch = 0.10;
    this.maxPitch = 1.24;

    this.autoSpeed = 0.085;      // рад/с — облёт
    this.idleT = 0;              // сколько игрок не трогал камеру
    this.dragging = false;

    this.fovBase = 55;
    this.fov = 55;
    this.fovPunch = 0;
    // На вертикальном экране постройка «уезжает» вдаль: по горизонтали
    // видно меньше, поэтому подводим камеру ближе.
    this.aspectMul = 1;

    this.shake = 0;
    this.shakeScale = 1;
    this.kick = new THREE.Vector3();
    this.smoothPos = new THREE.Vector3();
    this._init = false;
    this._t = 0;
  }

  /** Наводится на постройку: расстояние и высота — от её размера. */
  setTarget(center, radius, keepAngles = false) {
    this.target.copy(center);
    const r = Math.max(10, radius);
    this.minDist = r * 0.55;
    this.maxDist = r * 2.6;
    this.dist = r * 1.5;
    this.lookHeight = Math.max(2, r * 0.14);
    if (!keepAngles) {
      this.yaw = Math.random() * Math.PI * 2;
      this.pitch = 0.44;
    }
    this._init = false;
  }

  /* ------------------------------------------------------------ */
  setAspect(a) {
    // По горизонтали на вертикальном экране видно заметно меньше,
    // поэтому камера чуть отходит — иначе постройка не влезает в кадр.
    this.aspectMul = a >= 0.95 ? 1 : Math.min(1.22, 1 + (0.95 - a) * 0.45);
  }

  orbit(dx, dy) {
    this.yaw -= dx;
    this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch + dy));
    this.idleT = 0;
  }

  zoom(k) {
    this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist * k));
    this.idleT = 0;
  }

  addShake(v) { this.shake = Math.min(1.6, this.shake + v * this.shakeScale); }
  addFovPunch(v) { this.fovPunch = Math.min(12, this.fovPunch + v); }
  addKick(dir, v) {
    this.kick.addScaledVector(dir, Math.min(1.4, v));
  }

  /* ------------------------------------------------------------ */
  update(dt) {
    this._t += dt;
    this.idleT += dt;

    // облёт возвращается не сразу и не рывком
    if (!this.dragging && this.idleT > 2.2) {
      const k = Math.min(1, (this.idleT - 2.2) / 1.6);
      this.yaw += this.autoSpeed * k * dt;
      // и постепенно возвращает удобный наклон
      this.pitch += (0.44 - this.pitch) * Math.min(1, dt * 0.35) * k;
    }

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const d = this.dist * this.aspectMul;
    _off.set(
      Math.cos(this.yaw) * cp * d,
      sp * d,
      Math.sin(this.yaw) * cp * d);

    const px = this.target.x + _off.x;
    const py = this.target.y + this.lookHeight + _off.y;
    const pz = this.target.z + _off.z;

    if (!this._init) {
      this.smoothPos.set(px, py, pz);
      this._init = true;
    } else {
      // лёгкое сглаживание: зум и поворот не дёргают картинку
      const s = Math.min(1, dt * 14);
      this.smoothPos.x += (px - this.smoothPos.x) * s;
      this.smoothPos.y += (py - this.smoothPos.y) * s;
      this.smoothPos.z += (pz - this.smoothPos.z) * s;
    }

    // затухание толчка и тряски
    this.kick.multiplyScalar(Math.max(0, 1 - dt * 4.5));
    this.shake *= Math.max(0, 1 - dt * 3.2);
    if (this.shake < 0.001) this.shake = 0;

    const t = this._t;
    const s = this.shake * 0.55;
    const sx = s * Math.sin(t * 47.3) * 0.7;
    const sy = s * Math.sin(t * 39.1 + 1.7) * 0.7;
    const sz = s * Math.sin(t * 53.7 + 3.1) * 0.5;

    this.cam.position.set(
      this.smoothPos.x + this.kick.x + sx,
      this.smoothPos.y + this.kick.y + sy,
      this.smoothPos.z + this.kick.z + sz);
    this.cam.lookAt(
      this.target.x + sx * 0.35,
      this.target.y + this.lookHeight + sy * 0.35,
      this.target.z + sz * 0.35);
    // небольшой крен от тряски — кадр «дышит» вместе со взрывом
    this.cam.rotateZ(this.shake * 0.035 * Math.sin(t * 31.4));

    this.fovPunch *= Math.max(0, 1 - dt * 3.4);
    const fov = this.fovBase + this.fovPunch;
    if (Math.abs(this.cam.fov - fov) > 0.02) {
      this.cam.fov += (fov - this.cam.fov) * Math.min(1, dt * 9);
      this.cam.updateProjectionMatrix();
    }
  }
}
