/**
 * Лёгкий движок твёрдых тел, специализированный под воксельный мир.
 *
 * Почему не Rapier/Ammo: статическая геометрия здесь — это сетка, поэтому
 * проверка столкновения с миром стоит O(1) на точку контакта (просто чтение
 * массива). Это на порядок дешевле, чем broad-phase по тысячам статических
 * коллайдеров, и позволяет держать 400 обломков на телефоне.
 *
 * Тела — коробки или составные тела (несколько коробок = кусок стены).
 * Контакты ищутся по угловым точкам, что даёт корректное вращение при ударе.
 */
import * as THREE from 'three';
import { MATERIALS } from '../world/Materials.js';

const FIXED = 1 / 60;
const MAX_STEPS = 3;
const SLEEP_LIN = 0.19;
const SLEEP_ANG = 0.42;
const SLEEP_TIME = 0.55;

let _bodyId = 1;

export class Body {
  constructor() {
    this.id = _bodyId++;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.angVel = new THREE.Vector3();
    this.parts = [];            // {ox,oy,oz,hx,hy,hz}
    this.points = [];           // локальные точки контакта (Float32 тройки)
    this.half = new THREE.Vector3(0.5, 0.5, 0.5);   // общий габарит
    this.radius = 0.87;
    this.mass = 1; this.invMass = 1;
    this.invI = new THREE.Vector3(6, 6, 6);
    this.restitution = 0.16;
    this.friction = 0.62;
    this.sleeping = false;
    this.sleepT = 0;
    this.alive = true;
    this.kind = 'debris';
    this.mat = 5;
    this.age = 0;
    this.ttl = 26;
    this.mesh = null;
    this.userData = null;
    this.noWorldDamage = false;
    this.lastImpact = 0;
    this.gravityScale = 1;
    this.canSleep = true;
  }

  setBox(hx, hy, hz, mass) {
    this.parts = [{ ox: 0, oy: 0, oz: 0, hx, hy, hz }];
    this.half.set(hx, hy, hz);
    this.mass = mass; this.invMass = mass > 0 ? 1 / mass : 0;
    const ix = mass * (hy * hy + hz * hz) / 3;
    const iy = mass * (hx * hx + hz * hz) / 3;
    const iz = mass * (hx * hx + hy * hy) / 3;
    this.invI.set(ix > 0 ? 1 / ix : 0, iy > 0 ? 1 / iy : 0, iz > 0 ? 1 / iz : 0);
    this.radius = Math.hypot(hx, hy, hz);
    this._buildPoints();
    return this;
  }

  /** Составное тело: массив коробок в локальных координатах (центр масс в нуле). */
  setCompound(parts, mass) {
    this.parts = parts;
    let mx = 0, my = 0, mz = 0;
    for (const p of parts) {
      mx = Math.max(mx, Math.abs(p.ox) + p.hx);
      my = Math.max(my, Math.abs(p.oy) + p.hy);
      mz = Math.max(mz, Math.abs(p.oz) + p.hz);
    }
    this.half.set(mx, my, mz);
    this.mass = mass; this.invMass = mass > 0 ? 1 / mass : 0;
    const ix = mass * (my * my + mz * mz) / 3.4;
    const iy = mass * (mx * mx + mz * mz) / 3.4;
    const iz = mass * (mx * mx + my * my) / 3.4;
    this.invI.set(1 / ix, 1 / iy, 1 / iz);
    this.radius = Math.hypot(mx, my, mz);
    this._buildPoints();
    return this;
  }

  _buildPoints() {
    const pts = [];
    const maxParts = Math.min(this.parts.length, 10);
    for (let i = 0; i < maxParts; i++) {
      const p = this.parts[i];
      for (let s = 0; s < 8; s++) {
        pts.push(
          p.ox + (s & 1 ? p.hx : -p.hx),
          p.oy + (s & 2 ? p.hy : -p.hy),
          p.oz + (s & 4 ? p.hz : -p.hz));
      }
    }
    // прореживание для больших составных тел
    let arr = pts;
    const maxPts = 48;
    if (pts.length / 3 > maxPts) {
      arr = [];
      const stride = Math.ceil((pts.length / 3) / maxPts);
      for (let i = 0; i < pts.length / 3; i += stride) arr.push(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]);
    }
    this.points = new Float32Array(arr);
  }

  wake() { this.sleeping = false; this.sleepT = 0; }
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();

export class PhysicsManager {
  constructor() {
    this.bodies = [];
    this.world = null;
    this.gravity = -26;
    this.accum = 0;
    this.timeScale = 1;
    this.onWorldImpact = null;    // (body, vx,vy,vz, speed, normal) => void
    this.onBodyImpact = null;     // (body, speed) => void
    this.hash = new Map();
    this.cell = 2.4;
    this.stats = { bodies: 0, awake: 0, contacts: 0 };
    this.pairChecks = 0;
  }

  setWorld(w) { this.world = w; }

  add(b) { this.bodies.push(b); return b; }

  remove(b) {
    b.alive = false;
  }

  clear() { this.bodies.length = 0; this.hash.clear(); }

  /* ---------------------------------------------------------- */
  step(dt) {
    dt = Math.min(dt, 0.1) * this.timeScale;
    this.accum += dt;
    let steps = 0;
    while (this.accum >= FIXED && steps < MAX_STEPS) {
      this.substep(FIXED);
      this.accum -= FIXED;
      steps++;
    }
    if (steps === MAX_STEPS) this.accum = 0;
    // компактизация списка
    let w = 0;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (b.alive) this.bodies[w++] = b;
    }
    this.bodies.length = w;
    this.stats.bodies = w;
  }

  substep(dt) {
    const bodies = this.bodies;
    let awake = 0;
    this.stats.contacts = 0;

    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (!b.alive) continue;
      b.age += dt;
      if (b.sleeping) continue;
      awake++;

      b.vel.y += this.gravity * b.gravityScale * dt;

      // затухание
      const damp = 1 - 0.06 * dt;
      b.vel.multiplyScalar(damp);
      b.angVel.multiplyScalar(1 - 0.5 * dt);

      const sp = b.vel.length();
      if (sp > 46) b.vel.multiplyScalar(46 / sp);
      const asp = b.angVel.length();
      if (asp > 22) b.angVel.multiplyScalar(22 / asp);

      // субшаги для быстрых тел, чтобы не проскакивать сквозь блоки
      const nsub = Math.min(4, Math.max(1, Math.ceil(sp * dt / 0.42)));
      const sdt = dt / nsub;
      for (let s = 0; s < nsub; s++) {
        b.pos.addScaledVector(b.vel, sdt);
        integrateRotation(b, sdt);
        this.resolveWorld(b, sdt);
      }

      // сон
      if (b.canSleep && b.vel.lengthSq() < SLEEP_LIN * SLEEP_LIN && b.angVel.lengthSq() < SLEEP_ANG * SLEEP_ANG) {
        b.sleepT += dt;
        if (b.sleepT > SLEEP_TIME) { b.sleeping = true; b.vel.set(0, 0, 0); b.angVel.set(0, 0, 0); }
      } else b.sleepT = 0;
    }

    this.resolvePairs(dt);
    this.stats.awake = awake;
  }

  /* ---------- столкновение с воксельным миром ---------- */
  resolveWorld(b, dt) {
    const W = this.world;
    if (!W) return;
    const pts = b.points;
    const np = pts.length / 3;
    let hits = 0;
    let deepest = 0;
    let impactSpeed = 0;
    let hitVX = 0, hitVY = 0, hitVZ = 0;
    let nSumX = 0, nSumY = 0, nSumZ = 0;

    for (let i = 0; i < np; i++) {
      _v1.set(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]).applyQuaternion(b.quat).add(b.pos);
      const vx = Math.floor(_v1.x), vy = Math.floor(_v1.y), vz = Math.floor(_v1.z);
      if (!W.get(vx, vy, vz)) continue;

      // выбираем свободную грань с минимальным проникновением
      const fx = _v1.x - vx, fy = _v1.y - vy, fz = _v1.z - vz;
      let bestD = Infinity, bnx = 0, bny = 0, bnz = 0;
      if (!W.get(vx - 1, vy, vz) && fx < bestD) { bestD = fx; bnx = -1; bny = 0; bnz = 0; }
      if (!W.get(vx + 1, vy, vz) && (1 - fx) < bestD) { bestD = 1 - fx; bnx = 1; bny = 0; bnz = 0; }
      if (!W.get(vx, vy - 1, vz) && fy < bestD) { bestD = fy; bnx = 0; bny = -1; bnz = 0; }
      if (!W.get(vx, vy + 1, vz) && (1 - fy) < bestD) { bestD = 1 - fy; bnx = 0; bny = 1; bnz = 0; }
      if (!W.get(vx, vy, vz - 1) && fz < bestD) { bestD = fz; bnx = 0; bny = 0; bnz = -1; }
      if (!W.get(vx, vy, vz + 1) && (1 - fz) < bestD) { bestD = 1 - fz; bnx = 0; bny = 0; bnz = 1; }
      if (bestD === Infinity) {
        // точка глубоко внутри массива блоков — выталкиваем вверх
        bestD = 1 - fy; bnx = 0; bny = 1; bnz = 0;
      }

      hits++;
      this.stats.contacts++;
      if (bestD > deepest) { deepest = bestD; }
      nSumX += bnx; nSumY += bny; nSumZ += bnz;

      // относительная скорость в точке
      _v2.copy(_v1).sub(b.pos);                       // r
      _v3.copy(b.angVel).cross(_v2).add(b.vel);       // vp
      const vn = _v3.x * bnx + _v3.y * bny + _v3.z * bnz;
      const approach = -vn;
      if (approach > impactSpeed) {
        impactSpeed = approach; hitVX = vx; hitVY = vy; hitVZ = vz;
      }
      if (vn < 0) {
        _v4.set(bnx, bny, bnz);
        const denom = effectiveMass(b, _v2, _v4);
        const e = approach > 2.2 ? b.restitution : 0;
        let j = -(1 + e) * vn / denom;
        j /= Math.max(1, hits * 0.55);
        applyImpulse(b, _v4.multiplyScalar(j), _v2);

        // трение
        _v3.copy(b.angVel).cross(_v2).add(b.vel);
        const vnn = _v3.x * bnx + _v3.y * bny + _v3.z * bnz;
        _v5.copy(_v3).addScaledVector(_v4.set(bnx, bny, bnz), -vnn);
        const tl = _v5.length();
        if (tl > 1e-4) {
          _v5.multiplyScalar(1 / tl);
          const dt2 = effectiveMass(b, _v2, _v5);
          let jt = -tl / dt2 / Math.max(1, hits * 0.55);
          const maxF = Math.abs(j) * b.friction;
          jt = Math.max(-maxF, Math.min(maxF, jt));
          applyImpulse(b, _v5.multiplyScalar(jt), _v2);
        }
      }
      // позиционная коррекция
      b.pos.x += bnx * bestD * 0.42 / Math.max(1, hits * 0.7);
      b.pos.y += bny * bestD * 0.42 / Math.max(1, hits * 0.7);
      b.pos.z += bnz * bestD * 0.42 / Math.max(1, hits * 0.7);
    }

    if (hits > 0) {
      if (impactSpeed > 2.4 && b.age - b.lastImpact > 0.06) {
        b.lastImpact = b.age;
        if (this.onWorldImpact && !b.noWorldDamage) {
          const nl = Math.hypot(nSumX, nSumY, nSumZ) || 1;
          this.onWorldImpact(b, hitVX, hitVY, hitVZ, impactSpeed,
            _v1.set(nSumX / nl, nSumY / nl, nSumZ / nl));
        }
      }
      b.sleepT = Math.max(0, b.sleepT);
    }
  }

  /* ---------- столкновения тел между собой ---------- */
  resolvePairs(dt) {
    const bodies = this.bodies;
    if (bodies.length < 2) return;
    this.hash.clear();
    const cs = this.cell;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (!b.alive) continue;
      const key = (Math.floor(b.pos.x / cs) * 73856093) ^ (Math.floor(b.pos.y / cs) * 19349663) ^ (Math.floor(b.pos.z / cs) * 83492791);
      let arr = this.hash.get(key);
      if (!arr) { arr = []; this.hash.set(key, arr); }
      arr.push(i);
    }
    let checks = 0;
    const limit = 2600;
    for (const arr of this.hash.values()) {
      const n = arr.length;
      if (n < 2) continue;
      for (let a = 0; a < n && checks < limit; a++) {
        for (let c = a + 1; c < n && checks < limit; c++) {
          checks++;
          const A = bodies[arr[a]], B = bodies[arr[c]];
          if (A.sleeping && B.sleeping) continue;
          if (A.invMass === 0 && B.invMass === 0) continue;
          _v1.copy(B.pos).sub(A.pos);
          const d = _v1.length();
          const rr = (A.radius + B.radius) * 0.72;
          if (d > rr || d < 1e-5) continue;
          _v1.multiplyScalar(1 / d);
          const pen = rr - d;
          _v2.copy(B.vel).sub(A.vel);
          const vn = _v2.dot(_v1);
          if (vn < 0) {
            const im = A.invMass + B.invMass;
            if (im <= 0) continue;
            const e = 0.14;
            const j = -(1 + e) * vn / im;
            A.vel.addScaledVector(_v1, -j * A.invMass);
            B.vel.addScaledVector(_v1, j * B.invMass);
            // немного вращения от касательного удара
            A.angVel.x += (Math.random() - 0.5) * j * A.invMass * 0.6;
            A.angVel.z += (Math.random() - 0.5) * j * A.invMass * 0.6;
            B.angVel.x += (Math.random() - 0.5) * j * B.invMass * 0.6;
            B.angVel.z += (Math.random() - 0.5) * j * B.invMass * 0.6;
            if (-vn > 3.6 && this.onBodyImpact) {
              const heavier = A.mass > B.mass ? A : B;
              this.onBodyImpact(heavier, -vn);
            }
            A.wake(); B.wake();
          }
          const corr = pen * 0.28;
          const tot = A.invMass + B.invMass;
          if (tot > 0) {
            A.pos.addScaledVector(_v1, -corr * A.invMass / tot);
            B.pos.addScaledVector(_v1, corr * B.invMass / tot);
          }
        }
      }
    }
    this.pairChecks = checks;
  }

  /* ---------- импульс от взрыва ---------- */
  applyExplosion(center, radius, power) {
    for (const b of this.bodies) {
      if (!b.alive) continue;
      _v1.copy(b.pos).sub(center);
      const d = _v1.length();
      if (d > radius || d < 1e-4) continue;
      const f = Math.pow(1 - d / radius, 1.5) * power;
      _v1.multiplyScalar(1 / d);
      _v1.y += 0.42;
      _v1.normalize();
      b.wake();
      b.vel.addScaledVector(_v1, f * Math.min(1.6, 40 / Math.max(6, b.mass)));
      b.angVel.x += (Math.random() - 0.5) * f * 0.5;
      b.angVel.y += (Math.random() - 0.5) * f * 0.5;
      b.angVel.z += (Math.random() - 0.5) * f * 0.5;
    }
  }

  syncMeshes() {
    for (const b of this.bodies) {
      if (b.mesh) {
        b.mesh.position.copy(b.pos);
        b.mesh.quaternion.copy(b.quat);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
function integrateRotation(b, dt) {
  const w = b.angVel;
  if (w.lengthSq() < 1e-9) return;
  _q1.set(w.x * dt * 0.5, w.y * dt * 0.5, w.z * dt * 0.5, 0);
  _q1.multiply(b.quat);
  b.quat.x += _q1.x; b.quat.y += _q1.y; b.quat.z += _q1.z; b.quat.w += _q1.w;
  b.quat.normalize();
}

const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _t3 = new THREE.Vector3();
const _qc = new THREE.Quaternion();

/** Знаменатель для расчёта импульса: invMass + n·((I⁻¹(r×n))×r) */
function effectiveMass(b, r, n) {
  _t1.copy(r).cross(n);
  _qc.copy(b.quat).invert();
  _t1.applyQuaternion(_qc);
  _t1.x *= b.invI.x; _t1.y *= b.invI.y; _t1.z *= b.invI.z;
  _t1.applyQuaternion(b.quat);
  _t2.copy(_t1).cross(r);
  return b.invMass + _t2.dot(n);
}

function applyImpulse(b, imp, r) {
  b.vel.addScaledVector(imp, b.invMass);
  _t3.copy(r).cross(imp);
  _qc.copy(b.quat).invert();
  _t3.applyQuaternion(_qc);
  _t3.x *= b.invI.x; _t3.y *= b.invI.y; _t3.z *= b.invI.z;
  _t3.applyQuaternion(b.quat);
  b.angVel.add(_t3);
  b.sleepT = 0;
  b.sleeping = false;
}

export function massForMaterial(mid, volume) {
  return MATERIALS[mid].mass * volume * 0.05 + 0.6;
}
