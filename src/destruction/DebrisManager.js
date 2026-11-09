/**
 * Обломки.
 *
 * Два класса объектов:
 *  1) мелкие обломки — один InstancedMesh на всех (1 draw call, до 400 штук);
 *  2) кластеры — куски конструкции из нескольких блоков, у каждого своя
 *     геометрия и составное физическое тело; при сильном ударе разваливаются.
 *
 * Всё живёт в бюджете: при превышении лимита старые обломки засыпают,
 * затем плавно уменьшаются и исчезают.
 */
import * as THREE from 'three';
import { MATERIALS } from '../world/Materials.js';
import { buildGeometry } from '../world/Mesher.js';
import { Body } from '../physics/PhysicsManager.js';
import { isRounded, isSoft } from '../world/Style.js';
import { makeRoundedBox } from '../entities/ChargeModels.js';

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _col = new THREE.Color();

export class DebrisManager {
  constructor(scene, physics, atlas, quality) {
    this.scene = scene;
    this.physics = physics;
    this.atlas = atlas;
    this.quality = quality;

    this.maxDebris = quality.debrisBudget;
    this.maxClusters = quality.clusterBudget;

    // в мягком стиле обломки почти шарики — как и сами блоки
    const geo = isRounded() ? makeRoundedBox(isSoft() ? 0.55 : 0.34, 3) : new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: false });
    this.inst = new THREE.InstancedMesh(geo, mat, this.maxDebris);
    this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.inst.count = 0;
    this.inst.frustumCulled = false;
    this.inst.castShadow = quality.debrisShadows;
    this.inst.receiveShadow = false;
    this.inst.name = 'debris';
    scene.add(this.inst);

    this.slots = [];      // Body на позиции i в инстансах
    this.clusters = [];
    this.clusterMaterials = null;

    this.onClusterLand = null;   // (pos, size, material) — для пыли/звука
    this.onDebrisImpact = null;  // (pos, material, speed)
  }

  setClusterMaterials(m) { this.clusterMaterials = m; }

  get debrisCount() { return this.slots.length; }
  get clusterCount() { return this.clusters.length; }

  /* ------------------------------------------------------------ */
  /* Мелкие обломки                                                */
  /* ------------------------------------------------------------ */
  spawnDebris(x, y, z, mid, size, vx, vy, vz, spin = 6) {
    if (this.slots.length >= this.maxDebris) {
      if (!this._recycleOldest()) return null;
    }
    const b = new Body();
    const mat = MATERIALS[mid] || MATERIALS[3];
    const sx = size * (0.75 + Math.random() * 0.5);
    const sy = size * (0.75 + Math.random() * 0.5);
    const sz = size * (0.75 + Math.random() * 0.5);
    b.setBox(sx * 0.5, sy * 0.5, sz * 0.5, Math.max(0.35, mat.mass * sx * sy * sz * 0.05));
    b.pos.set(x, y, z);
    b.vel.set(vx, vy, vz);
    b.angVel.set((Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin, (Math.random() - 0.5) * spin);
    b.quat.setFromEuler(new THREE.Euler(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28));
    b.mat = mid;
    b.kind = 'debris';
    b.restitution = mat.sound === 'stone' ? 0.12 : (mat.sound === 'glass' ? 0.3 : 0.2);
    b.friction = mat.sound === 'glass' ? 0.3 : 0.66;
    b.ttl = 4.6 + Math.random() * 1.9;   // живут недолго и плавно тают
    b.scaleVec = new THREE.Vector3(sx, sy, sz);
    b.baseScale = 1;
    b.slot = this.slots.length;
    b.colorHex = mat.color;
    this.slots.push(b);
    this.physics.add(b);

    const shade = 0.78 + Math.random() * 0.42;
    _col.setHex(mat.color, THREE.SRGBColorSpace);
    _col.multiplyScalar(shade);
    this.inst.setColorAt(b.slot, _col);
    if (this.inst.instanceColor) this.inst.instanceColor.needsUpdate = true;
    this.inst.count = this.slots.length;
    return b;
  }

  _recycleOldest() {
    // сначала спящие и дальние
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < this.slots.length; i++) {
      const b = this.slots[i];
      let sc = b.age;
      if (b.sleeping) sc += 12;
      if (sc > bestScore) { bestScore = sc; best = i; }
    }
    if (best < 0) return false;
    this._killDebris(best);
    return true;
  }

  _killDebris(i) {
    const b = this.slots[i];
    b.alive = false;
    const last = this.slots.length - 1;
    if (i !== last) {
      const mv = this.slots[last];
      this.slots[i] = mv; mv.slot = i;
      this.inst.getMatrixAt(last, _m4);
      this.inst.setMatrixAt(i, _m4);
      this.inst.instanceMatrix.needsUpdate = true;
      if (this.inst.instanceColor) {
        const c = this.inst.instanceColor.array;
        c[i * 3] = c[last * 3]; c[i * 3 + 1] = c[last * 3 + 1]; c[i * 3 + 2] = c[last * 3 + 2];
        this.inst.instanceColor.needsUpdate = true;
      }
    }
    this.slots.pop();
    this.inst.count = this.slots.length;
  }

  /* ------------------------------------------------------------ */
  /* Кластеры — куски конструкции                                  */
  /* ------------------------------------------------------------ */
  /**
   * @param {Array<number>} voxels  [x,y,z,mat, x,y,z,mat, ...]
   * @param {THREE.Vector3} vel
   */
  spawnCluster(voxels, vel, angVel, generation = 0) {
    const nv = voxels.length / 4;
    if (nv === 0) return null;
    if (nv <= 2) {
      for (let i = 0; i < nv; i++) {
        const x = voxels[i * 4], y = voxels[i * 4 + 1], z = voxels[i * 4 + 2], m = voxels[i * 4 + 3];
        this.spawnDebris(x + 0.5, y + 0.5, z + 0.5, m, 0.62,
          vel.x + (Math.random() - 0.5) * 2, vel.y + Math.random() * 1.5, vel.z + (Math.random() - 0.5) * 2);
      }
      return null;
    }
    if (this.clusters.length >= this.maxClusters) {
      if (!this._recycleCluster()) return null;
    }

    // границы и центр масс
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    let mx = 0, my = 0, mz = 0, mass = 0;
    for (let i = 0; i < nv; i++) {
      const x = voxels[i * 4], y = voxels[i * 4 + 1], z = voxels[i * 4 + 2], m = voxels[i * 4 + 3];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
      const w = MATERIALS[m].mass;
      mx += (x + 0.5) * w; my += (y + 0.5) * w; mz += (z + 0.5) * w; mass += w;
    }
    const com = new THREE.Vector3(mx / mass, my / mass, mz / mass);

    const dx = x1 - x0 + 1, dy = y1 - y0 + 1, dz = z1 - z0 + 1;
    const grid = new Uint8Array(dx * dy * dz);
    const gi = (x, y, z) => ((y - y0) * dz + (z - z0)) * dx + (x - x0);
    for (let i = 0; i < nv; i++) {
      grid[gi(voxels[i * 4], voxels[i * 4 + 1], voxels[i * 4 + 2])] = voxels[i * 4 + 3];
    }
    const get = (x, y, z) => {
      if (x < x0 || y < y0 || z < z0 || x > x1 || y > y1 || z > z1) return 0;
      return grid[gi(x, y, z)];
    };

    const off = new THREE.Vector3(-com.x, -com.y, -com.z);
    const bounds = { x0, y0, z0, x1, y1, z1 };
    const gOpaque = buildGeometry(get, bounds, this.atlas, 0, off);
    const gTrans = buildGeometry(get, bounds, this.atlas, 1, off);
    if (!gOpaque && !gTrans) return null;

    const grp = new THREE.Group();
    if (gOpaque) {
      const m = new THREE.Mesh(gOpaque, this.clusterMaterials.opaque);
      m.castShadow = true; m.receiveShadow = true;
      grp.add(m);
    }
    if (gTrans) {
      const m = new THREE.Mesh(gTrans, this.clusterMaterials.transparent);
      m.castShadow = false; m.receiveShadow = true;
      grp.add(m);
    }
    this.scene.add(grp);

    // разбиение на коробки для физики
    const parts = greedyBoxes(grid, x0, y0, z0, dx, dy, dz, com);

    const b = new Body();
    b.setCompound(parts, Math.max(2.5, mass * 0.055));
    b.pos.copy(com);
    b.vel.copy(vel);
    if (angVel) b.angVel.copy(angVel);
    b.kind = 'cluster';
    b.mesh = grp;
    b.restitution = 0.05;
    b.friction = 0.78;
    // крупные куски лежат дольше — это «остатки здания», но тоже уходят
    b.ttl = 13 + Math.random() * 6;
    b.voxels = voxels;
    b.generation = generation;
    b.nv = nv;
    b.mat = voxels[3];
    grp.position.copy(com);

    this.clusters.push(b);
    this.physics.add(b);
    return b;
  }

  _recycleCluster() {
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < this.clusters.length; i++) {
      const c = this.clusters[i];
      let sc = c.age + (c.sleeping ? 20 : 0) - c.nv * 0.4;
      if (sc > bestScore) { bestScore = sc; best = i; }
    }
    if (best < 0) return false;
    this._killCluster(best, true);
    return true;
  }

  _killCluster(i, immediate) {
    const c = this.clusters[i];
    c.alive = false;
    if (c.mesh) {
      this.scene.remove(c.mesh);
      c.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      c.mesh = null;
    }
    this.clusters.splice(i, 1);
  }

  /** Разваливает кластер при сильном ударе. */
  shatterCluster(body, speed) {
    if (body.kind !== 'cluster' || !body.alive) return false;
    if (body.generation >= 2 || body.nv <= 4) return false;
    const idx = this.clusters.indexOf(body);
    if (idx < 0) return false;

    const voxels = body.voxels;
    const nv = body.nv;
    // текущая трансформация
    const q = body.quat.clone();
    const com = body.pos.clone();
    const origCom = new THREE.Vector3();
    {
      let mx = 0, my = 0, mz = 0, mm = 0;
      for (let i = 0; i < nv; i++) {
        const w = MATERIALS[voxels[i * 4 + 3]].mass;
        mx += (voxels[i * 4] + 0.5) * w; my += (voxels[i * 4 + 1] + 0.5) * w; mz += (voxels[i * 4 + 2] + 0.5) * w; mm += w;
      }
      origCom.set(mx / mm, my / mm, mz / mm);
    }

    // разрез плоскостью по самой длинной оси
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < nv; i++) {
      x0 = Math.min(x0, voxels[i * 4]); x1 = Math.max(x1, voxels[i * 4]);
      y0 = Math.min(y0, voxels[i * 4 + 1]); y1 = Math.max(y1, voxels[i * 4 + 1]);
      z0 = Math.min(z0, voxels[i * 4 + 2]); z1 = Math.max(z1, voxels[i * 4 + 2]);
    }
    const ex = x1 - x0, ey = y1 - y0, ez = z1 - z0;
    let axis = 0, cut = 0;
    if (ex >= ey && ex >= ez) { axis = 0; cut = x0 + Math.ceil(ex / 2); }
    else if (ez >= ey) { axis = 2; cut = z0 + Math.ceil(ez / 2); }
    else { axis = 1; cut = y0 + Math.ceil(ey / 2); }

    const A = [], B = [];
    for (let i = 0; i < nv; i++) {
      const v = voxels[i * 4 + axis];
      const dst = v < cut ? A : B;
      dst.push(voxels[i * 4], voxels[i * 4 + 1], voxels[i * 4 + 2], voxels[i * 4 + 3]);
    }
    if (!A.length || !B.length) return false;

    this._killCluster(idx, true);

    const mkVel = (list) => {
      // центр половинки в исходных координатах → мировая позиция после поворота
      let mx = 0, my = 0, mz = 0, mm = 0;
      const n = list.length / 4;
      for (let i = 0; i < n; i++) {
        const w = MATERIALS[list[i * 4 + 3]].mass;
        mx += (list[i * 4] + 0.5) * w; my += (list[i * 4 + 1] + 0.5) * w; mz += (list[i * 4 + 2] + 0.5) * w; mm += w;
      }
      const local = new THREE.Vector3(mx / mm - origCom.x, my / mm - origCom.y, mz / mm - origCom.z);
      const world = local.clone().applyQuaternion(q).add(com);
      const shift = world.clone().sub(com);
      const vel = body.vel.clone().add(new THREE.Vector3().copy(body.angVel).cross(shift));
      vel.addScaledVector(shift.clone().normalize(), 1.6 + Math.random() * 1.4);
      return { list, world, vel, local };
    };

    for (const half of [mkVel(A), mkVel(B)]) {
      // переносим воксели так, чтобы новый кластер оказался в нужной точке
      const nb = this.spawnCluster(half.list, half.vel,
        new THREE.Vector3(body.angVel.x + (Math.random() - .5) * 2,
          body.angVel.y + (Math.random() - .5) * 2,
          body.angVel.z + (Math.random() - .5) * 2), body.generation + 1);
      if (nb) {
        nb.quat.copy(q);
        nb.pos.copy(half.world);
        nb.mesh.position.copy(nb.pos);
        nb.mesh.quaternion.copy(q);
      }
    }
    return true;
  }

  /* ------------------------------------------------------------ */
  update(dt, playerPos, killY) {
    // мелкие обломки
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const b = this.slots[i];
      let dead = false;
      if (b.pos.y < killY) dead = true;
      if (b.age > b.ttl) dead = true;
      if (b.sleeping && playerPos && b.pos.distanceToSquared(playerPos) > 3600 && b.age > 6) dead = true;
      if (dead) { this._killDebris(i); continue; }

      // усадка с плавным началом — исчезновение почти не заметно
      const fade = 1.9;
      const fadeStart = b.ttl - fade;
      let sc = 1;
      if (b.age > fadeStart) {
        const k = Math.min(1, (b.age - fadeStart) / fade);
        sc = Math.max(0.001, 1 - k * k);
      }
      _s.set(b.scaleVec.x * sc, b.scaleVec.y * sc, b.scaleVec.z * sc);
      _m4.compose(b.pos, b.quat, _s);
      this.inst.setMatrixAt(i, _m4);
    }
    if (this.slots.length) this.inst.instanceMatrix.needsUpdate = true;

    // кластеры
    for (let i = this.clusters.length - 1; i >= 0; i--) {
      const c = this.clusters[i];
      if (!c.alive) { this.clusters.splice(i, 1); continue; }
      if (c.pos.y < killY || c.age > c.ttl) { this._killCluster(i, true); continue; }
      if (c.mesh) {
        c.mesh.position.copy(c.pos);
        c.mesh.quaternion.copy(c.quat);
        const fade = 2.6, fs = c.ttl - fade;
        if (c.age > fs) {
          const k = Math.min(1, (c.age - fs) / fade);
          c.mesh.scale.setScalar(Math.max(0.001, 1 - k * k));
        }
      }
    }
  }

  clear() {
    for (let i = this.slots.length - 1; i >= 0; i--) this._killDebris(i);
    for (let i = this.clusters.length - 1; i >= 0; i--) this._killCluster(i, true);
    this.inst.count = 0;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.inst);
    this.inst.geometry.dispose();
    this.inst.material.dispose();
  }
}

/* ------------------------------------------------------------------ */
/** Жадное разбиение набора вокселей на коробки (для составного тела). */
function greedyBoxes(grid, x0, y0, z0, dx, dy, dz, com) {
  const used = new Uint8Array(dx * dy * dz);
  const gi = (x, y, z) => (y * dz + z) * dx + x;
  const parts = [];
  const MAXP = 10;

  for (let y = 0; y < dy && parts.length < MAXP; y++) {
    for (let z = 0; z < dz && parts.length < MAXP; z++) {
      for (let x = 0; x < dx && parts.length < MAXP; x++) {
        const i = gi(x, y, z);
        if (!grid[i] || used[i]) continue;
        // растим по X
        let w = 1;
        while (x + w < dx && grid[gi(x + w, y, z)] && !used[gi(x + w, y, z)]) w++;
        // растим по Z
        let d = 1;
        outerZ: while (z + d < dz) {
          for (let k = 0; k < w; k++) {
            const j = gi(x + k, y, z + d);
            if (!grid[j] || used[j]) break outerZ;
          }
          d++;
        }
        // растим по Y
        let h = 1;
        outerY: while (y + h < dy) {
          for (let k = 0; k < w; k++) for (let l = 0; l < d; l++) {
            const j = gi(x + k, y + h, z + l);
            if (!grid[j] || used[j]) break outerY;
          }
          h++;
        }
        for (let a = 0; a < w; a++) for (let b = 0; b < h; b++) for (let c = 0; c < d; c++)
          used[gi(x + a, y + b, z + c)] = 1;

        parts.push({
          ox: (x0 + x + w / 2) - com.x,
          oy: (y0 + y + h / 2) - com.y,
          oz: (z0 + z + d / 2) - com.z,
          hx: w / 2, hy: h / 2, hz: d / 2,
        });
      }
    }
  }
  if (!parts.length) {
    parts.push({ ox: 0, oy: 0, oz: 0, hx: dx / 2, hy: dy / 2, hz: dz / 2 });
  }
  return parts;
}
