/**
 * Частицы: огонь, дым, пыль, искры, угли, осколки.
 *
 * Все частицы — инстансированные билборды с собственным шейдером.
 * Три пакета (дым / огонь / искры) = три draw call'а независимо от количества.
 * Искры дополнительно вытягиваются вдоль вектора скорости прямо в вершинном
 * шейдере, поэтому выглядят как летящие трассеры, а не как точки.
 */
import * as THREE from 'three';
import { MATERIALS } from '../world/Materials.js';

const VERT = /* glsl */`
attribute vec3 aPos;
attribute vec2 aSize;
attribute vec3 aColor;
attribute float aOpacity;
attribute float aRot;
#ifdef ALIGN_VEL
attribute vec3 aVel;
#endif
varying vec2 vUv;
varying vec3 vColor;
varying float vOpacity;
void main(){
  vUv = uv;
  vColor = aColor;
  vOpacity = aOpacity;
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
  vec2 q = position.xy * aSize;
#ifdef ALIGN_VEL
  vec3 vv = (modelViewMatrix * vec4(aVel, 0.0)).xyz;
  vec2 d = vv.xy;
  float L = length(d);
  vec2 dir = L > 1e-4 ? d / L : vec2(0.0, 1.0);
  vec2 perp = vec2(-dir.y, dir.x);
  vec2 off = perp * q.x + dir * q.y;
#else
  float c = cos(aRot), s = sin(aRot);
  vec2 off = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
#endif
  mv.xy += off;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */`
uniform sampler2D map;
varying vec2 vUv;
varying vec3 vColor;
varying float vOpacity;
void main(){
  vec4 t = texture2D(map, vUv);
  float a = t.a * vOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * t.rgb, a);
}`;

class Batch {
  constructor(scene, texture, capacity, additive, alignVel, renderOrder) {
    this.capacity = capacity;
    this.count = 0;
    const plane = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = plane.index;
    geo.attributes.position = plane.attributes.position;
    geo.attributes.uv = plane.attributes.uv;
    geo.instanceCount = 0;

    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aOpacity = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPos', this.aPos);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aOpacity', this.aOpacity);
    geo.setAttribute('aRot', this.aRot);
    if (alignVel) {
      this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aVel', this.aVel);
    }
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      defines: alignVel ? { ALIGN_VEL: '' } : {},
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.geo = geo;
    this.mat = mat;
    scene.add(this.mesh);
    this.particles = [];
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

const _c0 = new THREE.Color(), _c1 = new THREE.Color();

export class ParticleSystem {
  constructor(scene, quality, tex) {
    this.scene = scene;
    this.quality = quality;
    const B = quality.particleBudget;
    this.smoke = new Batch(scene, tex.smoke, Math.floor(B * 0.42), false, false, 6);
    this.fire = new Batch(scene, tex.fire, Math.floor(B * 0.36), true, false, 7);
    this.spark = new Batch(scene, tex.spark, Math.floor(B * 0.26), true, true, 8);
    this.batches = [this.smoke, this.fire, this.spark];
    this.world = null;
    this.wind = new THREE.Vector3(0.35, 0, 0.18);
    this.time = 0;
    this.timeScale = 1;
  }

  setWorld(w) { this.world = w; }

  get total() { return this.smoke.count + this.fire.count + this.spark.count; }

  _alloc(batch) {
    if (batch.count >= batch.capacity) {
      // вытесняем самую старую частицу
      let oldest = 0, best = -1;
      for (let i = 0; i < batch.count; i++) {
        const p = batch.particles[i];
        const r = p.life / p.maxLife;
        if (r > best) { best = r; oldest = i; }
      }
      return batch.particles[oldest];
    }
    let p = batch.particles[batch.count];
    if (!p) { p = {}; batch.particles[batch.count] = p; }
    batch.count++;
    return p;
  }

  /* ------------------------------------------------------------- */
  /* Базовый спавн                                                  */
  /* ------------------------------------------------------------- */
  emit(batch, o) {
    const p = this._alloc(batch);
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.s0 = o.s0; p.s1 = o.s1 !== undefined ? o.s1 : o.s0;
    p.ratio = o.ratio || 1;
    p.rot = o.rot !== undefined ? o.rot : Math.random() * 6.283;
    p.rotV = o.rotV !== undefined ? o.rotV : (Math.random() - 0.5) * 2;
    p.c0 = o.c0; p.c1 = o.c1 !== undefined ? o.c1 : o.c0;
    p.o0 = o.o0 !== undefined ? o.o0 : 1;
    p.o1 = o.o1 !== undefined ? o.o1 : 0;
    p.oCurve = o.oCurve || 0;
    p.oScale = o.oScale !== undefined ? o.oScale : 1;
    p.life = 0;
    p.maxLife = o.life;
    p.drag = o.drag !== undefined ? o.drag : 1.2;
    p.grav = o.grav !== undefined ? o.grav : 0;
    p.windK = o.wind || 0;
    p.collide = o.collide || 0;
    p.bounce = o.bounce || 0;
    return p;
  }

  /* ------------------------------------------------------------- */
  /* Пресеты                                                        */
  /* ------------------------------------------------------------- */

  /** Ядро взрыва: расширяющийся огненный шар. */
  fireball(x, y, z, size, power = 1) {
    const q = this.quality;
    const n = Math.max(7, Math.round(16 * power * (q.particleBudget / 900)));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 0.5) * size * 0.4;
      const sp = 3.4 + Math.random() * 7.5 * power;
      const dx = Math.sin(b) * Math.cos(a), dy = Math.cos(b) * 0.72 + 0.36, dz = Math.sin(b) * Math.sin(a);
      this.emit(this.fire, {
        x: x + dx * r, y: y + dy * r, z: z + dz * r,
        vx: dx * sp, vy: dy * sp + 1.4, vz: dz * sp,
        s0: 0.5 + Math.random() * 0.6, s1: 1.5 + Math.random() * 1.4,
        c0: 0xffe9b0, c1: 0xd83a08,
        o0: 1, o1: 0, oCurve: 1, oScale: 0.62,
        life: 0.32 + Math.random() * 0.42,
        drag: 3.4, grav: 3.6,
      });
    }
    // яркое ядро — короткое, чтобы не выжигать кадр
    for (let i = 0; i < 3; i++) {
      this.emit(this.fire, {
        x, y, z,
        s0: size * 0.34, s1: size * (0.6 + i * 0.2),
        c0: 0xfff2d0, c1: 0xff9a30,
        o0: 1, o1: 0, oCurve: 1, oScale: 0.7 - i * 0.14,
        life: 0.13 + i * 0.05, drag: 1, grav: 0,
      });
    }
  }

  /** Клубы дыма после взрыва — живут долго и медленно расходятся. */
  smokeCloud(x, y, z, size, count, dark = 0.55) {
    const n = Math.min(count, this.quality.smokePuffs);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const r = Math.random() * size * 0.55;
      const v = 0.55 + Math.random() * 0.9;
      const g = Math.round(96 * dark + Math.random() * 46);
      const c = (g << 16) | (Math.round(g * 0.96) << 8) | Math.round(g * 0.92);
      this.emit(this.smoke, {
        x: x + Math.cos(a) * r, y: y + Math.random() * size * 0.4, z: z + Math.sin(a) * r,
        vx: Math.cos(a) * v, vy: 0.9 + Math.random() * 1.5, vz: Math.sin(a) * v,
        s0: 0.9 + Math.random() * 0.9, s1: 2.4 + Math.random() * 2.2,
        c0: c, c1: 0x76767e,
        o0: 0.0, o1: 0, oCurve: 2, oScale: 0.40,
        life: 2.2 + Math.random() * 3.4,
        drag: 0.65, grav: 0.55, wind: 1, rotV: (Math.random() - 0.5) * 0.9,
      });
    }
  }

  /** Пыль — расходится по земле, светлее дыма. */
  dustBurst(x, y, z, count, colorHex = 0x9a8d78, spread = 1.6, scale = 1) {
    const n = Math.min(Math.round(count), this.quality.dustOnCollapse * 2);
    _c0.setHex(colorHex, THREE.SRGBColorSpace);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const sp = 1.6 + Math.random() * 4.4;
      const tint = 0.8 + Math.random() * 0.45;
      const col = (Math.min(255, _c0.r * 255 * tint + 54) << 16) |
        (Math.min(255, _c0.g * 255 * tint + 52) << 8) |
        Math.min(255, _c0.b * 255 * tint + 48);
      this.emit(this.smoke, {
        x: x + (Math.random() - 0.5) * spread, y: y + Math.random() * 0.5, z: z + (Math.random() - 0.5) * spread,
        vx: Math.cos(a) * sp, vy: 0.5 + Math.random() * 1.5, vz: Math.sin(a) * sp,
        s0: (0.45 + Math.random() * 0.5) * scale, s1: (1.4 + Math.random() * 1.5) * scale,
        c0: col, c1: col,
        o0: 0, o1: 0, oCurve: 2, oScale: 0.34,
        life: 1.4 + Math.random() * 2.2,
        drag: 1.5, grav: 0.28, wind: 0.7,
      });
    }
  }

  /** Искры — быстрые вытянутые трассеры. */
  sparks(x, y, z, count, speed = 12, colorHex = 0xffd070, life = 0.5) {
    const n = Math.min(count, Math.floor(this.spark.capacity * 0.35));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.35 + Math.random() * 0.95);
      const dx = Math.sin(b) * Math.cos(a), dy = Math.cos(b), dz = Math.sin(b) * Math.sin(a);
      this.emit(this.spark, {
        x, y, z,
        vx: dx * sp, vy: dy * sp + 2.4, vz: dz * sp,
        s0: 0.16 + Math.random() * 0.12, s1: 0.03,
        ratio: 4.5,
        c0: colorHex, c1: 0xff5a10,
        o0: 1, o1: 0, life: life * (0.5 + Math.random()),
        drag: 0.9, grav: 14, collide: 1, bounce: 0.4,
      });
    }
  }

  /** Медленно тлеющие угли. */
  embers(x, y, z, count, radius = 2) {
    const n = Math.min(count, 24);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      this.emit(this.fire, {
        x: x + Math.cos(a) * Math.random() * radius,
        y: y + Math.random() * radius * 0.6,
        z: z + Math.sin(a) * Math.random() * radius,
        vx: (Math.random() - 0.5) * 1.2, vy: 0.6 + Math.random() * 1.6, vz: (Math.random() - 0.5) * 1.2,
        s0: 0.1 + Math.random() * 0.1, s1: 0.02,
        c0: 0xffb040, c1: 0xd02000,
        o0: 1, o1: 0, life: 1.1 + Math.random() * 1.9,
        drag: 0.8, grav: -0.6, wind: 0.8,
      });
    }
  }

  /** Разрушение конкретного блока — эффекты зависят от материала. */
  blockBurst(x, y, z, mid, dir, intensity = 1) {
    const M = MATERIALS[mid];
    if (!M) return;
    const q = this.quality;
    const budget = q.particleBudget;
    const s = M.sound;
    const n = Math.max(1, Math.round((budget > 1200 ? 3 : budget > 600 ? 2 : 1) * intensity));

    this.dustBurst(x, y, z, n * 1.4, M.color, 0.9);

    if (s === 'glass') {
      this.sparks(x, y, z, n * 2, 6, 0xcdf4ff, 0.55);
    } else if (s === 'wood') {
      if (Math.random() < 0.4 * intensity) this.sparks(x, y, z, n, 5, 0xd8a860, 0.4);
    } else if (s === 'stone') {
      if (Math.random() < 0.25 * intensity) this.sparks(x, y, z, n, 5, 0xfff0c0, 0.3);
    } else if (s === 'metal') {
      this.sparks(x, y, z, n * 2, 10, 0xfff4d0, 0.45);
    }
  }

  /* ------------------------------------------------------------- */
  update(dt) {
    dt *= this.timeScale;
    if (dt <= 0) return;
    this.time += dt;
    const W = this.world;
    const wx = this.wind.x * (1 + Math.sin(this.time * 0.31) * 0.4);
    const wz = this.wind.z * (1 + Math.cos(this.time * 0.23) * 0.4);

    for (const B of this.batches) {
      const arr = B.particles;
      const P = B.aPos.array, S = B.aSize.array, C = B.aColor.array,
        O = B.aOpacity.array, R = B.aRot.array;
      const V = B.aVel ? B.aVel.array : null;
      let n = B.count;
      for (let i = 0; i < n; i++) {
        const p = arr[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          // swap-remove
          n--;
          if (i !== n) { arr[i] = arr[n]; arr[n] = p; }
          i--;
          continue;
        }
        const t = p.life / p.maxLife;

        const d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d; p.vy *= d; p.vz *= d;
        p.vy -= p.grav * dt;
        if (p.windK) { p.vx += wx * p.windK * dt; p.vz += wz * p.windK * dt; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.rot += p.rotV * dt;

        if (p.collide && W) {
          if (W.get(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) {
            p.y = Math.floor(p.y) + 1.02;
            p.vy = Math.abs(p.vy) * p.bounce;
            p.vx *= 0.5; p.vz *= 0.5;
            if (p.bounce < 0.12) { p.life = p.maxLife; }
          }
        }

        const size = p.s0 + (p.s1 - p.s0) * t;
        let op;
        if (p.oCurve === 1) op = Math.pow(1 - t, 1.5);
        else if (p.oCurve === 2) op = Math.sin(Math.min(1, t * 1.9) * Math.PI);
        else op = p.o0 + (p.o1 - p.o0) * t;
        op *= p.oScale;

        _c0.setHex(p.c0, THREE.SRGBColorSpace);
        if (p.c1 !== p.c0) { _c1.setHex(p.c1, THREE.SRGBColorSpace); _c0.lerp(_c1, t); }

        const o3 = i * 3, o2 = i * 2;
        P[o3] = p.x; P[o3 + 1] = p.y; P[o3 + 2] = p.z;
        S[o2] = size; S[o2 + 1] = size * p.ratio;
        C[o3] = _c0.r; C[o3 + 1] = _c0.g; C[o3 + 2] = _c0.b;
        O[i] = op;
        R[i] = p.rot;
        if (V) { V[o3] = p.vx; V[o3 + 1] = p.vy; V[o3 + 2] = p.vz; }
      }
      B.count = n;
      B.geo.instanceCount = n;
      if (n > 0) {
        B.aPos.needsUpdate = true; B.aSize.needsUpdate = true;
        B.aColor.needsUpdate = true; B.aOpacity.needsUpdate = true; B.aRot.needsUpdate = true;
        if (B.aVel) B.aVel.needsUpdate = true;
      }
    }
  }

  clear() {
    for (const B of this.batches) { B.count = 0; B.geo.instanceCount = 0; }
  }

  dispose() {
    for (const B of this.batches) B.dispose(this.scene);
  }
}
