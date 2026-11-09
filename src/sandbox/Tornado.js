/**
 * Торнадо — награда за две просмотренные рекламы.
 *
 * Это не «взрыв побольше»: смерч живёт двенадцать секунд, сам гуляет по
 * карте и всё это время выдирает блоки по своему пути, поднимая обломки
 * в воздух. Тонкие деревянные постройки он съедает целиком, камень —
 * обгрызает. Считается как обычное разрушение, поэтому проценты капают.
 */
import * as THREE from 'three';
import { MATERIALS } from '../world/Materials.js';
import { FLAG_TERRAIN } from '../world/VoxelWorld.js';

const FUNNEL_VERT = /* glsl */`
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main(){
  vUv = uv;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const FUNNEL_FRAG = /* glsl */`
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main(){
  float y = vUv.y;
  // закрученные полосы пыли: чем ниже, тем быстрее вращение
  float tw = uTime * (3.0 + (1.0 - y) * 5.5);
  float sw = vUv.x * 6.2831 * 4.0 + tw + y * 7.0;
  float band = 0.5 + 0.5 * sin(sw);
  float band2 = 0.5 + 0.5 * sin(sw * 2.3 - uTime * 4.0 + y * 13.0);
  float a = 0.22 + 0.62 * band * band + 0.22 * band2 * band2;
  // силуэт трубы: по краям стенка видна вскользь и оттого плотнее
  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  a *= mix(0.55, 1.35, f);
  a *= smoothstep(0.0, 0.08, y) * smoothstep(1.0, 0.62, y);
  gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0) * uOpacity);
}`;

const _v = new THREE.Vector3();

export class Tornado {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;

    // воронка: конус, широкий сверху
    this.geo = new THREE.CylinderGeometry(1, 0.22, 1, 26, 10, true);
    this.geo.translate(0, 0.5, 0);        // основание в нуле
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color(0x7d7263) },
      },
      vertexShader: FUNNEL_VERT, fragmentShader: FUNNEL_FRAG,
      // без тумана: у своего шейдера нет его uniform'ов, а он бы их потребовал
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 7;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // внутреннее ядро — плотнее и темнее
    this.core = new THREE.Mesh(this.geo, this.mat.clone());
    this.core.material.uniforms.uColor.value.setHex(0x4a4238);
    this.core.visible = false;
    this.core.renderOrder = 6;
    this.core.frustumCulled = false;
    scene.add(this.core);

    this.alive = false;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.t = 0;
    this.life = 12;
    this.radius = 8.5;
    this.height = 36;
    this.baseY = 0;
    this.ripT = 0;
    this.dustT = 0;
    this.blocks = 0;
    this.onBlocks = null;
  }

  /**
   * @param ctx {world, destruction, physics, particles, audio}
   * @param pos точка появления
   * @param bounds {cx, cz, r} куда смерчу можно уходить
   */
  spawn(ctx, pos, bounds) {
    this.world = ctx.world;
    this.destruction = ctx.destruction;
    this.physics = ctx.physics;
    this.particles = ctx.particles;
    this.audio = ctx.audio;
    this.bounds = bounds;

    this.pos.set(pos.x, pos.y, pos.z);
    this.baseY = pos.y;
    this.alive = true;
    this.t = 0;
    this.blocks = 0;
    this.radius = 8.5;
    this.height = 36;
    const a = Math.random() * Math.PI * 2;
    this.vel.set(Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4);

    this.mesh.visible = true;
    this.core.visible = true;
    this.mesh.position.copy(this.pos);
    this.core.position.copy(this.pos);
    if (this.audio) this.audio.startAmbient('tornado', 0.6);
  }

  /* ------------------------------------------------------------- */
  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    const k = Math.min(1, this.t / this.life);
    // раскрутка в начале и затухание в конце
    const grow = Math.min(1, this.t / 1.4) * (1 - Math.pow(Math.max(0, k - 0.75) / 0.25, 2));
    const R = this.radius * (0.45 + grow * 0.55);

    this._drift(dt);

    // воронка
    this.mesh.position.set(this.pos.x, this.baseY - 1, this.pos.z);
    this.mesh.scale.set(R * 1.75, this.height * (0.5 + grow * 0.5), R * 1.75);
    this.mesh.material.uniforms.uTime.value += dt;
    this.mesh.material.uniforms.uOpacity.value = 0.92 * grow;
    this.core.position.copy(this.mesh.position);
    this.core.scale.set(R * 0.9, this.height * (0.45 + grow * 0.45), R * 0.9);
    this.core.material.uniforms.uTime.value += dt * 1.6;
    this.core.material.uniforms.uOpacity.value = 0.95 * grow;

    this._forces(dt, R * 2.1);

    this.ripT -= dt;
    if (this.ripT <= 0 && grow > 0.35) {
      this.ripT = 0.07;
      this._rip(R);
    }

    this.dustT -= dt;
    if (this.dustT <= 0) {
      this.dustT = 0.06;
      this._dust(R, grow);
    }

    if (this.audio) this.audio.setAmbientLevel('tornado', 0.35 + grow * 0.65);

    if (this.t >= this.life) this.stop();
  }

  /** Смерч бродит сам, но не уходит с острова. */
  _drift(dt) {
    const b = this.bounds;
    this.vel.x += (Math.random() - 0.5) * dt * 3.2;
    this.vel.z += (Math.random() - 0.5) * dt * 3.2;
    if (b) {
      const dx = this.pos.x - b.cx, dz = this.pos.z - b.cz;
      const d = Math.hypot(dx, dz);
      if (d > b.r * 0.72) {
        // мягко разворачиваем к центру
        this.vel.x -= (dx / d) * dt * 9;
        this.vel.z -= (dz / d) * dt * 9;
      }
    }
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const max = 3.4;
    if (sp > max) { this.vel.x *= max / sp; this.vel.z *= max / sp; }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
  }

  /** Закручивает всё, что уже летает. */
  _forces(dt, R2) {
    const bodies = this.physics.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (!b.alive) continue;
      const dx = b.pos.x - this.pos.x, dz = b.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > R2 || b.pos.y > this.baseY + this.height) continue;
      b.wake();
      const inv = 1 / Math.max(0.7, d);
      const pull = 1 - d / R2;
      const tx = -dz * inv, tz = dx * inv;
      const spin = 34 * pull;
      const suck = 17 * pull;
      b.vel.x += (tx * spin - dx * inv * suck) * dt;
      b.vel.z += (tz * spin - dz * inv * suck) * dt;
      b.vel.y += (38 + 30 * pull) * dt;
      b.angVel.y += 6 * pull * dt;
    }
  }

  /** Выдирает блоки по столбу смерча. */
  _rip(R) {
    const W = this.world, D = this.destruction;
    if (!W || !D) return;
    const cx = Math.floor(this.pos.x), cz = Math.floor(this.pos.z);
    const ri = Math.ceil(R);
    const destroyed = [];
    let budget = 46;
    const top = this.baseY + this.height * 0.8;

    for (let dz = -ri; dz <= ri && budget > 0; dz++) {
      for (let dx = -ri; dx <= ri && budget > 0; dx++) {
        const d = Math.hypot(dx, dz);
        if (d > R) continue;
        const x = cx + dx, z = cz + dz;
        const edge = 1 - d / R;
        for (let y = Math.floor(top); y >= this.baseY - 1 && budget > 0; y--) {
          const idx = W.idx(x, y, z);
          if (idx < 0) continue;
          const m = W.blocks[idx];
          if (!m) continue;
          if (W.flags[idx] & FLAG_TERRAIN) continue;
          const mat = MATERIALS[m];
          if (mat.indestructible) continue;
          const soft = Math.min(1, 260 / (mat.hp + 60));
          if (Math.random() > 0.34 * soft * (0.35 + edge)) continue;
          destroyed.push(x, y, z, m);
          W.blocks[idx] = 0; W.hp[idx] = 0; W.flags[idx] = 0;
          W.solidCount--;
          W.markDirty(x, y, z);
          budget--;
        }
      }
    }

    if (!destroyed.length) return;
    this.blocks += destroyed.length / 4;
    // обломки выбрасывает вверх от оси — дальше их подхватывают силы смерча
    _v.set(this.pos.x, this.baseY - 2, this.pos.z);
    D.spawnDestructionFX(destroyed, _v, { radius: R * 1.6, impulse: 26, damageRate: 1 });
    D.destroyedTotal += destroyed.length / 4;
    D.structural.requestAnalysis();
    if (this.onBlocks) this.onBlocks(destroyed.length / 4);
  }

  _dust(R, grow) {
    const p = this.particles;
    if (!p) return;
    const n = this.quality.name === 'low' ? 1 : this.quality.name === 'medium' ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const h = Math.random();
      const r = R * (0.7 + h * 1.1);
      const x = this.pos.x + Math.cos(a) * r;
      const z = this.pos.z + Math.sin(a) * r;
      const y = this.baseY + h * this.height * 0.8;
      p.emit(p.smoke, {
        x, y, z,
        vx: -Math.sin(a) * 16 - Math.cos(a) * 3,
        vy: 6 + Math.random() * 8,
        vz: Math.cos(a) * 16 - Math.sin(a) * 3,
        s0: 1.6 + Math.random() * 1.6, s1: 4.5,
        c0: 0x9a8d78, c1: 0x6e6558,
        o0: 0, o1: 0, oCurve: 2, oScale: 0.5 * grow,
        life: 1.1 + Math.random() * 0.7, drag: 0.9, grav: -1.2, wind: 0,
      });
    }
    // пыль у основания
    p.dustBurst(this.pos.x, this.baseY, this.pos.z, 2, 0x9a8d78, R * 0.8, 1.6);
  }

  stop() {
    if (!this.alive) return;
    this.alive = false;
    this.mesh.visible = false;
    this.core.visible = false;
    if (this.audio) this.audio.stopAmbient('tornado');
  }

  dispose() {
    this.stop();
    this.scene.remove(this.mesh);
    this.scene.remove(this.core);
    this.geo.dispose();
    this.mat.dispose();
    this.core.material.dispose();
  }
}
