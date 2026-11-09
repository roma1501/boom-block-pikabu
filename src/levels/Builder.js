/**
 * Конструктор уровней.
 * Набор примитивов (коробки, стены, крыши, колонны, лестницы, арки) и
 * несколько генераторов типовых построек, из которых собираются уровни.
 * Всё в воксельных координатах: 1 блок = 1 метр, глаза игрока на 1.58.
 */
import * as THREE from 'three';
import { MAT } from '../world/Materials.js';
import { FLAG_TERRAIN } from '../world/VoxelWorld.js';

export class Builder {
  constructor(world) {
    this.w = world;
    this.terrainMode = false;
    this.crystals = [];
    this.chests = [];
    this.spawnPos = new THREE.Vector3(10, 8, 10);
    this.spawnYaw = 0;
    this.buildingCenter = new THREE.Vector3(0, 0, 0);
    this.groundY = 5;
  }

  /* ---------------- базовые ---------------- */
  set(x, y, z, m) {
    if (m === undefined || m === null) return;
    x |= 0; y |= 0; z |= 0;
    if (!this.w.inside(x, y, z)) return;
    this.w.set(x, y, z, m, this.terrainMode ? FLAG_TERRAIN : 0);
  }
  get(x, y, z) { return this.w.get(x, y, z); }

  box(x0, y0, z0, x1, y1, z1, m) {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) this.set(x, y, z, m);
    return this;
  }
  clear(x0, y0, z0, x1, y1, z1) { return this.box(x0, y0, z0, x1, y1, z1, 0); }

  /** Полая коробка: только стены (без пола и потолка, если указано). */
  shell(x0, y0, z0, x1, y1, z1, m, opt = {}) {
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const edge = (x === x0 || x === x1 || z === z0 || z === z1);
          const cap = (y === y0 && opt.floor) || (y === y1 && opt.ceiling);
          if (edge || cap) this.set(x, y, z, m);
        }
    return this;
  }

  pillar(x, z, y0, y1, m) { return this.box(x, y0, z, x, y1, z, m); }

  /** Двускатная крыша. dir: 'x' — конёк вдоль X, 'z' — вдоль Z. */
  gable(x0, z0, x1, z1, y, m, dir = 'x', overhang = 1, solid = false) {
    x0 -= overhang; x1 += overhang; z0 -= overhang; z1 += overhang;
    if (dir === 'x') {
      const half = Math.floor((z1 - z0) / 2);
      for (let k = 0; k <= half; k++) {
        const yy = y + k;
        for (let x = x0; x <= x1; x++) {
          this.set(x, yy, z0 + k, m);
          this.set(x, yy, z1 - k, m);
          if (solid) for (let z = z0 + k; z <= z1 - k; z++) this.set(x, yy, z, m);
        }
      }
    } else {
      const half = Math.floor((x1 - x0) / 2);
      for (let k = 0; k <= half; k++) {
        const yy = y + k;
        for (let z = z0; z <= z1; z++) {
          this.set(x0 + k, yy, z, m);
          this.set(x1 - k, yy, z, m);
          if (solid) for (let x = x0 + k; x <= x1 - k; x++) this.set(x, yy, z, m);
        }
      }
    }
    return this;
  }

  /** Четырёхскатная (пирамидальная) крыша. */
  pyramid(x0, z0, x1, z1, y, m, overhang = 1) {
    x0 -= overhang; x1 += overhang; z0 -= overhang; z1 += overhang;
    let k = 0;
    while (x0 + k <= x1 - k && z0 + k <= z1 - k) {
      for (let x = x0 + k; x <= x1 - k; x++) {
        this.set(x, y + k, z0 + k, m);
        this.set(x, y + k, z1 - k, m);
      }
      for (let z = z0 + k; z <= z1 - k; z++) {
        this.set(x0 + k, y + k, z, m);
        this.set(x1 - k, y + k, z, m);
      }
      k++;
    }
    return this;
  }

  /** Круглая башня / силос. */
  cylinder(cx, cz, r, y0, y1, m, hollow = true, thickness = 1) {
    for (let y = y0; y <= y1; y++)
      for (let z = -r; z <= r; z++)
        for (let x = -r; x <= r; x++) {
          const d = Math.sqrt(x * x + z * z);
          if (d > r + 0.35) continue;
          if (hollow && d < r - thickness + 0.15) continue;
          this.set(cx + x, y, cz + z, m);
        }
    return this;
  }

  dome(cx, cz, r, y0, m) {
    for (let y = 0; y <= r; y++) {
      const rr = Math.sqrt(Math.max(0, r * r - y * y));
      for (let z = -r; z <= r; z++)
        for (let x = -r; x <= r; x++) {
          const d = Math.sqrt(x * x + z * z);
          if (d <= rr + 0.4 && d >= rr - 0.7) this.set(cx + x, y0 + y, cz + z, m);
        }
    }
    return this;
  }

  /** Лестница вдоль оси. */
  stairs(x, y, z, steps, dir, m, width = 1) {
    for (let i = 0; i < steps; i++) {
      for (let w = 0; w < width; w++) {
        if (dir === '+z') this.box(x + w, y, z + i, x + w, y + i, z + i, m);
        else if (dir === '-z') this.box(x + w, y, z - i, x + w, y + i, z - i, m);
        else if (dir === '+x') this.box(x + i, y, z + w, x + i, y + i, z + w, m);
        else this.box(x - i, y, z + w, x - i, y + i, z + w, m);
      }
    }
    return this;
  }

  /** Арка (для мостов и ворот). */
  arch(cx, y0, z0, z1, r, m) {
    for (let z = z0; z <= z1; z++)
      for (let a = 0; a <= 90; a += 3) {
        const rad = a * Math.PI / 180;
        const dx = Math.round(Math.cos(rad) * r);
        const dy = Math.round(Math.sin(rad) * r);
        this.set(cx + dx, y0 + dy, z, m);
        this.set(cx - dx, y0 + dy, z, m);
      }
    return this;
  }

  /** Дверной проём. */
  door(x, y, z, dirX, dirZ, h = 2, w = 1) {
    for (let i = 0; i < h; i++)
      for (let j = 0; j < w; j++)
        this.set(x + (dirZ ? j : 0), y + i, z + (dirX ? j : 0), 0);
    return this;
  }

  /** Ряд окон в стене. */
  windows(x0, y, z0, x1, z1, m = MAT.GLASS, step = 3, h = 2) {
    if (x0 === x1) {
      for (let z = z0 + 1; z <= z1 - 1; z += step)
        for (let i = 0; i < h; i++) this.set(x0, y + i, z, m);
    } else {
      for (let x = x0 + 1; x <= x1 - 1; x += step)
        for (let i = 0; i < h; i++) this.set(x, y + i, z0, m);
    }
    return this;
  }

  /* ---------------- окружение ---------------- */

  /**
   * Воксельный остров: трава сверху, земля, камень, сужающийся к низу.
   */
  island(cx, cz, hx, hz, topY, style = 'grass') {
    this.terrainMode = true;
    this.groundY = topY;
    const top = style === 'sand' ? MAT.SAND : style === 'stone' ? MAT.STONE : MAT.GRASS;
    const mid = style === 'sand' ? MAT.SAND : MAT.DIRT;
    const layers = 9;
    for (let li = 0; li < layers; li++) {
      const y = topY - li;
      if (y < 0) break;
      const shrink = li < 3 ? 0 : Math.floor((li - 2) * 0.85);
      const rx = hx - shrink, rz = hz - shrink;
      if (rx < 1 || rz < 1) break;
      let m = li === 0 ? top : (li < 3 ? mid : MAT.STONE);
      if (li >= layers - 2) m = MAT.BEDROCK;
      for (let z = -rz; z <= rz; z++)
        for (let x = -rx; x <= rx; x++) {
          // скруглённый прямоугольник + лёгкая неровность края
          const ex = Math.max(0, Math.abs(x) - (rx - 3));
          const ez = Math.max(0, Math.abs(z) - (rz - 3));
          if (ex * ex + ez * ez > 9) continue;
          const n = hash3(x + cx, y, z + cz);
          if (li === 0 && ex + ez > 2 && n < 0.18) continue;
          this.set(cx + x, y, cz + z, m);
        }
    }
    this.terrainMode = false;
    return this;
  }

  tree(x, z, y, h = 5, leafMat = MAT.LEAVES) {
    this.box(x, y, z, x, y + h - 1, z, MAT.LOG);
    const r = 2;
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.abs(dx) + Math.abs(dz) + Math.abs(dy) * 1.4;
          if (d > r + 1.2) continue;
          if (dx === 0 && dz === 0 && dy < 1) continue;
          this.set(x + dx, y + h - 1 + dy, z + dz, leafMat);
        }
    this.set(x, y + h, z, leafMat);
    return this;
  }

  fence(x0, z0, x1, z1, y, m = MAT.PLANKS) {
    if (x0 === x1) for (let z = z0; z <= z1; z++) { this.set(x0, y, z, m); if (z % 3 === 0) this.set(x0, y + 1, z, m); }
    else for (let x = x0; x <= x1; x++) { this.set(x, y, z0, m); if (x % 3 === 0) this.set(x, y + 1, z0, m); }
    return this;
  }

  crates(x, y, z, n = 3) {
    for (let i = 0; i < n; i++) {
      this.set(x + (i % 2), y + Math.floor(i / 2), z + ((i >> 1) % 2), MAT.CRATE);
    }
    return this;
  }

  /* ---------------- цели ---------------- */
  crystal(x, y, z) { this.crystals.push([x, y, z]); return this; }
  chest(x, y, z, n = 1) {
    this.set(x, y, z, MAT.CHEST);
    this.chests.push([x, y, z, n]);
    return this;
  }
  spawn(x, y, z, yaw = 0) { this.spawnPos.set(x + 0.5, y, z + 0.5); this.spawnYaw = yaw; return this; }
  center(x, y, z) { this.buildingCenter.set(x, y, z); return this; }

  /* ================================================================= */
  /* Готовые постройки                                                 */
  /* ================================================================= */

  /** Простая изба: сруб, крыша, дверь, окно. */
  cabin(x, z, w, d, h, y, o = {}) {
    const wall = o.wall ?? MAT.LOG;
    const roof = o.roof ?? MAT.THATCH;
    const flo = o.floor ?? MAT.PLANKS;
    const x1 = x + w - 1, z1 = z + d - 1;
    this.box(x, y - 1, z, x1, y - 1, z1, flo);
    this.shell(x, y, z, x1, y + h - 1, z1, wall);
    // углы — бревно
    for (const [cx, cz] of [[x, z], [x1, z], [x, z1], [x1, z1]]) this.box(cx, y, cz, cx, y + h - 1, cz, MAT.LOG);
    this.gable(x, z, x1, z1, y + h, roof, w >= d ? 'x' : 'z', 1, true);
    // дверь по центру передней стены
    const dx = x + Math.floor(w / 2);
    this.door(dx, y, z, 1, 0, 2, 1);
    this.set(dx, y + 2, z, wall);
    // окна
    if (w > 4) {
      this.set(x + 1, y + 1, z, MAT.GLASS);
      this.set(x1 - 1, y + 1, z, MAT.GLASS);
    }
    if (d > 4) {
      this.set(x, y + 1, z + 1, MAT.GLASS);
      this.set(x1, y + 1, z1 - 1, MAT.GLASS);
    }
    return this;
  }

  /** Дом с этажами: каркас из брёвен, стены, перекрытия, крыша. */
  house(x, z, w, d, floors, y, o = {}) {
    const wall = o.wall ?? MAT.PLANKS;
    const frame = o.frame ?? MAT.LOG;
    const flo = o.floor ?? MAT.PLANKS_DARK;
    const roof = o.roof ?? MAT.SLATE;
    const fh = o.floorHeight ?? 4;
    const x1 = x + w - 1, z1 = z + d - 1;

    for (let f = 0; f < floors; f++) {
      const y0 = y + f * fh;
      this.box(x, y0 - 1, z, x1, y0 - 1, z1, flo);
      this.shell(x, y0, z, x1, y0 + fh - 2, z1, wall);
      for (const [cx, cz] of [[x, z], [x1, z], [x, z1], [x1, z1]])
        this.box(cx, y0, cz, cx, y0 + fh - 2, cz, frame);
      // окна
      for (let i = 2; i < w - 1; i += 3) {
        this.set(x + i, y0 + 1, z, MAT.GLASS); this.set(x + i, y0 + 2, z, MAT.GLASS);
        this.set(x + i, y0 + 1, z1, MAT.GLASS); this.set(x + i, y0 + 2, z1, MAT.GLASS);
      }
      for (let i = 2; i < d - 1; i += 3) {
        this.set(x, y0 + 1, z + i, MAT.GLASS); this.set(x, y0 + 2, z + i, MAT.GLASS);
        this.set(x1, y0 + 1, z + i, MAT.GLASS); this.set(x1, y0 + 2, z + i, MAT.GLASS);
      }
      // внутренние опоры
      if (w > 7 && d > 7) {
        const mx = x + Math.floor(w / 2), mz = z + Math.floor(d / 2);
        this.box(mx, y0, mz, mx, y0 + fh - 2, mz, frame);
      }
    }
    const topY = y + floors * fh - 1;
    if (o.roofType === 'flat') this.box(x - 1, topY, z - 1, x1 + 1, topY, z1 + 1, roof);
    else if (o.roofType === 'pyramid') this.pyramid(x, z, x1, z1, topY, roof, 1);
    else this.gable(x, z, x1, z1, topY, roof, w >= d ? 'x' : 'z', 1, true);

    // дверь
    const dx = x + Math.floor(w / 2);
    this.door(dx, y, z, 1, 0, 2, o.doorWide ? 2 : 1);
    return this;
  }

  /** Сарай/ангар: длинное здание на колоннах, большие ворота. */
  barn(x, z, w, d, h, y, o = {}) {
    const wall = o.wall ?? MAT.PLANKS_DARK;
    const roof = o.roof ?? MAT.PLANKS;
    const col = o.col ?? MAT.LOG;
    const x1 = x + w - 1, z1 = z + d - 1;
    this.box(x, y - 1, z, x1, y - 1, z1, MAT.PLANKS);
    this.shell(x, y, z, x1, y + h - 1, z1, wall);
    // центральные опоры — их выбивание роняет крышу
    const cols = [];
    for (let cx = x + 3; cx < x1 - 1; cx += Math.max(3, Math.floor(w / 3))) {
      cols.push(cx);
      this.box(cx, y, z + Math.floor(d / 2), cx, y + h - 1, z + Math.floor(d / 2), col);
    }
    this.gable(x, z, x1, z1, y + h, roof, 'x', 1, true);
    // ворота
    const gx = x + Math.floor(w / 2) - 1;
    this.door(gx, y, z, 1, 0, 3, 3);
    return this;
  }

  /** Башня с этажами. */
  tower(x, z, w, floors, y, o = {}) {
    const wall = o.wall ?? MAT.COBBLE;
    const flo = o.floor ?? MAT.PLANKS;
    const fh = o.floorHeight ?? 4;
    const x1 = x + w - 1, z1 = z + w - 1;
    for (let f = 0; f < floors; f++) {
      const y0 = y + f * fh;
      this.shell(x, y0, z, x1, y0 + fh - 1, z1, wall);
      if (f > 0) this.box(x + 1, y0 - 1, z + 1, x1 - 1, y0 - 1, z1 - 1, flo);
      // бойницы
      this.set(x, y0 + 2, z + Math.floor(w / 2), 0);
      this.set(x1, y0 + 2, z + Math.floor(w / 2), 0);
      this.set(x + Math.floor(w / 2), y0 + 2, z, 0);
      this.set(x + Math.floor(w / 2), y0 + 2, z1, 0);
    }
    const top = y + floors * fh;
    // зубцы
    for (let i = 0; i <= x1 - x; i++) {
      if (i % 2 === 0) { this.set(x + i, top, z, wall); this.set(x + i, top, z1, wall); }
    }
    for (let i = 0; i <= z1 - z; i++) {
      if (i % 2 === 0) { this.set(x, top, z + i, wall); this.set(x1, top, z + i, wall); }
    }
    this.box(x + 1, top - 1, z + 1, x1 - 1, top - 1, z1 - 1, flo);
    this.door(x + Math.floor(w / 2), y, z, 1, 0, 2, 1);
    return this;
  }

  /** Мост между двумя точками с опорами. */
  bridge(x0, x1, z, width, y, o = {}) {
    const deck = o.deck ?? MAT.PLANKS;
    const pill = o.pillar ?? MAT.STONE;
    const z0 = z - Math.floor(width / 2), z1 = z0 + width - 1;
    this.box(x0, y, z0, x1, y, z1, deck);
    // перила
    for (let x = x0; x <= x1; x++) {
      if (x % 2 === 0) { this.set(x, y + 1, z0, MAT.LOG); this.set(x, y + 1, z1, MAT.LOG); }
    }
    this.box(x0, y + 2, z0, x1, y + 2, z0, MAT.LOG);
    this.box(x0, y + 2, z1, x1, y + 2, z1, MAT.LOG);
    // опоры
    const step = o.pillarStep ?? 6;
    for (let x = x0 + step; x < x1; x += step) {
      for (let zz = z0; zz <= z1; zz += width - 1) {
        this.box(x, y - 1, zz, x, y - 8, zz, pill);
        this.box(x + 1, y - 1, zz, x + 1, y - 8, zz, pill);
      }
      this.box(x, y - 1, z0, x + 1, y - 1, z1, pill);
    }
    return this;
  }

  /** Ветряная мельница. */
  windmill(cx, cz, y, o = {}) {
    const wall = o.wall ?? MAT.PLASTER;
    this.cylinder(cx, cz, 4, y, y + 9, wall, true, 1);
    this.cylinder(cx, cz, 3, y + 10, y + 12, wall, true, 1);
    this.box(cx - 2, y + 9, cz - 2, cx + 2, y + 9, cz + 2, MAT.PLANKS);
    this.dome(cx, cz, 4, y + 12, MAT.SLATE);
    // лопасти
    for (let i = -7; i <= 7; i++) {
      this.set(cx + i, y + 13, cz - 5, MAT.PLANKS);
      this.set(cx, y + 13 + i, cz - 5, MAT.PLANKS);
      if (Math.abs(i) > 2) {
        this.set(cx + i, y + 14, cz - 5, MAT.PLANKS);
        this.set(cx + 1, y + 13 + i, cz - 5, MAT.PLANKS);
      }
    }
    this.door(cx, y, cz + 4, 1, 0, 2, 1);
    return this;
  }

  /** Дом на сваях. */
  stiltHouse(x, z, w, d, y, stilt, o = {}) {
    const x1 = x + w - 1, z1 = z + d - 1;
    for (const [px, pz] of [[x, z], [x1, z], [x, z1], [x1, z1],
    [x + Math.floor(w / 2), z], [x + Math.floor(w / 2), z1]]) {
      this.box(px, y, pz, px, y + stilt - 1, pz, MAT.LOG);
    }
    this.house(x, z, w, d, 1, y + stilt, Object.assign({ wall: MAT.PLANKS, roof: MAT.THATCH }, o));
    this.stairs(x + Math.floor(w / 2), y, z - 1, stilt, '-z', MAT.PLANKS, 2);
    return this;
  }

  /** Каменная крепость с внутренним двором. */
  fortress(x, z, w, d, h, y, o = {}) {
    const wall = o.wall ?? MAT.STONE;
    const x1 = x + w - 1, z1 = z + d - 1;
    this.shell(x, y, z, x1, y + h - 1, z1, wall);
    // толщина стен 2
    this.shell(x + 1, y, z + 1, x1 - 1, y + h - 1, z1 - 1, wall);
    // зубцы
    for (let i = 0; i <= w - 1; i += 2) { this.set(x + i, y + h, z, wall); this.set(x + i, y + h, z1, wall); }
    for (let i = 0; i <= d - 1; i += 2) { this.set(x, y + h, z + i, wall); this.set(x1, y + h, z + i, wall); }
    // угловые башни
    for (const [tx, tz] of [[x - 1, z - 1], [x1 - 2, z - 1], [x - 1, z1 - 2], [x1 - 2, z1 - 2]]) {
      this.shell(tx, y, tz, tx + 3, y + h + 2, tz + 3, MAT.COBBLE);
      this.box(tx, y + h + 3, tz, tx + 3, y + h + 3, tz + 3, MAT.SLATE);
    }
    // ворота
    const gx = x + Math.floor(w / 2) - 1;
    this.door(gx, y, z, 1, 0, 3, 3);
    this.door(gx, y, z + 1, 1, 0, 3, 3);
    return this;
  }

  /** Завод: металлический каркас, трубы, ёмкости. */
  factory(x, z, w, d, h, y) {
    const x1 = x + w - 1, z1 = z + d - 1;
    this.box(x, y - 1, z, x1, y - 1, z1, MAT.CONCRETE);
    this.shell(x, y, z, x1, y + h - 1, z1, MAT.METAL);
    for (let i = 2; i < w - 1; i += 4) this.box(x + i, y, z, x + i, y + h - 1, z, MAT.CONCRETE);
    // пилообразная крыша
    for (let i = 0; i < w; i += 4) {
      this.box(x + i, y + h, z, x + i + 2, y + h, z1, MAT.METAL);
      this.box(x + i + 3, y + h + 1, z, x + i + 3, y + h + 1, z1, MAT.GLASS);
    }
    this.box(x - 1, y + h, z - 1, x1 + 1, y + h, z1 + 1, MAT.METAL);
    // труба
    this.cylinder(x + 2, z + Math.floor(d / 2), 2, y + h, y + h + 9, MAT.BRICK, true, 1);
    this.door(x + Math.floor(w / 2), y, z, 1, 0, 3, 2);
    return this;
  }
}

function hash3(x, y, z) {
  let h = Math.imul(x * 374761393 + y * 668265263 + z * 2147483647, 1274126177);
  h ^= h >>> 15;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

export { MAT };
