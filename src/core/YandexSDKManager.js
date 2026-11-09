/**
 * Интеграция с Яндекс Играми.
 * Если SDK нет (локальный запуск, другой хостинг) — работает заглушка,
 * игра при этом полностью проходима: реклама просто не показывается,
 * а награда за rewarded выдаётся сразу.
 *
 * Никаких обращений к YaGames вне этого модуля.
 */
export class YandexSDKManager {
  constructor() {
    this.sdk = null;
    this.player = null;
    this.available = false;
    this.initialized = false;
    this.lastInterstitial = 0;
    this.levelsSinceAd = 0;
    this.onPauseGame = null;
    this.onResumeGame = null;
    this.lang = 'ru';
  }

  async init(timeoutMs = 6000) {
    if (this.initialized) return this.available;
    this.initialized = true;
    try {
      await this._loadScript(timeoutMs);
      if (typeof window.YaGames === 'undefined') throw new Error('нет SDK');
      this.sdk = await window.YaGames.init();
      this.available = true;
      this.lang = (this.sdk.environment?.i18n?.lang) || 'ru';
      try {
        this.player = await this.sdk.getPlayer({ scopes: false });
      } catch (e) { this.player = null; }
      console.info('[Yandex] SDK готов');
    } catch (e) {
      this.available = false;
      console.info('[Yandex] SDK недоступен — работаем автономно');
    }
    return this.available;
  }

  /**
   * SDK подключается тегом <script src="https://yandex.ru/games/sdk/v2">
   * в index.html — так требует документация площадки (п. 1.19.1), сами мы
   * его не грузим. Здесь только ждём, пока тег отработает и в window
   * появится YaGames. Вне площадки тег не загрузится, и по таймауту игра
   * уйдёт в автономный режим.
   */
  _loadScript(timeoutMs) {
    return new Promise((resolve, reject) => {
      if (typeof window.YaGames !== 'undefined') return resolve();
      const tag = document.querySelector('script[src*="games/sdk/v2"]');
      // Обычный тег в <head> к моменту запуска модуля уже отработал: если
      // YaGames не появился, скрипт не загрузился и ждать нечего — уходим
      // в автономный режим сразу, без шестисекундной паузы на загрузке.
      if (!tag || !tag.async) return reject(new Error('SDK не загрузился'));
      const t0 = performance.now();
      const tick = () => {
        if (typeof window.YaGames !== 'undefined') return resolve();
        if (performance.now() - t0 > timeoutMs) return reject(new Error('таймаут'));
        setTimeout(tick, 40);
      };
      tick();
    });
  }

  /** Игра загрузилась и готова к показу. */
  ready() {
    if (this.available) { try { this.sdk.features.LoadingAPI?.ready(); } catch (e) { } }
  }
  gameplayStart() {
    if (this.available) { try { this.sdk.features.GameplayAPI?.start(); } catch (e) { } }
  }
  gameplayStop() {
    if (this.available) { try { this.sdk.features.GameplayAPI?.stop(); } catch (e) { } }
  }

  /* ------------------------------------------------------------ */
  async loadData() {
    if (!this.available || !this.player) return null;
    try {
      const d = await this.player.getData(['save']);
      return d && d.save ? d.save : null;
    } catch (e) { return null; }
  }
  async saveData(data) {
    if (!this.available || !this.player) return false;
    try { await this.player.setData({ save: data }, false); return true; }
    catch (e) { return false; }
  }

  /* ------------------------------------------------------------ */
  canShowInterstitial(minGapSec) {
    const t = performance.now() / 1000;
    return t - this.lastInterstitial > minGapSec;
  }

  showInterstitial() {
    return new Promise((resolve) => {
      if (!this.available) return resolve(false);
      this.lastInterstitial = performance.now() / 1000;
      let opened = false;
      try {
        this.sdk.adv.showFullscreenAdv({
          callbacks: {
            onOpen: () => { opened = true; if (this.onPauseGame) this.onPauseGame(); },
            onClose: () => { if (this.onResumeGame) this.onResumeGame(); resolve(opened); },
            onError: () => { if (this.onResumeGame) this.onResumeGame(); resolve(false); },
          },
        });
      } catch (e) { resolve(false); }
    });
  }

  showRewarded() {
    return new Promise((resolve) => {
      if (!this.available) {
        // без SDK честно выдаём награду, чтобы игру можно было пройти
        setTimeout(() => resolve(true), 350);
        return;
      }
      let rewarded = false;
      try {
        this.sdk.adv.showRewardedVideo({
          callbacks: {
            onOpen: () => { if (this.onPauseGame) this.onPauseGame(); },
            onRewarded: () => { rewarded = true; },
            onClose: () => { if (this.onResumeGame) this.onResumeGame(); resolve(rewarded); },
            onError: () => { if (this.onResumeGame) this.onResumeGame(); resolve(false); },
          },
        });
      } catch (e) { resolve(false); }
    });
  }
}
