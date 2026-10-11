// Все настраиваемые параметры сцены. Значения подобраны визуально для демо (этап 2).
// Часть из них переписывают плоские параметры виджета (gluke-water.js, DEFAULTS) —
// то, что выведено в лабораторию кейса; остальное живёт здесь.
const SIMULATION_CONFIG = {
  // Пресеты качества. Выбор: опция `quality` виджета, иначе автоматически:
  // телефон — low, планшет — medium, компьютер — high.
  quality: {
    low: {
      pixelRatio: 1.5, // предел devicePixelRatio
      refraction: false, // отдельный проход преломления воды
      refractionScale: 0.5,
      simCellSize: 0.024, // м; ~240×75 ячеек
      stepsPerSecond: 120,
      transmissionScale: 0.6, // разрешение буфера преломления стекла
      shadowMapSize: 512,
      dispersion: false,
      bubbleFactor: 0.5,
    },
    medium: {
      pixelRatio: 1.5,
      refraction: true,
      refractionScale: 0.5,
      simCellSize: 0.018,
      stepsPerSecond: 180,
      transmissionScale: 0.8,
      shadowMapSize: 1024,
      dispersion: false,
      bubbleFactor: 0.75,
    },
    high: {
      pixelRatio: 2,
      refraction: true,
      refractionScale: 1,
      simCellSize: 0.012, // ~480×145 ячеек
      stepsPerSecond: 240,
      transmissionScale: 1,
      shadowMapSize: 2048,
      dispersion: true,
      bubbleFactor: 1,
    },
  },

  // Имена объектов в Молекула.blend (см. TZ.md, Приложение D)
  names: {
    outerShell: 'Sphere.002',
    innerShell: 'Sphere.006',
    fluidSeed: 'Plane', // плоскость уровня воды
    spheres: ['Icosphere', 'Icosphere.001', 'Icosphere.002', 'Icosphere.003', 'Icosphere.004'],
    letters: ['Letter_A', 'Letter_C', 'Letter_G'],
  },

  animation: {
    rotationSpeed: 0.35, // рад/с, задаётся сайтом через API
    maxFps: 60, // лимит кадров для мониторов 120–360 Гц (0 — без лимита)
    scrollRotation: Math.PI * 2, // доп. поворот за весь скролл
    hoverTilt: 0.12,
    follow: 0.7, // скорость догоняния угла скролла (1/с); follow·maxAngularVel ≤ maxAngularAccel — без перелёта
    velResponse: 4, // как быстро скорость догоняет желаемую (1/с)
    maxAngularVel: 1.6, // рад/с
    maxAngularAccel: 1.4, // рад/с²
    accelSmoothing: 5, // сглаживание ω/α, передаваемых воде
  },

  glassOuter: {
    color: '#eaf6ff',
    transmission: 1,
    roughness: 0.04,
    ior: 1.5,
    thickness: 0.13, // реальная толщина стенки (Sphere.002 − Sphere.006)
    maxPathFactor: 4, // предел удлинения пути луча у силуэта
    dispersion: 0.25,
    attenuationColor: '#7cc8ff',
    attenuationDistance: 1.2,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.6,
    specularIntensity: 1,
    rimAlpha: 0.25,
    edgeColor: '#7fc4f5', // свечение края толстой стенки (убирает тёмные края на скользящих углах)
    edgeStrength: 0.35,
    edgePower: 2.5,
  },

  // только отражения (без диффуза), складываются поверх того, что за стенкой
  glassInner: {
    opacity: 0.05,
    roughness: 0.18, // размывает отражения софтбоксов во вогнутой стенке
    envMapIntensity: 0.3,
    rimColor: '#9fd8ff',
    rimStrength: 0.35,
    rimPower: 4,
  },

  // «тело» стекла в буфере transmission (premultiplied rgb * a, a)
  glassBody: [0.5, 0.78, 1.0, 0.06],

  spheres: {
    color: '#0d2a40', // слабый диффуз: шарик виден по бликам и кромке
    roughness: 0.12,
    envMapIntensity: 1.2,
    iridescence: 0.25,
    coreAlpha: 0.06,
    rimAlpha: 0.55,
    rimColor: '#bfe8ff',
    radius: 0.114,
    buoyancy: 0.25, // доля радиуса над поверхностью
    aboveWater: true, // надводная часть рисуется поверх воды
    waterlineSoft: 0.006, // м — мягкость перехода на ватерлинии
    depthUnderWater: true, // глубина шариков в проходе преломления (вода перед шариком тонкая)
    underContrast: 1.6, // заметность подводной части сквозь воду
    forceResponse: 0.3,
    flowFollow: 1.5, // насколько шарик следует течению воды
    wander: 0.01,
    drag: 2.5,
    wallRange: 1.6, // отталкивание начинается на этом расстоянии (в радиусах)
    wallStiffness: 15,
    restitution: 0.3,
    maxSpeed: 0.35,
  },

  letters: {
    color: '#f4faff',
    emissive: '#e6f4ff',
    emissiveIntensity: 0.12,
    roughness: 0.45,
    clearcoat: 0.15,
    metalness: 0,
    height: 0.62,
    depth: 0.085, // ~14% высоты
    bevel: 0.014,
    z: 0, // центр по глубине трубки
    showTrianglePlaceholders: false,
    faceCamera: true, // буквы всегда повёрнуты к зрителю
    faceTilt: 0, // 0 — только вокруг вертикали, 1 — ещё и наклон к камере по высоте
    collider: 'cylinder', // невидимое препятствие для воды: 'cylinder' (любой поворот) | 'box'
    colliderPadding: 0, // м, запас коллайдера вокруг буквы
  },

  water: {
    shallowColor: '#5fc6f0',
    deepColor: '#0a3f8f',
    opacity: 0.38, // поглощение на полной глубине (на одну стенку)
    depthScale: 0.7,
    surfaceOpacity: 0.12,
    ripple: 0.0008, // мелкая рябь поверх симуляции, м
    mode: 'level', // 'level' — вода по Plane с шариками, 'high' — высокая вода до буквы C без шариков (?mode=high)
    // режим 'high': большая толща воды читается по движению внутри
    high: {
      levelMesh: 'Letter_C', // уровень — от низа этой буквы
      levelOffset: -0.04, // м — смещение уровня от низа буквы
      waves: 1, // насколько волнение симуляции (курсор, вращение) искажает толщу
      wobble: 1, // постоянное медленное колыхание преломления
      caustics: 0.35, // бегущие блики-каустики на стенках
      particles: {
        count: 320, // взвесь: микропузырьки и частицы (× bubbleFactor качества)
        voxel: 0.05, // м — шаг маски объёма
        size: 0.009, // м — средний радиус
        opacity: 0.8,
        rise: 0.04, // м/с — всплытие
        drift: 0.05, // м/с — плавное течение
        drag: 1.5, // как быстро частица подхватывает течение (1/с)
        spinUp: 2.5, // с — за сколько вода раскручивается вслед за молекулой
        inertia: 1, // сила отставания взвеси при вращении
        cursorPush: 0.6, // насколько курсор расталкивает взвесь
      },
    },
    levelOffset: 0, // смещение уровня от плоскости Plane, м
    refractionStrength: 0.12, // сила искажения волнами (при включённом преломлении)
    density: 1.3, // поглощение на метр пути в воде (при включённом преломлении)
    caustics: 0.06, // блики-каустики на стенках под водой
    foam: 1, // пена на поверхности у стенок и букв при быстром движении воды
    wallLine: 1, // светлая кромка на поверхности у стекла и букв
    surfaceSegmentsPerMeter: 64,
    dropStrength: 0.04,
    bubbles: 70,
    // GPU-симуляция поверхности (WaterSurfaceSim)
    sim: {
      maxStepsPerFrame: 8,
      waveSpeed: 0.9, // м/с — спокойнее реальной мелкой воды
      damping: 0.35,
      viscosity: 0.00002,
      relax: 0.05,
      gravity: 9.81,
      flowDamping: 0.6, // затухание течения (для шариков)
      forceScale: 0.16, // масштаб инерционных сил: модель ~6 ед. в ширину, реальные силы слишком велики
      ballWake: 0.6,
      cursorRadius: 0.18, // м — размер пятна, которым курсор возмущает воду
      cursorStrength: 1.2,
      cursorMaxSpeed: 3, // м/с — ограничение скорости курсора для воды
      cursorVertical: 0.5, // доля вертикального движения курсора, уходящая в движение воды «вглубь»
    },
  },

  glassBubbles: {
    count: 450,
    minSize: 0.004,
    maxSize: 0.014,
  },

  shadow: {
    opacity: 0.22,
  },
};

// Каждому экземпляру — своя копия: на странице кейса живут два виджета (шапка
// и лаборатория), и ползунки лаборатории не должны менять шапку.
export function createConfig() {
  return structuredClone(SIMULATION_CONFIG);
}
