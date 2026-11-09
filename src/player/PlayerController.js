/**
 * Игрок от первого лица.
 * Коллизия — AABB против воксельной сетки по осям, с автошагом на блок.
 * Отдельно живёт «ощущение камеры»: покачивание при ходьбе, приседание при
 * приземлении, тряска и толчок от взрыва, короткий рывок FOV.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';

const P = CONFIG.player;
const EPS = 1e-3;

export class PlayerController {
  constructor(camera, world, input) {
    this.camera = camera;
    this.world = world;
    this.input = input;

    this.pos = new THREE.Vector3(0, 10, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.landDip = 0;
    this.landVel = 0;
    this.stepDist = 0;

    this.shake = 0;
    this.shakeSeed = Math.random() * 100;
    this.kick = new THREE.Vector3();
    this.fovPunch = 0;
    this.fovBase = P.fov;
    this.shakeScale = 1;

    this.spawn = new THREE.Vector3(0, 10, 0);
    // множители от улучшений в мастерской
    this.speedMul = 1;
    this.jumpMul = 1;
    this.pushScale = 1;
    this.enabled = true;
    this.onStep = null;
    this.onLand = null;
    this.onRespawn = null;

    this._tmp = new THREE.Vector3();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  setSpawn(x, y, z, yaw = 0) {
    this.spawn.set(x, y, z);
    this.pos.copy(this.spawn);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.shake = 0; this.kick.set(0, 0, 0); this.fovPunch = 0;
    this.landDip = 0;
  }

  respawn() {
    this.pos.copy(this.spawn);
    this.vel.set(0, 0, 0);
    this.landDip = 0;
    if (this.onRespawn) this.onRespawn();
  }

  addImpulse(dir, force) {
    this.vel.addScaledVector(dir, force * this.pushScale);
    this.onGround = false;
  }

  addShake(v) { this.shake = Math.min(2.6, this.shake + v * this.shakeScale); }
  addKick(dir, f) { this.kick.addScaledVector(dir, -f * this.shakeScale); }
  addFovPunch(v) { this.fovPunch = Math.min(16, this.fovPunch + v); }

  /* ------------------------------------------------------------- */
  update(dt) {
    const inp = this.input;
    if (this.enabled) {
      this.yaw -= inp.lookX;
      this.pitch -= inp.lookY;
      const lim = Math.PI / 2 - 0.03;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    }

    // --- желаемое направление ---
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    let wishX = 0, wishZ = 0;
    if (this.enabled) {
      // вперёд = (-sin yaw, -cos yaw), вправо = (cos yaw, -sin yaw); moveZ<0 — вперёд
      const mx = inp.moveX, mz = inp.moveZ;
      wishX = mx * cos + mz * sin;
      wishZ = -mx * sin + mz * cos;
    }
    const wishLen = Math.hypot(wishX, wishZ);
    const target = (inp.sprint ? P.sprint : P.speed) * this.speedMul * Math.min(1, wishLen);

    const accel = this.onGround ? P.accel : P.airAccel;
    if (wishLen > 1e-3) {
      const nx = wishX / wishLen, nz = wishZ / wishLen;
      const curr = this.vel.x * nx + this.vel.z * nz;
      const add = Math.min(target - curr, accel * dt);
      if (add > 0) { this.vel.x += nx * add; this.vel.z += nz * add; }
    }
    if (this.onGround) {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp > 0) {
        const drop = Math.max(sp * P.friction * dt, wishLen < 0.02 ? sp * 0.55 : 0);
        const k = Math.max(0, sp - drop) / sp;
        this.vel.x *= k; this.vel.z *= k;
      }
    }

    // --- прыжок ---
    this.coyote -= dt;
    this.jumpBuffer -= dt;
    if (this.enabled && inp.jumpPressed) this.jumpBuffer = 0.16;
    if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
      this.vel.y = P.jump * this.jumpMul;
      this.onGround = false;
      this.coyote = 0; this.jumpBuffer = 0;
    }

    this.vel.y += CONFIG.gravity * dt;
    if (this.vel.y < -58) this.vel.y = -58;

    const wasGround = this.onGround;
    this.moveAndCollide(dt);

    if (!wasGround && this.onGround) {
      const v = Math.abs(this.landVel);
      if (v > 3.2) {
        this.landDip = Math.min(0.42, v * 0.026);
        if (this.onLand) this.onLand(v);
      }
    }
    if (this.onGround) this.coyote = 0.12;

    // --- падение за карту ---
    if (this.pos.y < CONFIG.killY) this.respawn();

    // --- покачивание ---
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 0.6) {
      this.bobPhase += dt * hs * 1.55;
      this.bobAmount += (Math.min(1, hs / P.speed) - this.bobAmount) * Math.min(1, dt * 8);
      this.stepDist += hs * dt;
      if (this.stepDist > 2.1) { this.stepDist = 0; if (this.onStep) this.onStep(); }
    } else {
      this.bobAmount += (0 - this.bobAmount) * Math.min(1, dt * 6);
    }
    this.landDip *= Math.max(0, 1 - dt * 7);

    // --- затухание тряски ---
    this.shake *= Math.max(0, 1 - dt * 3.4);
    if (this.shake < 0.001) this.shake = 0;
    this.kick.multiplyScalar(Math.max(0, 1 - dt * 9));
    this.fovPunch *= Math.max(0, 1 - dt * 7.5);

    this.applyCamera(dt);
  }

  applyCamera(dt) {
    const cam = this.camera;
    const bobY = Math.sin(this.bobPhase * 2) * 0.045 * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * 0.035 * this.bobAmount;
    const roll = Math.cos(this.bobPhase) * 0.012 * this.bobAmount;

    const t = performance.now() * 0.001;
    let sx = 0, sy = 0, sz = 0, sr = 0;
    if (this.shake > 0.0005) {
      const s = this.shake;
      const f = 34;
      sx = (noise1(t * f + this.shakeSeed) - 0.5) * s * 0.34;
      sy = (noise1(t * f * 1.17 + 31 + this.shakeSeed) - 0.5) * s * 0.34;
      sz = (noise1(t * f * 0.87 + 61 + this.shakeSeed) - 0.5) * s * 0.2;
      sr = (noise1(t * f * 0.61 + 91 + this.shakeSeed) - 0.5) * s * 0.06;
    }

    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    const eye = P.eye - this.landDip;
    cam.position.set(
      this.pos.x + bobX * cos + sx + this.kick.x,
      this.pos.y + eye + bobY + sy + this.kick.y,
      this.pos.z - bobX * sin + sz + this.kick.z);

    this._euler.set(this.pitch + sy * 0.35, this.yaw + sx * 0.35, roll + sr);
    cam.quaternion.setFromEuler(this._euler);

    const wantFov = this.fovBase + this.fovPunch +
      Math.min(6, Math.max(0, Math.hypot(this.vel.x, this.vel.z) - P.speed) * 1.4);
    if (Math.abs(cam.fov - wantFov) > 0.01) {
      cam.fov += (wantFov - cam.fov) * Math.min(1, dt * 12);
      cam.updateProjectionMatrix();
    }
  }

  /* ------------------------------------------------------------- */
  moveAndCollide(dt) {
    const W = this.world;
    const r = P.radius, h = P.height;
    const dx = this.vel.x * dt, dy = this.vel.y * dt, dz = this.vel.z * dt;

    const hits = (px, py, pz) => W.boxHitsSolid(px - r, py + EPS, pz - r, px + r, py + h - EPS, pz + r);

    // --- Y ---
    this.pos.y += dy;
    if (hits(this.pos.x, this.pos.y, this.pos.z)) {
      if (dy <= 0) {
        // ноги вошли в блок — поднимаем на верхнюю грань ближайшего свободного места
        let fy = Math.floor(this.pos.y);
        for (let k = 0; k < 8; k++) {
          if (!hits(this.pos.x, fy + 1, this.pos.z)) { this.pos.y = fy + 1; break; }
          fy++;
        }
        this.landVel = this.vel.y;
        this.vel.y = 0;
        this.onGround = true;
      } else {
        // ударились головой
        let ny = Math.floor(this.pos.y + h) - h - EPS;
        for (let k = 0; k < 4 && hits(this.pos.x, ny, this.pos.z); k++) ny -= 1;
        this.pos.y = ny;
        this.vel.y = -0.2;
      }
    } else {
      this.onGround = false;
    }

    // проверка «стою на земле» (для случая без движения по Y)
    if (!this.onGround && this.vel.y <= 0.001) {
      if (hits(this.pos.x, this.pos.y - 0.06, this.pos.z)) {
        this.onGround = true;
        this.landVel = this.vel.y;
        this.vel.y = 0;
      }
    }

    // --- X ---
    const oldX = this.pos.x;
    this.pos.x += dx;
    if (hits(this.pos.x, this.pos.y, this.pos.z)) {
      if (!this._tryStep(oldX, this.pos.z, this.pos.x, this.pos.z, hits)) {
        this.pos.x = oldX;
        this.vel.x = 0;
      }
    }
    // --- Z ---
    const oldZ = this.pos.z;
    this.pos.z += dz;
    if (hits(this.pos.x, this.pos.y, this.pos.z)) {
      if (!this._tryStep(this.pos.x, oldZ, this.pos.x, this.pos.z, hits)) {
        this.pos.z = oldZ;
        this.vel.z = 0;
      }
    }
  }

  /** Автоматический шаг на блок высотой до stepHeight. */
  _tryStep(fromX, fromZ, toX, toZ, hits) {
    if (!this.onGround && this.vel.y > 0.5) return false;
    const up = P.stepHeight;
    const y = this.pos.y;
    if (hits(toX, y + up, toZ)) return false;
    // ищем минимальную высоту, на которой свободно
    for (let s = 0.12; s <= up + 0.001; s += 0.12) {
      if (!hits(toX, y + s, toZ)) {
        this.pos.y = y + s;
        this.pos.x = toX; this.pos.z = toZ;
        this.onGround = true;
        return true;
      }
    }
    return false;
  }

  /** Направление взгляда. */
  getDirection(out) {
    out = out || new THREE.Vector3();
    const cp = Math.cos(this.pitch);
    out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    return out;
  }

  get eyePosition() {
    return this._tmp.set(this.pos.x, this.pos.y + P.eye, this.pos.z);
  }
}

/* быстрый псевдошум для тряски */
function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const a = hash1(i), b = hash1(i + 1);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}
function hash1(n) {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
