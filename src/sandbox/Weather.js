/**
 * Погода песочницы: дождь, снег и гроза.
 *
 * Осадки — один буфер точек, который живёт в коробке вокруг карты и
 * перезапускает упавшие капли сверху: ни одного лишнего draw call'а.
 * Гроза — единственная погода, которая вмешивается в игру: молния бьёт
 * в постройку сама, ломает блоки и поджигает дерево, поэтому карты со
 * штормом можно доламывать чужими руками, если дождаться удара.
 * Дождь при этом гасит пожары быстрее — зажигательный заряд тут слабее.
 */
import * as THREE from 'three';
import { MATERIALS } from '../world/Materials.js';

const VERT = /* glsl */`
uniform float uSize;     // размер капли в метрах
uniform float uScale;    // пикселей на метр на расстоянии 1 (даёт камера)
varying float vFade;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = max(1.0, -mv.z);
  gl_PointSize = clamp(uSize * uScale / d, 1.0, 42.0);
  // ближние капли чуть бледнее, чтобы не залеплять кадр
  vFade = clamp(d / 14.0, 0.25, 1.0) * clamp(1.0 - d / 300.0, 0.2, 1.0);
}`;

const FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uStreak;
uniform float uOpacity;
varying float vFade;
void main(){
  vec2 p = gl_PointCoord - 0.5;
  float a;
  if (uStreak > 0.5) {
    a = smoothstep(0.5, 0.0, abs(p.x) * 7.0) * smoothstep(0.5, 0.1, abs(p.y));
  } else {
    a = smoothstep(0.5, 0.0, length(p) * 2.0);
  }
  gl_FragColor = vec4(uColor, a * uOpacity * vFade);
}`;

const PRESETS = {
  clear: null,
  rain: {
    count: 1.0, size: 0.9, streak: 1, color: 0xbfe0ff, opacity: 0.5,
    speed: 34, spread: 0.9, wind: 3.4, fireDamp: 1.7, fireSpread: 0.4,
    sky: { top: 0x33506e, mid: 0x8ea2b4, bottom: 0xc0ccd6, fog: 0x9fb0bf, sun: 0xd8e2ee, hemi: 0xb6c6d6, gnd: 0x6a6e74, si: 1.1 },
    fogScale: 0.62,
  },
  snow: {
    count: 0.85, size: 0.34, streak: 0, color: 0xffffff, opacity: 0.85,
    speed: 4.2, spread: 2.6, wind: 1.6, fireDamp: 1.3, fireSpread: 0.7,
    sky: { top: 0x5c7fae, mid: 0xc2d4e6, bottom: 0xe6eef6, fog: 0xd2dfea, sun: 0xf0f6ff, hemi: 0xdce8f6, gnd: 0x8e969e, si: 1.35 },
    fogScale: 0.7,
  },
  storm: {
    count: 1.25, size: 1.15, streak: 1, color: 0xa8c8ee, opacity: 0.55,
    speed: 42, spread: 1.2, wind: 6.5, fireDamp: 2.4, fireSpread: 0.28,
    sky: { top: 0x1d2b40, mid: 0x596574, bottom: 0x8a939c, fog: 0x76818c, sun: 0xb8c4d2, hemi: 0x8e9cad, gnd: 0x4e5258, si: 0.85 },
    fogScale: 0.55,
    lightning: [7, 14],       // раз в столько секунд
  },
};

const _v = new THREE.Vector3();

export class Weather {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.kind = 'clear';
    this.preset = null;

    const cap = quality.name === 'low' ? 420 : quality.name === 'medium' ? 900 : 1600;
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.attr);
    this.geo.setDrawRange(0, 0);

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uSize: { value: 0.9 },
        uScale: { value: 700 },
        uColor: { value: new THREE.Color(0xbfe0ff) },
        uStreak: { value: 1 },
        uOpacity: { value: 0.5 },
      },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, fog: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    this.points.visible = false;
    scene.add(this.points);

    // молния: три ломаные линии, чтобы разряд выглядел объёмным
    this.boltGeo = new THREE.BufferGeometry();
    this.BOLT_SEG = 16;
    this.boltPos = new Float32Array(this.BOLT_SEG * 3 * 2 * 3);
    this.boltGeo.setAttribute('position', new THREE.BufferAttribute(this.boltPos, 3));
    this.boltMat = new THREE.LineBasicMaterial({
      color: 0xf2f8ff, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    });
    this.bolt = new THREE.LineSegments(this.boltGeo, this.boltMat);
    this.bolt.frustumCulled = false;
    this.bolt.renderOrder = 11;
    this.bolt.visible = false;
    scene.add(this.bolt);
    this.boltT = 0;

    this.boltLight = new THREE.PointLight(0xcfe4ff, 0, 120, 1.6);
    this.boltLight.visible = true;
    scene.add(this.boltLight);

    this.center = new THREE.Vector3();
    this.radius = 30;
    this.groundY = 0;
    this.topY = 40;
    this.strikeT = 0;
    this.count = 0;

    // связи с игрой
    this.world = null;
    this.destruction = null;
    this.fire = null;
    this.particles = null;
    this.audio = null;
    this.onFlash = null;      // (сила) — засветка кадра
    this.onShake = null;      // (сила)
    this.onStrike = null;     // (позиция, число блоков)
    this.enabled = true;
  }

  setQuality(q) {
    this.quality = q;
    if (this.preset) this._resize();
  }

  /**
   * Пересчёт размера капли в пиксели.
   * Без этого капля рядом с камерой раздувается на пол-экрана.
   */
  setProjection(pixelHeight, fovDeg) {
    const f = Math.tan((fovDeg * Math.PI / 180) * 0.5);
    this.mat.uniforms.uScale.value = (pixelHeight * 0.5) / Math.max(0.05, f);
  }

  /** Куда сыплется: коробка вокруг постройки. */
  setArea(center, radius, groundY) {
    this.center.copy(center);
    this.radius = Math.max(14, radius);
    this.groundY = groundY !== undefined ? groundY : center.y - 6;
    this.topY = this.groundY + Math.max(34, this.radius * 1.1);
    if (this.preset) this._fill();
  }

  /** Включает погоду. sceneMgr нужен, чтобы перекрасить небо и туман. */
  set(kind, sceneMgr) {
    this.kind = PRESETS[kind] ? kind : 'clear';
    this.preset = PRESETS[this.kind];
    this.sceneMgr = sceneMgr;
    if (!this.preset) {
      this.points.visible = false;
      this.geo.setDrawRange(0, 0);
      this.count = 0;
      this.bolt.visible = false;
      this.boltLight.intensity = 0;
      // облака могли остаться серыми после грозы
      if (sceneMgr) for (const sp of sceneMgr.cloudSprites) sp.material.color.setHex(0xffffff);
      return;
    }
    const p = this.preset;
    this.mat.uniforms.uSize.value = p.size;
    this.mat.uniforms.uColor.value.setHex(p.color);
    this.mat.uniforms.uStreak.value = p.streak;
    this.mat.uniforms.uOpacity.value = p.opacity;
    this.points.visible = true;
    this._resize();
    this._fill();
    this.strikeT = p.lightning ? p.lightning[0] * (0.4 + Math.random() * 0.6) : 0;
    if (sceneMgr && p.sky) this._applySky(sceneMgr, p);
  }

  _applySky(sceneMgr, p) {
    const s = p.sky;
    sceneMgr.skyMat.uniforms.uTop.value.setHex(s.top);
    sceneMgr.skyMat.uniforms.uMid.value.setHex(s.mid);
    sceneMgr.skyMat.uniforms.uBottom.value.setHex(s.bottom);
    sceneMgr.skyMat.uniforms.uSun.value.setHex(s.sun);
    sceneMgr.scene.fog.color.setHex(s.fog);
    sceneMgr.scene.fog.far *= p.fogScale;
    sceneMgr.scene.fog.near = sceneMgr.scene.fog.far * 0.3;
    sceneMgr.hemi.color.setHex(s.hemi);
    sceneMgr.hemi.groundColor.setHex(s.gnd);
    sceneMgr.sun.color.setHex(s.sun);
    sceneMgr.sun.intensity = s.si;
    for (const sp of sceneMgr.cloudSprites) sp.material.color.setHex(s.gnd);
  }

  _resize() {
    const base = this.quality.name === 'low' ? 380 : this.quality.name === 'medium' ? 820 : 1500;
    this.count = Math.min(this.cap, Math.round(base * this.preset.count));
    this.geo.setDrawRange(0, this.count);
  }

  _fill() {
    const R = this.radius * 1.25;
    for (let i = 0; i < this.count; i++) this._respawn(i, R, true);
    this.attr.needsUpdate = true;
  }

  _respawn(i, R, anywhere) {
    const p = this.preset;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * (R || this.radius * 1.25);
    this.pos[i * 3] = this.center.x + Math.cos(a) * r;
    this.pos[i * 3 + 1] = anywhere
      ? this.groundY + Math.random() * (this.topY - this.groundY)
      : this.topY - Math.random() * 4;
    this.pos[i * 3 + 2] = this.center.z + Math.sin(a) * r;
    this.vel[i * 3] = (Math.random() - 0.5) * p.spread + p.wind * 0.3;
    this.vel[i * 3 + 1] = -p.speed * (0.75 + Math.random() * 0.5);
    this.vel[i * 3 + 2] = (Math.random() - 0.5) * p.spread + p.wind * 0.12;
  }

  /* ------------------------------------------------------------- */
  update(dt, time) {
    if (this.preset && this.count) this._move(dt, time);
    this._updateBolt(dt);
    if (!this.preset || !this.enabled) return;
    if (this.fire && this.preset.fireDamp > 1) this._dampFire(dt);
    if (this.preset.lightning && this.world) {
      this.strikeT -= dt;
      if (this.strikeT <= 0) {
        const [a, b] = this.preset.lightning;
        this.strikeT = a + Math.random() * (b - a);
        this.strike();
      }
    }
  }

  _move(dt, time) {
    const R = this.radius * 1.25;
    const gust = 1 + Math.sin(time * 0.7) * 0.35;
    const floor = this.groundY - 2;
    for (let i = 0; i < this.count; i++) {
      const k = i * 3;
      this.pos[k] += this.vel[k] * dt * gust;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt * gust;
      if (this.pos[k + 1] < floor) this._respawn(i, R, false);
    }
    this.attr.needsUpdate = true;
  }

  /**
   * Мокрое дерево горит хуже: пламя реже перекидывается на соседей
   * и быстрее доедает само себя. Под ливнем зажигательный заряд
   * оставляет очаг, а не пожар на полкарты.
   */
  applyFireRules() {
    if (!this.fire) return;
    this.fire.spreadMul = this.preset ? (this.preset.fireSpread || 1) : 1;
  }

  _dampFire(dt) {
    const extra = (this.preset.fireDamp - 1) * dt;
    for (const f of this.fire.burning.values()) f.t += extra;
  }

  /* ------------------------------------------------------------- */
  /** Разряд в случайную высокую точку постройки. */
  strike(target) {
    const W = this.world;
    if (!W) return;
    let pt = target || this._pickTarget();
    if (!pt) return;

    // ломаная от туч до цели
    const top = new THREE.Vector3(pt.x + (Math.random() - 0.5) * 10, this.topY + 16, pt.z + (Math.random() - 0.5) * 10);
    let w = 0;
    for (let line = 0; line < 3; line++) {
      const jitter = 0.5 + line * 0.85;
      let prev = top.clone();
      for (let s = 1; s <= this.BOLT_SEG; s++) {
        const t = s / this.BOLT_SEG;
        const cur = new THREE.Vector3().lerpVectors(top, pt, t);
        if (s < this.BOLT_SEG) {
          cur.x += (Math.random() - 0.5) * jitter * (1 - t) * 6;
          cur.z += (Math.random() - 0.5) * jitter * (1 - t) * 6;
        }
        this.boltPos[w++] = prev.x; this.boltPos[w++] = prev.y; this.boltPos[w++] = prev.z;
        this.boltPos[w++] = cur.x; this.boltPos[w++] = cur.y; this.boltPos[w++] = cur.z;
        prev = cur;
      }
    }
    this.boltGeo.attributes.position.needsUpdate = true;
    this.bolt.visible = true;
    this.boltT = 0.42;
    this.boltLight.position.copy(pt).setY(pt.y + 6);

    if (this.onFlash) this.onFlash(0.75);
    if (this.onShake) this.onShake(0.5);

    // сам удар: узкий, но очень злой
    const hit = this._damage(pt);
    if (this.audio) this.audio.thunder(pt, 1);
    if (this.onStrike) this.onStrike(pt, hit);
  }

  _pickTarget() {
    const W = this.world;
    // ищем верхушки — молния бьёт в самое высокое, как ей и положено
    let best = null, bestY = -1;
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(this.center.x + (Math.random() - 0.5) * this.radius * 1.3);
      const z = Math.floor(this.center.z + (Math.random() - 0.5) * this.radius * 1.3);
      const y = W.groundAt(x, z, W.sy - 1);
      if (y < 0) continue;
      const idx = W.idx(x, y, z);
      if (idx < 0) continue;
      const m = W.blocks[idx];
      if (!m || MATERIALS[m].indestructible) continue;
      if (y > bestY) { bestY = y; best = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5); }
    }
    return best;
  }

  /** Молния выбивает блоки вокруг точки удара и поджигает дерево. */
  _damage(pt) {
    const D = this.destruction;
    if (!D) return 0;
    const res = D.blast(pt, {
      radius: 5.2, power: 26, impulse: 30, damageRate: 5.2,
      structuralDamage: 1,
    });
    if (this.particles) {
      this.particles.sparks(pt.x, pt.y, pt.z, 26, 20, 0xdfefff, 0.5);
      this.particles.dustBurst(pt.x, pt.y, pt.z, 10, 0x8f9aa6, 2.4, 1.3);
      this.particles.smokeCloud(pt.x, pt.y + 0.6, pt.z, 2.2, 6, 0.4);
    }
    if (this.fire && Math.random() < 0.55) {
      this.fire.add(pt.x, pt.y, pt.z, 3.4, 6 + Math.random() * 4, 30);
    }
    return res ? res.count : 0;
  }

  _updateBolt(dt) {
    if (this.boltT <= 0) {
      if (this.bolt.visible) { this.bolt.visible = false; this.boltLight.intensity = 0; }
      return;
    }
    this.boltT -= dt;
    const k = Math.max(0, this.boltT / 0.42);
    // мигание: разряд гаснет не ровно, а вспышками
    const flick = 0.35 + 0.65 * Math.abs(Math.sin(this.boltT * 46));
    this.boltMat.opacity = k * flick;
    this.boltLight.intensity = 140 * k * k * flick;
    if (this.boltT <= 0) { this.bolt.visible = false; this.boltLight.intensity = 0; }
  }

  /** Показать движку молнию заранее — иначе первый разряд соберёт шейдер. */
  warmup(y) {
    for (let i = 0; i < this.boltPos.length; i += 3) {
      this.boltPos[i] = 0;
      this.boltPos[i + 1] = y + (i % 6 ? 1 : 0);
      this.boltPos[i + 2] = 0;
    }
    this.boltGeo.attributes.position.needsUpdate = true;
    this.bolt.visible = true;
    this.boltMat.opacity = 0.02;
  }

  clear() {
    this.boltT = 0;
    this.bolt.visible = false;
    this.boltLight.intensity = 0;
  }

  dispose() {
    this.scene.remove(this.points);
    this.scene.remove(this.bolt);
    this.scene.remove(this.boltLight);
    this.geo.dispose(); this.mat.dispose();
    this.boltGeo.dispose(); this.boltMat.dispose();
  }
}
