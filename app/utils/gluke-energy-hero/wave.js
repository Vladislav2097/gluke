/* Энергетический импульс: одна цельная волна от знака на весь блок. Чёткий
   круглый фронт и мягкий свет за ним; по мере удаления волна слабеет.
   Слова загораются тем же радиусом (см. words.js), поэтому волна и тезисы —
   один эффект, а не набор отдельных вспышек. */

import { NOISE_GLSL, program } from './gl.js'
import { __LAB__ } from './lab.js'

const VERT = `
attribute vec2 aPos;
uniform vec2 uRes;
varying vec2 vPx;
void main(){
  vPx = aPos * uRes;
  gl_Position = vec4(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0, 0.0, 1.0);
}`

const FRAG = `
precision highp float;
varying vec2 vPx;
uniform vec2 uCentre;
uniform float uR;
uniform float uW;
uniform float uTrail;
#ifdef LAB
uniform float uNoise;
#endif
uniform float uAmp;
uniform float uClock;
uniform vec3 uBrand;
uniform vec3 uHot;
${NOISE_GLSL}
void main(){
  vec2 p = vPx - uCentre;
  float d = length(p);
  /* Импульс — чистый цельный круг: радиус не шумит и яркость не мерцает,
     иначе фронт выглядит рваным и «дёргается». uNoise оставлен для
     лаборатории: 0 — идеальный круг. */
#ifdef LAB
  vec2 dir = p / max(d, 1e-3);
  float n = fbm(dir * 1.6 + 11.0) - 0.5;
  float r = uR + n * uNoise * uW * 3.0;
#else
  float r = uR;
#endif
  float x = d - r;
  /* Фронт несимметричный: снаружи обрезан резко (ударная кромка), внутри
     чуть мягче. Поверх — тонкая раскалённая нить, она и даёт «хлёсткость». */
  float wOut = max(uW * 0.55, 1.0), wIn = max(uW, 1.0);
  float front = exp(-pow(x / (x > 0.0 ? wOut : wIn), 2.0));
  float core = exp(-pow(x / max(uW * 0.28, 0.75), 2.0));
  float trail = x < 0.0 ? exp(x / max(uTrail, 1.0)) * 0.55 : 0.0;
  /* У самого знака света нет: там уже горит логотип. */
  float near = smoothstep(uW * 2.0, uW * 6.0, d);
  vec3 col = (uBrand * (front + trail * 0.45) + uHot * (front * 0.35 + core * 0.9)) * uAmp * near;
  col = col / (1.0 + lum(col) * 0.3);
  gl_FragColor = vec4(col, clamp(lum(col), 0.0, 1.0));
}`

export class WaveLayer {
  constructor(gl) {
    this.gl = gl
    this.prog = program(gl, VERT, FRAG, ['aPos'], [
      'uRes', 'uCentre', 'uR', 'uW', 'uTrail', 'uAmp', 'uClock', 'uBrand', 'uHot', ...(__LAB__ ? ['uNoise'] : []),
    ], 'wave')
  }

  /* u — {cx, cy, r, w, trail, noise, amp}. */
  draw(f, u) {
    if (!u || u.amp < 0.002) return
    const gl = this.gl, P = this.prog, U = P.u
    gl.useProgram(P.p)
    gl.uniform2f(U.uRes, f.W, f.H)
    gl.uniform2f(U.uCentre, u.cx, u.cy)
    gl.uniform1f(U.uR, u.r)
    gl.uniform1f(U.uW, u.w)
    gl.uniform1f(U.uTrail, u.trail)
    if (__LAB__) gl.uniform1f(U.uNoise, u.noise)
    gl.uniform1f(U.uAmp, u.amp)
    gl.uniform1f(U.uClock, f.clock)
    gl.uniform3fv(U.uBrand, f.colors.energy)
    gl.uniform3fv(U.uHot, f.colors.hot)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }
}
