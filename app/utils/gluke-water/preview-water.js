import * as THREE from 'three';
import { makeInterior } from './scene-utils.js';
import { WaterSurfaceSim } from './water-surface-sim.js';
import { SuspendedParticles } from './suspended-particles.js';

/**
 * Вода: высота поверхности берётся из GPU-симуляции (WaterSurfaceSim) в пространстве молекулы.
 * Тело воды — внутренняя оболочка, отсечённая поверхностью в шейдере;
 * крышка — сетка по сечению молекулы, видимая только внутри объёма (stencil capping).
 *
 * Два режима (quality):
 *  - с преломлением (REFRACTION): всё, что за водой (дальняя стенка, буквы, шарики, пузырьки),
 *    рендерится отдельным проходом в текстуру с глубиной. Ближние поверхности воды берут из неё
 *    картинку со смещением по нормали (волны искажают буквы) и поглощение по реальной толщине воды.
 *  - без преломления (телефоны): полупрозрачные слои поверх того, что за водой.
 */

export const REFRACTION_LAYER = 2;

export const WAVE_GLSL = /* glsl */ `
  uniform sampler2D uHeight;
  uniform sampler2D uMask;
  uniform vec2 uSimOrigin;
  uniform vec2 uSimSize;
  uniform float uLevel;
  uniform float uTime;
  uniform float uRipple;
  uniform mat4 uWorldToLocal;

  vec2 simUv(vec2 p) { return (p - uSimOrigin) / uSimSize; }

  // мелкая медленная рябь поверх симуляции: три слоя fBm-шума с разным масштабом, поворотом
  // и направлением дрейфа — повтор текстуры не читается
  uniform sampler2D uNoise;
  float ripple(vec2 p) {
    float t = uTime;
    vec2 q1 = p * 0.37 + vec2(t * 0.011, t * 0.007);
    vec2 q2 = mat2(0.8, -0.6, 0.6, 0.8) * p * 0.83 + vec2(-t * 0.017, t * 0.012);
    vec2 q3 = mat2(0.28, 0.96, -0.96, 0.28) * p * 1.91 + vec2(t * 0.026, -t * 0.021);
    return (texture2D(uNoise, q1).r - 0.5) * 2.2
         + (texture2D(uNoise, q2).r - 0.5) * 1.3
         + (texture2D(uNoise, q3).r - 0.5) * 0.7;
  }

  float wallDistance(vec2 p) { return texture2D(uMask, simUv(p)).g * 0.2; }

  // p — локальные XZ молекулы; результат — локальная (== мировая) высота поверхности
  float waterHeight(vec2 p) {
    vec2 uv = simUv(p);
    float h = texture2D(uHeight, uv).r;
    return uLevel + h + ripple(p) * uRipple;
  }
`;

// Упрощённая копия студийного окружения (Environment.js) для отражений на воде
const ENV_GLSL = /* glsl */ `
  float softSpot(vec3 r, vec3 dir, float size) {
    return smoothstep(1.0 - size, 1.0 - size * 0.25, dot(r, normalize(dir)));
  }
  vec3 envColor(vec3 r) {
    vec3 c = mix(vec3(0.004, 0.012, 0.03), vec3(0.055, 0.11, 0.24), smoothstep(-0.4, 0.8, r.y));
    c += vec3(1.0) * 3.5 * softSpot(r, vec3(0.0, 12.0, 6.0), 0.06);
    c += vec3(1.0) * 1.6 * softSpot(r, vec3(-11.0, 3.0, 5.0), 0.05);
    c += vec3(0.8, 0.9, 1.0) * 1.2 * softSpot(r, vec3(11.0, 2.0, 4.0), 0.05);
    c += vec3(0.62, 0.82, 1.0) * 0.9 * softSpot(r, vec3(0.0, 4.0, -12.0), 0.05);
    return c;
  }
`;

const CAUSTIC_GLSL = /* glsl */ `
  float caustic(vec2 p, float t) {
    vec2 q = p;
    for (int i = 0; i < 3; i++) {
      q += vec2(sin(q.y * 1.3 + t * 0.6), cos(q.x * 1.1 - t * 0.45)) * 0.55;
    }
    return pow(0.5 + 0.5 * sin(q.x * 2.2) * sin(q.y * 2.2), 10.0);
  }
`;

// Преломление: картинка «за водой» + её глубина, поглощение по длине пути в воде
const REFRACT_GLSL = /* glsl */ `
  #ifdef REFRACTION
  uniform sampler2D uRefrColor;
  uniform sampler2D uRefrDepth;
  uniform float uRefrStrength;
  uniform float uDensity;
  uniform float uCamNear;
  uniform float uCamFar;
  float linearDepth(float d) {
    float z = d * 2.0 - 1.0;
    return 2.0 * uCamNear * uCamFar / (uCamFar + uCamNear - z * (uCamFar - uCamNear));
  }
  // uv0 — экранные координаты фрагмента, offset — смещение от нормали, fragDepth — глубина фрагмента
  vec3 refractedBehind(vec2 uv0, vec2 offset, float fragDepth, vec3 tint, out float path) {
    vec2 uv = uv0 + offset;
    float sd = linearDepth(texture2D(uRefrDepth, uv).r);
    // если со смещением попали на объект перед водой — берём без смещения
    if (sd < fragDepth) { uv = uv0; sd = linearDepth(texture2D(uRefrDepth, uv).r); }
    vec4 behind = texture2D(uRefrColor, uv);
    path = clamp(sd - fragDepth, 0.0, 3.0);
    vec3 T = exp(-path * uDensity * (1.0 - tint));   // вода сильнее поглощает тёплые тона
    // полупрозрачный объект с глубиной (шарик): за ним вода продолжается,
    // поэтому для рассеяния берём полный путь с долей его прозрачности (1 - alpha)
    path = mix(3.0, path, behind.a);
    return behind.rgb * T;
  }
  #endif
`;

const BODY_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec4 vClip;
  varying float vViewDepth;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 mv = viewMatrix * w;
    vViewDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
    vClip = gl_Position;
  }
`;

// Объём воды за стеклом (ближняя стенка): преломлённая картинка за водой с поглощением,
// либо (без преломления) — полупрозрачный слой с поглощением по глубине под поверхностью.
const BODY_FRAG = /* glsl */ `
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform float uOpacity;
  uniform float uDepthScale;
  uniform float uCaustics;
  uniform float uHigh;
  uniform float uBottom;
  uniform float uHighWaves;
  uniform float uHighWobble;
  uniform float uHighCaustics;
  uniform float uNormalEps;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec4 vClip;
  varying float vViewDepth;
  ${WAVE_GLSL}
  ${CAUSTIC_GLSL}
  ${REFRACT_GLSL}
  // наклон поля симуляции в точке p: в режиме высокой воды волнение видно по всей толще
  vec2 simSlope(vec2 p) {
    float e = uNormalEps * 2.0;
    return vec2(texture2D(uHeight, simUv(p + vec2(e, 0.0))).r - texture2D(uHeight, simUv(p - vec2(e, 0.0))).r,
                texture2D(uHeight, simUv(p + vec2(0.0, e))).r - texture2D(uHeight, simUv(p - vec2(0.0, e))).r) / (2.0 * e);
  }
  void main() {
    vec3 L = (uWorldToLocal * vec4(vWorld, 1.0)).xyz;
    bool high = uHigh > 0.5;
    float h = waterHeight(L.xz);
    if (L.y > h) discard;
    float below = h - L.y;
    // высокий уровень: градиент цвета на всю высоту воды, а не на uDepthScale
    float depth = clamp(below / (high ? uLevel - uBottom : uDepthScale), 0.0, 1.0);
    vec2 slope = high ? simSlope(L.xz) * uHighWaves : vec2(0.0);
    vec3 n = normalize(vNormalW) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 v = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - abs(dot(n, v)), 3.0);
    float line = smoothstep(0.02, 0.0, below);                                    // кромка поверхности
    float shimmer = min(length(slope), 1.0);
    // медленное колыхание толщи: то, что за водой (буквы, дальняя стенка), слегка «плывёт»
    vec2 wobble = high ? vec2(
      texture2D(uNoise, L.xy * 0.23 + vec2(uTime * 0.021, uTime * 0.013)).r - 0.5,
      texture2D(uNoise, L.zy * 0.23 + vec2(-uTime * 0.017, uTime * 0.024)).r - 0.5) * uHighWobble : vec2(0.0);
    float causAmount = high ? uHighCaustics * (1.0 - 0.6 * depth) : uCaustics * (1.0 - depth);
    float caus = caustic(L.xz * 2.4 + L.y * 1.2 + slope * 3.0 + wobble * 2.0, uTime) * causAmount;

    #ifdef REFRACTION
    vec2 uv0 = vClip.xy / vClip.w * 0.5 + 0.5;
    vec3 nV = (viewMatrix * vec4(n, 0.0)).xyz;
    // волнение: смещение картинки за водой по наклону поля (локальный XZ -> вид)
    vec3 sW = transpose(mat3(uWorldToLocal)) * vec3(slope.x, 0.0, slope.y);
    vec2 sV = (viewMatrix * vec4(sW, 0.0)).xy;
    float path;
    vec2 offset = -nV.xy * uRefrStrength * 0.25 - sV * uRefrStrength * 0.5 + wobble * 0.03;
    vec3 behind = refractedBehind(uv0, offset, vViewDepth, uShallow, path);
    float scatter = 1.0 - exp(-path * uDensity * 0.6);
    vec3 col = behind + mix(uShallow, uDeep, pow(depth, 0.7)) * scatter * 0.55;
    col += uShallow * 0.25 * exp(-below / 0.06) + caus + line * 0.15 + fres * 0.04 + uShallow * shimmer * 0.25;
    gl_FragColor = vec4(col, 1.0);
    #else
    vec3 col = mix(uShallow, uDeep, pow(depth, 0.7));
    col += uShallow * 0.35 * exp(-below / 0.06) + caus * 1.5 + line * 0.2 + uShallow * shimmer * 0.4;
    float a = clamp(uOpacity * (0.3 + 0.7 * depth) + fres * 0.08 + line * 0.1, 0.0, 1.0);
    gl_FragColor = vec4(col * a, a);
    #endif
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const STENCIL_FRAG = /* glsl */ `
  varying vec3 vWorld;
  ${WAVE_GLSL}
  void main() {
    vec3 L = (uWorldToLocal * vec4(vWorld, 1.0)).xyz;
    if (L.y > waterHeight(L.xz)) discard;
    gl_FragColor = vec4(0.0);
  }
`;

const CAP_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec4 vClip;
  varying float vViewDepth;
  ${WAVE_GLSL}
  void main() {
    vec3 p = position;
    p.y = waterHeight(p.xz);
    vLocal = p;
    vec4 w = modelMatrix * vec4(p, 1.0);
    vWorld = w.xyz;
    vec4 mv = viewMatrix * w;
    vViewDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
    vClip = gl_Position;
  }
`;

const CAP_FRAG = /* glsl */ `
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform float uSurfaceOpacity;
  uniform vec3 uLightDir;
  uniform float uNormalEps;
  uniform float uFoam;
  uniform float uWallLine;
  varying vec3 vWorld;
  varying vec3 vLocal;
  varying vec4 vClip;
  varying float vViewDepth;
  ${WAVE_GLSL}
  ${ENV_GLSL}
  ${REFRACT_GLSL}
  void main() {
    float e = uNormalEps;
    vec2 p = vLocal.xz;
    float hx = waterHeight(p + vec2(e, 0.0)) - waterHeight(p - vec2(e, 0.0));
    float hz = waterHeight(p + vec2(0.0, e)) - waterHeight(p - vec2(0.0, e));
    vec3 nL = normalize(vec3(-hx, 2.0 * e, -hz));
    mat3 localToWorld = transpose(mat3(uWorldToLocal)); // pivot — только поворот
    vec3 n = normalize(localToWorld * nL);
    vec3 v = normalize(cameraPosition - vWorld);
    bool fromBelow = dot(n, v) < 0.0;
    if (fromBelow) n = -n;
    float ndv = max(dot(n, v), 0.0);
    float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
    vec3 r = reflect(-v, n);
    vec3 refl = fromBelow ? uShallow * 0.6 : envColor(r);            // снизу — внутреннее отражение
    float spec = pow(max(dot(r, normalize(uLightDir)), 0.0), 400.0) * 4.0;

    // только на поверхности воды: светлая кромка у стекла/букв и пена там, где вода быстро движется
    float dWall = wallDistance(p);
    float wall = exp(-dWall / 0.012) * uWallLine;
    float speed = abs(texture2D(uHeight, simUv(p)).g);
    float foam = smoothstep(0.02, 0.15, speed) * exp(-dWall / 0.05) * uFoam;


    #ifdef REFRACTION
    vec2 uv0 = vClip.xy / vClip.w * 0.5 + 0.5;
    // смещение — от отклонения нормали от «плоской» воды: волны искажают то, что под ними
    vec3 dn = (viewMatrix * vec4(n - vec3(0.0, fromBelow ? -1.0 : 1.0, 0.0), 0.0)).xyz;
    float path;
    vec3 behind = refractedBehind(uv0, -dn.xy * uRefrStrength, vViewDepth, uShallow, path);
    float scatter = 1.0 - exp(-path * uDensity * 0.6);
    vec3 trans = behind + mix(uShallow, uDeep, 0.5) * scatter * 0.5;
    vec3 col = mix(trans, refl, fres) + spec + wall * 0.25 + foam * 0.6;
    gl_FragColor = vec4(col, 1.0);
    #else
    float body = uSurfaceOpacity;
    vec3 col = refl * fres + uShallow * 0.5 * body * (1.0 - fres) + spec + wall * 0.25 + foam * 0.6;
    float a = clamp(fres + body * (1.0 - fres) + spec + wall * 0.2 + foam * 0.5, 0.0, 1.0);
    gl_FragColor = vec4(col, a);
    #endif
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const BUBBLE_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying float vFade;
  #ifdef ANIMATED
  attribute vec4 aSeed; // x, z, фаза, размер
  attribute float aDepth;
  uniform float uTime;
  uniform float uLevelLocal;
  #endif
  void main() {
    vec3 p = position;
    vFade = 1.0;
    #ifdef ANIMATED
    float f = fract(uTime * (0.08 + aSeed.w * 4.0) + aSeed.z);
    vec3 c = vec3(aSeed.x + sin(uTime * 2.0 + aSeed.z * 30.0) * 0.012,
                  uLevelLocal - aDepth * (1.0 - f) - 0.02,
                  aSeed.y);
    p = c + position * aSeed.w;
    vFade = smoothstep(0.0, 0.15, f) * smoothstep(1.0, 0.85, f);
    vec4 w = modelMatrix * vec4(p, 1.0);
    #else
    vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
    #endif
    vN = normalize(mat3(modelMatrix) * position);
    vV = normalize(cameraPosition - w.xyz);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const BUBBLE_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vN;
  varying vec3 vV;
  varying float vFade;
  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vN), vV)), 2.5);
    float hl = pow(max(dot(normalize(vN), normalize(vec3(0.4, 0.8, 0.5))), 0.0), 30.0);
    gl_FragColor = vec4(vec3(0.9, 0.97, 1.0) + hl, (fres * 0.9 + hl) * uOpacity * vFade);
    #include <colorspace_fragment>
  }
`;

export function createBubbleMaterial(animated, extraUniforms = {}) {
  return new THREE.ShaderMaterial({
    defines: animated ? { ANIMATED: '' } : {},
    uniforms: { uOpacity: { value: 0.9 }, ...extraUniforms },
    vertexShader: BUBBLE_VERT,
    fragmentShader: BUBBLE_FRAG,
  });
}

// Бесшовная fBm-текстура (value noise, 6 октав) для мелкой ряби
function createNoiseTexture(size = 256, seed = 7) {
  let st = seed;
  const rand = () => {
    st = (st * 1664525 + 1013904223) >>> 0;
    return st / 4294967296;
  };
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0, cells = 4; o < 6; o++, cells *= 2, amp *= 0.5) {
    const lattice = Array.from({ length: cells * cells }, rand);
    const at = (x, y) => lattice[((y + cells) % cells) * cells + ((x + cells) % cells)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const fy = (y / size) * cells;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        let tx = fx - x0;
        let ty = fy - y0;
        tx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
        ty = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
        out[y * size + x] += (a + (b - a) * ty) * amp;
      }
    }
    total += amp;
  }
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < out.length; i++) {
    const v = Math.round(Math.min(1, Math.max(0, (out[i] / total - 0.5) * 1.6 + 0.5)) * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// premultiplied-смешивание поверх makeInterior
function premultiplied(mesh) {
  mesh.material.blendSrc = THREE.OneFactor;
  return mesh;
}

export class PreviewWater {
  constructor({ renderer, pivot, innerShell, fluidSeed, highLevelMesh, obstacles, cfg, quality }) {
    this.cfg = cfg;
    this.pivot = pivot;
    this.renderer = renderer;
    this.refraction = quality.refraction;
    this.baseLevel = new THREE.Vector3().setFromMatrixPosition(fluidSeed.matrixWorld).applyMatrix4(
      new THREE.Matrix4().copy(pivot.matrixWorld).invert(),
    ).y;
    this.levelLocal = this.baseLevel + cfg.levelOffset;
    // уровень режима «высокая вода» отсчитывается от низа буквы (по умолчанию C в верхнем шаре)
    this.highBaseLevel = highLevelMesh
      ? new THREE.Box3().setFromObject(highLevelMesh).min.y - pivot.getWorldPosition(new THREE.Vector3()).y
      : this.baseLevel;

    this.sim = new WaterSurfaceSim({
      renderer, innerShell, obstacles, pivot, level: this.levelLocal, cfg: { ...cfg.sim, cellSize: quality.simCellSize, stepsPerSecond: quality.stepsPerSecond },
    });
    const sim = this.sim;

    this.uniforms = {
      uHeight: { value: sim.texture },
      uMask: { value: sim.maskTexture },
      uSimOrigin: { value: sim.origin },
      uSimSize: { value: sim.size },
      uLevel: { value: this.levelLocal },
      uTime: { value: 0 },
      uRipple: { value: cfg.ripple },
      uNoise: { value: createNoiseTexture() },
      uWorldToLocal: { value: new THREE.Matrix4() },
      uShallow: { value: new THREE.Color(cfg.shallowColor) },
      uDeep: { value: new THREE.Color(cfg.deepColor) },
      uOpacity: { value: cfg.opacity },
      uDepthScale: { value: cfg.depthScale },
      uSurfaceOpacity: { value: cfg.surfaceOpacity },
      uLightDir: { value: new THREE.Vector3(3, 8, 5) },
      uNormalEps: { value: Math.max(sim.cell.x, sim.cell.y) },
      uCaustics: { value: cfg.caustics },
      uFoam: { value: cfg.foam },
      uWallLine: { value: cfg.wallLine },
      uRefrColor: { value: null },
      uRefrDepth: { value: null },
      uRefrStrength: { value: cfg.refractionStrength },
      uDensity: { value: cfg.density },
      uCamNear: { value: 0.1 },
      uCamFar: { value: 100 },
      uRefrPass: { value: 0 }, // 1 во время прохода преломления (шарики пишут глубину)
      uHigh: { value: 0 }, // 1 — режим высокой воды
      uBottom: { value: 0 }, // низ внутренней оболочки: градиент цвета высокой воды
      uHighWaves: { value: cfg.high.waves },
      uHighWobble: { value: cfg.high.wobble },
      uHighCaustics: { value: cfg.high.caustics },
    };
    // pivot вращается только вокруг Y: мировые высоты == локальные
    this.uniforms.uBottom.value = new THREE.Box3().setFromObject(innerShell).min.y;

    if (this.refraction) this.createRefractionTarget(quality.refractionScale);

    const defines = this.refraction ? { REFRACTION: '' } : {};
    const geo = innerShell.geometry;
    const bodyMat = (side) => new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, side, defines,
    });
    const stencilMat = (side, op) => new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: BODY_VERT, fragmentShader: STENCIL_FRAG, side,
      colorWrite: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc,
      stencilZPass: op, stencilZFail: THREE.KeepStencilOp, stencilFail: THREE.KeepStencilOp,
    });
    const attach = (mat, order) => {
      const m = new THREE.Mesh(geo, mat);
      m.matrix.copy(innerShell.matrix);
      m.matrixAutoUpdate = false;
      innerShell.parent.add(makeInterior(m, order));
      return m;
    };

    // нормали Sphere.006 смотрят внутрь: FrontSide = дальняя стенка, BackSide = ближняя.
    // С преломлением дальний слой не нужен: поглощение считается по всей толщине воды.
    this.farBody = premultiplied(attach(bodyMat(THREE.FrontSide), 2));
    this.farBody.visible = !this.refraction;
    this.stencil = [
      attach(stencilMat(THREE.BackSide, THREE.IncrementWrapStencilOp), 3.5),
      attach(stencilMat(THREE.FrontSide, THREE.DecrementWrapStencilOp), 3.5),
    ];
    this.meshes = [this.farBody, ...this.stencil, premultiplied(attach(bodyMat(THREE.BackSide), 4))];

    // крышка в пространстве молекулы по габаритам сечения (вращается вместе со стеклом)
    const capMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: CAP_VERT, fragmentShader: CAP_FRAG, defines,
      side: THREE.DoubleSide,
      stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
      stencilZPass: THREE.KeepStencilOp,
    });
    this.cap = premultiplied(makeInterior(new THREE.Mesh(this.createCapGeometry(), capMat), 4.5));
    this.cap.frustumCulled = false;
    pivot.add(this.cap);
    this.meshes.push(this.cap);

    this.bubbleCount = Math.round(cfg.bubbles * quality.bubbleFactor);
    this.bubbles = this.createBubbles(this.bubbleCount);
    this.meshes.push(this.bubbles);
    this.particles = new SuspendedParticles({
      pivot, innerShell, obstacles, sim, cfg: cfg.high.particles, level: () => this.levelLocal,
      count: Math.round(cfg.high.particles.count * quality.bubbleFactor),
    });
    this.shown = true;
    this.high = false;
  }

  createCapGeometry() {
    const { sim } = this;
    const seg = this.cfg.surfaceSegmentsPerMeter;
    const geo = new THREE.PlaneGeometry(sim.size.x, sim.size.y,
      Math.ceil(sim.size.x * seg), Math.ceil(sim.size.y * seg)).rotateX(-Math.PI / 2);
    geo.translate(sim.origin.x + sim.size.x / 2, 0, sim.origin.y + sim.size.y / 2);
    return geo;
  }

  createRefractionTarget(scale) {
    this.refractionScale = scale;
    const depthTexture = new THREE.DepthTexture(1, 1);
    depthTexture.type = THREE.UnsignedIntType;
    this.refractionTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthTexture,
      depthBuffer: true,
    });
    this.uniforms.uRefrColor.value = this.refractionTarget.texture;
    this.uniforms.uRefrDepth.value = depthTexture;
  }

  /**
   * Проход преломления: всё, что может оказаться за водой (слой REFRACTION_LAYER), —
   * в текстуру с глубиной. Вызывается перед основным рендером каждого кадра.
   */
  renderRefraction(scene, camera) {
    if (!this.refraction) return;
    const r = this.renderer;
    const size = r.getDrawingBufferSize(_size);
    const w = Math.max(1, Math.round(size.x * this.refractionScale));
    const h = Math.max(1, Math.round(size.y * this.refractionScale));
    const rt = this.refractionTarget;
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);

    this.uniforms.uCamNear.value = camera.near;
    this.uniforms.uCamFar.value = camera.far;
    const prevRT = r.getRenderTarget();
    const prevLayers = camera.layers.mask;
    const prevShadow = r.shadowMap.autoUpdate;
    const prevClear = r.getClearAlpha();
    camera.layers.set(REFRACTION_LAYER);
    r.shadowMap.autoUpdate = false; // карта теней уже посчитана основным проходом
    r.setRenderTarget(rt);
    r.setClearAlpha(0);
    r.clear();
    this.uniforms.uRefrPass.value = 1;
    r.render(scene, camera);
    this.uniforms.uRefrPass.value = 0;
    r.setRenderTarget(prevRT);
    r.setClearAlpha(prevClear);
    r.shadowMap.autoUpdate = prevShadow;
    camera.layers.mask = prevLayers;
  }

  createBubbles(count) {
    // точки старта — случайные точки водной глади не у самой стенки/буквы
    const { sim } = this;
    const base = new THREE.SphereGeometry(1, 10, 8);
    const geo = new THREE.InstancedBufferGeometry().copy(base);
    geo.instanceCount = count;
    const aSeed = new Float32Array(count * 4);
    const aDepth = new Float32Array(count);
    const wall = {};
    for (let i = 0; i < count; i++) {
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 40; tries++) {
        x = sim.origin.x + Math.random() * sim.size.x;
        z = sim.origin.y + Math.random() * sim.size.y;
        if (sim.wallAt(x, z, wall).distance > 0.06) break;
      }
      aSeed.set([x, z, Math.random(), 0.004 + Math.random() * 0.01], i * 4);
      aDepth[i] = 0.08 + Math.random() * Math.min(0.5, Math.max(wall.distance, 0) * 1.5);
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(aSeed, 4));
    geo.setAttribute('aDepth', new THREE.InstancedBufferAttribute(aDepth, 1));
    const mat = createBubbleMaterial(true, {
      uTime: this.uniforms.uTime,
      uLevelLocal: { value: this.levelLocal },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.layers.enable(REFRACTION_LAYER);
    this.pivot.add(makeInterior(mesh, 3));
    return mesh;
  }

  // смещение уровня от плоскости Plane (обычный режим)
  setLevelOffset(offset) {
    this.cfg.levelOffset = offset;
    if (!this.high) this.applyLevel();
  }

  // смещение уровня от низа буквы (режим «высокая вода»)
  setHighLevelOffset(offset) {
    this.cfg.high.levelOffset = offset;
    if (this.high) this.applyLevel();
  }

  // уровень текущего режима: перестраивает маску, сетку, крышку и пузырьки
  applyLevel() {
    const level = this.high ? this.highBaseLevel + this.cfg.high.levelOffset : this.baseLevel + this.cfg.levelOffset;
    if (level === this.sim.level) return;
    this.levelLocal = level;
    this.sim.build(this.levelLocal);
    const u = this.uniforms;
    u.uLevel.value = this.levelLocal;
    u.uMask.value = this.sim.maskTexture;
    u.uHeight.value = this.sim.texture;
    u.uNormalEps.value = Math.max(this.sim.cell.x, this.sim.cell.y);
    this.cap.geometry.dispose();
    this.cap.geometry = this.createCapGeometry();
    this.bubbles.removeFromParent();
    this.bubbles.geometry.dispose();
    const idx = this.meshes.indexOf(this.bubbles);
    this.bubbles = this.createBubbles(this.bubbleCount);
    this.meshes[idx] = this.bubbles;
    this.applyVisibility();
  }

  shake(strength = 1) {
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) this.sim.randomDrop(this.cfg.dropStrength * strength * (0.6 + Math.random() * 0.6));
  }

  /** motion — { omega, alpha }: сглаженные угловая скорость и ускорение контейнера */
  update(dt, time, motion) {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uWorldToLocal.value.copy(this.pivot.matrixWorld).invert();
    this.sim.update(dt, motion.omega, motion.alpha);
    u.uHeight.value = this.sim.texture;
    if (this.high) this.particles.update(dt, time, motion);
  }

  reset() {
    this.sim.reset();
    this.particles.reset();
  }

  /** true — высокая вода (до буквы C): свой уровень, взвесь, колыхание толщи */
  setHigh(high) {
    this.high = high;
    this.uniforms.uHigh.value = high ? 1 : 0;
    this.applyLevel();
    this.particles.reset();
    this.applyVisibility();
  }

  applyVisibility() {
    for (const m of this.meshes) m.visible = this.shown;
    if (this.refraction) this.farBody.visible = false;
    this.particles.visible = this.shown && this.high;
  }

  set visible(v) {
    this.shown = v;
    this.applyVisibility();
  }

  // меши и материалы освобождает обход сцены во вьювере; здесь — то, чего в сцене нет
  dispose() {
    this.sim.dispose();
    this.refractionTarget?.dispose();
    this.refractionTarget?.depthTexture?.dispose();
  }
}

const _size = new THREE.Vector2();
