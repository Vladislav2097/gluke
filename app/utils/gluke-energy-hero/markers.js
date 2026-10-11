/* Маркеры слов из макета: полупрозрачное кольцо и жёлтая точка слева от
   слова. Зажигаются тем же фронтом волны, что и буквы: сначала вспышка,
   потом ровный свет. */

import { hexToRgb } from './easing.js'
import { program } from './gl.js'
import { __LAB__ } from './lab.js'

const VERT = `
attribute vec2 aPos;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uSide;
varying vec2 vP;
void main(){
  vP = (aPos - 0.5) * uSide;
  vec2 px = uCenter + vP;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
}`

const FRAG = `
precision highp float;
varying vec2 vP;
uniform float uRing;
uniform float uRingOpacity;
uniform float uDot;
uniform float uGlow;
uniform float uFlare;
uniform float uShown;
uniform float uLit; // 0 — блёклый маркер до волны, 1 — зажжён волной
uniform vec3 uDim;
uniform vec3 uBrand;
uniform vec3 uHot;
void main(){
  float d = length(vP);
  float ring = (1.0 - smoothstep(uRing - 0.75, uRing + 0.75, d)) * uRingOpacity;
  float dot = 1.0 - smoothstep(uDot - 0.75, uDot + 0.75, d);
  /* Кольцо поверх фона, точка поверх кольца (цвет premultiplied). */
  vec3 col = vec3(ring);
  float a = ring;
  /* До волны точка блёклая, не жёлтая; фронт волны зажигает её. */
  col = mix(col, mix(uDim, mix(uBrand, uHot, uFlare * 0.6), uLit), dot);
  a = mix(a, 1.0, dot);
  float glow = exp(-max(d - uDot, 0.0) / (uDot * 1.6)) * (uGlow + uFlare * 1.5) * (1.0 - dot) * uLit;
  col += uBrand * glow;
  col *= uShown;
  a = clamp(max(a * uShown, glow * uShown * 0.6), 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}`

export class MarkersLayer {
  constructor(gl) {
    this.gl = gl
    this.prog = program(gl, VERT, FRAG, ['aPos'], [
      'uRes', 'uCenter', 'uSide', 'uRing', 'uRingOpacity', 'uDot', 'uGlow', 'uFlare', 'uShown', 'uLit', 'uDim', 'uBrand', 'uHot',
    ], 'markers')
  }

  /* items — [{x, y, shown, flare, glow, size}] в пикселях блока; m — конфиг маркера, s — масштаб. */
  draw(f, items, m, s) {
    const gl = this.gl, P = this.prog, U = P.u
    gl.useProgram(P.p)
    gl.uniform2f(U.uRes, f.W, f.H)
    gl.uniform3fv(U.uBrand, f.colors.energy)
    gl.uniform3fv(U.uHot, f.colors.hot)
    gl.uniform1f(U.uRingOpacity, m.ringOpacity)
    gl.uniform3fv(U.uDim, hexToRgb((__LAB__ && m.dimColor) || '#9AA3BF'))
    for (const it of items) {
      if (it.shown <= 0.001) continue
      const k = s * (it.size ?? 1)
      gl.uniform1f(U.uRing, m.ring * k)
      gl.uniform1f(U.uDot, m.dot * k)
      gl.uniform1f(U.uSide, Math.max(m.ring, m.dot * 8) * 2.4 * k)
      gl.uniform2f(U.uCenter, it.x, it.y)
      gl.uniform1f(U.uShown, it.shown)
      gl.uniform1f(U.uLit, it.lit ?? 1)
      gl.uniform1f(U.uFlare, it.flare)
      gl.uniform1f(U.uGlow, it.glow * m.dotGlow)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
  }
}
