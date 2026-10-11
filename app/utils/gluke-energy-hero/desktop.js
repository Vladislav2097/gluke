/* Конфиг Desktop. Все координаты — пиксели карточки hero из макета
   «Анимация.svg» (1200×493, начало в левом верхнем углу карточки). Движок пересчитывает их под
   фактический размер блока. Этот же объект сохраняет и загружает лаборатория. */

export const DESKTOP = {
  version: 3,
  ref: { width: 1200, height: 493 },

  palette: {
    energy: '#FFE417', // цвет энергии (как в Energy Fill)
    hot: '#FFFBE0', // раскалённое ядро
    dormant: '#404F7E', // знак до заряда
    ctaDark: '#2C3658',
    ctaDarkText: '#8A93B2',
    ctaYellow: '#F4DE3C',
    ctaText: '#1B2339',
  },

  timing: {
    speed: 1,
    loop: false,
    loopPause: 3,
    /* offset — сдвиг старта фазы относительно конца предыдущей (минус —
       перекрытие), duration — длительность. */
    phases: {
      intro: { offset: 0, duration: 0.4 },
      ignite: { offset: 0, duration: 1.5 }, // энергия зарождается внутри знака и заливает его
      charge: { offset: 0, duration: 0.8 },
      pulse: { offset: 0, duration: 0.5 },
      form: { offset: -0.45, duration: 1.15 }, // волна от знака проходит по блоку, слова загораются за ней
      hold: { offset: 0, duration: 0.8 },
      collect: { offset: 0, duration: 0.25 }, // слова срываются с места
      stream: { offset: 0, duration: 0.5 }, // слова кометами влетают в кнопку
      ctaImpact: { offset: 0, duration: 0.35 },
      dissolve: { offset: 0, duration: 0.9 },
    },
  },

  logo: {
    x: 870,
    y: 224,
    size: 321, // высота знака, px (как в макете)
    rotation: 0, // градусы; 0 — знак как в шапке сайта
    detail: 1,
    fillShare: 0.85, // доля фазы «Зарождение», за которую идёт заливка
    ember: 1.1, // яркость ядра, в котором зарождается энергия
    emberSize: 0.045, // радиус ядра (доля знака)
    fillEasing: 'inOutQuad',
    frontWidth: 0.06,
    frontGlow: 1.4,
    fillNoise: 0.1,
    noiseScale: 7,
    frontFlow: 0.5,
    grain: 0.12,
    grainScale: 14,
    grainSteps: 7,
    idle: 0.12,
    idleShape: 1.3,
    idleSpeed: 0.15,
    idleTight: 5,
    rim: 0, // подсветка кромки — у логотипа её нет
    rimWidth: 0.14,
    halo: 0.35,
    haloWidth: 0.3,
    soft: 0.55,
    softWidth: 0.29,
    bloom: 0.2,
    bloomWidth: 0.24,
    burst: 0,
    burstScale: 3.5,
    burstSpeed: 0.5,
    dormant: 0.55,
    chargeGlow: 0.7, // прирост свечения к концу зарядки
    chargeRipple: 0.35, // переливы энергии внутри при зарядке
    chargeRippleSpeed: 0.6,
    distortion: 0.012,
    fxExtent: 2.2, // размер области свечения в размерах знака
  },

  pulse: {
    strength: 1,
    flash: 1.1,
    flashDecay: 0.09, // сек: как быстро гаснет вспышка знака (меньше — резче)
    glow: 1.15,
    distortion: 0.03,
    afterGlow: 0.55, // уровень свечения знака после импульса
    /* Единая волна: одно кольцо от знака на весь блок. */
    waveIntensity: 1.35,
    waveWidth: 13, // px, толщина фронта
    waveTrail: 85, // px, мягкий свет за фронтом
    waveNoise: 0, // неровность фронта (0 — чистый круг)
    waveFade: 0.5, // насколько волна слабеет к краю
    waveDecel: 2.4, // торможение волны (1 — равномерно; больше — взрывной старт)
    waveReach: 1.15, // дальность: доля расстояния до дальнего края кнопки
    waveEdgeReach: 0, // > 0 — волна доходит до дальнего угла блока (× расстояние до него); 0 — выкл.
    particles: 520, // искры на фронте волны
    particleIntensity: 0.9,
    particleLength: 34,
  },

  words: {
    fontFamily: 'Inter, "Segoe UI", Arial, sans-serif',
    fontWeight: 400,
    fontSize: 18,
    letterSpacing: 0.02,
    color: '#FFFFFF',
    /* Маркер слева от слова, как в макете: полупрозрачное кольцо и жёлтая точка.
       x/y слова — центр маркера, текст начинается через gap. */
    marker: {
      gap: 20, // px от центра маркера до начала текста
      ring: 12, // радиус подложки
      ringOpacity: 0.2,
      dot: 4, // радиус жёлтой точки
      dotGlow: 0.6, // свечение точки
      dimColor: '#9AA3BF', // цвет точки до волны (режим dimStart): блёклый, не жёлтый
    },
    /* true — слова остаются на месте, как в макете; поток к кнопке — их копия.
       false — слова растворяются и стекают к кнопке (прежний режим). */
    keep: false,
    /* Яркость слов и маркеров до волны: 0 — появляются только с волной
       (стандарт), 0.3 — видны тускло с первой секунды, волна их проявляет. */
    dimStart: 0,
    reveal: {
      frontWidth: 12, // px: ширина фронта, которым волна «зажигает» буквы
      ragged: 26, // px: неровность фронта
      flare: 1.8, // вспышка букв на фронте
      glints: 900, // искры в буквах в момент касания волны (на все слова)
      glintLife: 0.35,
      glintIntensity: 1.2,
      intensity: 1,
      glow: 1,
      textScale: 1,
      opacity: 1,
      randomness: 0.5,
    },
    hold: {
      floating: 1,
      speed: 1,
      glow: 0.7,
      pulse: 0.25,
      finalGlow: 0.12, // свечение слов в финале (в макете — чистый белый текст)
    },
    items: [
      { text: 'ЛИДЫ', x: 730, y: 112, scale: 1, rotation: 0, glow: 1, opacity: 1, amplitude: 2, speed: 0.9 },
      { text: 'ОКУПАЕМОСТЬ', x: 982, y: 96, scale: 1, rotation: 0, glow: 1, opacity: 1, amplitude: 2, speed: 0.8 },
      { text: 'РОСТ', x: 669, y: 235, scale: 1, rotation: 0, glow: 1, opacity: 1, amplitude: 2, speed: 1 },
      { text: 'ПРОДАЖИ', x: 1030, y: 223, scale: 1, rotation: 0, glow: 1, opacity: 1, amplitude: 2, speed: 0.7 },
    ],
  },

  stream: {
    /* Слова стекают к кнопке по дорожке под текстом: через точку laneX/laneY
       проходит только изгиб траектории, частицы там не копятся. */
    convergence: 0.85,
    laneX: 560,
    laneY: 390,
    stagger: 0.06, // сек: сдвиг старта слов слева направо (летят почти залпом)
    travelEasing: 'inCubic', // рывок с места, в кнопку — на полной скорости
    travelScale: 0.7, // масштаб слова у кнопки
    dissolveFrom: 0.12, // доля времени полёта, с которой слово начинает растворяться
    dissolveTo: 0.72, // доля времени полёта, к которой слово растворилось полностью
    dissolveSoft: 0.07, // мягкость растворения букв (0.06 — резко, 0.3 — плавное угасание)
    markerDissolve: 0.35, // доля растворения, за которую гаснет маркер
    markerParticles: 40, // искры, в которые рассыпается маркер
    particles: 1600, // частицы потока на все слова
    cloudLength: 0.1, // длина облака частиц вдоль пути (доля пути)
    cloudAhead: 0.35, // доля облака, уходящая вперёд слова (остальное — хвост)
    cloudLoosen: 3, // как быстро облако расползается от формы букв
    behindLogo: true, // поток идёт за знаком, а не перечёркивает его
    entrySide: 'right', // откуда поток входит в кнопку: 'right' — справа, 'below' — снизу (mobile)
    entryOffset: 70, // px: точка входа отстоит от кнопки на столько
    streamWidth: 16,
    intensity: 1.7,
    glow: 1,
    trail: 0.09, // сек «размазки» частицы
    comet: 1.3, // яркость раскалённой головы кометы у каждого слова (0 — нет)
    cometTrail: 0.08, // сек: длина штриха головы
    particleSize: 1.6,
    arrivalSpread: 0.35,
    easing: 'inQuad',
    distortion: 0.5,
  },

  cta: {
    initialBrightness: 0,
    activationEasing: 'outCubic',
    yellow: 1,
    glow: 1,
    halo: 1,
    haloWidth: 26,
    impact: 1.5,
    flash: 1.4,
    ring: 1.3,
    anticipation: 0.35,
    finalGlow: 0.45,
    /* Кнопка заряжается основной волной: пока волна не дошла, внутри неё
       бегут волны энергии; фронт волны заливает кнопку жёлтым. 'stream' —
       прежний режим: кнопка желтеет, когда в неё приходит поток слов. */
    fillMode: 'wave',
    energy: 0.35, // яркость переливов энергии внутри кнопки до заливки
    energySpeed: 0.35, // скорость переливов
    energyStyle: 'liquid', // 'liquid' — переливы, как внутри знака; 'rings' — прежние кольца
    energyScale: 1, // размер «языков» переливов
    energyRings: 1.6, // (rings) сколько колец помещается от края кнопки до центра
    energyDir: 'in', // (rings) 'in' — к центру, 'out' — из центра
    fillSoft: 14, // px, мягкость края жёлтой заливки
    fillGlow: 0.9, // свечение фронта заливки на кнопке
    fillHalo: 0.6, // ореол кнопки в момент, когда её проходит волна
  },

  idle: {
    logoOff: 1, // после потока знак гаснет до статичного (0 — светится, как раньше)
    logoFadeOut: 0.8, // сек угасания знака
    logoStaticBody: 0.9, // яркость статичного знака
    logoPulseInterval: 3.6,
    logoPulseIntensity: 0.35,
    logoPulseWidth: 0.45,
    logoGlow: 0.45,
    ctaGlow: 0.45,
    ctaHalo: 0.8,
    ctaLight: 0.22, // постоянный свет вспышки вокруг кнопки
    ctaInner: 0.2, // доля этого света на самой кнопке
    ctaBlink: 0.35, // сила периодического «подмигивания»
    ctaBlinkInterval: 2.2,
    ctaBlinkWidth: 0.12,
  },

  render: {
    ratioCap: 2,
    pixelBudget: 2.6e6,
  },
}
