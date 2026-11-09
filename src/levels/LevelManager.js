/**
 * Загрузка уровней и построение миниатюр для экрана выбора.
 */
import * as THREE from 'three';
import { LEVELS } from './levels.js';
import { Builder } from './Builder.js';
import { VoxelWorld } from '../world/VoxelWorld.js';
import { buildGeometry, makeBlockMaterials } from '../world/Mesher.js';

export class LevelManager {
  constructor(atlas) {
    this.atlas = atlas;
    this.previewCache = new Map();
    this.previewMats = makeBlockMaterials(atlas);
    this.previewMats.opaque.fog = false;
    this.previewMats.transparent.fog = false;
  }

  get count() { return LEVELS.length; }
  def(i) { return LEVELS[i]; }

  /** Создаёт мир уровня. index — от 0. */
  create(index) {
    const def = LEVELS[index];
    const [sx, sy, sz] = def.size;
    const world = new VoxelWorld(sx, sy, sz, this.atlas);
    const b = new Builder(world);
    def.build(b);

    const chestCrystals = b.chests.reduce((a, c) => a + c[3], 0);
    const center = b.buildingCenter.lengthSq() > 0
      ? b.buildingCenter.clone()
      : new THREE.Vector3(sx / 2, 10, sz / 2);

    return {
      index, def, world,
      name: def.name,
      hint: def.hint || '',
      tnt: def.tnt,
      stars: def.stars,
      tutorial: !!def.tutorial,
      spawn: b.spawnPos.clone(),
      spawnYaw: b.spawnYaw,
      crystals: b.crystals,
      chests: b.chests,
      totalCrystals: b.crystals.length + chestCrystals,
      center,
      radius: Math.max(sx, sz) * 0.62,
      size: def.size,
    };
  }

  /** Миниатюра уровня для карусели. */
  preview(index) {
    if (this.previewCache.has(index)) return this.previewCache.get(index);
    const def = LEVELS[index];
    const [sx, sy, sz] = def.size;
    const world = new VoxelWorld(sx, sy, sz, this.atlas);
    const b = new Builder(world);
    def.build(b);

    // границы заполненного объёма
    let x0 = sx, y0 = sy, z0 = sz, x1 = -1, y1 = -1, z1 = -1;
    for (let y = 0; y < sy; y++)
      for (let z = 0; z < sz; z++) {
        const row = (y * sz + z) * sx;
        for (let x = 0; x < sx; x++) {
          if (!world.blocks[row + x]) continue;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
          if (z < z0) z0 = z; if (z > z1) z1 = z;
        }
      }
    const grp = new THREE.Group();
    if (x1 >= x0) {
      const cx = (x0 + x1 + 1) / 2, cz = (z0 + z1 + 1) / 2, cy = y0;
      const off = new THREE.Vector3(-cx, -cy, -cz);
      const bounds = { x0, y0, z0, x1, y1, z1 };
      const get = (x, y, z) => world.get(x, y, z);
      const go = buildGeometry(get, bounds, this.atlas, 0, off);
      const gt = buildGeometry(get, bounds, this.atlas, 1, off);
      if (go) {
        const m = new THREE.Mesh(go, this.previewMats.opaque);
        m.castShadow = true; m.receiveShadow = true;
        grp.add(m);
      }
      if (gt) grp.add(new THREE.Mesh(gt, this.previewMats.transparent));
      const span = Math.max(x1 - x0, z1 - z0, 1);
      const s = 9.5 / span;
      grp.scale.setScalar(s);
    }
    world.dispose();
    this.previewCache.set(index, grp);
    return grp;
  }

  clearPreviews() {
    for (const g of this.previewCache.values()) {
      g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    }
    this.previewCache.clear();
  }
}
