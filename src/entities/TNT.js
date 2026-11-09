/**
 * Заряды: установка, предпросмотр, фитиль, цепная реакция и все спецэффекты
 * отдельных типов взрывчатки (кассетный, зажигательный, кумулятивный,
 * гравитационный).
 *
 * Заряд — сущность, а не блок мира: так он не мешает расчёту структуры
 * здания и может падать, если из-под него выбило опору.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';
import { MAT, MATERIALS } from '../world/Materials.js';
import { buildGeometry } from '../world/Mesher.js';
import { Body } from '../physics/PhysicsManager.js';
import { EXPLOSIVE_BY_KEY } from './Explosives.js';
import { isRounded } from '../world/Style.js';
import { makeChargeMesh } from './ChargeModels.js';

const _dir = new THREE.Vector3();
const _tmp = new THREE.Vector3();

export class TNTManager {
  constructor(scene, world, physics, particles, audio, explosions, atlas) {
    this.scene = scene;
    this.world = world;
    this.physics = physics;
    this.particles = particles;
    this.audio = audio;
    this.explosions = explosions;
    this.atlas = atlas;
    this.list = [];
    this.bomblets = [];
    this.shop = null;
    this.fire = null;
    this.destruction = null;

    // геометрия корпуса для каждого типа заряда
    this.geoms = {};
    this.baseMat = new THREE.MeshLambertMaterial({
      map: atlas.texture, vertexColors: true,
    });

    // призрак предпросмотра
    const ghostGeo = new THREE.BoxGeometry(1.005, 1.005, 1.005);
    this.ghostMat = new THREE.MeshBasicMaterial({
      color: 0x5fff8a, transparent: true, opacity: 0.28, depthWrite: false,
    });
    this.ghost = new THREE.Mesh(ghostGeo, this.ghostMat);
    this.ghost.visible = false;
    this.ghost.renderOrder = 4;
    scene.add(this.ghost);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: true }));
    this.ghost.add(edges);
    this.ghostEdges = edges;

    this.onIgnite = null;
    this.onExplode = null;

    explosions.addListener((pos, cfg) => this.chain(pos, cfg));
  }

  setShop(s) { this.shop = s; }
  setFire(f) { this.fire = f; }

  geometryFor(matId) {
    if (this.geoms[matId]) return this.geoms[matId];
    const g = buildGeometry(
      (x, y, z) => (x === 0 && y === 0 && z === 0) ? matId : 0,
      { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 },
      this.atlas, 0, new THREE.Vector3(-0.5, -0.5, -0.5));
    this.geoms[matId] = g;
    return g;
  }

  /* ------------------------------------------------------------ */
  /**
   * @param {string} typeKey ключ взрывчатки
   * @param {{x,y,z}} normal нормаль поверхности, к которой прижат заряд
   */
  place(x, y, z, typeKey = 'tnt', normal = null) {
    const def = EXPLOSIVE_BY_KEY[typeKey] || EXPLOSIVE_BY_KEY.tnt;
    let mesh, fuse = null, glow;
    if (isRounded()) {
      mesh = makeChargeMesh(typeKey);
      glow = mesh.userData.glow;
      mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
      mesh.scale.setScalar(0.97);
      this.scene.add(mesh);
    } else {
      mesh = new THREE.Mesh(this.geometryFor(def.mat), this.baseMat.clone());
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.scale.setScalar(0.97);
      mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
      this.scene.add(mesh);
      glow = [mesh.material];
      fuse = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.036, 0.24, 6),
        new THREE.MeshLambertMaterial({ color: 0xbfa15a }));
      fuse.position.set(0.06, 0.6, 0.04);
      fuse.rotation.z = -0.34;
      mesh.add(fuse);
    }

    const t = {
      cell: { x, y, z },
      pos: new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5),
      mesh, fuse, glow, type: typeKey, def,
      // кумулятивный бьёт в поверхность, к которой прикреплён
      aim: normal ? new THREE.Vector3(-normal.x, -normal.y, -normal.z) : new THREE.Vector3(0, -1, 0),
      lit: false, fuseT: 0, dead: false,
      body: null, spark: 0, pulse: 0, spawnT: 0,
      hiss: null,
    };
    this.list.push(t);
    if (this.audio) this.audio.tntPlace(t.pos);
    return t;
  }

  ignite(t) {
    if (t.lit || t.dead) return false;
    t.lit = true;
    t.fuseT = t.def.fuse;
    if (this.audio) t.hiss = this.audio.fuseStart(t.pos);
    if (this.onIgnite) this.onIgnite(t);
    return true;
  }

  chain(pos, cfg) {
    const r = cfg.chainReactionRadius || CONFIG.tnt.chainRadius;
    for (const t of this.list) {
      if (t.dead) continue;
      const d = t.pos.distanceTo(pos);
      if (d > r) continue;
      const nf = CONFIG.tnt.chainFuseMin +
        Math.random() * (CONFIG.tnt.chainFuseMax - CONFIG.tnt.chainFuseMin) + d * 0.028;
      if (!t.lit) { t.lit = true; t.fuseT = nf; if (this.audio) t.hiss = this.audio.fuseStart(t.pos); }
      else t.fuseT = Math.min(t.fuseT, nf);
    }
    // суббоеприпасы тоже подхватывают детонацию
    for (const b of this.bomblets) {
      if (b.pos.distanceTo(pos) < r * 0.8) b.t = Math.min(b.t, 0.05 + Math.random() * 0.12);
    }
  }

  detonate(t) {
    if (t.dead) return;
    t.dead = true;
    if (t.hiss) { this.audio.fuseStop(t.hiss); t.hiss = null; }
    this.scene.remove(t.mesh);
    if (t.mesh.material) t.mesh.material.dispose();
    if (t.fuse) t.fuse.geometry.dispose();
    if (t.body) { this.physics.remove(t.body); t.body = null; }
    const idx = this.list.indexOf(t);
    if (idx >= 0) this.list.splice(idx, 1);
    if (this.onExplode) this.onExplode(t);

    const key = t.type;
    const cfg = this.shop ? this.shop.configFor(key) : t.def.cfg(0);

    if (key === 'grav') {
      const p = this.shop ? this.shop.paramFor('grav', 'implode') : t.def.implode(0);
      this.explosions.implode(t.pos, p, cfg);
      return;
    }

    this.explosions.explode(t.pos, cfg);

    if (key === 'cluster') {
      const p = this.shop ? this.shop.paramFor('cluster', 'cluster') : t.def.cluster(0);
      const sub = this.shop ? this.shop.paramFor('cluster', 'subCfg') : t.def.subCfg(0);
      this.spawnBomblets(t.pos, p, sub);
    } else if (key === 'napalm') {
      const p = this.shop ? this.shop.paramFor('napalm', 'fire') : t.def.fire(0);
      if (this.fire) this.fire.add(t.pos.x, t.pos.y, t.pos.z, p.radius, p.duration, p.dps);
      this.particles.embers(t.pos.x, t.pos.y, t.pos.z, 22, p.radius * 0.6);
    } else if (key === 'shaped') {
      const p = this.shop ? this.shop.paramFor('shaped', 'directional') : t.def.directional(0);
      if (this.destruction) this.destruction.blastDirectional(t.pos, t.aim, p);
      // видимая струя
      const d = t.aim;
      for (let i = 0; i < 16; i++) {
        const k = i / 16;
        this.particles.emit(this.particles.fire, {
          x: t.pos.x + d.x * k * p.range * 0.6,
          y: t.pos.y + d.y * k * p.range * 0.6,
          z: t.pos.z + d.z * k * p.range * 0.6,
          vx: d.x * 26, vy: d.y * 26, vz: d.z * 26,
          s0: 0.7 - k * 0.4, s1: 0.15,
          c0: 0xfff0c0, c1: 0xff8020,
          o0: 1, o1: 0, oCurve: 1, oScale: 0.8,
          life: 0.16 + k * 0.12, drag: 2.5, grav: 0,
        });
      }
    }
  }

  /* ------------------------------------------------------------ */
  spawnBomblets(pos, p, subCfg) {
    for (let i = 0; i < p.count; i++) {
      const a = (i / p.count) * Math.PI * 2 + Math.random() * 0.6;
      const sp = p.spread * (0.5 + Math.random() * 0.7);
      const b = new Body();
      b.setBox(0.2, 0.2, 0.2, 2.2);
      b.pos.copy(pos);
      b.pos.y += 0.4;
      b.vel.set(Math.cos(a) * sp, p.up * (0.6 + Math.random() * 0.7), Math.sin(a) * sp);
      b.angVel.set((Math.random() - .5) * 12, (Math.random() - .5) * 12, (Math.random() - .5) * 12);
      b.kind = 'bomblet'; b.mat = MAT.CLUSTER; b.ttl = 999;
      b.noWorldDamage = true; b.canSleep = false;
      b.restitution = 0.35; b.friction = 0.5;
      this.physics.add(b);

      let mesh;
      if (isRounded()) {
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8),
          new THREE.MeshLambertMaterial({ color: 0x8fa86a }));
      } else {
        mesh = new THREE.Mesh(this.geometryFor(MAT.CLUSTER), this.baseMat.clone());
        mesh.scale.setScalar(0.4);
      }
      mesh.castShadow = true;
      this.scene.add(mesh);

      this.bomblets.push({
        body: b, mesh, pos: b.pos,
        t: p.delay + Math.random() * 0.45 + i * 0.05,
        cfg: subCfg, spark: 0,
      });
    }
  }

  /* ------------------------------------------------------------ */
  update(dt) {
    const W = this.world;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i];
      if (t.dead) continue;

      if (t.spawnT < 1) {
        t.spawnT = Math.min(1, t.spawnT + dt * 7);
        const k = 1 + Math.sin(t.spawnT * Math.PI) * 0.22;
        t.mesh.scale.setScalar(0.97 * k);
      }

      // потеря опоры → падает
      if (!t.body) {
        const c = t.cell;
        const supported =
          W.get(c.x, c.y - 1, c.z) || W.get(c.x - 1, c.y, c.z) || W.get(c.x + 1, c.y, c.z) ||
          W.get(c.x, c.y, c.z - 1) || W.get(c.x, c.y, c.z + 1) || W.get(c.x, c.y + 1, c.z);
        if (!supported) {
          const b = new Body();
          b.setBox(0.48, 0.48, 0.48, 6);
          b.pos.copy(t.pos);
          b.vel.set((Math.random() - .5) * 0.6, -0.4, (Math.random() - .5) * 0.6);
          b.angVel.set((Math.random() - .5) * 2, (Math.random() - .5) * 2, (Math.random() - .5) * 2);
          b.kind = 'tnt'; b.mat = t.def.mat; b.ttl = 999;
          b.noWorldDamage = true;
          b.restitution = 0.14; b.friction = 0.75;
          this.physics.add(b);
          t.body = b;
        }
      }
      if (t.body) {
        t.pos.copy(t.body.pos);
        t.mesh.position.copy(t.body.pos);
        t.mesh.quaternion.copy(t.body.quat);
        if (t.body.pos.y < CONFIG.killY + 4) { this.detonate(t); continue; }
      }

      if (t.lit) {
        t.fuseT -= dt;
        t.pulse += dt;
        const urgency = 1 - Math.max(0, Math.min(1, t.fuseT / t.def.fuse));
        const freq = 7 + urgency * 26;
        const glow = 0.5 + 0.5 * Math.sin(t.pulse * freq);
        const c = t.def.tint;
        const er = glow * (0.28 + urgency * 0.72);
        const eg = glow * (0.10 + urgency * 0.16) * ((c >> 8 & 255) / 255 + 0.3);
        const eb = glow * (0.06 + urgency * 0.30) * ((c & 255) / 255 + 0.2);
        for (const m of (t.glow || [])) m.emissive.setRGB(er, eg, eb);
        t.mesh.scale.setScalar(0.97 * (1 + glow * 0.045 * (0.4 + urgency)));

        t.spark -= dt;
        if (t.spark <= 0) {
          t.spark = 0.035 + Math.random() * 0.05;
          const fp = _tmp.copy(t.pos).add(_dir.set(0.06, 0.62, 0.04).applyQuaternion(t.mesh.quaternion));
          this.particles.sparks(fp.x, fp.y, fp.z, 2, 3.6, 0xffe27a, 0.35);
          if (Math.random() < 0.4) {
            this.particles.emit(this.particles.smoke, {
              x: fp.x, y: fp.y, z: fp.z,
              vx: (Math.random() - .5) * .4, vy: .8 + Math.random() * .5, vz: (Math.random() - .5) * .4,
              s0: 0.09, s1: 0.4, c0: 0xb0b0b0, c1: 0x808080,
              o0: 0, o1: 0, oCurve: 2, oScale: 0.5, life: 0.7, drag: 1.2, grav: -0.3, wind: 1,
            });
          }
        }
        if (t.hiss && this.audio) this.audio.fuseUpdate(t.hiss, t.pos, urgency);

        if (t.fuseT <= 0) { this.detonate(t); continue; }
      }
    }

    // суббоеприпасы
    for (let i = this.bomblets.length - 1; i >= 0; i--) {
      const b = this.bomblets[i];
      b.t -= dt;
      b.mesh.position.copy(b.body.pos);
      b.mesh.quaternion.copy(b.body.quat);
      b.spark -= dt;
      if (b.spark <= 0) {
        b.spark = 0.05;
        this.particles.sparks(b.body.pos.x, b.body.pos.y, b.body.pos.z, 1, 2.4, 0xffd070, 0.25);
      }
      if (b.t <= 0 || b.body.pos.y < CONFIG.killY + 4) {
        const p = b.body.pos.clone();
        this.scene.remove(b.mesh);
        b.mesh.material.dispose();
        this.physics.remove(b.body);
        this.bomblets.splice(i, 1);
        this.explosions.explode(p, b.cfg);
      }
    }
  }

  /* ------------------------------------------------------------ */
  /** Куда можно поставить заряд. */
  findPlacement(origin, dir, reach, playerPos) {
    const hit = this.world.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, reach);
    const tHit = this.rayTNT(origin, dir, reach);
    if (tHit && (!hit || tHit.dist < hit.dist)) {
      const c = tHit.tnt.cell;
      const n = tHit.normal;
      const r = this._validate(c.x + n.x, c.y + n.y, c.z + n.z, playerPos);
      if (r) r.normal = n;
      return r;
    }
    if (!hit) return null;
    const r = this._validate(hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz, playerPos);
    if (r) r.normal = { x: hit.nx, y: hit.ny, z: hit.nz };
    return r;
  }

  _validate(x, y, z, playerPos) {
    const W = this.world;
    if (!W.inside(x, y, z)) return null;
    if (W.get(x, y, z)) return { x, y, z, ok: false };
    for (const t of this.list) {
      if (t.cell.x === x && t.cell.y === y && t.cell.z === z && !t.body) return { x, y, z, ok: false };
    }
    if (playerPos) {
      const r = CONFIG.player.radius + 0.05;
      if (playerPos.x + r > x && playerPos.x - r < x + 1 &&
        playerPos.z + r > z && playerPos.z - r < z + 1 &&
        playerPos.y + CONFIG.player.height > y && playerPos.y < y + 1) {
        return { x, y, z, ok: false };
      }
    }
    const attached = W.get(x, y - 1, z) || W.get(x, y + 1, z) || W.get(x - 1, y, z) ||
      W.get(x + 1, y, z) || W.get(x, y, z - 1) || W.get(x, y, z + 1) ||
      this.list.some(t => Math.abs(t.cell.x - x) + Math.abs(t.cell.y - y) + Math.abs(t.cell.z - z) === 1);
    return { x, y, z, ok: !!attached };
  }

  rayTNT(origin, dir, reach) {
    let best = null;
    for (const t of this.list) {
      if (t.dead) continue;
      const h = rayBox(origin, dir, t.pos, 0.5);
      if (h !== null && h >= 0 && h <= reach) {
        if (!best || h < best.dist) {
          const p = _tmp.copy(dir).multiplyScalar(h).add(origin).sub(t.pos);
          const ax = Math.abs(p.x), ay = Math.abs(p.y), az = Math.abs(p.z);
          const n = { x: 0, y: 0, z: 0 };
          if (ax >= ay && ax >= az) n.x = Math.sign(p.x);
          else if (ay >= az) n.y = Math.sign(p.y);
          else n.z = Math.sign(p.z);
          best = { tnt: t, dist: h, normal: n };
        }
      }
    }
    return best;
  }

  findIgnitable(origin, dir, reach) {
    const r = this.rayTNT(origin, dir, reach);
    if (r && !r.tnt.lit) return r.tnt;
    let best = null, bestScore = Infinity;
    for (const t of this.list) {
      if (t.dead || t.lit) continue;
      _tmp.copy(t.pos).sub(origin);
      const along = _tmp.dot(dir);
      if (along < 0 || along > reach) continue;
      const perp = Math.sqrt(Math.max(0, _tmp.lengthSq() - along * along));
      if (perp > 1.5) continue;
      const score = perp + along * 0.12;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  showGhost(p, tint) {
    if (!p) { this.ghost.visible = false; return; }
    this.ghost.visible = true;
    this.ghost.position.set(p.x + 0.5, p.y + 0.5, p.z + 0.5);
    this.ghostMat.color.setHex(p.ok ? (tint || 0x5fff8a) : 0xff5b4a);
    this.ghostMat.opacity = p.ok ? 0.26 : 0.2;
    this.ghostEdges.material.color.setHex(p.ok ? 0xd8ffe4 : 0xffc0b8);
  }
  hideGhost() { this.ghost.visible = false; }

  get count() { return this.list.length + this.bomblets.length; }
  get litCount() { return this.list.reduce((a, t) => a + (t.lit ? 1 : 0), 0); }

  clear() {
    for (const t of this.list) {
      if (t.hiss && this.audio) this.audio.fuseStop(t.hiss);
      this.scene.remove(t.mesh);
      if (t.mesh.material) t.mesh.material.dispose();
      if (t.body) this.physics.remove(t.body);
    }
    this.list.length = 0;
    for (const b of this.bomblets) {
      this.scene.remove(b.mesh);
      b.mesh.material.dispose();
      this.physics.remove(b.body);
    }
    this.bomblets.length = 0;
    this.ghost.visible = false;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.ghost);
    this.ghost.geometry.dispose();
    this.ghostMat.dispose();
    for (const k in this.geoms) if (this.geoms[k]) this.geoms[k].dispose();
    this.baseMat.dispose();
  }
}

/** Пересечение луча с AABB-кубом (возвращает расстояние или null). */
function rayBox(origin, dir, center, half) {
  let tmin = -Infinity, tmax = Infinity;
  for (const ax of ['x', 'y', 'z']) {
    const d = dir[ax];
    const mn = center[ax] - half, mx = center[ax] + half;
    if (Math.abs(d) < 1e-8) {
      if (origin[ax] < mn || origin[ax] > mx) return null;
    } else {
      let t1 = (mn - origin[ax]) / d, t2 = (mx - origin[ax]) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin >= 0 ? tmin : (tmax >= 0 ? 0 : null);
}
