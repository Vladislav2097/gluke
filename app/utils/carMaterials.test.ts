import { describe, expect, it } from 'vitest'
import {
  CAR_COVERAGES,
  CAR_LAMP,
  CAR_METAL,
  isWheelMetal,
  CAR_PAINT_COLORS,
  CAR_PATTERNS,
  carTextureBase,
  defaultCarSelection,
  isLampGlow,
  lampIslandAttributes,
  lampSideFromNames,
  lampSplitInMeshSpace,
  lampSide,
  lampSplitFromCenters,
  MASK_QUADRANTS,
  PATTERN_SCALE_MAX,
  PATTERN_SCALE_MIN,
  PATTERN_SCALE_STEP,
  patternRepeat,
  patternScale,
  planLampSplit,
  resolveColor,
  resolveCoverage,
  resolvePattern,
  withPaint,
  zoneFromMask,
} from './carMaterials'

describe('zoneFromMask', () => {
  it('раскладывает четыре квадранта маски по зонам', () => {
    expect(zoneFromMask(1, 0, 0)).toBe('paint')
    expect(zoneFromMask(0, 1, 0)).toBe('interior')
    expect(zoneFromMask(0, 0, 1)).toBe('glass')
    expect(zoneFromMask(0, 0, 0)).toBe('trim')
  })

  it('совпадает с объявленными квадрантами', () => {
    for (const [zone, rgb] of Object.entries(MASK_QUADRANTS)) {
      expect(zoneFromMask(...rgb)).toBe(zone)
    }
  })

  it('смешанный пиксель считает зоной без дыр', () => {
    /* Крупная зона кузова — краска; всё непонятное уходит в чёрные элементы,
       чтобы деталь не рендерилась чёрной дырой. */
    expect(zoneFromMask(0.9, 0.1, 0.1)).toBe('paint')
    expect(zoneFromMask(0.5, 0.5, 0.5)).toBe('trim')
    expect(zoneFromMask(0.12, 0.7, 0.2)).toBe('interior')
  })
})

describe('isWheelMetal', () => {
  it('читает металлом обод и не трогает шину', () => {
    expect(isWheelMetal(['Wheel', 'M_Rim'])).toBe(true)
    expect(isWheelMetal(['M-Tire'])).toBe(false)
  })

  it('знает синонимы и не зависит от регистра', () => {
    expect(isWheelMetal(['chrome_trim'])).toBe(true)
    expect(isWheelMetal(['RIM_metal'])).toBe(true)
    expect(isWheelMetal(['brake_disc'])).toBe(true)
    expect(isWheelMetal(['body', 'm_Glass', 'm_Lamp'])).toBe(false)
  })

  it('металл светлее трима и салона', () => {
    /* Проверка на смысл: обод должен читаться металлом, а не ещё одной
       чёрной деталью — на этом и была жалоба. */
    const brightness = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16)
    expect(brightness(CAR_METAL.color)).toBeGreaterThan(brightness('#0c0e10'))
    expect(CAR_METAL.metalness).toBeGreaterThan(0.5)
  })
})

describe('палитра, узоры и покрытия', () => {
  it('id уникальны', () => {
    expect(new Set(CAR_PAINT_COLORS.map(color => color.id)).size).toBe(CAR_PAINT_COLORS.length)
    expect(new Set(CAR_PATTERNS.map(pattern => pattern.id)).size).toBe(CAR_PATTERNS.length)
    expect(new Set(CAR_COVERAGES.map(coverage => coverage.id)).size).toBe(CAR_COVERAGES.length)
  })

  it('цвета — валидный hex', () => {
    for (const color of CAR_PAINT_COLORS) {
      expect(color.hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('в палитре есть «без цвета», а в узорах — «без узора»', () => {
    /* Без тонировки кузов показывает собственный цвет узора и покрытия. */
    expect(CAR_PAINT_COLORS[0]?.id).toBe('none')
    expect(CAR_PAINT_COLORS.length).toBeGreaterThanOrEqual(8)
    expect(CAR_PATTERNS[0]?.id).toBe('none')
    expect(resolvePattern('none').tile).toBeUndefined()
  })

  it('покрытия — только характер поверхности, печати среди них нет', () => {
    expect(CAR_COVERAGES.map(coverage => coverage.id)).toEqual([
      'gloss',
      'matte',
      'carbon',
      'brushed',
      'ceramic',
    ])
    /* Detail-карта есть у карбона и шлифовки: она затемняет краску. */
    expect(CAR_COVERAGES.filter(coverage => coverage.tile).map(coverage => coverage.tile))
      .toEqual(['carbon', 'brushed'])
  })

  it('печати идут набором: у каждой своя карта, свой повтор и тонировка', () => {
    const tiles = CAR_PATTERNS.filter(pattern => pattern.tile)
    /* Печатей много и они одного устройства: различаются только картой
       и плотностью печати на кузове. */
    expect(tiles.length).toBeGreaterThanOrEqual(8)
    for (const pattern of tiles) {
      expect(pattern.repeat).toBeGreaterThan(0)
      expect(pattern.repeat).toBeLessThan(2)
      /* Тонировка >0 — выбранный цвет подмешивается к печати. «Без цвета» даёт
         белый, а он под умножением — тождество, поэтому такой выбор оставляет
         печать ровно такой, как она лежит в файле. */
      expect(pattern.tint).toBeGreaterThan(0)
      expect(pattern.tint).toBeLessThan(1)
    }
    /* Карта тайла — тот же id, что у самой печати: имя файла в textures
       собирается из него, и расхождение дало бы 404 на карте. */
    for (const pattern of tiles) expect(pattern.tile).toBe(pattern.id)
    expect(resolveColor('none').hex).toBe('#ffffff')
  })

  it('множитель масштаба узора ходит от 0.15 до 2, и шаг ползунка попадает в обе границы, в 0.5 и в 1', () => {
    expect(PATTERN_SCALE_MIN).toBe(0.15)
    expect(PATTERN_SCALE_MAX).toBe(2)
    /* Шаг дробный: деление даёт целое с хвостом в последнем разряде. */
    const steps = (value: number) => (value - PATTERN_SCALE_MIN) / PATTERN_SCALE_STEP
    for (const value of [PATTERN_SCALE_MAX, 1, 0.5]) {
      expect(steps(value)).toBeCloseTo(Math.round(steps(value)), 9)
    }
  })

  it('множитель делает рисунок крупнее, а не плотнее', () => {
    const pattern = CAR_PATTERNS.find(item => item.tile)!
    expect(patternRepeat(pattern, 1)).toBeCloseTo(pattern.repeat, 5)
    /* ×2 — печать вдвое крупнее: тайл вдвое длиннее, значит тайлов на метр
       вдвое меньше. ×0.5 — наоборот. */
    expect(patternRepeat(pattern, 2)).toBeCloseTo(pattern.repeat / 2, 5)
    expect(patternRepeat(pattern, 0.5)).toBeCloseTo(pattern.repeat * 2, 5)
    expect(patternRepeat(pattern, 2)).toBeLessThan(patternRepeat(pattern, 1))
  })

  it('битый или выпавший за границы множитель возвращается в строй', () => {
    const pattern = CAR_PATTERNS.find(item => item.tile)!
    expect(patternRepeat(pattern, 99)).toBeCloseTo(pattern.repeat / PATTERN_SCALE_MAX, 5)
    expect(patternRepeat(pattern, 0.01)).toBeCloseTo(pattern.repeat / PATTERN_SCALE_MIN, 5)
    expect(patternRepeat(pattern, 0)).toBeCloseTo(pattern.repeat, 5)
    expect(patternRepeat(pattern, Number.NaN)).toBeCloseTo(pattern.repeat, 5)
    expect(patternScale(undefined)).toBe(1)
  })

  it('покрытие с картой всегда задаёт mix и повтор', () => {
    for (const coverage of CAR_COVERAGES.filter(item => item.tile)) {
      expect(coverage.tileMix).toBeGreaterThan(0)
      expect(coverage.tileRepeat).toBeGreaterThan(1)
    }
  })

  it('clearcoat матового ниже, чем у краски', () => {
    const gloss = resolveCoverage('gloss')
    const matte = resolveCoverage('matte')
    expect(matte.clearcoat).toBeLessThan(gloss.clearcoat)
    expect(matte.roughness).toBeGreaterThan(gloss.roughness)
  })
})

describe('resolve', () => {
  it('неизвестный id даёт первое значение, а не undefined', () => {
    expect(resolveColor('nope').id).toBe(CAR_PAINT_COLORS[0]?.id)
    expect(resolvePattern('nope').id).toBe(CAR_PATTERNS[0]?.id)
    expect(resolveCoverage('nope').id).toBe(CAR_COVERAGES[0]?.id)
  })

  it('выбор по умолчанию есть во всех трёх осях', () => {
    const selection = defaultCarSelection()
    expect(CAR_PAINT_COLORS.some(color => color.id === selection.color)).toBe(true)
    expect(CAR_PATTERNS.some(pattern => pattern.id === selection.pattern)).toBe(true)
    expect(CAR_COVERAGES.some(coverage => coverage.id === selection.coverage)).toBe(true)
    /* Стартовое состояние — «без цвета» под печатью «Сакура»: кейс открывается
       материалом ровно таким, каким его отдал заказчик. */
    expect(selection.color).toBe('none')
    expect(selection.pattern).toBe('cherry')
    expect(resolvePattern(selection.pattern).tile).toBe('cherry')
    expect(selection.scale).toBe(1)
  })
})

describe('withPaint', () => {
  const base = { color: 'none', pattern: 'cherry', scale: 1.5, coverage: 'matte' }

  it('цвет снимает узор', () => {
    expect(withPaint(base, 'color', 'racing-red')).toEqual({ ...base, color: 'racing-red', pattern: 'none' })
  })

  it('узор снимает цвет', () => {
    const painted = { ...base, color: 'racing-red', pattern: 'none' }
    expect(withPaint(painted, 'pattern', 'tiger')).toEqual({ ...painted, color: 'none', pattern: 'tiger' })
  })

  it('«без цвета» и «без узора» другую ось не трогают', () => {
    expect(withPaint(base, 'color', 'none')).toEqual(base)
    const painted = { ...base, color: 'racing-red', pattern: 'none' }
    expect(withPaint(painted, 'pattern', 'none')).toEqual(painted)
  })

  it('покрытие не трогает ни цвет, ни узор', () => {
    expect(withPaint(base, 'coverage', 'gloss')).toEqual({ ...base, coverage: 'gloss' })
  })
})

describe('carTextureBase', () => {
  it('берёт папку textures рядом с GLB', () => {
    expect(carTextureBase('/media/projects/rp-grand/coupe-gt-lod0.glb'))
      .toBe('/media/projects/rp-grand/textures')
  })
})

describe('оптика', () => {
  /* Машина длиной вдоль оси Z: перед в -Z, зад в +Z. */
  const split = lampSplitFromCenters([0, 0.5, -1.4], [0, 0.6, 3.1])!
  /* Матрица 4×4 — тот же тип, что у three (`Matrix4.elements`), только без
     самого three в тесте: нужны лишь элементы. */
  type MatrixTuple = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]
  const IDENTITY: MatrixTuple = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

  it('разделитель идёт по середине между бамперами и смотрит вперёд', () => {
    expect(split.origin[2]).toBeCloseTo(0.85, 5)
    /* Бамперы висят на разной высоте, поэтому «вперёд» чуть наклонено вниз. */
    expect(split.forward[2]).toBeCloseTo(-1, 2)
    expect(split.forward[1]).toBeLessThan(0)
    expect(Math.hypot(...split.forward)).toBeCloseTo(1, 5)
    expect(lampSide([0, 1.3, -1.5], split)).toBe('front')
    expect(lampSide([0, 1.3, 3.3], split)).toBe('rear')
  })

  it('разделитель не завязан на ось: та же машина поперёк работает так же', () => {
    /* Ни ось, ни её знак в коде не зашиты — машина может лежать как угодно. */
    const across = lampSplitFromCenters([4, 0, 0], [-4, 0, 0])!
    expect(lampSide([3, 0, 0], across)).toBe('front')
    expect(lampSide([-3, 0, 0], across)).toBe('rear')
  })

  it('совпавшие бамперы разделителя не дают', () => {
    expect(lampSplitFromCenters([0, 0, 1], [0, 0, 1])).toBeNull()
  })

  it('оптика опознаётся по имени ноды или материала', () => {
    expect(lampSideFromNames(['lamp_front_a', 'body'])).toBe('front')
    expect(lampSideFromNames(['m_LampRear'])).toBe('rear')
    /* Метка читается в любом месте имени и в привычных словах тоже. */
    expect(lampSideFromNames(['headlight_left'])).toBe('front')
    expect(lampSideFromNames(['m_Taillight'])).toBe('rear')
    /* Фары и стопы на одном материале — сторону считает разделитель. */
    expect(lampSideFromNames(['lamp', 'body'])).toBe('single')
    /* Светящиеся элементы называют по цвету свечения: белое — фары, красное —
       стопы. Другой информации о стороне у такого имени нет. */
    expect(lampSideFromNames(['white_emissive'])).toBe('front')
    expect(lampSideFromNames(['red_emissive'])).toBe('rear')

    /* Стёкла и кузов за оптику не считаются, даже когда лежат с ней в одном
       примитиве: геометрия детали экспортёра о зоне не говорит. */
    expect(lampSideFromNames(['glass_a', 'm_Glass'])).toBeNull()
    expect(lampSideFromNames(['Plane072_2', 'body', 'm_Body'])).toBeNull()
  })

  it('треугольники оптики расходятся по сторонам, фары идут первыми', () => {
    /* Два треугольника: один у фар, второй у стопов. Вершины сложены подряд,
       как их и отдаёт декодер: индекса у геометрии нет. */
    const points: [number, number, number][] = [
      [-1, 1, -1.6], [1, 1, -1.6], [0, 1, -1.2],
      [-1, 1, 3.0], [1, 1, 3.0], [0, 1, 3.4],
    ]
    const geometry = {
      count: points.length,
      getX: (i: number) => points[i]![0],
      getY: (i: number) => points[i]![1],
      getZ: (i: number) => points[i]![2],
    }

    const plan = planLampSplit(geometry, null, split)!
    expect(plan.front).toEqual([0, 1, 2])
    expect(plan.rear).toEqual([3, 4, 5])

    /* С общим индексом раскладка та же. */
    const indexed = planLampSplit(geometry, [3, 4, 5, 0, 1, 2], split)!
    expect(indexed.front).toEqual([0, 1, 2])
    expect(indexed.rear).toEqual([3, 4, 5])
  })

  it('разделитель переводится в координаты меша, а не берётся мировым', () => {
    /* Бамперы считаются по сцене, а геометрия фары лежит в координатах своей
       ноды: у кузова смещение — почти два метра по длине, и мировая плоскость
       резала бы фару не там, где надо. */
    const world = lampSplitFromCenters([0, 0.5, 0.487], [0, 0.87, 0.869])!
    expect(world.origin[2]).toBeCloseTo(0.678, 3)

    const points: [number, number, number][] = [
      [-0.8, 0.1, -5.0], [0.8, 0.1, -5.0], [0, 0.3, -4.6],
      [-0.8, 0.1, -0.19], [0.8, 0.1, -0.19], [0, 0.3, -0.6],
    ]
    const geometry = {
      count: points.length,
      getX: (i: number) => points[i]![0],
      getY: (i: number) => points[i]![1],
      getZ: (i: number) => points[i]![2],
    }

    /* Мировая плоскость на локальной геометрии: вся оптика уезжает в одну
       сторону, делить нечего. */
    expect(planLampSplit(geometry, null, world)).toBeNull()

    /* Обратная матрица мира ноды (сдвиг +1.654 по длине) переносит плоскость
       туда, где лежит геометрия — фары и стопы расходятся по сторонам. */
    const toMeshSpace: { elements: MatrixTuple } = { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -1.654, 1] }
    const local = lampSplitInMeshSpace(toMeshSpace, world)
    expect(local.origin[2]).toBeCloseTo(-0.976, 3)
    expect(lampSplitInMeshSpace({ elements: IDENTITY }, world)).toEqual(world)

    const plan = planLampSplit(geometry, null, local)!
    expect(plan.front).toEqual([0, 1, 2])
    expect(plan.rear).toEqual([3, 4, 5])
  })

  it('оптика с одной стороны не делится', () => {
    const points: [number, number, number][] = [[0, 0, -1.5], [1, 0, -1.5], [0, 0, -1.1]]
    const geometry = {
      count: points.length,
      getX: (i: number) => points[i]![0],
      getY: (i: number) => points[i]![1],
      getZ: (i: number) => points[i]![2],
    }
    expect(planLampSplit(geometry, null, split)).toBeNull()
  })

  it('колпак фары — диффузорное стекло: преломляет фон, анфас матовое молоко, по касательной зеркало', () => {
    /* Колпак — толстое стекло с transmission (настоящее преломление фона
       за колпаком), а не тонировка кузова: за ним лежит источник света.
       Анфас — лёгкая плёнка молока (голые диоды сквозь неё не видны),
       по касательной — почти зеркало. */
    expect(CAR_LAMP.lens.transmission).toBeGreaterThan(0.8)
    expect(CAR_LAMP.lens.transmission).toBeLessThan(0.95)
    expect(CAR_LAMP.lens.thickness).toBeGreaterThan(0.4)
    expect(CAR_LAMP.lens.attenuationDistance).toBeGreaterThan(0)
    expect(CAR_LAMP.lens.face).toBeGreaterThanOrEqual(0.25)
    expect(CAR_LAMP.lens.face).toBeLessThan(0.5)
    expect(CAR_LAMP.lens.edge).toBeGreaterThan(0.6)
    expect(CAR_LAMP.lens.edge).toBeGreaterThan(CAR_LAMP.lens.face * 2)
    expect(CAR_LAMP.lens.ior).toBeGreaterThan(1)
    /* Блик кромки — холодный и заметный, но не заливка. */
    expect(CAR_LAMP.lens.rim).toBeGreaterThan(0)
    expect(CAR_LAMP.lens.rim).toBeLessThan(1)

    /* Светящиеся элементы: белое вперёд, красное назад — и оба заметно ярче
       запасного варианта, который один на всю оптику. */
    expect(CAR_LAMP.glow.front.emissive).not.toBe(CAR_LAMP.glow.rear.emissive)
    /* Яркость держится около единицы: элемент светит без тонмаппинга,
       а всё, что выше единицы, — уже выбеленная площадка без ядра и чаши. */
    expect(CAR_LAMP.glow.front.intensity).toBeGreaterThan(0.8)
    expect(CAR_LAMP.glow.front.intensity).toBeLessThan(1.4)
    expect(CAR_LAMP.glow.rear.intensity).toBeLessThan(1.4)
    expect(CAR_LAMP.glow.single.intensity).toBeLessThan(CAR_LAMP.glow.front.intensity)
    expect(CAR_LAMP.glow.single.intensity).toBeLessThan(CAR_LAMP.glow.rear.intensity)

    /* Чаша и ядро: нормаль выгибается (dome), у края свет тускнеет (dim),
       между ядром и краем проходит полоса модуля (ring). */
    for (const glow of Object.values(CAR_LAMP.glow)) {
      expect(glow.dome).toBeGreaterThan(0)
      expect(glow.dim).toBeGreaterThan(0)
      expect(glow.dim).toBeLessThan(1)
      expect(glow.ring).toBeGreaterThan(0)
    }
  })

  it('острова оптики получают свою ось и центр', () => {
    /* Два плоских острова: тонкая полоса и квадрат. Вершины лежат врозь —
       общих вершин у островов нет, как и в файле машины. */
    const points: [number, number, number][] = [
      /* полоса 0.4 м по X и 0.02 м по Y, центр в начале координат */
      [-0.2, -0.01, 1], [0.2, -0.01, 1], [0.2, 0.01, 1], [-0.2, 0.01, 1],
      /* площадка 0.2 × 0.1 м с центром в (2, 0, 0), тоже длинная по X */
      [1.9, -0.05, 0], [2.1, -0.05, 0], [2.1, 0.05, 0], [1.9, 0.05, 0],
    ]
    const position = {
      count: points.length,
      getX: (i: number) => points[i]![0],
      getY: (i: number) => points[i]![1],
      getZ: (i: number) => points[i]![2],
    }
    const islands = lampIslandAttributes(position, [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])!

    /* Координата нормирована на длинную сторону острова: у полосы это 0.4,
       у площадки — 0.2. Обе идут от центра, поэтому край — это ±0.5. */
    expect(islands.uv[0]).toBeCloseTo(-0.5, 5)
    expect(islands.uv[1]).toBeCloseTo(-0.025, 5)
    expect(islands.uv[2 * 7]).toBeCloseTo(-0.5, 5)
    expect(islands.uv[2 * 7 + 1]).toBeCloseTo(0.25, 5)
    /* Длинная ось острова — та, что задаёт каркас чаши. */
    expect(Array.from(islands.axis.slice(0, 3))).toEqual([1, 0, 0])
  })

  it('острова считаются и без индекса, а без треугольников их нет', () => {
    const points: [number, number, number][] = [
      [0, 0, 0], [1, 0, 0], [0, 1, 0],
    ]
    const position = {
      count: points.length,
      getX: (i: number) => points[i]![0],
      getY: (i: number) => points[i]![1],
      getZ: (i: number) => points[i]![2],
    }
    const islands = lampIslandAttributes(position, null)!
    expect(islands.uv.length).toBe(points.length * 2)
    expect(islands.axis.length).toBe(points.length * 3)
    /* Форма острова тут — треугольник: длинная сторона та же, по X. */
    expect(islands.uv[2]).toBeCloseTo(0.5, 5)
    expect(islands.uv[3]).toBeCloseTo(-0.5, 5)

    expect(lampIslandAttributes({ count: 0, getX: () => 0, getY: () => 0, getZ: () => 0 }, null)).toBeNull()
  })

  it('светящийся элемент отличается от колпака по имени', () => {
    /* Светит то, что назвали `*emissive*`/`*glow*`/`drl`; колпак (`lamp`,
       `light`) становится прозрачным стеклом, а не фонарём. */
    expect(isLampGlow(['white_emissive'])).toBe(true)
    expect(isLampGlow(['red_emissive'])).toBe(true)
    expect(isLampGlow(['m_GlowRear'])).toBe(true)
    expect(isLampGlow(['Plane072_1', 'body', 'm_Lamp'])).toBe(false)
    expect(isLampGlow(['glass_a', 'm_Glass'])).toBe(false)
  })
})
