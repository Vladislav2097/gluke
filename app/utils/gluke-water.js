/*!
 * GlukeWater — стеклянная молекула с водой внутри: GPU-симуляция поверхности,
 * плавающие шарики, буквы в долях молекулы. Виджет кейса `water`.
 *
 * Автор: Александр Глухов (GLUKE, https://gluke.ru, @Gluke_art).
 * © GLUKE, 2026. Свободное использование и доработка допускаются с сохранением
 * этой шапки и ссылки на gluke.ru; перепродажа движка как самостоятельного
 * продукта или выдача его за чужую разработку — без письменного согласия
 * автора. При сомнениях — gluke_art@mail.ru.
 *
 * Каркас тот же, что у остальных виджетов сайта: create/set/detach/reattach/
 * destroy, прозрачный канвас без собственной подложки, потолки dpr и площади
 * буфера, пауза вне экрана, уважение «уменьшить движение».
 *
 * Сама сцена живёт в `./gluke-water/` — модули перенесены из отдельного проекта
 * сцены (D:\Work\WEB\water\src) почти без правок и сверяются с ним, поэтому
 * сохраняют его оформление. Здесь — обвязка сайта: цикл кадров, размер по
 * контейнеру, прокрутка страницы и плоские параметры для лаборатории кейса.
 * Каждому параметру соответствует одна настройка исходной панели lil-gui;
 * дефолты — её сохранённые значения (`config/defaultSettings.js` проекта).
 */

import { attachRunSources, createRunGate } from './widgetRunGate'
import { MoleculeViewer } from './gluke-water/molecule-viewer.js'

const DEFAULTS = {
  /** Путь к .glb молекулы. Обязателен: имена объектов — в `gluke-water/config.js`. */
  model: '',
  /** 'low' | 'medium' | 'high'; пусто — по устройству (телефон, планшет, компьютер). */
  quality: '',
  maxFps: 60, // лимит кадров для мониторов 120–360 Гц; 0 — без лимита
  scroll: true, // прокрутка страницы доворачивает молекулу

  // --- движение ---
  rotationSpeed: 0.45, // рад/с
  scrollRotation: 6.52, // поворот за всю прокрутку страницы, рад
  follow: 1.75, // как быстро угол догоняет прокрутку, 1/с
  maxAngularVel: 2.85, // рад/с
  maxAngularAccel: 1.4, // рад/с²
  velResponse: 3.8, // как быстро скорость догоняет желаемую, 1/с
  accelSmoothing: 5, // сглаживание ω и α, которые уходят воде
  hoverTilt: 0.4, // параллакс камеры от курсора
  modelScale: 1, // масштаб в кадре: 1 — крупно и без обрезки при любом повороте, больше — с обрезкой

  // --- слои и режим ---
  glassOn: 1,
  waterOn: 1,
  ballsOn: 1,
  lettersOn: 1,
  highWater: 0, // 1 — высокая вода до нижней кромки буквы O, без шариков, со взвесью

  // --- стекло, внешняя стенка ---
  glassThickness: 0.145,
  glassIor: 1.46,
  glassDispersion: 0.52, // на телефоне и планшете выключена пресетом качества
  glassClearcoat: 0.48,
  glassRim: 0.19,
  glassEdge: 0.41, // свечение края толстой стенки
  glassEdgePower: 3.2,
  glassBody: 0.055, // плотность «тела» стекла в буфере преломления
  glassBubbles: 0.73, // пузырьки воздуха в толще стекла
  glassColor: '#d5e5f0',
  glassTint: '#80accb',
  glassEdgeColor: '#a1c4de',

  // --- стекло, внутренняя стенка ---
  innerRim: 0.12,
  innerRimPower: 3.5,
  innerRoughness: 0.11,
  innerRimColor: '#9fd8ff',

  // --- вода, вид ---
  waterDepth: 0.53, // глубина до полного цвета, м
  ripple: 0.0092, // мелкая рябь поверх симуляции, м
  dropStrength: 0.1, // сила встряхивания по щелчку
  caustics: 0.25,
  foam: 1.1,
  waterLevel: -0.005, // смещение уровня от плоскости Plane, м
  refraction: 0.185, // искажение волнами (на телефоне прохода преломления нет)
  absorption: 2.2, // поглощение толщи на метр пути
  waterShallow: '#5fc6f0',
  waterDeep: '#0a3f8f',

  // --- вода, режим «высокая вода» ---
  highLevel: -0.04, // уровень от нижней кромки буквы O, м
  highWaves: 1,
  highWobble: 1,
  highCaustics: 0.35,
  silt: 0.8, // заметность взвеси
  siltSize: 0.009, // м
  siltRise: 0.04, // м/с
  siltDrift: 0.05, // м/с
  siltInertia: 1, // отставание взвеси при вращении
  spinUp: 2.5, // за сколько секунд вода раскручивается вслед за молекулой
  siltCursor: 0.6,

  // --- вода, GPU-симуляция ---
  waveSpeed: 0.9, // м/с
  waveDamping: 0.35,
  viscosity: 2, // ×1e-5: у исходной панели шаг 0.000001, ползунку сайта нужны читаемые числа
  relax: 0.05, // возврат к уровню покоя
  spinResponse: 1, // реакция воды на вращение молекулы
  cursorStrength: 1.2,
  cursorRadius: 0.18, // м
  cursorMaxSpeed: 3, // м/с
  cursorVertical: 0.5, // доля вертикального движения курсора, уходящая «вглубь»
  ballWake: 0.6,
  flowDamping: 0.6,

  // --- шарики ---
  ballCore: 0.17,
  ballRim: 0.33,
  ballRoughness: 0.36,
  ballAbove: 1, // надводная часть рисуется поверх воды
  ballRadius: 0.116,
  buoyancy: 0.25, // над водой, доля радиуса
  flowFollow: 0.8,
  forceResponse: 3.75,
  ballWander: 0.01,
  ballDrag: 1.4,
  ballMaxSpeed: 0.4,
  wallStiffness: 68,
  wallRange: 1.6,
  restitution: 0.63,
  ballColor: '#36414a',
  ballRimColor: '#5dbff8',

  // --- буквы ---
  letterGlow: 0.12,
  faceCamera: 1, // буквы всегда повёрнуты к зрителю
  faceTilt: 0,
  letterColor: '#f4faff',
  letterEmissive: '#e6f4ff',

  // --- свет ---
  exposure: 1.1,
  keyLight: 2.2,
  rimLight: 30,
  fillLight: 12,

  // --- бюджет ---
  ratioCap: 2,
  pixelBudget: 2.2e6,
  pauseOffscreen: true,
  respectReducedMotion: true,
}

/* Уровень воды перестраивает маску и сетку симуляции (сечение оболочки и букв
   на CPU и новый GPGPU) — на каждое событие ползунка это рывки. Применяем,
   когда ползунок остановился. */
const LEVEL_DELAY = 150
const LEVEL_KEYS = new Set(['waterLevel', 'highLevel'])

const on = v => Number(v) > 0.5

/* Куда уходит каждый плоский параметр. Ссылки берутся у вьювера заново на
   каждый вызов: после смены уровня симуляция пересобирает свои текстуры. */
const glass = w => w.shell.outer.material
const glassU = w => glass(w).userData.uniforms
const inner = w => w.shell.innerLayers.map(l => l.material)
const waterU = w => w.water.uniforms
const sim = w => w.water.sim
const simU = w => w.water.sim.uniforms
const silt = w => w.cfg.water.high.particles
const balls = w => w.spheres.materials
const ballU = w => w.spheres.materials[0].userData.uniforms
const sp = w => w.cfg.spheres
const letter = w => w.letters.material
const anim = key => (v, w) => {
  w.cfg.animation[key] = v
}

const PARAMS = {
  rotationSpeed: (v, w) => w.setRotationSpeed(v),
  scrollRotation: anim('scrollRotation'),
  follow: anim('follow'),
  maxAngularVel: anim('maxAngularVel'),
  maxAngularAccel: anim('maxAngularAccel'),
  velResponse: anim('velResponse'),
  accelSmoothing: anim('accelSmoothing'),
  /* Наклон от курсора меняет диапазон углов камеры — посадку надо пересчитать. */
  hoverTilt: (v, w) => {
    w.cfg.animation.hoverTilt = v
    w.fitCamera()
  },
  modelScale: (v, w) => {
    w.modelScale = v
    w.fitCamera()
  },

  glassOn: (v, w) => w.shell.setGlassVisible(on(v)),
  waterOn: (v, w) => {
    w.water.visible = on(v)
  },
  ballsOn: (v, w) => w.setSpheresVisible(on(v)),
  lettersOn: (v, w) => {
    w.letters.visible = on(v)
  },
  highWater: (v, w) => w.setWaterMode(on(v) ? 'high' : 'level'),

  glassThickness: (v, w) => {
    glass(w).thickness = v
  },
  glassIor: (v, w) => {
    glass(w).ior = v
  },
  glassDispersion: (v, w) => {
    glass(w).dispersion = w.quality.dispersion ? v : 0
  },
  glassClearcoat: (v, w) => {
    glass(w).clearcoat = v
  },
  glassRim: (v, w) => {
    glassU(w).uRimAlpha.value = v
  },
  glassEdge: (v, w) => {
    glassU(w).uEdgeStrength.value = v
  },
  glassEdgePower: (v, w) => {
    glassU(w).uEdgePower.value = v
  },
  glassBody: (v, w) => {
    w.backdrop.material.uniforms.uColor.value.w = v
  },
  glassBubbles: (v, w) => {
    w.shell.bubbles.material.uniforms.uOpacity.value = v
  },
  glassColor: (v, w) => glass(w).color.set(v),
  glassTint: (v, w) => glass(w).attenuationColor.set(v),
  glassEdgeColor: (v, w) => glassU(w).uEdgeColor.value.set(v),

  innerRim: (v, w) => inner(w).forEach((m) => {
    m.userData.uniforms.uRimStrength.value = v
  }),
  innerRimPower: (v, w) => inner(w).forEach((m) => {
    m.userData.uniforms.uRimPower.value = v
  }),
  innerRoughness: (v, w) => inner(w).forEach((m) => {
    m.roughness = v
  }),
  innerRimColor: (v, w) => inner(w).forEach(m => m.userData.uniforms.uRimColor.value.set(v)),
  waterDepth: (v, w) => {
    waterU(w).uDepthScale.value = v
  },
  ripple: (v, w) => {
    waterU(w).uRipple.value = v
  },
  dropStrength: (v, w) => {
    w.cfg.water.dropStrength = v
  },
  caustics: (v, w) => {
    waterU(w).uCaustics.value = v
  },
  foam: (v, w) => {
    waterU(w).uFoam.value = v
  },
  waterLevel: (v, w) => {
    if (v !== w.water.cfg.levelOffset) w.water.setLevelOffset(v)
  },
  refraction: (v, w) => {
    waterU(w).uRefrStrength.value = v
  },
  absorption: (v, w) => {
    waterU(w).uDensity.value = v
  },
  waterShallow: (v, w) => waterU(w).uShallow.value.set(v),
  waterDeep: (v, w) => waterU(w).uDeep.value.set(v),

  highLevel: (v, w) => {
    if (v !== w.water.cfg.high.levelOffset) w.water.setHighLevelOffset(v)
  },
  highWaves: (v, w) => {
    waterU(w).uHighWaves.value = v
  },
  highWobble: (v, w) => {
    waterU(w).uHighWobble.value = v
  },
  highCaustics: (v, w) => {
    waterU(w).uHighCaustics.value = v
  },
  silt: (v, w) => {
    w.water.particles.mesh.material.uniforms.uOpacity.value = v
  },
  siltSize: (v, w) => {
    silt(w).size = v
  },
  siltRise: (v, w) => {
    silt(w).rise = v
  },
  siltDrift: (v, w) => {
    silt(w).drift = v
  },
  siltInertia: (v, w) => {
    silt(w).inertia = v
  },
  spinUp: (v, w) => {
    silt(w).spinUp = v
  },
  siltCursor: (v, w) => {
    silt(w).cursorPush = v
  },

  waveSpeed: (v, w) => {
    simU(w).uC2.value = v * v
  },
  waveDamping: (v, w) => {
    simU(w).uDamping.value = v
  },
  viscosity: (v, w) => {
    simU(w).uViscosity.value = v * 1e-5
  },
  relax: (v, w) => {
    simU(w).uRelax.value = v
  },
  spinResponse: (v, w) => {
    sim(w).cfg.forceScale = v
  },
  cursorStrength: (v, w) => {
    simU(w).uCursorStrength.value = v
  },
  cursorRadius: (v, w) => {
    simU(w).uCursorRadius.value = v
  },
  cursorMaxSpeed: (v, w) => {
    sim(w).cfg.cursorMaxSpeed = v
  },
  cursorVertical: (v, w) => {
    sim(w).cfg.cursorVertical = v
  },
  ballWake: (v, w) => {
    simU(w).uBallWake.value = v
  },
  flowDamping: (v, w) => {
    simU(w).uFlowDamping.value = v
  },

  ballCore: (v, w) => {
    ballU(w).uCoreAlpha.value = v
  },
  ballRim: (v, w) => {
    ballU(w).uRimAlpha.value = v
  },
  ballRoughness: (v, w) => balls(w).forEach((m) => {
    m.roughness = v
  }),
  ballAbove: (v, w) => {
    ballU(w).uAboveOn.value = on(v) ? 1 : 0
  },
  ballRadius: (v, w) => {
    sp(w).radius = v
    for (const b of w.spheres.items) b.mesh.scale.setScalar(v)
  },
  buoyancy: (v, w) => {
    sp(w).buoyancy = v
  },
  flowFollow: (v, w) => {
    sp(w).flowFollow = v
  },
  forceResponse: (v, w) => {
    sp(w).forceResponse = v
  },
  ballWander: (v, w) => {
    sp(w).wander = v
  },
  ballDrag: (v, w) => {
    sp(w).drag = v
  },
  ballMaxSpeed: (v, w) => {
    sp(w).maxSpeed = v
  },
  wallStiffness: (v, w) => {
    sp(w).wallStiffness = v
  },
  wallRange: (v, w) => {
    sp(w).wallRange = v
  },
  restitution: (v, w) => {
    sp(w).restitution = v
  },
  ballColor: (v, w) => balls(w).forEach(m => m.color.set(v)),
  ballRimColor: (v, w) => ballU(w).uRimColor.value.set(v),

  letterGlow: (v, w) => {
    letter(w).emissiveIntensity = v
  },
  faceCamera: (v, w) => {
    w.cfg.letters.faceCamera = on(v)
  },
  faceTilt: (v, w) => {
    w.cfg.letters.faceTilt = v
  },
  letterColor: (v, w) => letter(w).color.set(v),
  letterEmissive: (v, w) => letter(w).emissive.set(v),

  exposure: (v, w) => {
    w.renderer.toneMappingExposure = v
  },
  keyLight: (v, w) => {
    w.lights.key.intensity = v
  },
  rimLight: (v, w) => {
    w.lights.rim.intensity = v
  },
  fillLight: (v, w) => {
    w.lights.fill.intensity = v
  },
}

class Widget {
  constructor(el, options) {
    const host = typeof el === 'string' ? document.querySelector(el) : el
    if (!host) throw new Error('GlukeWater: контейнер не найден')

    this.el = host
    this.o = Object.assign({}, DEFAULTS, options || {})
    if (!this.o.model) throw new Error('GlukeWater: не задана модель')
    this.ready = false
    this.destroyed = false
    this.raf = null
    /* Сторож кадров живёт вместе с виджетом (переживает detach/reattach),
       а источники и подписка создаются в bindRunSources(). */
    this.gate = null
    this.gateOff = null
    this.sources = null
    this.levelTimer = null
    this.frozen = this.o.respectReducedMotion
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    this.viewer = new MoleculeViewer(host, {
      model: this.o.model,
      quality: this.o.quality || undefined,
      maxFps: this.o.maxFps,
      ratioCap: this.o.ratioCap,
      pixelBudget: this.o.pixelBudget,
      waterMode: on(this.o.highWater) ? 'high' : 'level',
      rotationSpeed: this.o.rotationSpeed,
      modelScale: this.o.modelScale,
    })
    /* Уровни — до загрузки: сетка симуляции сразу строится на нужной высоте,
       а не перестраивается вторым проходом после первого применения. */
    this.viewer.cfg.water.levelOffset = this.o.waterLevel
    this.viewer.cfg.water.high.levelOffset = this.o.highLevel
    this.viewer.paused = this.frozen
    this.canvas = this.viewer.renderer.domElement
    host.__glukeWater = this

    this.bind()
    this.bindRunSources()
    this.viewer.load().then(() => {
      if (this.destroyed) return
      this.ready = true
      for (const key of Object.keys(PARAMS)) this.apply(key)
      this.onScroll()
      this.start()
      if (!this.raf) this.draw(performance.now(), true)
    }).catch((error) => {
      console.error('[gluke-water] не удалось загрузить сцену', error)
    })
  }

  apply(key) {
    const fn = PARAMS[key]
    if (!fn) return
    try {
      fn(this.o[key], this.viewer)
    }
    catch (error) {
      /* Ошибка одного параметра не должна обрывать остальные — так же
         исходная панель загружала сохранённые настройки по одной. */
      console.warn('[gluke-water]', key, error)
    }
  }

  bind() {
    this.onResize = () => {
      if (this.ready) this.viewer.onResize()
    }
    if (window.ResizeObserver) {
      this.ro = new ResizeObserver(this.onResize)
      this.ro.observe(this.el)
    }
    else {
      window.addEventListener('resize', this.onResize)
    }

    /* Прокрутка страницы → поворот и угол обзора: та же связка, что
       в исходной сцене, только от страницы сайта целиком. */
    this.onScroll = () => {
      if (!this.o.scroll) return
      const max = document.documentElement.scrollHeight - window.innerHeight
      this.viewer.setScrollProgress(max > 0 ? window.scrollY / max : 0)
    }
    window.addEventListener('scroll', this.onScroll, { passive: true })
  }

  /* Источники кадров: активность вкладки и пересечение с вьюпортом — два
     независимых признака (utils/widgetRunGate). */
  bindRunSources() {
    if (!this.gate) this.gate = createRunGate({ pauseOffscreen: this.o.pauseOffscreen })
    this.gateOff = this.gate.subscribe((run) => {
      if (run) this.start()
      else this.stop()
    })
    this.sources = attachRunSources(this.el, this.gate, {
      pauseOffscreen: this.o.pauseOffscreen,
    })
  }

  unbindRunSources() {
    if (this.sources) this.sources.disconnect()
    this.sources = null
    if (this.gateOff) this.gateOff()
    this.gateOff = null
  }

  set(patch) {
    /* Лаборатория присылает весь набор параметров на любое движение
       ползунка — применяем только то, что действительно поменялось. */
    const next = {}
    for (const [key, value] of Object.entries(patch || {})) {
      if (value !== this.o[key]) next[key] = value
    }
    Object.assign(this.o, next)
    if (!this.ready) return this

    let level = false
    for (const key of Object.keys(next)) {
      if (LEVEL_KEYS.has(key)) level = true
      else this.apply(key)
    }
    if (level) {
      clearTimeout(this.levelTimer)
      this.levelTimer = setTimeout(() => {
        this.levelTimer = null
        if (this.destroyed) return
        for (const key of LEVEL_KEYS) this.apply(key)
        if (!this.raf) this.draw(performance.now(), true)
      }, LEVEL_DELAY)
    }
    if (next.scroll !== undefined) this.onScroll()
    if (!this.raf) this.draw(performance.now(), true)
    return this
  }

  draw(now, force = false) {
    if (this.ready) this.viewer.tick(now, force)
  }

  loop(now) {
    this.raf = requestAnimationFrame(t => this.loop(t))
    this.draw(now)
  }

  start() {
    if (this.raf || this.frozen || !this.gate || !this.gate.shouldRun() || !this.ready) return
    this.raf = requestAnimationFrame(t => this.loop(t))
  }

  stop() {
    if (!this.raf) return
    cancelAnimationFrame(this.raf)
    this.raf = null
  }

  /** Снять канвас, сохранив сцену и симуляцию для перецепления. */
  detach() {
    this.stop()
    if (this.ro) this.ro.disconnect()
    /* Снятый виджет обязан отписать источники: иначе слушатель вкладки
       переживёт свой канвас и снова запустит цикл. */
    this.unbindRunSources()
    window.removeEventListener('scroll', this.onScroll)
    this.viewer.detach()
    if (this.el.__glukeWater === this) delete this.el.__glukeWater
  }

  reattach(el) {
    this.el = el
    this.viewer.attach(el)
    el.__glukeWater = this
    if (this.ro) this.ro.observe(el)
    this.bindRunSources()
    window.addEventListener('scroll', this.onScroll, { passive: true })
    this.onScroll()
    this.start()
    if (!this.raf) this.draw(performance.now(), true)
  }

  destroy() {
    if (this.destroyed) return
    this.detach()
    this.destroyed = true
    this.ready = false
    clearTimeout(this.levelTimer)
    if (!this.ro) window.removeEventListener('resize', this.onResize)
    this.viewer.dispose()
    /* Реестр не должен держать уничтоженный инстанс: вытеснение из кэша
       виджетов зовёт destroy(), и без этого массив рос бы всю сессию. */
    const at = GlukeWater.instances.indexOf(this)
    if (at > -1) GlukeWater.instances.splice(at, 1)
  }
}

const GlukeWater = {
  defaults: DEFAULTS,
  instances: [],
  create(el, options) {
    const widget = new Widget(el, options)
    GlukeWater.instances.push(widget)
    return widget
  },
}

export default GlukeWater
