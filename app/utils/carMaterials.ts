import type * as THREE from 'three'

/**
 * Материалы кузова по UV-маске.
 *
 * Экспортёр кладёт в GLB крошечную маску `rp_mask` (PNG 2×2) и вешает её как
 * baseColorTexture сразу на три материала. Квадрант, в который попадает UV0
 * полигона, и есть зона детали: красный — краска, зелёный — салон, синий —
 * стёкла, чёрный — чёрные элементы. Пока материала нет, маска так и светит
 * цветными пятнами, поэтому цвет квадранта в шейдере всегда перекрывается.
 *
 * Окраска — три независимые оси, как у настоящей машины. Выбор идёт по всей
 * машине сразу, отдельных настроек на деталь нет:
 *   `color`    — цвет всего кузова. «Без цвета» — без тонировки: с узором это
 *                значит, что печать ложится ровно такой, как в файле;
 *   `pattern`  — узор: «без узора» выключает печать везде, «цветочный» включает
 *                её разом на кузове и на всех вариантах обвеса;
 *   `coverage` — покрытие: характер поверхности (roughness / metalness / лак)
 *                плюс рельефная detail-карта (карбон, шлифовка).
 * Оси не связаны: узор ложится поверх любого покрытия и любого цвета. Смена
 * комплектации (рестайлинг бамперов и юбок) узор не трогает — она меняет только
 * геометрию, шейдерный материал остаётся тем же.
 *
 * Отдельно стоят стёкла и оптика, и различает их только имя: стёкла — материал
 * `m_Glass` или ноды `glass*`, оптика — нода или материал со словом `lamp`,
 * `light` или `emissive` (`lamp_front_a`, `m_LampRear`, `white_emissive`).
 * По геометрии их развести нельзя: в прежнем экспорте фары и стопы лежали
 * в стеклянном примитиве кузова вместе с полосками задних боковых стёкол,
 * и признак «стеклянный материал вне ноды glass*» увозил остекление в красный
 * материал стопов. Оптика без указания стороны (`m_Lamp` на обе оси) делится
 * по положению — внутри такого примитива действительно только фары и стопы.
 *
 * Узор и detail-карта покрытия ложатся строго по UV0 — основной развёртке,
 * которая есть у каждой детали, включая варианты обвеса b/c (решение владельца,
 * 13.09.2026; до этого тайл шёл проекцией по мировым координатам). Рисунок
 * следует развёртке как есть: размер и направление на панели задают острова
 * UV. `repeat` в данных остаётся «тайлов на метр» и переводится в тайлы на
 * единицу UV множителем `UV_REPEAT_PER_METER`.
 */

/** Зона детали, выбранная по квадранту маски. */
export type CarZone = 'paint' | 'interior' | 'glass' | 'trim'

/** Квадранты маски: цвет → зона. Совпадает с PNG рядом с GLB. */
export const MASK_QUADRANTS: Record<CarZone, readonly [number, number, number]> = {
  paint: [1, 0, 0],
  interior: [0, 1, 0],
  glass: [0, 0, 1],
  trim: [0, 0, 0],
}

/**
 * Зона по цвету маски (значения 0..1). Тот же расчёт, что и в шейдере, но в JS —
 * чтобы раскладку можно было проверить тестом. Остаток маски (синяя геометрия в
 * кузовном материале) сваливается в чёрные элементы: лучше тёмная деталь, чем дыра.
 */
export function zoneFromMask(r: number, g: number, b: number): CarZone {
  const isPaint = r > 0.5 && g <= 0.5 && b <= 0.5
  if (isPaint) return 'paint'
  const isInterior = g > 0.5 && r <= 0.5 && b <= 0.5
  if (isInterior) return 'interior'
  const isGlass = b > 0.5 && r <= 0.5 && g <= 0.5
  if (isGlass) return 'glass'
  return 'trim'
}

export interface CarPaintColor {
  id: string
  hex: string
}

/* Палитра кузова. Подписи — в i18n (`project.configurator.paint.colors.<id>`),
   здесь только данные, чтобы цвет добавлялся одной строкой.
   «Без цвета» — первый свотч: кузов не тонируется, узор и покрытие показывают
   собственный цвет. Тонировка белым и есть отсутствие цвета. */
export const CAR_PAINT_COLORS: readonly CarPaintColor[] = [
  { id: 'none', hex: '#ffffff' },
  { id: 'obsidian', hex: '#0b0b0d' },
  { id: 'graphite', hex: '#3a3f45' },
  { id: 'silver', hex: '#b9bdc2' },
  { id: 'pearl', hex: '#eceae4' },
  { id: 'racing-red', hex: '#c1121f' },
  { id: 'burgundy', hex: '#5a1420' },
  { id: 'racing-yellow', hex: '#e8b200' },
  { id: 'signal-orange', hex: '#e4572e' },
  { id: 'british-green', hex: '#1b3b2f' },
  { id: 'electric-blue', hex: '#1746b8' },
]

export interface CarPattern {
  id: string
  /** Карта печати в `<media>/textures`; у «без узора» её нет. */
  tile?: string
  /** Плотность печати: тайлов на метр. 0.65 — тайл ≈1.5 м, цветок ≈25 см. */
  repeat: number
  /* Насколько цвет кузова подмешивается к печати. Печать умножается на цвет,
     поэтому «без цвета» (белый) — это тождество: узор ложится ровно таким,
     каким лежит в файле, ничего с ним не складывается. Цвет же подмешивается
     вполсилы, чтобы тёмные оттенки не съедали рисунок целиком. */
  tint: number
}

/*
 * Печати — отдельная ось, как цвет: один выбор управляет всей машиной, никаких
 * отдельных узоров на детали. Новый узор добавляется здесь одной строкой плюс
 * картой `<id>-color.webp` (её собирает scripts/fetch-car-textures.mjs).
 *
 * `repeat` — тайлов на метр, то есть размер мотива на кузове. Значения подобраны
 * под машину ≈5 м: у мелкой графики (жираф, тигр) тайл ходит чаще, у крупной
 * (тай-дай, корова) — реже, чтобы пятно оставалось пятном, а не рябью.
 */
export const CAR_PATTERNS: readonly CarPattern[] = [
  { id: 'none', repeat: 1, tint: 0 },
  { id: 'cherry', tile: 'cherry', repeat: 0.55, tint: 0.5 },
  { id: 'tropical', tile: 'tropical', repeat: 0.5, tint: 0.5 },
  { id: 'morris', tile: 'morris', repeat: 0.45, tint: 0.5 },
  { id: 'chrysanthemum', tile: 'chrysanthemum', repeat: 0.45, tint: 0.5 },
  { id: 'camouflage', tile: 'camouflage', repeat: 0.5, tint: 0.5 },
  { id: 'tiger', tile: 'tiger', repeat: 0.5, tint: 0.5 },
  { id: 'giraffe', tile: 'giraffe', repeat: 0.5, tint: 0.5 },
  { id: 'cow', tile: 'cow', repeat: 0.42, tint: 0.5 },
  { id: 'tie-dye', tile: 'tie-dye', repeat: 0.32, tint: 0.5 },
  { id: 'memphis', tile: 'memphis', repeat: 0.6, tint: 0.5 },
  /* Проверочная сетка развёртки: ровно один тайл на UV (1 / UV_REPEAT_PER_METER),
     клетки A1…H8 показывают раскладку островов как есть. Чистые цвета
     колонок — с цветом «без цвета», как у любой печати. */
  { id: 'uv-checker', tile: 'uv-checker', repeat: 0.125, tint: 0.5 },
]

/*
 * Множитель масштаба узора — отдельная настройка поверх выбранного узора: 1 —
 * тайл ложится как в файле, 0.5 — вдвое мельче, 2 — вдвое крупнее. Границы и
 * шаг — это и есть ползунок в панели: он защёлкивается на точки шага. Низ —
 * 0.15: проверочной UV-сетке нужна клетка мельче детали, иначе по ней не
 * видно ни растяжений, ни плотности текселей.
 */
export const PATTERN_SCALE_MIN = 0.15
export const PATTERN_SCALE_MAX = 2
export const PATTERN_SCALE_STEP = 0.05

export function patternScale(scale: number | undefined): number {
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) return 1
  return Math.min(PATTERN_SCALE_MAX, Math.max(PATTERN_SCALE_MIN, scale))
}

/* Плотность печати в тайлах на метр. Множитель считается в размере рисунка, а
   не в плотности, поэтому на него делим: ×2 — печать вдвое крупнее (тайл вдвое
   длиннее), ×0.5 — вдвое мельче. */
export function patternRepeat(pattern: CarPattern, scale: number | undefined): number {
  return pattern.repeat / patternScale(scale)
}

/* Перевод «тайлов на метр» в тайлы на единицу UV0. Развёртки машин RP Grand
   в среднем дают ≈0,12 единицы UV на метр поверхности, поэтому метровый тайл
   занимает ≈8 тайлов на единицу UV: размеры мотивов остаются близкими к тем,
   что подбирались под машину ≈5 м. */
export const UV_REPEAT_PER_METER = 8

export interface CarCoverage {
  id: string
  /** Detail-карта в `<media>/textures`; без неё покрытие гладкое. */
  tile?: string
  /** Масштаб карты: тайлов на метр (карбон ≈8 см, шлифовка ≈11 см). */
  tileRepeat: number
  /** Насколько карта затемняет краску: 0 — только цвет, 1 — только карта. */
  tileMix: number
  roughness: number
  metalness: number
  clearcoat: number
  clearcoatRoughness: number
}

/* Покрытия — только характер поверхности и её рельеф: «Краска» и «Матовый»
   гладкие, «Карбон» и «Шлифованный металл» тянут серую detail-карту (она
   умножается на цвет), «Керамика-лак» — тонкий лак без карты. Печати здесь
   нет: узор живёт отдельной осью и ложится поверх любого из этих покрытий. */
export const CAR_COVERAGES: readonly CarCoverage[] = [
  { id: 'gloss', tileRepeat: 1, tileMix: 0, roughness: 0.3, metalness: 0.06, clearcoat: 1, clearcoatRoughness: 0.035 },
  { id: 'matte', tileRepeat: 1, tileMix: 0, roughness: 0.88, metalness: 0.02, clearcoat: 0.15, clearcoatRoughness: 0.4 },
  { id: 'carbon', tile: 'carbon', tileRepeat: 12, tileMix: 0.9, roughness: 0.42, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 },
  { id: 'brushed', tile: 'brushed', tileRepeat: 9, tileMix: 0.82, roughness: 0.34, metalness: 0.92, clearcoat: 0.1, clearcoatRoughness: 0.25 },
  { id: 'ceramic', tileRepeat: 1, tileMix: 0, roughness: 0.12, metalness: 0.04, clearcoat: 1, clearcoatRoughness: 0.015 },
]

/** Чёрные элементы (решётка, диффузоры, молдинги): матовый пластик, не краска. */
export const CAR_TRIM = {
  color: '#0c0e10',
  roughness: 0.64,
  metalness: 0.05,
  clearcoat: 0.18,
  clearcoatRoughness: 0.3,
}

/** Салон: кожа/алькантара — тёмный, шероховатый, без лака. */
export const CAR_INTERIOR = {
  color: '#15161a',
  roughness: 0.82,
  metalness: 0,
}

/* Стекло отдаём отдельным материалом: зона синяя целиком, а прозрачность —
   свойство материала, а не пикселя. Transmission не берём: он гоняет
   дополнительный проход рендера, а на мобильных это дороже, чем выигрыш. */
export const CAR_GLASS = {
  color: '#0a0d11',
  roughness: 0.045,
  metalness: 0,
  opacity: 0.42,
  envMapIntensity: 1.6,
}

/*
 * Обод колеса: обычный металл, а не краска и не чёрные элементы кузова.
 * Отдельный материал нужен потому, что зона детали приходит из маски UV,
 * а у обода она своя (материал `M_Rim` на квадранте салона) — как краска
 * он не читается, а как салон получается чёрным. Цвет, шероховатость
 * и металличность — здесь, а не в зонах: узор, цвет и покрытие кузова
 * металл не трогают, как и стекло с оптикой.
 */
export const CAR_METAL = {
  color: '#d6dade',
  roughness: 0.28,
  metalness: 1,
  envMapIntensity: 1.15,
}

/*
 * Оптика: фары и стопы. Экспортёр помечает её именем (`lamp*`, `*emissive*`),
 * и только по имени она и опознаётся: стекло, которое никак не названо,
 * остаётся стеклом, а не фонарём. Оптика состоит из двух частей, и они разные:
 * колпак (`m_Lamp`) — прозрачное стекло, почти как остекление кузова, а внутри
 * за ним светятся отдельные элементы (`white_emissive` — фары, `red_emissive` —
 * стопы). Колпак не должен прятать то, что за ним, поэтому он и прозрачный,
 * и без записи глубины. Ни окраски, ни печати у оптики нет: выбор цвета
 * и покрытия машины оптику не трогает, иначе фары уезжали бы в узор вместе
 * с крыльями.
 */
export const CAR_LAMP = {
  /*
   * Колпак фары — диффузорное стекло с настоящим преломлением (transmission):
   * за ним виден смещённый по ИОР кадр сцены, а не просто «прозрачность».
   *
   * Толщина в кадре: transmission 0.86 (лёгкое отражение даже анфас — у
   * настоящего диффузора часть света возвращается), thickness 0.6 — заметный
   * сдвиг фона за стеклом, attenuation* — лёгкое зеленовато-голубое
   * поглощение в толще, как у поликарбоната. face 0.35 — плёнка молока
   * анфас (голые диоды сквозь неё не видны), по касательной колпак зеркалит
   * (edge) и ловит холодный блик кромки (rim) — по этому ободку фару и
   * узнают. Позиционное смещение фона рендерит отдельный проход у three —
   * цена уже заплачена тем, что колпаков в сцене полдюжины маленьких линз.
   */
  lens: {
    color: '#ffffff',
    roughness: 0.06,
    metalness: 0,
    transmission: 0.86,
    thickness: 0.6,
    attenuationDistance: 0.9,
    attenuationColor: '#dfeeea',
    /* Угловая добавка: анфас — лёгкая плёнка, по касательной — зеркало. */
    face: 0.35,
    edge: 0.85,
    rim: 0.5,
    rimTint: '#cfe3f2',
    ior: 1.52,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.8,
  },
  /*
   * Светящиеся элементы внутри колпака: белое вперёд, красное назад.
   *
   * Каждый остров оптики — не плоская наклейка, а чаша: шейдер выгибает
   * нормаль от центра острова к краю, поэтому отражатель ловит окружение
   * полосами, а свечение идёт от горячего ядра (dim — сколько остаётся у края,
   * ring — яркая полоса между ядром и краем). Без этого фара выглядела как
   * стекло с плоскими светящимися квадратами за ним.
   *
   * Яркость держится около единицы, а не выше: элемент светит без тонмаппинга
   * (`toneMapped: false`), всё что больше единицы — уже чистый белый. На прежней
   * яркости 3.2 площадка была выбелена целиком и ни ядро, ни чаша не читались.
   */
  glow: {
    front: { color: '#e9edf2', emissive: '#fff6e2', intensity: 1.15, dome: 1.2, dim: 0.25, ring: 0.55 },
    rear: { color: '#40060a', emissive: '#e01708', intensity: 1.3, dome: 1.2, dim: 0.25, ring: 0.6 },
    /* Сторона не названа и разделить нечем — свечение одно на всю оптику:
       свет тёплый и слабее, компромисс между фарами и стопами, а не красный
       фонарь спереди. */
    single: { color: '#e7e2d6', emissive: '#f6e8c6', intensity: 0.8, dome: 1.2, dim: 0.3, ring: 0.45 },
  },
}

/**
 * Плоскость раздела оптики: точка между осями и направление «вперёд».
 * Считается по самой машине (передний бампер против заднего), поэтому ни ось,
 * ни её знак в коде не зашиты — машина может лежать в модели как угодно.
 */
export interface CarLampSplit {
  origin: readonly [number, number, number]
  forward: readonly [number, number, number]
}

/**
 * Переносит разделитель из мировых координат в систему координат меша.
 * Бамперы считаются по сцене (мировые координаты), а геометрия фары лежит
 * в своих — со смещением ноды кузова, а это почти два метра по длине. Без
 * переноса мировая плоскость резала бы фару не там, где нужно, и вся оптика
 * оказывалась бы по одну сторону от неё — тогда разделение молча не работало
 * бы и фары светили бы стоповым цветом.
 *
 * `matrix` — обратная матрица мира меша: точка и направление едут через неё
 * двумя точками, поэтому разворот и масштаб ноды учитываются сами собой.
 */
export function lampSplitInMeshSpace(
  matrix: Pick<THREE.Matrix4, 'elements'>,
  split: CarLampSplit,
): CarLampSplit {
  const e = matrix.elements
  const point = (p: readonly [number, number, number]): [number, number, number] => {
    const [x, y, z] = p
    const w = e[3]! * x + e[7]! * y + e[11]! * z + e[15]!
    return [
      (e[0]! * x + e[4]! * y + e[8]! * z + e[12]!) / w,
      (e[1]! * x + e[5]! * y + e[9]! * z + e[13]!) / w,
      (e[2]! * x + e[6]! * y + e[10]! * z + e[14]!) / w,
    ]
  }

  const origin = point(split.origin)
  const ahead = point([
    split.origin[0] + split.forward[0],
    split.origin[1] + split.forward[1],
    split.origin[2] + split.forward[2],
  ])
  const [dx, dy, dz] = [ahead[0] - origin[0], ahead[1] - origin[1], ahead[2] - origin[2]]
  const length = Math.hypot(dx, dy, dz) || 1
  return { origin, forward: [dx / length, dy / length, dz / length] }
}

/** Куда попала точка оптики: в фары или в стопы. */
export function lampSide(
  point: readonly [number, number, number],
  split: CarLampSplit,
): 'front' | 'rear' {
  const [x, y, z] = point
  const [ox, oy, oz] = split.origin
  const [fx, fy, fz] = split.forward
  return (x - ox) * fx + (y - oy) * fy + (z - oz) * fz > 0 ? 'front' : 'rear'
}

/**
 * Разделитель по центрам переднего и заднего бампера. Совпавшие центры (деталь
 * одна на всю машину) разделителя не дают — тогда оптика остаётся цельной.
 */
export function lampSplitFromCenters(
  front: readonly [number, number, number],
  rear: readonly [number, number, number],
): CarLampSplit | null {
  const dx = front[0] - rear[0]
  const dy = front[1] - rear[1]
  const dz = front[2] - rear[2]
  const length = Math.hypot(dx, dy, dz)
  if (!Number.isFinite(length) || length < 1e-4) return null
  return {
    origin: [(front[0] + rear[0]) / 2, (front[1] + rear[1]) / 2, (front[2] + rear[2]) / 2],
    forward: [dx / length, dy / length, dz / length],
  }
}

/* Слова, по которым имя читается как оптика: `lamp_front`, `headlight_a`,
   `m_Taillight`, `white_emissive`. Проверка по вхождению, а не по началу:
   экспортёр ставит метку и в конец имени (`m_Glass_lamp`), и в начало. */
const LAMP_TAGS = ['lamp', 'light', 'emissive']

/* Светящийся элемент (то, что светит) отличаем от колпака (то, что закрывает
   стеклом) по имени: `white_emissive`, `m_GlowRear`, `drl`. Колпак называют
   `lamp`/`light`, и он делается прозрачным. */
const LAMP_GLOW_TAGS = ['emissive', 'glow', 'drl']

/** Светящийся ли это элемент оптики, а не стекло-колпак фары. */
export function isLampGlow(names: readonly string[]): boolean {
  return names.some((name) => {
    const lower = name.toLowerCase()
    return LAMP_GLOW_TAGS.some(tag => lower.includes(tag))
  })
}

/* Слова стороны в имени оптики: `lamp_front_a`, `headlight_left`, `m_Taillight`.
   Светящийся элемент называют и по цвету свечения: `white_emissive` — фары,
   `red_emissive` — стопы. Белое светит вперёд, красное назад — это и есть
   сторона, другой информации у такого имени нет. */
const LAMP_FRONT_TAGS = ['front', 'headlight', 'white']
const LAMP_REAR_TAGS = ['rear', 'back', 'tail', 'red']

/**
 * Сторона оптики по именам ноды и материала: `lamp_front_a`, `headlight_left` или
 * `m_Taillight` дают сторону прямо, `m_Lamp` (одна оптика на обе оси) — `'single'`,
 * всё остальное — `null`, то есть это не оптика.
 */
export function lampSideFromNames(names: readonly string[]): 'front' | 'rear' | 'single' | null {
  for (const name of names) {
    const lower = name.toLowerCase()
    if (!LAMP_TAGS.some(tag => lower.includes(tag))) continue
    if (LAMP_FRONT_TAGS.some(tag => lower.includes(tag))) return 'front'
    if (LAMP_REAR_TAGS.some(tag => lower.includes(tag))) return 'rear'
    return 'single'
  }
  return null
}

/**
 * Раскладывает треугольники оптики по сторонам. Фары и стопы лежат в одной
 * геометрии, и различает их только положение на машине, поэтому геометрия не
 * делится на две: меняется порядок индексов (фары первыми), а материалы
 * подключаются группами. Пусто, если вся оптика оказалась с одной стороны.
 */
export function planLampSplit(
  position: Pick<THREE.BufferAttribute, 'count' | 'getX' | 'getY' | 'getZ'>,
  index: ArrayLike<number> | null,
  split: CarLampSplit,
): { front: number[], rear: number[] } | null {
  const indices: number[] = []
  const total = index ? index.length : position.count
  for (let i = 0; i < total; i++) indices.push(index ? index[i] as number : i)

  const front: number[] = []
  const rear: number[] = []
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i] as number
    const b = indices[i + 1] as number
    const c = indices[i + 2] as number
    const point: [number, number, number] = [
      (position.getX(a) + position.getX(b) + position.getX(c)) / 3,
      (position.getY(a) + position.getY(b) + position.getY(c)) / 3,
      (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3,
    ]
    const bucket = lampSide(point, split) === 'front' ? front : rear
    bucket.push(a, b, c)
  }

  if (front.length === 0 || rear.length === 0) return null
  return { front, rear }
}

/**
 * Оптика приходит из GLB набором отдельных плоских островов: колпак — шесть
 * линз, светящиеся элементы — сотня мелких площадок. И имя, и материал у них
 * общие на всю фару, а чтобы выгнуть площадку чашей, шейдеру нужно знать две
 * вещи про каждую вершину: где она стоит внутри своего острова и в какую
 * сторону у острова «длинная» ось. То и другое считается здесь и кладётся
 * атрибутами — шейдеру остаётся только выгнуть нормаль.
 *
 * Координата нормирована на длинную сторону острова, а не на каждую ось
 * отдельно: тонкая полоса стопа тогда остаётся полосой (ядро тянется по
 * длине), а не превращается в квадратную заплату с ядром по центру.
 */
export interface LampIslands {
  /* По два числа на вершину: смещение внутри острова, в его же масштабе. */
  uv: Float32Array
  /* По три числа на вершину: единичное направление длинной оси острова. */
  axis: Float32Array
}

const ISLAND_AXES: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]

/**
 * Раскладывает геометрию оптики по островам (связным кускам, не имеющим общих
 * вершин) и отдаёт на каждую вершину её место внутри острова и длинную ось.
 * Разрывов у оптики хватает: у этой машины колпак — шесть отдельных линз,
 * а элементы фар — сотня отдельных квадов. `null`, если треугольники не найти.
 */
export function lampIslandAttributes(
  position: Pick<THREE.BufferAttribute, 'count' | 'getX' | 'getY' | 'getZ'>,
  index: ArrayLike<number> | null,
): LampIslands | null {
  const count = position.count
  const total = index ? index.length : count
  if (count === 0 || total < 3) return null

  const parent = new Int32Array(count)
  for (let i = 0; i < count; i++) parent[i] = i
  const find = (start: number): number => {
    let node = start
    while (parent[node] !== node) node = parent[node] as number
    return node
  }
  const union = (a: number, b: number): void => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[rootB] = rootA
  }

  for (let i = 0; i + 2 < total; i += 3) {
    const a = index ? index[i] as number : i
    const b = index ? index[i + 1] as number : i + 1
    const c = index ? index[i + 2] as number : i + 2
    if (a >= count || b >= count || c >= count) continue
    union(a, b)
    union(b, c)
  }

  /* Габарит каждого острова: по нему и центр, и масштаб, и длинная ось. */
  interface Island { min: [number, number, number], max: [number, number, number] }
  const islands = new Map<number, Island>()
  for (let i = 0; i < count; i++) {
    const root = find(i)
    let island = islands.get(root)
    if (!island) {
      island = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
      islands.set(root, island)
    }
    const point = [position.getX(i), position.getY(i), position.getZ(i)]
    for (let axis = 0; axis < 3; axis++) {
      const value = point[axis] as number
      if (value < island.min[axis]!) island.min[axis] = value
      if (value > island.max[axis]!) island.max[axis] = value
    }
  }

  /* Длинная ось: она задаёт и ось чаши, и масштаб координаты. */
  const basis = new Map<number, { longest: number, scale: number, center: [number, number, number] }>()
  for (const [root, island] of islands) {
    const sizes = [0, 1, 2].map(axis => (island.max[axis] as number) - (island.min[axis] as number))
    const longest = sizes[0]! >= sizes[1]! && sizes[0]! >= sizes[2]! ? 0 : (sizes[1]! >= sizes[2]! ? 1 : 2)
    basis.set(root, {
      longest,
      /* Нулевой остров (вырожденные вершины) не должен делить на ноль. */
      scale: (sizes[longest] as number) > 1e-6 ? sizes[longest] as number : 1,
      center: [0, 1, 2].map(axis => ((island.min[axis] as number) + (island.max[axis] as number)) / 2) as [number, number, number],
    })
  }

  const uv = new Float32Array(count * 2)
  const axis = new Float32Array(count * 3)
  /* Вторая ось площадки — любая поперечная длинной: чаше нужен только каркас. */
  const crossAxis: readonly [number, number, number] = [0, 1, 0]
  for (let i = 0; i < count; i++) {
    const root = find(i)
    const info = basis.get(root) ?? { longest: 0, scale: 1, center: [0, 0, 0] as [number, number, number] }
    const point = [position.getX(i), position.getY(i), position.getZ(i)]
    const across = (info.longest + 1) % 3
    uv[i * 2] = ((point[info.longest] as number) - info.center[info.longest]!) / info.scale
    uv[i * 2 + 1] = ((point[across] as number) - info.center[across]!) / info.scale
    const direction = ISLAND_AXES[info.longest] ?? crossAxis
    axis[i * 3] = direction[0]
    axis[i * 3 + 1] = direction[1]
    axis[i * 3 + 2] = direction[2]
  }

  return { uv, axis }
}

/**
 * Разделитель по загруженной сцене: передний и задний бампер задают
 * направление «вперёд», середина между ними — плоскость раздела. Уровни
 * детализации, где бамперов уже нет (в LOD1/LOD2 остаётся один кузов), берут
 * готовый разделитель у подробного уровня — машина в них та же.
 */
export function lampSplitFromBumpers(
  three: typeof import('three'),
  root: THREE.Object3D,
): CarLampSplit | null {
  const front: [number, number, number][] = []
  const rear: [number, number, number][] = []

  const centerOf = (object: THREE.Object3D): [number, number, number] => {
    const center = new three.Box3().setFromObject(object).getCenter(new three.Vector3())
    return [center.x, center.y, center.z]
  }

  root.traverse((object) => {
    const name = object.name.toLowerCase()
    if (name.startsWith('bumper_front')) front.push(centerOf(object))
    else if (name.startsWith('bumper_rear')) rear.push(centerOf(object))
  })

  if (front.length === 0 || rear.length === 0) return null

  const average = (points: [number, number, number][]): [number, number, number] => [
    points.reduce((sum, point) => sum + point[0], 0) / points.length,
    points.reduce((sum, point) => sum + point[1], 0) / points.length,
    points.reduce((sum, point) => sum + point[2], 0) / points.length,
  ]

  return lampSplitFromCenters(average(front), average(rear))
}

export interface CarSelection {
  color: string
  pattern: string
  /* Множитель масштаба узора: 1 — как в файле. */
  scale: number
  coverage: string
}

/* Стартовое состояние — «без цвета» под печатью «Сакура»: кейс открывается
   материалом ровно таким, каким его отдал заказчик, и первым в списке печатей
   стоит самый спокойный из узоров. Цвет и узор взаимоисключающие
   (`withPaint`): выбранный цвет — чистая краска без печати. */
export function defaultCarSelection(): CarSelection {
  return {
    color: resolveColor('none').id,
    pattern: resolvePattern('cherry').id,
    scale: 1,
    coverage: resolveCoverage('gloss').id,
  }
}

export function resolveColor(id: string): CarPaintColor {
  return CAR_PAINT_COLORS.find(color => color.id === id) ?? CAR_PAINT_COLORS[0] as CarPaintColor
}

export function resolvePattern(id: string): CarPattern {
  return CAR_PATTERNS.find(pattern => pattern.id === id) ?? CAR_PATTERNS[0] as CarPattern
}

export function resolveCoverage(id: string): CarCoverage {
  return CAR_COVERAGES.find(coverage => coverage.id === id) ?? CAR_COVERAGES[0] as CarCoverage
}

/*
 * Цвет и узор взаимоисключающие: выбранный цвет снимает узор, выбранный узор
 * снимает цвет — на кузове либо чистая краска, либо печать как в файле, без
 * тонировки поверх неё. «Без цвета» и «без узора» другую ось не трогают.
 * Покрытие и масштаб от этого не зависят.
 */
export function withPaint(
  selection: CarSelection,
  kind: 'color' | 'pattern' | 'coverage',
  id: string,
): CarSelection {
  const next = { ...selection, [kind]: id }
  if (kind === 'color' && id !== 'none') next.pattern = 'none'
  if (kind === 'pattern' && id !== 'none') next.color = 'none'
  return next
}

/** Папка кейса с моделями: тот же путь, что у GLB, без имени файла. */
export function carModelBase(modelSrc: string): string {
  return modelSrc.replace(/\/[^/]+$/, '')
}

/** Тайловые карты лежат рядом с GLB, в подпапке textures. */
export function carTextureBase(modelSrc: string): string {
  return `${carModelBase(modelSrc)}/textures`
}

export interface CarMaterialOptions {
  textureBase: string
  /** Анизотропия для тайла: у GLB-карт её взять неоткуда. */
  anisotropy?: number
  selection?: CarSelection
  /* Разделитель оптики. `undefined` — посчитать по самой модели; `null` —
     разделителя нет (уровни без бамперов берут готовый у подробного). */
  lampSplit?: CarLampSplit | null
  /* Готовый кэш тайловых карт. Уровни детализации делят один: карты у них общие,
     а каждая загрузка — это отдельная текстура в видеопамяти (2048² ≈ 22 МБ
     с мипмапами), поэтому три уровня не должны тянуть один узор трижды. */
  tileCache?: Map<string, THREE.Texture>
  /* Имена нод колёс из манифеста: только внутри них материал с `rim`/`metal`
     в имени становится металлом. Без списка металл не ищем — тот же `M_Rim`
     на кузове означает краску по маске. */
  wheelNodes?: readonly string[]
}

/**
 * Хендл материалов: все инстансы под обновление юниформов плюс кэш загруженных
 * карт. Живёт вместе с закэшированной сценой, поэтому смена языка не грузит
 * текстуры заново.
 */
export interface CarMaterialHandle {
  /* Движок держим в хендле: смена окраски догружает тайл уже после загрузки
     модели, а повторный `import('three')` при смене языка ничего не стоит. */
  three: typeof import('three')
  materials: THREE.MeshPhysicalMaterial[]
  /* Оптика: фары и стопы. Живут отдельно от зонных материалов — цвет и покрытие
     кузова на них не распространяются, зато свечение можно включать отдельно. */
  lamps: THREE.MeshPhysicalMaterial[]
  mask: THREE.Texture | null
  neutral: THREE.DataTexture
  tiles: Map<string, THREE.Texture>
  textureBase: string
  anisotropy: number
  selection: CarSelection
}

/* Юниформы зонного шейдера. Типизированы явно: обращение по строковому ключу
   теряло бы `| undefined` на каждом поле и требовало кастов при каждой записи. */
interface CarUniforms {
  uPaintColor: { value: THREE.Color }
  uPaintRoughness: { value: number }
  uPaintMetalness: { value: number }
  uPaintClearcoat: { value: number }
  uPaintClearcoatRoughness: { value: number }
  uTrimColor: { value: THREE.Color }
  uTrimRoughness: { value: number }
  uTrimMetalness: { value: number }
  uTrimClearcoat: { value: number }
  uTrimClearcoatRoughness: { value: number }
  uInteriorColor: { value: THREE.Color }
  uInteriorRoughness: { value: number }
  uInteriorMetalness: { value: number }
  /* Detail-карта покрытия (карбон, шлифовка) — умножается на цвет краски. */
  uCoverTex: { value: THREE.Texture }
  uCoverRepeat: { value: number }
  uCoverMix: { value: number }
  /* Карта узора — ложится поверх покрытия. */
  uPatternTex: { value: THREE.Texture }
  uPatternRepeat: { value: number }
  /* 1 — печать включена. */
  uPatternOn: { value: number }
  /* Насколько цвет кузова подмешивается к печати; 0 при «без цвета». */
  uPatternTint: { value: number }
}

/* Значения по умолчанию: тот же набор, что у покрытия «Краска» — но без тайла. */
function createUniforms(three: typeof import('three'), neutral: THREE.DataTexture): CarUniforms {
  return {
    uPaintColor: { value: new three.Color() },
    uPaintRoughness: { value: 0.3 },
    uPaintMetalness: { value: 0.06 },
    uPaintClearcoat: { value: 1 },
    uPaintClearcoatRoughness: { value: 0.035 },
    uTrimColor: { value: new three.Color(CAR_TRIM.color) },
    uTrimRoughness: { value: CAR_TRIM.roughness },
    uTrimMetalness: { value: CAR_TRIM.metalness },
    uTrimClearcoat: { value: CAR_TRIM.clearcoat },
    uTrimClearcoatRoughness: { value: CAR_TRIM.clearcoatRoughness },
    uInteriorColor: { value: new three.Color(CAR_INTERIOR.color) },
    uInteriorRoughness: { value: CAR_INTERIOR.roughness },
    uInteriorMetalness: { value: CAR_INTERIOR.metalness },
    uCoverTex: { value: neutral },
    uCoverRepeat: { value: 1 },
    uCoverMix: { value: 0 },
    uPatternTex: { value: neutral },
    uPatternRepeat: { value: 1 },
    uPatternOn: { value: 0 },
    uPatternTint: { value: 0 },
  }
}

/*
 * Правка шейдера. Три точки инъекции:
 *  1. после map_fragment — зона по маске, цвет зоны, detail-карта и узор;
 *  2. после metalnessmap_fragment — roughness/metalness/clearcoat зоны
 *     (roughnessFactor и metalnessFactor — обычные локальные переменные);
 *  3. вместо lights_physical_fragment — подстановка clearcoat: это юниформ,
 *     а юниформам в GLSL присваивать нельзя, поэтому имя переменной меняем
 *     прямо в чанке.
 */
function patchMaterial(
  three: typeof import('three'),
  material: THREE.MeshPhysicalMaterial,
  uniforms: CarUniforms,
): void {
  material.roughness = 1
  material.normalMap = null
  material.color.setRGB(1, 1, 1)

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vCarUv;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
  vCarUv = uv;`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vCarUv;
uniform vec3 uPaintColor;
uniform vec3 uTrimColor;
uniform vec3 uInteriorColor;
uniform float uPaintRoughness;
uniform float uPaintMetalness;
uniform float uPaintClearcoat;
uniform float uPaintClearcoatRoughness;
uniform float uTrimRoughness;
uniform float uTrimMetalness;
uniform float uTrimClearcoat;
uniform float uTrimClearcoatRoughness;
uniform float uInteriorRoughness;
uniform float uInteriorMetalness;
uniform sampler2D uCoverTex;
uniform float uCoverRepeat;
uniform float uCoverMix;
uniform sampler2D uPatternTex;
uniform float uPatternRepeat;
uniform float uPatternOn;
uniform float uPatternTint;

/* Тайл по основной развёртке (UV0): рисунок следует островам UV детали.
   repeat — тайлов на единицу UV (см. UV_REPEAT_PER_METER). */
vec3 carUvTile( sampler2D map, float repeat ) {
  return texture2D( map, vCarUv * repeat ).rgb;
}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  /* Маска приходит в diffuseColor как baseColorTexture; её цвета — это зоны,
     а не оттенки, поэтому rgb перекрываем целиком. */
  vec3 carMask = diffuseColor.rgb;
  float carR = step( 0.5, carMask.r );
  float carG = step( 0.5, carMask.g );
  float carB = step( 0.5, carMask.b );
  float carIsPaint = carR * ( 1.0 - carG ) * ( 1.0 - carB );
  float carIsInterior = carG * ( 1.0 - carR ) * ( 1.0 - carB );
  float carIsTrim = 1.0 - carIsPaint - carIsInterior;
  /* Порядок как у настоящей окраски: цвет кузова, затем detail-карта покрытия
     («затемнить»), затем узор поверх всего. Покрытие остаётся свободным —
     узор не привязан к нему и ложится на любое. */
  vec3 carCover = carUvTile( uCoverTex, uCoverRepeat );
  vec3 carPaint = uPaintColor * mix( vec3( 1.0 ), carCover, uCoverMix );
  if ( uPatternOn > 0.0 ) {
    /* Печать приносит собственный цвет целиком: с ней ничего не складывается.
       Цвет кузова только подмешивается (uPatternTint), а «без цвета» — белый —
       тождество, поэтому узор ложится ровно таким, каким лежит в файле.
       Рельефную карту покрытия сюда не тянем: печать непрозрачная, карбон
       съел бы рисунок, а характер отделки задают roughness / metalness / лак. */
    vec3 carPattern = carUvTile( uPatternTex, uPatternRepeat );
    carPaint = carPattern * mix( vec3( 1.0 ), uPaintColor, uPatternTint );
  }
  diffuseColor.rgb = carPaint * carIsPaint + uInteriorColor * carIsInterior + uTrimColor * carIsTrim;`,
      )
      .replace(
        '#include <metalnessmap_fragment>',
        `#include <metalnessmap_fragment>
  roughnessFactor = mix( mix( uTrimRoughness, uInteriorRoughness, carIsInterior ), uPaintRoughness, carIsPaint );
  metalnessFactor = mix( mix( uTrimMetalness, uInteriorMetalness, carIsInterior ), uPaintMetalness, carIsPaint );
  float carClearcoat = mix( mix( uTrimClearcoat, 0.12, carIsInterior ), uPaintClearcoat, carIsPaint );
  float carClearcoatRoughness = mix( mix( uTrimClearcoatRoughness, 0.55, carIsInterior ), uPaintClearcoatRoughness, carIsPaint );`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        three.ShaderChunk.lights_physical_fragment
          .replace('material.clearcoat = clearcoat;', 'material.clearcoat = carClearcoat;')
          .replace('material.clearcoatRoughness = clearcoatRoughness;', 'material.clearcoatRoughness = carClearcoatRoughness;'),
      )
  }

  material.customProgramCacheKey = () => 'car-zones'
  material.needsUpdate = true
}

/** Имена ноды и всех её родителей: по ним отличаем стёкла от оптики. */
/* Слова, по которым материал внутри колеса читается как металл: `M_Rim`,
   `rim_metal`, `chrome`, `alloy`, `brake_disc`. Шина названа иначе (`M-Tire`),
   в набор не попадает и остаётся чёрной резиной — ровно то разделение, которое
   на колесе и нужно. */
const METAL_TAGS = ['rim', 'disc', 'metal', 'chrome', 'alloy']

/**
 * Металл ли деталь по её именам (нода и материал). Правило применяется только
 * внутри нод колёс: тот же `M_Rim` на кузове — это краска, покрашенная
 * по маске, а не металл.
 */
export function isWheelMetal(names: readonly string[]): boolean {
  return names.some(name => METAL_TAGS.some(tag => name.toLowerCase().includes(tag)))
}

function nodeNames(object: THREE.Object3D): string[] {
  const names: string[] = []
  let node: THREE.Object3D | null = object
  while (node) {
    names.push(node.name)
    node = node.parent
  }
  return names
}

/**
 * Обод: светлый металл, отражающий окружение. Прозрачности и свечения у него
 * нет — это обычная деталь, просто из металла, а не из краски.
 */
function wheelMetal(
  three: typeof import('three'),
  source: THREE.Material,
): THREE.MeshPhysicalMaterial {
  const material = new three.MeshPhysicalMaterial({
    color: new three.Color(CAR_METAL.color),
    roughness: CAR_METAL.roughness,
    metalness: CAR_METAL.metalness,
    envMapIntensity: CAR_METAL.envMapIntensity,
    side: source.side,
  })
  material.userData.carMetal = 'wheel'
  return material
}

/**
 * Колпак фары: толстое стекло с преломлением (transmission) и угловой
 * прозрачностью. Прямо он почти невидим, по касательной зеркалит и ловит
 * холодный блик кромки — то, по чему фару и узнают. Материал один на всю
 * оптику меша: сторона на стекло не влияет, делить его незачем.
 *
 * Преломление даёт transmission: three рисует непрозрачную сцену в отдельную
 * цель и подставляет её в колпак со смещением по ИОР и толщине — фон за
 * стеклом съезжает, как у настоящего. Поверх него шейдер добавляет френель
 * от угла (face→edge) и блик кромки. Без записи глубины: иначе колпак прятал
 * бы светящиеся элементы, стоящие за ним.
 */
function lampLens(
  three: typeof import('three'),
  source: THREE.Material,
): THREE.MeshPhysicalMaterial {
  const material = new three.MeshPhysicalMaterial({
    color: new three.Color(CAR_LAMP.lens.color),
    roughness: CAR_LAMP.lens.roughness,
    metalness: CAR_LAMP.lens.metalness,
    transparent: true,
    opacity: 1,
    transmission: CAR_LAMP.lens.transmission,
    thickness: CAR_LAMP.lens.thickness,
    attenuationDistance: CAR_LAMP.lens.attenuationDistance,
    attenuationColor: new three.Color(CAR_LAMP.lens.attenuationColor),
    ior: CAR_LAMP.lens.ior,
    clearcoat: CAR_LAMP.lens.clearcoat,
    clearcoatRoughness: CAR_LAMP.lens.clearcoatRoughness,
    envMapIntensity: CAR_LAMP.lens.envMapIntensity,
    depthWrite: false,
    /* side берём у исходного материала: оптика может быть двусторонней. */
    side: source.side,
  })
  material.userData.carLamp = 'lens'
  patchLampLens(three, material)
  return material
}

/**
 * Стекло колпака в шейдере: альфа по френелю плюс холодный блик кромки.
 * Врезаемся в `opaque_fragment`: к этому месту `normal` и `vViewPosition`
 * уже посчитаны, `outgoingLight` собран из бликов и отражений, а `diffuseColor.a`
 * ещё можно поменять до записи пикселя. Тонмаппинг идёт следом — блик кромки
 * живёт по общим правилам сцены, как настоящее отражение.
 */
function patchLampLens(
  three: typeof import('three'),
  material: THREE.MeshPhysicalMaterial,
): void {
  const uniforms = {
    uLensFace: { value: CAR_LAMP.lens.face },
    uLensEdge: { value: CAR_LAMP.lens.edge },
    uLensRim: { value: CAR_LAMP.lens.rim },
    uLensTint: { value: new three.Color(CAR_LAMP.lens.rimTint) },
  }

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uLensFace;
uniform float uLensEdge;
uniform float uLensRim;
uniform vec3 uLensTint;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `/* Френель: 0 — смотрим прямо на стекло, 1 — скользим по касательной. */
  float lampCos = saturate( dot( normal, normalize( vViewPosition ) ) );
  float lampFresnel = pow( 1.0 - lampCos, 5.0 );
  diffuseColor.a = mix( uLensFace, uLensEdge, lampFresnel );
  outgoingLight += uLensTint * ( lampFresnel * uLensRim );
  #include <opaque_fragment>`,
      )
  }

  material.customProgramCacheKey = () => 'car-lamp-lens'
  material.needsUpdate = true
}

/**
 * Светящийся элемент оптики: светит сам, колпак над ним только стекло.
 * `single` — когда сторону развести нечем.
 *
 * `toneMapped: false` — фонарь не проходит через плёночный тонмаппинг сцены:
 * это источник света, а не поверхность под освещением. С тонмаппингом яркий
 * красный выцветал в розовый, белый уходил в серый и стопа не читались
 * горящими.
 */
function lampGlow(
  three: typeof import('three'),
  source: THREE.Material,
  side: 'front' | 'rear' | 'single',
): THREE.MeshPhysicalMaterial {
  const glow = CAR_LAMP.glow[side]
  const material = new three.MeshPhysicalMaterial({
    color: new three.Color(glow.color),
    emissive: new three.Color(glow.emissive),
    emissiveIntensity: glow.intensity,
    /* Металл не ради блеска: у настоящего отражателя поверхность зеркальная,
       и чаша без металличности отражает окружение вполсилы — фара остаётся
       плоской наклейкой. Шероховатость чуть выше нуля, чтобы блики читались
       полосами, а не одной точкой. */
    roughness: 0.24,
    metalness: 0.6,
    toneMapped: false,
    side: source.side,
  })
  material.userData.carLamp = side
  return material
}

/**
 * Отражатель и ядро свечения в шейдере светящегося элемента. Остров оптики
 * выгибается чашей: нормаль уводится от нормали площадки к её краю (dome),
 * и отражение окружения ложится по чаше — то, что у настоящей фары делает
 * отражатель. Свечение при этом идёт от горячего центра к тусклому краю (dim),
 * а между ними проходит яркая полоса модуля (ring).
 *
 * Каркас чаши берётся из атрибутов вершин (`carLampUv`, `carLampAxis`), их
 * кладёт `applyLampIslands`: без них нормаль не выгнуть — острова в геометрии
 * лишены развёртки, а мировая проекция не знает, где у площадки центр.
 */
function patchLampGlow(material: THREE.MeshPhysicalMaterial): void {
  const uniforms = {
    uGlowDome: { value: CAR_LAMP.glow.front.dome },
    uGlowDim: { value: CAR_LAMP.glow.front.dim },
    uGlowRing: { value: CAR_LAMP.glow.front.ring },
  }

  material.onBeforeCompile = (shader) => {
    const side = material.userData.carLamp as 'front' | 'rear' | 'single' | undefined
    const glow = CAR_LAMP.glow[side ?? 'single']
    uniforms.uGlowDome.value = glow.dome
    uniforms.uGlowDim.value = glow.dim
    uniforms.uGlowRing.value = glow.ring
    Object.assign(shader.uniforms, uniforms)

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 carLampUv;
attribute vec3 carLampAxis;
varying vec2 vLampUv;
varying vec3 vLampAxisV;
varying vec3 vLampPlateV;`,
      )
      .replace(
        '#include <defaultnormal_vertex>',
        `#include <defaultnormal_vertex>
  vLampUv = carLampUv;
  vLampAxisV = normalize( normalMatrix * carLampAxis );
  vLampPlateV = normalize( transformedNormal );`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uGlowDome;
uniform float uGlowDim;
uniform float uGlowRing;
varying vec2 vLampUv;
varying vec3 vLampAxisV;
varying vec3 vLampPlateV;

/* Насколько далеко вершина от центра своего острова. Координата нормирована
   на длинную сторону, поэтому у полосы ядро вытягивается по длине. */
float carGlowRadius() {
  return length( vLampUv );
}

/* Нормаль чаши: каркас строится по нормали площадки и её длинной оси. */
vec3 carGlowBowl() {
  vec3 plate = normalize( vLampPlateV );
  vec3 along = vLampAxisV - plate * dot( plate, vLampAxisV );
  along = length( along ) > 1e-5 ? normalize( along ) : normalize( cross( plate, vec3( 0.0, 1.0, 0.0 ) ) );
  vec3 across = cross( plate, along );
  float radius = min( 1.0, carGlowRadius() );
  float dome = sqrt( max( 0.0, 1.0 - radius * radius ) );
  return normalize( along * vLampUv.x + across * vLampUv.y + plate * ( uGlowDome * dome ) );
}`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
  /* Отражатель вместо плоскости: косые блики читаются чашей. */
  normal = carGlowBowl() * faceDirection;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  /* Ядро, полоса модуля и тусклый край — вместо равномерной заливки. */
  float lampRadius = min( 1.0, carGlowRadius() );
  float lampCore = 1.0 - smoothstep( 0.0, 0.9, lampRadius );
  float lampRing = smoothstep( 0.45, 0.8, lampRadius ) * ( 1.0 - smoothstep( 0.85, 1.0, lampRadius ) );
  totalEmissiveRadiance *= mix( uGlowDim, 1.0, lampCore );
  totalEmissiveRadiance += emissive * ( uGlowRing * lampRing );`,
      )
  }

  material.customProgramCacheKey = () => 'car-lamp-glow'
  material.needsUpdate = true
}

/**
 * Кладёт на геометрию оптики атрибуты островов (`carLampUv`, `carLampAxis`)
 * один раз на геометрию. `false`, если считать не по чему — тогда вызывающий
 * оставляет материал без шейдера оптики, а не рисует чашу по нулям.
 */
function applyLampIslands(three: typeof import('three'), mesh: THREE.Mesh): boolean {
  const geometry = mesh.geometry as THREE.BufferGeometry
  const position = geometry.attributes?.position as THREE.BufferAttribute | undefined
  if (!position) return false
  if (geometry.getAttribute('carLampUv')) return true

  const islands = lampIslandAttributes(position, geometry.index ? geometry.index.array : null)
  if (!islands) return false

  geometry.setAttribute('carLampUv', new three.BufferAttribute(islands.uv, 2))
  geometry.setAttribute('carLampAxis', new three.BufferAttribute(islands.axis, 3))
  return true
}

/**
 * Разводит оптику меша на фары и стопы: порядок индексов плюс две группы.
 * Копировать вершины не нужно — геометрия остаётся одна, а рисовать её будут
 * два материала. `false`, если делить нечего (вся оптика с одной стороны).
 */
function applyLampSplit(mesh: THREE.Mesh, split: CarLampSplit | null): boolean {
  if (!split) return false

  const geometry = mesh.geometry as THREE.BufferGeometry
  const position = geometry.attributes?.position
  if (!position) return false

  /* Мировые матрицы могут быть ещё не посчитаны (модель только что собрана),
     поэтому обновляем их до переноса разделителя в систему меша. */
  mesh.updateWorldMatrix(true, false)
  const local = lampSplitInMeshSpace(mesh.matrixWorld.clone().invert(), split)
  const plan = planLampSplit(position, geometry.index ? geometry.index.array : null, local)
  if (!plan) return false

  geometry.setIndex([...plan.front, ...plan.rear])
  geometry.clearGroups()
  geometry.addGroup(0, plan.front.length, 0)
  geometry.addGroup(plan.front.length, plan.rear.length, 1)
  return true
}

function zoneMaterial(
  three: typeof import('three'),
  source: THREE.Material,
  uniforms: CarUniforms,
  neutral: THREE.DataTexture,
  mask: THREE.Texture | null,
): THREE.MeshPhysicalMaterial {
  const material = new three.MeshPhysicalMaterial({
    /* side берём у исходного материала: у кузова он doubleSided. */
    side: source.side,
    transparent: false,
  })
  material.map = mask
  material.userData.carNeutral = neutral
  material.userData.carUniforms = uniforms
  patchMaterial(three, material, uniforms)
  return material
}

/**
 * Собирает материалы кузова и вешает их на меши модели. Стекло получает
 * отдельный прозрачный материал, оптика — непрозрачную линзу со свечением,
 * всё остальное — зонный шейдер. Настройки у всех мешей одни и те же:
 * комплектация меняет только геометрию, материал (цвет, узор, покрытие)
 * остаётся общим.
 */
export function createCarMaterials(
  three: typeof import('three'),
  root: THREE.Object3D,
  options: CarMaterialOptions,
): CarMaterialHandle {
  const anisotropy = options.anisotropy ?? 4
  const selection = options.selection ?? defaultCarSelection()
  /* Разделитель оптики: у подробного уровня его дают бамперы, у остальных —
     уже посчитанный (в LOD1/LOD2 бамперов в модели нет). */
  const lampSplit = options.lampSplit !== undefined
    ? options.lampSplit
    : lampSplitFromBumpers(three, root)

  /* Нейтральная белая карта: и как «нет узора», и как заглушка для сэмплера. */
  const neutral = new three.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
  neutral.needsUpdate = true
  neutral.colorSpace = three.NoColorSpace

  /* Маску (baseColorTexture) все три материала делят одну — берём первую
     попавшуюся. Собираем в массив, а не в `let`: присваивание внутри
     колбэка TS не отслеживает и сузил бы переменную до null. */
  const maskSources: THREE.Texture[] = []
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    const first = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const map = first ? (first as THREE.MeshStandardMaterial).map : null
    if (map) maskSources.push(map)
  })
  const mask: THREE.Texture | null = maskSources[0] ?? null

  /* Маска — это таблица зон, а не картинка: мипмапы усреднили бы четыре
     квадранта в серый, поэтому фильтрация строго ближайшая. */
  if (mask) {
    mask.generateMipmaps = false
    mask.minFilter = three.NearestFilter
    mask.magFilter = three.NearestFilter
    mask.wrapS = three.ClampToEdgeWrapping
    mask.wrapT = three.ClampToEdgeWrapping
    mask.needsUpdate = true
  }

  const materials: THREE.MeshPhysicalMaterial[] = []
  const glassMaterials: THREE.MeshPhysicalMaterial[] = []
  const lamps: THREE.MeshPhysicalMaterial[] = []

  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return

    const originals = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const lampSource = originals[0]

    /* Оптика — только та, что названа: нода или материал со словом `lamp`,
       `light` или `emissive` (`lamp_front`, `m_LampRear`, `white_emissive`).
       Имя говорит и сторону, и что это: колпак или светящийся элемент. */
    const lampNames = [
      ...nodeNames(mesh),
      ...originals.map(source => source?.name ?? ''),
    ]
    const lampHint = lampSideFromNames(lampNames)
    if (lampSource && lampHint) {
      if (isLampGlow(lampNames)) {
        /* Светящийся элемент: сторона из имени, а если её не назвали — пробуем
           разделить геометрию (в примитиве с одной меткой на обе оси и правда
           только фары и стопы). */
        const created: THREE.MeshPhysicalMaterial[] = []
        if (lampHint === 'front' || lampHint === 'rear') {
          const material = lampGlow(three, lampSource, lampHint)
          mesh.material = material
          created.push(material)
        }
        else if (applyLampSplit(mesh, lampSplit)) {
          const front = lampGlow(three, lampSource, 'front')
          const rear = lampGlow(three, lampSource, 'rear')
          mesh.material = [front, rear]
          created.push(front, rear)
        }
        else {
          const single = lampGlow(three, lampSource, 'single')
          mesh.material = single
          created.push(single)
        }

        /* Чаша отражателя возможна только там, где есть острова: без атрибутов
           шейдер не знает, где у площадки центр. Нет островов — оставляем
           ровное свечение, а не чёрные нормали. */
        if (applyLampIslands(three, mesh)) {
          for (const material of created) patchLampGlow(material)
        }
        lamps.push(...created)
        return
      }

      /* Колпак фары — стекло: цвет, узор и покрытие кузова его не трогают. */
      const lens = lampLens(three, lampSource)
      mesh.material = lens
      lamps.push(lens)
      return
    }

    /* Обод колеса: внутри колёс металл — отдельный материал, иначе он рисуется
       зоной своей маски (у `M_Rim` это салон, то есть чёрный). */
    const names = nodeNames(mesh)
    const wheelNames = options.wheelNodes ?? []
    const onWheel = wheelNames.length > 0 && names.some(name => wheelNames.includes(name))
    if (lampSource && onWheel && isWheelMetal([...names, ...lampNames])) {
      const metal = wheelMetal(three, lampSource)
      mesh.material = metal
      materials.push(metal)
      return
    }

    const next = originals.map((source) => {
      const name = (source?.name ?? '').toLowerCase()
      if (name.includes('glass')) {
        const glass = new three.MeshPhysicalMaterial({
          color: new three.Color(CAR_GLASS.color),
          roughness: CAR_GLASS.roughness,
          metalness: CAR_GLASS.metalness,
          transparent: true,
          opacity: CAR_GLASS.opacity,
          side: source.side,
          depthWrite: false,
          envMapIntensity: CAR_GLASS.envMapIntensity,
          clearcoat: 1,
          clearcoatRoughness: 0.02,
        })
        glassMaterials.push(glass)
        materials.push(glass)
        return glass
      }

      const uniforms = createUniforms(three, neutral)
      const material = zoneMaterial(three, source, uniforms, neutral, mask)
      materials.push(material)
      return material
    })

    mesh.material = Array.isArray(mesh.material) ? next : next[0] as THREE.MeshPhysicalMaterial
  })

  const handle: CarMaterialHandle = {
    three,
    materials,
    lamps,
    mask,
    neutral,
    tiles: options.tileCache ?? new Map(),
    textureBase: options.textureBase,
    anisotropy,
    selection,
  }

  applySelection(handle, selection, null, null)
  return handle
}

/* Раскладывает выбранные цвет, узор и покрытие по юниформам. Карта может быть
   ещё не загружена (или её нет у этого варианта) — тогда ось просто не влияет
   на материал: краска остаётся гладкой, узор не появляется. */
function applySelection(
  handle: CarMaterialHandle,
  selection: CarSelection,
  cover: THREE.Texture | null,
  pattern: THREE.Texture | null,
): void {
  const color = resolveColor(selection.color)
  const coverage = resolveCoverage(selection.coverage)
  const patternChoice = resolvePattern(selection.pattern)

  const coverMix = (cover && coverage.tile) ? coverage.tileMix : 0
  const patternOn = (pattern && patternChoice.tile) ? 1 : 0

  for (const material of handle.materials) {
    const uniforms = material.userData?.carUniforms as CarUniforms | undefined
    if (!uniforms) continue

    uniforms.uPaintColor.value.set(color.hex)
    uniforms.uPaintRoughness.value = coverage.roughness
    uniforms.uPaintMetalness.value = coverage.metalness
    uniforms.uPaintClearcoat.value = coverage.clearcoat
    uniforms.uPaintClearcoatRoughness.value = coverage.clearcoatRoughness
    /* Карты нужны только зоне краски. Без карты сэмплер всё равно должен быть
       живым — тогда mix с белым даёт чистый результат. */
    uniforms.uCoverTex.value = cover ?? handle.neutral
    uniforms.uCoverRepeat.value = coverage.tileRepeat * UV_REPEAT_PER_METER
    uniforms.uCoverMix.value = coverMix
    uniforms.uPatternTex.value = pattern ?? handle.neutral
    uniforms.uPatternRepeat.value = patternRepeat(patternChoice, selection.scale) * UV_REPEAT_PER_METER
    uniforms.uPatternOn.value = patternOn
    /* «Без цвета» — белый: подмешивание белого оставляет печать как в файле. */
    uniforms.uPatternTint.value = patternOn > 0 ? patternChoice.tint : 0
  }

  handle.selection = selection
}

/** Достаёт тайловую карту, один раз на набор. */
async function loadTile(handle: CarMaterialHandle, tileId: string): Promise<THREE.Texture | null> {
  const cached = handle.tiles.get(tileId)
  if (cached) return cached

  const { three } = handle
  try {
    const texture = await new three.TextureLoader().loadAsync(`${handle.textureBase}/${tileId}-color.webp`)
    texture.colorSpace = three.SRGBColorSpace
    texture.wrapS = three.RepeatWrapping
    texture.wrapT = three.RepeatWrapping
    texture.anisotropy = handle.anisotropy
    texture.flipY = false
    handle.tiles.set(tileId, texture)
    return texture
  }
  catch (error) {
    console.error('[3d] car tile failed:', tileId, error)
    /* Неудачу не запоминаем: узел может догрузиться, а повторный запрос
       дешевле, чем навсегда потерянный материал. */
    return null
  }
}

/**
 * Переключает окраску: подгружает карты выбранных узора и покрытия и
 * раскладывает значения по юниформам. Ничего не пересобирает — геометрия и
 * программы шейдеров те же, меняются только значения.
 */
/*
 * `isCurrent` — выбор ещё актуален: пока грузились карты, могли выбрать другой,
 * и поздно догрузившийся прежний выбор не должен лечь поверх нового.
 * Возвращает, наложен ли выбор.
 */
export async function setCarSelection(
  handle: CarMaterialHandle,
  selection: CarSelection,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  const coverage = resolveCoverage(selection.coverage)
  const pattern = resolvePattern(selection.pattern)
  const [cover, tile] = await Promise.all([
    coverage.tile ? loadTile(handle, coverage.tile) : Promise.resolve(null),
    pattern.tile ? loadTile(handle, pattern.tile) : Promise.resolve(null),
  ])
  if (!isCurrent()) return false
  applySelection(handle, selection, cover, tile)
  return true
}

/** Освобождает текстуры тайлов. Материалы освободит общий dispose вьювера. */
export function disposeCarMaterials(handle: CarMaterialHandle): void {
  for (const texture of handle.tiles.values()) texture.dispose()
  handle.tiles.clear()
  handle.neutral.dispose()
}
