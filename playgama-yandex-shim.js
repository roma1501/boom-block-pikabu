/*
 * Playgama Bridge v2 adapter for games written against the Yandex Games SDK.
 * Loaded right after https://bridge.playgama.com/v2/stable/playgama-bridge.js and before the game code.
 * Exposes window.YaGames and maps it to Bridge: initialize, platform.language, game_ready,
 * pause/audio events, interstitial/rewarded ads, storage (player data + localStorage mirror),
 * leaderboards (bridge.leaderboards). Sign-in is not offered.
 * v2 (2026-10-08): language is read once after initialization; leaderboards work.
 * v3 (2026-10-08): no sign-in — the games never show authorization UI, scores go in as guests.
 * v4 (2026-10-18): a full-screen ad pauses the game too (game_api_pause/resume), all saves go to
 *   Storage in one batched call, pending saves are flushed when the page is hidden or paused.
 * v4.1 (2026-10-18): after a pause or an ad only the audio contexts the adapter suspended are resumed.
 */
(function () {
  'use strict';
  if (window.__playgamaYandexShim) return;
  var debug = { log: [] };
  window.__playgamaYandexShim = debug;
  function note(what) { if (debug.log.length < 200) debug.log.push([Math.round(performance.now()), what]); }

  var bridge = window.bridge;
  function getBridge() { return bridge || (bridge = window.bridge); }
  var SAVE_KEY = 'ya_player_data';
  var STATS_KEY = 'ya_player_stats';
  var LS_KEY = 'local_storage_snapshot';
  var cachedLang = null;
  var state = { paused: false, audioEnabled: true, adOpen: false, ready: false, gameplay: 'idle' };
  var cache = { data: {}, stats: {} };
  debug.state = state;
  var handlers = {};
  var lsProto = window.Storage && Storage.prototype;
  var lsSet = lsProto && lsProto.setItem;
  var lsRemove = lsProto && lsProto.removeItem;
  var lsClear = lsProto && lsProto.clear;

  function hasBridge() { var b = getBridge(); return !!(b && b.isInitialized && b.platform); }
  function safe(fn) { try { return fn(); } catch (e) { return undefined; } }
  function later(fn) { setTimeout(function () { safe(fn); }, 0); }
  function timeout(p, ms) { return Promise.race([p, new Promise(function (r) { setTimeout(r, ms); })]); }
  function parse(v) { if (v == null || v === '') return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch (e) { return null; } }

  // ---------- audio: mute everything while paused, ad is open or the platform disabled audio ----------
  var contexts = [];
  // Contexts the adapter holds suspended: only these are resumed when the silence ends, so a context
  // the game suspended for its own pause stays suspended.
  var heldByUs = new Set();
  var media = new Set();
  function silenced() { return state.paused || state.adOpen || !state.audioEnabled; }
  ['AudioContext', 'webkitAudioContext'].forEach(function (name) {
    var Native = window[name];
    if (!Native || Native.__pgWrapped) return;
    var nativeResume = Native.prototype.resume;
    var nativeSuspend = Native.prototype.suspend;
    Native.prototype.resume = function () {
      // The game wants sound back during a pause or an ad: resume it once the silence ends.
      if (silenced()) { heldByUs.add(this); return Promise.resolve(); }
      return nativeResume.apply(this, arguments);
    };
    Native.prototype.suspend = function () {
      heldByUs.delete(this);
      return nativeSuspend.apply(this, arguments);
    };
    var Wrapped = function () {
      var ctx = Reflect.construct(Native, arguments, new.target || Wrapped);
      ctx.__pgNative = { resume: nativeResume, suspend: nativeSuspend };
      contexts.push(ctx);
      if (silenced()) safe(function () { nativeSuspend.call(ctx); heldByUs.add(ctx); });
      return ctx;
    };
    Wrapped.prototype = Native.prototype;
    Wrapped.__pgWrapped = true;
    Wrapped.__pgResume = nativeResume;
    Object.setPrototypeOf(Wrapped, Native);
    window[name] = Wrapped;
  });
  if (window.HTMLMediaElement) {
    var nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      media.add(this);
      if (silenced()) { this.__pgMuted = this.__pgMuted || !this.muted; this.muted = true; }
      return nativePlay.apply(this, arguments);
    };
  }
  function applyAudio() {
    var mute = silenced();
    contexts.forEach(function (ctx) {
      safe(function () {
        var n = ctx.__pgNative;
        if (mute) {
          if (ctx.state === 'running') { n.suspend.call(ctx); heldByUs.add(ctx); }
        } else if (heldByUs.has(ctx)) {
          heldByUs.delete(ctx);
          if (ctx.state === 'suspended') n.resume.call(ctx);
        }
      });
    });
    media.forEach(function (el) {
      if (mute) { if (!el.muted) { el.__pgMuted = true; el.muted = true; } }
      else if (el.__pgMuted) { el.__pgMuted = false; el.muted = false; }
    });
  }

  // ---------- events for game code (ysdk.on('game_api_pause' | 'game_api_resume')) ----------
  function emit(name) {
    (handlers[name] || []).slice().forEach(function (fn) { safe(fn); });
  }
  var lastPauseEmit = false;
  /** The game stops both for a platform pause and while a full-screen ad is open. */
  function gamePaused() { return state.paused || state.adOpen; }
  function syncPause() {
    applyAudio();
    var p = gamePaused();
    if (p === lastPauseEmit) return;
    lastPauseEmit = p;
    emit(p ? 'game_api_pause' : 'game_api_resume');
  }

  // ---------- storage ----------
  function isServiceKey(k) {
    return /ya_player_data|ya_player_stats|local_storage_snapshot|bridge|playgama/i.test(k);
  }
  var lastSnapshot = null;
  var snapshotTimer = 0;
  function snapshot() {
    var out = {};
    safe(function () {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!isServiceKey(k)) out[k] = localStorage.getItem(k);
      }
    });
    return JSON.stringify(out);
  }
  function scheduleSnapshot() {
    if (!state.ready) return;
    clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(function () {
      var s = snapshot();
      if (s === lastSnapshot) return;
      lastSnapshot = s;
      storageSet(LS_KEY, s);
    }, 800);
  }
  if (lsProto) {
    lsProto.setItem = function (k, v) {
      var r = lsSet.apply(this, arguments);
      if (this === safe(function () { return window.localStorage; }) && !isServiceKey(String(k))) scheduleSnapshot();
      return r;
    };
    lsProto.removeItem = function (k) {
      var r = lsRemove.apply(this, arguments);
      if (this === safe(function () { return window.localStorage; }) && !isServiceKey(String(k))) scheduleSnapshot();
      return r;
    };
    lsProto.clear = function () {
      var r = lsClear.apply(this, arguments);
      if (this === safe(function () { return window.localStorage; })) scheduleSnapshot();
      return r;
    };
  }
  // Every write is queued and sent to Storage in one call with all changed keys.
  var pending = {};
  var flushWaiters = [];
  var flushTimer = 0;
  function storageSet(key, value) {
    pending[key] = value;
    return new Promise(function (resolve) {
      flushWaiters.push(resolve);
      if (!flushTimer) flushTimer = setTimeout(flush, 150);
    });
  }
  function flush() {
    clearTimeout(flushTimer);
    flushTimer = 0;
    if (!state.ready) return Promise.resolve();
    var waiters = flushWaiters;
    flushWaiters = [];
    var keys = Object.keys(pending);
    function release() { waiters.forEach(function (r) { safe(r); }); }
    if (!keys.length || !hasBridge() || !bridge.storage) { pending = {}; release(); return Promise.resolve(); }
    var values = keys.map(function (k) { return pending[k]; });
    pending = {};
    note('storage:set:' + keys.join(','));
    return Promise.resolve(safe(function () { return bridge.storage.set(keys, values); })).catch(function () {}).then(release);
  }
  debug.flush = flush;
  /** Writes the localStorage mirror and every pending key right away (page hidden, closed or paused). */
  function flushNow() {
    if (!state.ready) return;
    if (snapshotTimer) {
      clearTimeout(snapshotTimer);
      snapshotTimer = 0;
      var s = snapshot();
      if (s !== lastSnapshot) { lastSnapshot = s; pending[LS_KEY] = s; }
    }
    flush();
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) flushNow(); });
  window.addEventListener('pagehide', flushNow);

  /**
   * Loads player data, stats and the localStorage mirror in one Storage call.
   * `overwrite` is used after sign-in: the account's cloud data then wins over what the guest had,
   * and when the account has no data yet the guest progress is uploaded to it instead of being lost.
   */
  async function loadStorage(overwrite) {
    try {
      var values = await timeout(bridge.storage.get([SAVE_KEY, STATS_KEY, LS_KEY]), 6000);
      if (!Array.isArray(values)) return;
      var data = parse(values[0]);
      var stats = parse(values[1]);
      var ls = parse(values[2]);
      if (!overwrite || data) cache.data = data || {};
      if (!overwrite || stats) cache.stats = stats || {};
      if (ls && typeof ls === 'object') {
        Object.keys(ls).forEach(function (k) {
          safe(function () {
            if ((overwrite || localStorage.getItem(k) === null) && ls[k] != null) lsSet.call(localStorage, k, String(ls[k]));
          });
        });
      }
      if (overwrite && !data && Object.keys(cache.data).length) storageSet(SAVE_KEY, JSON.stringify(cache.data));
      if (overwrite && !ls) { lastSnapshot = snapshot(); storageSet(LS_KEY, lastSnapshot); }
    } catch (e) { /* no saved data */ }
  }

  // ---------- Bridge initialization ----------
  var initPromise = null;
  function initBridge() {
    if (initPromise) return initPromise;
    initPromise = (async function () {
      var b = getBridge();
      if (!b || typeof b.initialize !== 'function') { note('no_bridge'); return; }
      try { await timeout(b.initialize(), 10000); } catch (e) { console.warn('[playgama] Bridge initialize failed', e); }
      if (!hasBridge()) { note('bridge_init_failed'); state.ready = true; return; }
      // Read once, right after initialization, as the Bridge docs require.
      cachedLang = normLang(safe(function () { return bridge.platform.language; }));
      state.audioEnabled = safe(function () { return bridge.platform.isAudioEnabled; }) !== false;
      state.paused = safe(function () { return bridge.platform.isPaused; }) === true;
      safe(function () {
        bridge.platform.on(bridge.EVENT_NAME.PAUSE_STATE_CHANGED, function (p) {
          state.paused = !!p;
          note('pause:' + state.paused);
          if (state.paused) flushNow();
          syncPause();
        });
        bridge.platform.on(bridge.EVENT_NAME.AUDIO_STATE_CHANGED, function (on) { state.audioEnabled = !!on; applyAudio(); });
      });
      await loadStorage(false);
      state.ready = true;
      note('bridge_ready:' + safe(function () { return bridge.platform.id; }) + ':' + lang());
      lastSnapshot = snapshot();
      syncPause();
      if (Object.keys(pending).length) flush();
    })();
    return initPromise;
  }
  initBridge();

  // ---------- ads ----------
  var adBusy = false;
  function showAd(kind, callbacks) {
    callbacks = callbacks || {};
    note('ad:' + kind);
    function call(name, arg) { if (typeof callbacks[name] === 'function') safe(function () { callbacks[name](arg); }); }
    initBridge().then(function () {
      var adv = hasBridge() && bridge.advertisement;
      var rewarded = kind === 'rewarded';
      var supported = adv && (rewarded ? adv.isRewardedSupported : adv.isInterstitialSupported);
      if (!supported || adBusy) {
        if (rewarded) call('onError', new Error('Rewarded ad is not available'));
        call('onClose', false);
        return;
      }
      adBusy = true;
      var eventName = rewarded ? bridge.EVENT_NAME.REWARDED_STATE_CHANGED : bridge.EVENT_NAME.INTERSTITIAL_STATE_CHANGED;
      var opened = false, done = false, timer = 0;
      function finish(shown, failed) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        safe(function () { adv.off(eventName, onState); });
        adBusy = false;
        var wasOpen = state.adOpen;
        state.adOpen = false;
        if (failed && rewarded) call('onError', new Error('Ad failed'));
        call('onClose', !!shown);
        // The game's own onClose runs first, then game_api_resume (unless the platform itself is paused).
        if (wasOpen) syncPause();
      }
      function arm(ms) { clearTimeout(timer); timer = setTimeout(function () { if (!opened) finish(false, true); }, ms); }
      function onState(s) {
        if (done) return;
        if (s === 'loading') arm(15000);
        else if (s === 'opened') {
          if (opened) return;
          opened = true;
          clearTimeout(timer);
          state.adOpen = true;
          syncPause();
          call('onOpen');
        } else if (s === 'rewarded') call('onRewarded');
        else if (s === 'closed') finish(true, false);
        else if (s === 'failed') finish(false, true);
      }
      adv.on(eventName, onState);
      arm(5000);
      try {
        var r = rewarded ? adv.showRewarded() : adv.showInterstitial();
        Promise.resolve(r).catch(function () { finish(false, true); });
      } catch (e) { finish(false, true); }
    });
  }

  // ---------- Yandex SDK surface ----------
  function rejectNA() { return Promise.reject(new Error('Not available on this platform')); }
  function pick(obj, keys) {
    if (!Array.isArray(keys)) return JSON.parse(JSON.stringify(obj));
    var out = {};
    keys.forEach(function (k) { if (k in obj) out[k] = obj[k]; });
    return out;
  }
  function deviceType() {
    var t = safe(function () { return bridge.device.type; });
    if (t === 'mobile' || t === 'tablet' || t === 'desktop' || t === 'tv') return t;
    return /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
  }
  function normLang(l) { return String(l || navigator.language || 'en').slice(0, 2).toLowerCase(); }
  /** bridge.platform.language is read once in initBridge(); before that the browser language stands in. */
  function lang() { return cachedLang || normLang(null); }

  // ---------- player / authorization ----------
  function authSupported() { return hasBridge() && safe(function () { return bridge.player.isAuthorizationSupported; }) === true; }
  function authorized() { return hasBridge() && safe(function () { return bridge.player.isAuthorized; }) === true; }
  function playerId() { return String(safe(function () { return bridge.player.id; }) || ''); }
  function playerPhoto(size) {
    var list = safe(function () { return bridge.player.photos; }) || [];
    if (!list.length) return '';
    var i = size === 'small' ? 0 : size === 'large' ? list.length - 1 : Math.min(1, list.length - 1);
    return String(list[i] || '');
  }
  // Sign-in is intentionally not offered on Playgama: the dialog is never opened.
  function openAuthDialog() { return Promise.reject(new Error('Authorization is disabled in this build')); }

  // ---------- leaderboards (Yandex shape on top of bridge.leaderboards) ----------
  function lbType() { return hasBridge() && bridge.leaderboards ? (safe(function () { return bridge.leaderboards.type; }) || 'not_available') : 'not_available'; }
  function lbSetScore(name, score) {
    return initBridge().then(function () {
      if (lbType() === 'not_available') throw new Error('Leaderboards are not available');
      note('lb:set:' + name);
      return bridge.leaderboards.setScore(String(name), Math.max(0, Math.round(Number(score) || 0)));
    });
  }
  function toYandexEntry(e) {
    var photo = String(e.photo || '');
    var score = Math.round(Number(e.score) || 0);
    return {
      rank: Number(e.rank) || 0,
      score: score,
      formattedScore: String(score),
      extraData: '',
      player: {
        uniqueID: String(e.id || ''),
        publicName: String(e.name || ''),
        lang: lang(),
        scopePermissions: { avatar: photo ? 'allow' : 'forbid', public_name: 'allow' },
        getAvatarSrc: function () { return photo; },
        getAvatarSrcSet: function () { return photo; }
      }
    };
  }
  function lbAll(name) {
    return initBridge().then(function () {
      if (lbType() !== 'in_game') throw new Error('Leaderboard entries are not available');
      return bridge.leaderboards.getEntries(String(name));
    }).then(function (list) {
      return (Array.isArray(list) ? list : []).map(toYandexEntry)
        .sort(function (a, b) { return (a.rank || 1e9) - (b.rank || 1e9); });
    });
  }
  function lbGetEntries(name, opts) {
    return lbAll(name).then(function (all) {
      var me = playerId();
      var mine = me ? all.filter(function (e) { return e.player.uniqueID === me; })[0] : null;
      var top = Math.max(1, Math.min(20, Number(opts && opts.quantityTop) || 10));
      var entries = all.slice(0, top);
      if (mine && entries.indexOf(mine) < 0 && opts && opts.includeUser) entries.push(mine);
      return {
        leaderboard: { name: String(name), title: { en: String(name) } },
        ranges: [{ start: 0, size: entries.length }],
        userRank: mine ? mine.rank : 0,
        entries: entries
      };
    });
  }
  function lbGetPlayerEntry(name) {
    return lbAll(name).then(function (all) {
      var me = playerId();
      var mine = me ? all.filter(function (e) { return e.player.uniqueID === me; })[0] : null;
      if (!mine) { var err = new Error('Player is not present in leaderboard'); err.code = 'LEADERBOARD_PLAYER_NOT_PRESENT'; throw err; }
      return mine;
    });
  }
  function lbDescription(name) {
    return initBridge().then(function () {
      if (lbType() === 'not_available') throw new Error('Leaderboards are not available');
      return {
        appID: '', name: String(name), dafault: true, default: true,
        title: { en: String(name) },
        description: { invert_sort_order: false, score_format: { type: 'numeric', options: { decimal_offset: 0 } } }
      };
    });
  }

  var player = {
    getMode: function () { return authorized() ? '' : 'lite'; },
    isAuthorized: function () { return authorized(); },
    getUniqueID: function () { return playerId(); },
    getName: function () { return authorized() ? String(safe(function () { return bridge.player.name; }) || '') : ''; },
    getPhoto: function (size) { return authorized() ? playerPhoto(size) : ''; },
    getIDsPerGame: function () { return Promise.resolve([]); },
    getPayingStatus: function () { return 'unknown'; },
    getData: function (keys) { return initBridge().then(function () { return pick(cache.data, keys); }); },
    setData: function (data) {
      cache.data = Object.assign({}, data || {});
      return initBridge().then(function () { return storageSet(SAVE_KEY, JSON.stringify(cache.data)); }).then(function () { return true; });
    },
    getStats: function (keys) { return initBridge().then(function () { return pick(cache.stats, keys); }); },
    setStats: function (stats) {
      cache.stats = Object.assign({}, stats || {});
      return initBridge().then(function () { return storageSet(STATS_KEY, JSON.stringify(cache.stats)); }).then(function () { return true; });
    },
    incrementStats: function (inc) {
      Object.keys(inc || {}).forEach(function (k) { cache.stats[k] = (Number(cache.stats[k]) || 0) + (Number(inc[k]) || 0); });
      return initBridge().then(function () { return storageSet(STATS_KEY, JSON.stringify(cache.stats)); }).then(function () { return pick(cache.stats, Object.keys(inc || {})); });
    }
  };

  var leaderboardsLegacy = {
    setLeaderboardScore: lbSetScore,
    getLeaderboardEntries: lbGetEntries,
    getLeaderboardPlayerEntry: lbGetPlayerEntry,
    getLeaderboardDescription: lbDescription
  };

  var gameReadySent = false;
  var ysdk = {
    get environment() {
      return {
        app: { id: '' },
        browser: { lang: lang() },
        i18n: { lang: lang(), tld: 'com' },
        payload: safe(function () { return bridge.platform.payload; }) || null
      };
    },
    get deviceInfo() {
      var t = deviceType();
      return {
        type: t,
        isMobile: function () { return t === 'mobile'; },
        isTablet: function () { return t === 'tablet'; },
        isDesktop: function () { return t === 'desktop'; },
        isTV: function () { return t === 'tv'; }
      };
    },
    EVENTS: {
      HISTORY_BACK: 'HISTORY_BACK',
      ACCOUNT_SELECTION_DIALOG_OPENED: 'ACCOUNT_SELECTION_DIALOG_OPENED',
      ACCOUNT_SELECTION_DIALOG_CLOSED: 'ACCOUNT_SELECTION_DIALOG_CLOSED'
    },
    features: {
      LoadingAPI: {
        ready: function () {
          if (gameReadySent) return;
          gameReadySent = true;
          initBridge().then(function () { note('game_ready'); safe(function () { bridge.platform.sendMessage('game_ready'); }); });
        }
      },
      GameplayAPI: {
        start: function () {
          if (state.gameplay === 'active') return;
          var msg = state.gameplay === 'paused' ? 'level_resumed' : 'level_started';
          state.gameplay = 'active';
          initBridge().then(function () { safe(function () { bridge.platform.sendMessage(msg); }); });
        },
        stop: function () {
          if (state.gameplay !== 'active') return;
          state.gameplay = 'paused';
          initBridge().then(function () { safe(function () { bridge.platform.sendMessage('level_paused'); }); });
        }
      },
      PluginEngineDataReporterAPI: { report: function () {} },
      GamesAPI: { getAllGames: function () { return Promise.resolve({ games: [] }); }, getGameByID: rejectNA }
    },
    adv: {
      showFullscreenAdv: function (opts) { showAd('interstitial', opts && opts.callbacks); },
      showRewardedVideo: function (opts) { showAd('rewarded', opts && opts.callbacks); },
      showBannerAdv: function () { return Promise.resolve({ stickyAdvIsShowing: false, reason: 'UNKNOWN' }); },
      hideBannerAdv: function () { return Promise.resolve({ stickyAdvIsShowing: false }); },
      getBannerAdvStatus: function () { return Promise.resolve({ stickyAdvIsShowing: false, reason: 'UNKNOWN' }); }
    },
    auth: { openAuthDialog: openAuthDialog },
    openAuthDialog: openAuthDialog,
    getPlayer: function () { return initBridge().then(function () { return player; }); },
    getLeaderboards: function () { return Promise.resolve(leaderboardsLegacy); },
    leaderboards: {
      setScore: lbSetScore,
      getEntries: lbGetEntries,
      getPlayerEntry: lbGetPlayerEntry,
      getDescription: lbDescription
    },
    getPayments: rejectNA,
    payments: { getCatalog: rejectNA, getPurchases: rejectNA, purchase: rejectNA, consumePurchase: rejectNA },
    getFlags: function () { return Promise.resolve({}); },
    isAvailableMethod: function (method) {
      return initBridge().then(function () {
        var m = String(method || '');
        if (/^leaderboards\./.test(m)) return lbType() !== 'not_available';
        return false;
      });
    },
    getStorage: function () { return Promise.resolve(window.localStorage); },
    serverTime: function () { return Date.now(); },
    shortcut: {
      canShowPrompt: function () { return Promise.resolve({ canShow: false }); },
      showPrompt: function () { return Promise.resolve({ outcome: 'rejected' }); }
    },
    feedback: {
      canReview: function () { return Promise.resolve({ value: false, reason: 'UNKNOWN' }); },
      requestReview: function () { return Promise.resolve({ feedbackSent: false }); }
    },
    screen: {
      fullscreen: {
        get status() { return document.fullscreenElement ? 'on' : 'off'; },
        STATUS_ON: 'on',
        STATUS_OFF: 'off',
        request: function () { return Promise.resolve(safe(function () { return document.documentElement.requestFullscreen(); })).catch(function () {}); },
        exit: function () { return Promise.resolve(safe(function () { return document.exitFullscreen(); })).catch(function () {}); }
      }
    },
    clipboard: {
      writeText: function (t) { return Promise.resolve(safe(function () { return navigator.clipboard.writeText(t); })).catch(function () {}); }
    },
    multiplayer: {
      sessions: { init: function () { return Promise.resolve([]); }, commit: function () {}, push: function () {} }
    },
    on: function (name, fn) {
      (handlers[name] = handlers[name] || []).push(fn);
      if (name === 'game_api_pause' && gamePaused()) later(fn);
      return function () { ysdk.off(name, fn); };
    },
    off: function (name, fn) {
      handlers[name] = (handlers[name] || []).filter(function (h) { return h !== fn; });
    },
    dispatchEvent: function () { return Promise.resolve(); }
  };

  window.YaGames = {
    init: function () { note('YaGames.init'); return initBridge().then(function () { return ysdk; }); }
  };

  // ---------- games that inject the Yandex SDK script themselves ----------
  function isYandexSdkScript(node) {
    if (!node || node.nodeName !== 'SCRIPT') return false;
    var src = node.getAttribute && node.getAttribute('src');
    if (!src) return false;
    return /^(\.?\/)?sdk\.js(\?.*)?$/.test(src) || /yandex\.(ru|com|net)\/games\/sdk/.test(src);
  }
  function fakeLoad(node) {
    note('sdk_script_intercepted');
    initBridge().then(function () {
      later(function () { node.dispatchEvent(new Event('load')); });
    });
    return node;
  }
  function patch(proto, method) {
    var nativeFn = proto[method];
    if (!nativeFn) return;
    proto[method] = function () {
      for (var i = 0; i < arguments.length; i++) {
        if (isYandexSdkScript(arguments[i])) {
          fakeLoad(arguments[i]);
          return method === 'appendChild' || method === 'insertBefore' ? arguments[i] : undefined;
        }
      }
      return nativeFn.apply(this, arguments);
    };
  }
  patch(Node.prototype, 'appendChild');
  patch(Node.prototype, 'insertBefore');
  patch(Element.prototype, 'append');
  patch(Element.prototype, 'prepend');
})();
