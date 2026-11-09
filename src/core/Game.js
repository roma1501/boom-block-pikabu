/**
 * Game — сборка и управление всеми системами.
 * Режимы: загрузка → меню → выбор уровня → игра.
 * Меню и выбор уровня используют ту же сцену и те же системы разрушения,
 * поэтому фоновые взрывы в меню — настоящие, с физикой и обвалами.
 */
import * as THREE from 'three';
import { CONFIG } from './Config.js';
import { I18N, t } from './I18n.js';
import { SceneManager } from './SceneManager.js';
import { SaveManager } from './SaveManager.js';
import { SettingsManager } from './SettingsManager.js';
import { Platform } from './Platform.js';
import { PerformanceManager, detectQuality, qualityPreset } from './PerformanceManager.js';

import { buildAtlas, buildFXTextures, buildNoiseTexture } from '../world/Textures.js';
import { setBlockStyle, isRounded, setBevelSegments } from '../world/Style.js';
import { chargeIcon } from '../entities/ChargeModels.js';
import { MAT, MATERIALS } from '../world/Materials.js';
import { PhysicsManager } from '../physics/PhysicsManager.js';
import { DebrisManager } from '../destruction/DebrisManager.js';
import { DestructionSystem } from '../destruction/DestructionSystem.js';
import { ParticleSystem } from '../fx/ParticleSystem.js';
import { ExplosionSystem } from '../fx/ExplosionSystem.js';
import { PostFX } from '../fx/PostFX.js';
import { InputManager } from '../input/InputManager.js';
import { MobileControls, isTouchDevice } from '../input/MobileControls.js';
import { PlayerController } from '../player/PlayerController.js';
import { ViewModel } from '../player/ViewModel.js';
import { TNTManager } from '../entities/TNT.js';
import { CrystalManager } from '../entities/Crystal.js';
import { ChestManager } from '../entities/Chest.js';
import { ShopManager } from './ShopManager.js';
import { EXPLOSIVE_BY_KEY } from '../entities/Explosives.js';
import { FireManager } from '../fx/FireField.js';
import { AudioManager } from '../audio/AudioManager.js';
import { UIManager } from '../ui/UIManager.js';
import { LevelManager } from '../levels/LevelManager.js';
import { MENU_LEVELS } from '../levels/levels.js';
import { Builder } from '../levels/Builder.js';
import { VoxelWorld } from '../world/VoxelWorld.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// Постоянные идентификаторы типов награды за рекламу (требование Playables).
const REWARD_EXTRA_CHARGE = 'extra-charge-1';
const REWARD_GEMS_50 = 'gems-50';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.mode = 'loading';
    this.timeScale = 1;
    this.targetTimeScale = 1;
    this.slowmoT = 0;
    this.slowmoEnabled = true;
    this.paused = false;
    this.clock = new THREE.Clock();
    this.levelIndex = 0;
    this.selectIndex = 0;
    this.level = null;
    this.destruction = null;
    this.tntUsed = 0;
    this.tntLeft = 0;
    this.blocksDestroyed = 0;
    this.completeTimer = -1;
    this.idleTimer = 0;
    this.levelsCompletedSinceAd = 0;
    this.carousel = { x: 0, target: 0, spin: 0 };
    this.menuTimer = 0;
    this.menuReload = 0;
  }

  /* ============================================================ */
  async init(onProgress) {
    const P = (p, t) => { if (onProgress) onProgress(p, t); return frame(); };

    await P(0.05, t('load.0'));
    this.platform = new Platform();
    this.sdk = this.platform;              // совместимость со старым кодом
    this.save = new SaveManager(this.platform);
    this.audio = new AudioManager();
    this.ui = new UIManager(this.audio);

    const sdkPromise = this.platform.init().catch(() => false);
    await sdkPromise;
    this.platform.firstFrameReady();
    await this.save.load();

    // язык: сохранённый выбор игрока → язык площадки
    let hostLang = null;
    try { hostLang = await this.platform.getLanguage(); } catch (e) { hostLang = null; }
    I18N.setLang(this.save.settings.lang || I18N.detect(hostLang));
    I18N.apply();

    let qname = this.save.settings.quality;
    if (!qname) {
      // Определённое качество не пишем в хранилище прямо на старте: у
      // площадки запись может не пройти (общая квота), а сама по себе
      // запись при загрузке ничего не даёт. Уедет вместе с первым
      // настоящим сохранением — стартом карты или сменой настройки.
      qname = detectQuality();
      this.save.settings.quality = qname;
    }
    this.qualityName = qname;
    this.quality = qualityPreset(qname);

    await P(0.14, t('load.1'));
    setBlockStyle(this.platform.blockStyle);   // стиль блоков задаёт площадка
    // на слабых устройствах дуга скругления грубее — геометрии вдвое меньше
    setBevelSegments(qname === 'low' ? 1 : qname === 'medium' ? 2 : 3);
    this.atlas = buildAtlas();
    this.fxTex = buildFXTextures();
    this.noiseTex = buildNoiseTexture(256);

    await P(0.3, t('load.1'));
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas, antialias: false, alpha: false,
      powerPreference: 'high-performance', stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x9fd4ff, 1);

    this.sceneMgr = new SceneManager(this.quality);
    this.scene = this.sceneMgr.scene;
    this.sceneMgr.buildClouds(this.fxTex.cloud, 26, 150, 60);

    this.camera = new THREE.PerspectiveCamera(CONFIG.player.fov, 1, 0.08, 460);
    this.camera.position.set(0, 12, 24);

    await P(0.44, t('load.2'));
    this.particles = new ParticleSystem(this.scene, this.quality, this.fxTex);
    this.physics = new PhysicsManager();
    this.physics.gravity = CONFIG.gravity;
    this.debris = new DebrisManager(this.scene, this.physics, this.atlas, this.quality);

    await P(0.56, t('load.2'));
    this.explosions = new ExplosionSystem(
      this.scene, this.particles, this.physics, null, this.audio, this.quality, this.fxTex);
    this.explosions.setCamera(this.camera);

    this.post = new PostFX(this.renderer, this.quality, this.noiseTex);

    await P(0.68, t('load.2'));
    this.input = new InputManager(this.canvas);
    this.mobile = new MobileControls(this.input, document.body);
    this.touch = isTouchDevice();
    // onScreen — видны ли экранные контролы. На сенсорном экране это
    // единственный способ играть, на площадке с требованием игры одной
    // мышью — обязательный второй способ рядом с клавиатурой.
    this.onScreen = this.touch || !!this.platform.onScreenControls;
    if (this.onScreen) this.mobile.enable(this.touch ? 'touch' : 'mouse');
    // страховка: если детект не сработал, включаем сенсорный режим
    // при первом же настоящем касании
    window.addEventListener('touchstart', () => {
      if (!this.touch) {
        this.touch = true;
        this.onScreen = true;
        this.mobile.enable('touch');
        if (this.level && this.mode === 'play') this.setupTutorial(this.level);
      }
    }, { once: true, passive: true });

    this.player = new PlayerController(this.camera, null, this.input);
    this.viewModel = new ViewModel(this.atlas, this.fxTex);

    this.tnt = new TNTManager(this.scene, null, this.physics, this.particles,
      this.audio, this.explosions, this.atlas);
    this.crystals = new CrystalManager(this.scene, null, this.particles, this.audio);
    this.crystals.setGlowTexture(this.fxTex.glow);
    this.chests = new ChestManager(this.scene, null, this.debris, this.particles,
      this.audio, this.crystals, this.fxTex.glow);

    this.shop = new ShopManager(this.save);
    this.tnt.setShop(this.shop);
    this.fire = new FireManager(null, this.particles, null, this.audio, this.quality);
    this.fire.setQuality(this.quality);
    this.tnt.setFire(this.fire);
    this.explosions.fire = this.fire;
    this.ui.setAtlas(this.atlas);
    this.ui.materialTiles = (m) => MATERIALS[m] && MATERIALS[m].tiles;
    if (isRounded()) this.ui.chargeIcon = (k) => chargeIcon(k);

    this.levels = new LevelManager(this.atlas);
    this.perf = new PerformanceManager(this.quality, this.renderer);
    this.perf.onScaleChange = (s) => {
      this.quality.renderScale = s;
      this.resize();
    };
    this.settings = new SettingsManager(this.save);

    await P(0.82, t('load.3'));
    this.previewGroup = new THREE.Group();
    this.previewGroup.visible = false;
    this.scene.add(this.previewGroup);
    this.previewSlots = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
    for (const s of this.previewSlots) this.previewGroup.add(s);

    this._wire();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 220));
    // Пауза приходит только от платформы: собственных браузерных
    // событий видимости вкладки игра не слушает.

    // Пауза и звук — только через платформу. Page Visibility API
    // в Playables использовать запрещено.
    this.platform.onPause(() => this.hostPause());
    this.platform.onResume(() => this.hostResume());
    this.platform.onAudioEnabledChange((on) => this.setHostAudio(on));
    this.hostAudio = this.platform.isAudioEnabled();

    await P(0.9, t('load.3'));
    try { this._warmup(); } catch (e) { console.warn('прогрев не удался', e); }

    await P(0.95, t('load.4'));
    // Площадка сама даёт кнопку звука — свою в игре не показываем.
    if (this.platform.hostHasMuteButton) document.body.classList.add('host-mute');
    if (this.platform.hostHasTopBar) document.body.classList.add('host-topbar');
    this.ui.syncSettings(this.save.settings);
    this.ui.setMuted(this.save.settings.muted);
    this.settings.apply(this);
    await P(1, t('load.5'));
    return this;
  }

  /**
   * Прогрев: один раз показываем движку все типы материалов (блоки, стекло,
   * обломки, кластеры, три пакета частиц, кольцо, сфера, кристалл, предмет
   * в руках) далеко под картой. Иначе первый взрыв в игре ловит компиляцию
   * шейдеров и даёт фриз на десятки кадров.
   */
  _warmup() {
    const Y = -600;
    const w = new VoxelWorld(4, 4, 4, this.atlas);
    w.set(1, 1, 1, MAT.STONE); w.set(2, 1, 1, MAT.GLASS); w.set(1, 2, 1, MAT.PLANKS);
    w.rebuildAll();
    w.group.position.set(0, Y, 0);
    this.scene.add(w.group);

    this.debris.setClusterMaterials(w.mats);
    this.debris.spawnDebris(0, Y + 1, 0, MAT.STONE, 0.5, 0, 0, 0);
    this.debris.spawnCluster(
      [0, Y, 0, MAT.PLANKS, 1, Y, 0, MAT.PLANKS, 0, Y, 1, MAT.GLASS],
      new THREE.Vector3(), null, 0);

    this.particles.fireball(0, Y + 1, 0, 1, 0.2);
    this.particles.smokeCloud(0, Y + 1, 0, 1, 2);
    this.particles.sparks(0, Y + 1, 0, 3, 1);
    this.explosions.spawnRing(new THREE.Vector3(0, Y, 0), 1, 10);
    this.explosions.spawnSphere(new THREE.Vector3(0, Y, 0), 1, 10);

    this.crystals.world = w;
    this.crystals.spawn(0, Y + 1, 2);
    this.chests.world = w;
    this.tnt.world = w;
    this.tnt.place(2, Y, 2);
    this.tnt.showGhost({ x: 2, y: Y, z: 3, ok: true });

    const prevSun = this.sceneMgr.sun.position.clone();
    this.sceneMgr.fitShadow(0, Y, 0, 14);

    const cam = this.camera.clone();
    cam.position.set(0, Y + 4, 9);
    cam.lookAt(0, Y + 1, 0);
    cam.updateMatrixWorld();

    this.particles.update(0.016);
    this.debris.update(0.016, new THREE.Vector3(0, Y, 0), -9999);
    this.crystals.update(0.016, null, cam);
    this.viewModel.update(0.016, this.player, this.input);
    for (let i = 0; i < 2; i++) {
      this.post.render(this.scene, cam, this.viewModel.scene, this.viewModel.camera, 0.016);
    }

    this.debris.clear();
    this.particles.clear();
    this.crystals.clear();
    this.tnt.clear();
    this.tnt.hideGhost();
    for (const m of this.explosions.rings) m.visible = false;
    for (const m of this.explosions.spheres) m.visible = false;
    this.explosions.rings.length = 0;
    this.explosions.spheres.length = 0;
    // лампы вспышки остаются visible навсегда — гасим только интенсивностью,
    // иначе меняется состав освещения и three пересобирает все шейдеры
    for (const L of this.explosions.lights) { L.active = false; L.light.intensity = 0; }
    this.scene.remove(w.group);
    w.dispose();
    this.sceneMgr.sun.position.copy(prevSun);
  }

  /* ============================================================ */
  _wire() {
    const ui = this.ui;

    ui.on('play', () => {
      this.audio.unlock();
      const next = Math.min(this.save.data.unlocked, this.levels.count) - 1;
      this.startLevel(Math.max(0, next));
    });
    ui.on('levels', () => { this.audio.unlock(); this.enterLevelSelect(this.save.data.unlocked - 1); });
    ui.on('menu', () => this.enterMenu());
    ui.on('quit', () => this.enterMenu());
    ui.on('prev', () => this.moveCarousel(-1));
    ui.on('next', () => this.moveCarousel(1));
    ui.on('start', () => this.startLevel(this.selectIndex));
    ui.on('grid', () => {
      ui.buildGrid(this.levels.count, this.save, (i) => {
        ui.el.gridOverlay.classList.remove('active');
        this.enterLevelSelect(i);
      });
      ui.el.gridOverlay.classList.add('active');
    });
    ui.on('closegrid', () => ui.el.gridOverlay.classList.remove('active'));
    ui.on('pause', () => this.pause(true));
    ui.on('resume', () => this.pause(false));
    ui.on('restart', () => {
      const lost = !!(this.crystals && this.crystals.remaining > 0);
      ui.overlay('pause', false); ui.overlay('complete', false); ui.overlay('reward', false);
      if (lost) this.countAdRound();
      this.startLevel(this.levelIndex);
    });
    ui.on('next', () => this.moveCarousel(1));
    ui.on('settings', () => { ui.syncSettings(this.save.settings); ui.overlay('settings', true); });
    ui.on('closesettings', () => ui.overlay('settings', false));
    ui.on('mute', () => {
      const m = !this.save.settings.muted;
      this.settings.set('muted', m);
      this.audio.setEnabled(!m);
      ui.setMuted(m);
    });
    ui.on('slot', (i) => this.selectSlot(i));
    ui.on('reward', () => this.watchRewarded());
    ui.on('setting', (k, v) => this.changeSetting(k, v));
    ui.on('shop', () => this.enterShop());
    ui.on('adgems', () => this.watchGemsAd());
    ui.bindShopTabs(() => this.refreshShop());
    this.shop.onChange = () => {
      this.refreshShop();
      this.ui.setMenuStats(this.save.totalStars, this.save.gems, this.levels.count * 3);
    };
    I18N.onChange(() => this.onLanguageChanged());

    // кнопка «следующий уровень» на экране победы
    const nextBtn = document.querySelector('#screen-complete [data-act=next]');
    if (nextBtn) {
      nextBtn.dataset.act = 'nextlevel';
      ui.on('nextlevel', () => {
        ui.overlay('complete', false);
        const n = this.levelIndex + 1;
        if (n < this.levels.count) this.startLevel(n);
        else this.enterMenu();
      });
    }

    // Esc закрывает открытое окно на любом экране (требование Playables).
    // preventDefault на Esc не вызываем — это запрещено.
    this.input.onEscape = () => {
      if (this.ui.el.gridOverlay.classList.contains('active')) {
        this.ui.el.gridOverlay.classList.remove('active');
        return;
      }
      for (const m of ['settings', 'reward', 'complete']) {
        if (this.ui.screens[m].classList.contains('active')) {
          this.ui.overlay(m, false);
          if (m === 'settings' && this.mode === 'play' && this.paused) return;
          if (this.mode === 'play') this.pause(false);
          return;
        }
      }
      if (this.mode === 'play') { this.pause(!this.paused); return; }
      if (this.ui.screens.levels.classList.contains('active') ||
        this.ui.screens.shop.classList.contains('active')) this.enterMenu();
    };
    this.input.onPointerLockChange = (locked) => {
      if (locked) { this._lockTime = performance.now(); return; }
      // ставим на паузу только если захват реально держался — иначе игра
      // будет уходить в паузу при неудачных попытках захвата
      if (this.mode === 'play' && !this.paused && !this.ui.isOverlayOpen() && !this.onScreen &&
        performance.now() - (this._lockTime || 0) > 400) {
        this.pause(true);
      }
    };

    this.player.onStep = () => this.audio.footstep(this.player.pos);
    this.player.onLand = (v) => { this.audio.land(v); this.player.addShake(Math.min(0.3, v * 0.016)); };

    // вспышка заметная, но кадр не выбеливается полностью
    this.explosions.onFlash = (v) => { this.post.addFlash(v * 0.26); this.post.addCA(v * 0.6); };
    this.explosions.onCamera = (e) => {
      this.player.addShake(e.shake);
      this.player.addKick(e.dir, e.kick);
      this.player.addFovPunch(e.fov);
      if (e.near > 0.4) this.post.addDust(e.near * 0.34);
    };
    this.explosions.onDistort = (pos, radius) => {
      const p = _v.copy(pos).project(this.camera);
      if (p.z < 1) {
        this.post.setDistort(
          new THREE.Vector2(p.x * 0.5 + 0.5, -p.y * 0.5 + 0.5),
          Math.min(0.75, radius / Math.max(6, this.camera.position.distanceTo(pos)) * 0.35),
          0.9, 0.55);
      }
    };
    this.explosions.onPlayerPush = (dir, f) => {
      if (this.mode !== 'play') return;
      this.player.addImpulse(dir, Math.min(16, f));
      this.ui.flashDamage(Math.min(0.6, f / 18));
    };
    this.explosions.onBigBlast = (count, pos, chain) => {
      if (this.mode !== 'play') return;
      this.blocksDestroyed += count;
      if (chain > 1) this.ui.combo(t('combo.chain', { n: chain }));
      if (count > 14) this.ui.combo(t('combo.destroy', { n: count }), true);
      // замедление — редкое событие, только на действительно крупный разлёт
      if (count > 115 && this.slowmoEnabled) this.triggerSlowmo(0.45, 0.4);
      this.save.data.stats.explosions++;
    };

    this.physics.onWorldImpact = (b, x, y, z, s, n) => {
      if (this.destruction) this.destruction.worldImpact(b, x, y, z, s, n);
    };
    this.physics.onBodyImpact = (b, s) => {
      if (this.audio) this.audio.material(MATERIALS[b.mat].sound, b.pos, Math.min(0.6, s / 16));
    };

    this.debris.onClusterLand = null;

    this.crystals.onCollect = (c, screenPos) => {
      this.ui.flyCrystal(screenPos);
      this.ui.setCrystals(this.crystals.collected, this.crystals.total);
      if (this.destruction) {
        this.destruction.score += CONFIG.score.crystal;
        this.ui.setScore(this.destruction.score);
      }
      this.ui.combo(t('combo.crystal', { n: CONFIG.score.crystal }), true);
      if (this.crystals.remaining === 0 && this.completeTimer < 0) this.completeTimer = 1.7;
    };
  }

  changeSetting(k, v) {
    if (k === 'lang') {
      this.settings.set('lang', v);
      I18N.setLang(v);
      return;
    }
    if (k === 'quality') {
      this.settings.set('quality', v);
      this.pendingQuality = v;
      this.applyQuality(v);
      return;
    }
    if (k === 'slowmo' || k === 'invertY' || k === 'haptics') v = +v;
    this.settings.set(k, v);
    this.settings.apply(this);
    if (k === 'volume' || k === 'music') this.audio.unlock();
  }

  applyQuality(name) {
    if (this.qualityName === name) return;
    this.qualityName = name;
    const q = qualityPreset(name);
    Object.assign(this.quality, q);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.renderer.shadowMap.enabled = q.shadows;
    this.sceneMgr.sun.castShadow = q.shadows;
    if (q.shadows) this.sceneMgr.sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    if (this.sceneMgr.sun.shadow.map) {
      this.sceneMgr.sun.shadow.map.dispose();
      this.sceneMgr.sun.shadow.map = null;
    }
    this.sceneMgr.scene.fog.far = q.viewDistance;
    this.post.bloomLevels = q.bloom ? (name === 'high' ? 2 : 1) : 0;
    this.post.comp.material.uniforms.uUseBloom.value = this.post.bloomLevels > 0 ? 1 : 0;
    this.debris.maxDebris = q.debrisBudget;
    this.debris.maxClusters = q.clusterBudget;
    this.debris.inst.castShadow = q.debrisShadows;
    if (this.fire) this.fire.setQuality(this.quality);
    if (isRounded()) {
      setBevelSegments(name === 'low' ? 1 : name === 'medium' ? 2 : 3);
      if (this.level && this.level.world) this.level.world.rebuildAll();
    }
    this.resize();
  }

  resize() {
    // WebView может отдать нулевой размер до показа — тогда просто ждём
    // следующего события resize, ничего не пересобирая.
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewModel.setAspect(w / h);
    this.post.setSize(w, h);
    this.ui.layoutHotbar();
    if (this.mobile) this.mobile._resize();
  }

  /* ============================================================ */
  /* Управление от площадки                                       */
  /* ============================================================ */
  /** Площадка попросила паузу: останавливаем всё — цикл, звук, физику. */
  hostPause() {
    if (this.hostPaused) return;
    this.hostPaused = true;
    // Интерфейс тоже замирает: пока стоит пауза, ни кнопки меню,
    // ни реклама сработать не должны.
    document.body.classList.add('host-paused');
    this.input.setEnabled(false);
    if (this.mode === 'play' && !this.paused) this.pause(true);
    this.audio.suspend();
    this.save.save(true);            // сохраняемся: игру могут не вернуть
    this.platform.gameplayStop();
  }

  hostResume() {
    if (!this.hostPaused) return;
    this.hostPaused = false;
    document.body.classList.remove('host-paused');
    this.clock.getDelta();           // выбрасываем накопленный простой
    if (this.hostAudio !== false) {
      this.audio.resume();
      const s = this.save.settings;
      if (!s.muted && s.music > 0.01) this.audio.startMusic();
    }
    if (this.mode === 'play' && !this.paused) this.input.setEnabled(true);
    if (this.onHostResume) this.onHostResume();
  }

  /** Настройка звука площадки: при выключенном звуке игра не звучит вообще. */
  setHostAudio(on) {
    this.hostAudio = !!on;
    this.audio.setHostEnabled(!!on);
    if (on) {
      // после включения звука музыка обязана заиграть снова, а не только эффекты
      this.audio.unlock();
      const s = this.save.settings;
      if (!s.muted && s.music > 0.01) this.audio.startMusic();
    }
  }

  /** Сообщаем площадке, что игра готова к взаимодействию. */
  notifyReady() {
    if (this._readySent) return;
    this._readySent = true;
    this.platform.gameReady();
  }

  /* ============================================================ */
  /* Режимы                                                        */
  /* ============================================================ */
  enterMenu() {
    this.mode = 'menu';
    this.paused = false;
    this.audio.worldMuted = true;      // фоновые взрывы в меню — беззвучные
    this.input.setEnabled(false);
    this.ui.show('menu');
    this.ui.showHUD(false);
    this.ui.overlay('pause', false);
    this.ui.overlay('complete', false);
    this.ui.overlay('reward', false);
    this.ui.clearTutorial();
    this.ui.setMenuStats(this.save.totalStars, this.save.gems, this.levels.count * 3);
    this.previewGroup.visible = false;
    this.platform.gameplayStop();
    this.loadMenuScene();
  }

  loadMenuScene() {
    this.unloadLevel();
    // каждая отстройка — случайная диорама, но не та же самая подряд
    let i = Math.floor(Math.random() * MENU_LEVELS.length);
    if (MENU_LEVELS.length > 1 && i === this._lastMenuMap) i = (i + 1) % MENU_LEVELS.length;
    this._lastMenuMap = i;
    const def = MENU_LEVELS[i];

    const [sx, sy, sz] = def.size;
    const world = new VoxelWorld(sx, sy, sz, this.atlas);
    const b = new Builder(world);
    def.build(b);
    world.rebuildAll();
    this.scene.add(world.group);
    this.attachWorld(world, b);

    this.menuCenter = b.buildingCenter.clone();
    this.menuBounds = { x0: 4, x1: sx - 5, z0: 4, z1: sz - 5, groundY: b.groundY };
    this.sceneMgr.fitShadow(this.menuCenter.x, 6, this.menuCenter.z, 24);
    this.sceneMgr.setPreset(['day', 'warm', 'cold'][i % 3]);
    this.menuTimer = 1.6;
    this.menuReload = 26;
    this.menuAngle = Math.random() * Math.PI * 2;
    this.level = { world, center: this.menuCenter, radius: 20 };
  }

  /** Пересобирает все динамические подписи после смены языка. */
  onLanguageChanged() {
    I18N.apply();
    this.ui.syncSettings(this.save.settings);
    this.ui.setMenuStats(this.save.totalStars, this.save.gems, this.levels.count * 3);
    if (this.mode === 'levelselect') this.updateSelectUI();
    if (this.ui.screens.shop.classList.contains('active')) this.refreshShop();
    if (this.mode === 'play' && this.level) {
      this.buildHotbar();
      this.ui.setSlot(this.slot);
      this.ui.setTnt(this.tntLeft);
      this.setupTutorial(this.level);
      this.ui.setLevelInfo(this.levelIndex + 1,
        I18N.levelName(this.levelIndex, this.level.name),
        I18N.levelHint(this.levelIndex, this.level.hint));
    }
  }

  enterShop() {
    this.audio.unlock();
    this.mode = 'menu';
    this.audio.worldMuted = true;
    this.input.setEnabled(false);
    this.ui.show('shop');
    this.ui.showHUD(false);
    this.previewGroup.visible = false;
    this.refreshShop();
  }

  refreshShop() {
    this.ui.renderShop(this.shop, (kind, key) => {
      const ok = kind === 'player' ? this.shop.buyPlayer(key) : this.shop.buy(key);
      if (ok) {
        this.applyUpgrades();
        this.ui.combo(t(kind === 'player' ? 'shop.upgraded' : 'shop.bought'));
      }
    });
  }

  async watchGemsAd() {
    if (this.hostPaused) return;
    const ok = await this.platform.showRewarded(REWARD_GEMS_50);
    if (ok) {
      this.shop.addGems(50);
      this.audio.ui('star');
    }
    this.refreshShop();
  }

  /** Переносит купленные улучшения в игровые системы. */
  applyUpgrades() {
    const s = this.shop;
    this.player.speedMul = s.speedMul;
    this.player.jumpMul = s.jumpMul;
    this.player.shakeScale = this.save.settings.shake * s.armorMul;
    this.player.pushScale = s.armorMul;
    this.crystals.magnetMul = s.magnetMul;
  }

  enterLevelSelect(index) {
    this.mode = 'levelselect';
    this.audio.worldMuted = true;
    this.input.setEnabled(false);
    this.selectIndex = Math.max(0, Math.min(this.levels.count - 1, index));
    this.ui.show('levels');
    this.ui.showHUD(false);
    this.unloadLevel();
    this.previewGroup.visible = true;
    this.previewGroup.position.set(0, 40, 0);
    this.sceneMgr.fitShadow(0, 44, 0, 22);
    this.carousel.x = 0; this.carousel.target = 0; this.carousel.spin = 0;
    this.refreshCarousel(true);
    this.updateSelectUI();
  }

  updateSelectUI() {
    const i = this.selectIndex;
    const def = this.levels.def(i);
    const locked = !this.save.isUnlocked(i + 1);
    this.ui.setLevelSelect(i + 1, I18N.levelName(i, def.name), this.save.stars(i + 1), locked,
      i > 0, i < this.levels.count - 1);
  }

  moveCarousel(dir) {
    if (this.mode !== 'levelselect') return;
    const n = this.selectIndex + dir;
    if (n < 0 || n >= this.levels.count) return;
    this.selectIndex = n;
    this.refreshCarousel();
    this.carousel.x = dir * 15;      // остров «въезжает» с нужной стороны
    this.updateSelectUI();
  }

  refreshCarousel() {
    for (let k = 0; k < 3; k++) {
      const idx = this.selectIndex + (k - 1);
      const s = this.previewSlots[k];
      while (s.children.length) s.remove(s.children[0]);
      if (idx < 0 || idx >= this.levels.count) continue;
      const g = this.levels.preview(idx);
      if (g.parent) g.parent.remove(g);
      s.add(g);
    }
  }

  /* ============================================================ */
  startLevel(index) {
    this.audio.unlock();
    this.levelIndex = Math.max(0, Math.min(this.levels.count - 1, index));
    this.unloadLevel();
    this.previewGroup.visible = false;

    const L = this.levels.create(this.levelIndex);
    this.level = L;
    L.world.rebuildAll();
    this.scene.add(L.world.group);
    this.attachWorld(L.world);

    // кристаллы и сундуки
    for (const [x, y, z] of L.crystals) this.crystals.spawn(x, y, z);
    for (const [x, y, z, n] of L.chests) this.chests.add(x, y, z, n);
    this.crystals.total = L.totalCrystals;

    // игрок
    this.player.world = L.world;
    const sp = L.spawn;
    let sy = L.world.groundAt(Math.floor(sp.x), Math.floor(sp.z), L.world.sy - 1);
    // разворачиваем игрока лицом к постройке — иначе он смотрит в пустоту
    const yaw = Math.atan2(-(L.center.x - sp.x), -(L.center.z - sp.z));
    this.player.setSpawn(sp.x, (sy >= 0 ? sy + 1 : sp.y), sp.z, yaw);
    this.player.fovBase = CONFIG.player.fov;
    this.player.enabled = true;

    // состояние
    this.tntUsed = 0;
    this.tntLeft = L.tnt + this.shop.extraCharges;
    this.blocksDestroyed = 0;
    this.completeTimer = -1;
    this.idleTimer = 0;
    this.rewardShown = false;
    this.applyUpgrades();
    this.buildHotbar();
    this.slot = 0;
    this.chargeIndex = 0;
    this.viewModel.setItem(0);
    this.viewModel.setChargeType(this.currentCharge().mat, this.currentCharge().key);
    this.viewModel.hidden = false;
    this.mobile.setActiveSlot(0);

    this.sceneMgr.fitShadow(L.center.x, L.center.y, L.center.z, Math.max(28, L.radius));
    this.sceneMgr.setPreset(this.levelIndex % 3 === 1 ? 'warm' : this.levelIndex % 3 === 2 ? 'cold' : 'day');

    // интерфейс
    this.screenMode();
    this.ui.showHUD(true);
    this.ui.setLevelInfo(this.levelIndex + 1,
      I18N.levelName(this.levelIndex, L.name), I18N.levelHint(this.levelIndex, L.hint));
    this.ui.setCrystals(0, L.totalCrystals);
    this.ui.setScore(0);
    this.ui.scoreShown = 0;
    this.ui.setGems(this.save.gems);
    this.ui.setTnt(this.tntLeft);
    this.ui.setSlot(0);
    this.setupTutorial(L);

    this.mode = 'play';
    this.paused = false;
    this.audio.worldMuted = false;
    this.input.setEnabled(true);
    if (!this.onScreen) this.input.requestLock();
    this.platform.gameplayStart();
    this.save.data.stats.plays++;
    this.save.save();
    this.perf.reset();
  }

  screenMode() {
    for (const k in this.ui.screens) {
      if (k === 'hud') continue;
      this.ui.screens[k].classList.remove('active');
    }
  }

  attachWorld(world, builder) {
    this.physics.setWorld(world);
    this.particles.setWorld(world);
    this.fire.setWorld(world);
    this.tnt.world = world;
    this.crystals.world = world;
    this.chests.world = world;
    this.player.world = world;
    this.debris.setClusterMaterials(world.mats);

    this.destruction = new DestructionSystem(
      world, this.physics, this.debris, this.particles, this.audio, this.quality);
    this.explosions.destruction = this.destruction;
    this.tnt.destruction = this.destruction;
    this.fire.destruction = this.destruction;
    this.destruction.onScore = (amount, reason, pos) => {
      this.ui.setScore(this.destruction.score);
      if (reason === 'collapse' && this.mode === 'play') {
        this.ui.combo(t('combo.collapse', { n: amount }));
      }
    };
    this.destruction.onCollapse = (n, pos) => {
      if (this.mode === 'play') {
        this.player.addShake(Math.min(0.9, 0.2 + n * 0.012));
        this.post.addDust(Math.min(0.3, n * 0.005));
        if (n > 70 && this.slowmoEnabled) this.triggerSlowmo(0.5, 0.35);
      }
      this.save.data.stats.blocks += n;
    };
    this.destruction.onBlockDestroyed = (x, y, z, m) => {
      this.chests.notifyDestroyed(x, y, z, m);
    };
  }

  unloadLevel() {
    this.tnt.clear();
    this.fire.clear();
    this.crystals.clear();
    this.chests.clear();
    this.debris.clear();
    this.particles.clear();
    this.physics.clear();
    if (this.level && this.level.world) {
      this.scene.remove(this.level.world.group);
      this.level.world.dispose();
    }
    this.level = null;
    this.destruction = null;
  }

  setupTutorial(L) {
    this.ui.clearTutorial();
    if (!L.tutorial) return;
    const sfx = this.touch ? '.touch' : (this.onScreen ? '.mouse' : '.pc');
    this.ui.setTutorial([
      { id: 'move', text: t('tut.move' + sfx) },
      { id: 'place', text: t('tut.place' + sfx) },
      { id: 'switch', text: t('tut.switch' + sfx) },
      { id: 'ignite', text: t('tut.ignite' + sfx) },
    ]);
  }

  /* ============================================================ */
  pause(on) {
    if (this.mode !== 'play') return;
    this.paused = on;
    this.ui.overlay('pause', on);
    if (on) {
      this.input.exitLock();
      this.platform.gameplayStop();
    } else {
      this.ui.overlay('settings', false);
      this.input.setEnabled(true);      // после паузы площадки ввод возвращаем
      if (!this.onScreen) this.input.requestLock();
      this.platform.gameplayStart();
    }
  }

  triggerSlowmo(scale, dur) {
    if (!this.slowmoEnabled) return;
    this.targetTimeScale = scale;
    this.slowmoT = dur;
  }

  /* ============================================================ */
  /* ---------------- панель предметов ---------------- */
  buildHotbar() {
    this.charges = this.shop.unlockedList();
    const items = this.charges.map(e => ({
      kind: 'charge', key: e.key, name: t(e.name), tile: MATERIALS[e.mat].tiles[1], cost: e.charges,
    }));
    items.push({ kind: 'lighter', name: t('ex.lighter') });
    this.hotbar = items;
    this.lighterSlot = items.length - 1;
    this.ui.buildHotbar(items);
  }

  currentCharge() {
    return this.charges[Math.min(this.chargeIndex, this.charges.length - 1)];
  }

  selectSlot(i) {
    if (!this.hotbar || i < 0 || i >= this.hotbar.length) return;
    const wasLighter = this.slot === this.lighterSlot;
    if (this.slot === i) return;
    this.slot = i;
    if (i === this.lighterSlot) {
      this.viewModel.setItem(1);
      this.ui.completeTutorialStep('switch');
    } else {
      this.chargeIndex = i;
      this.viewModel.setItem(0);
      this.viewModel.setChargeType(this.currentCharge().mat, this.currentCharge().key);
      if (wasLighter) this.viewModel.switchT = 0;
      this.ui.combo(t(this.currentCharge().name), true);
    }
    this.mobile.setActiveSlot(i === this.lighterSlot ? 1 : 0);
    if (i !== this.lighterSlot) {
      this.mobile.setChargeIcon(this.ui.chargeIcon
        ? this.ui.chargeIcon(this.currentCharge().key)
        : this.ui.tileImage(MATERIALS[this.currentCharge().mat].tiles[1]));
    }
    this.ui.setSlot(i);
    this.ui.setTnt(this.tntLeft);
    this.audio.ui('tab');
  }

  /** Мобильная кнопка: по нажатию перебирает открытые заряды. */
  cycleCharge() {
    if (this.slot !== this.lighterSlot && this.charges.length > 1) {
      this.selectSlot((this.slot + 1) % this.charges.length);
    } else {
      this.selectSlot(this.chargeIndex);
    }
  }

  _aimEye() {
    if (!this._eye) this._eye = new THREE.Vector3();
    return this._eye.set(this.player.pos.x, this.player.pos.y + CONFIG.player.eye, this.player.pos.z);
  }
  _aimDir() {
    if (!this._dir) this._dir = new THREE.Vector3();
    return this.player.getDirection(this._dir);
  }

  useItem() {
    if (this.mode !== 'play' || this.paused) return;
    const eye = this._aimEye(), dir = this._aimDir();

    if (this.slot !== this.lighterSlot) {
      const def = this.currentCharge();
      if (this.tntLeft < def.charges) { this.viewModel.playDeny(); this.audio.ui('deny'); return; }
      const p = this.tnt.findPlacement(eye, dir, CONFIG.tnt.placeReach, this.player.pos);
      if (!p || !p.ok) { this.viewModel.playDeny(); this.audio.ui('deny'); return; }
      this.tnt.place(p.x, p.y, p.z, def.key, p.normal);
      this.tntLeft -= def.charges;
      this.tntUsed += def.charges;
      this.ui.setTnt(this.tntLeft);
      this.viewModel.playPlace();
      this.player.addShake(0.05);
      this.ui.completeTutorialStep('place');
    } else {
      const t = this.tnt.findIgnitable(eye, dir, CONFIG.tnt.igniteReach);
      this.viewModel.playIgnite();
      this.audio.lighterClick(this.player.pos, !!t);
      if (t) {
        this.tnt.ignite(t);
        this.ui.completeTutorialStep('ignite');
        this.particles.sparks(t.pos.x, t.pos.y + 0.55, t.pos.z, 8, 4, 0xffd070, 0.4);
      }
    }
  }

  async watchRewarded() {
    if (this.hostPaused) return;
    this.ui.overlay('reward', false);
    const ok = await this.platform.showRewarded(REWARD_EXTRA_CHARGE);
    // Пока шёл ролик, площадка ставила игру на паузу — снимаем её сами,
    // иначе после рекламы игрок упирается в экран паузы.
    if (this.mode === 'play' && this.paused && !this.hostPaused) this.pause(false);
    if (ok) {
      this.tntLeft += 1;
      this.ui.setTnt(this.tntLeft);
      this.ui.combo(t('rw.got'));
      this.audio.ui('star');
    }
    this.rewardShown = true;
    if (!this.onScreen && this.mode === 'play' && !this.paused) this.input.requestLock();
  }

  /* ============================================================ */
  finishLevel() {
    const L = this.level;
    const found = this.crystals.collected;
    let stars = 1;
    if (this.tntUsed <= L.stars[0]) stars = 3;
    else if (this.tntUsed <= L.stars[1]) stars = 2;
    const score = this.destruction.score + found * CONFIG.score.crystal +
      (stars === 3 ? CONFIG.score.perfect : 0);

    const gemsEarned = found * this.shop.gemsPerCrystal + stars * 3;
    this.save.completeLevel(this.levelIndex + 1, stars, this.tntUsed, score, found, gemsEarned);
    // Лучший результат по игре = сумма лучших результатов уровней.
    // Ровно это значение хранится в сохранении и уходит площадке.
    let best = 0;
    for (const k in this.save.data.levels) best += this.save.data.levels[k].score || 0;
    this.save.data.bestScore = best;
    this.save.save(true);
    this.platform.sendScore(best);

    this.input.setEnabled(false);
    this.input.exitLock();
    this.player.enabled = false;
    this.platform.gameplayStop();

    if (stars === 3) this.ui.combo(t('combo.perfect'));
    const isLast = this.levelIndex >= this.levels.count - 1;
    this.ui.showComplete({
      stars, crystals: found, totalCrystals: L.totalCrystals,
      tntUsed: this.tntUsed, tntMax: L.tnt,
      blocks: this.blocksDestroyed, score,
      last: isLast, lastText: t('win.last'),
    });
    this.ui.setGems(this.save.gems);

    this.countAdRound();
  }

  /** Playgama: a win or a loss ends a round; every N-th round shows an interstitial. Timing is left to Bridge. */
  countAdRound() {
    this.levelsCompletedSinceAd++;
    if (this.levelsCompletedSinceAd >= CONFIG.ads.interstitialEveryLevels) {
      this.levelsCompletedSinceAd = 0;
      this.showInterstitial();
    }
  }

  /**
   * Межстраничная реклама.
   *
   * Яндекс запрещает показывать её с задержкой (п. 4.4): ролик открывается
   * ровно в момент события — как только показан экран результата. Там, где
   * площадка допускает предупреждение (YouTube), оно короткое.
   */
  showInterstitial() {
    const wait = this.platform.adNoticeSeconds || 0;
    if (wait <= 0) { this.platform.showInterstitial(); return; }
    this.ui.combo(t('ad.notice'));
    setTimeout(() => { if (!this.hostPaused) this.platform.showInterstitial(); }, wait * 1000);
  }

  /* ============================================================ */
  /* Главный цикл                                                  */
  /* ============================================================ */
  loop() {
    const raw = Math.min(this.clock.getDelta(), 0.08);
    const dt = raw;
    this.perf.update(dt);

    // размер канвы может меняться (iframe Яндекс Игр, поворот экрана)
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    if (cw && ch && (cw !== this._lastW || ch !== this._lastH)) {
      this._lastW = cw; this._lastH = ch;
      this.resize();
    }

    // плавное замедление времени
    if (this.slowmoT > 0) {
      this.slowmoT -= dt;
      if (this.slowmoT <= 0) this.targetTimeScale = 1;
    }
    this.timeScale += (this.targetTimeScale - this.timeScale) * Math.min(1, dt * 14);
    const gdt = dt * this.timeScale;

    this.input.poll();
    if (this.onScreen) this.mobile.poll(dt);

    if (this.mode === 'play' && !this.paused && !this.softPause) {
      this.updatePlay(dt, gdt);
    } else if (this.mode === 'menu') {
      this.updateMenu(dt, gdt);
    } else if (this.mode === 'levelselect') {
      this.updateSelect(dt);
    }

    // общие системы
    if (this.mode !== 'levelselect') {
      this.physics.timeScale = this.timeScale;
      this.physics.step(dt);
      this.debris.update(gdt, this.player.pos, CONFIG.killY);
      this.particles.timeScale = this.timeScale;
      this.particles.update(dt);
      this.explosions.timeScale = this.timeScale;
      this.explosions.update(dt);
      if (this.destruction) this.destruction.update(gdt);
      this.fire.update(gdt);
      if (this.level && this.level.world) this.level.world.flush(3);
    }

    this.sceneMgr.update(dt, this.camera.position);
    this.post.update(dt);
    this.ui.update(dt);

    this.audio.setListener(this.camera.position,
      _v.set(1, 0, 0).applyQuaternion(this.camera.quaternion));

    const vm = (this.mode === 'play' && !this.viewModel.hidden) ? this.viewModel : null;
    this.post.render(this.scene, this.camera, vm ? vm.scene : null, vm ? vm.camera : null, dt);

    this.input.endFrame();
  }

  updatePlay(dt, gdt) {
    const inp = this.input;

    // экранные кнопки: одна перебирает заряды, вторая даёт зажигалку
    if (inp.padSlot >= 0) {
      if (inp.padSlot === 0) this.cycleCharge();
      else this.selectSlot(this.lighterSlot);
    } else if (inp.slotRequest >= 0) this.selectSlot(inp.slotRequest);
    if (inp.slotCycle) this.selectSlot((this.slot + 1) % this.hotbar.length);
    if (inp.usePressed) this.useItem();

    this.player.update(dt);
    this.viewModel.update(dt, this.player, inp);

    // подсказка про движение гаснет, когда игрок реально пошёл
    if (this.level.tutorial && this.player.pos.distanceToSquared(this.player.spawn) > 6) {
      this.ui.completeTutorialStep('move');
    }
    this.tnt.update(gdt);
    this.crystals.update(gdt, this.player.pos, this.camera);
    this.chests.update(gdt);

    // предпросмотр установки
    const eye = this._aimEye(), dir = this._aimDir();
    if (this.slot !== this.lighterSlot && this.tntLeft >= this.currentCharge().charges) {
      const p = this.tnt.findPlacement(eye, dir, CONFIG.tnt.placeReach, this.player.pos);
      this.tnt.showGhost(p, this.currentCharge().tint);
      this.ui.setCrosshair(p ? (p.ok ? 'can' : 'no') : null);
    } else {
      this.tnt.hideGhost();
      if (this.slot === this.lighterSlot) {
        const t = this.tnt.findIgnitable(eye, dir, CONFIG.tnt.igniteReach);
        this.ui.setCrosshair(t ? 'fire' : null);
      } else this.ui.setCrosshair(null);
    }

    // завершение уровня
    if (this.completeTimer > 0) {
      this.completeTimer -= dt;
      if (this.completeTimer <= 0) {
        this.completeTimer = -1;
        this.finishLevel();
      }
    }

    // предложение рекламы, если динамит кончился
    if (this.completeTimer < 0 && this.tntLeft <= 0 && this.tnt.count === 0 &&
      this.crystals.remaining > 0 && !this.ui.isOverlayOpen() && !this.rewardShown) {
      this.idleTimer += dt;
      if (this.idleTimer > 2.6 && this.physics.stats.awake < 4) {
        this.ui.overlay('reward', true);
        this.input.exitLock();
      }
    } else this.idleTimer = 0;
  }

  updateMenu(dt, gdt) {
    // камера облетает домик
    this.menuAngle += dt * 0.11;
    const r = 36;
    const c = this.menuCenter;
    this.camera.position.set(
      c.x + Math.cos(this.menuAngle) * r,
      c.y + 15 + Math.sin(this.menuAngle * 0.6) * 2.2,
      c.z + Math.sin(this.menuAngle) * r);
    this.camera.lookAt(c.x, c.y + 3.5, c.z);
    if (Math.abs(this.camera.fov - 52) > 0.05) {
      this.camera.fov += (52 - this.camera.fov) * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
    }

    // декоративные подрывы
    this.menuTimer -= dt;
    if (this.menuTimer <= 0) {
      this.menuTimer = 2.4 + Math.random() * 2.6;
      this.menuBlast();
    }
    this.menuReload -= dt;
    if (this.menuReload <= 0) this.loadMenuScene();

    this.tnt.update(gdt);
  }

  menuBlast() {
    const W = this.level && this.level.world;
    if (!W) return;
    const B = this.menuBounds || { x0: 4, x1: W.sx - 5, z0: 4, z1: W.sz - 5, groundY: 5 };
    // ищем случайный уцелевший блок постройки
    let tries = 60;
    while (tries-- > 0) {
      const x = B.x0 + Math.floor(Math.random() * (B.x1 - B.x0));
      const z = B.z0 + Math.floor(Math.random() * (B.z1 - B.z0));
      const y = W.groundAt(x, z, W.sy - 1);
      if (y <= B.groundY + 1) continue;
      this.explosions.explode(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), {
        radius: 5.6, power: 10, impulse: 26, soundPower: 0.5, cameraShake: 0,
      });
      return;
    }
    this.menuReload = Math.min(this.menuReload, 1.2);
  }

  updateSelect(dt) {
    // карусель: соседние острова уезжают в стороны и уменьшаются
    this.carousel.x += (0 - this.carousel.x) * Math.min(1, dt * 8);
    if (Math.abs(this.carousel.x) < 0.01) this.carousel.x = 0;
    for (let k = 0; k < 3; k++) {
      const s = this.previewSlots[k];
      const px = (k - 1) * 15 + this.carousel.x;
      s.position.x = px;
      const d = Math.abs(px);
      const t = Math.max(0, 1 - d / 15);
      s.scale.setScalar(0.62 + t * 0.38);
      s.position.y = -d * 0.16;
      s.rotation.y = this.carousel.spin * (k === 1 ? 1 : 0.4);
    }
    this.carousel.spin += dt * 0.32;
    this.camera.position.set(0, 44.8, 17.5);
    this.camera.lookAt(0, 41.4, 0);
    if (Math.abs(this.camera.fov - 45) > 0.05) {
      this.camera.fov += (45 - this.camera.fov) * Math.min(1, dt * 6);
      this.camera.updateProjectionMatrix();
    }
    this.particles.update(dt);
  }
}

/** Пауза между шагами загрузки, чтобы браузер успел перерисовать полосу. */
function frame() {
  return new Promise(r => setTimeout(r, 16));
}
