/**
 * Точка входа.
 *
 * Цикл кадров останавливается полностью, когда площадка присылает паузу
 * (требование YouTube Playables: после onPause не должно выполняться ничего,
 * включая рендер), и перезапускается по onResume.
 */
import { Game } from './core/Game.js';

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

async function boot() {
  const game = new Game(canvas);
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

  // Разблокировка звука по первому вводу. Пока площадка держит паузу,
  // ввод игнорируем: на паузе игра не должна ожить даже звуком.
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
    if (game.hostPaused) { running = false; return; }   // площадка поставила паузу
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

  // Меню отрисовано и интерактивно — только теперь сообщаем площадке.
  // Страховка таймером: во встроенном WebView кадры могут не идти,
  // пока игру не показали, а без gameReady её не покажут никогда.
  requestAnimationFrame(() => requestAnimationFrame(() => game.notifyReady()));
  setTimeout(() => game.notifyReady(), 1200);
}

boot();
