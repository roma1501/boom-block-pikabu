/**
 * Точка входа песочницы.
 *
 * Цикл кадров полностью останавливается, когда площадка присылает паузу,
 * и перезапускается по onResume — как и в основной игре.
 */
import { CONFIG } from '../core/Config.js';
import { I18N } from '../core/I18n.js';
import { MAT, MATERIALS } from '../world/Materials.js';
import { SANDBOX_I18N, SANDBOX_HINTS, applySandboxMaterials } from './sandbox-levels.js';
import { SandboxGame } from './SandboxGame.js';

// своё сохранение: прогресс песочницы не смешивается с основной игрой
CONFIG.saveKey = 'boomsandbox_save_v1';
CONFIG.subtitle = 'SANDBOX!';
I18N.extend(SANDBOX_I18N).setLevelHints(SANDBOX_HINTS);
applySandboxMaterials(MATERIALS, MAT);

/**
 * Ни одна ошибка не должна утечь в консоль необработанной: площадка бракует
 * сборку за «Uncaught (in promise)». Чаще всего это отказ хранилища —
 * в тестовом окружении Playables квота на origin общая и бывает забита.
 * Лечить это нечем, поэтому просто выключаем сохранение и играем дальше.
 */
window.addEventListener('unhandledrejection', (e) => {
  const err = e && e.reason;
  const name = (err && err.name) || '';
  const msg = String((err && err.message) || err || '');
  e.preventDefault();
  const g = window.__game;
  const platform = g && g.platform;
  if (name === 'QuotaExceededError' || /quota|storage/i.test(msg)) {
    if (platform && platform.markStorageBroken) platform.markStorageBroken();
    else if (platform) platform.logWarning('storage unavailable');
  } else if (platform) {
    platform.logError(err);
  }
  console.warn('Отклонённое обещание:', msg);
});

const canvas = document.getElementById('game');

// Игра занимает весь экран, обычного «документа» под ней нет: браузерное
// контекстное меню и выделение текста здесь только мешают.
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('selectstart', (e) => e.preventDefault());
document.addEventListener('dragstart', (e) => e.preventDefault());

async function boot() {
  const game = new SandboxGame(canvas);
  window.__game = game;      // для отладки в консоли

  try {
    await game.init((p, t) => game.ui && game.ui.progress(p, t));
  } catch (err) {
    console.error('Ошибка запуска:', err);
    const el = document.getElementById('load-text');
    if (el) el.textContent = 'Ошибка запуска: ' + (err && err.message ? err.message : err);
    if (game.platform) game.platform.logError(err);
    return;
  }

  // Звук разблокируется первым вводом. Пока держится пауза площадки —
  // игра не должна ожить даже звуком.
  const unlock = () => {
    if (game.hostPaused) return;
    game.audio.unlock();
    if (!game.save.settings.muted && game.save.settings.music > 0.01) game.audio.startMusic();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(ev, unlock);
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock);

  game.enterMenu();
  game.clock.start();

  let running = false;
  let last = performance.now();

  function tick() {
    if (game.hostPaused) { running = false; return; }
    requestAnimationFrame(tick);
    const now = performance.now();
    if (now - last > 900) game.clock.getDelta();
    last = now;
    try {
      game.loop();
    } catch (e) {
      console.error('Ошибка в кадре:', e);
      if (game.platform) game.platform.logError(e);
    }
  }
  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(tick);
  }
  game.onHostResume = start;
  start();

  requestAnimationFrame(() => requestAnimationFrame(() => game.notifyReady()));
  setTimeout(() => game.notifyReady(), 1200);
}

boot();
