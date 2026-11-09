/**
 * Сундук. Обычный блок мира с очень высокой прочностью —
 * открыть его можно только взрывом. При разрушении крышка отлетает,
 * корпус разлетается щепками, а внутри оказывается кристалл.
 */
import * as THREE from 'three';
import { MAT } from '../world/Materials.js';

export class ChestManager {
  constructor(scene, world, debris, particles, audio, crystals, glowTex) {
    this.scene = scene;
    this.world = world;
    this.debris = debris;
    this.particles = particles;
    this.audio = audio;
    this.crystals = crystals;
    this.list = [];
    this.glowTex = glowTex;
    this.onOpen = null;
  }

  add(x, y, z, crystals = 1) {
    const c = { x, y, z, crystals, opened: false, marker: null, t: Math.random() * 6.28 };
    if (this.glowTex) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: 0xffd76a, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35,
      }));
      sp.scale.set(1.5, 1.5, 1);
      sp.position.set(x + 0.5, y + 0.5, z + 0.5);
      this.scene.add(sp);
      c.marker = sp;
    }
    this.list.push(c);
    return c;
  }

  /** Вызывается системой разрушения при уничтожении любого блока. */
  notifyDestroyed(x, y, z, mat) {
    if (mat !== MAT.CHEST) return false;
    for (const c of this.list) {
      if (c.opened || c.x !== x || c.y !== y || c.z !== z) continue;
      this.open(c);
      return true;
    }
    return false;
  }

  open(c) {
    c.opened = true;
    if (c.marker) { this.scene.remove(c.marker); c.marker.material.dispose(); c.marker = null; }
    const px = c.x + 0.5, py = c.y + 0.5, pz = c.z + 0.5;

    // крышка отлетает
    this.debris.spawnDebris(px, py + 0.45, pz, MAT.PLANKS_DARK, 0.85,
      (Math.random() - 0.5) * 4, 8.5 + Math.random() * 3, (Math.random() - 0.5) * 4, 9);
    // щепки
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * 6.283;
      this.debris.spawnDebris(px, py, pz, MAT.PLANKS, 0.3 + Math.random() * 0.2,
        Math.cos(a) * (3 + Math.random() * 4), 3 + Math.random() * 5, Math.sin(a) * (3 + Math.random() * 4), 12);
    }
    this.particles.sparks(px, py + 0.4, pz, 22, 8, 0xffe08a, 0.8);
    this.particles.dustBurst(px, py, pz, 10, 0x9a7040, 1.2);
    this.particles.emit(this.particles.fire, {
      x: px, y: py + 0.4, z: pz, s0: 0.5, s1: 3.2,
      c0: 0xfff2c0, c1: 0xffb040, o0: 1, o1: 0, life: 0.45, drag: 1, grav: 0,
    });

    if (this.audio) this.audio.chestOpen({ x: px, y: py, z: pz });

    for (let i = 0; i < c.crystals; i++) {
      const cr = this.crystals.spawn(c.x, c.y, c.z);
      cr.vx = (Math.random() - 0.5) * 2.2;
      cr.vz = (Math.random() - 0.5) * 2.2;
      cr.vy = 4.5 + Math.random() * 2;
      cr.landed = false;
    }
    if (this.onOpen) this.onOpen(c);
  }

  update(dt) {
    for (const c of this.list) {
      if (c.opened || !c.marker) continue;
      c.t += dt;
      c.marker.material.opacity = 0.2 + 0.2 * Math.sin(c.t * 2.1);
      c.marker.scale.setScalar(1.4 + Math.sin(c.t * 1.6) * 0.15);
      // если блок сундука убрали как-то иначе — считаем открытым
      if (this.world.get(c.x, c.y, c.z) !== MAT.CHEST) this.open(c);
    }
  }

  clear() {
    for (const c of this.list) {
      if (c.marker) { this.scene.remove(c.marker); c.marker.material.dispose(); }
    }
    this.list.length = 0;
  }
}
