/**
 * Платформа Яндекс Игр — тот же интерфейс, что и у Playables,
 * чтобы игровой код не знал, где он запущен.
 */
import { YandexSDKManager } from './YandexSDKManager.js';
import { CONFIG } from './Config.js';

export class Platform {
  constructor() {
    this.name = 'yandex';
    this.sdk = new YandexSDKManager();
    this.available = false;
    this.saveLoaded = false;
    this.pauseCbs = [];
    this.resumeCbs = [];
    this.audioCbs = [];
  }

  async init() {
    this.available = await this.sdk.init().catch(() => false);
    this.sdk.onPauseGame = () => this.firePause();
    this.sdk.onResumeGame = () => this.fireResume();
    this.watchVisibility();
    return this.available;
  }

  firePause() { for (const cb of this.pauseCbs) cb(); }
  fireResume() { for (const cb of this.resumeCbs) cb(); }

  /**
   * Требование площадки (п. 1.3): свёрнутая страница или уход на другую
   * вкладку — игра замолкает. Своих событий на это у Яндекс SDK нет,
   * поэтому слушаем видимость документа и фокус окна. Пауза и возобновление
   * идут теми же колбэками, что и от SDK, а они идемпотентны, так что
   * двойное срабатывание (реклама + потеря фокуса) безвредно.
   *
   * Этот код живёт только в слое Яндекса: в сборке для YouTube Playables
   * Page Visibility API запрещён, и файл туда не попадает.
   */
  watchVisibility() {
    const hidden = () => document.visibilityState === 'hidden';
    document.addEventListener('visibilitychange', () => {
      if (hidden()) this.firePause(); else this.fireResume();
    });
    window.addEventListener('blur', () => this.firePause());
    window.addEventListener('focus', () => { if (!hidden()) this.fireResume(); });
    window.addEventListener('pagehide', () => this.firePause());
  }

  firstFrameReady() { }
  gameReady() { this.sdk.ready(); }
  gameplayStart() { this.sdk.gameplayStart(); }
  gameplayStop() { this.sdk.gameplayStop(); }

  async loadSave() {
    let local = null;
    try {
      const raw = localStorage.getItem(CONFIG.saveKey);
      if (raw) local = JSON.parse(raw);
    } catch (e) { }
    let cloud = null;
    if (this.available) { try { cloud = await this.sdk.loadData(); } catch (e) { } }
    this.saveLoaded = true;
    return pickBetter(local, cloud);
  }

  async saveSave(data) {
    try { localStorage.setItem(CONFIG.saveKey, JSON.stringify(data)); } catch (e) { }
    if (this.available) { this.sdk.saveData(data).catch(() => { }); }
    return true;
  }

  async getLanguage() {
    if (this.available && this.sdk.lang) return this.sdk.lang;
    const nav = (navigator.languages && navigator.languages[0]) || navigator.language;
    return nav || 'ru';
  }

  isAudioEnabled() { return true; }
  onAudioEnabledChange(cb) { this.audioCbs.push(cb); }
  onPause(cb) { this.pauseCbs.push(cb); }
  onResume(cb) { this.resumeCbs.push(cb); }

  canShowInterstitial(gap) { return this.sdk.canShowInterstitial(gap); }
  showInterstitial() { return this.sdk.showInterstitial(); }
  showRewarded() { return this.sdk.showRewarded(); }

  /**
   * Задержка перед межстраничной рекламой. На Яндексе её быть не должно
   * (п. 4.4): ролик открывается сразу в момент события, а не по таймеру.
   */
  get adNoticeSeconds() { return 0; }

  sendScore() { }
  logError(e) { console.error(e); }
  logWarning(m) { console.warn(m); }

  get hostHasMuteButton() { return false; }
  get hostHasTopBar() { return false; }
  get blockStyle() { return 'classic'; }
  get onScreenControls() { return false; }
  get allowHaptics() { return true; }
}

function pickBetter(a, b) {
  const stars = (d) => {
    if (!d || !d.levels) return 0;
    let s = 0; for (const k in d.levels) s += d.levels[k].stars || 0;
    return s;
  };
  if (!a) return b;
  if (!b) return a;
  const sa = stars(a), sb = stars(b);
  return (sb > sa || (sb === sa && (b.unlocked || 0) > (a.unlocked || 0))) ? b : a;
}
