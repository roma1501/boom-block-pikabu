/**
 * Предмет в руках.
 * Рендерится отдельной сценой поверх основной, поэтому никогда не проваливается
 * сквозь стены. Рука собрана из блоков: предплечье, ладонь, четыре пальца и
 * большой палец — он реально обхватывает зажигалку и щёлкает колёсиком.
 */
import * as THREE from 'three';
import { MAT } from '../world/Materials.js';
import { buildGeometry } from '../world/Mesher.js';
import { isRounded } from '../world/Style.js';
import { makeChargeMesh } from '../entities/ChargeModels.js';

const SKIN = 0xf2c69c;
const SLEEVE = 0x3f7ad6;
const CUFF = 0x2b5aa8;

export class ViewModel {
  constructor(atlas, tex) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.01, 12);
    this.camera.position.set(0, 0, 0);

    const amb = new THREE.HemisphereLight(0xdfeaff, 0x4a4438, 2.1);
    this.scene.add(amb);
    const dir = new THREE.DirectionalLight(0xfff3dd, 2.4);
    dir.position.set(-0.6, 1.2, 0.9);
    this.scene.add(dir);
    const rim = new THREE.DirectionalLight(0x88b8ff, 0.9);
    rim.position.set(1.2, -0.4, -0.8);
    this.scene.add(rim);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.atlas = atlas;
    this.items = [];
    this.current = 0;
    this.blockGeoms = {};

    this._buildCharge();
    this._buildLighter(tex);

    this.swayX = 0; this.swayY = 0;
    this.bob = 0;
    this.anim = 0;
    this.animType = '';
    this.switchT = 1;
    this.hidden = false;
  }

  /* ---------------- вспомогательное ---------------- */
  blockGeometry(matId) {
    if (this.blockGeoms[matId]) return this.blockGeoms[matId];
    const g = buildGeometry(
      (x, y, z) => (x === 0 && y === 0 && z === 0) ? matId : 0,
      { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 },
      this.atlas, 0, new THREE.Vector3(-0.5, -0.5, -0.5));
    this.blockGeoms[matId] = g;
    return g;
  }

  _box(w, h, d, color) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color }));
  }

  /**
   * Кисть, обхватывающая предмет: ладонь позади него, четыре пальца
   * смыкаются спереди (они чуть шире предмета, поэтому кончики видно),
   * большой палец лежит сбоку и на анимации проворачивает колёсико.
   */
  _hand(o) {
    const g = new THREE.Group();
    const w = o.width;                 // ширина кисти
    const front = o.front;             // z, где смыкаются пальцы
    const back = o.back;               // z ладони

    // Ладонь позади предмета.
    const palm = this._box(w, o.palmH, 0.08, SKIN);
    palm.position.set(0, o.palmY, back);
    g.add(palm);

    // Пальцы смыкаются спереди, чуть шире предмета — видно кончики.
    const fingers = [];
    for (let i = 0; i < o.fingers; i++) {
      const y = o.fingerY0 + i * o.fingerStep;
      const f = this._box(w * 1.1, 0.03, Math.abs(front - back) + 0.03, SKIN);
      f.position.set(0, y, (front + back) / 2 + 0.012);
      g.add(f);
      const tip = this._box(w * 1.1, 0.032, 0.035, SKIN);
      tip.position.set(0, y - 0.006, front + 0.012);
      tip.rotation.x = 0.35;
      g.add(tip);
      fingers.push(f);
    }

    const thumb = this._box(0.042, o.thumbLen, 0.06, SKIN);
    thumb.position.set(-(w / 2 + 0.016), o.thumbY, o.thumbZ);
    thumb.rotation.z = 0.5;
    g.add(thumb);

    // Рукав уходит вниз-вправо-к камере и выходит за нижний край кадра,
    // поэтому в кадре видна только кисть, а не огромная «доска» предплечья.
    const dir = new THREE.Vector3(0.32, -0.86, 0.40).normalize();
    const sleeve = this._box(w * 0.95, w * 0.95, 0.5, SLEEVE);
    sleeve.position.set(0, 0, 0.27);
    const cuff = this._box(w * 1.06, w * 1.06, 0.045, CUFF);
    cuff.position.set(0, 0, 0.03);
    const arm = new THREE.Group();
    arm.add(sleeve); arm.add(cuff);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    arm.position.set(0, o.palmY - o.palmH * 0.35, back - 0.01);
    g.add(arm);

    g.userData.thumb = thumb;
    g.userData.thumbRest = 0.5;
    g.userData.thumbRestY = o.thumbY;
    g.userData.fingers = fingers;
    return g;
  }

  /* ---------------- заряд ---------------- */
  _buildCharge() {
    const g = new THREE.Group();
    let block = null, fuse = null;

    if (isRounded()) {
      // держатель, в который подставляется модель выбранного заряда
      this.chargeHolder = new THREE.Group();
      this.chargeHolder.scale.setScalar(0.30);
      this.chargeHolder.rotation.set(0.1, 0.5, 0.08);
      g.add(this.chargeHolder);
    } else {
      block = new THREE.Mesh(this.blockGeometry(MAT.TNT), new THREE.MeshLambertMaterial({
        map: this.atlas.texture, vertexColors: true,
      }));
      block.scale.setScalar(0.20);
      block.rotation.set(0.16, 0.6, 0.07);
      g.add(block);

      fuse = new THREE.Mesh(
        new THREE.CylinderGeometry(0.009, 0.012, 0.1, 6),
        new THREE.MeshLambertMaterial({ color: 0xbfa15a }));
      fuse.position.set(0.012, 0.12, 0.012);
      fuse.rotation.z = 0.3;
      g.add(fuse);
    }

    // заряд держим без руки — так его видно целиком
    g.position.set(0.33, -0.30, -0.60);
    g.rotation.set(0.02, -0.10, 0.03);
    this.root.add(g);
    this.items.push({ group: g, name: 'charge', block, fuse, hand: null });
  }

  /** Меняет модель заряда в руке на выбранный тип. */
  setChargeType(matId, key) {
    const it = this.items[0];
    if (!it) return;
    if (isRounded()) {
      if (it.chargeKey === key) return;
      it.chargeKey = key;
      const h = this.chargeHolder;
      while (h.children.length) {
        const c = h.children[0];
        h.remove(c);
        c.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      }
      h.add(makeChargeMesh(key || 'tnt'));
      return;
    }
    if (it.matId === matId) return;
    it.matId = matId;
    it.block.geometry = this.blockGeometry(matId);
  }

  /* ---------------- зажигалка ---------------- */
  _buildLighter(tex) {
    const g = new THREE.Group();

    const body = this._box(0.115, 0.175, 0.075, 0xc9ced8);
    g.add(body);
    const bodyDark = this._box(0.12, 0.06, 0.08, 0x39404f);
    bodyDark.position.y = -0.042;
    g.add(bodyDark);
    const label = this._box(0.121, 0.035, 0.078, 0xe8402e);
    label.position.y = 0.02;
    g.add(label);
    const top = this._box(0.088, 0.045, 0.062, 0x8b93a3);
    top.position.y = 0.112;
    g.add(top);
    const hood = this._box(0.05, 0.03, 0.055, 0xa8b0bd);
    hood.position.set(-0.02, 0.145, 0);
    g.add(hood);
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.023, 0.023, 0.042, 10),
      new THREE.MeshLambertMaterial({ color: 0x5d646f }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0.022, 0.14, 0.005);
    g.add(wheel);

    const flameMat = new THREE.SpriteMaterial({
      map: tex.fire, color: 0xffc257, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
    });
    const flame = new THREE.Sprite(flameMat);
    flame.scale.set(0.13, 0.2, 1);
    flame.position.set(-0.02, 0.205, 0.005);
    g.add(flame);
    const flameLight = new THREE.PointLight(0xffa030, 0, 1.4);
    flameLight.position.set(-0.02, 0.22, 0.04);
    g.add(flameLight);

    // кисть обхватывает корпус: ладонь сзади, пальцы спереди,
    // большой палец лежит на колёсике
    const hand = this._hand({
      width: 0.125, palmH: 0.15, palmY: -0.055, back: -0.062, front: 0.062,
      fingers: 4, fingerY0: -0.098, fingerStep: 0.033,
      thumbY: 0.05, thumbZ: 0.016, thumbLen: 0.095,
    });
    g.add(hand);

    g.position.set(0.26, -0.20, -0.56);
    g.rotation.set(0.03, -0.34, 0.06);
    g.visible = false;
    this.root.add(g);
    this.items.push({ group: g, name: 'lighter', flame, flameLight, hand, wheel });
  }

  /* ---------------- управление ---------------- */
  setItem(i) {
    if (i === this.current) return;
    this.current = i;
    this.switchT = 0;
    for (let k = 0; k < this.items.length; k++) this.items[k].group.visible = (k === i);
  }

  playPlace() { this.animType = 'place'; this.anim = 0; }
  playIgnite() { this.animType = 'ignite'; this.anim = 0; }
  playDeny() { this.animType = 'deny'; this.anim = 0; }

  update(dt, player, input) {
    const tx = THREE.MathUtils.clamp(-input.lookX * 8, -0.09, 0.09);
    const ty = THREE.MathUtils.clamp(-input.lookY * 8, -0.07, 0.07);
    this.swayX += (tx - this.swayX) * Math.min(1, dt * 9);
    this.swayY += (ty - this.swayY) * Math.min(1, dt * 9);

    const hs = Math.hypot(player.vel.x, player.vel.z);
    this.bob += dt * hs * 1.55;
    const bAmt = Math.min(1, hs / 5.4) * (player.onGround ? 1 : 0.25);

    const animPos = new THREE.Vector3();
    const animRot = new THREE.Vector3();
    const it = this.items[this.current];

    if (this.animType) {
      this.anim += dt;
      if (this.animType === 'place') {
        const t = Math.min(1, this.anim / 0.30);
        const k = Math.sin(t * Math.PI);
        animPos.set(0, -0.10 * k, -0.20 * k);
        animRot.set(-0.42 * k, 0, 0.1 * k);
        if (t >= 1) this.animType = '';
      } else if (this.animType === 'ignite') {
        const t = Math.min(1, this.anim / 0.42);
        const k = Math.sin(t * Math.PI);
        animPos.set(-0.03 * k, -0.05 * k, -0.13 * k);
        animRot.set(-0.30 * k, 0.16 * k, -0.22 * k);
        if (it.hand) {
          // большой палец прокручивает колёсико
          const u = it.hand.userData, th = u.thumb;
          const k2 = Math.sin(Math.min(1, t * 2.2) * Math.PI);
          th.rotation.z = u.thumbRest - k2 * 0.7;
          th.position.y = u.thumbRestY - k2 * 0.045;
        }
        if (it.wheel) it.wheel.rotation.x -= dt * 22 * (1 - t);
        if (it.flame) {
          const fl = Math.max(0, Math.sin(t * Math.PI * 1.05));
          it.flame.material.opacity = fl * 0.95;
          it.flame.scale.set(0.10 + fl * 0.045, 0.16 + fl * 0.13, 1);
          it.flameLight.intensity = fl * 2.4;
        }
        if (t >= 1) {
          this.animType = '';
          if (it.flame) { it.flame.material.opacity = 0; it.flameLight.intensity = 0; }
          if (it.hand) {
            it.hand.userData.thumb.rotation.z = it.hand.userData.thumbRest;
            it.hand.userData.thumb.position.y = 0.045;
          }
        }
      } else if (this.animType === 'deny') {
        const t = Math.min(1, this.anim / 0.22);
        const k = Math.sin(t * Math.PI);
        animRot.set(0.05 * k, 0.24 * k, 0);
        if (t >= 1) this.animType = '';
      }
    }

    this.switchT = Math.min(1, this.switchT + dt * 5.2);
    const sw = 1 - Math.sin(Math.min(1, this.switchT) * Math.PI * 0.5);

    if (!it) return;
    const base = it.name === 'charge'
      ? { x: 0.33, y: -0.30, z: -0.60 }
      : { x: 0.26, y: -0.20, z: -0.56 };

    it.group.position.set(
      base.x + this.swayX + Math.cos(this.bob) * 0.017 * bAmt + animPos.x,
      base.y + this.swayY + Math.abs(Math.sin(this.bob)) * -0.021 * bAmt - sw * 0.5 + animPos.y
      - player.landDip * 0.5,
      base.z + animPos.z);
    it.group.rotation.set(
      (it.name === 'charge' ? 0.02 : 0.04) + animRot.x + Math.sin(this.bob) * 0.02 * bAmt,
      (it.name === 'charge' ? -0.10 : -0.34) + animRot.y - this.swayX * 1.6,
      (it.name === 'charge' ? 0.03 : 0.06) + animRot.z + Math.cos(this.bob) * 0.03 * bAmt);

    if (it.name === 'charge') {
      if (it.block) it.block.rotation.y += dt * 0.15;
      else if (this.chargeHolder) this.chargeHolder.rotation.y += dt * 0.15;
    }
    this.root.visible = !this.hidden;
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });
  }
}
