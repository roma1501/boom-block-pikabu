/**
 * Кристаллы — главная цель уровня.
 * Пока кристалл замурован в блок, он не виден и не подбирается.
 * После разрушения блока он падает на обломки, светится, притягивается
 * к игроку с небольшого расстояния и улетает в счётчик интерфейса.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';

const _v = new THREE.Vector3();

export class CrystalManager {
  constructor(scene, world, particles, audio) {
    this.scene = scene;
    this.world = world;
    this.particles = particles;
    this.audio = audio;
    this.list = [];
    this.collected = 0;
    this.total = 0;
    this.onCollect = null;      // (crystal, screenPos)
    this.onReveal = null;

    this.magnetMul = 1;
    this.geo = new THREE.OctahedronGeometry(0.34, 0);
    this.geo.scale(1, 1.45, 1);
    this.mat = new THREE.MeshBasicMaterial({ color: 0x7dfff0 });
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.glowTex = null;
    this.pingT = 0;
  }

  setGlowTexture(t) { this.glowTex = t; }

  spawn(x, y, z) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.geo, this.mat);
    g.add(body);
    const core = new THREE.Mesh(this.geo, this.coreMat);
    core.scale.setScalar(0.52);
    g.add(core);

    if (this.glowTex) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, color: 0x60ffe6, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9,
      }));
      sp.scale.set(2.1, 2.1, 1);
      g.add(sp);
      g.userData.sprite = sp;
    }

    g.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.scene.add(g);

    const c = {
      group: g,
      home: new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5),
      pos: new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5),
      vy: 0, vx: 0, vz: 0,
      landed: false, exposed: false, revealed: false,
      collected: false, spin: Math.random() * 6.28,
      bob: Math.random() * 6.28, scale: 0, sparkT: 0,
      flyT: -1,
    };
    g.visible = false;
    this.list.push(c);
    this.total++;
    return c;
  }

  /* ------------------------------------------------------------ */
  update(dt, playerPos, camera) {
    const W = this.world;
    this.pingT -= dt;
    let anyExposed = false;

    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      if (c.collected) continue;

      const inBlock = !!W.get(Math.floor(c.pos.x), Math.floor(c.pos.y), Math.floor(c.pos.z));
      c.exposed = !inBlock;
      if (c.exposed) anyExposed = true;

      if (!c.exposed) {
        c.group.visible = false;
        c.landed = false;
        continue;
      }

      if (!c.revealed) {
        c.revealed = true;
        c.group.visible = true;
        c.scale = 0.01;
        this.particles.sparks(c.pos.x, c.pos.y, c.pos.z, 12, 5, 0x8ffff0, 0.6);
        if (this.audio) this.audio.crystalReveal(c.pos);
        if (this.onReveal) this.onReveal(c);
      }

      // --- падение ---
      if (!c.landed) {
        c.vy += CONFIG.gravity * 0.55 * dt;
        c.pos.y += c.vy * dt;
        c.pos.x += c.vx * dt; c.pos.z += c.vz * dt;
        c.vx *= 0.94; c.vz *= 0.94;
        const bx = Math.floor(c.pos.x), bz = Math.floor(c.pos.z);
        const by = Math.floor(c.pos.y - 0.34);
        if (W.get(bx, by, bz)) {
          c.pos.y = by + 1 + 0.34;
          c.vy = 0; c.landed = true;
        }
        if (c.pos.y < CONFIG.killY + 6) {
          // не даём потеряться — возвращаем в безопасное место
          const sx = Math.floor(c.home.x), sz = Math.floor(c.home.z);
          let ty = W.groundAt(sx, sz, W.sy - 1);
          c.pos.set(sx + 0.5, (ty >= 0 ? ty + 1 : 2) + 0.5, sz + 0.5);
          c.vy = 0; c.landed = true;
        }
      } else {
        // опора исчезла — падаем дальше
        if (!W.get(Math.floor(c.pos.x), Math.floor(c.pos.y - 0.4), Math.floor(c.pos.z))) {
          c.landed = false; c.vy = 0;
        }
      }

      // --- анимация ---
      c.spin += dt * 1.7;
      c.bob += dt * 2.3;
      c.scale = Math.min(1, c.scale + dt * 4);
      const bobY = Math.sin(c.bob) * 0.11;
      c.group.position.set(c.pos.x, c.pos.y + bobY + 0.1, c.pos.z);
      c.group.rotation.y = c.spin;
      c.group.rotation.z = Math.sin(c.bob * 0.5) * 0.12;
      const pulse = 1 + Math.sin(c.bob * 1.7) * 0.07;
      c.group.scale.setScalar(c.scale * pulse);
      if (c.group.userData.sprite) {
        c.group.userData.sprite.material.opacity = 0.55 + 0.35 * Math.sin(c.bob * 1.3);
      }

      c.sparkT -= dt;
      if (c.sparkT <= 0) {
        c.sparkT = 0.22 + Math.random() * 0.3;
        this.particles.emit(this.particles.spark, {
          x: c.pos.x + (Math.random() - .5) * .5,
          y: c.pos.y + (Math.random() - .5) * .5,
          z: c.pos.z + (Math.random() - .5) * .5,
          vx: (Math.random() - .5) * .3, vy: 0.5 + Math.random() * .5, vz: (Math.random() - .5) * .3,
          s0: 0.07, s1: 0.01, ratio: 2,
          c0: 0xa0fff0, c1: 0x30c8d0, o0: 1, o1: 0,
          life: 0.75, drag: 1.2, grav: -0.6,
        });
      }

      // --- притяжение и подбор ---
      if (playerPos) {
        _v.set(playerPos.x, playerPos.y + CONFIG.player.eye * 0.6, playerPos.z).sub(c.pos);
        const d = _v.length();
        const reach = 3.6 * this.magnetMul;
        if (d < reach) {
          const pull = (1 - d / reach) * 16;
          _v.multiplyScalar(1 / Math.max(0.001, d));
          c.pos.addScaledVector(_v, pull * dt);
          c.landed = false; c.vy = Math.max(c.vy, -1);
          if (d < 1.15) this.collect(c, camera);
        }
      }
    }

    // редкий «маячок» подсказки
    if (anyExposed && this.pingT <= 0) {
      this.pingT = 3.4;
      if (this.audio) {
        for (const c of this.list) {
          if (c.exposed && !c.collected) { this.audio.crystalPing(c.pos); break; }
        }
      }
    }
  }

  collect(c, camera) {
    if (c.collected) return;
    c.collected = true;
    this.collected++;
    this.scene.remove(c.group);
    this.particles.sparks(c.pos.x, c.pos.y, c.pos.z, 18, 7, 0xa8fff4, 0.7);
    this.particles.emit(this.particles.fire, {
      x: c.pos.x, y: c.pos.y, z: c.pos.z,
      s0: 0.6, s1: 2.6, c0: 0xbfffff, c1: 0x2fd8c8,
      o0: 1, o1: 0, life: 0.4, drag: 1, grav: 0,
    });
    if (this.audio) this.audio.crystalPickup(c.pos, this.collected, this.total);
    if (this.onCollect) this.onCollect(c, projectToScreen(c.pos, camera));
  }

  get remaining() { return this.total - this.collected; }

  clear() {
    for (const c of this.list) {
      if (!c.collected) this.scene.remove(c.group);
    }
    this.list.length = 0;
    this.collected = 0; this.total = 0;
  }

  dispose() {
    this.clear();
    this.geo.dispose(); this.mat.dispose(); this.coreMat.dispose();
  }
}

export function projectToScreen(pos, camera) {
  if (!camera) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const v = _v.copy(pos).project(camera);
  return {
    x: (v.x * 0.5 + 0.5) * window.innerWidth,
    y: (-v.y * 0.5 + 0.5) * window.innerHeight,
  };
}
