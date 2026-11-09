/**
 * Воксельный мир уровня.
 * Хранит материал, текущую прочность и флаги каждого блока,
 * рисует его чанками (объединённая геометрия, минимум draw call'ов)
 * и умеет быстро отвечать на запросы столкновений и трассировки луча.
 */
import * as THREE from 'three';
import { MATERIALS, MAT } from './Materials.js';
import { buildGeometry, makeBlockMaterials } from './Mesher.js';

const CH = 16;

export const FLAG_TERRAIN = 1;   // фундамент/земля — всегда «на земле»
export const FLAG_STATIC = 2;   // не участвует в обрушении (декор границы)

export class VoxelWorld {
  constructor(sx, sy, sz, atlas) {
    this.sx = sx; this.sy = sy; this.sz = sz;
    this.atlas = atlas;
    this.n = sx * sy * sz;
    this.blocks = new Uint8Array(this.n);
    this.hp = new Uint16Array(this.n);
    this.flags = new Uint8Array(this.n);

    this.mats = makeBlockMaterials(atlas);
    this.group = new THREE.Group();
    this.group.name = 'voxelworld';

    this.ncx = Math.ceil(sx / CH); this.ncy = Math.ceil(sy / CH); this.ncz = Math.ceil(sz / CH);
    this.chunks = [];
    for (let cy = 0; cy < this.ncy; cy++)
      for (let cz = 0; cz < this.ncz; cz++)
        for (let cx = 0; cx < this.ncx; cx++) {
          this.chunks.push({
            cx, cy, cz,
            x0: cx * CH, y0: cy * CH, z0: cz * CH,
            x1: Math.min(cx * CH + CH - 1, sx - 1),
            y1: Math.min(cy * CH + CH - 1, sy - 1),
            z1: Math.min(cz * CH + CH - 1, sz - 1),
            meshO: null, meshT: null, dirty: false, empty: true,
          });
        }
    this.dirtyList = [];
    this.solidCount = 0;

    this._get = (x, y, z) => this.get(x, y, z);
    this._dmg = (x, y, z) => {
      const i = this.idx(x, y, z);
      if (i < 0) return 0;
      const m = this.blocks[i];
      if (!m) return 0;
      const max = MATERIALS[m].hp;
      if (max > 9000) return 0;
      return 1 - Math.min(1, this.hp[i] / max);
    };
  }

  /* ------------------------------------------------------------ */
  idx(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return -1;
    return (y * this.sz + z) * this.sx + x;
  }
  inside(x, y, z) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }
  get(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return 0;
    return this.blocks[(y * this.sz + z) * this.sx + x];
  }
  isSolidAt(x, y, z) {
    const m = this.get(x, y, z);
    return m !== 0 && MATERIALS[m].solid;
  }
  /** Плотный (непрозрачный) блок — для коллизий игрока стекло тоже плотное. */
  blocksMovement(x, y, z) {
    return this.get(x, y, z) !== 0;
  }

  set(x, y, z, mat, flags = 0) {
    const i = this.idx(x, y, z);
    if (i < 0) return;
    const was = this.blocks[i];
    this.blocks[i] = mat;
    this.hp[i] = mat ? Math.min(65535, MATERIALS[mat].hp) : 0;
    this.flags[i] = flags;
    if (was === 0 && mat !== 0) this.solidCount++;
    else if (was !== 0 && mat === 0) this.solidCount--;
    this.markDirty(x, y, z);
  }

  fillFlag(x, y, z, flag) {
    const i = this.idx(x, y, z);
    if (i >= 0) this.flags[i] |= flag;
  }

  /** Убрать блок без спецэффектов. Возвращает id материала. */
  clear(x, y, z) {
    const i = this.idx(x, y, z);
    if (i < 0) return 0;
    const m = this.blocks[i];
    if (!m) return 0;
    this.blocks[i] = 0; this.hp[i] = 0; this.flags[i] = 0;
    this.solidCount--;
    this.markDirty(x, y, z);
    return m;
  }

  /**
   * Нанести урон блоку.
   * @returns 0 — нет блока, 1 — повреждён, 2 — разрушен
   */
  damage(x, y, z, amount) {
    const i = this.idx(x, y, z);
    if (i < 0) return 0;
    const m = this.blocks[i];
    if (!m) return 0;
    const mat = MATERIALS[m];
    if (mat.indestructible) return 0;
    const before = this.hp[i];
    const nv = before - amount;
    if (nv <= 0) { this.hp[i] = 0; return 2; }
    this.hp[i] = nv;
    // перерисовываем только при переходе через четверть прочности
    const q0 = Math.floor((before / mat.hp) * 4), q1 = Math.floor((nv / mat.hp) * 4);
    if (q0 !== q1) this.markDirty(x, y, z);
    return 1;
  }

  /* ------------------------------------------------------------ */
  chunkIndex(x, y, z) {
    const cx = (x / CH) | 0, cy = (y / CH) | 0, cz = (z / CH) | 0;
    return (cy * this.ncz + cz) * this.ncx + cx;
  }
  markDirty(x, y, z) {
    this._markChunk(x, y, z);
    // соседние чанки, если блок на границе
    if (x % CH === 0) this._markChunk(x - 1, y, z);
    if (x % CH === CH - 1) this._markChunk(x + 1, y, z);
    if (y % CH === 0) this._markChunk(x, y - 1, z);
    if (y % CH === CH - 1) this._markChunk(x, y + 1, z);
    if (z % CH === 0) this._markChunk(x, y, z - 1);
    if (z % CH === CH - 1) this._markChunk(x, y, z + 1);
  }
  _markChunk(x, y, z) {
    if (!this.inside(x, y, z)) return;
    const ci = this.chunkIndex(x, y, z);
    const c = this.chunks[ci];
    if (c && !c.dirty) { c.dirty = true; this.dirtyList.push(ci); }
  }

  /** Перестроить все грязные чанки (или ограниченное число). */
  flush(maxChunks = Infinity) {
    let done = 0;
    while (this.dirtyList.length && done < maxChunks) {
      const ci = this.dirtyList.shift();
      const c = this.chunks[ci];
      if (!c || !c.dirty) continue;
      c.dirty = false;
      this.rebuildChunk(c);
      done++;
    }
    return this.dirtyList.length;
  }
  get pendingChunks() { return this.dirtyList.length; }

  rebuildChunk(c) {
    const bounds = { x0: c.x0, y0: c.y0, z0: c.z0, x1: c.x1, y1: c.y1, z1: c.z1 };
    for (const key of ['meshO', 'meshT']) {
      const m = c[key];
      if (m) { this.group.remove(m); m.geometry.dispose(); c[key] = null; }
    }
    const go = buildGeometry(this._get, bounds, this.atlas, 0, null, this._dmg);
    if (go) {
      const mesh = new THREE.Mesh(go, this.mats.opaque);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      c.meshO = mesh; this.group.add(mesh);
    }
    const gt = buildGeometry(this._get, bounds, this.atlas, 1, null, this._dmg);
    if (gt) {
      const mesh = new THREE.Mesh(gt, this.mats.transparent);
      mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      c.meshT = mesh; this.group.add(mesh);
    }
    c.empty = !go && !gt;
  }

  rebuildAll() {
    for (const c of this.chunks) { c.dirty = false; this.rebuildChunk(c); }
    this.dirtyList.length = 0;
  }

  dispose() {
    for (const c of this.chunks) {
      for (const key of ['meshO', 'meshT']) {
        const m = c[key];
        if (m) { this.group.remove(m); m.geometry.dispose(); c[key] = null; }
      }
    }
    this.mats.opaque.dispose();
    this.mats.transparent.dispose();
  }

  /* ------------------------------------------------------------ */
  /* Трассировка луча по сетке (Amanatides & Woo)                  */
  /* ------------------------------------------------------------ */
  /**
   * @returns {null|{x,y,z,nx,ny,nz,dist,mat}}
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
    const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
    const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);
    let tMaxX = dx === 0 ? Infinity : ((dx > 0 ? (x + 1 - ox) : (ox - x)) / Math.abs(dx));
    let tMaxY = dy === 0 ? Infinity : ((dy > 0 ? (y + 1 - oy) : (oy - y)) / Math.abs(dy));
    let tMaxZ = dz === 0 ? Infinity : ((dz > 0 ? (z + 1 - oz) : (oz - z)) / Math.abs(dz));
    let nx = 0, ny = 0, nz = 0;
    let t = 0;

    // если стартовая точка уже внутри блока
    const m0 = this.get(x, y, z);
    if (m0) return { x, y, z, nx: 0, ny: 1, nz: 0, dist: 0, mat: m0 };

    for (let i = 0; i < 512; i++) {
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0; }
        else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ; }
      } else {
        if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0; }
        else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ; }
      }
      if (t > maxDist) return null;
      if (y < -1 || y > this.sy + 2) return null;
      const m = this.get(x, y, z);
      if (m) return { x, y, z, nx, ny, nz, dist: t, mat: m };
    }
    return null;
  }

  /** Первый непустой блок под точкой (для спавна). */
  groundAt(x, z, fromY) {
    for (let y = Math.min(fromY, this.sy - 1); y >= 0; y--) {
      if (this.get(x, y, z)) return y;
    }
    return -1;
  }

  /** Пересекает ли AABB какой-либо блок. */
  boxHitsSolid(minx, miny, minz, maxx, maxy, maxz) {
    const x0 = Math.floor(minx), x1 = Math.floor(maxx - 1e-6);
    const y0 = Math.floor(miny), y1 = Math.floor(maxy - 1e-6);
    const z0 = Math.floor(minz), z1 = Math.floor(maxz - 1e-6);
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++)
          if (this.get(x, y, z)) return true;
    return false;
  }

  /** Собрать все занятые координаты внутри прямоугольника. */
  collect(x0, y0, z0, x1, y1, z1, out = []) {
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++)
          if (this.get(x, y, z)) out.push(x, y, z);
    return out;
  }
}

export { CH as CHUNK_SIZE, MAT };
