/**
 * Платформа YouTube Playables.
 *
 * Строго по документации:
 *  - SDK загружается тегом в index.html ДО кода игры (здесь мы его не грузим);
 *  - firstFrameReady() — как только показан экран загрузки;
 *  - gameReady() — только когда игра интерактивна (главное меню);
 *  - сохранения только через loadData/saveData, saveData не вызывается,
 *    пока не завершился loadData;
 *  - язык только через system.getLanguage(), без браузерного определения;
 *  - пауза только через system.onPause/onResume, никакого Page Visibility API;
 *  - звук подчиняется system.isAudioEnabled()/onAudioEnabledChange;
 *  - реклама только через ytgame.ads.
 *
 * Вне окружения Playables (локальная разработка) SDK работает как no-op,
 * поэтому сохранение уходит в браузерное хранилище — ровно как в примере
 * из официальной документации.
 */
const YT = () => (typeof ytgame !== 'undefined' ? ytgame : null);
const IN_ENV = () => { const y = YT(); return !!(y && y.IN_PLAYABLES_ENV); };

const LOCAL_KEY = 'boomblock_playables_dev';

/* ------------------------------------------------------------------ */
/* Компактный вид сохранения                                           */
/*                                                                     */
/* Полный JSON прогресса — это ~1.8 КБ на длинных ключах вроде          */
/* "levels":{"7":{"stars":3,...}}. Упакованный — около 400 байт: те же  */
/* данные, но короткими ключами и одной строкой на все уровни.          */
/* Читаем оба формата, поэтому старые сохранения не теряются.           */
/* ------------------------------------------------------------------ */
const r2 = (v) => (v === undefined || v === null) ? '' : Math.round(v * 100) / 100;
const num = (v, d) => (v === '' || v === undefined) ? d : +v;

function pack(d) {
  const s = d.settings || {};
  const st = d.stats || {};
  const lv = [];
  for (const k in (d.levels || {})) {
    const L = d.levels[k] || {};
    lv.push([k, L.stars | 0, L.tnt | 0, Math.round(L.score || 0), L.crystals | 0].join(','));
  }
  const out = {
    v: 2,
    u: d.unlocked | 0,
    g: d.gems | 0,
    l: lv.join(';'),
    s: [
      s.quality || '', s.lang || '',
      r2(s.volume), r2(s.music), r2(s.sensitivity), r2(s.shake),
      s.slowmo ? 1 : 0, s.invertY ? 1 : 0, s.muted ? 1 : 0, s.haptics ? 1 : 0,
    ].join(','),
    n: [st.blocks | 0, st.explosions | 0, st.plays | 0].join(','),
  };
  if (d.bestScore) out.b = Math.round(d.bestScore);
  if (d.tornadoes) out.t = d.tornadoes | 0;      // запас смерчей (песочница)
  if (d.tornadoAds) out.ta = d.tornadoAds | 0;   // просмотренные ролики
  return out;
}

function unpack(o) {
  if (!o || typeof o !== 'object') return null;
  if (o.v !== 2) return o;               // старый полный формат — как есть

  const levels = {};
  for (const row of String(o.l || '').split(';')) {
    if (!row) continue;
    const [k, stars, tnt, score, crystals] = row.split(',');
    if (!k) continue;
    levels[k] = { stars: +stars || 0, tnt: +tnt || 0, score: +score || 0, crystals: +crystals || 0 };
  }
  const s = String(o.s || '').split(',');
  const n = String(o.n || '').split(',');
  return {
    version: 1,
    unlocked: o.u | 0 || 1,
    gems: o.g | 0,
    bestScore: o.b | 0,
    tornadoes: o.t | 0,
    tornadoAds: o.ta | 0,
    levels,
    settings: {
      quality: s[0] || null,
      lang: s[1] || null,
      volume: num(s[2], 0.8), music: num(s[3], 0.45),
      sensitivity: num(s[4], 1), shake: num(s[5], 1),
      slowmo: num(s[6], 1), invertY: num(s[7], 0),
      muted: num(s[8], 0) === 1, haptics: num(s[9], 1),
    },
    stats: { blocks: n[0] | 0, explosions: n[1] | 0, plays: n[2] | 0 },
  };
}

export class Platform {
  constructor() {
    this.name = 'playables';
    this.available = false;
    this.saveLoaded = false;
    this.lastInterstitial = -1e9;
    this.pauseCbs = [];
    this.resumeCbs = [];
    this.audioCbs = [];
    this.savePending = null;
    this.saveTimer = null;
    this.lastSaved = null;       // что уже лежит в хранилище
    this.storageBroken = false;  // площадка отказала в записи
  }

  /* ---------------- жизненный цикл ---------------- */
  async init() {
    const y = YT();
    this.available = !!y;
    this.inEnv = IN_ENV();
    if (!y) return false;

    try {
      y.system.onPause(() => { for (const cb of this.pauseCbs) cb(); });
      y.system.onResume(() => { for (const cb of this.resumeCbs) cb(); });
      y.system.onAudioEnabledChange((on) => { for (const cb of this.audioCbs) cb(!!on); });
    } catch (e) { this.logWarning('sdk callbacks'); }
    return true;
  }

  /** Показан первый кадр (экран загрузки). */
  firstFrameReady() {
    const y = YT();
    if (y && y.game && y.game.firstFrameReady) {
      try { y.game.firstFrameReady(); } catch (e) { }
    }
  }

  /** Игра интерактивна. Вызывается ТОЛЬКО когда загрузочный экран убран. */
  gameReady() {
    const y = YT();
    if (y && y.game && y.game.gameReady) {
      try { y.game.gameReady(); } catch (e) { }
    }
  }

  // в Playables нет отдельных событий начала/конца геймплея
  gameplayStart() { }
  gameplayStop() { }

  /* ---------------- сохранения ---------------- */
  async loadSave() {
    const y = YT();
    if (this.inEnv && y) {
      try {
        const raw = await y.game.loadData();
        this.saveLoaded = true;
        if (!raw) return null;
        this.lastSaved = raw;
        return unpack(JSON.parse(raw));
      } catch (e) {
        // сохранения нет или сервис недоступен — начинаем с чистого листа,
        // но saveData разрешаем: loadData завершился
        this.saveLoaded = true;
        return null;
      }
    }
    // локальная разработка
    this.saveLoaded = true;
    try {
      const raw = window.localStorage.getItem(LOCAL_KEY);
      if (!raw) return null;
      this.lastSaved = raw;
      return unpack(JSON.parse(raw));
    } catch (e) { return null; }
  }

  /**
   * Запись прогресса.
   *
   * Хранилище площадки — общий ресурс, и в тестовом окружении Playables оно
   * бывает почти забито (ключ там содержит полный URL сборки, а квота на
   * origin одна на всех). Поэтому:
   *  - пишем упакованный вид, он в несколько раз короче;
   *  - не пишем то же самое повторно;
   *  - если хранилище отказало по квоте, больше не дёргаем его до конца
   *    сессии: игра продолжается, просто без сохранения.
   */
  async saveSave(data) {
    if (!this.saveLoaded) return false;      // нельзя перетереть облако
    if (this.storageBroken) return false;

    let str;
    try { str = JSON.stringify(pack(data)); } catch (e) { return false; }
    if (str === this.lastSaved) return true;
    if (str.length > 3 * 1024 * 1024) { this.logWarning('save too big'); return false; }
    if (str.isWellFormed && !str.isWellFormed()) { this.logWarning('save not well-formed'); return false; }

    const y = YT();
    if (this.inEnv && y) {
      try {
        await y.game.saveData(str);
        this.lastSaved = str;
        return true;
      } catch (e) {
        this.noteSaveError(e);
        return false;
      }
    }
    try {
      window.localStorage.setItem(LOCAL_KEY, str);
      this.lastSaved = str;
      return true;
    } catch (e) {
      this.noteSaveError(e);
      return false;
    }
  }

  /**
   * Ошибка записи. Нехватку места лечить нечем — отключаем сохранение,
   * чтобы не сыпать ошибками на каждой карте.
   */
  noteSaveError(e) {
    const name = (e && e.name) || '';
    const msg = String((e && e.message) || e || '');
    if (name === 'QuotaExceededError' || /quota|exceeded|storage/i.test(msg)) {
      this.markStorageBroken();
    } else {
      this.logError(e);
    }
  }

  markStorageBroken() {
    if (this.storageBroken) return;
    this.storageBroken = true;
    this.logWarning('storage unavailable');
  }

  /* ---------------- язык ---------------- */
  async getLanguage() {
    const y = YT();
    if (this.inEnv && y) {
      try { return await y.system.getLanguage(); } catch (e) { return 'en'; }
    }
    return 'en';   // определять язык браузерными средствами нельзя
  }

  /* ---------------- звук ---------------- */
  isAudioEnabled() {
    const y = YT();
    if (y && y.system && y.system.isAudioEnabled) {
      try { return !!y.system.isAudioEnabled(); } catch (e) { return true; }
    }
    return true;
  }
  onAudioEnabledChange(cb) { this.audioCbs.push(cb); }

  /* ---------------- пауза ---------------- */
  onPause(cb) { this.pauseCbs.push(cb); }
  onResume(cb) { this.resumeCbs.push(cb); }

  /* ---------------- реклама ---------------- */
  canShowInterstitial(gapSec) {
    return (performance.now() / 1000 - this.lastInterstitial) > gapSec;
  }

  async showInterstitial() {
    const y = YT();
    if (!this.inEnv || !y || !y.ads) return false;
    this.lastInterstitial = performance.now() / 1000;
    try { await y.ads.requestInterstitialAd(); return true; }
    catch (e) { return false; }
  }

  /**
   * @param {string} rewardId постоянный идентификатор типа награды
   */
  async showRewarded(rewardId) {
    const y = YT();
    if (!this.inEnv || !y || !y.ads) {
      // локально награду выдаём сразу, чтобы игру можно было пройти
      await new Promise(r => setTimeout(r, 300));
      return true;
    }
    try { return !!(await y.ads.requestRewardedAd(rewardId)); }
    catch (e) { return false; }
  }

  /** На YouTube короткое предупреждение перед роликом допустимо. */
  get adNoticeSeconds() { return 1; }

  /* ---------------- прочее ---------------- */
  sendScore(value) {
    const y = YT();
    if (!this.inEnv || !y || !y.engagement) return;
    const v = Math.max(0, Math.floor(value));
    if (!Number.isSafeInteger(v)) return;
    try { y.engagement.sendScore({ value: v }).catch(() => { }); } catch (e) { }
  }

  logError(e) {
    const y = YT();
    if (y && y.health && y.health.logError) { try { y.health.logError(); } catch (_) { } }
  }
  logWarning(m) {
    const y = YT();
    if (y && y.health && y.health.logWarning) { try { y.health.logWarning(); } catch (_) { } }
  }

  /* ---------------- особенности площадки ---------------- */
  get hostHasMuteButton() { return true; }   // свою кнопку звука не показываем
  get hostHasTopBar() { return true; }       // сверху панель YouTube — отступаем
  get blockStyle() { return 'rounded'; }     // собственный стиль блоков
  // YouTube требует, чтобы игра полностью проходилась одной мышью,
  // поэтому экранные контролы показываем и на настольном компьютере.
  get onScreenControls() { return true; }
  get allowHaptics() { return true; }        // но с переключателем в настройках
}
