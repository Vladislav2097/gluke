/* Пакет частиц: каждая — капсула от «хвоста» к «голове» с мягким спадом.
   Круглая точка — это капсула нулевой длины. Одна отрисовка на все частицы
   через ANGLE_instanced_arrays; координаты считает CPU как функцию времени. */

import { program } from './gl.js'

const VERT = `
attribute vec2 aCorner;
attribute vec2 aHead;
attribute vec2 aTail;
attribute float aSize;
attribute float aAlpha;
attribute float aHeat;
uniform vec2 uRes;
varying vec2 vLocal;
varying float vLen;
varying float vSize;
varying float vAlpha;
varying float vHeat;
void main(){
  vec2 dir = aHead - aTail;
  float len = length(dir);
  vec2 axis = len > 0.01 ? dir / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-axis.y, axis.x);
  float along = mix(-aSize, len + aSize, aCorner.x * 0.5 + 0.5);
  float across = aCorner.y * aSize;
  vec2 px = aTail + axis * along + nrm * across;
  vLocal = vec2(along, across);
  vLen = len;
  vSize = aSize;
  vAlpha = aAlpha;
  vHeat = aHeat;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
}`

const FRAG = `
precision mediump float;
varying vec2 vLocal;
varying float vLen;
varying float vSize;
varying float vAlpha;
varying float vHeat;
uniform vec3 uBrand;
uniform vec3 uHot;
void main(){
  float ax = clamp(vLocal.x, 0.0, vLen);
  float dd = length(vec2(vLocal.x - ax, vLocal.y)) / max(vSize, 0.001);
  float a = exp(-dd * dd * 3.2) * (1.0 - smoothstep(0.85, 1.0, dd));
  /* Хвост штриха тусклее головы — отсюда ощущение движения. */
  float headward = vLen > 0.01 ? mix(0.2, 1.0, ax / vLen) : 1.0;
  float core = exp(-dd * dd * 14.0);
  vec3 col = mix(uBrand, uHot, clamp(vHeat * (0.35 + core), 0.0, 1.0));
  float k = a * headward * vAlpha;
  gl_FragColor = vec4(col * k, k * 0.55);
}`

const STRIDE = 7

export class SpriteBatch {
  constructor(gl, max = 60000) {
    this.gl = gl
    this.ext = gl.getExtension('ANGLE_instanced_arrays')
    if (!this.ext) throw new Error('ANGLE_instanced_arrays')
    this.prog = program(gl, VERT, FRAG,
      ['aCorner', 'aHead', 'aTail', 'aSize', 'aAlpha', 'aHeat'],
      ['uRes', 'uBrand', 'uHot'], 'sprites')
    this.corners = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    this.inst = gl.createBuffer()
    this.max = max
    this.data = new Float32Array(max * STRIDE)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst)
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW)
    this.count = 0
  }

  begin() {
    this.count = 0
  }

  push(hx, hy, tx, ty, size, alpha, heat) {
    if (alpha < 0.004 || this.count >= this.max) return
    const o = this.count * STRIDE
    const d = this.data
    d[o] = hx; d[o + 1] = hy; d[o + 2] = tx; d[o + 3] = ty
    d[o + 4] = size; d[o + 5] = alpha; d[o + 6] = heat
    this.count++
  }

  flush(f, brand, hot) {
    if (!this.count) return
    const gl = this.gl, ext = this.ext, P = this.prog
    gl.useProgram(P.p)
    gl.uniform2f(P.u.uRes, f.W, f.H)
    gl.uniform3fv(P.u.uBrand, brand)
    gl.uniform3fv(P.u.uHot, hot)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    ext.vertexAttribDivisorANGLE(0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.count * STRIDE))
    const B = 4 * STRIDE
    const layout = [[1, 2, 0], [2, 2, 8], [3, 1, 16], [4, 1, 20], [5, 1, 24]]
    for (const [loc, size, offset] of layout) {
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, B, offset)
      ext.vertexAttribDivisorANGLE(loc, 1)
    }
    ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, this.count)
    /* Остальные слои рисуют без инстансов — снимаем делители. */
    for (const [loc] of layout) {
      ext.vertexAttribDivisorANGLE(loc, 0)
      gl.disableVertexAttribArray(loc)
    }
  }
}
