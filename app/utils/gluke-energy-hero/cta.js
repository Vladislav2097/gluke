/* Свет вокруг CTA. Сама кнопка — настоящий HTML-элемент; здесь ореол,
   вспышка, ударная волна по контуру скруглённого прямоугольника и переливы
   энергии внутри кнопки (как у знака), пока до неё не дошла основная волна.
   Жёлтую заливку по фронту волны рисует CSS-градиент кнопки (HastraEnergy). */

import { NOISE_GLSL, program } from './gl.js'
import { __LAB__ } from './lab.js'

const VERT = `
attribute vec2 aPos;
uniform vec2 uRes;
uniform vec4 uBox; // x, y, w, h области отрисовки
varying vec2 vPx;
void main(){
  vPx = uBox.xy + aPos * uBox.zw;
  gl_Position = vec4(vPx.x / uRes.x * 2.0 - 1.0, 1.0 - vPx.y / uRes.y * 2.0, 0.0, 1.0);
}`

const FRAG = `
precision highp float;
varying vec2 vPx;
uniform vec4 uRect; // центр x, y, полуширина, полувысота
uniform float uRadius;
uniform vec3 uBrand;
uniform vec3 uHot;
uniform float uClock;
uniform float uHalo;
uniform float uHaloW;
uniform float uFlash;
uniform float uInner;
uniform float uRing;
uniform float uRingR;
uniform float uRingW;
uniform vec4 uBoxN; // для гашения у края области
uniform vec2 uWaveC; // центр основной волны (знак)
uniform float uWaveR; // текущий радиус её фронта
uniform float uFillSoft;
uniform float uFillGlow;
uniform float uEnergy;
uniform float uEnergySpeed;
#ifdef LAB
uniform float uEnergyRings;
uniform float uEnergyDir; // 1 — волны сходятся в центр кнопки, −1 — расходятся из центра
uniform float uEnergyStyle; // 1 — переливы (как у знака), 0 — кольца
#endif
uniform float uEnergyScale;
${NOISE_GLSL}
float sdBox(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main(){
  vec2 p = vPx - uRect.xy;
  float d = sdBox(p, uRect.zw, uRadius);
  float outside = step(0.0, d);
  float ang = atan(p.y, p.x);
  float flick = 0.8 + 0.4 * fbm(vec2(ang * 2.0, uClock * 0.7));
  float halo = exp(-max(d, 0.0) / max(uHaloW, 1.0)) * uHalo * flick;
  float ring = exp(-pow((d - uRingR) / max(uRingW, 1.0), 2.0)) * uRing;
  vec3 col = uBrand * (halo + ring) * outside;
  /* Вспышка ложится и на саму кнопку. */
  float inside = 1.0 - smoothstep(-1.0, 1.0, d);
  col += mix(uBrand, uHot, 0.7) * (uInner * inside * 0.85 + uFlash * outside * exp(-max(d, 0.0) / (uHaloW * 0.6)) * 0.8);

  /* Волны энергии внутри кнопки — тот же узор, что бежит по знаку до
     заливки, но кольца повторяют форму самой кнопки (контуры её поля
     расстояний) и бегут к центру или из центра. Гаснут там, где кнопку
     уже залила основная волна. */
  float dl = length(vPx - uWaveC);
  float unfilled = smoothstep(uWaveR - uFillSoft, uWaveR + uFillSoft, dl);
#ifdef LAB
  if (uEnergy > 0.001 && uEnergyStyle > 0.5) {
#else
  if (uEnergy > 0.001) {
#endif
    /* Переливы — та же «жидкость», что ходит внутри знака при зарядке:
       мягкая синусоида, изогнутая текучим шумом и погашенная пятнами.
       Языки света медленно перетекают вдоль кнопки, без колец и полос. */
    vec2 m = (vPx - uRect.xy) / (46.0 * max(uEnergyScale, 0.05));
    float sp = uEnergySpeed;
    vec2 flow = vec2(uClock * 0.35 * sp, -uClock * 0.27 * sp);
    float warp = fbm(m * 1.3 + flow) * 1.6 + fbm(m * 2.7 - flow * 1.3) * 0.5;
    float lane = m.x * 0.35 + warp - uClock * sp * 0.8;
    float rip = pow(0.5 + 0.5 * sin(lane * 6.2832), 3.0);
    float patchy = smoothstep(0.25, 0.85, fbm(m * 1.7 - flow * 0.8));
    float grainy = 0.6 + 0.4 * fbm(m * 3.2 + vec2(uClock * 0.25, uClock * 0.18));
    /* У края кнопки переливы мягко гаснут — свет живёт внутри. */
    float body = smoothstep(0.0, 6.0, -d);
    col += uBrand * rip * patchy * grainy * body * uEnergy * unfilled * inside;
  }
#ifdef LAB
  else if (uEnergy > 0.001) {
    vec2 m = vPx / 70.0;
    float depth = clamp(-d / max(uRect.w, 1.0), 0.0, 1.0); // 0 — край, 1 — середина
    float lane = depth * uEnergyRings + (fbm(m * 1.3 + vec2(uClock * 0.2, 0.0)) - 0.5) * 0.25 - uClock * uEnergySpeed * uEnergyDir;
    float ph = fract(lane);
    float waves = exp(-pow((ph - 0.5) / 0.17, 2.0));
    float beat = step(0.55, hash1(floor(lane) * 1.37));
    float pulses = pow(max(0.0, 1.0 - abs(ph - 0.5) * 5.0), 4.0) * beat;
    float pattern = waves * 0.7 + pulses * 0.6;
    float grainy = fbm(m * 2.4 + vec2(uClock * 0.25, uClock * 0.18));
    col += uBrand * pattern * (0.35 + 0.65 * grainy) * uEnergy * unfilled * inside;
  }
#endif
  /* Фронт заливки: светящаяся кромка там, где волна проходит кнопку. */
  float band = exp(-pow((dl - uWaveR) / max(uFillSoft * 1.4, 1.0), 2.0));
  col += mix(uBrand, uHot, 0.6) * band * uFillGlow * inside;
  vec2 e = abs(vPx - (uBoxN.xy + uBoxN.zw * 0.5)) / (uBoxN.zw * 0.5);
  col *= 1.0 - smoothstep(0.75, 1.0, max(e.x, e.y));
  gl_FragColor = vec4(col, clamp(lum(col), 0.0, 1.0));
}`

export class CtaLayer {
  constructor(gl) {
    this.gl = gl
    this.prog = program(gl, VERT, FRAG, ['aPos'], [
      'uRes', 'uBox', 'uRect', 'uRadius', 'uBrand', 'uHot', 'uClock',
      'uHalo', 'uHaloW', 'uFlash', 'uInner', 'uRing', 'uRingR', 'uRingW', 'uBoxN',
      'uWaveC', 'uWaveR', 'uFillSoft', 'uFillGlow', 'uEnergy', 'uEnergySpeed', 'uEnergyScale',
      ...(__LAB__ ? ['uEnergyRings', 'uEnergyDir', 'uEnergyStyle'] : []),
    ], 'cta')
  }

  /* rect — {x, y, w, h} кнопки в пикселях блока. */
  draw(f, rect, u) {
    if (!rect || (u.halo < 0.001 && u.flash < 0.001 && u.ring < 0.001 && u.energy < 0.001 && u.fillGlow < 0.001)) return
    const gl = this.gl
    const P = this.prog
    const pad = Math.max(u.haloW * 6, u.ringR + u.ringW * 4, 40)
    const box = [rect.x - pad, rect.y - pad, rect.w + pad * 2, rect.h + pad * 2]
    gl.useProgram(P.p)
    const U = P.u
    gl.uniform2f(U.uRes, f.W, f.H)
    gl.uniform4f(U.uBox, box[0], box[1], box[2], box[3])
    gl.uniform4f(U.uBoxN, box[0], box[1], box[2], box[3])
    gl.uniform4f(U.uRect, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, rect.h / 2)
    gl.uniform1f(U.uRadius, rect.h / 2)
    gl.uniform3fv(U.uBrand, f.colors.ctaYellow)
    gl.uniform3fv(U.uHot, f.colors.hot)
    gl.uniform1f(U.uClock, f.clock)
    gl.uniform1f(U.uHalo, u.halo)
    gl.uniform1f(U.uHaloW, u.haloW)
    gl.uniform1f(U.uFlash, u.flash)
    gl.uniform1f(U.uInner, u.inner ?? u.flash)
    gl.uniform1f(U.uRing, u.ring)
    gl.uniform1f(U.uRingR, u.ringR)
    gl.uniform1f(U.uRingW, u.ringW)
    gl.uniform2f(U.uWaveC, u.waveC[0], u.waveC[1])
    gl.uniform1f(U.uWaveR, u.waveR)
    gl.uniform1f(U.uFillSoft, u.fillSoft)
    gl.uniform1f(U.uFillGlow, u.fillGlow)
    gl.uniform1f(U.uEnergy, u.energy)
    gl.uniform1f(U.uEnergySpeed, u.energySpeed)
    if (__LAB__) {
      gl.uniform1f(U.uEnergyRings, u.energyRings)
      gl.uniform1f(U.uEnergyDir, u.energyDir)
      gl.uniform1f(U.uEnergyStyle, u.energyStyle ?? 1)
    }
    gl.uniform1f(U.uEnergyScale, u.energyScale ?? 1)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }
}
