/**
 * Структурная физика.
 *
 * Считает для каждого блока «вылет консоли» — минимальное число ГОРИЗОНТАЛЬНЫХ
 * шагов до колонны, стоящей на земле (вертикальные связи бесплатны).
 * Это дешёвый, но убедительный аналог расчёта нагрузки:
 *
 *   depth = 0        — блок стоит на фундаменте (или на том, кто стоит);
 *   depth = ∞        — часть здания вообще ни с чем не связана → падает сразу;
 *   depth > span(материала) — перегруженная консоль → отламывается с задержкой,
 *                            что даёт эффект «дом сначала стоит, потом обрушивается».
 *
 * Алгоритм — 0-1 BFS (двусторонняя очередь), запускается только по событию
 * разрушения, не каждый кадр.
 */
import { MATERIALS } from '../world/Materials.js';
import { FLAG_TERRAIN } from '../world/VoxelWorld.js';

export const FLAG_FALLING = 4;
const INF = 65535;

export class StructuralSystem {
  constructor(world) {
    this.world = world;
    this.depth = new Uint16Array(world.n);
    this.bufA = new Int32Array(world.n);
    this.bufB = new Int32Array(world.n);
    this.stack = new Int32Array(world.n);
    this.mark = new Uint8Array(world.n);
    this.needsAnalysis = false;
    this.lastGroups = 0;
  }

  requestAnalysis() { this.needsAnalysis = true; }

  /**
   * @returns {{fall: Array<Array<number>>, stress: Array<Array<number>>}}
   * Каждая группа — плоский массив [x,y,z,mat, ...]
   */
  analyze() {
    this.needsAnalysis = false;
    const W = this.world;
    const sx = W.sx, sy = W.sy, sz = W.sz;
    const blocks = W.blocks, flags = W.flags;
    const depth = this.depth;
    depth.fill(INF);

    const stepY = sz * sx;
    let cur = this.bufA, next = this.bufB;
    const stack = this.stack;
    let curN = 0;

    // --- посевы: земля и фундамент ---
    for (let i = 0; i < W.n; i++) {
      if (!blocks[i]) continue;
      const y = (i / stepY) | 0;
      if ((flags[i] & FLAG_TERRAIN) || y === 0) {
        if (depth[i] !== 0) { depth[i] = 0; cur[curN++] = i; }
      }
    }

    // --- послойный BFS: вертикальные связи бесплатны, горизонтальные +1 ---
    let level = 0;
    while (curN > 0 && level < INF - 1) {
      let nextN = 0;
      let sn = 0;
      for (let k = 0; k < curN; k++) {
        const i = cur[k];
        if (depth[i] === level) stack[sn++] = i;
      }
      while (sn > 0) {
        const i = stack[--sn];
        const x = i % sx;
        const y = (i / stepY) | 0;
        const z = ((i - y * stepY) / sx) | 0;
        // вертикаль — тот же уровень
        if (y > 0) { const j = i - stepY; if (blocks[j] && depth[j] > level) { depth[j] = level; if (sn < stack.length) stack[sn++] = j; } }
        if (y < sy - 1) { const j = i + stepY; if (blocks[j] && depth[j] > level) { depth[j] = level; if (sn < stack.length) stack[sn++] = j; } }
        // горизонталь — следующий уровень
        const d1 = level + 1;
        if (x > 0) { const j = i - 1; if (blocks[j] && depth[j] > d1) { depth[j] = d1; if (nextN < next.length) next[nextN++] = j; } }
        if (x < sx - 1) { const j = i + 1; if (blocks[j] && depth[j] > d1) { depth[j] = d1; if (nextN < next.length) next[nextN++] = j; } }
        if (z > 0) { const j = i - sx; if (blocks[j] && depth[j] > d1) { depth[j] = d1; if (nextN < next.length) next[nextN++] = j; } }
        if (z < sz - 1) { const j = i + sx; if (blocks[j] && depth[j] > d1) { depth[j] = d1; if (nextN < next.length) next[nextN++] = j; } }
      }
      const t = cur; cur = next; next = t;
      curN = nextN;
      level++;
    }

    // --- ищем то, что должно упасть ---
    const mark = this.mark;
    mark.fill(0);
    let anyFall = false, anyStress = false;
    for (let i = 0; i < W.n; i++) {
      const m = blocks[i];
      if (!m) continue;
      if (MATERIALS[m].indestructible) continue;
      if (flags[i] & FLAG_TERRAIN) continue;
      const d = depth[i];
      if (d === INF) { mark[i] = 1; anyFall = true; }
      else if (d > MATERIALS[m].span && !(flags[i] & FLAG_FALLING)) { mark[i] = 2; anyStress = true; }
    }

    const res = { fall: [], stress: [] };
    if (anyFall) res.fall = this._components(mark, 1);
    if (anyStress) res.stress = this._components(mark, 2);
    this.lastGroups = res.fall.length + res.stress.length;
    return res;
  }

  /** Компоненты связности среди помеченных значением `val`. */
  _components(mark, val) {
    const W = this.world;
    const sx = W.sx, sy = W.sy, sz = W.sz, blocks = W.blocks;
    const stepY = sz * sx;
    const groups = [];
    const stack = [];
    for (let i = 0; i < W.n; i++) {
      if (mark[i] !== val) continue;
      const g = [];
      stack.length = 0;
      stack.push(i);
      mark[i] = 200 + val;
      while (stack.length) {
        const k = stack.pop();
        const x = k % sx;
        const y = (k / stepY) | 0;
        const z = ((k - y * stepY) / sx) | 0;
        g.push(x, y, z, blocks[k]);
        if (x > 0 && mark[k - 1] === val) { mark[k - 1] = 200 + val; stack.push(k - 1); }
        if (x < sx - 1 && mark[k + 1] === val) { mark[k + 1] = 200 + val; stack.push(k + 1); }
        if (z > 0 && mark[k - sx] === val) { mark[k - sx] = 200 + val; stack.push(k - sx); }
        if (z < sz - 1 && mark[k + sx] === val) { mark[k + sx] = 200 + val; stack.push(k + sx); }
        if (y > 0 && mark[k - stepY] === val) { mark[k - stepY] = 200 + val; stack.push(k - stepY); }
        if (y < sy - 1 && mark[k + stepY] === val) { mark[k + stepY] = 200 + val; stack.push(k + stepY); }
      }
      if (g.length) groups.push(g);
    }
    return groups;
  }
}

/**
 * Делит большую группу на куски приемлемого размера,
 * чтобы одно тело не было гигантским (и чтобы обвал красиво распадался).
 */
export function splitGroup(group, maxVox, maxSpan) {
  const n = group.length / 4;
  if (n <= maxVox) return [group];
  // делим по сетке
  let x0 = Infinity, y0 = Infinity, z0 = Infinity;
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, group[i * 4]);
    y0 = Math.min(y0, group[i * 4 + 1]);
    z0 = Math.min(z0, group[i * 4 + 2]);
  }
  const cell = Math.max(2, maxSpan);
  const map = new Map();
  for (let i = 0; i < n; i++) {
    const x = group[i * 4], y = group[i * 4 + 1], z = group[i * 4 + 2];
    const kx = ((x - x0) / cell) | 0, ky = ((y - y0) / cell) | 0, kz = ((z - z0) / cell) | 0;
    const key = kx * 65536 + ky * 256 + kz;
    let arr = map.get(key);
    if (!arr) { arr = []; map.set(key, arr); }
    arr.push(x, y, z, group[i * 4 + 3]);
  }
  return [...map.values()];
}
