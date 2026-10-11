/*!
 * GlukeEnergyHero — анимированный первый экран: энергия зарождается в знаке,
 * импульс проходит волной по блоку, зажигает слова, и они кометами влетают
 * в кнопку. Виджет кейса `energy-hero`.
 *
 * Автор: Александр Глухов (GLUKE, https://gluke.ru, @Gluke_art).
 * © GLUKE, 2026. Свободное использование и доработка допускаются с сохранением
 * этой шапки и ссылки на gluke.ru; перепродажа движка как самостоятельного
 * продукта или выдача его за чужую разработку — без письменного согласия
 * автора. При сомнениях — gluke_art@mail.ru.
 *
 * Каркас тот же, что у остальных виджетов сайта: create/set/detach/reattach/
 * destroy, потолки dpr и площади буфера, пауза вне экрана.
 *
 * Сама сцена живёт в `./gluke-energy-hero/` — модули перенесены из отдельного
 * проекта (D:\Work\WEB\Hastra\src) почти без правок и сверяются с ним, поэтому
 * сохраняют его оформление. Здесь — обвязка сайта: разметка карточки (тексты
 * и кнопка — HTML, движок рисует поверх них), вписывание карточки в сцену
 * кейса, выбор desktop- или mobile-сцены и плоские параметры для лаборатории.
 * Каждый плоский параметр — одно поле вложенного конфига (`PATHS`); поля,
 * у которых desktop и mobile расходятся (координаты, размеры в px макета),
 * в лабораторию не вынесены — их значение у каждой сцены своё.
 */

import { attachRunSources, createRunGate } from './widgetRunGate'
import { DESKTOP } from './gluke-energy-hero/desktop.js'
import { MOBILE } from './gluke-energy-hero/mobile.js'
import { HastraEnergy } from './gluke-energy-hero/HastraEnergy.js'
import './gluke-energy-hero/card.css'

/* Пропорции карточки в каждой сцене — по макетам. */
const MODES = {
  desktop: { cfg: DESKTOP, width: 1200, height: 493 },
  mobile: { cfg: MOBILE, width: 320, height: 620 },
}

/* Сцена уже сколько-то шире, чем выше, — desktop, иначе mobile. Порог ниже
   единицы: карточка 1200×493 вписывается и в почти квадратную сцену. */
const DESKTOP_ASPECT = 1
const START_VISIBLE = 0.35 // какая доля карточки должна быть видна для старта
const FINAL_HOLD = 2 // сек после конца сцены — кадр для «сразу финал»

const PATHS = {
  timeSpeed: 'timing.speed',
  timeLoop: 'timing.loop',
  timeLoopPause: 'timing.loopPause',
  phaseIntroOffset: 'timing.phases.intro.offset',
  phaseIntroDuration: 'timing.phases.intro.duration',
  phaseIgniteOffset: 'timing.phases.ignite.offset',
  phaseIgniteDuration: 'timing.phases.ignite.duration',
  phaseChargeOffset: 'timing.phases.charge.offset',
  phaseChargeDuration: 'timing.phases.charge.duration',
  phasePulseOffset: 'timing.phases.pulse.offset',
  phasePulseDuration: 'timing.phases.pulse.duration',
  phaseFormOffset: 'timing.phases.form.offset',
  phaseFormDuration: 'timing.phases.form.duration',
  phaseHoldOffset: 'timing.phases.hold.offset',
  phaseHoldDuration: 'timing.phases.hold.duration',
  phaseCollectOffset: 'timing.phases.collect.offset',
  phaseCollectDuration: 'timing.phases.collect.duration',
  phaseStreamOffset: 'timing.phases.stream.offset',
  phaseStreamDuration: 'timing.phases.stream.duration',
  phaseCtaImpactOffset: 'timing.phases.ctaImpact.offset',
  phaseCtaImpactDuration: 'timing.phases.ctaImpact.duration',
  phaseDissolveOffset: 'timing.phases.dissolve.offset',
  phaseDissolveDuration: 'timing.phases.dissolve.duration',
  logoRotation: 'logo.rotation',
  logoDetail: 'logo.detail',
  logoFillShare: 'logo.fillShare',
  logoEmber: 'logo.ember',
  logoEmberSize: 'logo.emberSize',
  logoFrontWidth: 'logo.frontWidth',
  logoFrontGlow: 'logo.frontGlow',
  logoFillNoise: 'logo.fillNoise',
  logoNoiseScale: 'logo.noiseScale',
  logoFrontFlow: 'logo.frontFlow',
  logoGrain: 'logo.grain',
  logoGrainScale: 'logo.grainScale',
  logoGrainSteps: 'logo.grainSteps',
  logoDormant: 'logo.dormant',
  logoIdle: 'logo.idle',
  logoIdleShape: 'logo.idleShape',
  logoIdleSpeed: 'logo.idleSpeed',
  logoIdleTight: 'logo.idleTight',
  logoRim: 'logo.rim',
  logoRimWidth: 'logo.rimWidth',
  logoHalo: 'logo.halo',
  logoHaloWidth: 'logo.haloWidth',
  logoSoft: 'logo.soft',
  logoSoftWidth: 'logo.softWidth',
  logoBloom: 'logo.bloom',
  logoBloomWidth: 'logo.bloomWidth',
  logoBurst: 'logo.burst',
  logoBurstScale: 'logo.burstScale',
  logoBurstSpeed: 'logo.burstSpeed',
  logoChargeGlow: 'logo.chargeGlow',
  logoChargeRipple: 'logo.chargeRipple',
  logoChargeRippleSpeed: 'logo.chargeRippleSpeed',
  logoDistortion: 'logo.distortion',
  logoFxExtent: 'logo.fxExtent',
  pulseStrength: 'pulse.strength',
  pulseFlash: 'pulse.flash',
  pulseFlashDecay: 'pulse.flashDecay',
  pulseGlow: 'pulse.glow',
  pulseDistortion: 'pulse.distortion',
  pulseAfterGlow: 'pulse.afterGlow',
  pulseWaveIntensity: 'pulse.waveIntensity',
  pulseWaveNoise: 'pulse.waveNoise',
  pulseWaveFade: 'pulse.waveFade',
  pulseWaveDecel: 'pulse.waveDecel',
  pulseWaveReach: 'pulse.waveReach',
  pulseParticleIntensity: 'pulse.particleIntensity',
  revealFrontWidth: 'words.reveal.frontWidth',
  revealFlare: 'words.reveal.flare',
  revealGlintLife: 'words.reveal.glintLife',
  revealGlintIntensity: 'words.reveal.glintIntensity',
  revealIntensity: 'words.reveal.intensity',
  revealGlow: 'words.reveal.glow',
  revealTextScale: 'words.reveal.textScale',
  revealOpacity: 'words.reveal.opacity',
  revealRandomness: 'words.reveal.randomness',
  holdFloating: 'words.hold.floating',
  holdSpeed: 'words.hold.speed',
  holdGlow: 'words.hold.glow',
  holdPulse: 'words.hold.pulse',
  holdFinalGlow: 'words.hold.finalGlow',
  wordsKeep: 'words.keep',
  wordsDimStart: 'words.dimStart',
  markerRingOpacity: 'words.marker.ringOpacity',
  markerDotGlow: 'words.marker.dotGlow',
  streamConvergence: 'stream.convergence',
  streamStagger: 'stream.stagger',
  streamTravelScale: 'stream.travelScale',
  streamDissolveFrom: 'stream.dissolveFrom',
  streamDissolveTo: 'stream.dissolveTo',
  streamDissolveSoft: 'stream.dissolveSoft',
  streamMarkerDissolve: 'stream.markerDissolve',
  streamMarkerParticles: 'stream.markerParticles',
  streamCloudLength: 'stream.cloudLength',
  streamCloudAhead: 'stream.cloudAhead',
  streamCloudLoosen: 'stream.cloudLoosen',
  streamIntensity: 'stream.intensity',
  streamGlow: 'stream.glow',
  streamTrail: 'stream.trail',
  streamComet: 'stream.comet',
  streamCometTrail: 'stream.cometTrail',
  streamParticleSize: 'stream.particleSize',
  streamArrivalSpread: 'stream.arrivalSpread',
  streamDistortion: 'stream.distortion',
  streamBehindLogo: 'stream.behindLogo',
  ctaInitialBrightness: 'cta.initialBrightness',
  ctaYellow: 'cta.yellow',
  ctaGlow: 'cta.glow',
  ctaHalo: 'cta.halo',
  ctaImpact: 'cta.impact',
  ctaFlash: 'cta.flash',
  ctaRing: 'cta.ring',
  ctaAnticipation: 'cta.anticipation',
  ctaFinalGlow: 'cta.finalGlow',
  ctaEnergy: 'cta.energy',
  ctaEnergySpeed: 'cta.energySpeed',
  ctaEnergyScale: 'cta.energyScale',
  ctaFillGlow: 'cta.fillGlow',
  ctaFillHalo: 'cta.fillHalo',
  idleLogoOff: 'idle.logoOff',
  idleLogoFadeOut: 'idle.logoFadeOut',
  idleLogoStaticBody: 'idle.logoStaticBody',
  idleLogoGlow: 'idle.logoGlow',
  idleLogoPulseInterval: 'idle.logoPulseInterval',
  idleLogoPulseIntensity: 'idle.logoPulseIntensity',
  idleLogoPulseWidth: 'idle.logoPulseWidth',
  idleCtaGlow: 'idle.ctaGlow',
  idleCtaHalo: 'idle.ctaHalo',
  idleCtaLight: 'idle.ctaLight',
  idleCtaInner: 'idle.ctaInner',
  idleCtaBlink: 'idle.ctaBlink',
  idleCtaBlinkInterval: 'idle.ctaBlinkInterval',
  idleCtaBlinkWidth: 'idle.ctaBlinkWidth',
}

/* Тексты карточки. Переводы приходят из кейса (`demo.params`): у каждой
   локали свой набор. Перенос строки — `\n`, на mobile он снимается. */
const COPY_KEYS = ['copyAccent', 'copyTitle', 'copyText', 'copyCta', 'copyWords']

const DEFAULTS = {
  /** Адрес SVG знака. Текст скачивает обвязка: печи нужен его viewBox. */
  mark: '',
  /** Статичная копия знака с тенью — в неё растворяется живой знак в финале. */
  staticLogo: '',
  /** Надпись под знаком. */
  wordmark: '',
  /** Лаборатория кейса: здесь работают повтор, скорость и стоп-кадр. В шапке
      сцена, как и на исходном сайте, играет один раз и остаётся в финале. */
  lab: false,

  copyAccent: 'Digital-маркетинг,',
  copyTitle: 'который приносит бизнесу\nизмеримый результат',
  copyText: 'Делаем интернет маркетинг двигателем вашего бизнеса.\nПревращаем рекламный бюджет в инструмент роста\nи масштабирования бизнеса, а не статью расходов',
  copyCta: 'Обсудить проект',
  copyWords: 'ЛИДЫ|ОКУПАЕМОСТЬ|РОСТ|ПРОДАЖИ',

  /* Время: стоп-кадр и протяжка. Живьём фронт заливки и импульс идут по
     сотне миллисекунд — без остановки их не настроить. */
  timeFreeze: 0,
  timeMoment: 3, // с от начала сцены

  ratioCap: 2,
  pixelBudget: 2.6e6,
  pauseOffscreen: true,
  respectReducedMotion: true,
}

const clone = o => JSON.parse(JSON.stringify(o))
const on = v => Number(v) > 0.5

function setPath(cfg, path, value) {
  const keys = path.split('.')
  const last = keys.pop()
  const obj = keys.reduce((o, k) => o[k], cfg)
  /* Флаги конфига — булевы, ползунок присылает 0/1. */
  obj[last] = typeof obj[last] === 'boolean' ? on(value) : Number(value)
}

/* Строка с `\n` → узлы с переносами `<br>` (на mobile их прячет CSS). */
function fillLines(el, text) {
  el.textContent = ''
  String(text).split('\n').forEach((line, i) => {
    if (i) {
      const br = document.createElement('br')
      br.className = 'gluke-hero__br'
      el.appendChild(br)
      el.appendChild(document.createTextNode(' '))
    }
    el.appendChild(document.createTextNode(line))
  })
}

function hasWebGL() {
  try {
    return !!document.createElement('canvas').getContext('webgl')
  }
  catch {
    return false
  }
}

class Widget {
  constructor(el, options) {
    const host = typeof el === 'string' ? document.querySelector(el) : el
    if (!host) throw new Error('GlukeEnergyHero: контейнер не найден')
    if (!hasWebGL()) throw new Error('GlukeEnergyHero: нет WebGL')

    this.el = host
    this.o = Object.assign({}, DEFAULTS, options || {})
    if (!this.o.mark) throw new Error('GlukeEnergyHero: не задан знак')
    this.destroyed = false
    this.engine = null
    this.markSvg = ''
    this.started = false
    this.skip = false
    this.gate = null
    this.gateOff = null
    this.sources = null
    this.frozen = this.o.respectReducedMotion
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    this.buildDom()
    host.appendChild(this.root)
    host.__glukeEnergyHero = this

    this.ro = new ResizeObserver(() => this.onResize())
    this.ro.observe(host)
    this.bindRunSources()

    /* Знак нужен движку текстом: печь читает его viewBox и растеризует сама. */
    fetch(this.o.mark)
      .then(r => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((svg) => {
        if (this.destroyed) return
        this.markSvg = svg
        this.build()
      })
      .catch((error) => {
        console.error('[gluke-energy-hero] не удалось загрузить знак', error)
      })
  }

  buildDom() {
    const root = document.createElement('div')
    root.className = 'gluke-hero'
    /* Карточка — картинка внутри сцены (у контейнера role="img" и подпись):
       её текст для скринридера дублировал бы подпись, а кнопка никуда не ведёт. */
    root.setAttribute('aria-hidden', 'true')
    root.innerHTML = '<div class="gluke-hero__card">'
      + '<p class="gluke-hero__title"><span class="gluke-hero__accent"></span><span class="gluke-hero__title-rest"></span></p>'
      + '<p class="gluke-hero__text"></p>'
      + '<span class="gluke-hero__cta"></span>'
      + '<img class="gluke-hero__wordmark" alt="" draggable="false">'
      + '</div>'
    this.root = root
    this.card = root.firstChild
    this.cta = root.querySelector('.gluke-hero__cta')
    const wordmark = root.querySelector('.gluke-hero__wordmark')
    if (this.o.wordmark) wordmark.src = this.o.wordmark
    else wordmark.remove()
    this.renderCopy()
  }

  renderCopy() {
    const q = s => this.root.querySelector(s)
    q('.gluke-hero__accent').textContent = this.o.copyAccent
    fillLines(q('.gluke-hero__title-rest'), this.o.copyTitle)
    fillLines(q('.gluke-hero__text'), this.o.copyText)
    this.cta.textContent = this.o.copyCta
  }

  mode() {
    const w = this.el.clientWidth
    const h = this.el.clientHeight
    return h > 0 && w / h < DESKTOP_ASPECT ? 'mobile' : 'desktop'
  }

  /* Карточка вписывается в сцену целиком и стоит по центру; `--u` — 1 px
     макета, от него считается вся вёрстка карточки. */
  fit() {
    const m = MODES[this.modeName]
    const w = this.el.clientWidth
    const h = this.el.clientHeight
    const k = Math.max(0.01, Math.min(w / m.width, h / m.height))
    this.card.style.width = (m.width * k) + 'px'
    this.card.style.height = (m.height * k) + 'px'
    this.card.style.setProperty('--u', k + 'px')
  }

  /* Конфиг сцены: исходный desktop или mobile, поверх — плоские параметры
     лаборатории и тексты кейса. */
  config() {
    const cfg = clone(MODES[this.modeName].cfg)
    for (const [key, path] of Object.entries(PATHS)) {
      if (this.o[key] !== undefined) setPath(cfg, path, this.o[key])
    }
    if (!this.o.lab) {
      cfg.timing.speed = 1
      cfg.timing.loop = false
    }
    const words = String(this.o.copyWords).split('|')
    cfg.words.items.forEach((item, i) => {
      if (words[i] !== undefined) item.text = words[i].trim()
    })
    cfg.render.ratioCap = this.o.ratioCap
    cfg.render.pixelBudget = this.o.pixelBudget
    return cfg
  }

  build() {
    this.modeName = this.mode()
    this.root.classList.toggle('gluke-hero--mobile', this.modeName === 'mobile')
    this.fit()
    this.cfg = this.config()
    this.started = false
    this.engine = new HastraEnergy(this.card, {
      config: this.cfg,
      cta: this.cta,
      mark: this.markSvg,
      staticLogo: this.o.staticLogo,
      autoplay: false,
      onFrame: e => this.tick(e),
    })
    if (!this.running()) this.engine.stopLoop()
  }

  dropEngine() {
    if (!this.engine) return
    const engine = this.engine
    this.engine = null
    engine.destroy()
    for (const p of ['background-color', 'background-image', 'color']) this.cta.style.removeProperty(p)
  }

  /* Доля карточки в окне: старт — когда её видно хотя бы на треть, как на
     исходном сайте. Считается, пока сцена не стартовала. */
  visibleShare() {
    const r = this.card.getBoundingClientRect()
    if (r.height <= 0) return 0
    const top = Math.max(r.top, 0)
    const bottom = Math.min(r.bottom, window.innerHeight)
    return Math.max(0, bottom - top) / r.height
  }

  tick(e) {
    if (this.started) return
    if (!e.logo.ready || !e.words.words.length) return
    /* Сцена уже шла и пересобрана (сменился режим) или системное «уменьшить
       движение» — сразу финальный кадр, без повторного показа. */
    if (this.skip || this.frozen) {
      this.started = true
      e.pause()
      e.seek(e.layout.total + FINAL_HOLD)
      if (!this.frozen) e.play()
      else e.stopLoop()
      return
    }
    if (this.visibleShare() < START_VISIBLE) return
    this.started = true
    this.applyTime()
  }

  /* Стоп-кадр лаборатории: сцена встаёт на `timeMoment` и перерисовывается
     на каждое движение ползунка. Без стоп-кадра идёт дальше с того же места. */
  applyTime() {
    const e = this.engine
    if (!e || !this.started) return
    if (this.o.lab && on(this.o.timeFreeze)) {
      e.pause()
      e.seek(Number(this.o.timeMoment) || 0)
    }
    else {
      e.play()
    }
  }

  onResize() {
    if (!this.engine) return
    /* Перешли через порог пропорций — другая сцена. Повторно анимацию не
       показываем: если она уже шла, новая встаёт сразу в финал. */
    if (this.mode() !== this.modeName) {
      this.skip = this.started && !this.o.lab
      this.dropEngine()
      this.build()
      return
    }
    this.fit()
  }

  set(patch) {
    /* Лаборатория присылает весь набор параметров на любое движение
       ползунка — применяем только то, что действительно поменялось. */
    const next = {}
    for (const [key, value] of Object.entries(patch || {})) {
      if (value !== this.o[key]) next[key] = value
    }
    Object.assign(this.o, next)
    const keys = Object.keys(next)
    if (!keys.length) return this

    if (keys.some(k => COPY_KEYS.includes(k))) this.renderCopy()
    if (this.engine && keys.some(k => PATHS[k] || k === 'copyWords')) {
      /* Движок держит ссылку на объект конфига — переносим значения в него,
         а не подменяем объект. */
      const fresh = this.config()
      for (const k of Object.keys(fresh)) this.cfg[k] = fresh[k]
      this.engine.configChanged()
      this.engine.resize()
      if (!this.engine.playing) this.engine.seek(this.engine.time)
    }
    if (keys.includes('timeFreeze') || keys.includes('timeMoment')) this.applyTime()
    return this
  }

  running() {
    return !!this.gate && this.gate.shouldRun()
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

  start() {
    if (!this.engine || !this.running()) return
    if (this.frozen && this.started) return
    this.engine.startLoop()
  }

  stop() {
    if (this.engine) this.engine.stopLoop()
  }

  /** Снять карточку с контейнера, сохранив сцену для перецепления. */
  detach() {
    this.stop()
    if (this.ro) this.ro.disconnect()
    /* Снятый виджет обязан отписать источники: иначе слушатель вкладки
       переживёт свой канвас и снова запустит цикл. */
    this.unbindRunSources()
    this.root.remove()
    if (this.el.__glukeEnergyHero === this) delete this.el.__glukeEnergyHero
  }

  reattach(el) {
    this.el = el
    el.appendChild(this.root)
    el.__glukeEnergyHero = this
    if (this.ro) this.ro.observe(el)
    this.bindRunSources()
    this.onResize()
    this.start()
  }

  destroy() {
    if (this.destroyed) return
    this.detach()
    this.destroyed = true
    this.dropEngine()
    /* Реестр не должен держать уничтоженный инстанс: вытеснение из кэша
       виджетов зовёт destroy(), и без этого массив рос бы всю сессию. */
    const at = GlukeEnergyHero.instances.indexOf(this)
    if (at > -1) GlukeEnergyHero.instances.splice(at, 1)
  }
}

const GlukeEnergyHero = {
  defaults: DEFAULTS,
  instances: [],
  create(el, options) {
    const widget = new Widget(el, options)
    GlukeEnergyHero.instances.push(widget)
    return widget
  },
}

export default GlukeEnergyHero
