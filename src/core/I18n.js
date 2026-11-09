/**
 * Локализация.
 * Язык берётся из Яндекс SDK (environment.i18n.lang), иначе из браузера.
 * Русский — основной, английский — запасной для всех остальных языков.
 */
const DICT = {
  ru: {
    'game.title': 'БУМ',
    'game.subtitle': 'БЛОК!',
    'load.0': 'Готовим динамит…',
    'load.1': 'Рисуем текстуры…',
    'load.2': 'Настраиваем взрывы…',
    'load.3': 'Прогреваем шейдеры…',
    'load.4': 'Почти готово…',
    'load.5': 'Готово!',

    'menu.play': 'Играть',
    'menu.levels': 'Уровни',
    'menu.shop': 'Мастерская',
    'menu.settings': 'Настройки',
    'menu.sound': 'Звук',

    'ls.level': 'Уровень {n}',
    'ls.play': 'Играть',
    'ls.locked': 'Пройди предыдущий уровень',
    'ls.all': 'Все уровни',
    'ls.close': 'Закрыть',

    'shop.title': 'Мастерская',
    'shop.tab.explosives': 'Взрывчатка',
    'shop.tab.player': 'Игрок',
    'shop.ad': 'Алмазы за рекламу',
    'shop.max': 'Макс',
    'shop.lvl': 'ур. {n}',
    'shop.charges': '×{n} зар.',
    'shop.unlock': 'Открыть',
    'shop.upgrade': 'Улучшить',
    'shop.bought': 'Открыто!',
    'shop.upgraded': 'Улучшено!',

    'hud.found': 'Найдено',
    'hud.charges': 'зарядов',
    'hud.score': 'очков',
    'hud.level': 'Уровень {n}',

    'pause.title': 'Пауза',
    'pause.resume': 'Продолжить',
    'pause.restart': 'Начать заново',
    'pause.settings': 'Настройки',
    'pause.quit': 'В меню',

    'win.title': 'Уровень пройден!',
    'win.crystals': 'Кристаллы',
    'win.tnt': 'Зарядов',
    'win.blocks': 'Разрушено',
    'win.score': 'Очки',
    'win.next': 'Следующий уровень',
    'win.repeat': 'Повторить',
    'win.menu': 'Меню',
    'win.last': 'Это последний уровень — ты прошёл всю игру! Новые уровни появятся в следующих обновлениях.',

    'set.title': 'Настройки',
    'set.quality': 'Качество графики',
    'set.low': 'Низ', 'set.med': 'Сред', 'set.high': 'Выс',
    'set.volume': 'Громкость',
    'set.music': 'Музыка',
    'set.sensitivity': 'Чувствительность',
    'set.shake': 'Тряска камеры',
    'set.slowmo': 'Замедление времени',
    'set.invert': 'Инверсия Y',
    'set.lang': 'Язык',
    'set.haptics': 'Вибрация',
    'set.on': 'Вкл', 'set.off': 'Выкл',
    'set.done': 'Готово',

    'ad.mark': 'Реклама',
    'ad.watch': 'Смотреть',
    'ad.notice': 'Сейчас будет реклама',
    'rw.title': 'Заряды закончились',
    'rw.text': 'Посмотри рекламу и получи <b>+1 заряд</b>, чтобы закончить уровень.',
    'rw.watch': 'Смотреть',
    'rw.got': '+1 заряд',

    'rotate': 'Поверни устройство горизонтально 🔄',
    'noscript': 'Для игры нужен JavaScript.',

    'combo.chain': 'Цепная реакция ×{n}',
    'combo.destroy': 'Разрушение ×{n}',
    'combo.collapse': 'Обвал! +{n}',
    'combo.crystal': '+{n} кристалл',
    'combo.perfect': 'Идеальный взрыв!',

    'tut.move.pc': '<b>WASD</b> — движение, <b>мышь</b> — осмотреться',
    'tut.move.touch': 'Левая часть экрана — <b>движение</b>',
    'tut.place.pc': '<b>ЛКМ</b> — поставить заряд у стены',
    'tut.place.touch': 'Кнопка <b>◉</b> — поставить заряд',
    'tut.switch.pc': '<b>2</b> — взять зажигалку',
    'tut.switch.touch': 'Кнопка с <b>зажигалкой</b> — сменить предмет',
    'tut.ignite.pc': '<b>ЛКМ</b> — поджечь фитиль и отойти!',
    'tut.ignite.touch': 'Наведись на заряд и нажми <b>◉</b>',
    'ctrl.move': 'ДВИЖЕНИЕ',
    'tut.move.mouse': 'Джойстик слева или <b>ПКМ</b> — идти, тяни <b>ЛКМ</b> — осмотреться',
    'tut.place.mouse': 'Клик <b>ЛКМ</b> по стене или кнопка <b>◉</b> — поставить заряд',
    'tut.switch.mouse': 'Кнопка с <b>зажигалкой</b> или колесо мыши — сменить предмет',
    'tut.ignite.mouse': 'Наведись на заряд и кликни — фитиль подожжён, отходи!',

    'ex.tnt': 'Динамит',
    'ex.tnt.d': 'Универсальный заряд. Ровный мощный взрыв во все стороны.',
    'ex.mega': 'Мега-заряд',
    'ex.mega.d': 'Вдвое больше радиус и импульс. Длинный фитиль — успей отойти.',
    'ex.cluster': 'Кассетный',
    'ex.cluster.d': 'Разлетается на суббоеприпасы и накрывает большую площадь.',
    'ex.napalm': 'Зажигательный',
    'ex.napalm.d': 'Слабый взрыв, но оставляет очаг: дерево и солома выгорают сами.',
    'ex.shaped': 'Кумулятивный',
    'ex.shaped.d': 'Бьёт узкой струёй в поверхность: пробивает даже толстый камень.',
    'ex.grav': 'Гравизаряд',
    'ex.grav.d': 'Стягивает всё внутрь, ослабляет конструкцию и роняет здание целиком.',
    'ex.lighter': 'Зажигалка',

    'up.charges': 'Запас зарядов',
    'up.charges.d': 'Больше зарядов на каждом уровне',
    'up.speed': 'Скорость',
    'up.speed.d': 'Быстрее бегать и отходить от заряда',
    'up.jump': 'Прыжок',
    'up.jump.d': 'Выше прыжок — легче забраться на обломки',
    'up.armor': 'Защита подрывника',
    'up.armor.d': 'Взрыв меньше отбрасывает и трясёт камеру',
    'up.magnet': 'Магнит',
    'up.magnet.d': 'Кристаллы притягиваются издалека',
    'up.luck': 'Удача',
    'up.luck.d': 'Больше алмазов за найденные кристаллы',
  },

  en: {
    'game.title': 'BOOM',
    'game.subtitle': 'BLOCK!',
    'load.0': 'Packing dynamite…',
    'load.1': 'Painting textures…',
    'load.2': 'Tuning explosions…',
    'load.3': 'Warming up shaders…',
    'load.4': 'Almost ready…',
    'load.5': 'Ready!',

    'menu.play': 'Play',
    'menu.levels': 'Levels',
    'menu.shop': 'Workshop',
    'menu.settings': 'Settings',
    'menu.sound': 'Sound',

    'ls.level': 'Level {n}',
    'ls.play': 'Play',
    'ls.locked': 'Finish the previous level',
    'ls.all': 'All levels',
    'ls.close': 'Close',

    'shop.title': 'Workshop',
    'shop.tab.explosives': 'Explosives',
    'shop.tab.player': 'Player',
    'shop.ad': 'Gems for an ad',
    'shop.max': 'Max',
    'shop.lvl': 'lvl {n}',
    'shop.charges': '×{n} chg',
    'shop.unlock': 'Unlock',
    'shop.upgrade': 'Upgrade',
    'shop.bought': 'Unlocked!',
    'shop.upgraded': 'Upgraded!',

    'hud.found': 'Found',
    'hud.charges': 'charges',
    'hud.score': 'points',
    'hud.level': 'Level {n}',

    'pause.title': 'Paused',
    'pause.resume': 'Resume',
    'pause.restart': 'Restart',
    'pause.settings': 'Settings',
    'pause.quit': 'Main menu',

    'win.title': 'Level complete!',
    'win.crystals': 'Crystals',
    'win.tnt': 'Charges',
    'win.blocks': 'Destroyed',
    'win.score': 'Score',
    'win.next': 'Next level',
    'win.repeat': 'Retry',
    'win.menu': 'Menu',
    'win.last': 'That was the final level — you finished the game! More levels are coming in future updates.',

    'set.title': 'Settings',
    'set.quality': 'Graphics quality',
    'set.low': 'Low', 'set.med': 'Med', 'set.high': 'High',
    'set.volume': 'Volume',
    'set.music': 'Music',
    'set.sensitivity': 'Sensitivity',
    'set.shake': 'Camera shake',
    'set.slowmo': 'Slow motion',
    'set.invert': 'Invert Y',
    'set.lang': 'Language',
    'set.haptics': 'Haptics',
    'set.on': 'On', 'set.off': 'Off',
    'set.done': 'Done',

    'ad.mark': 'Ad',
    'ad.watch': 'Watch',
    'ad.notice': 'An ad is coming up',
    'rw.title': 'Out of charges',
    'rw.text': 'Watch an ad and get <b>+1 charge</b> to finish the level.',
    'rw.watch': 'Watch',
    'rw.got': '+1 charge',

    'rotate': 'Rotate your device to landscape 🔄',
    'noscript': 'This game requires JavaScript.',

    'combo.chain': 'Chain reaction ×{n}',
    'combo.destroy': 'Destruction ×{n}',
    'combo.collapse': 'Collapse! +{n}',
    'combo.crystal': '+{n} crystal',
    'combo.perfect': 'Perfect blast!',

    'tut.move.pc': '<b>WASD</b> to move, <b>mouse</b> to look around',
    'tut.move.touch': 'Left side of the screen — <b>move</b>',
    'tut.place.pc': '<b>LMB</b> — place a charge on the wall',
    'tut.place.touch': 'The <b>◉</b> button places a charge',
    'tut.switch.pc': '<b>2</b> — take the lighter',
    'tut.switch.touch': 'The <b>lighter</b> button switches items',
    'tut.ignite.pc': '<b>LMB</b> — light the fuse and step back!',
    'tut.ignite.touch': 'Aim at the charge and press <b>◉</b>',
    'ctrl.move': 'MOVE',
    'tut.move.mouse': 'Stick on the left or hold <b>right button</b> to walk, drag <b>left button</b> to look',
    'tut.place.mouse': 'Click the wall or press <b>◉</b> to place a charge',
    'tut.switch.mouse': 'The <b>lighter</b> button or the mouse wheel switches items',
    'tut.ignite.mouse': 'Aim at the charge and click — the fuse is lit, step back!',

    'ex.tnt': 'Dynamite',
    'ex.tnt.d': 'All-purpose charge. A clean, powerful blast in every direction.',
    'ex.mega': 'Mega charge',
    'ex.mega.d': 'Double the radius and punch. Long fuse — get clear in time.',
    'ex.cluster': 'Cluster bomb',
    'ex.cluster.d': 'Scatters bomblets and covers a large area.',
    'ex.napalm': 'Incendiary',
    'ex.napalm.d': 'Weak blast, but leaves a fire: wood and thatch burn on their own.',
    'ex.shaped': 'Shaped charge',
    'ex.shaped.d': 'Fires a narrow jet into the surface — drills through thick stone.',
    'ex.grav': 'Gravity charge',
    'ex.grav.d': 'Pulls everything inward, weakens the frame and drops the whole building.',
    'ex.lighter': 'Lighter',

    'up.charges': 'Charge capacity',
    'up.charges.d': 'More charges on every level',
    'up.speed': 'Speed',
    'up.speed.d': 'Run faster and get clear sooner',
    'up.jump': 'Jump',
    'up.jump.d': 'Jump higher — easier to climb the rubble',
    'up.armor': 'Blaster armour',
    'up.armor.d': 'Blasts throw you around and shake the camera less',
    'up.magnet': 'Magnet',
    'up.magnet.d': 'Crystals are pulled in from further away',
    'up.luck': 'Luck',
    'up.luck.d': 'More gems for every crystal found',
  },
};

/** Названия и подсказки уровней (индекс с 1). */
const LEVELS_I18N = {
  ru: null,   // берётся из levels.js как есть
  en: [
    ['Cabin', 'Place a charge by the wall and light it with the lighter'],
    ['Two rooms', 'Crystals can be hidden inside the walls'],
    ['Wooden barn', 'Knock out the middle columns — the roof falls on its own'],
    ['Two-storey house', 'Blast the ground floor and the top will come down'],
    ['Stone house', 'Stone eats the blast. Look for the wooden parts'],
    ['House with a cellar', 'Break the floor — there is a cellar below'],
    ['Tower', 'Blow the base and the tower folds in on itself'],
    ['Two huts', 'One blast can reach both houses'],
    ['Bridge', 'The piers hold the whole span'],
    ['Mansion', 'A big house deserves a big collapse'],
    ['Barn and silo', 'Drop the silo onto the barn'],
    ['Water tower', 'Four legs. Will two be enough?'],
    ['Farm', 'Crystals are scattered all over the farm'],
    ['Warehouse', 'Steel columns hold a heavy roof'],
    ['Windmill', 'Cut the base and the tower topples sideways'],
    ['Stilt house', 'The house stands on six stilts'],
    ['Fortress', 'The walls are thick — hit the same spot twice'],
    ['Old mine', 'The pit props will not hold for long'],
    ['Church', 'The spire falls beautifully'],
    ['Small factory', 'Steel takes the hit. Look for concrete and glass'],
    ['Viaduct', 'The arches hold each other up'],
    ['Apartment block', 'Take out the ground floor and it all comes down'],
    ['Lighthouse', 'A tall tube loves to fall'],
    ['Greenhouse', 'Glass shatters from any blast'],
    ['Hangar', 'The arched roof rests on its ribs'],
    ['Dam', 'The concrete is thick, but not everywhere'],
    ['Pyramid', 'There is a chamber inside. Dig with explosives'],
    ['Clock tower', 'Undercut one corner and the tower leans'],
    ['Castle', 'The keep is inside the walls — get to it'],
    ['Citadel', 'The finale. Bring the whole thing down'],
  ],
};

class I18nManager {
  constructor() {
    this.lang = 'ru';
    this.listeners = [];
  }

  /**
   * Дополняет словарь строками отдельной сборки (песочница).
   * Совпадающие ключи перекрываются — так меняется, например, подзаголовок.
   */
  extend(extra) {
    for (const lang in extra) {
      if (!DICT[lang]) DICT[lang] = {};
      Object.assign(DICT[lang], extra[lang]);
    }
    return this;
  }

  /** Заменяет подсказки к уровням (у песочницы свои задачи). */
  setLevelHints(table) {
    this.hints = table;
    return this;
  }

  /** ru | en | auto-detect */
  setLang(lang) {
    const l = this.normalize(lang);
    if (l === this.lang) return;
    this.lang = l;
    document.documentElement.lang = l;
    this.apply();
    for (const fn of this.listeners) fn(l);
  }

  normalize(lang) {
    if (!lang) return 'ru';
    const s = String(lang).toLowerCase().slice(0, 2);
    return DICT[s] ? s : (s === 'be' || s === 'uk' || s === 'kk' || s === 'uz' ? 'ru' : 'en');
  }

  /**
   * Язык приходит только от платформы: определять его самостоятельно
   * через браузерные API в Playables запрещено требованиями YouTube.
   */
  detect(hostLang) {
    return this.normalize(hostLang);
  }

  onChange(fn) { this.listeners.push(fn); }

  /** Перевод по ключу с подстановкой {n}. */
  t(key, params) {
    const d = DICT[this.lang] || DICT.ru;
    let s = d[key];
    if (s === undefined) s = DICT.en[key];
    if (s === undefined) s = key;
    if (params) {
      for (const k in params) s = s.split('{' + k + '}').join(params[k]);
    }
    return s;
  }

  /** Название уровня (index с 0). */
  levelName(i, fallback) {
    const t = LEVELS_I18N[this.lang];
    return (t && t[i]) ? t[i][0] : fallback;
  }
  levelHint(i, fallback) {
    if (this.hints) {
      const h = this.hints[this.lang] || this.hints.ru;
      if (h && h[i]) return h[i];
    }
    const t = LEVELS_I18N[this.lang];
    return (t && t[i]) ? t[i][1] : fallback;
  }

  /** Проставляет тексты во все элементы с data-i18n. */
  apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const html = el.dataset.i18nHtml !== undefined;
      const v = this.t(key);
      if (html) el.innerHTML = v; else el.textContent = v;
    });
    root.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = this.t(el.dataset.i18nTitle);
    });
    document.title = this.t('game.title') + ' ' + this.t('game.subtitle');
  }
}

export const I18N = new I18nManager();
export const t = (k, p) => I18N.t(k, p);
