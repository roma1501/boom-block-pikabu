/**
 * Глобальная конфигурация игры.
 * Название вынесено сюда, чтобы его можно было поменять в одном месте.
 */
export const CONFIG = {
  title: 'БУМ',
  subtitle: 'БЛОК!',
  version: '1.1.0',
  saveKey: 'boomblock_save_v1',

  // ---- мир ----
  blockSize: 1,
  gravity: -26,          // усиленная гравитация — обломки падают «весомо»
  killY: -28,

  // ---- игрок ----
  player: {
    height: 1.72,
    eye: 1.58,
    radius: 0.32,
    speed: 5.4,
    sprint: 8.1,
    accel: 46,
    airAccel: 9,
    friction: 12,
    jump: 8.2,
    stepHeight: 0.62,
    fov: 76,
  },

  // ---- динамит ----
  tnt: {
    fuse: 2.35,           // секунд после поджигания
    chainFuseMin: 0.09,
    chainFuseMax: 0.34,
    chainRadius: 6.2,
    placeReach: 5.2,
    igniteReach: 5.6,
  },

  // ---- взрыв (базовый пресет) ----
  explosion: {
    power: 12.5,          // энергия лучей
    radius: 7.4,
    impulse: 30,
    damageRate: 5.2,
    fireballSize: 4.3,
    cameraShake: 1,
    structuralDamage: 1,
    chainReactionRadius: 6.2,
    soundPower: 1,
    playerPush: 15,
    fireChance: 0.15,     // шанс, что обычный взрыв оставит очаг пожара
  },

  // ---- бюджеты качества ----
  quality: {
    low: {
      name: 'low',
      pixelRatio: 1,
      shadows: false,
      shadowMapSize: 1024,
      bloom: false,
      msaa: 0,
      debrisBudget: 70,
      clusterBudget: 14,
      particleBudget: 320,
      explosionRays: 260,
      smokePuffs: 8,
      dustOnCollapse: 10,
      renderScale: 0.8,
      viewDistance: 90,
      debrisShadows: false,
      slowmo: false,
    },
    medium: {
      name: 'medium',
      pixelRatio: 1.35,
      shadows: true,
      shadowMapSize: 1536,
      bloom: true,
      msaa: 2,
      debrisBudget: 190,
      clusterBudget: 30,
      particleBudget: 900,
      explosionRays: 520,
      smokePuffs: 16,
      dustOnCollapse: 22,
      renderScale: 1,
      viewDistance: 140,
      debrisShadows: true,
      slowmo: true,
    },
    high: {
      name: 'high',
      pixelRatio: 2,
      shadows: true,
      shadowMapSize: 2560,
      bloom: true,
      msaa: 4,
      debrisBudget: 380,
      clusterBudget: 48,
      particleBudget: 2000,
      explosionRays: 900,
      smokePuffs: 26,
      dustOnCollapse: 38,
      renderScale: 1,
      viewDistance: 200,
      debrisShadows: true,
      slowmo: true,
    },
  },

  // ---- очки ----
  score: {
    perBlock: { wood: 10, stone: 20, dirt: 6, glass: 8, metal: 30, default: 10 },
    crystal: 100,
    collapse: 250,
    chain: 120,
    perfect: 500,
  },

  ads: {
    interstitialEveryLevels: 2,
    minSecondsBetween: 65,
  },
};

export const LS = CONFIG.saveKey;
