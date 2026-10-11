/* Мелкие помощники WebGL1. */

import { __LAB__ } from './lab.js'

export function compile(gl, type, src, label) {
  const sh = gl.createShader(type)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('gl[' + label + ']: ' + gl.getShaderInfoLog(sh))
  }
  return sh
}

/* Программа + словарь юниформов по списку имён. Атрибуты привязываются по
   порядку массива attribs. */
export function program(gl, vert, frag, attribs, uniforms, label) {
  const p = gl.createProgram()
  attribs.forEach((name, i) => gl.bindAttribLocation(p, i, name))
  /* LAB — лабораторные режимы шейдеров; в сборке для сайта блоки #ifdef LAB вырезаны. */
  const pre = __LAB__ ? '#define LAB\n' : ''
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, pre + vert, label + '.vert'))
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, pre + frag, label + '.frag'))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('gl[' + label + ']: ' + gl.getProgramInfoLog(p))
  }
  const u = {}
  for (const name of uniforms) u[name] = gl.getUniformLocation(p, name)
  return { p, u }
}

/* Квадрат из двух треугольников в координатах 0..1. */
export function unitQuad(gl) {
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW)
  return buf
}

export function texture(gl, w, h, data, format) {
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  const f = format || gl.RGBA
  if (data instanceof HTMLCanvasElement) gl.texImage2D(gl.TEXTURE_2D, 0, f, f, gl.UNSIGNED_BYTE, data)
  else gl.texImage2D(gl.TEXTURE_2D, 0, f, w, h, 0, f, gl.UNSIGNED_BYTE, data)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return tex
}

/* Общие шумовые функции для шейдеров. */
export const NOISE_GLSL = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453123); }
float hash1(float p){ return fract(sin(p * 127.1) * 43758.5453123); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i); float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)); float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){ return vnoise(p) * 0.62 + vnoise(p * 2.13 + 7.1) * 0.38; }
float ridged(vec2 p){ return 1.0 - abs(fbm(p) * 2.0 - 1.0); }
float lum(vec3 c){ return max(max(c.r, c.g), c.b); }
`
