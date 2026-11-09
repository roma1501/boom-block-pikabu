/**
 * Мастерская подрывника.
 * Алмазы копятся за найденные кристаллы, тратятся на открытие новых зарядов,
 * их уровни и улучшения игрока. Всё лежит в общем сохранении.
 */
import { EXPLOSIVES, EXPLOSIVE_BY_KEY, PLAYER_UPGRADES, PLAYER_UPGRADE_BY_KEY } from '../entities/Explosives.js';

export class ShopManager {
  constructor(save) {
    this.save = save;
    const d = save.data;
    if (!d.shop) d.shop = {};
    if (!d.shop.explosives) d.shop.explosives = { tnt: 1 };
    if (!d.shop.player) d.shop.player = {};
    if (!d.shop.explosives.tnt) d.shop.explosives.tnt = 1;
    this.onChange = null;
  }

  get gems() { return this.save.data.gems; }
  set gems(v) { this.save.data.gems = Math.max(0, v | 0); }

  /* ---------------- взрывчатка ---------------- */
  level(key) { return this.save.data.shop.explosives[key] || 0; }
  owned(key) { return this.level(key) >= 1; }

  /** Список открытых зарядов в порядке определения. */
  unlockedList() {
    return EXPLOSIVES.filter(e => this.owned(e.key));
  }

  /** Стоимость следующего шага: открыть или поднять уровень. */
  nextCost(key) {
    const e = EXPLOSIVE_BY_KEY[key];
    if (!e) return null;
    const lv = this.level(key);
    if (lv === 0) return e.unlock;
    if (lv >= e.maxLevel) return null;
    return e.upPrice[lv];
  }

  canBuy(key) {
    const c = this.nextCost(key);
    return c !== null && this.gems >= c;
  }

  buy(key) {
    const c = this.nextCost(key);
    if (c === null || this.gems < c) return false;
    this.gems -= c;
    const cur = this.level(key);
    this.save.data.shop.explosives[key] = cur + 1;
    this.save.save();
    if (this.onChange) this.onChange('explosive', key);
    return true;
  }

  /** Конфигурация взрыва с учётом купленного уровня. */
  configFor(key) {
    const e = EXPLOSIVE_BY_KEY[key];
    const lv = Math.max(1, this.level(key));
    return e.cfg(lv - 1);
  }
  paramFor(key, name) {
    const e = EXPLOSIVE_BY_KEY[key];
    if (!e || !e[name]) return null;
    const lv = Math.max(1, this.level(key));
    return e[name](lv - 1);
  }

  /* ---------------- игрок ---------------- */
  playerLevel(key) { return this.save.data.shop.player[key] || 0; }

  playerNextCost(key) {
    const u = PLAYER_UPGRADE_BY_KEY[key];
    const lv = this.playerLevel(key);
    if (!u || lv >= u.max) return null;
    return u.price[lv];
  }

  buyPlayer(key) {
    const c = this.playerNextCost(key);
    if (c === null || this.gems < c) return false;
    this.gems -= c;
    this.save.data.shop.player[key] = this.playerLevel(key) + 1;
    this.save.save();
    if (this.onChange) this.onChange('player', key);
    return true;
  }

  addGems(n) {
    this.gems += n;
    this.save.save();
    if (this.onChange) this.onChange('gems', n);
  }

  /* ---------------- производные значения ---------------- */
  get extraCharges() { return this.playerLevel('charges'); }
  get speedMul() { return 1 + this.playerLevel('speed') * 0.12; }
  get jumpMul() { return 1 + this.playerLevel('jump') * 0.10; }
  get armorMul() { return 1 - this.playerLevel('armor') * 0.22; }
  get magnetMul() { return 1 + this.playerLevel('magnet') * 0.45; }
  get gemsPerCrystal() { return 1 + this.playerLevel('luck'); }

  /** Данные для отрисовки вкладки «ДИНАМИТ». */
  explosiveRows() {
    return EXPLOSIVES.map(e => {
      const lv = this.level(e.key);
      const cost = this.nextCost(e.key);
      return {
        key: e.key, name: e.name, desc: e.desc, mat: e.mat, tint: e.tint,
        charges: e.charges, level: lv, maxLevel: e.maxLevel,
        cost, state: lv === 0 ? 'locked' : (cost === null ? 'max' : 'upgrade'),
        affordable: cost !== null && this.gems >= cost,
      };
    });
  }

  playerRows() {
    return PLAYER_UPGRADES.map(u => {
      const lv = this.playerLevel(u.key);
      const cost = this.playerNextCost(u.key);
      return {
        key: u.key, name: u.name, desc: u.desc, icon: u.icon,
        level: lv, maxLevel: u.max, cost,
        state: cost === null ? 'max' : (lv === 0 ? 'buy' : 'upgrade'),
        affordable: cost !== null && this.gems >= cost,
        value: u.value(lv),
      };
    });
  }
}
