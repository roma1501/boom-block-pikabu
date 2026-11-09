/**
 * Взрыв — центральная система.
 *
 * Слои одного взрыва:
 *   1. вспышка (короткий яркий свет + пересвет кадра);
 *   2. огненный шар из частиц с объёмом;
 *   3. ударная волна: расширяющаяся сфера + кольцо пыли по земле + искажение кадра;
 *   4. физический импульс всем телам и игроку;
 *   5. лучевой расчёт разрушения блоков;
 *   6. дым, пыль, искры, угли;
 *   7. отдача камеры, звук, цепная реакция.
 *
 * Все параметры — в config, поэтому новую взрывчатку добавить легко.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';

const _t = new THREE.Vector3();

const RING_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const RING_FRAG = /* glsl */`
uniform sampler2D map; uniform float uOpacity; uniform vec3 uColor;
varying vec2 vUv;
void main(){
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(uColor * t.rgb, t.a * uOpacity);
}`;

const SPH_VERT = /* glsl */`
varying vec3 vN; varying vec3 vV;
void main(){
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const SPH_FRAG = /* glsl */`
uniform float uOpacity; uniform vec3 uColor;
varying vec3 vN; varying vec3 vV;
void main(){
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  f = pow(f, 3.0);
  gl_FragColor = vec4(uColor * f * 2.4, f * uOpacity);
}`;

export class ExplosionSystem {
  constructor(scene, particles, physics, destruction, audio, quality, tex) {
    this.scene = scene;
    this.particles = particles;
    this.physics = physics;
    this.destruction = destruction;
    this.audio = audio;
    this.quality = quality;

    this.listeners = [];
    this.onCamera = null;      // ({shake, kick, fov, dist})
    this.onFlash = null;       // (intensity)
    this.onDistort = null;     // (worldPos, radius, strength)
    this.onBigBlast = null;    // (destroyedCount, position)
    this.onPlayerPush = null;  // (dir, force)

    // пул колец
    this.rings = [];
    this.ringPool = [];
    const ringGeo = new THREE.PlaneGeometry(1, 1);
    this.ringGeo = ringGeo;
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { map: { value: tex.ring }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0xffd9a0) } },
        vertexShader: RING_VERT, fragmentShader: RING_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(ringGeo, mat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 9;
      m.frustumCulled = false;
      scene.add(m);
      this.ringPool.push(m);
    }

    // пул сфер ударной волны
    this.spheres = [];
    this.spherePool = [];
    const sphGeo = new THREE.SphereGeometry(1, 20, 14);
    this.sphGeo = sphGeo;
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0xffe6c0) } },
        vertexShader: SPH_VERT, fragmentShader: SPH_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
      });
      const m = new THREE.Mesh(sphGeo, mat);
      m.visible = false; m.renderOrder = 10; m.frustumCulled = false;
      scene.add(m);
      this.spherePool.push(m);
    }

    // Свет вспышки.
    // ВАЖНО: лампы всегда visible, гасим их интенсивностью. Если включать
    // и выключать через visible, у three меняется состав освещения и он
    // пересобирает ВСЕ шейдеры сцены — это фриз на сотни миллисекунд
    // ровно в момент первого взрыва.
    this.lights = [];
    const lightCount = quality.name === 'low' ? 1 : 2;
    for (let i = 0; i < lightCount; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 34, 1.8);
      l.visible = true;
      scene.add(l);
      this.lights.push({ light: l, t: 0, dur: 0, peak: 0, active: false });
    }
    this.lightCursor = 0;

    this.camera = null;
    this.timeScale = 1;
    this.lastExplosionTime = -99;
    this.chainWindow = 0;
    this.chainCount = 0;
    this.implosions = [];
  }

  /* ------------------------------------------------------------- */
  /**
   * Гравитационный заряд: сначала фаза стягивания — обломки и пыль летят
   * внутрь, сфера схлопывается, звук нарастает. Потом рвёт конструкцию
   * и выбрасывает всё наружу.
   */
  implode(position, p, cfg) {
    const pos = position.clone ? position.clone() : new THREE.Vector3(position.x, position.y, position.z);
    const m = this.spherePool.find(x => !x.visible) || this.spherePool[0];
    m.visible = true;
    m.position.copy(pos);
    m.scale.setScalar(p.radius * 0.95);
    m.material.uniforms.uColor.value.setHex(0xa878ff);
    m.material.uniforms.uOpacity.value = 0.25;
    const idx = this.spheres.indexOf(m);
    if (idx >= 0) this.spheres.splice(idx, 1);
    this.implosions.push({ pos, p, cfg, t: 0, mesh: m });
    if (this.audio) this.audio.implode(pos);
  }

  _updateImplosions(dt) {
    for (let i = this.implosions.length - 1; i >= 0; i--) {
      const im = this.implosions[i];
      im.t += dt;
      const k = Math.min(1, im.t / im.p.time);

      // сфера схлопывается
      im.mesh.scale.setScalar(Math.max(0.05, im.p.radius * (1 - k) * 0.95 + 0.4));
      im.mesh.material.uniforms.uOpacity.value = 0.25 + k * 0.55;

      // притяжение тел
      for (const b of this.physics.bodies) {
        if (!b.alive) continue;
        _t.copy(im.pos).sub(b.pos);
        const d = _t.length();
        if (d > im.p.radius * 1.5 || d < 0.3) continue;
        b.wake();
        _t.multiplyScalar(1 / d);
        const f = im.p.pull * (1 - d / (im.p.radius * 1.5)) * dt * 2.4;
        b.vel.addScaledVector(_t, f);
      }

      // частицы летят внутрь
      const n = 3;
      for (let j = 0; j < n; j++) {
        const a = Math.random() * 6.283, e = Math.acos(2 * Math.random() - 1);
        const r = im.p.radius * (0.55 + Math.random() * 0.5);
        const dx = Math.sin(e) * Math.cos(a), dy = Math.cos(e), dz = Math.sin(e) * Math.sin(a);
        this.particles.emit(this.particles.spark, {
          x: im.pos.x + dx * r, y: im.pos.y + dy * r, z: im.pos.z + dz * r,
          vx: -dx * 16, vy: -dy * 16, vz: -dz * 16,
          s0: 0.14, s1: 0.03, ratio: 3.5,
          c0: 0xc9a6ff, c1: 0x6a30d0,
          o0: 1, o1: 0, life: r / 16, drag: 0, grav: 0,
        });
      }

      if (k >= 1) {
        im.mesh.visible = false;
        im.mesh.material.uniforms.uColor.value.setHex(0xffe6c0);
        this.implosions.splice(i, 1);
        // разрыв конструкции и выброс наружу
        this.destruction.implosionDamage(im.pos, im.p);
        this.explode(im.pos, im.cfg);
        this.physics.applyExplosion(im.pos, im.p.radius * 1.6, im.cfg.impulse * 0.9);
      }
    }
  }

  setCamera(c) { this.camera = c; }
  addListener(fn) { this.listeners.push(fn); }

  /* ------------------------------------------------------------- */
  explode(position, override = {}) {
    const cfg = Object.assign({}, CONFIG.explosion, override);
    const pos = position.clone ? position.clone() : new THREE.Vector3(position.x, position.y, position.z);
    const q = this.quality;

    // ---- цепная статистика ----
    const now = performance.now() / 1000;
    if (now - this.lastExplosionTime < 0.85) this.chainCount++;
    else this.chainCount = 1;
    this.lastExplosionTime = now;

    // ---- 1. вспышка ----
    const L = this.lights[this.lightCursor % this.lights.length];
    this.lightCursor++;
    L.light.position.copy(pos);
    L.light.distance = cfg.radius * 4.2;
    L.active = true;
    L.peak = 95 * cfg.soundPower;
    L.t = 0; L.dur = 0.34;

    if (this.onFlash) {
      const d = this.camera ? this.camera.position.distanceTo(pos) : 20;
      this.onFlash(Math.min(1, (cfg.radius * 1.4) / Math.max(3, d)) * 0.85);
    }

    // ---- 2. огненный шар ----
    this.particles.fireball(pos.x, pos.y, pos.z, cfg.fireballSize, cfg.soundPower);

    // ---- 3. ударная волна ----
    this.spawnRing(pos, cfg.radius * 2.35, 0.62);
    if (q.name !== 'low') this.spawnSphere(pos, cfg.radius * 1.55, 0.34);
    if (this.onDistort) this.onDistort(pos, cfg.radius, 1);

    // ---- 4. импульс телам ----
    this.physics.applyExplosion(pos, cfg.radius * 1.85, cfg.impulse * 0.5);

    // ---- отталкивание игрока ----
    if (this.onPlayerPush && this.camera) {
      const d = this.camera.position.distanceTo(pos);
      if (d < cfg.radius * 2) {
        const dir = new THREE.Vector3().subVectors(this.camera.position, pos);
        if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
        dir.normalize();
        dir.y = Math.max(dir.y, 0.25);
        const f = cfg.playerPush * Math.pow(1 - d / (cfg.radius * 2), 1.5);
        this.onPlayerPush(dir, f);
      }
    }

    // ---- 5. разрушение ----
    const res = this.destruction.blast(pos, cfg);

    // ---- 5б. шальная искра: иногда обычный взрыв оставляет очаг ----
    const fireChance = cfg.fireChance !== undefined ? cfg.fireChance : CONFIG.explosion.fireChance;
    if (this.fire && Math.random() < fireChance) {
      // поджигаем по краю кратера — в самом эпицентре гореть уже нечему
      this.fire.add(pos.x, pos.y, pos.z, cfg.radius * 0.85, 4 + Math.random() * 3, 20);
    }

    // ---- 6. дым / пыль / искры ----
    this.particles.smokeCloud(pos.x, pos.y + 0.6, pos.z, cfg.fireballSize * 1.15,
      Math.round(q.smokePuffs * (0.7 + cfg.soundPower * 0.5)), 0.5);
    this.particles.dustBurst(pos.x, pos.y, pos.z,
      q.dustOnCollapse * 0.8, 0x8a7a62, cfg.radius * 0.5, 1.25);
    this.particles.sparks(pos.x, pos.y, pos.z, Math.round(26 * cfg.soundPower), 17, 0xffe090, 0.75);
    this.particles.embers(pos.x, pos.y, pos.z, Math.round(10 * cfg.soundPower), cfg.fireballSize * 0.5);

    // ---- 7. камера ----
    if (this.onCamera && this.camera) {
      const d = Math.max(1.2, this.camera.position.distanceTo(pos));
      const near = Math.min(1, (cfg.radius * 2.4) / d);
      const dir = new THREE.Vector3().subVectors(this.camera.position, pos).normalize();
      this.onCamera({
        shake: 1.35 * near * cfg.cameraShake,
        kick: 0.55 * near * near,
        fov: 7 * near,
        dir,
        dist: d,
        near,
      });
    }

    // ---- 8. звук ----
    if (this.audio) this.audio.explosion(pos, cfg.soundPower, this.chainCount);

    // ---- 9. слушатели (цепная реакция динамита) ----
    for (const fn of this.listeners) fn(pos, cfg);

    if (this.onBigBlast) this.onBigBlast(res.count, pos, this.chainCount);
    return res;
  }

  /* ------------------------------------------------------------- */
  spawnRing(pos, maxR, life) {
    const m = this.ringPool.find(x => !x.visible) || this.ringPool[0];
    m.visible = true;
    m.position.set(pos.x, pos.y + 0.15, pos.z);
    m.scale.setScalar(0.1);
    m.userData = { t: 0, life, maxR, base: pos.y };
    if (!this.rings.includes(m)) this.rings.push(m);
  }

  spawnSphere(pos, maxR, life) {
    const m = this.spherePool.find(x => !x.visible) || this.spherePool[0];
    m.visible = true;
    m.position.copy(pos);
    m.scale.setScalar(0.2);
    m.userData = { t: 0, life, maxR };
    if (!this.spheres.includes(m)) this.spheres.push(m);
  }

  update(dt) {
    dt *= this.timeScale;
    if (this.implosions.length) this._updateImplosions(dt);
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const m = this.rings[i];
      const u = m.userData;
      u.t += dt;
      const t = u.t / u.life;
      if (t >= 1) { m.visible = false; this.rings.splice(i, 1); continue; }
      const e = 1 - Math.pow(1 - t, 2.6);
      m.scale.setScalar(0.5 + e * u.maxR);
      m.material.uniforms.uOpacity.value = Math.pow(1 - t, 1.7) * 0.95;
    }
    for (let i = this.spheres.length - 1; i >= 0; i--) {
      const m = this.spheres[i];
      const u = m.userData;
      u.t += dt;
      const t = u.t / u.life;
      if (t >= 1) { m.visible = false; this.spheres.splice(i, 1); continue; }
      const e = 1 - Math.pow(1 - t, 3);
      m.scale.setScalar(0.4 + e * u.maxR);
      m.material.uniforms.uOpacity.value = Math.pow(1 - t, 2) * 0.8;
    }
    for (const L of this.lights) {
      if (!L.active) continue;
      L.t += dt;
      const t = L.t / L.dur;
      if (t >= 1) { L.active = false; L.light.intensity = 0; continue; }
      // резкий пик и быстрый спад
      const k = t < 0.12 ? (t / 0.12) : Math.pow(1 - (t - 0.12) / 0.88, 2.4);
      L.light.intensity = L.peak * k;
      L.light.color.setHSL(0.08 - 0.02 * t, 1, 0.5 + 0.16 * (1 - t));
    }
  }

  dispose() {
    for (const m of this.ringPool) { this.scene.remove(m); m.material.dispose(); }
    for (const m of this.spherePool) { this.scene.remove(m); m.material.dispose(); }
    for (const L of this.lights) this.scene.remove(L.light);
    this.ringGeo.dispose(); this.sphGeo.dispose();
  }
}
