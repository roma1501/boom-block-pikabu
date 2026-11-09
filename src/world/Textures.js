/**
 * Процедурная генерация всех текстур игры.
 * Ни одного внешнего файла — всё рисуется на canvas при загрузке.
 * Это даёт оригинальные текстуры и мгновенный старт без загрузки ассетов.
 */
import * as THREE from 'three';
import { isRounded, isSoft } from './Style.js';

const TILE = 64;      // размер тайла
const PAD = 8;        // защитная кайма против «протекания» при мипмапах
const CELL = TILE + PAD * 2;
const COLS = 8;
const ROWS = 5;

/* ------------------------------------------------------------------ */
/* Утилиты                                                             */
/* ------------------------------------------------------------------ */
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function rgb(r, g, b) { return `rgb(${r | 0},${g | 0},${b | 0})`; }

/** Заливка с зернистым шумом. */
function noiseFill(ctx, base, amp, seed, scale = 1) {
  const rnd = mulberry(seed);
  const img = ctx.createImageData(TILE, TILE);
  const d = img.data;
  // низкочастотные пятна
  const lf = [];
  for (let i = 0; i < 6; i++) lf.push({ x: rnd() * TILE, y: rnd() * TILE, r: 10 + rnd() * 22, a: (rnd() - 0.5) * amp * 0.9 });
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let n = (rnd() - 0.5) * amp;
      // блочный шум (пиксель-арт ощущение)
      if (scale > 1) {
        const bx = Math.floor(x / scale), by = Math.floor(y / scale);
        n = (mulberry(seed + bx * 733 + by * 9173)() - 0.5) * amp;
      }
      for (const p of lf) {
        const dx = x - p.x, dy = y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < p.r * p.r) n += p.a * (1 - Math.sqrt(d2) / p.r);
      }
      const i = (y * TILE + x) * 4;
      d[i] = Math.max(0, Math.min(255, base[0] + n));
      d[i + 1] = Math.max(0, Math.min(255, base[1] + n));
      d[i + 2] = Math.max(0, Math.min(255, base[2] + n));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Затемнение по краям тайла — имитация ambient occlusion на стыках блоков. */
function edgeShade(ctx, strength = 0.22) {
  const g = ctx.createLinearGradient(0, 0, 0, TILE);
  g.addColorStop(0, `rgba(255,255,255,${strength * 0.5})`);
  g.addColorStop(0.12, 'rgba(255,255,255,0)');
  g.addColorStop(0.88, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, TILE, TILE);
  const g2 = ctx.createLinearGradient(0, 0, TILE, 0);
  g2.addColorStop(0, `rgba(0,0,0,${strength * 0.55})`);
  g2.addColorStop(0.14, 'rgba(0,0,0,0)');
  g2.addColorStop(0.86, 'rgba(0,0,0,0)');
  g2.addColorStop(1, `rgba(0,0,0,${strength * 0.55})`);
  ctx.fillStyle = g2; ctx.fillRect(0, 0, TILE, TILE);
}

function speckles(ctx, count, seed, colorFn, sizeMin = 1, sizeMax = 3) {
  const rnd = mulberry(seed);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rnd() * TILE), y = Math.floor(rnd() * TILE);
    const s = Math.floor(sizeMin + rnd() * (sizeMax - sizeMin + 1));
    ctx.fillStyle = colorFn(rnd);
    ctx.fillRect(x, y, s, s);
  }
}

/* ------------------------------------------------------------------ */
/* Рисовалки тайлов                                                    */
/* ------------------------------------------------------------------ */
const PAINTERS = {
  grass_top(ctx) {
    noiseFill(ctx, [96, 176, 62], 26, 11, 2);
    speckles(ctx, 130, 21, r => r() > 0.5 ? 'rgba(150,220,90,.75)' : 'rgba(58,128,40,.7)', 1, 3);
    speckles(ctx, 26, 31, () => 'rgba(200,240,130,.55)', 1, 2);
    edgeShade(ctx, 0.14);
  },
  grass_side(ctx) {
    noiseFill(ctx, [134, 96, 62], 22, 41, 2);
    speckles(ctx, 90, 51, r => r() > 0.5 ? 'rgba(160,120,80,.6)' : 'rgba(96,66,42,.65)', 1, 3);
    // травяная кромка
    const rnd = mulberry(61);
    for (let x = 0; x < TILE; x++) {
      const h = 10 + Math.floor(rnd() * 9);
      ctx.fillStyle = rgb(96 + rnd() * 40, 176 + rnd() * 34, 62 + rnd() * 24);
      ctx.fillRect(x, 0, 1, h);
    }
    edgeShade(ctx, 0.2);
  },
  dirt(ctx) {
    noiseFill(ctx, [134, 96, 62], 24, 71, 2);
    speckles(ctx, 110, 81, r => r() > 0.55 ? 'rgba(170,128,86,.6)' : 'rgba(88,60,38,.6)', 1, 4);
    edgeShade(ctx, 0.2);
  },
  stone(ctx) {
    noiseFill(ctx, [138, 141, 148], 20, 101, 2);
    speckles(ctx, 90, 111, r => r() > 0.5 ? 'rgba(172,175,182,.55)' : 'rgba(104,107,116,.6)', 1, 3);
    // трещины
    const rnd = mulberry(121);
    ctx.strokeStyle = 'rgba(88,90,98,.65)'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      let x = rnd() * TILE, y = rnd() * TILE;
      ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += (rnd() - 0.5) * 26; y += (rnd() - 0.5) * 26; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    edgeShade(ctx, 0.22);
  },
  cobble(ctx) {
    ctx.fillStyle = rgb(92, 95, 103); ctx.fillRect(0, 0, TILE, TILE);
    const rnd = mulberry(131);
    const cells = [[0, 0, 30, 22], [32, 0, 32, 30], [0, 24, 22, 24], [24, 32, 26, 32],
    [0, 50, 30, 14], [52, 32, 12, 32], [24, 24, 20, 6], [30, 50, 34, 14]];
    for (const [x, y, w, h] of cells) {
      const v = 118 + rnd() * 52;
      ctx.fillStyle = rgb(v, v + 3, v + 10);
      ctx.fillRect(x + 2, y + 2, w - 3, h - 3);
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.fillRect(x + 2, y + 2, w - 3, 2);
      ctx.fillStyle = 'rgba(0,0,0,.2)';
      ctx.fillRect(x + 2, y + h - 3, w - 3, 2);
    }
    speckles(ctx, 70, 141, r => `rgba(${60 + r() * 90},${60 + r() * 90},${70 + r() * 90},.35)`, 1, 2);
    edgeShade(ctx, 0.24);
  },
  planks(ctx) {
    noiseFill(ctx, [176, 130, 74], 16, 151, 2);
    const rnd = mulberry(161);
    for (let p = 0; p < 4; p++) {
      const y = p * 16;
      const v = 0.86 + rnd() * 0.3;
      ctx.fillStyle = `rgba(${176 * v | 0},${130 * v | 0},${74 * v | 0},.9)`;
      ctx.fillRect(0, y + 1, TILE, 14);
      // волокна
      ctx.strokeStyle = 'rgba(120,84,44,.35)'; ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const yy = y + 3 + rnd() * 10;
        ctx.beginPath(); ctx.moveTo(0, yy);
        ctx.bezierCurveTo(TILE * .3, yy + (rnd() - .5) * 3, TILE * .6, yy + (rnd() - .5) * 3, TILE, yy);
        ctx.stroke();
      }
      // разделитель
      ctx.fillStyle = 'rgba(92,62,32,.75)'; ctx.fillRect(0, y, TILE, 1.5);
      ctx.fillStyle = 'rgba(255,225,180,.16)'; ctx.fillRect(0, y + 2, TILE, 1);
      // гвозди
      ctx.fillStyle = 'rgba(70,60,52,.75)';
      ctx.fillRect(4, y + 6, 2, 2); ctx.fillRect(TILE - 7, y + 6, 2, 2);
    }
    edgeShade(ctx, 0.18);
  },
  planks_dark(ctx) {
    PAINTERS.planks(ctx);
    ctx.fillStyle = 'rgba(48,26,10,.42)'; ctx.fillRect(0, 0, TILE, TILE);
  },
  log_side(ctx) {
    noiseFill(ctx, [108, 78, 46], 18, 171, 2);
    const rnd = mulberry(181);
    for (let x = 0; x < TILE; x += 4) {
      const v = 0.82 + rnd() * 0.4;
      ctx.fillStyle = `rgba(${108 * v | 0},${78 * v | 0},${46 * v | 0},.85)`;
      ctx.fillRect(x, 0, 4, TILE);
      ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fillRect(x + 3, 0, 1, TILE);
    }
    speckles(ctx, 40, 191, () => 'rgba(60,42,24,.5)', 1, 3);
    edgeShade(ctx, 0.22);
  },
  log_top(ctx) {
    noiseFill(ctx, [186, 146, 92], 14, 201, 2);
    ctx.save(); ctx.translate(TILE / 2, TILE / 2);
    for (let r = 30; r > 2; r -= 4) {
      ctx.strokeStyle = r % 8 === 0 ? 'rgba(126,92,52,.6)' : 'rgba(206,168,112,.5)';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(108,78,46,.9)';
    ctx.fillRect(0, 0, TILE, 3); ctx.fillRect(0, TILE - 3, TILE, 3);
    ctx.fillRect(0, 0, 3, TILE); ctx.fillRect(TILE - 3, 0, 3, TILE);
  },
  brick(ctx) {
    ctx.fillStyle = rgb(196, 190, 178); ctx.fillRect(0, 0, TILE, TILE);  // раствор
    const rnd = mulberry(211);
    const bh = 16;
    for (let row = 0; row < 4; row++) {
      const off = (row % 2) ? -16 : 0;
      for (let bx = off; bx < TILE; bx += 32) {
        const v = 0.85 + rnd() * 0.32;
        ctx.fillStyle = `rgb(${(178 * v) | 0},${(74 * v) | 0},${(54 * v) | 0})`;
        ctx.fillRect(bx + 2, row * bh + 2, 28, bh - 4);
        ctx.fillStyle = 'rgba(255,255,255,.14)';
        ctx.fillRect(bx + 2, row * bh + 2, 28, 2);
        ctx.fillStyle = 'rgba(0,0,0,.16)';
        ctx.fillRect(bx + 2, row * bh + bh - 4, 28, 2);
      }
    }
    speckles(ctx, 60, 221, r => `rgba(${120 + r() * 80},${50 + r() * 40},${40 + r() * 30},.3)`, 1, 2);
    edgeShade(ctx, 0.2);
  },
  glass(ctx) {
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.fillStyle = 'rgba(168,222,240,.20)'; ctx.fillRect(0, 0, TILE, TILE);
    // рама
    ctx.fillStyle = 'rgba(226,240,248,.92)';
    ctx.fillRect(0, 0, TILE, 4); ctx.fillRect(0, TILE - 4, TILE, 4);
    ctx.fillRect(0, 0, 4, TILE); ctx.fillRect(TILE - 4, 0, 4, TILE);
    ctx.fillStyle = 'rgba(180,214,232,.55)';
    ctx.fillRect(0, TILE / 2 - 1.5, TILE, 3); ctx.fillRect(TILE / 2 - 1.5, 0, 3, TILE);
    // блик
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(10, 46); ctx.lineTo(28, 12); ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(20, 50); ctx.lineTo(34, 24); ctx.stroke();
  },
  metal(ctx) {
    noiseFill(ctx, [148, 156, 168], 12, 231, 1);
    for (let y = 0; y < TILE; y += 2) {
      ctx.fillStyle = `rgba(255,255,255,${0.03 + (y % 4 === 0 ? 0.05 : 0)})`;
      ctx.fillRect(0, y, TILE, 1);
    }
    // заклёпки
    ctx.fillStyle = 'rgba(96,104,118,.9)';
    const pts = [[6, 6], [TILE - 8, 6], [6, TILE - 8], [TILE - 8, TILE - 8], [TILE / 2 - 1, TILE / 2 - 1]];
    for (const [x, y] of pts) {
      ctx.fillRect(x, y, 4, 4);
      ctx.fillStyle = 'rgba(210,218,230,.7)'; ctx.fillRect(x, y, 3, 1);
      ctx.fillStyle = 'rgba(96,104,118,.9)';
    }
    ctx.strokeStyle = 'rgba(90,98,112,.6)'; ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, TILE - 6, TILE - 6);
    edgeShade(ctx, 0.2);
  },
  concrete(ctx) {
    noiseFill(ctx, [176, 176, 172], 16, 241, 2);
    speckles(ctx, 120, 251, r => `rgba(${140 + r() * 70},${140 + r() * 70},${138 + r() * 70},.4)`, 1, 2);
    ctx.fillStyle = 'rgba(120,120,118,.35)';
    ctx.fillRect(0, 0, TILE, 2); ctx.fillRect(0, TILE - 2, TILE, 2);
    edgeShade(ctx, 0.2);
  },
  sand(ctx) {
    noiseFill(ctx, [226, 206, 150], 16, 261, 2);
    speckles(ctx, 150, 271, r => `rgba(${200 + r() * 50},${180 + r() * 50},${130 + r() * 40},.5)`, 1, 2);
    edgeShade(ctx, 0.14);
  },
  thatch(ctx) {
    noiseFill(ctx, [200, 168, 88], 18, 281, 2);
    const rnd = mulberry(291);
    ctx.lineWidth = 2;
    for (let i = 0; i < 46; i++) {
      const y = rnd() * TILE;
      const v = 0.8 + rnd() * 0.45;
      ctx.strokeStyle = `rgba(${200 * v | 0},${168 * v | 0},${88 * v | 0},.85)`;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(TILE, y + (rnd() - 0.5) * 6); ctx.stroke();
    }
    edgeShade(ctx, 0.24);
  },
  slate(ctx) {
    ctx.fillStyle = rgb(72, 80, 96); ctx.fillRect(0, 0, TILE, TILE);
    const rnd = mulberry(301);
    for (let row = 0; row < 4; row++) {
      const off = (row % 2) ? -11 : 0;
      for (let x = off; x < TILE; x += 22) {
        const v = 0.85 + rnd() * 0.35;
        ctx.fillStyle = `rgb(${(96 * v) | 0},${(106 * v) | 0},${(126 * v) | 0})`;
        ctx.beginPath();
        ctx.moveTo(x + 1, row * 16); ctx.lineTo(x + 21, row * 16);
        ctx.lineTo(x + 21, row * 16 + 12); ctx.lineTo(x + 11, row * 16 + 15.5);
        ctx.lineTo(x + 1, row * 16 + 12); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.12)';
        ctx.fillRect(x + 1, row * 16, 20, 2);
      }
    }
    edgeShade(ctx, 0.24);
  },
  plaster(ctx) {
    noiseFill(ctx, [232, 226, 210], 12, 311, 2);
    speckles(ctx, 60, 321, () => 'rgba(198,190,172,.35)', 1, 2);
    edgeShade(ctx, 0.16);
  },
  tnt_side(ctx) {
    ctx.fillStyle = rgb(198, 52, 38); ctx.fillRect(0, 0, TILE, TILE);
    noiseFill(ctx, [198, 52, 38], 14, 331, 2);
    ctx.fillStyle = rgb(238, 234, 226); ctx.fillRect(0, 20, TILE, 24);
    ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(0, 40, TILE, 4);
    // надпись TNT
    ctx.fillStyle = '#1a1a24';
    ctx.font = 'bold 19px "Arial Black",Impact,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TNT', TILE / 2, 32);
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(0, 0, TILE, 3);
    edgeShade(ctx, 0.2);
  },
  tnt_top(ctx) {
    ctx.fillStyle = rgb(186, 46, 34); ctx.fillRect(0, 0, TILE, TILE);
    noiseFill(ctx, [186, 46, 34], 12, 341, 2);
    ctx.fillStyle = rgb(60, 52, 44);
    ctx.beginPath(); ctx.arc(TILE / 2, TILE / 2, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgb(122, 96, 52);
    ctx.beginPath(); ctx.arc(TILE / 2, TILE / 2, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, TILE - 6, TILE - 6);
  },
  chest_side(ctx) {
    noiseFill(ctx, [146, 100, 48], 14, 351, 2);
    ctx.fillStyle = 'rgba(90,60,26,.8)';
    ctx.fillRect(0, 22, TILE, 4);
    ctx.fillStyle = 'rgba(214,168,60,.9)';
    ctx.fillRect(4, 4, 5, TILE - 8); ctx.fillRect(TILE - 9, 4, 5, TILE - 8);
    ctx.fillStyle = 'rgba(255,232,150,.5)';
    ctx.fillRect(4, 4, 2, TILE - 8); ctx.fillRect(TILE - 9, 4, 2, TILE - 8);
    edgeShade(ctx, 0.22);
  },
  chest_front(ctx) {
    PAINTERS.chest_side(ctx);
    ctx.fillStyle = rgb(226, 186, 72);
    ctx.fillRect(TILE / 2 - 8, 18, 16, 16);
    ctx.fillStyle = rgb(70, 52, 24);
    ctx.fillRect(TILE / 2 - 3, 24, 6, 8);
    ctx.fillStyle = 'rgba(255,240,180,.6)';
    ctx.fillRect(TILE / 2 - 8, 18, 16, 3);
  },
  chest_top(ctx) {
    noiseFill(ctx, [160, 112, 56], 12, 361, 2);
    ctx.fillStyle = 'rgba(214,168,60,.9)';
    ctx.fillRect(4, 4, 5, TILE - 8); ctx.fillRect(TILE - 9, 4, 5, TILE - 8);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, TILE - 5, TILE, 5);
  },
  bedrock(ctx) {
    noiseFill(ctx, [58, 58, 68], 34, 371, 4);
    speckles(ctx, 60, 381, r => `rgba(${20 + r() * 40},${20 + r() * 40},${26 + r() * 40},.85)`, 3, 8);
    edgeShade(ctx, 0.3);
  },
  leaves(ctx) {
    noiseFill(ctx, [62, 138, 54], 30, 391, 3);
    speckles(ctx, 160, 401, r => r() > 0.5 ? 'rgba(96,182,72,.8)' : 'rgba(38,96,36,.85)', 2, 5);
    edgeShade(ctx, 0.2);
  },
  gold(ctx) {
    noiseFill(ctx, [226, 178, 56], 18, 411, 2);
    speckles(ctx, 80, 421, r => r() > 0.5 ? 'rgba(255,232,140,.7)' : 'rgba(172,124,26,.7)', 1, 3);
    ctx.strokeStyle = 'rgba(255,246,200,.5)'; ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, TILE - 8, TILE - 8);
    edgeShade(ctx, 0.18);
  },
  crate(ctx) {
    noiseFill(ctx, [186, 142, 82], 16, 431, 2);
    ctx.fillStyle = 'rgba(122,84,42,.85)';
    ctx.fillRect(0, 0, TILE, 5); ctx.fillRect(0, TILE - 5, TILE, 5);
    ctx.fillRect(0, 0, 5, TILE); ctx.fillRect(TILE - 5, 0, 5, TILE);
    ctx.strokeStyle = 'rgba(122,84,42,.7)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(5, 5); ctx.lineTo(TILE - 5, TILE - 5);
    ctx.moveTo(TILE - 5, 5); ctx.lineTo(5, TILE - 5); ctx.stroke();
    edgeShade(ctx, 0.2);
  },
  /* ---- корпуса взрывчатки ---- */
  _charge(ctx, base, band, label, accent) {
    ctx.fillStyle = rgb(base[0], base[1], base[2]); ctx.fillRect(0, 0, TILE, TILE);
    noiseFill(ctx, base, 14, 333 + base[0], 2);
    ctx.fillStyle = rgb(band[0], band[1], band[2]);
    ctx.fillRect(0, 20, TILE, 24);
    ctx.fillStyle = 'rgba(0,0,0,.16)'; ctx.fillRect(0, 40, TILE, 4);
    ctx.fillStyle = accent || '#1a1a24';
    ctx.font = 'bold 17px "Arial Black",Impact,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, TILE / 2, 32);
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(0, 0, TILE, 3);
    edgeShade(ctx, 0.2);
  },
  _chargeTop(ctx, base, ring) {
    ctx.fillStyle = rgb(base[0] * .92, base[1] * .92, base[2] * .92); ctx.fillRect(0, 0, TILE, TILE);
    noiseFill(ctx, [base[0] * .92, base[1] * .92, base[2] * .92], 12, 411 + base[1], 2);
    ctx.fillStyle = rgb(56, 50, 44);
    ctx.beginPath(); ctx.arc(TILE / 2, TILE / 2, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ring;
    ctx.beginPath(); ctx.arc(TILE / 2, TILE / 2, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, TILE - 6, TILE - 6);
  },
  mega_side(ctx) { PAINTERS._charge(ctx, [58, 62, 74], [232, 170, 30], 'MEGA'); },
  mega_top(ctx) { PAINTERS._chargeTop(ctx, [58, 62, 74], '#e8aa1e'); },
  cluster_side(ctx) {
    PAINTERS._charge(ctx, [76, 96, 62], [214, 214, 206], 'x5');
    const rnd = mulberry(515);
    ctx.fillStyle = 'rgba(30,40,26,.55)';
    for (let i = 0; i < 5; i++) ctx.fillRect(6 + i * 11, 48, 8, 8);
  },
  cluster_top(ctx) {
    PAINTERS._chargeTop(ctx, [76, 96, 62], '#9fbf6a');
    ctx.fillStyle = 'rgba(30,40,26,.5)';
    for (const [x, y] of [[10, 10], [46, 10], [10, 46], [46, 46]]) ctx.fillRect(x, y, 8, 8);
  },
  napalm_side(ctx) {
    PAINTERS._charge(ctx, [206, 96, 26], [250, 222, 140], 'FIRE', '#8a2a00');
    ctx.strokeStyle = 'rgba(255,220,120,.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(8, 58); ctx.quadraticCurveTo(20, 48, 14, 46); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(52, 58); ctx.quadraticCurveTo(40, 48, 46, 46); ctx.stroke();
  },
  napalm_top(ctx) { PAINTERS._chargeTop(ctx, [206, 96, 26], '#ffd06a'); },
  shaped_side(ctx) {
    PAINTERS._charge(ctx, [112, 118, 128], [40, 44, 54], 'HEAT', '#ffd24a');
    ctx.fillStyle = 'rgba(255,210,74,.75)';
    ctx.beginPath(); ctx.moveTo(TILE / 2, 62); ctx.lineTo(TILE / 2 - 10, 48); ctx.lineTo(TILE / 2 + 10, 48); ctx.fill();
  },
  shaped_top(ctx) { PAINTERS._chargeTop(ctx, [112, 118, 128], '#ffd24a'); },
  grav_side(ctx) {
    PAINTERS._charge(ctx, [58, 44, 96], [150, 110, 230], 'G', '#e8dcff');
    ctx.strokeStyle = 'rgba(190,160,255,.65)'; ctx.lineWidth = 2;
    for (let r = 8; r < 22; r += 6) {
      ctx.beginPath(); ctx.arc(TILE / 2, 54, r, Math.PI, Math.PI * 2); ctx.stroke();
    }
  },
  grav_top(ctx) { PAINTERS._chargeTop(ctx, [58, 44, 96], '#a884ff'); },

  ice(ctx) {
    noiseFill(ctx, [156, 212, 240], 16, 441, 2);
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2;
    const rnd = mulberry(451);
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      let x = rnd() * TILE, y = rnd() * TILE; ctx.moveTo(x, y);
      for (let s = 0; s < 3; s++) { x += (rnd() - .5) * 30; y += (rnd() - .5) * 30; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    edgeShade(ctx, 0.16);
  },
};


/* ------------------------------------------------------------------ */
/* Стиль «rounded»: собственный набор рисунков для YouTube Playables.   */
/* Другая палитра, другой рисунок, у каждого блока фаска и подсветка —  */
/* картинка намеренно не похожа на кубический пиксель-арт.              */
/* ------------------------------------------------------------------ */
function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function grad(ctx, c0, c1, vertical = true) {
  const g = vertical ? ctx.createLinearGradient(0, 0, 0, TILE)
    : ctx.createLinearGradient(0, 0, TILE, 0);
  g.addColorStop(0, c0); g.addColorStop(1, c1);
  ctx.fillStyle = g; ctx.fillRect(0, 0, TILE, TILE);
}

function blobs(ctx, n, seed, color, rmin, rmax) {
  const rnd = mulberry(seed);
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const x = rnd() * TILE, y = rnd() * TILE, r = rmin + rnd() * (rmax - rmin);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

/** Фаска: блок читается как скруглённый, а не как плоский квадрат. */
function bevel(ctx, strength = 1) {
  const w = TILE;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const edge = ctx.createLinearGradient(0, 0, 0, w);
  edge.addColorStop(0, `rgba(255,255,255,${0.22 * strength})`);
  edge.addColorStop(0.16, 'rgba(255,255,255,0)');
  edge.addColorStop(0.84, 'rgba(0,0,0,0)');
  edge.addColorStop(1, `rgba(0,0,0,${0.24 * strength})`);
  ctx.fillStyle = edge; ctx.fillRect(0, 0, w, w);
  const edge2 = ctx.createLinearGradient(0, 0, w, 0);
  edge2.addColorStop(0, `rgba(255,255,255,${0.13 * strength})`);
  edge2.addColorStop(0.16, 'rgba(255,255,255,0)');
  edge2.addColorStop(0.84, 'rgba(0,0,0,0)');
  edge2.addColorStop(1, `rgba(0,0,0,${0.18 * strength})`);
  ctx.fillStyle = edge2; ctx.fillRect(0, 0, w, w);
  ctx.restore();

  ctx.save();
  const c = 10 * strength;
  for (const [cx, cy] of [[0, 0], [w, 0], [0, w], [w, w]]) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, c);
    g.addColorStop(0, `rgba(0,0,0,${0.24 * strength})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
  }
  ctx.restore();

  ctx.strokeStyle = `rgba(0,0,0,${0.16 * strength})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, w - 2);
}

/**
 * Мягкий стиль: превращает готовый тайл в «подушку».
 *
 * Сначала палитра уводится в леденцовую сторону (насыщеннее и светлее),
 * потом поверх ложится крупный блик из верхнего угла и плотная тень по
 * краю. Рисунок материала при этом сохраняется — доски остаются досками,
 * просто выглядят мягкой игрушкой, а не строительным блоком.
 */
function pillow(ctx) {
  const w = TILE;

  // 1. палитра: ярче и теплее
  if (typeof ctx.filter === 'string') {
    const src = mkCanvas(w, w);
    src.getContext('2d').drawImage(ctx.canvas, 0, 0);
    ctx.clearRect(0, 0, w, w);
    ctx.save();
    ctx.filter = 'saturate(1.45) brightness(1.1) contrast(0.92)';
    ctx.drawImage(src, 0, 0);
    ctx.restore();
  }

  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';

  // 2. крупный блик из верхнего левого угла
  const hi = ctx.createRadialGradient(w * 0.32, w * 0.28, 0, w * 0.32, w * 0.28, w * 0.86);
  hi.addColorStop(0, 'rgba(255,255,255,.34)');
  hi.addColorStop(0.45, 'rgba(255,255,255,.10)');
  hi.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hi; ctx.fillRect(0, 0, w, w);

  // 3. мягкая тень по нижнему краю — грань «наливается» объёмом
  const sh = ctx.createRadialGradient(w * 0.7, w * 0.78, w * 0.18, w * 0.7, w * 0.78, w * 0.95);
  sh.addColorStop(0, 'rgba(28,20,10,0)');
  sh.addColorStop(1, 'rgba(28,20,10,.34)');
  ctx.fillStyle = sh; ctx.fillRect(0, 0, w, w);

  // 4. плотная кайма: без неё соседние блоки сливаются в кашу
  const r = w * 0.30;
  ctx.lineJoin = 'round';
  for (const [inset, alpha, width] of [[2, 0.20, 5], [4.5, 0.12, 3]]) {
    ctx.strokeStyle = `rgba(24,16,8,${alpha})`;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(inset + r, inset);
    ctx.arcTo(w - inset, inset, w - inset, w - inset, r);
    ctx.arcTo(w - inset, w - inset, inset, w - inset, r);
    ctx.arcTo(inset, w - inset, inset, inset, r);
    ctx.arcTo(inset, inset, w - inset, inset, r);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

const ROUNDED = {
  grass_top(ctx) {
    grad(ctx, '#74d18a', '#3f9c5b');
    blobs(ctx, 9, 11, 'rgba(146,225,146,.45)', 5, 12);
    blobs(ctx, 7, 23, 'rgba(44,130,74,.4)', 4, 10);
    const rnd = mulberry(31);
    ctx.strokeStyle = 'rgba(178,232,168,.45)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const x = rnd() * TILE, y = rnd() * TILE;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 2, y - 5, x + 5, y - 7); ctx.stroke();
    }
  },
  grass_side(ctx) {
    grad(ctx, '#a4744c', '#7a5334');
    blobs(ctx, 8, 41, 'rgba(196,146,100,.4)', 4, 9);
    ctx.fillStyle = '#4aa862';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(TILE, 0); ctx.lineTo(TILE, 16);
    for (let x = TILE; x >= 0; x -= 8) ctx.quadraticCurveTo(x - 4, 24, x - 8, 16);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(150,224,160,.5)';
    ctx.fillRect(0, 0, TILE, 5);
  },
  dirt(ctx) {
    grad(ctx, '#a3764e', '#7b5535');
    blobs(ctx, 12, 71, 'rgba(198,150,104,.45)', 4, 10);
    blobs(ctx, 8, 81, 'rgba(90,62,38,.4)', 3, 7);
  },
  stone(ctx) {
    grad(ctx, '#9aa6b4', '#6f7d8e');
    // угловатые плиты со сколами — камень, а не пузырьки
    const rnd = mulberry(101);
    for (let i = 0; i < 9; i++) {
      const cx = rnd() * TILE, cy = rnd() * TILE;
      const rad = 8 + rnd() * 11;
      const n = 5 + ((rnd() * 3) | 0);
      const v = 0.88 + rnd() * 0.34;
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rnd() * 0.35;
        const rr2 = rad * (0.7 + rnd() * 0.45);
        const px = cx + Math.cos(a) * rr2, py = cy + Math.sin(a) * rr2;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(${164 * v | 0},${176 * v | 0},${192 * v | 0},.8)`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(72,86,102,.35)'; ctx.lineWidth = 1.6; ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    for (let i = 0; i < 26; i++) ctx.fillRect(rnd() * TILE, rnd() * TILE, 2, 2);
  },
  cobble(ctx) {
    ctx.fillStyle = '#c6cfd8'; ctx.fillRect(0, 0, TILE, TILE);   // светлый раствор
    const rnd = mulberry(131);
    // неровные камни, уложенные в кладку
    const cells = [[16, 15, 15], [46, 14, 14], [15, 45, 14], [47, 46, 15],
    [31, 31, 12], [3, 30, 9], [61, 31, 9], [31, 3, 9], [31, 60, 9]];
    for (const [cx, cy, rad] of cells) {
      const n = 6 + ((rnd() * 3) | 0);
      const v = 0.86 + rnd() * 0.3;
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rnd() * 0.3;
        const rr2 = rad * (0.74 + rnd() * 0.36);
        const px = cx + Math.cos(a) * rr2, py = cy + Math.sin(a) * rr2;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(cx - rad, cy - rad, cx + rad, cy + rad);
      g.addColorStop(0, `rgba(${186 * v | 0},${196 * v | 0},${210 * v | 0},1)`);
      g.addColorStop(1, `rgba(${108 * v | 0},${120 * v | 0},${138 * v | 0},1)`);
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(66,78,94,.45)'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    for (let i = 0; i < 30; i++) ctx.fillRect(rnd() * TILE, rnd() * TILE, 2, 2);
  },
  planks(ctx) {
    grad(ctx, '#d8a05e', '#b47c40');
    const rnd = mulberry(161);
    for (let i = 0; i < 3; i++) {
      const y = 2 + i * 21;
      const v = 0.92 + rnd() * 0.18;
      ctx.fillStyle = `rgba(${216 * v | 0},${158 * v | 0},${94 * v | 0},1)`;
      rr(ctx, 2, y, TILE - 4, 19, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(120,78,36,.3)'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = 'rgba(255,226,178,.35)';
      rr(ctx, 6, y + 2, TILE - 12, 4, 2); ctx.fill();
    }
  },
  planks_dark(ctx) {
    ROUNDED.planks(ctx);
    ctx.fillStyle = 'rgba(52,28,10,.42)'; ctx.fillRect(0, 0, TILE, TILE);
  },
  log_side(ctx) {
    grad(ctx, '#9a6f45', '#6d4b2c');
    for (let i = 0; i < 4; i++) {
      const x = 2 + i * 15.5;
      const g = ctx.createLinearGradient(x, 0, x + 14, 0);
      g.addColorStop(0, 'rgba(60,40,22,.55)');
      g.addColorStop(0.45, 'rgba(190,146,96,.5)');
      g.addColorStop(1, 'rgba(60,40,22,.55)');
      ctx.fillStyle = g;
      rr(ctx, x, 2, 13, TILE - 4, 6); ctx.fill();
    }
  },
  log_top(ctx) {
    grad(ctx, '#d0a473', '#a87c4c');
    ctx.save(); ctx.translate(TILE / 2, TILE / 2);
    for (let r = 28; r > 3; r -= 5) {
      ctx.strokeStyle = r % 10 === 0 ? 'rgba(120,84,46,.55)' : 'rgba(224,190,146,.5)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  },
  brick(ctx) {
    ctx.fillStyle = '#efe6d6'; ctx.fillRect(0, 0, TILE, TILE);
    const rnd = mulberry(211);
    for (let row = 0; row < 2; row++) {
      const off = row % 2 ? -14 : 0;
      for (let x = off; x < TILE; x += 30) {
        const v = 0.9 + rnd() * 0.24;
        const g = ctx.createLinearGradient(0, row * 32, 0, row * 32 + 28);
        g.addColorStop(0, `rgba(${226 * v | 0},${118 * v | 0},${92 * v | 0},1)`);
        g.addColorStop(1, `rgba(${168 * v | 0},${70 * v | 0},${52 * v | 0},1)`);
        ctx.fillStyle = g;
        rr(ctx, x + 3, row * 32 + 3, 26, 26, 8); ctx.fill();
      }
    }
  },
  sand(ctx) {
    grad(ctx, '#f4e0ad', '#ddc286');
    blobs(ctx, 10, 261, 'rgba(255,244,206,.45)', 5, 12);
    const rnd = mulberry(271);
    ctx.fillStyle = 'rgba(190,164,110,.35)';
    for (let i = 0; i < 40; i++) ctx.fillRect(rnd() * TILE, rnd() * TILE, 2, 2);
  },
  thatch(ctx) {
    grad(ctx, '#e0bf6b', '#b8963f');
    ctx.lineCap = 'round';
    const rnd = mulberry(291);
    for (let i = 0; i < 12; i++) {
      const y = 3 + i * 5.2;
      const v = 0.85 + rnd() * 0.4;
      ctx.strokeStyle = `rgba(${232 * v | 0},${200 * v | 0},${120 * v | 0},.9)`;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.quadraticCurveTo(TILE / 2, y + 3, TILE, y); ctx.stroke();
    }
  },
  slate(ctx) {
    ctx.fillStyle = '#3f4a5e'; ctx.fillRect(0, 0, TILE, TILE);
    for (let row = 0; row < 3; row++) {
      const off = row % 2 ? -12 : 0;
      for (let x = off; x < TILE + 12; x += 24) {
        const g = ctx.createLinearGradient(0, row * 22, 0, row * 22 + 24);
        g.addColorStop(0, '#8fa2c0'); g.addColorStop(1, '#5a6a86');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x + 12, row * 22 + 10, 12, 0, Math.PI);
        ctx.lineTo(x, row * 22 + 10); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(30,38,52,.5)'; ctx.lineWidth = 1.6; ctx.stroke();
      }
    }
  },
  plaster(ctx) {
    grad(ctx, '#fbf5e8', '#e2d9c6');
    blobs(ctx, 6, 311, 'rgba(255,255,255,.5)', 6, 14);
  },
  concrete(ctx) {
    grad(ctx, '#c3c8cc', '#9ba3a9');
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    rr(ctx, 7, 7, TILE - 14, TILE - 14, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(110,120,128,.5)'; ctx.lineWidth = 2.4;
    rr(ctx, 7, 7, TILE - 14, TILE - 14, 10); ctx.stroke();
  },
  metal(ctx) {
    grad(ctx, '#b8c2d0', '#7f8b9c', false);
    for (let i = -TILE; i < TILE * 2; i += 7) {
      ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + TILE, TILE); ctx.stroke();
    }
    for (const [x, y] of [[10, 10], [TILE - 10, 10], [10, TILE - 10], [TILE - 10, TILE - 10]]) {
      const g = ctx.createRadialGradient(x - 1.5, y - 1.5, 0.5, x, y, 5);
      g.addColorStop(0, '#e6ecf5'); g.addColorStop(1, '#6d788a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    }
  },
  glass(ctx) {
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.fillStyle = 'rgba(150,225,240,.22)';
    rr(ctx, 5, 5, TILE - 10, TILE - 10, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(236,250,255,.95)'; ctx.lineWidth = 6;
    rr(ctx, 5, 5, TILE - 10, TILE - 10, 12); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(16, 44); ctx.lineTo(30, 18); ctx.stroke();
  },
  crate(ctx) {
    grad(ctx, '#d3a469', '#a87b44');
    ctx.strokeStyle = 'rgba(122,84,42,.85)'; ctx.lineWidth = 6;
    rr(ctx, 5, 5, TILE - 10, TILE - 10, 12); ctx.stroke();
    ctx.fillStyle = 'rgba(122,84,42,.55)';
    ctx.beginPath(); ctx.arc(TILE / 2, TILE / 2, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(240,208,150,.6)';
    ctx.beginPath(); ctx.arc(TILE / 2, TILE / 2, 6, 0, Math.PI * 2); ctx.fill();
  },
  leaves(ctx) {
    grad(ctx, '#55b06a', '#2c7444');
    blobs(ctx, 16, 391, 'rgba(126,222,148,.6)', 6, 13);
    blobs(ctx, 12, 401, 'rgba(30,96,60,.45)', 4, 9);
  },
  ice(ctx) {
    grad(ctx, '#bfe8f7', '#84c3e2');
    blobs(ctx, 6, 441, 'rgba(255,255,255,.45)', 7, 15);
  },
  gold(ctx) {
    grad(ctx, '#ffdf82', '#d9a326');
    blobs(ctx, 7, 411, 'rgba(255,246,196,.6)', 5, 12);
  },
  bedrock(ctx) {
    grad(ctx, '#5a5f70', '#33374a');
    blobs(ctx, 10, 371, 'rgba(24,26,36,.6)', 5, 13);
  },
};

/* Порядок тайлов в атласе (индекс = позиция) */
export const TILE_NAMES = [
  'grass_top', 'grass_side', 'dirt', 'stone', 'cobble', 'planks', 'planks_dark', 'log_side',
  'log_top', 'brick', 'glass', 'metal', 'concrete', 'sand', 'thatch', 'slate',
  'plaster', 'tnt_side', 'tnt_top', 'chest_side', 'chest_front', 'chest_top', 'bedrock', 'leaves',
  'gold', 'crate', 'ice',
  'mega_side', 'mega_top', 'cluster_side', 'cluster_top', 'napalm_side',
  'napalm_top', 'shaped_side', 'shaped_top', 'grav_side', 'grav_top',
];

export const TILE_INDEX = {};
TILE_NAMES.forEach((n, i) => { TILE_INDEX[n] = i; });

/* ------------------------------------------------------------------ */
/* Сборка атласа                                                       */
/* ------------------------------------------------------------------ */
let _atlas = null;

export function buildAtlas() {
  if (_atlas) return _atlas;
  const cvs = mkCanvas(COLS * CELL, ROWS * CELL);
  const ctx = cvs.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const tmp = mkCanvas(TILE, TILE);
  const tctx = tmp.getContext('2d');

  const rounded = isRounded();
  const soft = isSoft();
  TILE_NAMES.forEach((name, i) => {
    tctx.clearRect(0, 0, TILE, TILE);
    const painter = (rounded && ROUNDED[name]) || PAINTERS[name] || PAINTERS.stone;
    painter(tctx);
    if (rounded) bevel(tctx, (name === 'glass' ? 0.45 : 1) * (soft ? 0.5 : 1));
    if (soft && name !== 'glass') pillow(tctx);
    const cx = (i % COLS) * CELL, cy = Math.floor(i / COLS) * CELL;
    // основной тайл
    ctx.drawImage(tmp, cx + PAD, cy + PAD);
    // кайма (растягиваем крайние пиксели)
    ctx.drawImage(tmp, 0, 0, 1, TILE, cx, cy + PAD, PAD, TILE);
    ctx.drawImage(tmp, TILE - 1, 0, 1, TILE, cx + PAD + TILE, cy + PAD, PAD, TILE);
    ctx.drawImage(tmp, 0, 0, TILE, 1, cx + PAD, cy, TILE, PAD);
    ctx.drawImage(tmp, 0, TILE - 1, TILE, 1, cx + PAD, cy + PAD + TILE, TILE, PAD);
    ctx.drawImage(tmp, 0, 0, 1, 1, cx, cy, PAD, PAD);
    ctx.drawImage(tmp, TILE - 1, 0, 1, 1, cx + PAD + TILE, cy, PAD, PAD);
    ctx.drawImage(tmp, 0, TILE - 1, 1, 1, cx, cy + PAD + TILE, PAD, PAD);
    ctx.drawImage(tmp, TILE - 1, TILE - 1, 1, 1, cx + PAD + TILE, cy + PAD + TILE, PAD, PAD);
  });

  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;

  _atlas = {
    texture: tex,
    cols: COLS, rows: ROWS, cell: CELL, tile: TILE, pad: PAD,
    width: COLS * CELL, height: ROWS * CELL,
    /** UV-прямоугольник тайла: [u0,v0,u1,v1] */
    uv(i) {
      const cx = (i % COLS) * CELL + PAD, cy = Math.floor(i / COLS) * CELL + PAD;
      const w = COLS * CELL, h = ROWS * CELL;
      return [cx / w, 1 - (cy + TILE) / h, (cx + TILE) / w, 1 - cy / h];
    },
  };
  return _atlas;
}

/* ------------------------------------------------------------------ */
/* Текстуры частиц и эффектов                                          */
/* ------------------------------------------------------------------ */
function radial(size, stops, extra) {
  const c = mkCanvas(size, size);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [p, col] of stops) g.addColorStop(p, col);
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  if (extra) extra(x, size);
  return c;
}

export function buildFXTextures() {
  // мягкий клуб дыма с рваными краями
  const smoke = radial(128, [
    [0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,.82)'],
    [0.68, 'rgba(255,255,255,.32)'], [1, 'rgba(255,255,255,0)'],
  ], (x, s) => {
    const rnd = mulberry(909);
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, r = s * (0.28 + rnd() * 0.24);
      const px = s / 2 + Math.cos(a) * r, py = s / 2 + Math.sin(a) * r;
      const rad = s * (0.04 + rnd() * 0.1);
      const g = x.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, `rgba(0,0,0,${0.25 + rnd() * 0.4})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, rad, 0, Math.PI * 2); x.fill();
    }
    x.globalCompositeOperation = 'source-over';
  });

  // ядро огня
  const fire = radial(128, [
    [0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,244,190,.98)'],
    [0.42, 'rgba(255,168,44,.85)'], [0.72, 'rgba(232,74,20,.42)'], [1, 'rgba(120,20,0,0)'],
  ]);

  // искра — вытянутый блик
  const spark = mkCanvas(64, 64);
  {
    const x = spark.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,232,150,.9)');
    g.addColorStop(0.6, 'rgba(255,150,40,.35)');
    g.addColorStop(1, 'rgba(255,120,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 3; x.lineCap = 'round';
    x.beginPath(); x.moveTo(32, 6); x.lineTo(32, 58); x.stroke();
  }

  // кольцо ударной волны
  const ring = mkCanvas(256, 256);
  {
    const x = ring.getContext('2d');
    const g = x.createRadialGradient(128, 128, 74, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.62, 'rgba(255,240,214,.06)');
    g.addColorStop(0.82, 'rgba(255,246,228,.75)');
    g.addColorStop(0.93, 'rgba(255,214,150,.35)');
    g.addColorStop(1, 'rgba(255,190,120,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  }

  // блик кристалла
  const glow = radial(128, [
    [0, 'rgba(255,255,255,.95)'], [0.22, 'rgba(150,255,240,.7)'],
    [0.55, 'rgba(60,220,220,.24)'], [1, 'rgba(30,180,200,0)'],
  ]);

  // облако (для неба)
  const cloud = radial(128, [
    [0, 'rgba(255,255,255,.95)'], [0.5, 'rgba(255,255,255,.55)'],
    [0.8, 'rgba(255,255,255,.12)'], [1, 'rgba(255,255,255,0)'],
  ]);

  // Текстуры-маски: используются как множитель в линейном пространстве,
  // поэтому цветовую коррекцию к ним не применяем.
  const mk = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.LinearSRGBColorSpace;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  };

  return { smoke: mk(smoke), fire: mk(fire), spark: mk(spark), ring: mk(ring), glow: mk(glow), cloud: mk(cloud) };
}

/** Шумовая текстура для пыли на экране / гранжа. */
export function buildNoiseTexture(size = 256) {
  const c = mkCanvas(size, size);
  const x = c.getContext('2d');
  const img = x.createImageData(size, size);
  const rnd = mulberry(7777);
  for (let i = 0; i < size * size; i++) {
    const v = rnd() * 255;
    img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
