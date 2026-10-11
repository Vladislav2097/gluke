/* Описания WebGL-виджетов кейсов для общей оболочки `ProjectWidgetDemo.vue`.
 *
 * Обвязка у всех пяти виджетов одна: сцена с обложкой под канвасом, панель
 * ползунков, кэш инстанса между перемонтированиями, политика тач-скролла,
 * потолки dpr и площади буфера. Раньше она была скопирована в пять
 * компонентов по 500–600 строк, и копии успели разойтись — у пирамиды,
 * например, забыли перевод подписей, и на публичной странице показывались
 * сырые ключи. Здесь остаётся только то, чем виджеты действительно
 * отличаются: какой модуль грузить, какие ползунки показывать и что
 * передать в `create`.
 *
 * Сами движки не пересекаются и общего кода не имеют: пирамида — raymarching
 * по SDF, созвездие — точки и нити, лава — поле метаболлов, облако —
 * three.js и сэмплирование поверхности, портрет — gl.POINTS из пикселей,
 * наполнение знака — запечённые поля расстояний по маске логотипа, молекула
 * с водой — three.js, стекло с transmission и GPU-симуляция поверхности.
 */
import {
  CONSTELLATION_THEME_COLORS,
  ENERGY_FILL_THEME_LOOK,
  IMAGE_PARTICLES_THEME_LOOK,
  METABALLS_THEME_LOOK,
  PARTICLES_THEME_LOOK,
  PYRAMID_THEME_LOOK,
  WATER_THEME_LOOK,
} from '~/utils/widgetThemeLook'

export type WidgetParams = Record<string, unknown>

export interface WidgetControl {
  key: string
  min: number
  max: number
  step: number
}

export interface WidgetControlGroup {
  id: string
  controls: readonly WidgetControl[]
}

/* Минимальный контракт виджета, на который опирается оболочка. `recolor`
   есть только у звёздного поля — оно умеет менять цвета, не пересоздавая
   точки. */
export interface WidgetDemoInstance {
  set: (patch: WidgetParams) => void
  start: () => void
  stop: () => void
  destroy: () => void
  detach: () => void
  reattach: (el: HTMLElement) => void
  recolor?: (palette: string[], linkColor?: string, auraColor?: string, coreColor?: string) => void
}

export interface WidgetFactory {
  create: (el: HTMLElement, options: WidgetParams) => unknown
}

/** Данные кейса, доступные описанию при сборке опций `create`. */
export interface WidgetCreateContext {
  /** `demo` из контента кейса: модель, картинка-донор, логотип. */
  demo: Record<string, unknown>
  /** Узкий экран (<1024): для него ниже потолки dpr и площади буфера. */
  narrow: boolean
  /** Где живёт этот экземпляр: карточка в шапке, полноэкранный сплэш или
      лаборатория. Полноформатной шапке нужна своя раскладка кадра — текст
      кейса лежит поверх левой половины. */
  variant: 'hero' | 'tunable' | 'bleed'
}

export interface WidgetDemoSpec {
  /** Загрузка движка отдельным чанком: на странице живёт только свой. */
  load: () => Promise<{ default: WidgetFactory }>
  /** Группы ползунков лаборатории — зеркало API движка. */
  groups: readonly WidgetControlGroup[]
  /** Дефолты, повторяющие `DEFAULTS` движка. Поверх ложится `demo.params`. */
  defaults?: Record<string, number>
  /** Значения темы, которые уходят в параметры и меняются через `set`. */
  themeLook?: (light: boolean) => WidgetParams
  /** Значения темы, нужные только при `create` (цвета звёздного поля). */
  createTheme?: (light: boolean) => WidgetParams
  /** Смена темы без пересоздания: звёздное поле перекрашивается `recolor`. */
  applyTheme?: (instance: WidgetDemoInstance, light: boolean) => void
  /** Опции `create`, зависящие от кейса: модель, донор, логотип. */
  createOptions?: (ctx: WidgetCreateContext) => WidgetParams
  /** Последняя правка параметров перед отправкой в движок. */
  mapParams?: (merged: WidgetParams, tuned: Record<string, number>, demo: Record<string, unknown>) => WidgetParams
  /** Стартовое значение ползунка, если оно лежит не плоским ключом. */
  readInitial?: (key: string, params: WidgetParams) => number | undefined
  /** Ключ localStorage лаборатории. Без него настройки живут в памяти сессии. */
  storageKey?: string
  /** Префикс для подписей ползунков: разводит одноимённые ключи разных
      виджетов (`drift` — вращение у пирамиды, полёт звёзд у поля). */
  labelPrefix?: string
  /** Движок не запускается сам — нужен явный `start()`. */
  needsStart?: boolean
  /** Переприменять конфиг при перецеплении из кэша. Звёздному полю нельзя:
      `set` с `countMult` пересоздал бы массив точек и «перемешал» поле. */
  reapplyOnReattach?: boolean
  /** Гасить поле под текстом в полноэкранном режиме. Нужно тем, кто заливает
      большие плотные пятна: в светлой теме «чернильные» капли лавы попадают
      под такой же тёмный текст и заголовок пропадает. Разреженному звёздному
      полю не нужно — буквы читаются прямо по нему. */
  bleedScrim?: boolean
  /** В обычном hero-режиме растянуть виджет на всю высоту своей половины
      (объектные виджеты: портрет). Сцена перестаёт быть 16:9-карточкой и
      занимает колонку целиком, на узком экране уходит вторым блоком под
      текст. */
  heroFill?: boolean
  /** Высокая сцена в лаборатории: квадрат, но не выше экрана. Для моделей,
      вытянутых вверх, — в 16:9-карточке олень упирался рогами и копытами
      в край кадра, а по ширине занимал узкую полосу посередине. */
  tallStage?: boolean
  /** Подпись под панелью: сколько объектов получится при текущих настройках. */
  estimate?: (stage: { w: number, h: number }, value: (key: string) => number) => number | null
}

/* Одинаковые для всех движков потолки производительности. */
function perfOptions(narrow: boolean, budget = 2.2e6, desktopBudget = 2.2e6): WidgetParams {
  return {
    ratioCap: narrow ? 1.5 : 2,
    pixelBudget: narrow ? budget : desktopBudget,
    pauseOffscreen: true,
    respectReducedMotion: true,
  }
}

/* Звёздное поле: плотность задана на площадь, `countMult` лишь умножает
   стандарт — поэтому опорный квадрат живёт здесь, а не в ползунках. */
const DENSITY_STD = 6
const DENSITY_TILE = 100
const MIN_STARS = 30
const MAX_STARS = 2000

const HUES_KEY = /^hues([0-2])$/

export const WIDGET_DEMO_SPECS: Record<string, WidgetDemoSpec> = {
  'energy-fill': {
    load: () => import('~/utils/gluke-energy-fill.js') as unknown as Promise<{ default: WidgetFactory }>,
    storageKey: 'gluke-energy-fill-v1',
    themeLook: light => ENERGY_FILL_THEME_LOOK[light ? 'light' : 'dark'],
    defaults: {
      markPick: 0,
      detail: 2,
      markSize: 0.99,
      markShift: 0,
      markFit: 0,
      entryAngle: 30,
      beamReach: 1.1,
      beamWidth: 0.05,
      beamNoise: 0.8,
      beamGlow: 1.6,
      frontWidth: 0.06,
      frontGlow: 1.4,
      fillNoise: 0.16,
      noiseScale: 7,
      frontFlow: 0.5,
      grain: 0.22,
      grainScale: 14,
      grainSteps: 7,
      idle: 0.55,
      idleSpeed: 0.15,
      idleTight: 5,
      idleShape: 1.3,
      rim: 0.9,
      rimWidth: 0.14,
      halo: 1,
      haloWidth: 0.15,
      soft: 0.55,
      softWidth: 0.29,
      bloom: 0.5,
      bloomWidth: 1.28,
      shock: 1.45,
      shockWidth: 0.22,
      burst: 0,
      burstScale: 3.5,
      burstSpeed: 0.5,
      hue: 0.147,
      saturation: 0.91,
      dormant: 0.3,
      charge: 0.7,
      fillTime: 1,
      flash: 0.35,
      hold: 1.4,
      ambient: 3,
      loop: 1,
      freeze: 0,
      scrub: 0.37,
    },
    /* В полноформатной шапке текст кейса лежит в левой колонке (44rem), а знак
       по умолчанию стоит по центру кадра — он попадал бы под заголовок. Уводим
       его в правую треть и там же держим по ширине, иначе на узком десктопе
       крупный знак всё равно наползает на текст. На мобильном текст идёт
       сверху отдельным блоком — там знак остаётся по центру и во всю высоту. */
    createOptions: ({ narrow, variant }) => ({
      ...perfOptions(narrow, 0.7e6),
      ...(variant === 'bleed' && !narrow ? { markShift: 0.32, markFit: 0.28 } : {}),
    }),
    /* Знак приходит не из `createOptions`, а отсюда: `createOptions`
       раскладывается последним и затёр бы выбор ползунка. Движок растеризует
       любой SVG или PNG и печёт по нему карту прихода волны — заранее
       готовить нечего, поэтому переключение работает и на лету. */
    mapParams: (merged, _tuned, demo) => {
      const params = (demo.params ?? {}) as WidgetParams
      const alt = typeof params.markAlt === 'string' ? params.markAlt : null
      const pick = Number(merged.markPick ?? 0)
      const rest: WidgetParams = { ...merged }
      delete rest.markPick
      delete rest.markAlt
      rest.mark = (pick > 0.5 && alt) ? alt : demo.logo
      return rest
    },
    groups: [
      {
        id: 'beam',
        controls: [
          { key: 'entryAngle', min: -180, max: 180, step: 1 },
          { key: 'beamReach', min: 0.2, max: 2.5, step: 0.05 },
          { key: 'beamWidth', min: 0.005, max: 0.2, step: 0.005 },
          { key: 'beamNoise', min: 0, max: 2, step: 0.05 },
          { key: 'beamGlow', min: 0, max: 4, step: 0.05 },
        ],
      },
      {
        id: 'fill',
        controls: [
          { key: 'frontWidth', min: 0.005, max: 0.4, step: 0.005 },
          { key: 'frontGlow', min: 0, max: 4, step: 0.05 },
          { key: 'fillNoise', min: 0, max: 0.6, step: 0.01 },
          { key: 'noiseScale', min: 1, max: 20, step: 0.5 },
          { key: 'frontFlow', min: 0, max: 3, step: 0.05 },
          /* Захват кусками: `grain` — насколько участки разбегаются по
             времени, `grainSteps` — на сколько ступеней режется шум (меньше
             ступеней — крупнее и заметнее куски). */
          { key: 'grain', min: 0, max: 0.8, step: 0.01 },
          { key: 'grainScale', min: 3, max: 40, step: 0.5 },
          { key: 'grainSteps', min: 2, max: 24, step: 1 },
        ],
      },
      {
        id: 'idle',
        controls: [
          { key: 'idle', min: 0, max: 2, step: 0.05 },
          { key: 'idleShape', min: 0, max: 2, step: 0.1 },
          { key: 'idleSpeed', min: 0, max: 2, step: 0.01 },
          { key: 'idleTight', min: 0.5, max: 5, step: 0.1 },
        ],
      },
      {
        id: 'mark',
        controls: [
          { key: 'markPick', min: 0, max: 1, step: 1 },
          { key: 'detail', min: 0.5, max: 2, step: 0.25 },
          { key: 'markSize', min: 0.2, max: 1.4, step: 0.01 },
          { key: 'markShift', min: -0.4, max: 0.4, step: 0.01 },
          { key: 'markFit', min: 0, max: 1, step: 0.01 },
          { key: 'rim', min: 0, max: 3, step: 0.05 },
          { key: 'rimWidth', min: 0.02, max: 1, step: 0.01 },
        ],
      },
      {
        id: 'glow',
        controls: [
          { key: 'halo', min: 0, max: 3, step: 0.05 },
          { key: 'haloWidth', min: 0.005, max: 1, step: 0.005 },
          { key: 'soft', min: 0, max: 3, step: 0.05 },
          { key: 'softWidth', min: 0.02, max: 1.5, step: 0.01 },
          { key: 'bloom', min: 0, max: 4, step: 0.05 },
          { key: 'bloomWidth', min: 0.05, max: 2, step: 0.01 },
          { key: 'shock', min: 0, max: 6, step: 0.05 },
          { key: 'shockWidth', min: 0.02, max: 1, step: 0.01 },
          { key: 'burst', min: 0, max: 2, step: 0.05 },
          { key: 'burstScale', min: 0.5, max: 12, step: 0.1 },
          { key: 'burstSpeed', min: 0, max: 2, step: 0.05 },
        ],
      },
      {
        id: 'palette',
        controls: [
          { key: 'hue', min: 0, max: 1, step: 0.005 },
          { key: 'saturation', min: 0, max: 1, step: 0.01 },
          { key: 'dormant', min: 0, max: 1, step: 0.01 },
        ],
      },
      {
        id: 'timing',
        controls: [
          { key: 'charge', min: 0.1, max: 2, step: 0.05 },
          { key: 'fillTime', min: 0.2, max: 3, step: 0.05 },
          { key: 'flash', min: 0, max: 1.5, step: 0.05 },
          { key: 'hold', min: 0, max: 6, step: 0.1 },
          { key: 'ambient', min: 0, max: 3, step: 0.05 },
          { key: 'loop', min: 0, max: 1, step: 1 },
          /* Стоп-кадр и протяжка по сцене: без них фронт и импульс живут по
             сотне миллисекунд, и настроить их ползунками невозможно. */
          { key: 'freeze', min: 0, max: 1, step: 1 },
          { key: 'scrub', min: 0, max: 1, step: 0.005 },
        ],
      },
    ],
  },

  'pyramid': {
    load: () => import('~/utils/gluke-pyramid.js') as unknown as Promise<{ default: WidgetFactory }>,
    labelPrefix: 'pyramid',
    /* Пирамида тоже объект в кадре: в 16:9-карточке она получалась мелкой. */
    heroFill: true,
    themeLook: light => PYRAMID_THEME_LOOK[light ? 'light' : 'dark'],
    groups: [
      {
        id: 'geometry',
        controls: [
          { key: 'rise', min: 0.5, max: 5, step: 0.05 },
          { key: 'baseSpan', min: 1, max: 8, step: 0.05 },
          { key: 'zoom', min: 1, max: 5, step: 0.05 },
        ],
      },
      {
        id: 'color',
        controls: [
          { key: 'hues0', min: 0, max: 6.28, step: 0.05 },
          { key: 'hues1', min: 0, max: 6.28, step: 0.05 },
          { key: 'hues2', min: 0, max: 6.28, step: 0.05 },
          { key: 'hueTurn', min: -3.14, max: 3.14, step: 0.05 },
          { key: 'vividness', min: 0, max: 2.5, step: 0.05 },
          { key: 'bandRate', min: 0.2, max: 3, step: 0.05 },
          { key: 'radiance', min: 0, max: 3, step: 0.05 },
          { key: 'flare', min: 0, max: 3, step: 0.05 },
        ],
      },
      {
        id: 'motion',
        controls: [
          { key: 'drift', min: -1, max: 1, step: 0.01 },
          { key: 'flowRate', min: 0, max: 2, step: 0.05 },
          { key: 'lean', min: -0.6, max: 0.8, step: 0.01 },
          { key: 'swayX', min: 0, max: 2.5, step: 0.05 },
          { key: 'swayY', min: 0, max: 1.5, step: 0.05 },
          { key: 'easing', min: 0.01, max: 0.3, step: 0.005 },
        ],
      },
      {
        id: 'logo',
        controls: [
          { key: 'markSize', min: 0.1, max: 1, step: 0.01 },
          { key: 'markHeight', min: 0, max: 0.9, step: 0.01 },
          { key: 'markGlow', min: 0, max: 40, step: 0.5 },
          { key: 'markDepth', min: 0.02, max: 0.2, step: 0.005 },
        ],
      },
    ],
    createOptions: ({ demo, narrow }) => ({
      /* Логотип кейса вплавляется во все четыре грани. */
      marks: demo.logo ? [demo.logo, demo.logo, demo.logo, demo.logo] : [],
      /* Пирамида — самый дорогой пиксель сайта: до 100 шагов raymarch на
         каждый. Число шагов не урезаем — свечение копится вдоль всего луча, и
         меньший потолок обрезает саму картинку; вместо этого луч выходит,
         когда ушёл далеко за объект (шейдер, в среднем ~половина шагов).
         Урезаем и площадь: на десктопе 1,6 млн пикселей вместо общих 2,2 млн.
         Свечение мягкое, и разница плотности на нём не читается. */
      ...perfOptions(narrow, 0.7e6, 1.6e6),
      pointer: true,
      pointerFrom: 'window',
    }),
    /* Три ползунка оттенка — это один массив `hues` в API движка: плоские
       hues0/1/2 в него не уходят. */
    mapParams: (merged, tuned, demo) => {
      const hues = [...(((demo.params as WidgetParams | undefined)?.hues as number[] | undefined) ?? [0, 1, 2])]
      let touched = false
      for (let i = 0; i < 3; i++) {
        const value = tuned[`hues${i}`]
        if (typeof value === 'number') {
          hues[i] = value
          touched = true
        }
      }
      const base = Object.fromEntries(
        Object.entries(merged).filter(([key]) => !HUES_KEY.test(key)),
      ) as WidgetParams
      if (touched) base.hues = hues
      return base
    },
    readInitial: (key, params) => {
      const match = HUES_KEY.exec(key)
      if (!match) return undefined
      return (params.hues as number[] | undefined)?.[Number(match[1])] ?? 0
    },
  },

  'constellation': {
    load: () => import('~/utils/constellation.js') as unknown as Promise<{ default: WidgetFactory }>,
    needsStart: true,
    /* Конфиг при перецеплении не переприменяем: `set` с countMult/size
       пересоздал бы массив точек, а инстанс и так помнит свои параметры. */
    reapplyOnReattach: false,
    createTheme: light => ({ ...CONSTELLATION_THEME_COLORS[light ? 'light' : 'dark'] }),
    applyTheme: (instance, light) => {
      const c = CONSTELLATION_THEME_COLORS[light ? 'light' : 'dark']
      instance.recolor?.(c.palette, c.linkColor, c.auraColor, c.coreColor)
    },
    defaults: {
      countMult: 1.35,
      size: 2.1,
      sizeSpread: 3.95,
      twinkle: 0.5,
      drift: 0.45,
      wander: 2,
      speedSpread: 3.25,
      linkDist: 1.48,
      linkAlpha: 0.1,
      cursorRadius: 0.32,
      planetRadius: 0.07,
      cursorRepel: 0.7,
      cursorPull: 0.25,
      cursorObject: 1,
    },
    createOptions: () => ({ density: DENSITY_STD, densityTile: DENSITY_TILE }),
    estimate: (stage, value) => {
      const area = stage.w * stage.h
      if (!area) return null
      const n = Math.round(area * (DENSITY_STD / (DENSITY_TILE * DENSITY_TILE)) * value('countMult'))
      return Math.max(MIN_STARS, Math.min(MAX_STARS, n))
    },
    groups: [
      {
        id: 'stars',
        controls: [
          { key: 'countMult', min: 0.1, max: 8, step: 0.05 },
          { key: 'size', min: 0.4, max: 10, step: 0.1 },
          { key: 'sizeSpread', min: 0, max: 4, step: 0.05 },
          { key: 'twinkle', min: 0, max: 4, step: 0.05 },
        ],
      },
      {
        id: 'motion',
        controls: [
          { key: 'drift', min: 0, max: 4, step: 0.05 },
          { key: 'wander', min: 0, max: 4, step: 0.05 },
          { key: 'speedSpread', min: 0, max: 5, step: 0.05 },
        ],
      },
      {
        id: 'links',
        controls: [
          { key: 'linkDist', min: 0.2, max: 4, step: 0.02 },
          { key: 'linkAlpha', min: 0, max: 2, step: 0.01 },
        ],
      },
      {
        id: 'cursor',
        controls: [
          { key: 'cursorRadius', min: 0.05, max: 1.4, step: 0.01 },
          { key: 'planetRadius', min: 0, max: 0.6, step: 0.01 },
          { key: 'cursorRepel', min: 0, max: 6, step: 0.05 },
          { key: 'cursorPull', min: 0, max: 6, step: 0.05 },
          { key: 'cursorObject', min: 0, max: 1, step: 1 },
        ],
      },
    ],
  },

  'metaballs': {
    load: () => import('~/utils/gluke-metaballs.js') as unknown as Promise<{ default: WidgetFactory }>,
    storageKey: 'gluke-metaballs-v4',
    bleedScrim: true,
    themeLook: light => METABALLS_THEME_LOOK[light ? 'light' : 'dark'],
    defaults: {
      count: 6,
      speed: 0.7,
      turbulence: 0.5,
      blobSize: 0.11,
      threshold: 0.5,
      hue: 0.03,
      saturation: 1,
      glow: 1.1,
      gloss: 0.55,
      relief: 2,
      cursorLava: 1,
      cursorPullLava: 0.4,
      cursorPullRadius: 0.35,
      cursorSize: 1.3,
    },
    createOptions: ({ narrow }) => ({
      ...perfOptions(narrow, 0.7e6),
      /* Тач ведёт лаву так же, как курсор; вертикальный свайп остаётся
         у страницы — канвасу проставляется touch-action: pan-y. */
      pointer: true,
      pointerFrom: 'window',
    }),
    groups: [
      {
        id: 'blobs',
        controls: [
          { key: 'count', min: 2, max: 14, step: 1 },
          { key: 'speed', min: 0, max: 2, step: 0.05 },
          { key: 'turbulence', min: 0, max: 2, step: 0.05 },
          { key: 'blobSize', min: 0.05, max: 0.22, step: 0.005 },
          { key: 'threshold', min: 0.2, max: 0.9, step: 0.01 },
        ],
      },
      {
        id: 'palette',
        controls: [
          { key: 'hue', min: 0, max: 1, step: 0.01 },
          { key: 'saturation', min: 0, max: 1.6, step: 0.05 },
          { key: 'glow', min: 0, max: 2.5, step: 0.05 },
          { key: 'gloss', min: 0, max: 1.5, step: 0.05 },
          { key: 'relief', min: 0, max: 4, step: 0.05 },
        ],
      },
      {
        id: 'cursor',
        controls: [
          { key: 'cursorLava', min: 0, max: 1, step: 1 },
          { key: 'cursorPullLava', min: 0, max: 1, step: 0.05 },
          { key: 'cursorPullRadius', min: 0, max: 1.5, step: 0.01 },
          { key: 'cursorSize', min: 0.5, max: 3, step: 0.05 },
        ],
      },
    ],
  },

  'particles': {
    load: () => import('~/utils/gluke-particles.js') as unknown as Promise<{ default: WidgetFactory }>,
    storageKey: 'gluke-particles-v4',
    /* Олень — объект со своим центром композиции: в hero растягивается на всю
       высоту правой колонки, иначе в 16:9-карточке он выходит мелким. */
    heroFill: true,
    tallStage: true,
    themeLook: light => PARTICLES_THEME_LOOK[light ? 'light' : 'dark'],
    defaults: {
      points: 35000,
      pointSize: 0.8,
      spread: 0.05,
      revealSpeed: 0.4,
      pointOpacity: 0.165,
      brightness: 0.47,
      paths: 32,
      pathStep: 0.16,
      pathSpeed: 327,
      lineTail: 850,
      lineFade: 10,
      lineOpacity: 0.205,
      lineDisplace: 0,
      hueShift: 0.08,
      lineHueSpread: 0.49,
      lineShimmer: 0.06,
      pointJitter: 0.009,
      jitterSpeed: 0.55,
      pointTravel: 0,
      pointHop: 2,
      twinkle: 1,
      twinkleSpeed: 0.85,
      modelScale: 1.15,
      cursorPush: 0.03,
      cursorReach: 0.13,
      waveStrength: 0.45,
      waveSpeed: 1.65,
      waveWidth: 0.12,
      spin: 0.1,
      tilt: 0.17,
    },
    createOptions: ({ demo, narrow }) => ({
      /* Модель задаёт кейс: движок сэмплирует любую. */
      model: demo.model,
      ...perfOptions(narrow, 0.7e6),
      /* Вращение перетаскиванием, как у 3D-вьюверов сайта. */
      drag: true,
    }),
    groups: [
      {
        id: 'cloud',
        controls: [
          { key: 'points', min: 0, max: 80000, step: 1000 },
          { key: 'pointSize', min: 0, max: 5, step: 0.1 },
          { key: 'spread', min: 0, max: 0.35, step: 0.005 },
          { key: 'revealSpeed', min: 0, max: 0.4, step: 0.005 },
          { key: 'pointOpacity', min: 0, max: 1, step: 0.005 },
          { key: 'brightness', min: 0, max: 2.5, step: 0.01 },
        ],
      },
      {
        id: 'lines',
        controls: [
          { key: 'paths', min: 0, max: 32, step: 1 },
          { key: 'pathStep', min: 0.03, max: 0.4, step: 0.01 },
          { key: 'pathSpeed', min: 0, max: 400, step: 1 },
          { key: 'lineTail', min: 0, max: 20000, step: 50 },
          { key: 'lineFade', min: 0, max: 10, step: 0.05 },
          { key: 'lineOpacity', min: 0, max: 1, step: 0.005 },
          { key: 'lineDisplace', min: 0, max: 0.3, step: 0.005 },
        ],
      },
      {
        id: 'palette',
        controls: [
          { key: 'hueShift', min: 0, max: 1, step: 0.01 },
          { key: 'lineHueSpread', min: 0, max: 0.5, step: 0.01 },
          { key: 'lineShimmer', min: 0, max: 0.4, step: 0.01 },
        ],
      },
      {
        /* Точки не стоят: дрожат на месте и, обновляясь, перелетают на новое
           место сквозь тело модели. Дальность ограничивает перелёт соседями —
           тогда облако не роится, а течёт по поверхности. */
        id: 'swarm',
        controls: [
          { key: 'pointJitter', min: 0, max: 0.05, step: 0.001 },
          { key: 'jitterSpeed', min: 0, max: 5, step: 0.05 },
          { key: 'pointTravel', min: 0, max: 6, step: 0.1 },
          { key: 'pointHop', min: 0.02, max: 2, step: 0.01 },
          { key: 'twinkle', min: 0, max: 1, step: 0.01 },
          { key: 'twinkleSpeed', min: 0, max: 5, step: 0.05 },
        ],
      },
      {
        /* Курсор сдвигает точки в плоскости экрана (минус — притягивает),
           нажатие пускает по телу волну из точки под курсором. */
        id: 'cursor',
        controls: [
          { key: 'cursorPush', min: -0.4, max: 0.4, step: 0.01 },
          { key: 'cursorReach', min: 0.02, max: 0.6, step: 0.01 },
        ],
      },
      {
        id: 'wave',
        controls: [
          { key: 'waveStrength', min: 0, max: 3, step: 0.05 },
          { key: 'waveSpeed', min: 0.1, max: 4, step: 0.05 },
          { key: 'waveWidth', min: 0.02, max: 0.5, step: 0.01 },
        ],
      },
      {
        id: 'motion',
        controls: [
          { key: 'spin', min: -0.8, max: 0.8, step: 0.01 },
          { key: 'tilt', min: -0.6, max: 0.6, step: 0.01 },
          { key: 'modelScale', min: 0.5, max: 2.5, step: 0.05 },
        ],
      },
    ],
  },

  'water': {
    load: () => import('~/utils/gluke-water.js') as unknown as Promise<{ default: WidgetFactory }>,
    storageKey: 'gluke-water-v1',
    /* Подписи у воды свои (`waterRotationSpeed`, …): ключи вроде `waveSpeed`
       и `cursorRadius` уже заняты облаком точек и звёздным полем, где они
       значат другое. */
    labelPrefix: 'water',
    /* Молекула — объект в кадре, как олень: в hero растягивается на всю
       высоту правой колонки. */
    heroFill: true,
    /* Боком одна нижняя доля идёт на камеру, а курсор и прокрутка наклоняют
       камеру до ~47°: в 16:9 по высоте не хватало места, и молекула без
       обрезки занимала половину ширины сцены. */
    tallStage: true,
    themeLook: light => WATER_THEME_LOOK[light ? 'light' : 'dark'],
    defaults: {
      rotationSpeed: 0.45,
      scrollRotation: 6.52,
      follow: 1.75,
      maxAngularVel: 2.85,
      maxAngularAccel: 1.4,
      velResponse: 3.8,
      accelSmoothing: 5,
      hoverTilt: 0.4,
      modelScale: 1,
      glassOn: 1,
      waterOn: 1,
      ballsOn: 1,
      lettersOn: 1,
      highWater: 0,
      glassThickness: 0.145,
      glassIor: 1.46,
      glassDispersion: 0.52,
      glassClearcoat: 0.48,
      glassRim: 0.19,
      glassEdge: 0.41,
      glassEdgePower: 3.2,
      glassBody: 0.055,
      glassBubbles: 0.73,
      innerRim: 0.12,
      innerRimPower: 3.5,
      innerRoughness: 0.11,
      waterDepth: 0.53,
      ripple: 0.0092,
      dropStrength: 0.1,
      caustics: 0.25,
      foam: 1.1,
      waterLevel: -0.005,
      refraction: 0.185,
      absorption: 2.2,
      highLevel: -0.04,
      highWaves: 1,
      highWobble: 1,
      highCaustics: 0.35,
      silt: 0.8,
      siltSize: 0.009,
      siltRise: 0.04,
      siltDrift: 0.05,
      siltInertia: 1,
      spinUp: 2.5,
      siltCursor: 0.6,
      waveSpeed: 0.9,
      waveDamping: 0.35,
      viscosity: 2,
      relax: 0.05,
      spinResponse: 1,
      cursorStrength: 1.2,
      cursorRadius: 0.18,
      cursorMaxSpeed: 3,
      cursorVertical: 0.5,
      ballWake: 0.6,
      flowDamping: 0.6,
      ballCore: 0.17,
      ballRim: 0.33,
      ballRoughness: 0.36,
      ballAbove: 1,
      ballRadius: 0.116,
      buoyancy: 0.25,
      flowFollow: 0.8,
      forceResponse: 3.75,
      ballWander: 0.01,
      ballDrag: 1.4,
      ballMaxSpeed: 0.4,
      wallStiffness: 68,
      wallRange: 1.6,
      restitution: 0.63,
      letterGlow: 0.12,
      faceCamera: 1,
      faceTilt: 0,
      exposure: 1.1,
      keyLight: 2.2,
      rimLight: 30,
      fillLight: 12,
    },
    createOptions: ({ demo, narrow }) => ({
      /* Модель задаёт кейс: имена объектов внутри — в gluke-water/config.js. */
      model: demo.model,
      /* Стекло с transmission и проход преломления воды рисуют сцену
         несколько раз за кадр — площадь буфера урезана, как у пирамиды. */
      ...perfOptions(narrow, 0.7e6, 1.6e6),
    }),
    groups: [
      {
        id: 'motion',
        controls: [
          { key: 'rotationSpeed', min: 0, max: 2, step: 0.01 },
          { key: 'scrollRotation', min: 0, max: 12.5, step: 0.01 },
          { key: 'follow', min: 0.1, max: 3, step: 0.05 },
          { key: 'maxAngularVel', min: 0.2, max: 5, step: 0.05 },
          { key: 'maxAngularAccel', min: 0.2, max: 6, step: 0.05 },
          { key: 'velResponse', min: 0.5, max: 10, step: 0.1 },
          { key: 'accelSmoothing', min: 0.5, max: 15, step: 0.1 },
          { key: 'hoverTilt', min: 0, max: 0.4, step: 0.01 },
          { key: 'modelScale', min: 0.6, max: 1.6, step: 0.01 },
        ],
      },
      {
        /* Слои — 0/1: разобрать сцену и посмотреть, из чего она собрана.
           Высокая вода — второй режим сцены, без шариков и со взвесью. */
        id: 'layers',
        controls: [
          { key: 'highWater', min: 0, max: 1, step: 1 },
          { key: 'glassOn', min: 0, max: 1, step: 1 },
          { key: 'waterOn', min: 0, max: 1, step: 1 },
          { key: 'ballsOn', min: 0, max: 1, step: 1 },
          { key: 'lettersOn', min: 0, max: 1, step: 1 },
        ],
      },
      {
        id: 'waterLook',
        controls: [
          { key: 'waterLevel', min: -0.25, max: 0.3, step: 0.005 },
          { key: 'waterDepth', min: 0.1, max: 2, step: 0.01 },
          { key: 'ripple', min: 0, max: 0.01, step: 0.0002 },
          { key: 'dropStrength', min: 0, max: 0.1, step: 0.001 },
          { key: 'caustics', min: 0, max: 0.4, step: 0.005 },
          { key: 'foam', min: 0, max: 3, step: 0.05 },
          { key: 'refraction', min: 0, max: 0.5, step: 0.005 },
          { key: 'absorption', min: 0, max: 5, step: 0.05 },
        ],
      },
      {
        id: 'waterSim',
        controls: [
          { key: 'waveSpeed', min: 0.1, max: 1.9, step: 0.01 },
          { key: 'waveDamping', min: 0, max: 3, step: 0.01 },
          { key: 'viscosity', min: 0, max: 20, step: 0.1 },
          { key: 'relax', min: 0, max: 1, step: 0.01 },
          { key: 'spinResponse', min: 0, max: 1, step: 0.005 },
          { key: 'cursorStrength', min: 0, max: 5, step: 0.05 },
          { key: 'cursorRadius', min: 0.05, max: 0.5, step: 0.01 },
          { key: 'cursorMaxSpeed', min: 0.5, max: 8, step: 0.1 },
          { key: 'cursorVertical', min: 0, max: 1.5, step: 0.05 },
          { key: 'ballWake', min: 0, max: 3, step: 0.05 },
          { key: 'flowDamping', min: 0, max: 5, step: 0.05 },
        ],
      },
      {
        id: 'waterHigh',
        controls: [
          { key: 'highLevel', min: -0.6, max: 0.4, step: 0.005 },
          { key: 'highWaves', min: 0, max: 4, step: 0.05 },
          { key: 'highWobble', min: 0, max: 3, step: 0.05 },
          { key: 'highCaustics', min: 0, max: 1.5, step: 0.01 },
          { key: 'silt', min: 0, max: 1, step: 0.01 },
          { key: 'siltSize', min: 0.002, max: 0.03, step: 0.0005 },
          { key: 'siltRise', min: 0, max: 0.2, step: 0.005 },
          { key: 'siltDrift', min: 0, max: 0.3, step: 0.005 },
          { key: 'siltInertia', min: 0, max: 3, step: 0.05 },
          { key: 'spinUp', min: 0.2, max: 8, step: 0.1 },
          { key: 'siltCursor', min: 0, max: 3, step: 0.05 },
        ],
      },
      {
        id: 'balls',
        controls: [
          { key: 'ballRadius', min: 0.03, max: 0.25, step: 0.001 },
          { key: 'buoyancy', min: -1, max: 1, step: 0.01 },
          { key: 'flowFollow', min: 0, max: 5, step: 0.05 },
          { key: 'forceResponse', min: 0, max: 5, step: 0.05 },
          { key: 'ballWander', min: 0, max: 0.1, step: 0.001 },
          { key: 'ballDrag', min: 0, max: 5, step: 0.05 },
          { key: 'ballMaxSpeed', min: 0.05, max: 1.5, step: 0.01 },
          { key: 'wallStiffness', min: 0, max: 100, step: 1 },
          { key: 'wallRange', min: 1, max: 4, step: 0.05 },
          { key: 'restitution', min: 0, max: 1, step: 0.01 },
          { key: 'ballCore', min: 0, max: 1, step: 0.01 },
          { key: 'ballRim', min: 0, max: 1, step: 0.01 },
          { key: 'ballRoughness', min: 0, max: 1, step: 0.01 },
          { key: 'ballAbove', min: 0, max: 1, step: 1 },
        ],
      },
      {
        id: 'glass',
        controls: [
          { key: 'glassThickness', min: 0, max: 0.6, step: 0.005 },
          { key: 'glassIor', min: 1, max: 2.33, step: 0.01 },
          { key: 'glassDispersion', min: 0, max: 1, step: 0.01 },
          { key: 'glassClearcoat', min: 0, max: 1, step: 0.01 },
          { key: 'glassRim', min: 0, max: 1, step: 0.01 },
          { key: 'glassEdge', min: 0, max: 1.5, step: 0.01 },
          { key: 'glassEdgePower', min: 1, max: 8, step: 0.1 },
          { key: 'glassBody', min: 0, max: 0.3, step: 0.005 },
          { key: 'glassBubbles', min: 0, max: 1, step: 0.01 },
        ],
      },
      {
        id: 'glassInner',
        controls: [
          { key: 'innerRim', min: 0, max: 1.5, step: 0.01 },
          { key: 'innerRimPower', min: 1, max: 10, step: 0.1 },
          { key: 'innerRoughness', min: 0, max: 1, step: 0.01 },
        ],
      },
      {
        id: 'letters',
        controls: [
          { key: 'letterGlow', min: 0, max: 1, step: 0.01 },
          { key: 'faceCamera', min: 0, max: 1, step: 1 },
          { key: 'faceTilt', min: 0, max: 1, step: 0.01 },
        ],
      },
      {
        id: 'light',
        controls: [
          { key: 'exposure', min: 0.3, max: 2.5, step: 0.01 },
          { key: 'keyLight', min: 0, max: 6, step: 0.05 },
          { key: 'rimLight', min: 0, max: 100, step: 1 },
          { key: 'fillLight', min: 0, max: 60, step: 1 },
        ],
      },
    ],
  },

  'image-particles': {
    load: () => import('~/utils/gluke-image-particles.js') as unknown as Promise<{ default: WidgetFactory }>,
    /* Портрет — объект в центре: в обычном hero он растягивается на всю
       высоту правой половины шапки (uFit вписывает картинку по пропорциям),
       на мобильном уходит вторым блоком под текст. */
    heroFill: true,
    themeLook: light => IMAGE_PARTICLES_THEME_LOOK[light ? 'light' : 'dark'],
    defaults: {
      density: 1,
      dotSize: 1.6,
      scatter: 0.02,
      depth: 0.04,
      flow: 1.4,
      colorSat: 0.3,
      contrast: 1.35,
      floor: 0.28,
      shadowFill: 0.08,
      radius: 0.5,
      repel: 0.1,
      glide: 0.12,
      parallax: 1,
    },
    createOptions: ({ demo, narrow }) => ({
      /* Картинку-донор задаёт кейс. */
      src: demo.src,
      ...perfOptions(narrow, 0.9e6),
      pointer: true,
      pointerFrom: 'window',
    }),
    groups: [
      {
        id: 'field',
        controls: [
          { key: 'density', min: 1, max: 4, step: 1 },
          { key: 'dotSize', min: 0.4, max: 3, step: 0.05 },
          { key: 'scatter', min: 0, max: 1, step: 0.005 },
          { key: 'depth', min: 0, max: 0.5, step: 0.01 },
          { key: 'flow', min: 0.2, max: 2.5, step: 0.05 },
          { key: 'colorSat', min: 0, max: 1, step: 0.05 },
          { key: 'contrast', min: 1, max: 3, step: 0.05 },
          { key: 'floor', min: 0, max: 0.4, step: 0.005 },
          { key: 'shadowFill', min: 0, max: 1, step: 0.01 },
        ],
      },
      {
        id: 'cursor',
        controls: [
          { key: 'radius', min: 0.1, max: 1.5, step: 0.05 },
          { key: 'repel', min: 0, max: 1.5, step: 0.05 },
          { key: 'glide', min: 0.02, max: 0.4, step: 0.01 },
          { key: 'parallax', min: 0, max: 1, step: 0.05 },
        ],
      },
    ],
  },
}

export function widgetDemoSpec(widget: string | null | undefined): WidgetDemoSpec | null {
  if (!widget) return null
  return WIDGET_DEMO_SPECS[widget] ?? null
}
