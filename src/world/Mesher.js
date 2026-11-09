/**
 * Построение геометрии из вокселей.
 * Убираются невидимые грани, считается ambient occlusion по соседям,
 * добавляется небольшой разброс яркости на блок — поверхности не выглядят плоскими.
 */
import * as THREE from 'three';
import { MATERIALS } from './Materials.js';
import { isRounded, getBevelSegments, getBevelRadius } from './Style.js';

// ось, знак, ось-U, ось-V, менять ли местами S/T в UV
const FACES = [
  { a: 0, s: 1, u: 1, v: 2, swap: true, tile: 1 },   // +X
  { a: 0, s: -1, u: 2, v: 1, swap: false, tile: 1 },  // -X
  { a: 1, s: 1, u: 2, v: 0, swap: true, tile: 0 },   // +Y (верх)
  { a: 1, s: -1, u: 0, v: 2, swap: false, tile: 2 },  // -Y (низ)
  { a: 2, s: 1, u: 0, v: 1, swap: false, tile: 1 },  // +Z
  { a: 2, s: -1, u: 1, v: 0, swap: true, tile: 1 },  // -Z
];

const AO_LUT = [0.50, 0.68, 0.845, 1.0];

// Скругление в стиле «rounded»: грань поджимается на выпуклых рёбрах,
// а зазор закрывается дугой из нескольких полосок — ребро получается
// действительно круглым, а не срезанным под 45°. Плоские участки стен
// остаются цельными, поэтому лишняя геометрия появляется только на силуэте.

function hash01(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Растущие временные буферы (переиспользуются между вызовами). */
const scratch = {
  pos: new Float32Array(1 << 16),
  nor: new Float32Array(1 << 16),
  uv: new Float32Array(1 << 16),
  col: new Float32Array(1 << 16),
  idx: new Uint32Array(1 << 16),
};
function ensure(n) {
  if (scratch.pos.length >= n * 3) return;
  const c = Math.max(n * 3, scratch.pos.length * 2);
  // содержимое обязательно переносим: иначе уже собранная часть меша теряется
  const grow = (old, Ctor, size) => { const a = new Ctor(size); a.set(old); return a; };
  scratch.pos = grow(scratch.pos, Float32Array, c);
  scratch.nor = grow(scratch.nor, Float32Array, c);
  scratch.col = grow(scratch.col, Float32Array, c);
  scratch.uv = grow(scratch.uv, Float32Array, (c / 3) * 2);
  scratch.idx = grow(scratch.idx, Uint32Array, c);
}

/**
 * @param {(x,y,z)=>number} get      материал в точке (0 = воздух)
 * @param {object} bounds            {x0,y0,z0,x1,y1,z1} включительно
 * @param {object} atlas             результат buildAtlas()
 * @param {number} pass              0 = непрозрачные, 1 = прозрачные
 * @param {THREE.Vector3} offset     сдвиг геометрии (локальные координаты)
 * @returns {THREE.BufferGeometry|null}
 */
export function buildGeometry(get, bounds, atlas, pass, offset, getDamage) {
  const { x0, y0, z0, x1, y1, z1 } = bounds;
  const ox = offset ? offset.x : 0, oy = offset ? offset.y : 0, oz = offset ? offset.z : 0;

  let vc = 0, ic = 0;
  ensure(4096);
  let P = scratch.pos, N = scratch.nor, U = scratch.uv, C = scratch.col, I = scratch.idx;

  const p = [0, 0, 0];
  const np = [0, 0, 0];
  const rounded = isRounded();
  const BEVEL = getBevelRadius();      // у мягкого стиля фаска крупнее
  const BEVEL_SEG = getBevelSegments();
  const inset = [0, 0, 0, 0];   // u-, u+, v-, v+
  const openSide = [false, false, false, false];

  for (let y = y0; y <= y1; y++) {
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const m = get(x, y, z);
        if (m === 0) continue;
        const mat = MATERIALS[m];
        const isT = mat.transparent ? 1 : 0;
        if (isT !== pass) continue;

        const dmg = getDamage ? getDamage(x, y, z) : 0;   // 0 — цел, 1 — почти разрушен
        const tint = (0.90 + hash01(x, y, z) * 0.17) * (1 - dmg * 0.42);
        const dmgG = 1 - dmg * 0.13, dmgB = 1 - dmg * 0.26;

        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          np[0] = x; np[1] = y; np[2] = z;
          np[F.a] += F.s;
          const nm = get(np[0], np[1], np[2]);
          if (nm !== 0) {
            const nmat = MATERIALS[nm];
            if (!nmat.transparent) continue;            // сосед плотный — грань не видна
            if (nm === m) continue;                     // стекло к стеклу — не рисуем
            if (mat.transparent && !nmat.transparent) continue;
          }

          // ---- AO по 8 соседям вокруг грани ----
          const ao = [0, 0, 0, 0];
          const bright = [0, 0, 0, 0];
          for (let c = 0; c < 4; c++) {
            const du = (c === 1 || c === 2) ? 1 : 0;
            const dv = (c === 2 || c === 3) ? 1 : 0;
            const su = du ? 1 : -1, sv = dv ? 1 : -1;
            // side1
            p[0] = x; p[1] = y; p[2] = z; p[F.a] += F.s; p[F.u] += su;
            const s1 = solidFor(get(p[0], p[1], p[2]));
            // side2
            p[0] = x; p[1] = y; p[2] = z; p[F.a] += F.s; p[F.v] += sv;
            const s2 = solidFor(get(p[0], p[1], p[2]));
            // corner
            p[0] = x; p[1] = y; p[2] = z; p[F.a] += F.s; p[F.u] += su; p[F.v] += sv;
            const cr = solidFor(get(p[0], p[1], p[2]));
            const lvl = (s1 && s2) ? 0 : (3 - (s1 + s2 + cr));
            ao[c] = lvl;
            bright[c] = AO_LUT[lvl] * tint;
          }

          // выпуклые рёбра: сосед в плоскости грани отсутствует
          if (rounded) {
            for (let k = 0; k < 4; k++) {
              const ax = k < 2 ? F.u : F.v;
              const dir = (k & 1) ? 1 : -1;
              p[0] = x; p[1] = y; p[2] = z; p[ax] += dir;
              const open = get(p[0], p[1], p[2]) === 0;
              openSide[k] = open;
              inset[k] = open ? BEVEL : 0;
            }
          }

          ensure(vc + 4);
          P = scratch.pos; N = scratch.nor; U = scratch.uv; C = scratch.col; I = scratch.idx;

          const tileIdx = mat.tiles[F.tile];
          const [u0, v0, u1, v1] = atlas.uv(tileIdx);

          const base = vc;
          for (let c = 0; c < 4; c++) {
            const du = (c === 1 || c === 2) ? 1 : 0;
            const dv = (c === 2 || c === 3) ? 1 : 0;
            const fu = du ? 1 - inset[1] : inset[0];
            const fv = dv ? 1 - inset[3] : inset[2];
            p[0] = x; p[1] = y; p[2] = z;
            p[F.a] += (F.s > 0) ? 1 : 0;
            p[F.u] += fu; p[F.v] += fv;

            const o = vc * 3;
            P[o] = p[0] + ox; P[o + 1] = p[1] + oy; P[o + 2] = p[2] + oz;
            N[o] = 0; N[o + 1] = 0; N[o + 2] = 0; N[o + F.a] = F.s;
            const b = bright[c];
            C[o] = b; C[o + 1] = b * dmgG; C[o + 2] = b * dmgB;

            const s = F.swap ? fv : fu;
            const t = F.swap ? fu : fv;
            U[vc * 2] = u0 + (u1 - u0) * s;
            U[vc * 2 + 1] = v0 + (v1 - v0) * t;
            vc++;
          }

          // разворот диагонали, чтобы AO не «ломался»
          if (ao[0] + ao[2] > ao[1] + ao[3]) {
            I[ic++] = base; I[ic++] = base + 1; I[ic++] = base + 2;
            I[ic++] = base; I[ic++] = base + 2; I[ic++] = base + 3;
          } else {
            I[ic++] = base + 1; I[ic++] = base + 2; I[ic++] = base + 3;
            I[ic++] = base + 1; I[ic++] = base + 3; I[ic++] = base;
          }

          // Скругление выпуклого ребра. Пара граней делит одно ребро,
          // поэтому дугу строит только грань с меньшим номером оси —
          // так каждое ребро скругляется ровно один раз.
          if (rounded) {
            for (let k = 0; k < 4; k++) {
              if (!openSide[k]) continue;
              const w = k < 2 ? F.u : F.v;
              if (F.a > w) continue;
              const sw = (k & 1) ? 1 : -1;
              const r = 3 - F.a - w;                       // третья ось
              // центр дуги радиуса BEVEL внутри блока
              const ac = (F.s > 0) ? 1 - BEVEL : BEVEL;
              const wc = (sw > 0) ? 1 - BEVEL : BEVEL;

              const shade = (k < 2)
                ? (bright[(sw > 0) ? 1 : 0] + bright[(sw > 0) ? 2 : 3]) * 0.5
                : (bright[(sw > 0) ? 2 : 0] + bright[(sw > 0) ? 3 : 1]) * 0.5;

              for (let seg = 0; seg < BEVEL_SEG; seg++) {
                const t0 = (seg / BEVEL_SEG) * Math.PI * 0.5;
                const t1 = ((seg + 1) / BEVEL_SEG) * Math.PI * 0.5;
                const tm = (t0 + t1) * 0.5;

                const a0 = ac + F.s * BEVEL * Math.cos(t0);
                const w0 = wc + sw * BEVEL * Math.sin(t0);
                const a1 = ac + F.s * BEVEL * Math.cos(t1);
                const w1 = wc + sw * BEVEL * Math.sin(t1);

                const q = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
                for (let c = 0; c < 4; c++) {
                  const near = (c === 0 || c === 1);
                  const far = (c === 1 || c === 2);
                  q[c][F.a] = near ? a0 : a1;
                  q[c][w] = near ? w0 : w1;
                  q[c][r] = far ? 1 : 0;
                }
                const nx = [0, 0, 0];
                nx[F.a] = F.s * Math.cos(tm);
                nx[w] = sw * Math.sin(tm);

                const e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]];
                const e2 = [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]];
                const cx = e1[1] * e2[2] - e1[2] * e2[1];
                const cy = e1[2] * e2[0] - e1[0] * e2[2];
                const cz = e1[0] * e2[1] - e1[1] * e2[0];
                const flip = (cx * nx[0] + cy * nx[1] + cz * nx[2]) < 0;

                ensure(vc + 4);
                P = scratch.pos; N = scratch.nor; U = scratch.uv; C = scratch.col; I = scratch.idx;
                const bb = vc;
                // ближе к перпендикулярной грани — чуть темнее, дуга читается
                const bs0 = shade * (1 - 0.10 * (seg / BEVEL_SEG));
                const bs1 = shade * (1 - 0.10 * ((seg + 1) / BEVEL_SEG));
                for (let c = 0; c < 4; c++) {
                  const near = (c === 0 || c === 1);
                  const far = (c === 1 || c === 2);
                  const o = vc * 3;
                  P[o] = q[c][0] + x + ox;
                  P[o + 1] = q[c][1] + y + oy;
                  P[o + 2] = q[c][2] + z + oz;
                  N[o] = nx[0]; N[o + 1] = nx[1]; N[o + 2] = nx[2];
                  const bs = near ? bs0 : bs1;
                  C[o] = bs; C[o + 1] = bs * dmgG; C[o + 2] = bs * dmgB;
                  // текстуру тянем с края тайла — рисунок продолжается за ребро
                  const along = far ? 1 : 0;
                  const acr = (sw > 0) ? 1 : 0;
                  const eu = (k < 2) ? acr : along;
                  const ev = (k < 2) ? along : acr;
                  const ts = F.swap ? ev : eu;
                  const tt = F.swap ? eu : ev;
                  U[vc * 2] = u0 + (u1 - u0) * ts;
                  U[vc * 2 + 1] = v0 + (v1 - v0) * tt;
                  vc++;
                }
                if (flip) {
                  I[ic++] = bb; I[ic++] = bb + 3; I[ic++] = bb + 2;
                  I[ic++] = bb; I[ic++] = bb + 2; I[ic++] = bb + 1;
                } else {
                  I[ic++] = bb; I[ic++] = bb + 1; I[ic++] = bb + 2;
                  I[ic++] = bb; I[ic++] = bb + 2; I[ic++] = bb + 3;
                }
              }
            }
          }
        }
      }
    }
  }

  if (vc === 0) return null;

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(scratch.pos.slice(0, vc * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(scratch.nor.slice(0, vc * 3), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(scratch.uv.slice(0, vc * 2), 2));
  g.setAttribute('color', new THREE.BufferAttribute(scratch.col.slice(0, vc * 3), 3));
  g.setIndex(new THREE.BufferAttribute(
    vc > 65535 ? scratch.idx.slice(0, ic) : new Uint16Array(scratch.idx.subarray(0, ic)), 1));
  g.computeBoundingSphere();
  return g;
}

function solidFor(m) {
  if (m === 0) return 0;
  return MATERIALS[m].transparent ? 0 : 1;
}

/** Материалы отрисовки блоков. */
export function makeBlockMaterials(atlas) {
  const opaque = new THREE.MeshLambertMaterial({
    map: atlas.texture, vertexColors: true, side: THREE.FrontSide,
  });
  const transparent = new THREE.MeshLambertMaterial({
    map: atlas.texture, vertexColors: true, side: THREE.FrontSide,
    transparent: true, alphaTest: 0.05, depthWrite: true,
  });
  return { opaque, transparent };
}
