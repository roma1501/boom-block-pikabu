/**
 * Пожар.
 *
 * Огонь живёт не «радиусом», а по блокам: каждый горящий блок сам себя
 * доедает и с некоторым шансом поджигает соседние горючие блоки, до которых
 * есть доступ воздуха. Поэтому пламя ползёт по деревянной стене, перекидывается
 * на крышу и может обрушить дом уже после того, как взрыв утих.
 *
 * Камень, бетон и металл не горят и работают противопожарной стеной.
 * Число одновременно горящих блоков ограничено бюджетом качества.
 */
import * as THREE from 'three';
import { MATERIALS, MAT } from '../world/Materials.js';

const TICK = 0.28;
const MAX_GEN = 6;      // сколько раз огонь может перекинуться дальше

/** Насколько охотно горит материал (0 — не горит). */
const BURN = {
  [MAT.THATCH]: 2.4,
  [MAT.LEAVES]: 2.1,
  [MAT.PLANKS]: 1.0,
  [MAT.PLANKS_DARK]: 0.95,
  [MAT.CRATE]: 1.3,
  [MAT.LOG]: 0.65,
  [MAT.CHEST]: 0.3,
};

export class FireManager {
  constructor(world, particles, destruction, audio, quality) {
    this.world = world;
    this.particles = particles;
    this.destruction = destruction;
    this.audio = audio;
    this.quality = quality || { particleBudget: 900 };

    this.burning = new Map();     // индекс блока -> { x, y, z, t, life, dps }
    this.acc = 0;
    this.cursor = 0;
    this.soundT = 0;
    this.maxBurning = 90;
    // Насколько охотно пламя расползается. Дождь и снег сбивают его:
    // в песочнице это ставит погода, по умолчанию — как всегда.
    this.spreadMul = 1;
  }

  setQuality(q) {
    this.quality = q;
    this.maxBurning = q.name === 'low' ? 34 : q.name === 'medium' ? 64 : 110;
  }

  setWorld(w) { this.world = w; this.burning.clear(); }
  clear() { this.burning.clear(); }
  get count() { return this.burning.size; }

  /** Горюч ли блок и есть ли к нему доступ воздуха. */
  _canBurn(x, y, z) {
    const W = this.world;
    const m = W.get(x, y, z);
    if (!m || !BURN[m]) return 0;
    // полностью замурованный блок не загорается
    if (W.get(x, y + 1, z) && W.get(x, y - 1, z) && W.get(x - 1, y, z) &&
      W.get(x + 1, y, z) && W.get(x, y, z - 1) && W.get(x, y, z + 1)) return 0;
    return BURN[m];
  }

  /**
   * gen — «поколение» пламени. Каждый новый очаг от старого получает gen+1
   * и горит слабее; после MAX_GEN огонь перестаёт расползаться и затухает.
   * Это и делает пожар зрелищным, и не даёт ему сожрать весь уровень сам.
   */
  ignite(x, y, z, life, dps, gen = 0) {
    if (gen > MAX_GEN) return false;
    if (this.burning.size >= this.maxBurning) return false;
    const W = this.world;
    if (!W) return false;
    const i = W.idx(x, y, z);
    if (i < 0 || this.burning.has(i)) return false;
    if (!this._canBurn(x, y, z)) return false;
    this.burning.set(i, {
      x, y, z, t: 0, gen,
      life: life * (0.75 + Math.random() * 0.55) * (1 - gen * 0.09),
      dps: dps * (1 - gen * 0.07),
    });
    return true;
  }

  /** Поджечь всё горючее в радиусе (зажигательный заряд, шальная искра). */
  add(x, y, z, radius, duration, dps) {
    if (!this.world) return;
    const r = Math.ceil(radius);
    const cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
    let lit = 0;
    for (let dy = -r; dy <= r; dy++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > radius) continue;
          if (Math.random() > (1 - d / (radius + 1)) * this.spreadMul) continue;
          if (this.ignite(cx + dx, cy + dy, cz + dz, duration, dps)) lit++;
        }
    return lit;
  }

  /* ------------------------------------------------------------- */
  update(dt) {
    if (!this.world || !this.burning.size) return;
    this._draw(dt);

    this.acc += dt;
    if (this.acc < TICK) return;
    const steps = Math.min(3, Math.floor(this.acc / TICK));
    this.acc -= steps * TICK;
    for (let s = 0; s < steps; s++) this._tick();
  }

  _tick() {
    const W = this.world;
    const destroyed = [];
    const toAdd = [];
    const dead = [];

    for (const [i, f] of this.burning) {
      const m = W.blocks[i];
      if (!m || !BURN[m]) { dead.push(i); continue; }

      f.t += TICK;
      const mat = MATERIALS[m];
      const rate = BURN[m];

      if (W.damage(f.x, f.y, f.z, f.dps * TICK * rate) === 2) {
        destroyed.push(f.x, f.y, f.z, m);
        W.blocks[i] = 0; W.hp[i] = 0; W.flags[i] = 0; W.solidCount--;
        W.markDirty(f.x, f.y, f.z);
        dead.push(i);
        // огонь перекидывается туда, куда дотянулся
        this._spread(f, toAdd, this.spreadMul < 0.6 ? 1 : 2);
        continue;
      }

      if (f.t >= f.life) { dead.push(i); continue; }

      // пламя расползается по соседям
      const chance = 0.15 * rate * (1 - f.t / f.life * 0.6) * this.spreadMul;
      if (Math.random() < chance) this._spread(f, toAdd, 1);
    }

    for (const i of dead) this.burning.delete(i);
    for (const a of toAdd) this.ignite(a.x, a.y, a.z, a.life, a.dps, a.gen);

    if (destroyed.length) {
      const c = new THREE.Vector3(
        destroyed[0] + 0.5, destroyed[1] + 0.5, destroyed[2] + 0.5);
      this.destruction.spawnDestructionFX(destroyed, c,
        { radius: 3, impulse: 4, damageRate: 1 });
      this.destruction.structural.requestAnalysis();
    }

    this.soundT -= TICK;
    if (this.soundT <= 0 && this.audio && this.burning.size) {
      this.soundT = 0.7 + Math.random() * 0.8;
      const any = this.burning.values().next().value;
      this.audio.material('wood', { x: any.x, y: any.y, z: any.z },
        Math.min(0.4, 0.12 + this.burning.size * 0.01));
    }
  }

  /** Пытается поджечь до n соседних блоков. */
  _spread(f, out, n) {
    const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    [0, 1, 1], [0, 1, -1], [1, 1, 0], [-1, 1, 0]];   // огонь охотнее идёт вверх
    for (let k = 0; k < n; k++) {
      const d = dirs[(Math.random() * dirs.length) | 0];
      const x = f.x + d[0], y = f.y + d[1], z = f.z + d[2];
      if (this._canBurn(x, y, z)) out.push({ x, y, z, life: f.life * 0.9, dps: f.dps, gen: f.gen + 1 });
    }
  }

  /* ------------------------------------------------------------- */
  /** Пламя рисуем не у всех блоков сразу, а по кругу — экономим частицы. */
  _draw(dt) {
    const P = this.particles;
    if (!P) return;
    const list = [...this.burning.values()];
    if (!list.length) return;
    const perFrame = Math.max(1, Math.min(6, Math.round(this.quality.particleBudget / 320)));
    for (let k = 0; k < perFrame; k++) {
      this.cursor = (this.cursor + 1) % list.length;
      const f = list[this.cursor];
      const s = Math.min(1, 1.4 - f.t / f.life);
      const W = this.world;
      // рисуем над блоком, если сверху воздух, иначе сбоку
      let ox = 0, oy = 1.05, oz = 0;
      if (W.get(f.x, f.y + 1, f.z)) {
        if (!W.get(f.x + 1, f.y, f.z)) { ox = 1.05; oy = 0.5; }
        else if (!W.get(f.x - 1, f.y, f.z)) { ox = -0.05; oy = 0.5; }
        else if (!W.get(f.x, f.y, f.z + 1)) { oz = 1.05; oy = 0.5; }
        else { oz = -0.05; oy = 0.5; }
      }
      const x = f.x + (ox || 0.5), y = f.y + oy, z = f.z + (oz || 0.5);

      P.emit(P.fire, {
        x: x + (Math.random() - 0.5) * 0.6, y, z: z + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * 0.5, vy: 1.5 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 0.5,
        s0: (0.4 + Math.random() * 0.35) * s, s1: 0.08,
        c0: 0xffd070, c1: 0xd02a08,
        o0: 1, o1: 0, oCurve: 1, oScale: 0.6 * s,
        life: 0.45 + Math.random() * 0.45, drag: 1.4, grav: -1.8,
      });
      if (Math.random() < 0.25) {
        P.emit(P.smoke, {
          x, y: y + 0.6, z,
          vx: (Math.random() - 0.5) * 0.4, vy: 1.2, vz: (Math.random() - 0.5) * 0.4,
          s0: 0.5, s1: 1.8, c0: 0x40403e, c1: 0x707070,
          o0: 0, o1: 0, oCurve: 2, oScale: 0.2,
          life: 1.8 + Math.random(), drag: 0.8, grav: 0.4, wind: 1,
        });
      }
      if (Math.random() < 0.08) P.embers(x, y, z, 2, 0.4);
    }
  }
}
