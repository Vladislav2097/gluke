/* HastraEnergy — WebGL-сцена hero: энергия → знак → результаты → действие.
   Прозрачный canvas поверх карточки hero; кнопка CTA остаётся HTML-элементом,
   движок только меняет её цвет и рисует свет вокруг.

   Перенесено из отдельного проекта сцены (D:\Work\WEB\Hastra\src\engine)
   почти без правок. Отличия от исходника: знак и его статичная копия
   приходят опциями (`mark` — текст SVG, `staticLogo` — адрес картинки),
   а не импортом файлов из проекта, и у цикла кадров есть stop/start —
   обвязка сайта гасит его вне экрана и при перецеплении. */

import { CtaLayer } from './cta.js'
import { hexToRgb } from './easing.js'
import { unitQuad } from './gl.js'
import { LogoLayer } from './logo.js'
import { MarkersLayer } from './markers.js'
import { computeScene } from './scene.js'
import { SpriteBatch } from './sprites.js'
import { activePhase, layoutPhases } from './timeline.js'
import { WaveLayer } from './wave.js'
import { WordsLayer } from './words.js'
import { __LAB__ } from './lab.js'

const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
/* Поля статичного знака под тень — в долях высоты самого знака: в исходном
   SVG знак высотой 39 единиц лежит в поле 50×51 (по 6 с каждой стороны).
   Статичная копия любого знака собирается с теми же полями. */
export const STILL_PAD = 6 / 39

/* Пропорции знака по viewBox: печь вписывает его в квадрат карты целиком,
   поэтому `logo.size` — высота знака, если он выше, чем шире, и ширина иначе. */
function markBox(svgText) {
  const m = /viewBox\s*=\s*"([^"]+)"/i.exec(svgText || '')
  const vb = m ? m[1].trim().split(/[\s,]+/).map(parseFloat) : [0, 0, 1, 1]
  return { w: vb[2] || 1, h: vb[3] || 1 }
}

const css = c => `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`

export class HastraEnergy {
  constructor(card, opts) {
    this.card = card
    this.cfg = opts.config
    this.ctaEl = opts.cta || null
    this.onFrame = opts.onFrame || null
    this.time = 0
    this.playing = opts.autoplay !== false
    this.frozen = false

    if (getComputedStyle(card).position === 'static') card.style.position = 'relative'
    const canvas = document.createElement('canvas')
    canvas.className = 'hastra-energy-canvas'
    canvas.setAttribute('aria-hidden', 'true')
    Object.assign(canvas.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '2', display: 'block',
    })
    card.appendChild(canvas)
    this.canvas = canvas

    /* Статичный знак из макета: после потока живой знак растворяется в нём. */
    const still = document.createElement('img')
    still.className = 'hastra-energy-logo'
    still.src = opts.staticLogo
    still.alt = ''
    still.setAttribute('aria-hidden', 'true')
    Object.assign(still.style, {
      position: 'absolute', pointerEvents: 'none', zIndex: '1', opacity: '0', display: 'block',
    })
    card.appendChild(still)
    this.still = still

    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false })
    if (!gl) throw new Error('WebGL')
    this.gl = gl
    gl.getExtension('OES_standard_derivatives')

    this.quad = unitQuad(gl)
    this.markBox = markBox(opts.mark)
    this.logo = new LogoLayer(gl, opts.mark)
    this.cta = new CtaLayer(gl)
    this.wave = new WaveLayer(gl)
    this.words = new WordsLayer(gl)
    this.markers = new MarkersLayer(gl)
    this.sprites = new SpriteBatch(gl, 60000)
    this.backSprites = new SpriteBatch(gl, 20000) // поток слов за знаком

    this.configChanged()
    this.resize()
    this._ro = new ResizeObserver(() => this.resize())
    this._ro.observe(card)

    this._visible = true
    this._io = new IntersectionObserver((e) => {
      this._visible = e[e.length - 1].isIntersecting
    })
    this._io.observe(card)

    this._last = performance.now()
    this._raf = requestAnimationFrame(now => this._frame(now))
  }

  /* Вызывать после любой правки конфига: пересчитывает фазы, цвета, слова. */
  configChanged() {
    const C = this.cfg
    this.layout = layoutPhases(C.timing.phases)
    this.colors = {}
    for (const k in C.palette) this.colors[k] = hexToRgb(C.palette[k])
    this.textColor = hexToRgb(C.words.color)
    this.words.build(C.words, C.words.reveal.randomness)
  }

  resize() {
    const el = this.card
    const w = Math.max(1, el.clientWidth)
    const h = Math.max(1, el.clientHeight)
    const R = this.cfg.render
    let dpr = Math.min(R.ratioCap, window.devicePixelRatio || 1)
    const area = w * h * dpr * dpr
    if (area > R.pixelBudget) dpr *= Math.sqrt(R.pixelBudget / area)
    this.dpr = dpr
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr)
    if (this.canvas.width !== bw) this.canvas.width = bw
    if (this.canvas.height !== bh) this.canvas.height = bh
    this.W = w
    this.H = h
    this.sx = w / this.cfg.ref.width
    this.sy = h / this.cfg.ref.height
    this.s = Math.min(this.sx, this.sy)
  }

  /* Прямоугольник кнопки в пикселях карточки (с учётом CSS-масштаба предка). */
  _measureCta() {
    if (!this.ctaEl) return null
    const cb = this.card.getBoundingClientRect()
    const k = cb.width / this.card.clientWidth || 1
    const r = this.ctaEl.getBoundingClientRect()
    return { x: (r.left - cb.left) / k, y: (r.top - cb.top) / k, w: r.width / k, h: r.height / k }
  }

  play() { this.playing = true }
  pause() { this.playing = false }
  restart() { this.time = 0; this.playing = true }
  /* Перемотка рисует кадр сразу: на паузе и при фоновой вкладке цикл кадров
     не крутится, а увидеть новое положение нужно немедленно. */
  seek(t) {
    this.time = Math.max(0, t)
    this._draw()
  }
  phase() { return activePhase(this.layout, this.time) }

  /* Цикл кадров. Вне экрана исходник просто пропускал кадры, оставляя rAF
     крутиться; на сайте рядом живут другие сцены, и цикл гасится целиком. */
  stopLoop() {
    cancelAnimationFrame(this._raf)
    this._raf = 0
  }

  startLoop() {
    if (this._raf) return
    this._last = performance.now()
    this._raf = requestAnimationFrame(now => this._frame(now))
  }

  _frame(now) {
    this._raf = requestAnimationFrame(n => this._frame(n))
    const dt = Math.min(0.1, (now - this._last) / 1000)
    this._last = now
    if (!this._visible || document.hidden) return

    const T = this.cfg.timing
    if (this.playing) {
      this.time += dt * (__LAB__ ? T.speed : 1)
      if (__LAB__ && T.loop && this.time > this.layout.total + T.loopPause) this.time = 0
    }
    this.clock = (this.clock || 0) + dt
    this._draw()
  }

  _draw() {
    if (this.clock === undefined) this.clock = 0
    const gl = this.gl
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    this.ctaRect = this._measureCta()
    const sc = computeScene(this, this.time)
    const f = { W: this.W, H: this.H, dpr: this.dpr, clock: this.clock, colors: this.colors }

    this._bindQuad()
    this.wave.draw(f, sc.waveU)
    /* Слова стоят рядом со знаком и не пересекают его, пока не полетят;
       в полёте они идут вместе с потоком — за знаком, если так задано. */
    const behind = !__LAB__ || this.cfg.stream.behindLogo
    const drawWords = () => {
      this._bindQuad()
      this.markers.draw(f, sc.markerStates, this.cfg.words.marker, this.s)
      this._bindQuad()
      this.words.draw(f, sc.wordStates, this.textColor, sc.wordWave)
    }
    this.backSprites.flush(f, this.colors.energy, this.colors.hot)
    if (behind) drawWords()
    this._bindQuad()
    if (sc.logoU.opacity > 0.001) this.logo.draw(f, this.cfg.logo, sc.logoU)
    if (!behind) drawWords()
    this._bindQuad()
    this.cta.draw(f, this.ctaRect, sc.ctaU)
    this.sprites.flush(f, this.colors.energy, this.colors.hot)

    this._styleStill(sc.logoOff)
    this._styleCta(sc.ctaState)
    if (this.onFrame) this.onFrame(this)
  }

  /* Статичный знак стоит ровно там, где живой: вокруг знака поля под тень
     (STILL_PAD), центр совпадает с центром знака. */
  _styleStill(off) {
    const L = this.cfg.logo
    const B = this.markBox
    const side = L.size * this.s / Math.max(B.w, B.h)
    const pad = B.h * STILL_PAD
    const h = (B.h + 2 * pad) * side
    const w = (B.w + 2 * pad) * side
    const key = [this.logo.cx, this.logo.cy, h, L.rotation, off].map(v => (+v).toFixed(2)).join()
    if (key === this._stillKey) return
    this._stillKey = key
    Object.assign(this.still.style, {
      left: (this.logo.cx - w / 2) + 'px',
      top: (this.logo.cy - h / 2) + 'px',
      width: w + 'px',
      height: h + 'px',
      transform: L.rotation ? `rotate(${L.rotation}deg)` : '',
      opacity: String(off),
      visibility: off > 0.001 ? 'visible' : 'hidden',
    })
  }

  _bindQuad() {
    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  }

  _styleCta(st) {
    if (!this.ctaEl) return
    const c = this.colors
    const el = this.ctaEl
    const fl = st.fill
    const r = this.ctaRect
    /* Режим «волна»: жёлтое заливает кнопку кругом с центром в знаке —
       ровно тем радиусом, что и фронт волны на canvas. */
    if (fl && r) {
      const lx = fl.cx - r.x, ly = fl.cy - r.y
      const dNear = Math.hypot(Math.max(Math.abs(lx - r.w / 2) - r.w / 2, 0), Math.max(Math.abs(ly - r.h / 2) - r.h / 2, 0))
      const dFar = Math.hypot(Math.abs(lx - r.w / 2) + r.w / 2, Math.abs(ly - r.h / 2) + r.h / 2)
      const dMid = Math.hypot(lx - r.w / 2, ly - r.h / 2)
      const yellow = css(mixRgb(c.ctaDark, c.ctaYellow, fl.yellow))
      const dark = css(c.ctaDark)
      const tMix = Math.min(1, Math.max(0, (fl.r - dMid) / (2 * fl.soft) + 0.5)) * fl.yellow
      let bg, img
      if (fl.r - fl.soft >= dFar) { bg = yellow; img = 'none' }
      else if (fl.r + fl.soft <= dNear) { bg = dark; img = 'none' }
      else {
        bg = dark
        img = `radial-gradient(circle at ${lx.toFixed(1)}px ${ly.toFixed(1)}px, ${yellow} ${Math.max(0, fl.r - fl.soft).toFixed(1)}px, ${dark} ${(fl.r + fl.soft).toFixed(1)}px)`
      }
      const key = bg + img + tMix.toFixed(3)
      if (key === this._ctaKey) return
      this._ctaKey = key
      el.style.backgroundColor = bg
      el.style.backgroundImage = img
      el.style.color = css(mixRgb(c.ctaDarkText, c.ctaText, tMix))
      return
    }
    const key = st.mix.toFixed(3)
    if (key === this._ctaKey) return
    this._ctaKey = key
    el.style.backgroundImage = 'none'
    el.style.backgroundColor = css(mixRgb(c.ctaDark, c.ctaYellow, st.mix))
    el.style.color = css(mixRgb(c.ctaDarkText, c.ctaText, st.mix))
  }

  destroy() {
    cancelAnimationFrame(this._raf)
    this._ro.disconnect()
    this._io.disconnect()
    this.logo.destroy()
    const ext = this.gl.getExtension('WEBGL_lose_context')
    if (ext) ext.loseContext()
    this.canvas.remove()
    this.still.remove()
  }
}
