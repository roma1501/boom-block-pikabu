/**
 * Настройка песочницы: 30 карт из общего набора уровней.
 *
 * Карта считается пройденной, когда разрушено не меньше `goal` процентов
 * постройки (земля острова в счёт не идёт). Число бомб ограничено, поэтому
 * важно не «настрелять побольше», а бить по опорам и ронять здание целиком.
 *
 * bombs — сколько зарядов даётся (кассетный и мега стоят по два);
 * goal   — порог прохождения в процентах;
 * stars  — пороги на 2★ и 3★ (1★ выдаётся за сам факт прохождения).
 */

export const SANDBOX_MAPS = [
  /*  1 Хижина            */ { bombs: 4, goal: 70, stars: [84, 94], weather: 'clear' },
  /*  2 Две комнаты       */ { bombs: 4, goal: 70, stars: [84, 94], weather: 'clear' },
  /*  3 Деревянный сарай  */ { bombs: 5, goal: 62, stars: [78, 92], weather: 'clear' },
  /*  4 Двухэтажный дом   */ { bombs: 5, goal: 70, stars: [84, 94], weather: 'rain' },
  /*  5 Каменный дом      */ { bombs: 5, goal: 68, stars: [82, 92], weather: 'rain' },
  /*  6 Дом с подвалом    */ { bombs: 5, goal: 70, stars: [84, 94], weather: 'clear' },
  /*  7 Башня             */ { bombs: 4, goal: 70, stars: [84, 94], weather: 'storm' },
  /*  8 Два домика        */ { bombs: 5, goal: 68, stars: [82, 92], weather: 'clear' },
  /*  9 Мост              */ { bombs: 4, goal: 65, stars: [78, 88], weather: 'rain' },
  /* 10 Особняк           */ { bombs: 7, goal: 70, stars: [84, 94], weather: 'clear' },
  /* 11 Амбар и силос     */ { bombs: 6, goal: 66, stars: [80, 90], weather: 'snow' },
  /* 12 Водонапорная башня*/ { bombs: 5, goal: 65, stars: [80, 92], weather: 'storm' },
  /* 13 Ферма             */ { bombs: 7, goal: 66, stars: [80, 90], weather: 'clear' },
  /* 14 Склад             */ { bombs: 10, goal: 35, stars: [50, 70], weather: 'rain' },
  /* 15 Мельница          */ { bombs: 5, goal: 70, stars: [84, 94], weather: 'storm' },
  /* 16 Дом на сваях      */ { bombs: 4, goal: 70, stars: [84, 94], weather: 'clear' },
  /* 17 Крепость          */ { bombs: 10, goal: 60, stars: [74, 86], weather: 'snow' },
  /* 18 Старая шахта      */ { bombs: 7, goal: 66, stars: [78, 88], weather: 'clear' },
  /* 19 Церковь           */ { bombs: 7, goal: 68, stars: [82, 92], weather: 'storm' },
  /* 20 Мини-завод        */ { bombs: 11, goal: 38, stars: [52, 70], weather: 'rain' },
  /* 21 Виадук            */ { bombs: 11, goal: 42, stars: [56, 72], weather: 'snow' },
  /* 22 Многоэтажка       */ { bombs: 10, goal: 60, stars: [74, 86], weather: 'storm' },
  /* 23 Маяк              */ { bombs: 5, goal: 70, stars: [84, 94], weather: 'rain' },
  /* 24 Оранжерея         */ { bombs: 5, goal: 72, stars: [85, 95], weather: 'clear' },
  /* 25 Ангар             */ { bombs: 8, goal: 62, stars: [76, 88], weather: 'snow' },
  /* 26 Плотина           */ { bombs: 12, goal: 55, stars: [70, 84], weather: 'storm' },
  /* 27 Пирамида          */ { bombs: 9, goal: 66, stars: [80, 92], weather: 'clear' },
  /* 28 Часовая башня     */ { bombs: 7, goal: 68, stars: [82, 92], weather: 'rain' },
  /* 29 Замок             */ { bombs: 13, goal: 50, stars: [66, 80], weather: 'snow' },
  /* 30 Цитадель          */ { bombs: 16, goal: 50, stars: [65, 80], weather: 'storm' },
];

/**
 * На какой карте открывается заряд. Первый доступен сразу,
 * остальные приходят по мере продвижения — набор инструментов растёт
 * вместе со сложностью построек.
 */
export const CHARGE_UNLOCK = {
  tnt: 1,
  napalm: 3,     // деревянный сарай — первое место, где горит по-настоящему
  cluster: 6,
  shaped: 9,     // дальше пойдут металл и толстый камень
  mega: 12,      // водонапорная башня целиком из металла — без мега никак
  grav: 16,
};

/**
 * Материалы под песочницу.
 *
 * В основной игре металл — это стена, за которую нельзя пройти, и так и
 * задумано: там цель — добраться до кристаллов. Здесь цель другая, снести
 * постройку целиком, и стальной ангар с несбиваемой крышей просто упирал бы
 * шкалу в 60%. Поэтому металл и бетон в песочнице чуть мягче: они всё ещё
 * самые крепкие, но мега-заряд и кумулятивный их берут.
 */
export function applySandboxMaterials(MATERIALS, MAT) {
  const metal = MATERIALS[MAT.METAL];
  metal.hp = 450; metal.blast = 6.5;
  const concrete = MATERIALS[MAT.CONCRETE];
  concrete.hp = 320; concrete.blast = 4.8;
}

/** Порядок зарядов в панели. */
export const CHARGE_ORDER = ['tnt', 'napalm', 'cluster', 'shaped', 'mega', 'grav'];

/**
 * Заряды песочницы.
 *
 * Мастерской здесь нет и кликов мало, поэтому каждая бомба заметно сильнее
 * тех, что игрок таскает руками в основной игре: это удар сверху, а не
 * шашка у стены. Металл по-прежнему держит обычный взрыв — под него нужен
 * кумулятивный, а толстый бетон просит мега-заряд.
 */
export const SANDBOX_CHARGES = {
  tnt: {
    cost: 1,
    cfg: {
      radius: 9.0, power: 24, impulse: 42, damageRate: 5.2, fireballSize: 5.2,
      soundPower: 1.15, cameraShake: 1, chainReactionRadius: 7, playerPush: 0, fireChance: 0.12,
    },
  },
  napalm: {
    cost: 1,
    cfg: {
      radius: 6.6, power: 15, impulse: 22, damageRate: 5.0, fireballSize: 7.4,
      soundPower: 1.05, cameraShake: 0.8, chainReactionRadius: 5, playerPush: 0, fireChance: 1,
    },
    fire: { radius: 7.5, duration: 14, dps: 95 },
  },
  cluster: {
    cost: 2,
    cfg: {
      radius: 6.5, power: 15, impulse: 26, damageRate: 5.2, fireballSize: 3.6,
      soundPower: 0.9, cameraShake: 0.9, chainReactionRadius: 4.5, playerPush: 0, fireChance: 0.1,
    },
    cluster: { count: 9, delay: 0.26, spread: 9, up: 11 },
    subCfg: {
      radius: 7.2, power: 20, impulse: 30, damageRate: 5.2, fireballSize: 3.8,
      soundPower: 0.9, cameraShake: 0.7, chainReactionRadius: 4, playerPush: 0, fireChance: 0.1,
    },
  },
  shaped: {
    cost: 1,
    cfg: {
      radius: 4.4, power: 10, impulse: 18, damageRate: 5.2, fireballSize: 2.8,
      soundPower: 0.95, cameraShake: 0.9, chainReactionRadius: 3.5, playerPush: 0, fireChance: 0.06,
    },
    directional: { range: 26, power: 48, spread: 0.15 },
  },
  mega: {
    cost: 2,
    cfg: {
      radius: 13.0, power: 44, impulse: 68, damageRate: 5.4, fireballSize: 8.6,
      soundPower: 1.8, cameraShake: 1.5, chainReactionRadius: 9, playerPush: 0, fireChance: 0.18,
    },
  },
  grav: {
    cost: 2,
    cfg: {
      radius: 8.5, power: 17, impulse: 80, damageRate: 4.8, fireballSize: 4.4,
      soundPower: 1.35, cameraShake: 1.3, chainReactionRadius: 7, playerPush: 0, fireChance: 0.05,
    },
    implode: { radius: 14, pull: 40, time: 0.62, shock: 0.62 },
  },
};

/** Подсказки к картам: здесь своя задача, не как в основной игре. */
export const SANDBOX_HINTS = {
  ru: [
    'Бей по стене — дом сложится сам',
    'Взрыв в перегородке достаёт обе комнаты',
    'Выбей центральные опоры — крыша рухнет сама',
    'Бей в первый этаж: второй поедет вниз',
    'Камень держит взрыв. Начни с деревянной пристройки',
    'Пробей пол — под домом погреб',
    'Подорви основание, и башня сложится',
    'Один взрыв между домами достаёт до обоих',
    'Опоры держат весь пролёт',
    'Большому дому — большой обвал',
    'Урони силос прямо на амбар',
    'Четыре ноги. Хватит и двух',
    'Постройки стоят порознь — считай бомбы',
    'Стальные колонны держат тяжёлую крышу',
    'Подрежь основание — башня завалится набок',
    'Дом стоит на шести сваях',
    'Стены толстые: бей дважды в одно место',
    'Крепь долго не продержится',
    'Шпиль падает красиво',
    'Сталь держит удар. Ищи бетон и стекло',
    'Арки держат друг друга',
    'Снеси первый этаж — рухнет всё',
    'Высокая труба любит падать',
    'Стекло сыпется от любого взрыва',
    'Арочная крыша лежит на рёбрах',
    'Бетон толстый, но не везде',
    'Внутри есть камера. Прокопай взрывами',
    'Подрежь один угол — башня накренится',
    'Донжон внутри стен: доберись до него',
    'Финал. Устрой настоящий обвал',
  ],
  en: [
    'Hit the wall — the cabin folds on its own',
    'A blast in the partition reaches both rooms',
    'Knock out the middle columns — the roof falls by itself',
    'Hit the ground floor: the top will come down',
    'Stone eats the blast. Start with the wooden annex',
    'Break the floor — there is a cellar below',
    'Blow the base and the tower folds in',
    'One blast between the huts reaches both',
    'The piers hold the whole span',
    'A big house deserves a big collapse',
    'Drop the silo straight onto the barn',
    'Four legs. Two will do',
    'The buildings stand apart — count your bombs',
    'Steel columns hold a heavy roof',
    'Cut the base — the tower topples sideways',
    'The house stands on six stilts',
    'The walls are thick: hit the same spot twice',
    'The pit props will not hold for long',
    'The spire falls beautifully',
    'Steel takes the hit. Look for concrete and glass',
    'The arches hold each other up',
    'Take out the ground floor and it all comes down',
    'A tall tube loves to fall',
    'Glass shatters from any blast',
    'The arched roof rests on its ribs',
    'The concrete is thick, but not everywhere',
    'There is a chamber inside. Dig with explosives',
    'Undercut one corner and the tower leans',
    'The keep is inside the walls — get to it',
    'The finale. Bring the whole thing down',
  ],
};

/** Строки интерфейса песочницы поверх общего словаря. */
export const SANDBOX_I18N = {
  ru: {
    'game.subtitle': 'SANDBOX!',
    'menu.play': 'Играть',
    'menu.levels': 'Карты',
    'load.0': 'Заряжаем бомбы…',

    'sb.map': 'Карта {n}',
    'sb.maps.all': 'Все карты',
    'sb.bombs': 'бомб',
    'sb.destroyed': 'разрушено',
    'sb.goal': 'цель {n}%',
    'sb.cleared': 'карт уничтожено',

    'sb.win.title': 'Карта уничтожена!',
    'sb.win.destroyed': 'Разрушено',
    'sb.win.bombs': 'Бомб потрачено',
    'sb.win.blocks': 'Блоков снесено',
    'sb.win.next': 'Следующая карта',
    'sb.win.last': 'Это последняя карта — ты снёс всё! Новые карты появятся в следующих обновлениях.',

    'sb.fail.title': 'Бомбы кончились',
    'sb.fail.text': 'Разрушено <b>{n}%</b>, нужно <b>{g}%</b>. Ещё чуть-чуть!',
    'sb.fail.retry': 'Заново',

    'sb.rw.title': 'Нужна ещё одна бомба?',
    'sb.rw.text': 'Посмотри рекламу и получи <b>+1 бомбу</b>, чтобы добить карту.',
    'sb.rw.got': '+1 бомба',

    'sb.locked': 'Откроется на карте {n}',
    'sb.miss': 'Мимо — наведись на постройку',
    'sb.nobombs': 'Бомбы кончились',

    'sb.tut.aim': 'Клик по постройке — <b>взрыв</b>',
    'sb.tut.aim.touch': 'Коснись постройки — <b>взрыв</b>',
    'sb.tut.cam': 'Тяни мышью — <b>облететь</b>, колесо — <b>приблизить</b>',
    'sb.tut.cam.touch': 'Проведи пальцем — <b>облететь</b>, щипок — <b>приблизить</b>',
    'sb.tut.pick': 'Панель внизу — <b>выбор бомбы</b>',

    'sb.weather.rain': 'Дождь: огонь гаснет быстрее',
    'sb.weather.snow': 'Снегопад',
    'sb.weather.storm': 'Гроза: молнии бьют сами',
    'sb.weather.rain.s': 'Дождь',
    'sb.weather.snow.s': 'Снег',
    'sb.weather.storm.s': 'Гроза',
    'sb.lightning': 'Молния! −{n}',
    'sb.goal.done': 'Цель выполнена!',

    'sb.tornado': 'Торнадо',
    'sb.tornado.aim': 'Выбери, куда пустить смерч',
    'sb.tornado.off': 'Смерч отложен',
    'sb.tornado.go': 'Смерч пошёл!',
    'sb.tornado.got': 'Торнадо получено!',
    'sb.tornado.progress': 'Ещё {n}/{m} — и будет торнадо',
    'sb.tornado.hint': 'Торнадо за 2 рекламы: сам гуляет по карте и рвёт постройки',
    'sb.tornado.what': 'Смерч живёт около десяти секунд, сам гуляет по карте и выдирает блоки на своём пути. Бомбы на него не тратятся.',
    'sb.tornado.use': 'Выпустить смерч',
    'sb.tornado.adnote': 'Осталось роликов до торнадо: <b>{n}</b>. Кнопка ниже запускает <b>рекламный ролик</b>.',
    'sb.tornado.adnote.more': 'Можно накопить ещё один смерч. Кнопка ниже запускает <b>рекламный ролик</b>.',
    'sb.tornado.have': 'В запасе',
  },
  en: {
    'game.subtitle': 'SANDBOX!',
    'menu.play': 'Play',
    'menu.levels': 'Maps',
    'load.0': 'Loading bombs…',

    'sb.map': 'Map {n}',
    'sb.maps.all': 'All maps',
    'sb.bombs': 'bombs',
    'sb.destroyed': 'destroyed',
    'sb.goal': 'goal {n}%',
    'sb.cleared': 'maps cleared',

    'sb.win.title': 'Map destroyed!',
    'sb.win.destroyed': 'Destroyed',
    'sb.win.bombs': 'Bombs used',
    'sb.win.blocks': 'Blocks down',
    'sb.win.next': 'Next map',
    'sb.win.last': 'That was the last map — you levelled everything! More maps are coming in future updates.',

    'sb.fail.title': 'Out of bombs',
    'sb.fail.text': 'You destroyed <b>{n}%</b>, you need <b>{g}%</b>. So close!',
    'sb.fail.retry': 'Retry',

    'sb.rw.title': 'Need one more bomb?',
    'sb.rw.text': 'Watch an ad and get <b>+1 bomb</b> to finish the map off.',
    'sb.rw.got': '+1 bomb',

    'sb.locked': 'Unlocks on map {n}',
    'sb.miss': 'Missed — aim at the building',
    'sb.nobombs': 'Out of bombs',

    'sb.tut.aim': 'Click the building — <b>boom</b>',
    'sb.tut.aim.touch': 'Tap the building — <b>boom</b>',
    'sb.tut.cam': 'Drag to <b>orbit</b>, wheel to <b>zoom</b>',
    'sb.tut.cam.touch': 'Swipe to <b>orbit</b>, pinch to <b>zoom</b>',
    'sb.tut.pick': 'The bar below — <b>pick a bomb</b>',

    'sb.weather.rain': 'Rain: fires die out faster',
    'sb.weather.snow': 'Snowfall',
    'sb.weather.storm': 'Thunderstorm: lightning strikes on its own',
    'sb.weather.rain.s': 'Rain',
    'sb.weather.snow.s': 'Snow',
    'sb.weather.storm.s': 'Storm',
    'sb.lightning': 'Lightning! −{n}',
    'sb.goal.done': 'Goal reached!',

    'sb.tornado': 'Tornado',
    'sb.tornado.aim': 'Pick where the twister lands',
    'sb.tornado.off': 'Twister on hold',
    'sb.tornado.go': 'The twister is loose!',
    'sb.tornado.got': 'Tornado unlocked!',
    'sb.tornado.progress': '{n}/{m} — one more for a tornado',
    'sb.tornado.hint': 'Tornado for 2 ads: it roams the map and tears buildings apart',
    'sb.tornado.what': 'The twister lives about ten seconds, roams the map on its own and rips out every block on its way. It costs no bombs.',
    'sb.tornado.use': 'Release the twister',
    'sb.tornado.adnote': 'Ads left for a tornado: <b>{n}</b>. The button below starts a <b>video ad</b>.',
    'sb.tornado.adnote.more': 'You can stock one more twister. The button below starts a <b>video ad</b>.',
    'sb.tornado.have': 'In stock',
  },
};
