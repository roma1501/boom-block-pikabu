/**
 * Таблица материалов.
 * Каждый блок несёт: прочность (hp), сопротивление взрыву (blast),
 * массу, структурную прочность (span — максимальный вылет консоли),
 * цвет для обломков/частиц и категорию звука.
 */
import { TILE_INDEX as T } from './Textures.js';

export const MAT = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, PLANKS: 5, PLANKS_DARK: 6, LOG: 7,
  BRICK: 8, GLASS: 9, METAL: 10, CONCRETE: 11, SAND: 12, THATCH: 13, SLATE: 14,
  PLASTER: 15, TNT: 16, CHEST: 17, BEDROCK: 18, LEAVES: 19, GOLD: 20, CRATE: 21, ICE: 22,
  MEGA: 23, CLUSTER: 24, NAPALM: 25, SHAPED: 26, GRAV: 27,
};

const def = (o) => Object.assign({
  hp: 120, blast: 2, mass: 60, span: 5, color: 0x9a9a9a, sound: 'stone',
  transparent: false, solid: true, indestructible: false, debrisScale: 1,
}, o);

/** tiles: [top, side, bottom] */
export const MATERIALS = [
  def({ key: 'AIR', name: 'воздух', solid: false, tiles: [0, 0, 0] }),

  def({
    key: 'GRASS', name: 'трава', tiles: [T.grass_top, T.grass_side, T.dirt],
    hp: 95, blast: 1.7, mass: 55, span: 4, color: 0x69ac3e, sound: 'dirt',
  }),
  def({
    key: 'DIRT', name: 'земля', tiles: [T.dirt, T.dirt, T.dirt],
    hp: 90, blast: 1.6, mass: 55, span: 4, color: 0x86603e, sound: 'dirt',
  }),
  def({
    key: 'STONE', name: 'камень', tiles: [T.stone, T.stone, T.stone],
    hp: 265, blast: 4.0, mass: 95, span: 6, color: 0x8a8d94, sound: 'stone',
  }),
  def({
    key: 'COBBLE', name: 'булыжник', tiles: [T.cobble, T.cobble, T.cobble],
    hp: 235, blast: 3.7, mass: 92, span: 6, color: 0x74777f, sound: 'stone',
  }),
  def({
    key: 'PLANKS', name: 'доски', tiles: [T.planks, T.planks, T.planks],
    hp: 105, blast: 1.4, mass: 32, span: 5, color: 0xb0824a, sound: 'wood',
  }),
  def({
    key: 'PLANKS_DARK', name: 'тёмные доски', tiles: [T.planks_dark, T.planks_dark, T.planks_dark],
    hp: 118, blast: 1.5, mass: 36, span: 5, color: 0x6f5030, sound: 'wood',
  }),
  def({
    key: 'LOG', name: 'бревно', tiles: [T.log_top, T.log_side, T.log_top],
    hp: 165, blast: 2.1, mass: 48, span: 7, color: 0x6c4e2e, sound: 'wood',
  }),
  def({
    key: 'BRICK', name: 'кирпич', tiles: [T.brick, T.brick, T.brick],
    hp: 205, blast: 3.2, mass: 82, span: 5, color: 0xb24a36, sound: 'stone',
  }),
  def({
    key: 'GLASS', name: 'стекло', tiles: [T.glass, T.glass, T.glass],
    hp: 14, blast: 0.15, mass: 9, span: 2, color: 0xaadeee, sound: 'glass',
    transparent: true, debrisScale: 0.45,
  }),
  def({
    key: 'METAL', name: 'металл', tiles: [T.metal, T.metal, T.metal],
    hp: 620, blast: 11, mass: 145, span: 10, color: 0x94a0b0, sound: 'metal',
  }),
  def({
    key: 'CONCRETE', name: 'бетон', tiles: [T.concrete, T.concrete, T.concrete],
    hp: 345, blast: 5.2, mass: 105, span: 7, color: 0xb0b0ac, sound: 'stone',
  }),
  def({
    key: 'SAND', name: 'песок', tiles: [T.sand, T.sand, T.sand],
    hp: 62, blast: 1.1, mass: 50, span: 2, color: 0xe2ce96, sound: 'dirt',
  }),
  def({
    key: 'THATCH', name: 'солома', tiles: [T.thatch, T.thatch, T.thatch],
    hp: 42, blast: 0.5, mass: 14, span: 3, color: 0xc8a858, sound: 'wood',
    debrisScale: 0.7,
  }),
  def({
    key: 'SLATE', name: 'черепица', tiles: [T.slate, T.slate, T.slate],
    hp: 92, blast: 1.8, mass: 46, span: 3, color: 0x5a6478, sound: 'stone',
    debrisScale: 0.7,
  }),
  def({
    key: 'PLASTER', name: 'штукатурка', tiles: [T.plaster, T.plaster, T.plaster],
    hp: 88, blast: 1.5, mass: 42, span: 4, color: 0xe8e2d2, sound: 'stone',
  }),
  def({
    key: 'TNT', name: 'динамит', tiles: [T.tnt_top, T.tnt_side, T.tnt_top],
    hp: 60, blast: 0.6, mass: 40, span: 4, color: 0xc63426, sound: 'wood',
  }),
  def({
    key: 'CHEST', name: 'сундук', tiles: [T.chest_top, T.chest_side, T.chest_side],
    hp: 520, blast: 7.5, mass: 70, span: 6, color: 0x926430, sound: 'wood',
  }),
  def({
    key: 'BEDROCK', name: 'основание', tiles: [T.bedrock, T.bedrock, T.bedrock],
    hp: 99999, blast: 60, mass: 500, span: 30, color: 0x3a3a44, sound: 'stone',
    indestructible: true,
  }),
  def({
    key: 'LEAVES', name: 'листва', tiles: [T.leaves, T.leaves, T.leaves],
    hp: 26, blast: 0.3, mass: 10, span: 2, color: 0x3e8a36, sound: 'dirt',
    debrisScale: 0.6,
  }),
  def({
    key: 'GOLD', name: 'золото', tiles: [T.gold, T.gold, T.gold],
    hp: 380, blast: 6, mass: 160, span: 8, color: 0xe2b238, sound: 'metal',
  }),
  def({
    key: 'CRATE', name: 'ящик', tiles: [T.crate, T.crate, T.crate],
    hp: 78, blast: 1.0, mass: 26, span: 4, color: 0xba8e52, sound: 'wood',
  }),
  def({
    key: 'ICE', name: 'лёд', tiles: [T.ice, T.ice, T.ice],
    hp: 55, blast: 0.9, mass: 40, span: 3, color: 0x9cd4f0, sound: 'glass',
    transparent: true,
  }),

  /* ---- корпуса взрывчатки (используются только как модели зарядов) ---- */
  def({
    key: 'MEGA', name: 'мега-заряд', tiles: [T.mega_top, T.mega_side, T.mega_top],
    hp: 90, blast: 0.8, mass: 60, span: 4, color: 0x3a3e4a, sound: 'metal',
  }),
  def({
    key: 'CLUSTER', name: 'кассетный', tiles: [T.cluster_top, T.cluster_side, T.cluster_top],
    hp: 70, blast: 0.7, mass: 45, span: 4, color: 0x4c603e, sound: 'metal',
  }),
  def({
    key: 'NAPALM', name: 'зажигательный', tiles: [T.napalm_top, T.napalm_side, T.napalm_top],
    hp: 55, blast: 0.5, mass: 34, span: 4, color: 0xce601a, sound: 'wood',
  }),
  def({
    key: 'SHAPED', name: 'кумулятивный', tiles: [T.shaped_top, T.shaped_side, T.shaped_top],
    hp: 80, blast: 0.9, mass: 50, span: 4, color: 0x707680, sound: 'metal',
  }),
  def({
    key: 'GRAV', name: 'гравизаряд', tiles: [T.grav_top, T.grav_side, T.grav_top],
    hp: 70, blast: 0.7, mass: 48, span: 4, color: 0x3a2c60, sound: 'metal',
  }),
];

// именованный доступ + подстановка id
MATERIALS.forEach((m, i) => { m.id = i; });

/** Очки за разрушение блока данного материала. */
export function blockScore(mid) {
  const s = MATERIALS[mid].sound;
  if (s === 'wood') return 10;
  if (s === 'stone') return 20;
  if (s === 'metal') return 30;
  if (s === 'glass') return 8;
  return 6;
}

export function isSolid(mid) { return mid !== 0 && MATERIALS[mid].solid; }
export function isTransparent(mid) { return mid !== 0 && MATERIALS[mid].transparent; }
