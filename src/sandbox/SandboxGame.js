/**
 * BOOM SANDBOX — сборка всех систем режима «песочница».
 *
 * Здесь нет игрока с ногами: камера облетает карту, а игрок — рука сверху.
 * Клик по постройке — взрыв в этой точке. Бомб ограниченное число, поэтому
 * карта проходится не количеством, а попаданиями по опорам: разрушение
 * считается в процентах от постройки, и обвал даёт куда больше процентов,
 * чем аккуратный кратер в стене.
 *
 * Движок (мир, физика, разрушение, эффекты, звук, платформа) — общий
 * с основной игрой, отличаются только управление, цель и интерфейс.
 */
import * as THREE from 'three';
import { CONFIG } from '../core/Config.js';
import { I18N, t } from '../core/I18n.js';
import { SceneManager } from '../core/SceneManager.js';
import { SaveManager } from '../core/SaveManager.js';
import { SettingsManager } from '../core/SettingsManager.js';
import { Platform } from '../core/Platform.js';
import { PerformanceManager, detectQuality, qualityPreset } from '../core/PerformanceManager.js';

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
import { TNTManager } from '../entities/TNT.js';
import { EXPLOSIVE_BY_KEY } from '../entities/Explosives.js';
import { FireManager } from '../fx/FireField.js';
import { AudioManager } from '../audio/AudioManager.js';
import { LevelManager } from '../levels/LevelManager.js';
import { MENU_LEVELS } from '../levels/levels.js';
import { Builder } from '../levels/Builder.js';
import { VoxelWorld, FLAG_TERRAIN } from '../world/VoxelWorld.js';

import { SandboxUI } from './SandboxUI.js';
import { GodCamera } from './GodCamera.js';
import { StrikeInput } from './StrikeInput.js';
import { AimMarker } from './AimMarker.js';
import { Weather } from './Weather.js';
import { Tornado } from './Tornado.js';
import { SANDBOX_MAPS, CHARGE_ORDER, CHARGE_UNLOCK, SANDBOX_CHARGES } from './sandbox-levels.js';

const _v = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();


// Постоянные идентификаторы наград за рекламу (требование площадок).
const REWARD_EXTRA_BOMB = 'extra-bomb-1';
const REWARD_TORNADO = 'tornado-charge';

// Сколько роликов нужно посмотреть на один смерч.
const TORNADO_ADS = 2;

export class SandboxGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.mode = 'loading';
    this.paused = false;
    this.hostPaused = false;
    this.timeScale = 1;
    this.targetTimeScale = 1;
    this.slowmoT = 0;
    this.slowmoEnabled = true;
    this.clock = new THREE.Clock();

    this.mapIndex = 0;
    this.level = null;
    this.destruction = null;

    this.bombs = 0;
    this.bombsUsed = 0;
    this.bombsMax = 0;
    this.blocksDestroyed = 0;
    this.percent = 0;
    this.goal = 70;
    this.starMarks = [85, 95];

    this.structList = null;
    this.structTotal = 0;
    this.recountT = 0;
    this.completeTimer = -1;
    this.completeWait = 0;
    this.settleT = 0;
    this.adOffered = false;
    this.mapsSinceAd = 0;

    this.chargeKey = 'tnt';
    this.slot = 0;
    this.menuTimer = 0;
    this.menuReload = 0;
  }

  /* ============================================================ */
  async init(onProgress) {
    const P = (p, txt) => { if (onProgress) onProgress(p, txt); return frame(); };

    await P(0.05, t('load.0'));
    this.platform = new Platform();
    this.save = new SaveManager(this.platform);
    this.audio = new AudioManager();
    this.ui = new SandboxUI(this.audio);

    await this.platform.init().catch(() => false);
    this.platform.firstFrameReady();
    // На YouTube игра называется ровно «BOOM SANDBOX», без восклицательного
    // знака: под этим именем она заведена на площадке.
    if (this.platform.name === 'playables') {
      I18N.extend({ ru: { 'game.subtitle': 'SANDBOX' }, en: { 'game.subtitle': 'SANDBOX' } });
    }
    await this.save.load();

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
    // Площадка со скруглёнными блоками (YouTube) получает у песочницы свой
    // «мягкий» стиль: он не повторяет ни классические блоки Яндекса,
    // ни скруглённые блоки основной игры.
    setBlockStyle(this.platform.blockStyle === 'rounded' ? 'soft' : this.platform.blockStyle);
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

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.08, 620);
    this.camera.position.set(0, 24, 46);
    this.god = new GodCamera(this.camera);

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
    this.tnt = new TNTManager(this.scene, null, this.physics, this.particles,
      this.audio, this.explosions, this.atlas);
    this.fire = new FireManager(null, this.particles, null, this.audio, this.quality);
    this.fire.setQuality(this.quality);
    this.tnt.setFire(this.fire);
    this.explosions.fire = this.fire;

    // Погода и смерч создаются до прогрева: у них свои шейдеры и своя лампа,
    // а менять состав освещения на лету — значит пересобирать шейдеры сцены
    // ровно в момент первой молнии.
    this.weather = new Weather(this.scene, this.quality);
    this.weather.particles = this.particles;
    this.weather.audio = this.audio;
    this.weather.onFlash = (v) => { this.post.addFlash(v * 0.5); this.post.addCA(v * 0.4); };
    this.weather.onShake = (v) => this.god.addShake(v);
    this.weather.onStrike = (pos, n) => {
      if (this.mode !== 'play' || !n) return;
      this.blocksDestroyed += n;
      this.recountT = 0;
      this.ui.combo(t('sb.lightning', { n }), true);
    };
    this.tornado = new Tornado(this.scene, this.quality);
    this.tornado.onBlocks = (n) => { this.blocksDestroyed += n; this.recountT = 0; };

    this.aim = new AimMarker(this.scene);
    this.input = new StrikeInput(this.canvas);
    this.touch = matchMedia('(pointer: coarse)').matches ||
      ('ontouchstart' in window && navigator.maxTouchPoints > 0);
    if (this.touch) document.body.classList.add('touch');

    this.levels = new LevelManager(this.atlas);
    this.perf = new PerformanceManager(this.quality, this.renderer);
    this.perf.onScaleChange = (s) => { this.quality.renderScale = s; this.resize(); };
    this.settings = new SettingsManager(this.save);

    this.ui.setAtlas(this.atlas);
    if (isRounded()) this.ui.chargeIcon = (k) => chargeIcon(k);

    await P(0.82, t('load.3'));
    this._wire();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 220));

    this.platform.onPause(() => this.hostPause());
    this.platform.onResume(() => this.hostResume());
    this.platform.onAudioEnabledChange((on) => this.setHostAudio(on));
    this.hostAudio = this.platform.isAudioEnabled();

    await P(0.9, t('load.3'));
    try { this._warmup(); } catch (e) { console.warn('прогрев не удался', e); }

    await P(0.95, t('load.4'));
    if (this.platform.hostHasMuteButton) document.body.classList.add('host-mute');
    if (this.platform.hostHasTopBar) document.body.classList.add('host-topbar');
    this.ui.syncSettings(this.save.settings);
    this.ui.setMuted(this.save.settings.muted);
    this.settings.apply(this);
    await P(1, t('load.5'));
    return this;
  }

  /**
   * Прогрев шейдеров: показываем движку все типы материалов далеко под картой,
   * иначе первый взрыв ловит компиляцию и даёт фриз в сотни миллисекунд.
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
    this.aim.show(new THREE.Vector3(0, Y, 0), { x: 0, y: 1, z: 0 }, 2, 0xffffff);

    // погода и смерч: их шейдеры тоже должны быть готовы заранее
    this.weather.setArea(new THREE.Vector3(0, Y, 0), 14, Y);
    this.weather.set('storm', null);
    this.weather.update(0.016, 0);
    this.weather.warmup(Y);
    this.tornado.spawn(
      { world: w, destruction: null, physics: this.physics, particles: this.particles, audio: null },
      new THREE.Vector3(0, Y, 0), null);
    this.tornado.update(1.6);

    this.tnt.world = w;
    this.tnt.place(2, Y, 2);

    const prevSun = this.sceneMgr.sun.position.clone();
    this.sceneMgr.fitShadow(0, Y, 0, 14);

    const cam = this.camera.clone();
    cam.position.set(0, Y + 4, 9);
    cam.lookAt(0, Y + 1, 0);
    cam.updateMatrixWorld();

    this.particles.update(0.016);
    this.debris.update(0.016, new THREE.Vector3(0, Y, 0), -9999);
    for (let i = 0; i < 2; i++) this.post.render(this.scene, cam, null, null, 0.016);

    this.debris.clear();
    this.particles.clear();
    this.tnt.clear();
    this.aim.hide();
    this.tornado.stop();
    this.weather.set('clear', null);
    this.weather.clear();
    for (const m of this.explosions.rings) m.visible = false;
    for (const m of this.explosions.spheres) m.visible = false;
    this.explosions.rings.length = 0;
    this.explosions.spheres.length = 0;
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
      this.startMap(Math.max(0, next));
    });
    ui.on('maps', () => { this.audio.unlock(); this.enterMaps(); });
    ui.on('menu', () => this.enterMenu());
    ui.on('quit', () => this.enterMenu());
    ui.on('pause', () => this.pause(true));
    ui.on('resume', () => this.pause(false));
    ui.on('restart', () => {
      ui.overlay('pause', false); ui.overlay('complete', false); ui.overlay('fail', false);
      this.startMap(this.mapIndex);
    });
    ui.on('nextmap', () => {
      ui.overlay('complete', false);
      const n = this.mapIndex + 1;
      if (n < this.levels.count) this.startMap(n);
      else this.enterMenu();
    });
    ui.on('settings', () => { ui.syncSettings(this.save.settings); ui.overlay('settings', true); });
    ui.on('closesettings', () => ui.overlay('settings', false));
    ui.on('mute', () => {
      const m = !this.save.settings.muted;
      this.settings.set('muted', m);
      this.audio.setEnabled(!m);
      ui.setMuted(m);
    });
    ui.on('slot', (i) => this.selectSlot(i));
    ui.on('setting', (k, v) => this.changeSetting(k, v));
    ui.on('adbomb', () => this.watchRewarded());
    ui.on('tornado', () => this.tornadoButton());
    ui.on('tornadoad', () => this.watchTornadoAd());
    ui.on('tornadouse', () => this.armTornado());
    ui.on('closetornado', () => this.ui.overlay('tornado', false));
    I18N.onChange(() => this.onLanguageChanged());

    // ---- ввод ----
    this.input.onStrike = (x, y) => this.strike(x, y);
    this.input.onAim = (x, y) => {
      if (x === null || x === undefined) { this.aim.hide(); return; }
      this.showAim(x, y);
    };
    this.input.onOrbit = (dx, dy) => this.god.orbit(dx, dy);
    this.input.onZoom = (k) => this.god.zoom(k);
    this.input.onDragState = (on) => { this.god.dragging = on; if (on) this.god.idleT = 0; };

    window.addEventListener('keydown', (e) => this._key(e));

    // ---- эффекты взрыва на камеру ----
    this.explosions.onFlash = (v) => { this.post.addFlash(v * 0.24); this.post.addCA(v * 0.55); };
    this.explosions.onCamera = (e) => {
      this.god.addShake(e.shake * 0.55);
      this.god.addKick(e.dir, e.kick * 0.5);
      this.god.addFovPunch(e.fov * 0.7);
      if (e.near > 0.4) this.post.addDust(e.near * 0.3);
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
    this.explosions.onBigBlast = (count, pos, chain) => {
      if (this.mode !== 'play') return;
      this.blocksDestroyed += count;
      if (chain > 1) this.ui.combo(t('combo.chain', { n: chain }));
      if (count > 14) this.ui.combo(t('combo.destroy', { n: count }), true);
      if (count > 115 && this.slowmoEnabled) this.triggerSlowmo(0.45, 0.4);
      this.save.data.stats.explosions++;
      this.recountT = 0;
    };

    this.physics.onWorldImpact = (b, x, y, z, s, n) => {
      if (this.destruction) this.destruction.worldImpact(b, x, y, z, s, n);
    };
    this.physics.onBodyImpact = (b, s) => {
      if (this.audio) this.audio.material(MATERIALS[b.mat].sound, b.pos, Math.min(0.6, s / 16));
    };
  }

  _key(e) {
    if (this.hostPaused) return;
    const k = e.key;
    if (k === 'Escape') {
      // Esc не перехватываем: просто закрываем то, что открыто
      for (const m of ['settings', 'tornado', 'complete', 'fail']) {
        if (this.ui.screens[m] && this.ui.screens[m].classList.contains('active')) {
          this.ui.overlay(m, false);
          return;
        }
      }
      if (this.mode === 'play') { this.pause(!this.paused); return; }
      if (this.mode === 'maps') this.enterMenu();
      return;
    }
    if (this.mode !== 'play' || this.paused) return;
    if (k >= '1' && k <= '9') { this.selectSlot(+k - 1); return; }
    if (k === 't' || k === 'T' || k === 'е' || k === 'Е') { this.tornadoButton(); return; }
    if (k === 'r' || k === 'R' || k === 'к' || k === 'К') this.startMap(this.mapIndex);
  }

  changeSetting(k, v) {
    if (k === 'lang') { this.settings.set('lang', v); I18N.setLang(v); return; }
    if (k === 'quality') { this.settings.set('quality', v); this.applyQuality(v); return; }
    if (k === 'slowmo' || k === 'haptics') v = +v;
    this.settings.set(k, v);
    this.settings.apply(this);
    if (k === 'shake') this.god.shakeScale = this.save.settings.shake;
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
    this._applyFog();
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

  /** Туман не должен съедать дальнюю сторону карты: камера смотрит издалека. */
  _applyFog() {
    const far = Math.max(this.quality.viewDistance, this.god.maxDist * 2.6 + 40);
    this.sceneMgr.scene.fog.far = far;
    this.sceneMgr.scene.fog.near = far * 0.42;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.god.setAspect(w / h);
    this.post.setSize(w, h);
    // сцена рисуется в буфер PostFX, размер капель считаем по нему
    if (this.weather) {
      this.weather.setProjection(h * (this.quality.renderScale || 1), this.god.fovBase);
    }
  }

  /* ============================================================ */
  /* Управление от площадки                                       */
  /* ============================================================ */
  hostPause() {
    if (this.hostPaused) return;
    this.hostPaused = true;
    document.body.classList.add('host-paused');
    this.input.enabled = false;
    this.input.reset();
    if (this.mode === 'play' && !this.paused) this.pause(true);
    this.audio.suspend();
    this.save.save(true);
    this.platform.gameplayStop();
  }

  hostResume() {
    if (!this.hostPaused) return;
    this.hostPaused = false;
    document.body.classList.remove('host-paused');
    this.clock.getDelta();
    this.input.enabled = true;
    if (this.hostAudio !== false) {
      this.audio.resume();
      const s = this.save.settings;
      if (!s.muted && s.music > 0.01) this.audio.startMusic();
    }
    if (this.onHostResume) this.onHostResume();
  }

  setHostAudio(on) {
    this.hostAudio = !!on;
    this.audio.setHostEnabled(!!on);
    if (on) {
      this.audio.unlock();
      const s = this.save.settings;
      if (!s.muted && s.music > 0.01) this.audio.startMusic();
    }
  }

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
    this.audio.worldMuted = false;      // в меню можно взрывать бесплатно
    this.ui.show('menu');
    this.ui.showHUD(false);
    this.ui.overlay('pause', false);
    this.ui.overlay('complete', false);
    this.ui.overlay('fail', false);
    this.ui.clearTutorial();
    this.refreshMenuStats();
    this.platform.gameplayStop();
    this.aim.hide();
    this.loadMenuScene();
  }

  refreshMenuStats() {
    let cleared = 0, stars = 0;
    for (const k in this.save.data.levels) {
      const d = this.save.data.levels[k];
      if (d.stars > 0) cleared++;
      stars += d.stars || 0;
    }
    this.ui.setMenuStats(cleared, this.levels.count, stars, this.levels.count * 3);
  }

  loadMenuScene() {
    this.unloadMap();
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
    this.attachWorld(world);

    this.menuCenter = b.buildingCenter.clone();
    this.menuBounds = { x0: 4, x1: sx - 5, z0: 4, z1: sz - 5, groundY: b.groundY };
    this.sceneMgr.fitShadow(this.menuCenter.x, 6, this.menuCenter.z, 24);
    this.sceneMgr.setPreset(['day', 'warm', 'cold'][i % 3]);
    this.menuTimer = 1.8;
    this.menuReload = 30;
    this.god.setTarget(this.menuCenter, 24);
    this._applyFog();
    this.setWeather('clear', null);
    this.level = { world, center: this.menuCenter, radius: 20 };
  }

  onLanguageChanged() {
    I18N.apply();
    this.ui.syncSettings(this.save.settings);
    this.refreshMenuStats();
    if (this.mode === 'maps') this.buildMapGrid();
    if (this.mode === 'play' && this.level) {
      this.buildHotbar();
      this.ui.setSlot(this.slot);
      this.ui.setMapInfo(this.mapIndex + 1,
        I18N.levelName(this.mapIndex, this.level.name),
        I18N.levelHint(this.mapIndex, this.level.hint));
      this.setupTutorial();
    }
  }

  enterMaps() {
    this.mode = 'maps';
    this.ui.show('maps');
    this.ui.showHUD(false);
    this.aim.hide();
    this.buildMapGrid();
  }

  buildMapGrid() {
    this.ui.buildGrid(this.levels.count, this.save, (i) => this.startMap(i));
  }

  /* ============================================================ */
  startMap(index) {
    this.audio.unlock();
    this.mapIndex = Math.max(0, Math.min(this.levels.count - 1, index));
    this.unloadMap();

    const L = this.levels.create(this.mapIndex);
    this.level = L;
    L.world.rebuildAll();
    this.scene.add(L.world.group);
    this.attachWorld(L.world);

    // список блоков постройки: земля острова в зачёт не идёт
    const W = L.world;
    const list = [];
    for (let i = 0; i < W.n; i++) {
      const m = W.blocks[i];
      if (!m) continue;
      if (W.flags[i] & FLAG_TERRAIN) continue;
      if (MATERIALS[m].indestructible) continue;
      list.push(i);
    }
    this.structList = Int32Array.from(list);
    this.structTotal = list.length;

    const cfg = SANDBOX_MAPS[this.mapIndex] || { bombs: 5, goal: 70, stars: [85, 95] };
    this.bombsMax = cfg.bombs;
    this.bombs = cfg.bombs;
    this.bombsUsed = 0;
    this.goal = cfg.goal;
    this.starMarks = cfg.stars;
    this.blocksDestroyed = 0;
    this.percent = 0;
    this.completeTimer = -1;
    this.completeWait = 0;
    this.settleT = 0;
    this.recountT = 0;
    this.adOffered = false;

    // камера: облёт вокруг постройки
    this.god.setTarget(L.center, Math.max(16, L.radius * 0.92));
    this.god.shakeScale = this.save.settings.shake;
    this._applyFog();
    this.sceneMgr.fitShadow(L.center.x, L.center.y, L.center.z, Math.max(28, L.radius));
    this.sceneMgr.setPreset(this.mapIndex % 3 === 1 ? 'warm' : this.mapIndex % 3 === 2 ? 'cold' : 'day');

    // погода карты — после пресета неба: она его перекрашивает
    this.setWeather(cfg.weather || 'clear', L);

    // интерфейс
    this.buildHotbar();
    this.selectSlot(0, true);
    this.ui.show('hud');
    this.ui.showHUD(true);
    this.ui.setMapInfo(this.mapIndex + 1,
      I18N.levelName(this.mapIndex, L.name), I18N.levelHint(this.mapIndex, L.hint));
    this.ui.setGoal(this.goal, this.starMarks);
    this.ui.setBombs(this.bombs);
    this.ui.setScore(0);
    this.ui.scoreShown = 0;
    this.ui.percentShown = 0;
    this.ui.setPercent(0);
    this.ui.setTornado(this.tornadoes, this.adViews);
    this.setupTutorial();

    this.mode = 'play';
    this.paused = false;
    this.audio.worldMuted = false;
    this.input.enabled = true;
    this.platform.gameplayStart();
    this.save.data.stats.plays++;
    this.save.save();
    this.perf.reset();
  }

  /* ============================================================ */
  /* Погода                                                        */
  /* ============================================================ */
  /** Включает погоду карты: осадки, небо, звук и грозу. */
  setWeather(kind, L) {
    const W = this.weather;
    W.world = L ? L.world : null;
    W.destruction = this.destruction;
    W.fire = this.fire;
    if (L) {
      const groundY = L.world.groundAt(Math.floor(L.center.x), Math.floor(L.center.z), L.world.sy - 1);
      W.setArea(L.center, Math.max(18, L.radius * 0.9), (groundY > 0 ? groundY : L.center.y) - 1);
    }
    W.set(kind, this.sceneMgr);
    W.applyFireRules();
    this.weatherKind = kind;

    this.audio.stopAmbient('rain');
    this.audio.stopAmbient('storm');
    if (kind === 'rain') this.audio.startAmbient('rain', 1);
    else if (kind === 'storm') this.audio.startAmbient('storm', 1);

    if (kind !== 'clear') {
      this.ui.combo(t('sb.weather.' + kind), true);
      this.ui.setWeather(kind);
    } else this.ui.setWeather(null);
  }

  /* ============================================================ */
  /* Торнадо за рекламу                                            */
  /* ============================================================ */
  get tornadoes() { return this.save.data.tornadoes || 0; }
  set tornadoes(v) { this.save.data.tornadoes = Math.max(0, v); }
  get adViews() { return this.save.data.tornadoAds || 0; }
  set adViews(v) { this.save.data.tornadoAds = Math.max(0, v); }

  /**
   * Кнопка смерча открывает окно: игрок должен видеть, сколько роликов уже
   * засчитано и что кнопка запускает именно рекламу, — а не ловить ролик
   * случайным нажатием.
   */
  tornadoButton() {
    if (this.mode !== 'play' || this.paused) return;
    if (this.tornado.alive) return;
    if (this.tornadoArmed) {          // повторное нажатие снимает прицел
      this.tornadoArmed = false;
      this.ui.setTornadoArmed(false);
      this.ui.combo(t('sb.tornado.off'), true);
      this.audio.ui('tab');
      return;
    }
    this.ui.showTornadoPanel(this.tornadoes, this.adViews, TORNADO_ADS);
    this.aim.hide();
  }

  /** «Выпустить смерч» из окна: закрываем окно и берём прицел. */
  armTornado() {
    this.ui.overlay('tornado', false);
    if (this.tornadoes <= 0) return;
    this.tornadoArmed = true;
    this.ui.setTornadoArmed(true);
    this.ui.combo(t('sb.tornado.aim'), true);
  }

  async watchTornadoAd() {
    if (this.hostPaused) return;
    const ok = await this.platform.showRewarded(REWARD_TORNADO);
    this.resumeAfterAd();
    if (!ok) {
      this.ui.refreshTornadoPanel(this.tornadoes, this.adViews, TORNADO_ADS);
      return;
    }
    this.adViews = this.adViews + 1;
    if (this.adViews >= TORNADO_ADS) {
      this.adViews = this.adViews - TORNADO_ADS;
      this.tornadoes = this.tornadoes + 1;
      this.ui.combo(t('sb.tornado.got'));
      this.audio.ui('star');
    } else {
      this.ui.combo(t('sb.tornado.progress', { n: this.adViews, m: TORNADO_ADS }), true);
      this.audio.ui('click');
    }
    this.save.save(true);
    this.ui.setTornado(this.tornadoes, this.adViews);
    this.ui.refreshTornadoPanel(this.tornadoes, this.adViews, TORNADO_ADS);
  }

  /** После рекламы возвращаем игру в бой, а не на экран паузы. */
  resumeAfterAd() {
    if (this.mode === 'play' && this.paused && !this.hostPaused) this.pause(false);
  }

  /** Выпускает смерч в выбранную точку. */
  launchTornado(hit) {
    if (this.tornadoes <= 0 || this.tornado.alive) return;
    this.tornadoes = this.tornadoes - 1;
    this.save.save();
    this.tornadoArmed = false;
    this.ui.setTornadoArmed(false);
    this.ui.setTornado(this.tornadoes, this.adViews);
    this.aim.hide();

    const L = this.level;
    // Смерч должен стоять на земле, а не на крыше, куда ткнул игрок:
    // ищем поверхность острова под точкой клика.
    const W = L.world;
    const bx = Math.floor(hit.point.x), bz = Math.floor(hit.point.z);
    let gy = -1;
    for (let y = Math.floor(hit.point.y); y >= 0; y--) {
      const idx = W.idx(bx, y, bz);
      if (idx >= 0 && W.blocks[idx] && (W.flags[idx] & FLAG_TERRAIN)) { gy = y; break; }
    }
    if (gy < 0) gy = W.groundAt(bx, bz, Math.floor(hit.point.y));
    const base = new THREE.Vector3(hit.point.x, (gy >= 0 ? gy + 1 : hit.point.y), hit.point.z);
    this.tornado.spawn({
      world: L.world, destruction: this.destruction, physics: this.physics,
      particles: this.particles, audio: this.audio,
    }, base, { cx: L.center.x, cz: L.center.z, r: Math.max(16, L.radius) });
    this.god.addShake(0.4);
    this.ui.combo(t('sb.tornado.go'));
    this.settleT = 0;
  }

  setupTutorial() {
    this.ui.clearTutorial();
    if (this.mapIndex !== 0) return;
    const sfx = this.touch ? '.touch' : '';
    this.ui.setTutorial([
      { id: 'aim', text: t('sb.tut.aim' + sfx) },
      { id: 'cam', text: t('sb.tut.cam' + sfx) },
      { id: 'pick', text: t('sb.tut.pick') },
    ]);
  }

  attachWorld(world) {
    this.physics.setWorld(world);
    this.particles.setWorld(world);
    this.fire.setWorld(world);
    this.tnt.world = world;
    this.debris.setClusterMaterials(world.mats);

    this.destruction = new DestructionSystem(
      world, this.physics, this.debris, this.particles, this.audio, this.quality);
    this.explosions.destruction = this.destruction;
    this.tnt.destruction = this.destruction;
    this.fire.destruction = this.destruction;
    this.destruction.onScore = (amount, reason) => {
      if (this.mode !== 'play') return;
      this.ui.setScore(this.destruction.score);
      if (reason === 'collapse') this.ui.combo(t('combo.collapse', { n: amount }));
    };
    this.destruction.onCollapse = (n) => {
      if (this.mode === 'play') {
        this.god.addShake(Math.min(0.7, 0.15 + n * 0.008));
        this.post.addDust(Math.min(0.3, n * 0.005));
        if (n > 70 && this.slowmoEnabled) this.triggerSlowmo(0.5, 0.35);
      }
      this.save.data.stats.blocks += n;
      this.recountT = 0;
    };
  }

  unloadMap() {
    this.tornado.stop();
    this.tornadoArmed = false;
    this.weather.clear();
    this.tnt.clear();
    this.fire.clear();
    this.debris.clear();
    this.particles.clear();
    this.physics.clear();
    if (this.level && this.level.world) {
      this.scene.remove(this.level.world.group);
      this.level.world.dispose();
    }
    this.level = null;
    this.destruction = null;
    this.structList = null;
  }

  /* ============================================================ */
  /* Бомбы                                                         */
  /* ============================================================ */
  chargeList() {
    return CHARGE_ORDER.map(key => {
      const def = EXPLOSIVE_BY_KEY[key];
      const p = SANDBOX_CHARGES[key];
      const unlock = CHARGE_UNLOCK[key] || 1;
      return {
        key, def, params: p, unlock,
        locked: this.save.data.unlocked < unlock,
        cost: p.cost,
        name: t(def.name),
      };
    });
  }

  buildHotbar() {
    this.charges = this.chargeList();
    this.ui.buildHotbar(this.charges.map(c => ({
      key: c.key, name: c.name, cost: c.cost, locked: c.locked, unlock: c.unlock,
      icon: this.ui.chargeIcon ? this.ui.chargeIcon(c.key)
        : this.ui.tileImage(MATERIALS[c.def.mat].tiles[1]),
    })));
  }

  selectSlot(i, silent) {
    if (!this.charges || i < 0 || i >= this.charges.length) return;
    const c = this.charges[i];
    if (c.locked) {
      this.ui.combo(t('sb.locked', { n: c.unlock }), true);
      this.audio.ui('deny');
      return;
    }
    this.slot = i;
    this.chargeKey = c.key;
    this.ui.setSlot(i);
    if (!silent) {
      this.audio.ui('tab');
      this.ui.combo(c.name, true);
      this.ui.completeTutorialStep('pick');
    }
  }

  currentCharge() {
    const c = this.charges && this.charges[this.slot];
    return c && !c.locked ? c : this.charges[0];
  }

  /** Точка удара под курсором. */
  _pick(nx, ny) {
    if (!this.level || !this.level.world) return null;
    _ndc.set(nx, ny);
    _ray.setFromCamera(_ndc, this.camera);
    const o = _ray.ray.origin, d = _ray.ray.direction;
    const hit = this.level.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 520);
    if (!hit) return null;
    return {
      point: new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5),
      surface: new THREE.Vector3(
        hit.x + 0.5 + hit.nx * 0.5, hit.y + 0.5 + hit.ny * 0.5, hit.z + 0.5 + hit.nz * 0.5),
      normal: { x: hit.nx, y: hit.ny, z: hit.nz },
      dir: d.clone(),
      mat: hit.mat,
    };
  }

  showAim(nx, ny) {
    if (this.mode === 'play' && (this.paused || this.ui.isOverlayOpen())) { this.aim.hide(); return; }
    const hit = this._pick(nx, ny);
    if (!hit) { this.aim.hide(); return; }
    if (this.tornadoArmed) {
      this.aim.show(hit.surface, hit.normal, 7.5, 0x9ad8ff);
      return;
    }
    const c = this.mode === 'play' ? this.currentCharge() : null;
    const key = c ? c.key : 'tnt';
    this.aim.show(hit.surface, hit.normal,
      SANDBOX_CHARGES[key].cfg.radius, EXPLOSIVE_BY_KEY[key].tint);
  }

  /** Удар: в игре тратит бомбы, в меню — бесплатное развлечение. */
  strike(nx, ny) {
    if (this.hostPaused) return;
    if (this.mode === 'menu') {
      const hit = this._pick(nx, ny);
      if (!hit) return;
      this.audio.unlock();
      this.detonate(hit, 'tnt');
      this.menuTimer = Math.max(this.menuTimer, 2.2);
      return;
    }
    if (this.mode !== 'play' || this.paused || this.ui.isOverlayOpen()) return;

    // смерч взведён — следующий клик выпускает его, бомбы не тратятся
    if (this.tornadoArmed) {
      const hit = this._pick(nx, ny);
      if (!hit) { this.ui.combo(t('sb.miss'), true); this.audio.ui('deny'); return; }
      this.launchTornado(hit);
      return;
    }

    const c = this.currentCharge();
    if (this.bombs < c.cost) {
      this.ui.combo(t('sb.nobombs'), true);
      this.audio.ui('deny');
      return;
    }
    const hit = this._pick(nx, ny);
    if (!hit) {
      this.ui.combo(t('sb.miss'), true);
      this.audio.ui('deny');
      return;
    }
    this.bombs -= c.cost;
    this.bombsUsed += c.cost;
    this.ui.setBombs(this.bombs);
    this.ui.completeTutorialStep('aim');
    this.settleT = 0;
    this.detonate(hit, c.key);
  }

  /** Все спецэффекты конкретного типа заряда. */
  detonate(hit, key) {
    const P = SANDBOX_CHARGES[key] || SANDBOX_CHARGES.tnt;
    const cfg = P.cfg;
    const pos = hit.point;

    if (key === 'grav') {
      this.explosions.implode(pos, P.implode, cfg);
      return;
    }

    this.explosions.explode(pos, cfg);

    if (key === 'cluster') {
      this.tnt.spawnBomblets(pos, P.cluster, P.subCfg);
    } else if (key === 'napalm') {
      const p = P.fire;
      this.fire.add(pos.x, pos.y, pos.z, p.radius, p.duration, p.dps);
      this.particles.embers(pos.x, pos.y, pos.z, 22, p.radius * 0.6);
    } else if (key === 'shaped') {
      const p = P.directional;
      // бьёт вглубь по лучу взгляда — как будто игрок пробивает карту насквозь
      const d = hit.dir;
      if (this.destruction) this.destruction.blastDirectional(pos, d, p);
      for (let i = 0; i < 16; i++) {
        const k = i / 16;
        this.particles.emit(this.particles.fire, {
          x: pos.x + d.x * k * p.range * 0.6,
          y: pos.y + d.y * k * p.range * 0.6,
          z: pos.z + d.z * k * p.range * 0.6,
          vx: d.x * 26, vy: d.y * 26, vz: d.z * 26,
          s0: 0.7 - k * 0.4, s1: 0.15,
          c0: 0xfff0c0, c1: 0xff8020,
          o0: 1, o1: 0, oCurve: 1, oScale: 0.8,
          life: 0.16 + k * 0.12, drag: 2.5, grav: 0,
        });
      }
    }
  }

  /* ============================================================ */
  pause(on) {
    if (this.mode !== 'play') return;
    this.paused = on;
    this.ui.overlay('pause', on);
    this.aim.hide();
    if (on) this.platform.gameplayStop();
    else {
      this.ui.overlay('settings', false);
      this.platform.gameplayStart();
    }
  }

  triggerSlowmo(scale, dur) {
    if (!this.slowmoEnabled) return;
    this.targetTimeScale = scale;
    this.slowmoT = dur;
  }

  /* ============================================================ */
  /** Пересчёт разрушенного: считаем оставшиеся блоки постройки. */
  recount() {
    if (!this.structList || !this.level) return;
    const B = this.level.world.blocks;
    const list = this.structList;
    let alive = 0;
    for (let i = 0; i < list.length; i++) if (B[list[i]]) alive++;
    const total = this.structTotal || 1;
    this.percent = Math.max(0, Math.min(100, ((total - alive) / total) * 100));
    this.ui.setPercent(this.percent);
  }

  /** Всё ли успокоилось: обломки лежат, огонь потух, обвалы закончились. */
  /**
   * Крупное движение: дом ещё складывается, смерч работает, пожар идёт.
   * Мелкие камешки, которые докатываются по земле, сюда не считаем —
   * из-за них экран победы ждал бы почти вечно.
   */
  get stillFalling() {
    if (!this.destruction) return false;
    if (this.tornado.alive) return true;
    if (this.physics.stats.awake > 5) return true;
    if (this.destruction.pendingStress.length > 0) return true;
    if (this.fire.count > 3) return true;
    return false;
  }

  get busy() {
    if (!this.destruction) return false;
    if (this.tornado.alive) return true;
    if (this.physics.stats.awake > 2) return true;
    if (this.fire.count > 0) return true;
    if (this.destruction.pendingStress.length > 0) return true;
    if (this.tnt.count > 0) return true;
    if (this.explosions.implosions.length > 0) return true;
    return false;
  }

  finishMap() {
    const percent = Math.round(this.percent);
    let stars = 1;
    if (percent >= this.starMarks[1]) stars = 3;
    else if (percent >= this.starMarks[0]) stars = 2;

    const left = Math.max(0, this.bombs);
    const score = Math.round(this.destruction.score + left * 300 + (stars === 3 ? 1500 : 0));
    this.save.completeLevel(this.mapIndex + 1, stars, this.bombsUsed, score, 0, 0);

    let best = 0;
    for (const k in this.save.data.levels) best += this.save.data.levels[k].score || 0;
    this.save.data.bestScore = best;
    this.save.save(true);
    this.platform.sendScore(best);

    this.input.enabled = false;
    this.aim.hide();
    this.platform.gameplayStop();
    this.mode = 'done';

    this.ui.showComplete({
      percent, stars,
      bombsUsed: this.bombsUsed, bombsMax: this.bombsMax,
      blocks: this.blocksDestroyed,
      score,
      last: this.mapIndex >= this.levels.count - 1,
    });
    this.refreshMenuStats();

    this.mapsSinceAd++;
    if (this.mapsSinceAd >= CONFIG.ads.interstitialEveryLevels &&
      this.platform.canShowInterstitial(CONFIG.ads.minSecondsBetween)) {
      this.mapsSinceAd = 0;
      this.showInterstitial();
    }
  }

  /**
   * Межстраничная реклама.
   *
   * Яндекс запрещает показывать её с задержкой (п. 4.4): ролик открывается
   * ровно в момент события — как только показан экран результата. Там, где
   * площадка допускает предупреждение (YouTube), оно длится ровно столько,
   * сколько разрешено, и не превращается в «реклама из ниоткуда».
   */
  showInterstitial() {
    const wait = this.platform.adNoticeSeconds || 0;
    if (wait <= 0) { this.platform.showInterstitial(); return; }
    this.ui.combo(t('ad.notice'));
    setTimeout(() => { if (!this.hostPaused) this.platform.showInterstitial(); }, wait * 1000);
  }

  failMap() {
    this.adOffered = true;
    this.input.enabled = false;
    this.aim.hide();
    this.platform.gameplayStop();
    this.ui.showFail(Math.round(this.percent), this.goal);
  }

  async watchRewarded() {
    if (this.hostPaused) return;
    this.ui.overlay('fail', false);
    const ok = await this.platform.showRewarded(REWARD_EXTRA_BOMB);
    // Пока шёл ролик, площадка ставила игру на паузу — снимаем её сами,
    // иначе после рекламы игрок упирается в экран паузы.
    this.resumeAfterAd();
    if (ok) {
      this.bombs += 1;
      this.ui.setBombs(this.bombs);
      this.ui.combo(t('sb.rw.got'));
      this.audio.ui('star');
      this.input.enabled = true;
      this.settleT = 0;
      this.platform.gameplayStart();
    } else {
      this.ui.overlay('fail', true);
    }
  }

  /* ============================================================ */
  /* Главный цикл                                                  */
  /* ============================================================ */
  loop() {
    const dt = Math.min(this.clock.getDelta(), 0.08);
    this.perf.update(dt);

    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    if (cw && ch && (cw !== this._lastW || ch !== this._lastH)) {
      this._lastW = cw; this._lastH = ch;
      this.resize();
    }

    if (this.slowmoT > 0) {
      this.slowmoT -= dt;
      if (this.slowmoT <= 0) this.targetTimeScale = 1;
    }
    this.timeScale += (this.targetTimeScale - this.timeScale) * Math.min(1, dt * 14);
    const gdt = dt * this.timeScale;

    const live = !this.paused && this.mode !== 'loading';

    if (this.mode === 'menu') this.updateMenu(dt);
    else if (this.mode === 'play' && !this.paused) this.updatePlay(dt);

    if (live) {
      this.physics.timeScale = this.timeScale;
      this.physics.step(dt);
      this.debris.update(gdt, this.god.target, CONFIG.killY);
      this.particles.timeScale = this.timeScale;
      this.particles.update(dt);
      this.explosions.timeScale = this.timeScale;
      this.explosions.update(dt);
      if (this.destruction) this.destruction.update(gdt);
      this.fire.update(gdt);
      this.tnt.update(gdt);
      this.weather.update(dt, this.clock.elapsedTime);
      if (this.tornado.alive) this.tornado.update(gdt);
      if (this.level && this.level.world) this.level.world.flush(3);
    }

    this.god.update(this.paused ? 0 : dt);
    this.aim.update(dt);
    this.sceneMgr.update(dt, this.camera.position);
    this.post.update(dt);
    this.ui.update(dt);

    this.audio.setListener(this.camera.position,
      _v.set(1, 0, 0).applyQuaternion(this.camera.quaternion));

    this.post.render(this.scene, this.camera, null, null, dt);
  }

  updatePlay(dt) {
    // разрушение считаем часто, но не каждый кадр — это проход по массиву
    this.recountT -= dt;
    if (this.recountT <= 0) {
      this.recountT = 0.18;
      this.recount();
    }

    // Цель выполнена — не выкидываем панель сразу: пусть игрок досмотрит,
    // как складывается дом. Пока что-то ещё падает и горит, финал ждёт
    // (но не дольше девяти секунд, чтобы не залипнуть на тлеющем углу).
    if (this.completeTimer > 0) {
      this.completeWait += dt;
      if (this.stillFalling && this.completeWait < 7) {
        this.completeTimer = Math.max(this.completeTimer, 1.6);
      }
      this.completeTimer -= dt;
      if (this.completeTimer <= 0) { this.completeTimer = -1; this.finishMap(); }
      return;
    }

    if (this.percent >= this.goal && !this.ui.isOverlayOpen()) {
      this.completeTimer = 3.2;
      this.completeWait = 0;
      this.ui.combo(t('sb.goal.done'));
      this.audio.ui('star');
      return;
    }

    // бомбы кончились и всё замерло — предлагаем рекламу или перезапуск
    if (this.bombs <= 0 && !this.ui.isOverlayOpen() && !this.adOffered) {
      if (this.busy) this.settleT = 0;
      else this.settleT += dt;
      if (this.settleT > 2.2) this.failMap();
    }
  }

  updateMenu(dt) {
    this.menuTimer -= dt;
    if (this.menuTimer <= 0) {
      this.menuTimer = 2.6 + Math.random() * 2.8;
      this.menuBlast();
    }
    this.menuReload -= dt;
    if (this.menuReload <= 0) this.loadMenuScene();
  }

  menuBlast() {
    const W = this.level && this.level.world;
    if (!W) return;
    const B = this.menuBounds || { x0: 4, x1: W.sx - 5, z0: 4, z1: W.sz - 5, groundY: 5 };
    let tries = 60;
    while (tries-- > 0) {
      const x = B.x0 + Math.floor(Math.random() * (B.x1 - B.x0));
      const z = B.z0 + Math.floor(Math.random() * (B.z1 - B.z0));
      const y = W.groundAt(x, z, W.sy - 1);
      if (y <= B.groundY + 1) continue;
      this.explosions.explode(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), {
        radius: 5.6, power: 10, impulse: 26, soundPower: 0.5, cameraShake: 0.35,
      });
      return;
    }
    this.menuReload = Math.min(this.menuReload, 1.2);
  }
}

/** Пауза между шагами загрузки, чтобы браузер успел перерисовать полосу. */
function frame() {
  return new Promise(r => setTimeout(r, 16));
}
