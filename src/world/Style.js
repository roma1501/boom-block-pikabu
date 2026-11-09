/**
 * Визуальный стиль блоков.
 *
 * 'classic' — плоские грани, пиксельные текстуры (сборки для Яндекс Игр).
 * 'rounded' — стиль основной игры для YouTube Playables: у каждого блока
 *             скруглённая фаска, свои текстуры, заряды не кубические.
 * 'soft'    — стиль песочницы для YouTube Playables. Тоже скруглённый, но
 *             заметно сильнее: фаска почти вдвое больше (блок читается как
 *             мягкая подушка), палитра ярче и «леденцовая», у каждой грани
 *             своя подсветка, а заряды другой формы — круглые бомбы вместо
 *             связок шашек. Две игры на одной площадке не должны выглядеть
 *             одинаково.
 *
 * Задаётся один раз до создания атласа.
 */
let style = 'classic';
let bevelSegments = 3;

const BEVEL_RADIUS = { classic: 0, rounded: 0.16, soft: 0.27 };

export function setBlockStyle(s) {
  style = (s === 'rounded' || s === 'soft') ? s : 'classic';
}
export function getBlockStyle() { return style; }

/** Скруглённая геометрия — и у 'rounded', и у 'soft'. */
export function isRounded() { return style === 'rounded' || style === 'soft'; }

/** Мягкий стиль песочницы: отдельная палитра и свои модели зарядов. */
export function isSoft() { return style === 'soft'; }

/** Радиус фаски блока в долях его размера. */
export function getBevelRadius() { return BEVEL_RADIUS[style] || 0.16; }

/** Сколько полосок в дуге скругления: на слабых устройствах меньше. */
export function setBevelSegments(n) { bevelSegments = Math.max(1, Math.min(4, n | 0)); }
export function getBevelSegments() { return bevelSegments; }
