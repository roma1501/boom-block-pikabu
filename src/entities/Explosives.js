/**
 * Виды взрывчатки.
 *
 * Принцип: новые заряды — это не «тот же взрыв, но больше», а разные
 * инструменты. Кумулятивный пробивает узкий тоннель сквозь камень, но почти
 * ничего не сносит вширь. Зажигательный слаб против камня и страшен для дерева.
 * Гравитационный почти не ломает блоки — он выдёргивает опоры и роняет здание.
 * Поэтому выбор заряда — часть головоломки, а не просто прокачка.
 *
 * Уровень (1..4) покупается в мастерской и усиливает конкретный заряд.
 */
import { MAT } from '../world/Materials.js';

export const EXPLOSIVES = [
  {
    key: 'tnt', name: 'ex.tnt', mat: MAT.TNT, tint: 0xc63426,
    desc: 'ex.tnt.d',
    charges: 1, unlock: 0, maxLevel: 4, upPrice: [0, 70, 160, 300],
    fuse: 2.35,
    cfg: (lv) => ({
      radius: 7.4 + lv * 0.5, power: 12.5 + lv * 1.5, impulse: 30 + lv * 4,
      damageRate: 5.2, fireballSize: 4.3 + lv * 0.25, soundPower: 1 + lv * 0.07,
      cameraShake: 1, chainReactionRadius: 6.2, playerPush: 15,
    }),
  },
  {
    key: 'mega', name: 'ex.mega', mat: MAT.MEGA, tint: 0x3a3e4a,
    desc: 'ex.mega.d',
    charges: 2, unlock: 220, maxLevel: 4, upPrice: [0, 150, 300, 520],
    fuse: 3.2,
    cfg: (lv) => ({
      radius: 10.6 + lv * 0.8, power: 19 + lv * 2.2, impulse: 48 + lv * 6,
      damageRate: 5.4, fireballSize: 7.2 + lv * 0.5, soundPower: 1.55 + lv * 0.1,
      cameraShake: 1.45, chainReactionRadius: 8.5, playerPush: 24,
    }),
  },
  {
    key: 'cluster', name: 'ex.cluster', mat: MAT.CLUSTER, tint: 0x4c603e,
    desc: 'ex.cluster.d',
    charges: 2, unlock: 260, maxLevel: 4, upPrice: [0, 160, 320, 560],
    fuse: 2.0,
    cluster: (lv) => ({ count: 4 + lv, delay: 0.28, spread: 6.5 + lv * 0.8, up: 9 }),
    cfg: (lv) => ({
      radius: 5.0, power: 8, impulse: 20, damageRate: 5.2,
      fireballSize: 3.0, soundPower: 0.8, cameraShake: 0.8, chainReactionRadius: 4,
      playerPush: 9,
    }),
    subCfg: (lv) => ({
      radius: 5.6 + lv * 0.35, power: 10 + lv * 1.1, impulse: 26, damageRate: 5.2,
      fireballSize: 3.4, soundPower: 0.85, cameraShake: 0.7, chainReactionRadius: 3.5,
      playerPush: 8,
    }),
  },
  {
    key: 'napalm', name: 'ex.napalm', mat: MAT.NAPALM, tint: 0xce601a,
    desc: 'ex.napalm.d',
    charges: 1, unlock: 170, maxLevel: 4, upPrice: [0, 120, 250, 430],
    fuse: 2.2,
    fire: (lv) => ({ radius: 4.6 + lv * 0.55, duration: 6 + lv * 1.6, dps: 34 + lv * 12 }),
    cfg: (lv) => ({
      radius: 5.4, power: 8, impulse: 17, damageRate: 5.0,
      fireballSize: 6.2, soundPower: 0.95, cameraShake: 0.8, chainReactionRadius: 5,
      playerPush: 10,
    }),
  },
  {
    key: 'shaped', name: 'ex.shaped', mat: MAT.SHAPED, tint: 0x707680,
    desc: 'ex.shaped.d',
    charges: 1, unlock: 210, maxLevel: 4, upPrice: [0, 140, 280, 480],
    fuse: 1.8,
    directional: (lv) => ({ range: 13 + lv * 2.2, power: 25 + lv * 4, spread: 0.13 }),
    cfg: (lv) => ({
      radius: 3.6, power: 6, impulse: 15, damageRate: 5.2,
      fireballSize: 2.6, soundPower: 0.9, cameraShake: 0.9, chainReactionRadius: 3.5,
      playerPush: 8,
    }),
  },
  {
    key: 'grav', name: 'ex.grav', mat: MAT.GRAV, tint: 0x3a2c60,
    desc: 'ex.grav.d',
    charges: 2, unlock: 340, maxLevel: 4, upPrice: [0, 200, 400, 680],
    fuse: 2.7,
    implode: (lv) => ({
      radius: 11 + lv * 1.1, pull: 26 + lv * 4, time: 0.62, shock: 0.40 + lv * 0.07,
    }),
    cfg: (lv) => ({
      radius: 6.4, power: 8.5, impulse: 56 + lv * 6, damageRate: 4.6,
      fireballSize: 3.8, soundPower: 1.25, cameraShake: 1.2, chainReactionRadius: 7,
      playerPush: 20,
    }),
  },
];

export const EXPLOSIVE_BY_KEY = {};
EXPLOSIVES.forEach((e, i) => { e.index = i; EXPLOSIVE_BY_KEY[e.key] = e; });

/** Улучшения игрока (вкладка «ИГРОК» в мастерской). */
export const PLAYER_UPGRADES = [
  {
    key: 'charges', name: 'up.charges', icon: '🧨',
    desc: 'up.charges.d',
    max: 3, price: [110, 240, 460],
    value: (lv) => `+${lv}`,
  },
  {
    key: 'speed', name: 'up.speed', icon: '👟',
    desc: 'up.speed.d',
    max: 3, price: [80, 170, 320],
    value: (lv) => `+${lv * 12}%`,
  },
  {
    key: 'jump', name: 'up.jump', icon: '⬆️',
    desc: 'up.jump.d',
    max: 3, price: [70, 150, 280],
    value: (lv) => `+${lv * 10}%`,
  },
  {
    key: 'armor', name: 'up.armor', icon: '🛡️',
    desc: 'up.armor.d',
    max: 3, price: [90, 190, 350],
    value: (lv) => `-${lv * 22}%`,
  },
  {
    key: 'magnet', name: 'up.magnet', icon: '🧲',
    desc: 'up.magnet.d',
    max: 3, price: [80, 175, 330],
    value: (lv) => `+${lv * 45}%`,
  },
  {
    key: 'luck', name: 'up.luck', icon: '🍀',
    desc: 'up.luck.d',
    max: 3, price: [130, 280, 520],
    value: (lv) => `+${lv} 💎`,
  },
];

export const PLAYER_UPGRADE_BY_KEY = {};
PLAYER_UPGRADES.forEach(u => { PLAYER_UPGRADE_BY_KEY[u.key] = u; });
