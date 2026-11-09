/**
 * Модели зарядов и обломков для стиля «rounded» (сборка YouTube Playables).
 *
 * Здесь принципиально нет кубов: динамит — связка цилиндрических шашек,
 * мега-заряд — бочонок, кассетный — контейнер с шариками, зажигательный —
 * канистра, кумулятивный — конус, гравизаряд — сфера в кольцах.
 * Обломки тоже скруглённые.
 */
import * as THREE from 'three';
import { isSoft } from '../world/Style.js';

const _mats = [];
function mat(color, opts) {
  const m = new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {}));
  _mats.push(m);
  return m;
}

/** Скруглённый «воксель»: куб, подтянутый к сфере. Для обломков. */
export function makeRoundedBox(round = 0.34, seg = 3) {
  const g = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    s.copy(v).normalize().multiplyScalar(0.5);
    v.lerp(s, round);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ */
function cyl(rt, rb, h, seg, color) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
}
function sph(r, color) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), mat(color));
}
function band(r, h, color) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), mat(color));
}
function addFuse(g, x, z, tall) {
  const f = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, tall, 6), mat(0xc8ab62));
  f.position.set(x, 0.42 + tall * 0.4, z);
  f.rotation.z = -0.3;
  g.add(f);
  const tip = sph(0.035, 0x6b5a30);
  tip.position.set(x + 0.06, 0.42 + tall * 0.8, z);
  g.add(tip);
}

/** Капсула: цилиндр со сферическими торцами. Основа мягких зарядов. */
function capsule(r, h, color) {
  const g = new THREE.Group();
  const m = mat(color);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), m);
  g.add(body);
  for (const y of [h / 2, -h / 2]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 10), m);
    cap.position.y = y;
    g.add(cap);
  }
  g.userData.material = m;
  return g;
}

/**
 * Заряды мягкого стиля (песочница на YouTube Playables).
 *
 * Здесь всё круглое и игрушечное: динамит — не связка шашек, а пузатая
 * капсула с полосой и круглым колпачком, мега — классическая бомба-шар,
 * кассетный — ягода из шариков, гравизаряд — линза с кольцом. Силуэт
 * должен читаться с высоты полёта камеры и не повторять стиль основной игры.
 */
function makeSoftCharge(key) {
  const g = new THREE.Group();
  const glow = [];

  if (key === 'mega') {
    // бомба-шар с горловиной
    const core = sph(0.36, 0x2f3644);
    core.scale.set(1, 0.94, 1);
    g.add(core); glow.push(core.material);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.075, 10, 22), mat(0xffb020));
    belt.rotation.x = Math.PI / 2;
    belt.position.y = -0.04;
    g.add(belt);
    const neck = cyl(0.10, 0.14, 0.14, 12, 0x525c6e);
    neck.position.y = 0.36; g.add(neck);
    const knob = sph(0.085, 0x6b7688); knob.position.y = 0.45; g.add(knob);
    addFuse(g, 0.02, 0, 0.22);

  } else if (key === 'cluster') {
    // ягода: шар, облепленный шариками
    const core = sph(0.26, 0x4d6b34);
    g.add(core); glow.push(core.material);
    const pts = [[0, 0.26, 0], [0.24, 0.08, 0], [-0.24, 0.08, 0],
    [0, 0.08, 0.24], [0, 0.08, -0.24], [0.15, -0.18, 0.15], [-0.15, -0.18, -0.15]];
    for (const [x, y, z] of pts) {
      const s = sph(0.125, 0x93c257);
      s.position.set(x, y, z);
      g.add(s);
    }
    addFuse(g, 0.04, 0.02, 0.18);

  } else if (key === 'napalm') {
    // пузатая колба с носиком
    const belly = sph(0.34, 0xf2761f);
    belly.scale.set(1, 0.88, 1);
    belly.position.y = -0.06;
    g.add(belly); glow.push(belly.material);
    const neck = cyl(0.12, 0.18, 0.22, 12, 0xffa445);
    neck.position.y = 0.28; g.add(neck);
    const lid = sph(0.135, 0xffd98a); lid.position.y = 0.40; g.add(lid);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.05, 8, 20), mat(0xffe0a8));
    ring.rotation.x = Math.PI / 2; ring.position.y = -0.06; g.add(ring);
    addFuse(g, 0.14, 0.04, 0.18);

  } else if (key === 'shaped') {
    // дротик: круглый корпус и длинный нос вниз
    const body = capsule(0.19, 0.30, 0x8892a4);
    body.position.y = 0.10;
    g.add(body); glow.push(body.userData.material);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.44, 16), mat(0xffcf3d));
    nose.position.y = -0.30; nose.rotation.x = Math.PI;
    g.add(nose);
    for (let i = 0; i < 3; i++) {
      const fin = sph(0.075, 0x59627a);
      const a = (i / 3) * Math.PI * 2;
      fin.position.set(Math.cos(a) * 0.19, 0.26, Math.sin(a) * 0.19);
      g.add(fin);
    }
    addFuse(g, 0.02, 0, 0.18);

  } else if (key === 'grav') {
    // линза с кольцом
    const core = sph(0.30, 0x9b6bff);
    core.scale.set(1, 0.5, 1);
    g.add(core); glow.push(core.material);
    const eye = sph(0.14, 0xeadfff); g.add(eye); glow.push(eye.material);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.045, 10, 24), mat(0x54409a));
    ring.rotation.x = Math.PI / 2; g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.03, 8, 20), mat(0x6f57c0));
    ring2.rotation.set(Math.PI / 2, 0, 0); ring2.position.y = 0.12; g.add(ring2);
    addFuse(g, 0.05, 0, 0.16);

  } else {
    // динамит: одна пузатая капсула с широкой лентой
    const body = capsule(0.235, 0.34, 0xe8452f);
    g.add(body); glow.push(body.userData.material);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.16, 16), mat(0xfaf1e2));
    g.add(belt);
    for (const y of [-0.20, 0.20]) {
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.248, 0.248, 0.06, 16), mat(0xffd0c4));
      stripe.position.y = y; g.add(stripe);
    }
    const cap = sph(0.14, 0xb02718); cap.position.y = 0.33; g.add(cap);
    addFuse(g, 0.03, 0, 0.26);
  }

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.glow = glow;
  return g;
}

/**
 * Модель заряда, вписанная в ячейку 1×1×1 с центром в нуле.
 * @param {string} key ключ взрывчатки
 */
export function makeChargeMesh(key) {
  if (isSoft()) return makeSoftCharge(key);
  const g = new THREE.Group();
  const glow = [];

  if (key === 'mega') {
    const body = cyl(0.30, 0.34, 0.78, 16, 0x3d4350);
    g.add(body); glow.push(body.material);
    for (const y of [-0.24, 0.24]) {
      const b = band(0.355, 0.10, 0xe8aa1e); b.position.y = y; g.add(b);
    }
    const cap = cyl(0.24, 0.30, 0.10, 16, 0x596273); cap.position.y = 0.43; g.add(cap);
    addFuse(g, 0.05, 0.02, 0.34);

  } else if (key === 'cluster') {
    const body = cyl(0.28, 0.32, 0.62, 14, 0x53663f);
    body.position.y = -0.08; g.add(body); glow.push(body.material);
    const rim = band(0.34, 0.08, 0xc8d6a8); rim.position.y = 0.22; g.add(rim);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2;
      const s = sph(0.115, 0x8fa86a);
      s.position.set(Math.cos(a) * 0.15, 0.33, Math.sin(a) * 0.15);
      g.add(s);
    }
    addFuse(g, 0, 0, 0.24);

  } else if (key === 'napalm') {
    const body = cyl(0.31, 0.33, 0.66, 16, 0xd4661c);
    g.add(body); glow.push(body.material);
    const belly = sph(0.34, 0xe87a2a); belly.scale.set(1, 0.55, 1); g.add(belly);
    const cap = cyl(0.13, 0.16, 0.16, 12, 0xf4c46a); cap.position.y = 0.40; g.add(cap);
    const strip = band(0.345, 0.09, 0xf9dfa0); strip.position.y = -0.18; g.add(strip);
    addFuse(g, 0.13, 0.05, 0.22);

  } else if (key === 'shaped') {
    const body = cyl(0.28, 0.28, 0.46, 16, 0x77808f);
    body.position.y = 0.14; g.add(body); glow.push(body.material);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.30, 0.42, 16), mat(0xffd24a));
    cone.position.y = -0.24; cone.rotation.x = Math.PI; g.add(cone);
    const rim = band(0.31, 0.07, 0x2c313c); rim.position.y = 0.02; g.add(rim);
    addFuse(g, 0.04, 0.02, 0.24);

  } else if (key === 'grav') {
    const core = sph(0.27, 0x8a5cff);
    g.add(core); glow.push(core.material);
    const inner = sph(0.16, 0xd8c4ff); g.add(inner); glow.push(inner.material);
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.032, 8, 20), mat(0x4a3a80));
      r.rotation.set(i * 1.05, i * 0.7, i * 0.4);
      g.add(r);
    }
    addFuse(g, 0.06, 0, 0.2);

  } else {
    // динамит: связка из трёх шашек
    const spots = [[0, -0.14], [0.17, 0.09], [-0.17, 0.09]];
    for (const [x, z] of spots) {
      const s = cyl(0.145, 0.145, 0.7, 12, 0xd23a28);
      s.position.set(x, 0, z);
      g.add(s); glow.push(s.material);
      for (const y of [-0.19, 0.19]) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.09, 12), mat(0xf2ece0));
        b.position.set(x, y, z); g.add(b);
      }
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.03, 12), mat(0x8f2418));
      cap.position.set(x, 0.36, z); g.add(cap);
    }
    const rope = band(0.30, 0.075, 0x6d5a33); g.add(rope);
    addFuse(g, 0.02, -0.12, 0.3);
  }

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.glow = glow;
  return g;
}

/* ------------------------------------------------------------------ */
function rrect(x, px, py, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  x.beginPath();
  x.moveTo(px + k, py);
  x.arcTo(px + w, py, px + w, py + h, k);
  x.arcTo(px + w, py + h, px, py + h, k);
  x.arcTo(px, py + h, px, py, k);
  x.arcTo(px, py, px + w, py, k);
  x.closePath();
}

/** Иконки мягкого стиля: те же силуэты, что у моделей — круглые. */
function softIcon(x, s, key) {
  const ball = (cx, cy, r, c0, c1) => {
    const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, c0); g.addColorStop(1, c1);
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, r, 0, 6.283); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 2.4 * s; x.stroke();
  };
  const fuse = (cx, cy) => {
    x.strokeStyle = '#c8ab62'; x.lineWidth = 3.2 * s; x.lineCap = 'round';
    x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(cx + 11 * s, cy - 8 * s, cx + 15 * s, cy + 1 * s);
    x.stroke();
    x.fillStyle = '#ffd36a';
    x.beginPath(); x.arc(cx + 16 * s, cy + 1 * s, 3.4 * s, 0, 6.283); x.fill();
  };

  if (key === 'mega') {
    ball(32 * s, 38 * s, 22 * s, '#6b7688', '#22283a');
    x.fillStyle = '#ffb020';
    x.fillRect(11 * s, 34 * s, 42 * s, 8 * s);
    fuse(34 * s, 15 * s);
  } else if (key === 'cluster') {
    ball(32 * s, 38 * s, 15 * s, '#7fae4c', '#40592a');
    for (const [dx, dy] of [[-15, -6], [15, -6], [0, -18], [-10, 12], [10, 12]]) {
      ball((32 + dx) * s, (38 + dy) * s, 8.5 * s, '#b6dd7a', '#5d8036');
    }
    fuse(34 * s, 16 * s);
  } else if (key === 'napalm') {
    ball(32 * s, 40 * s, 20 * s, '#ffa445', '#c04a08');
    x.fillStyle = '#ffd98a';
    rrect(x, 26 * s, 10 * s, 12 * s, 14 * s, 5 * s); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.4)'; x.lineWidth = 2 * s; x.stroke();
    fuse(38 * s, 12 * s);
  } else if (key === 'shaped') {
    ball(32 * s, 26 * s, 14 * s, '#aab4c6', '#4d5462');
    x.fillStyle = '#ffcf3d';
    x.beginPath(); x.moveTo(19 * s, 34 * s); x.lineTo(45 * s, 34 * s); x.lineTo(32 * s, 60 * s);
    x.closePath(); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 2.2 * s; x.stroke();
    fuse(34 * s, 12 * s);
  } else if (key === 'grav') {
    x.strokeStyle = '#54409a'; x.lineWidth = 5 * s;
    x.beginPath(); x.ellipse(32 * s, 34 * s, 27 * s, 9 * s, 0, 0, 6.283); x.stroke();
    ball(32 * s, 34 * s, 17 * s, '#e2d2ff', '#7a4de0');
    x.fillStyle = 'rgba(255,255,255,.85)';
    x.beginPath(); x.arc(32 * s, 34 * s, 5.5 * s, 0, 6.283); x.fill();
  } else {
    // динамит: пузатая капсула с белой лентой
    const g = x.createLinearGradient(14 * s, 0, 50 * s, 0);
    g.addColorStop(0, '#ff7a63'); g.addColorStop(0.4, '#e8452f'); g.addColorStop(1, '#8f2418');
    x.fillStyle = g;
    rrect(x, 15 * s, 16 * s, 34 * s, 44 * s, 17 * s); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 2.6 * s; x.stroke();
    x.fillStyle = '#faf1e2';
    x.fillRect(15 * s, 33 * s, 34 * s, 11 * s);
    x.fillStyle = 'rgba(255,208,196,.9)';
    x.fillRect(15 * s, 26 * s, 34 * s, 4 * s);
    x.fillRect(15 * s, 47 * s, 34 * s, 4 * s);
    fuse(36 * s, 14 * s);
  }
}

/** Иконка заряда для интерфейса — рисуется отдельно от атласа блоков. */
export function chargeIcon(key, size) {
  size = size || 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const s = size / 64;
  x.lineJoin = 'round';

  if (isSoft()) {
    softIcon(x, s, key);
    return 'url(' + c.toDataURL() + ')';
  }

  const stick = (cx, w, h, c0, c1, bandC) => {
    const g = x.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    g.addColorStop(0, c1); g.addColorStop(0.45, c0); g.addColorStop(1, c1);
    x.fillStyle = g;
    rrect(x, cx - w / 2, 32 * s - h / 2, w, h, w * 0.42); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 2 * s; x.stroke();
    if (bandC) {
      x.fillStyle = bandC;
      x.fillRect(cx - w / 2, 32 * s - h * 0.22, w, h * 0.16);
      x.fillRect(cx - w / 2, 32 * s + h * 0.06, w, h * 0.16);
    }
  };

  if (key === 'mega') {
    stick(32 * s, 34 * s, 44 * s, '#5b6474', '#2c313c', '#e8aa1e');
  } else if (key === 'cluster') {
    stick(32 * s, 32 * s, 38 * s, '#6c8450', '#3b4a2c', '#c8d6a8');
    x.fillStyle = '#93ad6d';
    for (let i = 0; i < 3; i++) {
      x.beginPath(); x.arc((20 + i * 12) * s, 14 * s, 6 * s, 0, 6.283); x.fill();
      x.strokeStyle = 'rgba(0,0,0,.4)'; x.lineWidth = 1.6 * s; x.stroke();
    }
  } else if (key === 'napalm') {
    stick(32 * s, 34 * s, 40 * s, '#ef8434', '#a94a12', '#f9dfa0');
    x.fillStyle = '#f4c46a';
    rrect(x, 26 * s, 6 * s, 12 * s, 10 * s, 3 * s); x.fill();
  } else if (key === 'shaped') {
    stick(32 * s, 30 * s, 32 * s, '#8b95a6', '#4d5462', '#2c313c');
    x.fillStyle = '#ffd24a';
    x.beginPath(); x.moveTo(17 * s, 44 * s); x.lineTo(47 * s, 44 * s); x.lineTo(32 * s, 60 * s);
    x.closePath(); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 2 * s; x.stroke();
  } else if (key === 'grav') {
    const g = x.createRadialGradient(26 * s, 26 * s, 2 * s, 32 * s, 32 * s, 22 * s);
    g.addColorStop(0, '#e2d2ff'); g.addColorStop(0.5, '#8a5cff'); g.addColorStop(1, '#3d2c70');
    x.fillStyle = g;
    x.beginPath(); x.arc(32 * s, 32 * s, 21 * s, 0, 6.283); x.fill();
    x.strokeStyle = '#5a48a0'; x.lineWidth = 3.4 * s;
    x.beginPath(); x.ellipse(32 * s, 32 * s, 27 * s, 10 * s, 0.5, 0, 6.283); x.stroke();
    x.beginPath(); x.ellipse(32 * s, 32 * s, 27 * s, 10 * s, -0.6, 0, 6.283); x.stroke();
  } else {
    stick(20 * s, 17 * s, 40 * s, '#e2503a', '#8f2418', '#f2ece0');
    stick(44 * s, 17 * s, 40 * s, '#e2503a', '#8f2418', '#f2ece0');
    stick(32 * s, 19 * s, 46 * s, '#ef5c44', '#9d2a1c', '#f2ece0');
    x.strokeStyle = '#c8ab62'; x.lineWidth = 3 * s; x.lineCap = 'round';
    x.beginPath(); x.moveTo(34 * s, 9 * s); x.quadraticCurveTo(46 * s, 4 * s, 50 * s, 12 * s); x.stroke();
  }
  return 'url(' + c.toDataURL() + ')';
}

export function disposeChargeMaterials() {
  for (const m of _mats) m.dispose();
  _mats.length = 0;
}
