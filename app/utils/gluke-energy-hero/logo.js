/* Слой знака: заливка энергией по форме. Шейдер — порт GlukeEnergyFill
   (GLUKE — gluke.ru), переведённый из полноэкранного режима в квадрат вокруг
   знака, с поворотом, зарядкой, искажением и цветом «спящего» знака. */

import { PAD, createBaker, loadSvgImage, rasterize } from './baker.js'
import { NOISE_GLSL, program, texture } from './gl.js'
import { __LAB__ } from './lab.js'

const VERT = `
attribute vec2 aPos;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uSide;
varying vec2 vPx;
void main(){
  vPx = uCenter + (aPos - 0.5) * uSide;
  vec2 clip = vec2(vPx.x / uRes.x * 2.0 - 1.0, 1.0 - vPx.y / uRes.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
}`

const FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec2 vPx;
uniform sampler2D uTex;
uniform vec2 uCenter;
uniform float uMapSide;
uniform float uRot;
uniform float uClock;
uniform float uEdgeSoft;

uniform vec3 uBrand;
uniform vec3 uHot;
uniform vec3 uDormantColor;
uniform float uDormant;

uniform float uProgress;
uniform float uFrontWidth;
uniform float uFrontGlow;
uniform float uFillNoise;
uniform float uNoiseScale;
uniform float uFrontFlow;
uniform float uGrain;
uniform float uGrainScale;
uniform float uGrainSteps;

uniform float uIdle;
uniform float uIdleSpeed;
uniform float uIdleTight;
uniform float uIdleShape;

uniform float uCharge;
uniform float uChargeRipple;
uniform float uChargeRippleSpeed;

#ifdef LAB
uniform float uRim;
uniform float uRimWidth;
#endif
uniform float uHalo;
uniform float uHaloWidth;
uniform float uSoft;
uniform float uSoftWidth;
uniform float uBloom;
uniform float uBloomWidth;
#ifdef LAB
uniform float uBurst;
uniform float uBurstScale;
uniform float uBurstSpeed;
#endif
uniform float uGlow;
uniform float uBody;

uniform vec2 uCentre;
uniform float uShock;
uniform float uShockR;
uniform float uShockWidth;
uniform float uFlash;
uniform float uDistort;
uniform vec2 uEntry;
uniform float uEntryPulse;
uniform float uEntrySize;
uniform float uOpacity;
${NOISE_GLSL}
void main(){
  vec2 d = vPx - uCenter;
  float c = cos(uRot), s = sin(uRot);
  vec2 l = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
  vec2 m = vec2(l.x, -l.y) / uMapSide + 0.5;
  vec2 m0 = m;
  if (uDistort > 0.0001) {
    m += (vec2(fbm(m * 5.0 + vec2(uClock * 0.9, 0.0)), fbm(m * 5.0 + vec2(13.1, -uClock * 0.8))) - 0.5) * uDistort;
  }

  vec4 tx = texture2D(uTex, m);
  float sd = tx.r - 0.5;
  float arrival = tx.g;
  float softOut = tx.a;

#ifdef GL_OES_standard_derivatives
  float aa = max(fwidth(sd), 1e-5);
#else
  float aa = max(uEdgeSoft, 1e-5);
#endif
  float cov = smoothstep(-aa, aa, sd);

  vec3 rgb = vec3(0.0);
  float alpha = 0.0;

  if (cov > 0.002) {
    float n = fbm(m * uNoiseScale + vec2(0.0, -uClock * uFrontFlow));
    float cells = fbm(m * uGrainScale + 31.7);
    float steps = max(uGrainSteps, 1.0);
    float patch = floor(cells * steps) / steps;
    float wave = arrival + (n - 0.5) * uFillNoise + (patch - 0.5) * uGrain;
    float w = max(uFrontWidth, 0.004);
    float span = w + (uFillNoise + uGrain) * 0.5;
    float P = mix(-span, 1.0 + span, uProgress);
    float fill = smoothstep(P + w, P - w, wave);
    float live = smoothstep(0.0, 0.06, uProgress) * (1.0 - smoothstep(0.94, 1.0, uProgress));
    float band = exp(-pow((wave - P) / w, 2.0) * 1.6) * live;

    vec3 dull = uDormantColor * uDormant;
    vec3 body = mix(dull, uBrand * uBody, fill);
    body += uBrand * band * uFrontGlow;

    if (uIdle > 0.001) {
      float lane = arrival * uIdleTight - uClock * uIdleSpeed;
      float ph = fract(lane);
      float waves = exp(-pow((ph - 0.5) / 0.17, 2.0));
      float beat = step(0.55, hash1(floor(lane) * 1.37));
      float pulses = pow(max(0.0, 1.0 - abs(ph - 0.5) * 5.0), 4.0) * beat;
      float fil = ridged(vec2(arrival * 9.0, 0.0) + m * uNoiseScale * 1.4 + vec2(0.0, -uClock * uIdleSpeed * 2.2));
      float bolts = pow(clamp(fil, 0.0, 1.0), 7.0) * (0.35 + 0.65 * beat);
      float w0 = max(0.0, 1.0 - abs(uIdleShape));
      float w1 = max(0.0, 1.0 - abs(uIdleShape - 1.0));
      float w2 = max(0.0, 1.0 - abs(uIdleShape - 2.0));
      float pattern = (waves * w0 + pulses * w1 + bolts * w2) / max(w0 + w1 + w2, 0.001);
      float grainy = fbm(m * uNoiseScale * 1.7 + vec2(uClock * 0.25, uClock * 0.18));
      body += uBrand * pattern * (0.35 + 0.65 * grainy) * uIdle * (1.0 - fill);
    }

    /* Зарядка: энергия переливается внутри формы. Не полосы по координате,
       а мягкая синусоида, изогнутая текучим шумом и погашенная пятнами —
       свет расходится неровными языками, как жидкость. */
    if (uCharge > 0.001) {
      vec2 flow = vec2(uClock * 0.35 * uChargeRippleSpeed, -uClock * 0.27 * uChargeRippleSpeed);
      float warp = fbm(m * 2.6 + flow) * 1.6 + fbm(m * 5.3 - flow * 1.3) * 0.5;
      float lane = arrival * 2.2 + warp - uClock * uChargeRippleSpeed * 0.8;
      float rip = pow(0.5 + 0.5 * sin(lane * 6.2832), 3.0);
      float patchy = smoothstep(0.25, 0.85, fbm(m * 3.4 - flow * 0.8));
      body += uBrand * rip * patchy * uCharge * uChargeRipple * fill;
      body = mix(body, uHot, uCharge * 0.12 * fill);
    }
    /* Ядро, в котором зарождается энергия: горячая точка внутри тела знака. */
    float ember = exp(-length(m0 - uEntry) / max(uEntrySize, 0.005));
    body += mix(uBrand, uHot, 0.5) * ember * uEntryPulse * (0.45 + 0.55 * fill);

#ifdef LAB
    float edge = 1.0 - smoothstep(0.0, max(uRimWidth, 0.01), sd);
    body += uBrand * edge * uRim * (0.15 + 0.85 * fill) * (0.6 + 0.4 * uBody);
#endif
    body = mix(body, uHot, clamp(uFlash, 0.0, 1.0) * 0.75);

    rgb += body * cov;
    alpha += cov;
  }

  /* Поля расстояний обрезаны (sd до 0.5, softOut до 1), поэтому у экспоненты
     есть «пол» — постоянная засветка по всему квадрату. Вычитаем его, чтобы
     свет вдали от знака уходил ровно в ноль. */
  float outD = max(-sd, 0.0);
  float hw = max(uHaloWidth, 0.002);
  float hFloor = exp(-0.5 / hw);
  float halo = max(exp(-outD / hw) - hFloor, 0.0) / (1.0 - hFloor);
  float sw = max(uSoftWidth, 0.01);
  float sFloor = exp(-1.0 / sw);
  float soft = max(exp(-softOut / sw) - sFloor, 0.0) / (1.0 - sFloor);
  float r = length(m0 - uCentre);
  float bloom = exp(-r / max(uBloomWidth, 0.01));
  float ring = exp(-pow((r - uShockR) / max(uShockWidth, 0.01), 2.0)) * uShock;
#ifdef LAB
  vec2 dir = (m0 - uCentre) / max(r, 1e-4);
  float burst = 1.0 + uBurst * (fbm(dir * uBurstScale * 2.0 + vec2(r * uBurstScale, uClock * uBurstSpeed)) - 0.5) * 2.0;
#else
  float burst = 1.0;
#endif
  float glowAmt = (halo * uHalo + soft * uSoft + bloom * uBloom) * uGlow;
  vec3 glow = uBrand * (glowAmt * max(burst, 0.0) + ring) * (1.0 + uFlash * 1.2) * (1.0 - cov);
  /* Мягкое сжатие: на пике свет не заливает блок сплошной плашкой. */
  glow = glow / (1.0 + lum(glow) * 0.8);
  /* Край квадрата не должен читаться: гасим свет к его границе. */
  vec2 q = abs(vPx - uCenter) / (0.5 * uMapSide * ${'${EXTENT}'});
  glow *= 1.0 - smoothstep(0.7, 1.0, max(q.x, q.y));
  rgb += glow;
  alpha += lum(glow);

  gl_FragColor = vec4(rgb, clamp(alpha, 0.0, 1.0)) * uOpacity;
}`

const UNIFORMS = [
  'uRes', 'uCenter', 'uSide', 'uTex', 'uMapSide', 'uRot', 'uClock', 'uEdgeSoft',
  'uBrand', 'uHot', 'uDormantColor', 'uDormant',
  'uProgress', 'uFrontWidth', 'uFrontGlow', 'uFillNoise', 'uNoiseScale', 'uFrontFlow',
  'uGrain', 'uGrainScale', 'uGrainSteps',
  'uIdle', 'uIdleSpeed', 'uIdleTight', 'uIdleShape',
  'uCharge', 'uChargeRipple', 'uChargeRippleSpeed',
  'uHalo', 'uHaloWidth', 'uSoft', 'uSoftWidth',
  'uBloom', 'uBloomWidth', 'uGlow', 'uBody',
  'uCentre', 'uShock', 'uShockR', 'uShockWidth', 'uFlash', 'uDistort', 'uEntry', 'uEntryPulse', 'uEntrySize', 'uOpacity',
  ...(__LAB__ ? ['uRim', 'uRimWidth', 'uBurst', 'uBurstScale', 'uBurstSpeed'] : []),
]

export class LogoLayer {
  constructor(gl, svgText) {
    this.gl = gl
    /* Квадрат фиксированного размера в знаках; свет у края гасится в шейдере. */
    this.extentBaked = 1
    this.prog = null
    this._buildProgram(2.6)
    this.tex = texture(gl, 1, 1, new Uint8Array([0, 255, 0, 255]))
    this.ready = false
    this.centre = [0.5, 0.5]
    this.entry = [0.5, 0.5]
    this.points = new Float32Array(0) // точки внутри знака, координаты карты
    this.angle = null
    this.detail = 0
    this.img = null
    this.baker = createBaker(r => this._onBaked(r))
    loadSvgImage(svgText).then((img) => {
      this.img = img
      if (this.pendingDetail) this.bake(this.pendingDetail, this.pendingAngle)
    })
  }

  _buildProgram(extent) {
    if (this.extentBaked === extent) return
    const gl = this.gl
    if (this.prog) gl.deleteProgram(this.prog.p)
    this.prog = program(gl, VERT, FRAG.replace('${EXTENT}', extent.toFixed(3)), ['aPos'], UNIFORMS, 'logo')
    this.extentBaked = extent
  }

  bake(detail, angle) {
    this.pendingDetail = detail
    this.pendingAngle = angle
    if (!this.img) return
    const d = Math.max(0.5, Math.min(2, detail || 1))
    if (d === this.detail) {
      if ((angle == null) !== (this.angle == null) || Math.abs(angle - this.angle) > 0.5) {
        this.angle = angle
        this.baker.run({ type: 'fields', angle })
      }
      return
    }
    this.detail = d
    this.angle = angle
    this.grid = Math.max(256, Math.min(2048, Math.round(1024 * d / 64) * 64))
    const fieldGrid = Math.max(96, Math.min(512, Math.round(256 * d / 16) * 16))
    this.sdScale = this.grid * 0.05
    const soft = rasterize(this.img, fieldGrid, PAD)
    this._collectPoints(soft, fieldGrid)
    this.baker.run({
      type: 'bake',
      grid: this.grid,
      fieldGrid,
      sdScale: this.sdScale,
      angle,
      cov: rasterize(this.img, this.grid, PAD),
      soft,
    })
  }

  /* Точки внутри знака — отсюда вылетают частицы импульса и слов. */
  _collectPoints(soft, size) {
    const inside = []
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (soft[y * size + x] > 0.6) inside.push((x + 0.5) / size, (y + 0.5) / size)
      }
    }
    this.points = new Float32Array(inside)
  }

  _onBaked(r) {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, r.grid, r.grid, 0, gl.RGBA, gl.UNSIGNED_BYTE, r.px)
    this.centre = r.centre
    this.entry = r.entry
    this.ready = true
  }

  /* Раскладка знака в пикселях блока. */
  place(cx, cy, sizePx, rotationDeg) {
    this.cx = cx
    this.cy = cy
    this.mapSide = sizePx / (1 - 2 * PAD)
    this.rot = rotationDeg * Math.PI / 180
  }

  /* Координаты карты (y вверх) → пиксели блока. */
  toPx(mx, my, out) {
    const lx = (mx - 0.5) * this.mapSide
    const ly = -(my - 0.5) * this.mapSide
    const c = Math.cos(this.rot), s = Math.sin(this.rot)
    out[0] = this.cx + c * lx - s * ly
    out[1] = this.cy + s * lx + c * ly
    return out
  }

  /* Направление полёта на экране → угол в пространстве карты. */
  mapAngle(tx, ty) {
    const c = Math.cos(this.rot), s = Math.sin(this.rot)
    const lx = c * tx + s * ty
    const ly = -s * tx + c * ty
    return Math.atan2(-ly, lx) * 180 / Math.PI
  }

  draw(f, L, u) {
    if (!this.ready) return
    const gl = this.gl
    this._buildProgram(L.fxExtent)
    const P = this.prog
    gl.useProgram(P.p)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    const U = P.u
    gl.uniform1i(U.uTex, 0)
    gl.uniform2f(U.uRes, f.W, f.H)
    gl.uniform2f(U.uCenter, this.cx, this.cy)
    gl.uniform1f(U.uSide, this.mapSide * L.fxExtent)
    gl.uniform1f(U.uMapSide, this.mapSide)
    gl.uniform1f(U.uRot, this.rot)
    gl.uniform1f(U.uClock, f.clock)
    gl.uniform1f(U.uEdgeSoft, (this.grid / this.sdScale) / Math.max(1, this.mapSide * f.dpr))
    gl.uniform3fv(U.uBrand, f.colors.energy)
    gl.uniform3fv(U.uHot, f.colors.hot)
    gl.uniform3fv(U.uDormantColor, f.colors.dormant)
    gl.uniform1f(U.uDormant, L.dormant)
    gl.uniform1f(U.uFrontWidth, L.frontWidth)
    gl.uniform1f(U.uFrontGlow, L.frontGlow)
    gl.uniform1f(U.uFillNoise, L.fillNoise)
    gl.uniform1f(U.uNoiseScale, L.noiseScale)
    gl.uniform1f(U.uFrontFlow, L.frontFlow)
    gl.uniform1f(U.uGrain, L.grain)
    gl.uniform1f(U.uGrainScale, L.grainScale)
    gl.uniform1f(U.uGrainSteps, L.grainSteps)
    gl.uniform1f(U.uIdleSpeed, L.idleSpeed)
    gl.uniform1f(U.uIdleTight, L.idleTight)
    gl.uniform1f(U.uIdleShape, L.idleShape)
    gl.uniform1f(U.uChargeRipple, L.chargeRipple)
    gl.uniform1f(U.uChargeRippleSpeed, L.chargeRippleSpeed)
    gl.uniform1f(U.uHalo, L.halo)
    gl.uniform1f(U.uHaloWidth, L.haloWidth)
    gl.uniform1f(U.uSoft, L.soft)
    gl.uniform1f(U.uSoftWidth, L.softWidth)
    gl.uniform1f(U.uBloom, L.bloom)
    gl.uniform1f(U.uBloomWidth, L.bloomWidth)
    if (__LAB__) {
      gl.uniform1f(U.uRim, L.rim)
      gl.uniform1f(U.uRimWidth, L.rimWidth)
      gl.uniform1f(U.uBurst, L.burst)
      gl.uniform1f(U.uBurstScale, L.burstScale)
      gl.uniform1f(U.uBurstSpeed, L.burstSpeed)
    }
    gl.uniform2f(U.uCentre, this.centre[0], this.centre[1])
    // покадровое
    gl.uniform1f(U.uProgress, u.progress)
    gl.uniform1f(U.uIdle, u.idle)
    gl.uniform1f(U.uCharge, u.charge)
    gl.uniform1f(U.uGlow, u.glow)
    gl.uniform1f(U.uBody, u.body)
    gl.uniform1f(U.uShock, u.shock)
    gl.uniform1f(U.uShockR, u.shockR)
    gl.uniform1f(U.uShockWidth, u.shockWidth)
    gl.uniform1f(U.uFlash, u.flash)
    gl.uniform1f(U.uDistort, u.distort)
    gl.uniform2f(U.uEntry, u.entry[0], u.entry[1])
    gl.uniform1f(U.uEntryPulse, u.entryPulse)
    gl.uniform1f(U.uEntrySize, u.entrySize ?? 0.035)
    gl.uniform1f(U.uOpacity, u.opacity ?? 1)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  destroy() {
    this.baker.destroy()
    this.gl.deleteTexture(this.tex)
  }
}
