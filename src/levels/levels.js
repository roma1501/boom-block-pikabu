/**
 * 30 уровней.
 * У каждого своя постройка, свой набор тайников и своя маленькая задача:
 * какие опоры выбить, чтобы одним зарядом уронить максимум конструкции.
 *
 * stars: [макс. динамита на 3★, на 2★] — потратил больше, значит 1★.
 */
import { MAT } from '../world/Materials.js';

const G = 6;   // уровень пола (верх острова = 5)

export const LEVELS = [
  /* ============================ 1 ============================ */
  {
    name: 'Хижина', size: [40, 34, 40], tnt: 3, stars: [2, 3], tutorial: true,
    hint: 'Поставь динамит у стены и подожги зажигалкой',
    build(b) {
      const cx = 20, cz = 20;
      b.island(cx, cz, 15, 15, G - 1, 'grass');
      b.cabin(cx - 3, cz - 3, 7, 7, 4, G);
      b.center(cx, G + 3, cz);
      b.crystal(cx - 3, G + 1, cz + 1);       // в стене
      b.crystal(cx + 1, G, cz + 1);           // внутри
      b.crystal(cx, G + 4, cz);               // под крышей
      b.tree(cx + 9, cz + 7, G, 5);
      b.tree(cx - 10, cz - 6, G, 6);
      b.spawn(cx, G, cz - 9, 0);
    },
  },

  /* ============================ 2 ============================ */
  {
    name: 'Две комнаты', size: [42, 34, 42], tnt: 3, stars: [2, 3],
    hint: 'Кристаллы бывают спрятаны прямо внутри стен',
    build(b) {
      const cx = 21, cz = 21;
      b.island(cx, cz, 16, 16, G - 1, 'grass');
      b.house(cx - 5, cz - 4, 11, 9, 1, G, { wall: MAT.PLANKS, roof: MAT.THATCH, floorHeight: 5 });
      // перегородка
      b.box(cx, G, cz - 3, cx, G + 3, cz + 3, MAT.PLANKS);
      b.door(cx, G, cz, 0, 1, 2, 1);
      b.crystal(cx - 5, G + 2, cz);           // в стене
      b.crystal(cx, G + 1, cz - 3);           // в перегородке
      b.crystal(cx + 3, G, cz + 2);
      b.crystal(cx - 3, G - 1, cz - 2);       // под полом
      b.crates(cx + 3, G, cz - 3, 3);
      b.fence(cx - 9, cz + 8, cx + 9, cz + 8, G, MAT.PLANKS);
      b.spawn(cx, G, cz - 11, 0);
    },
  },

  /* ============================ 3 ============================ */
  {
    name: 'Деревянный сарай', size: [44, 34, 44], tnt: 3, stars: [2, 3],
    hint: 'Выбей центральные опоры — крыша рухнет сама',
    build(b) {
      const cx = 22, cz = 22;
      b.island(cx, cz, 17, 16, G - 1, 'grass');
      b.barn(cx - 7, cz - 5, 15, 11, 6, G);
      b.crystal(cx + 5, G + 5, cz);            // под крышей
      b.crystal(cx - 6, G + 1, cz - 5);        // в стене
      b.crystal(cx, G - 1, cz + 3);            // под полом
      b.crystal(cx + 6, G, cz + 3);
      b.crates(cx - 4, G, cz + 3, 4);
      b.tree(cx + 12, cz - 8, G, 5);
      b.spawn(cx, G, cz - 12, 0);
    },
  },

  /* ============================ 4 ============================ */
  {
    name: 'Двухэтажный дом', size: [46, 40, 46], tnt: 4, stars: [3, 4],
    hint: 'Взрыв внизу — и второй этаж поедет вниз',
    build(b) {
      const cx = 23, cz = 23;
      b.island(cx, cz, 18, 17, G - 1, 'grass');
      b.house(cx - 5, cz - 5, 11, 11, 2, G, { wall: MAT.PLANKS, frame: MAT.LOG, roof: MAT.SLATE });
      b.stairs(cx + 3, G, cz + 3, 4, '+z', MAT.PLANKS, 2);
      b.crystal(cx - 5, G + 5, cz + 2);
      b.crystal(cx + 2, G + 4, cz - 2);        // на втором этаже
      b.crystal(cx, G - 1, cz);                // под полом
      b.crystal(cx + 5, G + 1, cz - 3);        // в стене
      b.crystal(cx - 2, G + 8, cz);            // на чердаке
      b.tree(cx - 12, cz + 8, G, 6);
      b.fence(cx - 13, cz - 12, cx + 13, cz - 12, G);
      b.spawn(cx, G, cz - 13, 0);
    },
  },

  /* ============================ 5 ============================ */
  {
    name: 'Каменный дом', size: [46, 38, 46], tnt: 4, stars: [3, 4],
    hint: 'Камень держит взрыв. Ищи деревянные участки',
    build(b) {
      const cx = 23, cz = 23;
      b.island(cx, cz, 18, 17, G - 1, 'grass');
      b.house(cx - 6, cz - 5, 13, 11, 1, G, { wall: MAT.STONE, frame: MAT.STONE, roof: MAT.SLATE, floorHeight: 6 });
      // деревянная пристройка — слабое место
      b.cabin(cx + 7, cz - 3, 6, 7, 4, G, { wall: MAT.PLANKS, roof: MAT.THATCH });
      b.box(cx + 6, G, cz - 2, cx + 6, G + 3, cz + 2, 0);
      b.crystal(cx - 6, G + 2, cz);            // в каменной стене
      b.crystal(cx + 9, G + 1, cz);            // в пристройке
      b.crystal(cx, G, cz + 3);
      b.crystal(cx - 2, G - 1, cz - 2);
      b.chest(cx + 3, G, cz - 3, 1);
      b.spawn(cx, G, cz - 13, 0);
    },
  },

  /* ============================ 6 ============================ */
  {
    name: 'Дом с подвалом', size: [46, 38, 46], tnt: 4, stars: [3, 4],
    hint: 'Пробей пол — под домом есть погреб',
    build(b) {
      const cx = 23, cz = 23;
      b.island(cx, cz, 18, 17, G - 1, 'grass');
      // подвал
      b.box(cx - 5, G - 5, cz - 4, cx + 5, G - 2, cz + 4, MAT.COBBLE);
      b.clear(cx - 4, G - 4, cz - 3, cx + 4, G - 2, cz + 3);
      b.box(cx - 5, G - 1, cz - 4, cx + 5, G - 1, cz + 4, MAT.PLANKS);
      b.house(cx - 5, cz - 4, 11, 9, 1, G, { wall: MAT.BRICK, roof: MAT.SLATE, floorHeight: 5 });
      b.crystal(cx - 3, G - 3, cz);            // в подвале
      b.crystal(cx + 3, G - 3, cz + 2);
      b.crystal(cx - 5, G + 2, cz + 1);
      b.crystal(cx + 2, G, cz - 2);
      b.chest(cx, G - 3, cz - 2, 1);
      b.crates(cx - 3, G - 4, cz + 2, 4);
      b.spawn(cx, G, cz - 12, 0);
    },
  },

  /* ============================ 7 ============================ */
  {
    name: 'Башня', size: [44, 48, 44], tnt: 3, stars: [2, 3],
    hint: 'Подорви основание — башня сложится целиком',
    build(b) {
      const cx = 22, cz = 22;
      b.island(cx, cz, 16, 16, G - 1, 'grass');
      b.tower(cx - 3, cz - 3, 7, 5, G, { wall: MAT.COBBLE });
      b.crystal(cx, G + 2, cz);
      b.crystal(cx - 3, G + 6, cz);            // в стене 2-го
      b.crystal(cx + 1, G + 10, cz + 1);
      b.crystal(cx, G + 18, cz);               // на самом верху
      b.crystal(cx + 2, G - 1, cz - 2);
      b.tree(cx + 10, cz + 9, G, 5);
      b.spawn(cx, G, cz - 11, 0);
    },
  },

  /* ============================ 8 ============================ */
  {
    name: 'Два домика', size: [50, 36, 44], tnt: 4, stars: [3, 4],
    hint: 'Один взрыв может задеть оба дома',
    build(b) {
      const cx = 25, cz = 22;
      b.island(cx, cz, 21, 16, G - 1, 'grass');
      b.cabin(cx - 12, cz - 3, 7, 7, 4, G, { wall: MAT.PLANKS });
      b.cabin(cx + 6, cz - 4, 8, 8, 5, G, { wall: MAT.LOG, roof: MAT.SLATE });
      b.bridge(cx - 5, cx + 5, cz, 3, G + 4, { deck: MAT.PLANKS, pillar: MAT.LOG, pillarStep: 5 });
      b.crystal(cx - 12, G + 1, cz);
      b.crystal(cx - 9, G, cz + 2);
      b.crystal(cx + 9, G + 2, cz);
      b.crystal(cx + 6, G + 5, cz + 2);
      b.crystal(cx, G + 4, cz);                // на мостике
      b.spawn(cx, G, cz - 12, 0);
    },
  },

  /* ============================ 9 ============================ */
  {
    name: 'Мост', size: [56, 40, 40], tnt: 3, stars: [2, 3],
    hint: 'Опоры держат весь пролёт',
    build(b) {
      const cx = 28, cz = 20;
      b.island(cx - 18, cz, 8, 12, G - 1, 'grass');
      b.island(cx + 18, cz, 8, 12, G - 1, 'grass');
      b.bridge(cx - 14, cx + 14, cz, 5, G + 3, { deck: MAT.PLANKS, pillar: MAT.STONE, pillarStep: 7 });
      b.box(cx - 18, G, cz - 2, cx - 14, G + 3, cz + 2, MAT.STONE);
      b.box(cx + 14, G, cz - 2, cx + 18, G + 3, cz + 2, MAT.STONE);
      b.crystal(cx - 7, G + 3, cz);
      b.crystal(cx, G + 3, cz + 1);
      b.crystal(cx + 7, G + 2, cz);
      b.crystal(cx - 7, G - 3, cz - 2);        // в опоре
      b.crystal(cx + 7, G - 5, cz + 2);
      b.tree(cx - 22, cz + 6, G, 5);
      b.spawn(cx - 20, G, cz, Math.PI / 2);
    },
  },

  /* ============================ 10 ============================ */
  {
    name: 'Особняк', size: [52, 44, 50], tnt: 5, stars: [3, 4],
    hint: 'Большому дому — большой обвал',
    build(b) {
      const cx = 26, cz = 25;
      b.island(cx, cz, 21, 20, G - 1, 'grass');
      b.house(cx - 8, cz - 6, 17, 13, 2, G, {
        wall: MAT.PLASTER, frame: MAT.PLANKS_DARK, roof: MAT.SLATE, floorHeight: 5,
      });
      b.box(cx - 3, G, cz - 8, cx + 3, G + 3, cz - 7, MAT.PLASTER);   // крыльцо
      b.box(cx - 3, G + 4, cz - 8, cx + 3, G + 4, cz - 6, MAT.SLATE);
      b.box(cx - 3, G, cz - 8, cx - 3, G + 3, cz - 8, MAT.LOG);
      b.box(cx + 3, G, cz - 8, cx + 3, G + 3, cz - 8, MAT.LOG);
      b.stairs(cx + 5, G, cz + 2, 5, '+z', MAT.PLANKS_DARK, 2);
      b.crystal(cx - 8, G + 2, cz);
      b.crystal(cx + 8, G + 7, cz - 2);
      b.crystal(cx, G + 5, cz + 4);
      b.crystal(cx - 4, G - 1, cz + 3);
      b.crystal(cx + 2, G + 11, cz);
      b.chest(cx - 5, G + 5, cz - 3, 1);
      b.tree(cx - 15, cz + 12, G, 7);
      b.tree(cx + 15, cz - 12, G, 6);
      b.spawn(cx, G, cz - 15, 0);
    },
  },

  /* ============================ 11 ============================ */
  {
    name: 'Амбар и силос', size: [52, 42, 46], tnt: 4, stars: [3, 4],
    hint: 'Уроните силос на амбар',
    build(b) {
      const cx = 26, cz = 23;
      b.island(cx, cz, 21, 18, G - 1, 'grass');
      b.barn(cx - 11, cz - 5, 14, 11, 6, G, { wall: MAT.PLANKS_DARK, roof: MAT.SLATE });
      b.cylinder(cx + 8, cz, 3, G, G + 15, MAT.METAL, true, 1);
      b.dome(cx + 8, cz, 3, G + 16, MAT.METAL);
      b.box(cx + 8, G, cz, cx + 8, G + 12, cz, MAT.CRATE);
      b.crystal(cx + 8, G + 6, cz);            // внутри силоса
      b.crystal(cx + 8, G + 13, cz);
      b.crystal(cx - 10, G + 4, cz);
      b.crystal(cx - 4, G - 1, cz + 2);
      b.crystal(cx - 6, G + 1, cz - 5);
      b.crates(cx + 2, G, cz + 6, 4);
      b.spawn(cx, G, cz - 13, 0);
    },
  },

  /* ============================ 12 ============================ */
  {
    name: 'Водонапорная башня', size: [46, 44, 46], tnt: 3, stars: [2, 3],
    hint: 'Четыре ноги. Хватит ли двух?',
    build(b) {
      const cx = 23, cz = 23;
      b.island(cx, cz, 17, 17, G - 1, 'grass');
      const legs = [[-4, -4], [4, -4], [-4, 4], [4, 4]];
      for (const [dx, dz] of legs) b.box(cx + dx, G, cz + dz, cx + dx, G + 11, cz + dz, MAT.METAL);
      // раскосы
      for (let i = 0; i < 3; i++) {
        const y = G + 3 + i * 4;
        b.box(cx - 4, y, cz - 4, cx + 4, y, cz - 4, MAT.METAL);
        b.box(cx - 4, y, cz + 4, cx + 4, y, cz + 4, MAT.METAL);
        b.box(cx - 4, y, cz - 4, cx - 4, y, cz + 4, MAT.METAL);
        b.box(cx + 4, y, cz - 4, cx + 4, y, cz + 4, MAT.METAL);
      }
      b.box(cx - 5, G + 12, cz - 5, cx + 5, G + 12, cz + 5, MAT.METAL);
      b.cylinder(cx, cz, 5, G + 13, G + 19, MAT.METAL, true, 1);
      b.box(cx - 4, G + 20, cz - 4, cx + 4, G + 20, cz + 4, MAT.METAL);
      b.crystal(cx, G + 16, cz);
      b.crystal(cx + 3, G + 15, cz + 3);
      b.crystal(cx - 4, G + 7, cz - 4);
      b.crystal(cx, G, cz);
      b.crystal(cx + 8, G, cz - 8);
      b.crates(cx - 8, G, cz + 6, 4);
      b.spawn(cx, G, cz - 13, 0);
    },
  },

  /* ============================ 13 ============================ */
  {
    name: 'Ферма', size: [54, 38, 50], tnt: 5, stars: [4, 5],
    hint: 'Кристаллы разбросаны по всей ферме',
    build(b) {
      const cx = 27, cz = 25;
      b.island(cx, cz, 23, 20, G - 1, 'grass');
      b.cabin(cx - 12, cz - 4, 9, 9, 4, G, { wall: MAT.PLANKS, roof: MAT.THATCH });
      b.barn(cx + 2, cz - 6, 12, 12, 5, G, { wall: MAT.PLANKS_DARK, roof: MAT.PLANKS });
      b.fence(cx - 18, cz + 10, cx + 18, cz + 10, G);
      b.fence(cx - 18, cz - 14, cx - 18, cz + 10, G);
      b.box(cx - 6, G, cz + 12, cx - 2, G + 2, cz + 14, MAT.PLANKS);   // курятник
      b.gable(cx - 6, cz + 12, cx - 2, cz + 14, G + 3, MAT.THATCH, 'x', 0, true);
      b.tree(cx + 18, cz + 12, G, 7);
      b.tree(cx - 20, cz - 10, G, 6);
      b.crystal(cx - 12, G + 2, cz);
      b.crystal(cx + 7, G + 4, cz);
      b.crystal(cx - 4, G + 1, cz + 13);
      b.crystal(cx + 3, G - 1, cz - 3);
      b.crystal(cx + 11, G, cz + 4);
      b.chest(cx - 9, G, cz + 2, 1);
      b.spawn(cx, G, cz - 16, 0);
    },
  },

  /* ============================ 14 ============================ */
  {
    name: 'Склад', size: [52, 40, 48], tnt: 4, stars: [3, 4],
    hint: 'Металлические колонны держат тяжёлую крышу',
    build(b) {
      const cx = 26, cz = 24;
      b.island(cx, cz, 21, 19, G - 1, 'stone');
      b.box(cx - 12, G - 1, cz - 8, cx + 12, G - 1, cz + 8, MAT.CONCRETE);
      b.shell(cx - 12, G, cz - 8, cx + 12, G + 6, cz + 8, MAT.CONCRETE);
      for (let x = cx - 8; x <= cx + 8; x += 8) {
        b.box(x, G, cz - 3, x, G + 6, cz - 3, MAT.METAL);
        b.box(x, G, cz + 3, x, G + 6, cz + 3, MAT.METAL);
      }
      b.box(cx - 13, G + 7, cz - 9, cx + 13, G + 7, cz + 9, MAT.METAL);
      b.box(cx - 13, G + 8, cz - 9, cx + 13, G + 8, cz - 9, MAT.METAL);
      b.door(cx - 2, G, cz - 8, 1, 0, 4, 5);
      b.windows(cx - 12, G + 4, cz - 8, cx + 12, cz + 8, MAT.GLASS, 4, 2);
      b.crates(cx - 8, G, cz + 5, 6);
      b.crates(cx + 6, G, cz - 5, 6);
      b.crates(cx + 2, G, cz + 5, 4);
      b.crystal(cx - 12, G + 3, cz + 2);
      b.crystal(cx + 8, G + 6, cz);
      b.crystal(cx - 7, G, cz + 5);
      b.crystal(cx, G - 1, cz);
      b.chest(cx + 9, G, cz + 6, 2);
      b.spawn(cx, G, cz - 15, 0);
    },
  },

  /* ============================ 15 ============================ */
  {
    name: 'Мельница', size: [48, 46, 48], tnt: 4, stars: [3, 4],
    hint: 'Подрежь основание — башня повалится набок',
    build(b) {
      const cx = 24, cz = 24;
      b.island(cx, cz, 19, 19, G - 1, 'grass');
      b.windmill(cx, cz, G);
      b.cabin(cx + 11, cz + 6, 7, 7, 4, G, { wall: MAT.PLANKS, roof: MAT.THATCH });
      b.crystal(cx, G + 5, cz);
      b.crystal(cx, G + 11, cz);
      b.crystal(cx - 3, G + 1, cz + 2);
      b.crystal(cx + 13, G + 1, cz + 8);
      b.crystal(cx + 6, G - 1, cz - 6);
      b.tree(cx - 12, cz + 10, G, 6);
      b.spawn(cx, G, cz - 14, 0);
    },
  },

  /* ============================ 16 ============================ */
  {
    name: 'Дом на сваях', size: [46, 40, 46], tnt: 3, stars: [2, 3],
    hint: 'Дом стоит на шести сваях',
    build(b) {
      const cx = 23, cz = 23;
      b.island(cx, cz, 18, 18, G - 1, 'sand');
      b.stiltHouse(cx - 5, cz - 4, 11, 9, G, 5, { roof: MAT.THATCH });
      b.crystal(cx, G + 6, cz);
      b.crystal(cx - 5, G + 7, cz + 2);
      b.crystal(cx + 4, G + 9, cz - 2);
      b.crystal(cx - 5, G + 2, cz - 4);        // в свае
      b.crystal(cx + 8, G, cz + 8);
      b.crates(cx - 9, G, cz + 4, 3);
      b.tree(cx + 12, cz - 10, G, 5);
      b.spawn(cx, G, cz - 13, 0);
    },
  },

  /* ============================ 17 ============================ */
  {
    name: 'Крепость', size: [52, 44, 52], tnt: 5, stars: [4, 5],
    hint: 'Стены толстые — бей в одно место',
    build(b) {
      const cx = 26, cz = 26;
      b.island(cx, cz, 22, 22, G - 1, 'stone');
      b.fortress(cx - 8, cz - 8, 17, 17, 7, G);
      b.cabin(cx - 3, cz - 2, 7, 6, 4, G, { wall: MAT.PLANKS, roof: MAT.SLATE });
      b.crystal(cx, G + 1, cz);
      b.crystal(cx - 8, G + 3, cz + 4);        // в стене
      b.crystal(cx + 8, G + 5, cz - 5);
      b.crystal(cx - 9, G + 8, cz - 9);        // в башне
      b.crystal(cx + 4, G - 1, cz + 4);
      b.chest(cx + 3, G, cz + 5, 1);
      b.spawn(cx, G, cz - 16, 0);
    },
  },

  /* ============================ 18 ============================ */
  {
    name: 'Старая шахта', size: [50, 40, 50], tnt: 4, stars: [3, 4],
    hint: 'Крепь шахты долго не выдержит',
    build(b) {
      const cx = 25, cz = 25;
      b.island(cx, cz, 21, 21, G - 1, 'stone');
      // холм
      for (let i = 0; i < 7; i++) {
        b.box(cx - 9 + i, G + i, cz - 9 + i, cx + 9 - i, G + i, cz + 9 - i, MAT.STONE);
      }
      // штольня
      b.clear(cx - 2, G, cz - 9, cx + 2, G + 3, cz + 5);
      for (let z = cz - 9; z <= cz + 4; z += 3) {
        b.box(cx - 2, G, z, cx - 2, G + 3, z, MAT.LOG);
        b.box(cx + 2, G, z, cx + 2, G + 3, z, MAT.LOG);
        b.box(cx - 2, G + 4, z, cx + 2, G + 4, z, MAT.LOG);
      }
      b.crates(cx - 1, G, cz + 2, 4);
      b.crystal(cx, G + 1, cz + 4);
      b.crystal(cx - 4, G + 2, cz);            // в породе
      b.crystal(cx + 5, G + 3, cz - 2);
      b.crystal(cx, G + 8, cz);
      b.crystal(cx - 8, G, cz - 12);
      b.chest(cx + 1, G, cz + 4, 1);
      b.spawn(cx, G, cz - 16, 0);
    },
  },

  /* ============================ 19 ============================ */
  {
    name: 'Церковь', size: [50, 50, 50], tnt: 4, stars: [3, 4],
    hint: 'Шпиль упадёт красиво',
    build(b) {
      const cx = 25, cz = 25;
      b.island(cx, cz, 20, 20, G - 1, 'grass');
      b.house(cx - 6, cz - 9, 13, 19, 1, G, { wall: MAT.PLASTER, frame: MAT.STONE, roof: MAT.SLATE, floorHeight: 8 });
      // колокольня
      b.shell(cx - 3, G, cz - 13, cx + 3, G + 17, cz - 7, MAT.STONE);
      b.box(cx - 2, G + 14, cz - 12, cx + 2, G + 16, cz - 8, 0);
      b.pyramid(cx - 3, cz - 13, cx + 3, cz - 7, G + 18, MAT.SLATE, 1);
      b.box(cx, G + 24, cz - 10, cx, G + 27, cz - 10, MAT.GOLD);
      b.door(cx, G, cz - 13, 1, 0, 3, 1);
      for (let z = cz - 6; z <= cz + 8; z += 4) {
        b.box(cx - 6, G + 3, z, cx - 6, G + 5, z, MAT.GLASS);
        b.box(cx + 6, G + 3, z, cx + 6, G + 5, z, MAT.GLASS);
      }
      b.crystal(cx, G + 15, cz - 10);          // в колокольне
      b.crystal(cx, G + 22, cz - 10);
      b.crystal(cx - 6, G + 4, cz + 2);
      b.crystal(cx + 2, G, cz + 7);
      b.crystal(cx, G - 1, cz);
      b.chest(cx, G, cz + 7, 1);
      b.spawn(cx, G, cz - 18, 0);
    },
  },

  /* ============================ 20 ============================ */
  {
    name: 'Мини-завод', size: [56, 44, 50], tnt: 5, stars: [4, 5],
    hint: 'Металл держит удар. Ищи бетон и стекло',
    build(b) {
      const cx = 28, cz = 25;
      b.island(cx, cz, 24, 20, G - 1, 'stone');
      b.factory(cx - 12, cz - 7, 24, 15, 8, G);
      b.cylinder(cx + 14, cz + 8, 3, G, G + 8, MAT.METAL, true, 1);
      b.box(cx + 14, G + 9, cz + 8, cx + 14, G + 9, cz + 8, MAT.METAL);
      b.crates(cx - 16, G, cz + 8, 6);
      b.crystal(cx - 10, G + 4, cz);
      b.crystal(cx + 8, G + 6, cz - 3);
      b.crystal(cx + 14, G + 4, cz + 8);       // в цистерне
      b.crystal(cx, G - 1, cz + 4);
      b.crystal(cx - 10, G + 11, cz + 3);      // в трубе
      b.chest(cx + 2, G, cz + 5, 1);
      b.spawn(cx, G, cz - 16, 0);
    },
  },

  /* ============================ 21 ============================ */
  {
    name: 'Виадук', size: [60, 44, 42], tnt: 4, stars: [3, 4],
    hint: 'Арки держат друг друга',
    build(b) {
      const cx = 30, cz = 21;
      b.island(cx, cz, 26, 15, G - 1, 'stone');
      b.clear(cx - 20, G - 4, cz - 8, cx + 20, G + 20, cz + 8);
      b.box(cx - 22, G - 5, cz - 12, cx + 22, G - 5, cz + 12, MAT.STONE);
      for (let i = -2; i <= 2; i++) {
        const x = cx + i * 9;
        b.box(x - 2, G - 4, cz - 3, x + 2, G + 5, cz + 3, MAT.STONE);
        b.clear(x - 1, G - 4, cz - 3, x + 1, G + 1, cz + 3);
        b.arch(x, G + 1, cz - 3, cz + 3, 2, MAT.STONE);
      }
      b.box(cx - 22, G + 6, cz - 3, cx + 22, G + 7, cz + 3, MAT.COBBLE);
      b.box(cx - 22, G + 8, cz - 3, cx + 22, G + 8, cz - 3, MAT.STONE);
      b.box(cx - 22, G + 8, cz + 3, cx + 22, G + 8, cz + 3, MAT.STONE);
      b.crystal(cx, G + 7, cz);
      b.crystal(cx - 9, G + 3, cz);
      b.crystal(cx + 18, G + 7, cz + 1);
      b.crystal(cx + 9, G - 2, cz + 2);
      b.crystal(cx - 18, G + 7, cz - 1);
      b.spawn(cx, G - 4, cz - 11, 0);
    },
  },

  /* ============================ 22 ============================ */
  {
    name: 'Многоэтажка', size: [50, 54, 50], tnt: 5, stars: [4, 5],
    hint: 'Снеси первый этаж — всё сложится вниз',
    build(b) {
      const cx = 25, cz = 25;
      b.island(cx, cz, 20, 20, G - 1, 'stone');
      b.house(cx - 7, cz - 6, 15, 13, 4, G, {
        wall: MAT.CONCRETE, frame: MAT.CONCRETE, floor: MAT.CONCRETE,
        roof: MAT.CONCRETE, roofType: 'flat', floorHeight: 4,
      });
      // балконы
      for (let f = 1; f < 4; f++) {
        const y = G + f * 4 - 1;
        b.box(cx - 8, y, cz - 7, cx + 8, y, cz - 7, MAT.CONCRETE);
        b.box(cx - 8, y + 1, cz - 7, cx + 8, y + 1, cz - 7, MAT.METAL);
      }
      b.crystal(cx, G + 1, cz);
      b.crystal(cx - 7, G + 6, cz + 2);
      b.crystal(cx + 5, G + 10, cz - 3);
      b.crystal(cx, G + 14, cz + 3);
      b.crystal(cx - 3, G - 1, cz - 3);
      b.chest(cx + 4, G + 12, cz + 4, 1);
      b.spawn(cx, G, cz - 16, 0);
    },
  },

  /* ============================ 23 ============================ */
  {
    name: 'Маяк', size: [46, 54, 46], tnt: 4, stars: [3, 4],
    hint: 'Высокая труба любит падать',
    build(b) {
      const cx = 23, cz = 23;
      b.island(cx, cz, 18, 18, G - 1, 'sand');
      b.cylinder(cx, cz, 5, G, G + 4, MAT.STONE, true, 2);
      b.cylinder(cx, cz, 4, G + 5, G + 22, MAT.PLASTER, true, 1);
      for (let y = G + 6; y < G + 22; y += 4) {
        b.cylinder(cx, cz, 4, y, y, MAT.BRICK, true, 1);
      }
      b.cylinder(cx, cz, 5, G + 23, G + 24, MAT.METAL, true, 1);
      b.cylinder(cx, cz, 4, G + 25, G + 27, MAT.GLASS, true, 1);
      b.box(cx - 4, G + 28, cz - 4, cx + 4, G + 28, cz + 4, MAT.METAL);
      b.box(cx, G + 26, cz, cx, G + 26, cz, MAT.GOLD);
      b.door(cx, G, cz - 5, 1, 0, 2, 1);
      b.cabin(cx + 9, cz + 6, 7, 7, 4, G, { wall: MAT.PLANKS, roof: MAT.SLATE });
      b.crystal(cx, G + 26, cz);
      b.crystal(cx, G + 12, cz);
      b.crystal(cx - 4, G + 3, cz);
      b.crystal(cx + 11, G + 1, cz + 8);
      b.crystal(cx - 8, G, cz - 8);
      b.spawn(cx, G, cz - 13, 0);
    },
  },

  /* ============================ 24 ============================ */
  {
    name: 'Оранжерея', size: [50, 40, 48], tnt: 3, stars: [2, 3],
    hint: 'Стекло разлетается от любого взрыва',
    build(b) {
      const cx = 25, cz = 24;
      b.island(cx, cz, 20, 19, G - 1, 'grass');
      b.box(cx - 10, G - 1, cz - 7, cx + 10, G - 1, cz + 7, MAT.BRICK);
      b.shell(cx - 10, G, cz - 7, cx + 10, G + 1, cz + 7, MAT.BRICK);
      b.shell(cx - 10, G + 2, cz - 7, cx + 10, G + 6, cz + 7, MAT.GLASS);
      for (let x = cx - 10; x <= cx + 10; x += 5) b.box(x, G, cz - 7, x, G + 6, cz - 7, MAT.METAL);
      for (let x = cx - 10; x <= cx + 10; x += 5) b.box(x, G, cz + 7, x, G + 6, cz + 7, MAT.METAL);
      b.gable(cx - 10, cz - 7, cx + 10, cz + 7, G + 7, MAT.GLASS, 'x', 1, true);
      b.box(cx - 11, G + 14, cz, cx + 11, G + 14, cz, MAT.METAL);
      b.door(cx, G, cz - 7, 1, 0, 3, 2);
      for (let i = -2; i <= 2; i++) b.tree(cx + i * 4, cz + 2, G, 3, MAT.LEAVES);
      b.crystal(cx, G + 2, cz - 3);
      b.crystal(cx - 8, G + 1, cz + 4);
      b.crystal(cx + 8, G + 9, cz);
      b.crystal(cx - 10, G, cz);
      b.chest(cx + 6, G, cz - 4, 1);
      b.spawn(cx, G, cz - 15, 0);
    },
  },

  /* ============================ 25 ============================ */
  {
    name: 'Ангар', size: [56, 42, 48], tnt: 4, stars: [3, 4],
    hint: 'Арочная крыша держится на рёбрах',
    build(b) {
      const cx = 28, cz = 24;
      b.island(cx, cz, 24, 20, G - 1, 'stone');
      b.box(cx - 14, G - 1, cz - 9, cx + 14, G - 1, cz + 9, MAT.CONCRETE);
      // рёбра арки
      for (let x = cx - 14; x <= cx + 14; x += 3) {
        for (let a = 0; a <= 180; a += 5) {
          const rad = a * Math.PI / 180;
          const dz = Math.round(Math.cos(rad) * 9);
          const dy = Math.round(Math.sin(rad) * 9);
          b.set(x, G + dy, cz + dz, MAT.METAL);
        }
      }
      // обшивка
      for (let x = cx - 14; x <= cx + 14; x++) {
        for (let a = 0; a <= 180; a += 5) {
          const rad = a * Math.PI / 180;
          const dz = Math.round(Math.cos(rad) * 9);
          const dy = Math.round(Math.sin(rad) * 9);
          if (b.get(x, G + dy, cz + dz) === 0) b.set(x, G + dy, cz + dz, MAT.CONCRETE);
        }
      }
      b.clear(cx - 4, G, cz - 10, cx + 4, G + 6, cz - 8);
      b.shell(cx + 14, G, cz - 9, cx + 14, G + 9, cz + 9, MAT.CONCRETE);
      b.crates(cx - 10, G, cz + 4, 6);
      b.crates(cx + 6, G, cz - 4, 4);
      b.crystal(cx, G + 8, cz);
      b.crystal(cx - 12, G + 4, cz + 7);
      b.crystal(cx + 10, G, cz - 3);
      b.crystal(cx - 4, G - 1, cz);
      b.crystal(cx + 14, G + 5, cz);
      b.chest(cx, G, cz + 6, 1);
      b.spawn(cx, G, cz - 17, 0);
    },
  },

  /* ============================ 26 ============================ */
  {
    name: 'Плотина', size: [56, 44, 44], tnt: 4, stars: [3, 4],
    hint: 'Бетон толстый, но не везде',
    build(b) {
      const cx = 28, cz = 22;
      b.island(cx, cz, 24, 18, G - 1, 'stone');
      b.clear(cx - 24, G, cz - 18, cx + 24, G + 18, cz + 18);
      b.box(cx - 3, G - 4, cz - 16, cx + 3, G + 9, cz + 16, MAT.CONCRETE);
      b.box(cx - 2, G - 4, cz - 16, cx + 2, G + 4, cz - 6, MAT.ICE);
      b.box(cx - 2, G - 4, cz + 6, cx + 2, G + 4, cz + 16, MAT.ICE);
      // водосброс
      b.clear(cx - 1, G + 5, cz - 3, cx + 1, G + 8, cz + 3);
      for (let z = cz - 14; z <= cz + 14; z += 6) {
        b.box(cx - 4, G, z, cx - 4, G + 9, z, MAT.METAL);
        b.box(cx + 4, G, z, cx + 4, G + 9, z, MAT.METAL);
      }
      b.box(cx - 4, G + 10, cz - 16, cx + 4, G + 10, cz + 16, MAT.CONCRETE);
      b.box(cx - 4, G + 11, cz - 16, cx - 4, G + 11, cz + 16, MAT.METAL);
      b.box(cx + 4, G + 11, cz - 16, cx + 4, G + 11, cz + 16, MAT.METAL);
      // домик оператора
      b.cabin(cx + 6, cz - 3, 6, 6, 4, G + 11, { wall: MAT.CONCRETE, roof: MAT.METAL });
      b.crystal(cx, G + 3, cz);
      b.crystal(cx, G + 10, cz - 10);
      b.crystal(cx + 8, G + 12, cz);
      b.crystal(cx - 2, G - 2, cz + 9);
      b.crystal(cx + 2, G + 6, cz - 13);
      b.spawn(cx - 12, G, cz, Math.PI / 2);
    },
  },

  /* ============================ 27 ============================ */
  {
    name: 'Пирамида', size: [52, 42, 52], tnt: 5, stars: [4, 5],
    hint: 'Внутри есть камера. Копай взрывом',
    build(b) {
      const cx = 26, cz = 26;
      b.island(cx, cz, 22, 22, G - 1, 'sand');
      for (let i = 0; i <= 11; i++) {
        b.box(cx - 12 + i, G + i, cz - 12 + i, cx + 12 - i, G + i, cz + 12 - i, MAT.SAND);
      }
      // внутренняя камера
      b.clear(cx - 3, G + 1, cz - 3, cx + 3, G + 4, cz + 3);
      b.shell(cx - 4, G, cz - 4, cx + 4, G + 5, cz + 4, MAT.BRICK);
      b.clear(cx - 3, G + 1, cz - 3, cx + 3, G + 4, cz + 3);
      // коридор
      b.clear(cx - 1, G + 1, cz - 12, cx + 1, G + 2, cz - 4);
      for (let z = cz - 11; z <= cz - 5; z += 3) {
        b.box(cx - 2, G + 1, z, cx - 2, G + 3, z, MAT.STONE);
        b.box(cx + 2, G + 1, z, cx + 2, G + 3, z, MAT.STONE);
      }
      b.crystal(cx, G + 8, cz);
      b.crystal(cx - 4, G + 2, cz);
      b.crystal(cx + 6, G + 4, cz - 2);
      b.crystal(cx, G + 1, cz - 8);
      b.crystal(cx - 8, G + 2, cz + 6);
      b.chest(cx, G + 1, cz, 2);
      b.spawn(cx, G, cz - 18, 0);
    },
  },

  /* ============================ 28 ============================ */
  {
    name: 'Часовая башня', size: [50, 56, 50], tnt: 4, stars: [3, 4],
    hint: 'Подруби угол — башня накренится',
    build(b) {
      const cx = 25, cz = 25;
      b.island(cx, cz, 20, 20, G - 1, 'grass');
      b.house(cx - 9, cz - 6, 19, 13, 1, G, { wall: MAT.BRICK, frame: MAT.STONE, roof: MAT.SLATE, floorHeight: 6 });
      b.tower(cx - 3, cz - 3, 7, 6, G, { wall: MAT.BRICK, floorHeight: 4 });
      // циферблат
      b.box(cx - 2, G + 20, cz - 4, cx + 2, G + 23, cz - 4, MAT.PLASTER);
      b.box(cx, G + 21, cz - 5, cx, G + 22, cz - 5, MAT.GOLD);
      b.pyramid(cx - 4, cz - 4, cx + 4, cz + 4, G + 25, MAT.SLATE, 0);
      b.box(cx, G + 30, cz, cx, G + 33, cz, MAT.GOLD);
      b.crystal(cx, G + 22, cz);
      b.crystal(cx, G + 12, cz);
      b.crystal(cx - 8, G + 3, cz + 3);
      b.crystal(cx + 7, G + 1, cz - 4);
      b.crystal(cx, G - 1, cz + 5);
      b.chest(cx + 6, G, cz + 4, 1);
      b.spawn(cx, G, cz - 16, 0);
    },
  },

  /* ============================ 29 ============================ */
  {
    name: 'Замок', size: [60, 50, 60], tnt: 6, stars: [4, 5],
    hint: 'Донжон внутри стен — доберись до него',
    build(b) {
      const cx = 30, cz = 30;
      b.island(cx, cz, 26, 26, G - 1, 'grass');
      b.fortress(cx - 14, cz - 14, 29, 29, 8, G, { wall: MAT.STONE });
      b.tower(cx - 4, cz - 4, 9, 5, G, { wall: MAT.COBBLE, floorHeight: 4 });
      b.pyramid(cx - 5, cz - 5, cx + 5, cz + 5, G + 20, MAT.SLATE, 0);
      b.cabin(cx + 8, cz + 7, 6, 6, 4, G, { wall: MAT.PLANKS, roof: MAT.THATCH });
      b.cabin(cx - 12, cz + 7, 6, 6, 4, G, { wall: MAT.PLANKS, roof: MAT.THATCH });
      b.crystal(cx, G + 2, cz);
      b.crystal(cx, G + 14, cz);
      b.crystal(cx - 14, G + 4, cz);
      b.crystal(cx + 15, G + 10, cz + 15);
      b.crystal(cx + 10, G + 1, cz + 9);
      b.crystal(cx - 6, G - 1, cz - 6);
      b.chest(cx, G + 8, cz, 1);
      b.spawn(cx, G, cz - 22, 0);
    },
  },

  /* ============================ 30 ============================ */
  {
    name: 'Цитадель', size: [64, 56, 64], tnt: 7, stars: [5, 6],
    hint: 'Финал. Устрой настоящий обвал',
    build(b) {
      const cx = 32, cz = 32;
      b.island(cx, cz, 28, 28, G - 1, 'stone');
      // подиум
      b.box(cx - 20, G, cz - 20, cx + 20, G + 1, cz + 20, MAT.CONCRETE);
      // главный корпус
      b.house(cx - 10, cz - 8, 21, 17, 3, G + 2, {
        wall: MAT.PLASTER, frame: MAT.STONE, roof: MAT.SLATE, floorHeight: 5, roofType: 'flat',
      });
      // башни по углам
      for (const [dx, dz] of [[-16, -16], [16, -16], [-16, 16], [16, 16]]) {
        b.tower(cx + dx - 3, cz + dz - 3, 7, 4, G + 2, { wall: MAT.COBBLE, floorHeight: 4 });
      }
      // переходы
      b.bridge(cx - 13, cx - 4, cz - 16, 3, G + 12, { deck: MAT.STONE, pillar: MAT.STONE, pillarStep: 5 });
      b.bridge(cx + 4, cx + 13, cz + 16, 3, G + 12, { deck: MAT.STONE, pillar: MAT.STONE, pillarStep: 5 });
      // центральный шпиль
      b.cylinder(cx, cz, 4, G + 17, G + 30, MAT.STONE, true, 1);
      b.pyramid(cx - 4, cz - 4, cx + 4, cz + 4, G + 31, MAT.GOLD, 0);
      b.factory(cx - 24, cz - 6, 11, 13, 6, G + 2);
      b.crystal(cx, G + 24, cz);
      b.crystal(cx, G + 8, cz);
      b.crystal(cx - 16, G + 8, cz - 16);
      b.crystal(cx + 16, G + 12, cz + 16);
      b.crystal(cx - 10, G + 4, cz);
      b.crystal(cx + 8, G + 13, cz - 4);
      b.crystal(cx - 20, G + 4, cz);
      b.chest(cx, G + 18, cz, 1);
      b.chest(cx + 16, G + 3, cz - 16, 1);
      b.spawn(cx, G + 2, cz - 24, 0);
    },
  },
];

export const TOTAL_LEVELS = LEVELS.length;

/**
 * Диорамы для главного меню.
 * Здесь работает та же система разрушения, поэтому фоновые взрывы
 * настоящие: блоки разлетаются, крыша обваливается, поднимается пыль.
 * При каждой отстройке выбирается случайная из трёх — меню не приедается.
 */
export const MENU_LEVELS = [
  {
    name: 'Деревня', size: [30, 28, 30],
    build(b) {
      const cx = 15, cz = 15;
      b.island(cx, cz, 11, 11, G - 1, 'grass');
      b.cabin(cx - 4, cz - 3, 8, 7, 4, G, { wall: MAT.PLANKS, roof: MAT.THATCH });
      b.tower(cx + 5, cz + 3, 5, 3, G, { wall: MAT.COBBLE, floorHeight: 4 });
      b.tree(cx - 8, cz + 6, G, 6);
      b.tree(cx + 8, cz - 7, G, 5);
      b.fence(cx - 9, cz + 9, cx + 9, cz + 9, G);
      b.crates(cx - 7, G, cz - 5, 4);
      b.center(cx, G + 3, cz);
    },
  },
  {
    name: 'Ферма', size: [30, 28, 30],
    build(b) {
      const cx = 15, cz = 15;
      b.island(cx, cz, 11, 11, G - 1, 'grass');
      b.barn(cx - 8, cz - 4, 11, 9, 5, G, { wall: MAT.PLANKS_DARK, roof: MAT.PLANKS });
      b.cylinder(cx + 6, cz + 1, 2, G, G + 9, MAT.METAL, true, 1);
      b.dome(cx + 6, cz + 1, 2, G + 10, MAT.METAL);
      b.box(cx + 6, G, cz + 1, cx + 6, G + 7, cz + 1, MAT.CRATE);
      b.fence(cx - 10, cz + 8, cx + 10, cz + 8, G);
      b.fence(cx - 10, cz - 9, cx - 10, cz + 8, G);
      b.tree(cx + 8, cz - 7, G, 6);
      b.crates(cx - 2, G, cz + 6, 4);
      b.center(cx, G + 3, cz);
    },
  },
  {
    name: 'Форт', size: [30, 30, 30],
    build(b) {
      const cx = 15, cz = 15;
      b.island(cx, cz, 11, 11, G - 1, 'stone');
      b.shell(cx - 7, G, cz - 7, cx + 7, G + 4, cz + 7, MAT.STONE);
      for (let i = 0; i <= 14; i += 2) {
        b.set(cx - 7 + i, G + 5, cz - 7, MAT.STONE);
        b.set(cx - 7 + i, G + 5, cz + 7, MAT.STONE);
        b.set(cx - 7, G + 5, cz - 7 + i, MAT.STONE);
        b.set(cx + 7, G + 5, cz - 7 + i, MAT.STONE);
      }
      b.door(cx, G, cz - 7, 1, 0, 3, 2);
      b.tower(cx - 3, cz - 2, 6, 4, G, { wall: MAT.COBBLE, floorHeight: 4 });
      b.pyramid(cx - 3, cz - 2, cx + 2, cz + 3, G + 16, MAT.SLATE, 0);
      b.cabin(cx + 3, cz + 3, 5, 5, 3, G, { wall: MAT.PLANKS, roof: MAT.THATCH });
      b.crates(cx - 6, G, cz + 4, 4);
      b.center(cx, G + 5, cz);
    },
  },
];

/** Совместимость: первая диорама как значение по умолчанию. */
export const MENU_LEVEL = MENU_LEVELS[0];
