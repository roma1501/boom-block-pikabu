/**
 * Прогресс: открытые уровни, звёзды, лучшие результаты, кристаллы-валюта.
 * Где именно он хранится, решает слой платформы: облако площадки или
 * её собственный механизм сохранения. Здесь только структура данных.
 */
import { CONFIG } from './Config.js';

const DEFAULTS = () => ({
  version: 1,
  unlocked: 1,
  gems: 0,
  levels: {},          // { "3": { stars, tnt, score, crystals } }
  settings: {
    quality: null, lang: null, volume: 0.8, music: 0.45, sensitivity: 1,
    shake: 1, slowmo: 1, invertY: 0, muted: false, haptics: 1,
  },
  stats: { blocks: 0, explosions: 0, plays: 0 },
});

export class SaveManager {
  constructor(platform) {
    this.platform = platform;
    this.data = DEFAULTS();
    this.dirty = false;
    this._timer = null;
  }

  async load() {
    let data = null;
    try { data = await this.platform.loadSave(); } catch (e) { data = null; }
    if (data) {
      this.data = Object.assign(DEFAULTS(), data, {
        settings: Object.assign(DEFAULTS().settings, data.settings || {}),
        stats: Object.assign(DEFAULTS().stats, data.stats || {}),
        levels: data.levels || {},
      });
    }
    return this.data;
  }

  save(immediate = false) {
    this.dirty = true;
    if (immediate) return this._flush();
    if (this._timer) return;
    this._timer = setTimeout(() => this._flush(), 900);
  }

  _flush() {
    this._timer = null;
    if (!this.dirty) return;
    this.dirty = false;
    // Отказ хранилища не должен всплывать необработанным обещанием:
    // площадка бракует сборку за любую ошибку в консоли, а игре
    // достаточно просто продолжить без сохранения.
    try {
      Promise.resolve(this.platform.saveSave(this.data)).catch(() => { });
    } catch (e) { /* платформа недоступна — играем без сохранения */ }
  }

  /* ------------------------------------------------------------ */
  levelData(i) {
    return this.data.levels[i] || null;
  }
  stars(i) {
    const d = this.data.levels[i];
    return d ? d.stars : 0;
  }
  isUnlocked(i) { return i <= this.data.unlocked; }

  completeLevel(i, stars, tntUsed, score, crystals, gemsEarned) {
    const prev = this.data.levels[i] || { stars: 0, tnt: 99, score: 0, crystals: 0 };
    this.data.levels[i] = {
      stars: Math.max(prev.stars, stars),
      tnt: Math.min(prev.tnt, tntUsed),
      score: Math.max(prev.score, score),
      crystals: Math.max(prev.crystals, crystals),
    };
    if (i + 1 > this.data.unlocked) this.data.unlocked = i + 1;
    this.data.gems += (gemsEarned !== undefined ? gemsEarned : crystals);
    this.save();
  }

  get totalStars() { return totalStars(this.data); }
  get gems() { return this.data.gems; }
  get settings() { return this.data.settings; }
}

function totalStars(d) {
  if (!d || !d.levels) return 0;
  let s = 0;
  for (const k in d.levels) s += d.levels[k].stars || 0;
  return s;
}
