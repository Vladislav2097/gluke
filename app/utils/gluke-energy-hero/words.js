/* Слова-результаты. Каждое слово — текстура: R — чёткий текст, G — размытое
   свечение, B — шумовой ключ. Проявляет слово волна импульса: буква загорается,
   когда фронт доходит до неё (ключ делает фронт неровным). Растворяется слово
   по тому же ключу, и CPU знает его для каждой точки, поэтому частицы потока
   улетают ровно там и тогда, где текст исчезает. */

import { hash } from './easing.js'
import { NOISE_GLSL, program, texture } from './gl.js'
import { __LAB__ } from './lab.js'


const VERT = `
attribute vec2 aPos;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform vec2 uSize;
uniform float uRot;
varying vec2 vUv;
varying vec2 vPx;
void main(){
  vUv = aPos;
  vec2 l = (aPos - 0.5) * uSize;
  float c = cos(uRot), s = sin(uRot);
  vec2 px = uCenter + vec2(c * l.x - s * l.y, s * l.x + c * l.y);
  vPx = px;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
}`

const FRAG = `
precision highp float;
varying vec2 vUv;
varying vec2 vPx;
uniform sampler2D uTex;
uniform vec2 uWaveC;
uniform float uWaveR;
uniform float uFrontW;
uniform float uRagged;
uniform float uFlare;
#ifdef LAB
uniform float uBase; // слово видно тускло ещё до волны
#endif
uniform vec3 uBrand;
uniform vec3 uHot;
uniform vec3 uText;
uniform float uDissolve;
uniform float uDissolveSoft;
uniform float uGlow;
uniform float uOpacity;
uniform float uClock;
${NOISE_GLSL}
void main(){
  vec4 t = texture2D(uTex, vUv);
  float key = t.b;
  float w = max(uDissolveSoft, 0.01);
  float D = uDissolve * (1.0 + 2.0 * w) - w;
  /* Проявление фронтом волны: расстояние от знака против радиуса волны. */
  float fw = max(uFrontW, 1.0);
  float x = uWaveR - (distance(vPx, uWaveC) + (key - 0.5) * uRagged);
  float kept = 1.0 - smoothstep(key - w, key + w, D);
  float shown = smoothstep(-fw, fw, x) * kept;
#ifdef LAB
  float textA = max(shown, uBase * kept);
#else
  float textA = shown;
#endif
  float frontIn = exp(-pow((x - fw) / (fw * 1.6), 2.0)) * uFlare;
  float frontOut = exp(-pow((D - key) / w, 2.0)) * step(0.001, uDissolve) * (1.0 - step(0.999, uDissolve));
  float front = max(frontIn, frontOut);
  float flick = 0.85 + 0.3 * fbm(vUv * vec2(6.0, 2.0) + vec2(uClock * 0.8, 0.0));
  vec3 col = uText * t.r * textA;
  col += uBrand * t.g * uGlow * flick * (0.55 * shown + front * 0.8);
  col += mix(uBrand, uHot, 0.5) * t.r * front * 1.6;
  col *= uOpacity;
  float a = clamp(max(t.r * textA, lum(col)), 0.0, 1.0) * uOpacity;
  gl_FragColor = vec4(col, a);
}`

/* Та же схема шума, что и в шейдерах, но на CPU — только для ключа. */
function h2(x, y) {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123
  return v - Math.floor(v)
}
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1)
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy
}

export class WordsLayer {
  constructor(gl) {
    this.gl = gl
    this.prog = program(gl, VERT, FRAG, ['aPos'], [
      'uRes', 'uCenter', 'uSize', 'uRot', 'uTex', 'uBrand', 'uHot', 'uText',
      'uDissolve', 'uDissolveSoft', 'uGlow', 'uOpacity', 'uClock',
      'uWaveC', 'uWaveR', 'uFrontW', 'uRagged', 'uFlare',
      ...(__LAB__ ? ['uBase'] : []),
    ], 'words')
    this.words = []
    this.signature = ''
  }

  /* Перестраивает текстуры, если поменялись текст или шрифт. */
  async build(cfg, randomness) {
    /* K — запас разрешения текстуры относительно пикселей макета. */
    const K = cfg.textureScale || 2
    const sig = JSON.stringify([cfg.items.map(i => i.text), cfg.fontFamily, cfg.fontWeight, cfg.fontSize, cfg.letterSpacing, randomness, K])
    if (sig === this.signature) return false
    this.signature = sig
    const fontPx = cfg.fontSize * K
    const font = `${cfg.fontWeight} ${fontPx}px ${cfg.fontFamily}`
    try {
      await document.fonts.load(font, cfg.items.map(i => i.text).join(''))
    }
    catch { /* шрифт не загрузился — рисуем запасным */ }
    if (sig !== this.signature) return false

    for (const w of this.words) this.gl.deleteTexture(w.tex)
    this.words = cfg.items.map((item, idx) => this._bakeWord(item.text, font, fontPx, cfg.letterSpacing, idx, randomness, K))
    return true
  }

  _bakeWord(text, font, fontPx, spacing, idx, randomness, K) {
    const pad = Math.round(fontPx * 0.7)
    const probe = document.createElement('canvas').getContext('2d')
    probe.font = font
    if ('letterSpacing' in probe) probe.letterSpacing = spacing * fontPx + 'px'
    const tw = Math.ceil(probe.measureText(text).width)
    const cw = tw + pad * 2
    const ch = Math.ceil(fontPx * 1.2) + pad * 2

    const draw = (blur) => {
      const cv = document.createElement('canvas')
      cv.width = cw
      cv.height = ch
      const ctx = cv.getContext('2d')
      ctx.font = font
      if ('letterSpacing' in ctx) ctx.letterSpacing = spacing * fontPx + 'px'
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#fff'
      if (blur) ctx.filter = `blur(${blur}px)`
      ctx.fillText(text, cw / 2, ch / 2)
      if (blur) {
        ctx.filter = `blur(${blur * 0.4}px)`
        ctx.fillText(text, cw / 2, ch / 2)
      }
      return ctx.getImageData(0, 0, cw, ch).data
    }
    const sharp = draw(0)
    const glow = draw(fontPx * 0.28)

    const rgba = new Uint8Array(cw * ch * 4)
    const pts = []
    const seed = idx * 7.31 + 1.7
    /* Ключ: шум плюс лёгкий наклон слева направо — растворение уходит
       к левому краю первым, туда же, куда полетит поток. */
    const slope = 0.45
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const i = (y * cw + x) * 4
        const u = x / cw, v = y / ch
        const n = vnoise(u * 9 + seed, v * 3 + seed) * 0.62 + vnoise(u * 19 + seed + 7.1, v * 6.4 + 7.1) * 0.38
        const key = Math.min(1, Math.max(0, (n - 0.2) / 0.6 * (1 - slope) + u * slope))
        rgba[i] = sharp[i + 3]
        rgba[i + 1] = glow[i + 3]
        rgba[i + 2] = Math.round(key * 255)
        rgba[i + 3] = 255
        if (sharp[i + 3] > 140 && ((x ^ y) & 1) === 0) pts.push((x - cw / 2) / K, (y - ch / 2) / K, key)
      }
    }
    /* Перемешиваем точки детерминированно: префикс любой длины покрывает всё
       слово равномерно, поэтому число частиц можно крутить без перестройки. */
    const n = pts.length / 3
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(hash(i * 3.7 + seed) * (i + 1))
      for (let c = 0; c < 3; c++) {
        const tmp = pts[i * 3 + c]
        pts[i * 3 + c] = pts[j * 3 + c]
        pts[j * 3 + c] = tmp
      }
    }
    const tex = texture(this.gl, cw, ch, rgba)
    return { tex, w: cw / K, h: ch / K, tw: tw / K, points: new Float32Array(pts), count: n }
  }

  /* s — {x, y, scale, rot, reveal, dissolve, glow, opacity} для каждого слова;
     wave — {cx, cy, r, frontWidth, ragged, flare}. */
  draw(f, states, textColor, wave) {
    const gl = this.gl, P = this.prog, U = P.u
    gl.useProgram(P.p)
    gl.uniform2f(U.uRes, f.W, f.H)
    gl.uniform3fv(U.uBrand, f.colors.energy)
    gl.uniform3fv(U.uHot, f.colors.hot)
    gl.uniform3fv(U.uText, textColor)
    gl.uniform1f(U.uClock, f.clock)
    gl.uniform1i(U.uTex, 0)
    gl.uniform2f(U.uWaveC, wave.cx, wave.cy)
    gl.uniform1f(U.uWaveR, wave.r)
    gl.uniform1f(U.uFrontW, wave.frontWidth)
    gl.uniform1f(U.uRagged, wave.ragged)
    gl.uniform1f(U.uFlare, wave.flare)
    gl.activeTexture(gl.TEXTURE0)
    for (let i = 0; i < this.words.length; i++) {
      const w = this.words[i], s = states[i]
      if (!s || (s.reveal <= 0.001 && !(__LAB__ && s.base > 0.001)) || s.dissolve >= 0.999 || s.opacity <= 0.001) continue
      if (__LAB__) gl.uniform1f(U.uBase, s.base || 0)
      gl.bindTexture(gl.TEXTURE_2D, w.tex)
      gl.uniform2f(U.uCenter, s.x, s.y)
      gl.uniform2f(U.uSize, w.w * s.scale, w.h * s.scale)
      gl.uniform1f(U.uRot, s.rot)
      gl.uniform1f(U.uDissolve, s.dissolve)
      gl.uniform1f(U.uDissolveSoft, s.dissolveSoft ?? 0.06)
      gl.uniform1f(U.uGlow, s.glow)
      gl.uniform1f(U.uOpacity, s.opacity)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
  }
}
