/**
 * Система разрушения.
 *
 * Взрыв — не «удалить всё в радиусе», а трассировка сотен лучей из эпицентра.
 * Каждый луч теряет энергию, проходя сквозь материал: солома почти не держит,
 * камень съедает луч за пару блоков, металл останавливает почти сразу.
 * Поэтому кратер получается неровным, а комнаты за толстой стеной уцелевают —
 * и появляется место для тактики.
 */
import * as THREE from 'three';
import { MATERIALS, blockScore } from '../world/Materials.js';
import { StructuralSystem, splitGroup, FLAG_FALLING } from './StructuralSystem.js';
import { FLAG_TERRAIN } from '../world/VoxelWorld.js';

const BASE_RAYS = 520;
const STEP = 0.235;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class DestructionSystem {
  constructor(world, physics, debris, fx, audio, quality) {
    this.world = world;
    this.physics = physics;
    this.debris = debris;
    this.fx = fx;
    this.audio = audio;
    this.quality = quality;
    this.structural = new StructuralSystem(world);

    this.pendingStress = [];      // {t, group}
    this.score = 0;
    this.destroyedTotal = 0;
    this.onScore = null;          // (amount, reason, position)
    this.onCollapse = null;       // (voxelCount, position)
    this.onBlockDestroyed = null; // (x,y,z,mat)

    this._dirs = null;
    this._dirCount = 0;
    this.analysisCooldown = 0;
  }

  /* --------------------------------------------------------------- */
  _dirsFor(n) {
    if (this._dirs && this._dirCount === n) return this._dirs;
    const a = new Float32Array(n * 3);
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = ga * i;
      a[i * 3] = Math.cos(th) * r;
      a[i * 3 + 1] = y;
      a[i * 3 + 2] = Math.sin(th) * r;
    }
    this._dirs = a; this._dirCount = n;
    return a;
  }

  /**
   * Основной расчёт взрыва: урон блокам + сбор разрушенных.
   * @returns {{count:number, blocks:Array, materials:Object}}
   */
  blast(center, cfg) {
    const W = this.world;
    const rays = this.quality.explosionRays;
    const dirs = this._dirsFor(rays);
    const dmgScale = (BASE_RAYS / rays) * cfg.damageRate;
    const airDrag = cfg.power / cfg.radius * 0.82;

    const destroyed = [];
    const seen = new Set();

    for (let i = 0; i < rays; i++) {
      let energy = cfg.power * (0.74 + Math.random() * 0.54);
      let px = center.x, py = center.y, pz = center.z;
      const dx = dirs[i * 3] * STEP, dy = dirs[i * 3 + 1] * STEP, dz = dirs[i * 3 + 2] * STEP;
      let travelled = 0;
      while (energy > 0 && travelled < cfg.radius) {
        px += dx; py += dy; pz += dz;
        travelled += STEP;
        const vx = Math.floor(px), vy = Math.floor(py), vz = Math.floor(pz);
        const idx = W.idx(vx, vy, vz);
        if (idx < 0) { energy -= airDrag * STEP * 3; continue; }
        const m = W.blocks[idx];
        if (m === 0) { energy -= airDrag * STEP; continue; }
        const mat = MATERIALS[m];
        if (mat.indestructible) { energy = 0; break; }
        const dmg = energy * STEP * dmgScale;
        const r = W.damage(vx, vy, vz, dmg);
        if (r === 2) {
          if (!seen.has(idx)) {
            seen.add(idx);
            destroyed.push(vx, vy, vz, m);
            W.blocks[idx] = 0; W.hp[idx] = 0; W.flags[idx] = 0;
            W.solidCount--;
            W.markDirty(vx, vy, vz);
          }
          energy -= mat.blast * STEP * 0.45;
        } else {
          energy -= (mat.blast + airDrag) * STEP;
        }
      }
    }

    const count = destroyed.length / 4;
    if (count) this.spawnDestructionFX(destroyed, center, cfg);
    this.destroyedTotal += count;
    if (count) this.structural.requestAnalysis();
    return { count, blocks: destroyed };
  }

  /** Обломки, частицы и очки за разрушенные блоки. */
  spawnDestructionFX(list, center, cfg) {
    const n = list.length / 4;
    const q = this.quality;
    const maxBodies = Math.min(140, Math.floor(q.debrisBudget * 0.55));
    let bodies = 0;
    let score = 0;
    const soundCount = {};

    // ближние к эпицентру — в первую очередь получают физику
    const order = [];
    for (let i = 0; i < n; i++) {
      const x = list[i * 4], y = list[i * 4 + 1], z = list[i * 4 + 2];
      const d = Math.hypot(x + 0.5 - center.x, y + 0.5 - center.y, z + 0.5 - center.z);
      order.push({ i, d });
    }
    order.sort((a, b) => a.d - b.d);

    for (const o of order) {
      const i = o.i;
      const x = list[i * 4], y = list[i * 4 + 1], z = list[i * 4 + 2], m = list[i * 4 + 3];
      const mat = MATERIALS[m];
      score += blockScore(m);
      soundCount[mat.sound] = (soundCount[mat.sound] || 0) + 1;

      const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
      _v.set(cx - center.x, cy - center.y, cz - center.z);
      const dist = Math.max(0.5, _v.length());
      _v.multiplyScalar(1 / dist);
      const fall = Math.pow(Math.max(0, 1 - dist / cfg.radius), 1.25);
      const speed = cfg.impulse * fall * (0.55 + Math.random() * 0.9) * (40 / (mat.mass + 25));

      if (bodies < maxBodies && (o.d < cfg.radius * 0.72 || Math.random() < 0.45)) {
        bodies++;
        const sz = mat.debrisScale * (0.42 + Math.random() * 0.34);
        this.debris.spawnDebris(cx, cy, cz, m, sz,
          _v.x * speed + (Math.random() - 0.5) * 3,
          _v.y * speed + 2.2 + Math.random() * 3.4,
          _v.z * speed + (Math.random() - 0.5) * 3,
          9 + Math.random() * 10);
        // дополнительная мелочь
        if (q.particleBudget > 800 && Math.random() < 0.5 && bodies < maxBodies) {
          bodies++;
          this.debris.spawnDebris(cx, cy, cz, m, sz * 0.55,
            _v.x * speed * 1.3 + (Math.random() - 0.5) * 5,
            _v.y * speed * 1.2 + 3 + Math.random() * 4,
            _v.z * speed * 1.3 + (Math.random() - 0.5) * 5, 14);
        }
      }

      if (this.fx) this.fx.blockBurst(cx, cy, cz, m, _v, Math.min(1, fall * 1.6));
      if (this.onBlockDestroyed) this.onBlockDestroyed(x, y, z, m);
    }

    this.score += score;
    if (this.onScore && score) this.onScore(score, 'blocks', center);

    // звуки разрушения — по одному на материал, а не по одному на блок
    if (this.audio) {
      for (const k in soundCount) {
        this.audio.material(k, center, Math.min(1, 0.35 + soundCount[k] / 26));
      }
    }
  }

  /**
   * Кумулятивный заряд: узкий пучок лучей с малым сопротивлением воздуха
   * и половинным поглощением в материале. Пробивает толстую кладку насквозь,
   * но почти ничего не сносит вширь.
   */
  blastDirectional(center, dir, p) {
    const W = this.world;
    const rays = Math.max(48, Math.floor(this.quality.explosionRays * 0.16));
    const dmgScale = 0.09 * (120 / rays);
    const destroyed = [];
    const seen = new Set();
    const base = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
    const ortho1 = new THREE.Vector3(0, 1, 0);
    if (Math.abs(base.y) > 0.9) ortho1.set(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(base, ortho1).normalize();
    const v2 = new THREE.Vector3().crossVectors(base, u).normalize();

    for (let i = 0; i < rays; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * p.spread;
      _v.copy(base)
        .addScaledVector(u, Math.cos(a) * rr)
        .addScaledVector(v2, Math.sin(a) * rr)
        .normalize();
      let energy = p.power * (0.85 + Math.random() * 0.3);
      let px = center.x, py = center.y, pz = center.z;
      const dx = _v.x * STEP, dy = _v.y * STEP, dz = _v.z * STEP;
      let travelled = 0;
      while (energy > 0 && travelled < p.range) {
        px += dx; py += dy; pz += dz;
        travelled += STEP;
        const vx = Math.floor(px), vy = Math.floor(py), vz = Math.floor(pz);
        const idx = W.idx(vx, vy, vz);
        if (idx < 0) { energy -= STEP; continue; }
        const m = W.blocks[idx];
        if (m === 0) { energy -= 0.35 * STEP; continue; }
        const mat = MATERIALS[m];
        if (mat.indestructible) { energy = 0; break; }
        const r = W.damage(vx, vy, vz, energy * STEP * dmgScale * 100);
        if (r === 2) {
          if (!seen.has(idx)) {
            seen.add(idx);
            destroyed.push(vx, vy, vz, m);
            W.blocks[idx] = 0; W.hp[idx] = 0; W.flags[idx] = 0; W.solidCount--;
            W.markDirty(vx, vy, vz);
          }
          energy -= mat.blast * 0.28 * STEP;
        } else {
          energy -= (mat.blast * 0.55 + 0.35) * STEP;
        }
      }
    }

    if (destroyed.length) {
      this.spawnDestructionFX(destroyed, center, {
        radius: p.range * 0.6, impulse: 22, damageRate: 1,
      });
      this.structural.requestAnalysis();
      this.destroyedTotal += destroyed.length / 4;
    }
    return { count: destroyed.length / 4 };
  }

  /**
   * Гравитационный удар: не выжигает кратер, а рвёт конструкцию изнутри —
   * часть блоков вырывает, остальные сильно ослабляет. Дом после такого
   * складывается сам.
   */
  implosionDamage(center, p) {
    const W = this.world;
    const R = Math.ceil(p.radius);
    const destroyed = [];
    const cx = Math.floor(center.x), cy = Math.floor(center.y), cz = Math.floor(center.z);
    for (let y = cy - R; y <= cy + R; y++)
      for (let z = cz - R; z <= cz + R; z++)
        for (let x = cx - R; x <= cx + R; x++) {
          const d = Math.hypot(x + 0.5 - center.x, y + 0.5 - center.y, z + 0.5 - center.z);
          if (d > p.radius) continue;
          const idx = W.idx(x, y, z);
          if (idx < 0) continue;
          const m = W.blocks[idx];
          if (!m || MATERIALS[m].indestructible) continue;
          if (W.flags[idx] & FLAG_TERRAIN) continue;
          const fall = 1 - d / p.radius;
          const mat = MATERIALS[m];
          const soft = Math.min(1.6, 220 / (mat.hp + 60));
          if (Math.random() < fall * fall * p.shock * 1.5 * soft) {
            destroyed.push(x, y, z, m);
            W.blocks[idx] = 0; W.hp[idx] = 0; W.flags[idx] = 0; W.solidCount--;
            W.markDirty(x, y, z);
          } else {
            W.damage(x, y, z, mat.hp * fall * p.shock * 0.85);
          }
        }
    if (destroyed.length) {
      // импульс внутрь — обломки сначала стягивает к центру
      this.spawnDestructionFX(destroyed, center, {
        radius: p.radius, impulse: -13, damageRate: 1,
      });
      this.structural.requestAnalysis();
      this.destroyedTotal += destroyed.length / 4;
    }
    return { count: destroyed.length / 4 };
  }

  /** Разрушить один блок «вручную» (например, крышка сундука). */
  breakBlock(x, y, z, dirX = 0, dirY = 1, dirZ = 0, force = 6) {
    const m = this.world.get(x, y, z);
    if (!m) return false;
    this.world.clear(x, y, z);
    const mat = MATERIALS[m];
    this.debris.spawnDebris(x + 0.5, y + 0.5, z + 0.5, m, mat.debrisScale * 0.55,
      dirX * force + (Math.random() - .5) * 2,
      dirY * force + 2 + Math.random() * 2,
      dirZ * force + (Math.random() - .5) * 2, 10);
    if (this.fx) this.fx.blockBurst(x + .5, y + .5, z + .5, m, _v.set(dirX, dirY, dirZ), 0.8);
    this.structural.requestAnalysis();
    if (this.onBlockDestroyed) this.onBlockDestroyed(x, y, z, m);
    return true;
  }

  /* --------------------------------------------------------------- */
  /* Вторичные разрушения: падающий кусок ломает то, во что врезался   */
  /* --------------------------------------------------------------- */
  worldImpact(body, vx, vy, vz, speed, normal) {
    const W = this.world;
    const energy = 0.5 * body.mass * speed * speed;
    if (energy < 24) {
      if (this.audio && speed > 3) this.audio.material(MATERIALS[body.mat].sound, body.pos, Math.min(0.55, speed / 22));
      return;
    }

    const dmg = energy * 0.62;
    const radius = body.kind === 'cluster' ? 1.55 : 0.8;
    const r = Math.ceil(radius);
    const destroyed = [];
    for (let y = vy - r; y <= vy + r; y++)
      for (let z = vz - r; z <= vz + r; z++)
        for (let x = vx - r; x <= vx + r; x++) {
          const d = Math.hypot(x - vx, y - vy, z - vz);
          if (d > radius + 0.4) continue;
          const idx = W.idx(x, y, z);
          if (idx < 0 || !W.blocks[idx]) continue;
          if (W.flags[idx] & FLAG_TERRAIN) continue;
          const m = W.blocks[idx];
          const local = dmg * (1 - d / (radius + 1)) * 0.55;
          if (W.damage(x, y, z, local) === 2) {
            destroyed.push(x, y, z, m);
            W.blocks[idx] = 0; W.hp[idx] = 0; W.flags[idx] = 0; W.solidCount--;
            W.markDirty(x, y, z);
          }
        }

    if (destroyed.length) {
      _v2.set(vx + 0.5, vy + 0.5, vz + 0.5);
      this.spawnDestructionFX(destroyed, _v2, {
        radius: 3, impulse: Math.min(16, speed * 0.9), damageRate: 1,
      });
      this.structural.requestAnalysis();
    }

    if (this.audio) {
      this.audio.material(MATERIALS[body.mat].sound, body.pos, Math.min(1, speed / 14));
      if (body.kind === 'cluster' && speed > 6) this.audio.heavyImpact(body.pos, Math.min(1, speed / 18));
    }
    if (this.fx) {
      const amt = body.kind === 'cluster'
        ? Math.min(this.quality.dustOnCollapse, 6 + body.nv * 0.6)
        : 3;
      this.fx.dustBurst(body.pos.x, body.pos.y - body.half.y * 0.6, body.pos.z,
        amt, MATERIALS[body.mat].color, Math.min(3.4, 0.9 + speed * 0.09));
    }

    // сильный удар разваливает кусок стены
    if (body.kind === 'cluster' && speed > 7.5 && body.nv > 5) {
      if (Math.random() < Math.min(0.85, (speed - 7) / 9)) {
        this.debris.shatterCluster(body, speed);
      }
    }
  }

  /* --------------------------------------------------------------- */
  /* Обрушение                                                        */
  /* --------------------------------------------------------------- */
  update(dt) {
    // отложенные обрывы перегруженных консолей
    for (let i = this.pendingStress.length - 1; i >= 0; i--) {
      const p = this.pendingStress[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.pendingStress.splice(i, 1);
        this.cutGroup(p.group, true);
      }
    }

    this.analysisCooldown -= dt;
    if (this.structural.needsAnalysis && this.analysisCooldown <= 0) {
      this.analysisCooldown = 0.05;
      const res = this.structural.analyze();
      for (const g of res.fall) this.cutGroup(g, false);
      for (const g of res.stress) {
        // помечаем, чтобы не выбрать эту же группу повторно
        for (let i = 0; i < g.length; i += 4) {
          const idx = this.world.idx(g[i], g[i + 1], g[i + 2]);
          if (idx >= 0) this.world.flags[idx] |= FLAG_FALLING;
        }
        this.pendingStress.push({ t: 0.13 + Math.random() * 0.3, group: g });
        if (this.audio) {
          const p = groupCenter(g);
          this.audio.creak(p, Math.min(1, g.length / 240));
        }
      }
    }
  }

  /** Вырезает группу блоков из мира и превращает в падающие кластеры. */
  cutGroup(group, stressed) {
    const W = this.world;
    // проверяем актуальность (блоки могли быть уничтожены за время задержки)
    const live = [];
    for (let i = 0; i < group.length; i += 4) {
      const x = group[i], y = group[i + 1], z = group[i + 2];
      const idx = W.idx(x, y, z);
      if (idx < 0) continue;
      const m = W.blocks[idx];
      if (!m) continue;
      if (W.flags[idx] & FLAG_TERRAIN) continue;
      live.push(x, y, z, m);
    }
    if (live.length < 4) return;
    const n = live.length / 4;

    const center = groupCenter(live);
    const pieces = splitGroup(live, 64, 4);

    let made = 0;
    for (const piece of pieces) {
      // убираем из мира
      for (let i = 0; i < piece.length; i += 4) {
        W.clear(piece[i], piece[i + 1], piece[i + 2]);
      }
      const pc = groupCenter(piece);
      const vel = new THREE.Vector3(
        (pc.x - center.x) * 0.34 + (Math.random() - 0.5) * 0.7,
        -0.5 - Math.random() * 0.4,
        (pc.z - center.z) * 0.34 + (Math.random() - 0.5) * 0.7);
      const ang = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.0, (Math.random() - 0.5) * 1.5);
      const b = this.debris.spawnCluster(piece, vel, ang, 0);
      if (b) made++;
    }

    if (n >= 6) {
      const bonus = Math.min(900, 250 + n * 4);
      this.score += bonus;
      if (this.onScore) this.onScore(bonus, 'collapse', center);
      if (this.onCollapse) this.onCollapse(n, center);
      if (this.audio) this.audio.collapse(center, Math.min(1, n / 90));
      if (this.fx) {
        this.fx.dustBurst(center.x, center.y - 0.6, center.z,
          Math.min(this.quality.dustOnCollapse, 8 + n * 0.35), 0x9a8d78, 1.6 + Math.min(3, n * 0.05));
      }
    }
    this.structural.requestAnalysis();
  }
}

function groupCenter(g) {
  let x = 0, y = 0, z = 0;
  const n = g.length / 4;
  for (let i = 0; i < n; i++) { x += g[i * 4]; y += g[i * 4 + 1]; z += g[i * 4 + 2]; }
  return new THREE.Vector3(x / n + 0.5, y / n + 0.5, z / n + 0.5);
}
