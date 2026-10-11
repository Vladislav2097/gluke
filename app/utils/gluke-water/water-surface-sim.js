import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';

/**
 * GPU-симуляция поверхности воды (height field, линейная модель мелкой воды).
 *
 * Сетка лежит в локальном пространстве молекулы (pivot) в плоскости XZ на уровне воды.
 * Маска и поле расстояний до стенки строятся из реального сечения Sphere.006 на этом уровне;
 * буквы, пересекающие воду, вырезаются из маски как препятствия — волны отражаются от стенок
 * и от букв, огибают их и набегают на них при вращении.
 *
 * Состояние: r = отклонение высоты h, g = dh/dt, ba = горизонтальная скорость воды u (м/с).
 * ∂²h/∂t² = c²·∇·(∇h − f/g) − damping·∂h/∂t,  ∂u/∂t = −g∇h + f − dampU·u,
 * где f — инерционные силы вращающегося контейнера (центробежная ω²r и эйлерова −α×r).
 * На стенках и буквах поток через границу = 0. Скорость u используется шариками.
 */

const SIM_FRAG = /* glsl */ `
  uniform sampler2D uMask;
  uniform vec2 uOrigin;
  uniform vec2 uCell;
  uniform float uDt;
  uniform float uC2;
  uniform float uDamping;
  uniform float uViscosity;
  uniform float uRelax;
  uniform float uFlowDamping;
  uniform float uOmega;
  uniform float uAlpha;
  uniform float uGravity;
  uniform vec4 uDrops[4];         // x, z, радиус, импульс
  uniform vec4 uBalls[MAX_BALLS]; // x, z, vx, vz
  uniform float uBallRadius;
  uniform float uBallWake;
  uniform vec4 uCursor;          // x, z, vx, vz (локальные XZ, м и м/с)
  uniform float uCursorRadius;
  uniform float uCursorStrength;

  // инерционная сила на единицу массы в точке p (локальные XZ, ось вращения — Y через начало координат)
  vec2 bodyForce(vec2 p) {
    return uOmega * uOmega * p + uAlpha * vec2(-p.y, p.x);
  }

  float inside(ivec2 c) {
    ivec2 s = ivec2(resolution);
    if (c.x < 0 || c.y < 0 || c.x >= s.x || c.y >= s.y) return 0.0;
    return texelFetch(uMask, c, 0).r;
  }

  void main() {
    ivec2 c = ivec2(gl_FragCoord.xy);
    vec4 st = texelFetch(heightmap, c, 0);
    if (inside(c) < 0.5) {
      // за стенкой/в букве: продолжаем высоту соседней воды, чтобы линейная выборка у стекла
      // не тянула поверхность к уровню покоя (иначе на стенках остаются «следы»)
      float sw = 0.0;
      vec4 acc = vec4(0.0);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        if (i == 0 && j == 0) continue;
        ivec2 n = c + ivec2(i, j);
        ivec2 sz = ivec2(resolution);
        if (n.x < 0 || n.y < 0 || n.x >= sz.x || n.y >= sz.y) continue;
        float w = inside(n) > 0.5 ? 1.0 : 0.15;
        acc += texelFetch(heightmap, n, 0) * w;
        sw += w;
      }
      vec4 ext = sw > 0.0 ? acc / sw : vec4(0.0);
      gl_FragColor = vec4(ext.r, 0.0, ext.ba);
      return;
    }
    vec2 p = uOrigin + (vec2(c) + 0.5) * uCell;

    float lapH = 0.0;
    float lapV = 0.0;
    float hn[4];
    float open[4];
    ivec2 dirs[4] = ivec2[4](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));
    for (int i = 0; i < 4; i++) {
      ivec2 n = c + dirs[i];
      open[i] = inside(n);
      hn[i] = st.r;
      if (open[i] < 0.5) continue; // стенка / буква: нет потока через границу
      vec4 sn = texelFetch(heightmap, n, 0);
      hn[i] = sn.r;
      vec2 d = vec2(dirs[i]);
      float s = dot(abs(d), uCell);
      vec2 mid = p + d * uCell * 0.5;
      lapH += (sn.r - st.r) / (s * s) - dot(bodyForce(mid), d) / (uGravity * s);
      lapV += (sn.g - st.g) / (s * s);
    }

    float acc = uC2 * lapH - uDamping * st.g + uViscosity * lapV - uRelax * st.r;

    // «капли» (клик / встряхивание): импульс с нулевым средним — объём воды сохраняется
    for (int i = 0; i < 4; i++) {
      vec4 dr = uDrops[i];
      if (dr.w == 0.0) continue;
      float q = dot(p - dr.xy, p - dr.xy) / (dr.z * dr.z);
      acc += dr.w * (1.0 - q) * exp(-q) / uDt;
    }

    // кильватер от шариков: вода поднимается перед шариком и опускается за ним
    for (int i = 0; i < MAX_BALLS; i++) {
      vec4 b = uBalls[i];
      vec2 dp = p - b.xy;
      float q = dot(dp, dp) / (uBallRadius * uBallRadius * 4.0);
      acc += uBallWake * dot(b.zw, dp) / uBallRadius * exp(-q);
    }

    // курсор мыши: волна перед курсором и впадина за ним + течение в сторону движения
    vec2 dc = p - uCursor.xy;
    float qc = exp(-dot(dc, dc) / (uCursorRadius * uCursorRadius));
    acc += uCursorStrength * dot(uCursor.zw, dc) / uCursorRadius * qc;

    float vel = st.g + acc * uDt;
    float h = st.r + vel * uDt;

    // горизонтальная скорость воды
    vec2 gradH = vec2((hn[0] - hn[1]) / (2.0 * uCell.x), (hn[2] - hn[3]) / (2.0 * uCell.y));
    vec2 u = st.ba + (-uGravity * gradH + bodyForce(p) - uFlowDamping * st.ba) * uDt;
    u += uCursor.zw * qc * uCursorStrength * 0.2 * uDt;
    if (open[0] < 0.5) u.x = min(u.x, 0.0);
    if (open[1] < 0.5) u.x = max(u.x, 0.0);
    if (open[2] < 0.5) u.y = min(u.y, 0.0);
    if (open[3] < 0.5) u.y = max(u.y, 0.0);

    gl_FragColor = vec4(h, vel, u);
  }
`;

// Скорость воды в точках шариков -> RGBA8 (для асинхронного чтения на CPU)
const PROBE_FRAG = /* glsl */ `
  uniform sampler2D uState;
  uniform vec2 uOrigin;
  uniform vec2 uSize;
  uniform vec4 uBalls[MAX_BALLS];
  uniform float uRange;
  void main() {
    int i = int(gl_FragCoord.x);
    vec2 uv = (uBalls[i].xy - uOrigin) / uSize;
    vec4 s = texture2D(uState, uv);
    gl_FragColor = vec4(clamp(s.ba / uRange * 0.5 + 0.5, 0.0, 1.0), 0.0, 1.0);
  }
`;

export class WaterSurfaceSim {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Mesh} innerShell — Sphere.006
   * @param {THREE.Mesh[]} obstacles — буквы (статические препятствия в воде)
   * @param {THREE.Object3D} pivot — локальное пространство симуляции
   * @param {number} level — уровень воды в пространстве pivot
   */
  constructor({ renderer, innerShell, obstacles = [], pivot, level, cfg, maxBalls = 8 }) {
    this.renderer = renderer;
    this.innerShell = innerShell;
    this.obstacles = obstacles;
    this.cfg = cfg;
    this.maxBalls = maxBalls;
    this.pivot = pivot;
    this.toPivot = new THREE.Matrix4();
    this.uniforms = {
      uMask: { value: null },
      uOrigin: { value: new THREE.Vector2() },
      uCell: { value: new THREE.Vector2() },
      uDt: { value: 1 / cfg.stepsPerSecond },
      uC2: { value: cfg.waveSpeed ** 2 },
      uDamping: { value: cfg.damping },
      uViscosity: { value: cfg.viscosity },
      uRelax: { value: cfg.relax },
      uFlowDamping: { value: cfg.flowDamping },
      uOmega: { value: 0 },
      uAlpha: { value: 0 },
      uGravity: { value: cfg.gravity },
      uDrops: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
      uBalls: { value: Array.from({ length: maxBalls }, () => new THREE.Vector4(1e3, 1e3, 0, 0)) },
      uBallRadius: { value: 0.1 },
      uBallWake: { value: cfg.ballWake },
      uCursor: { value: new THREE.Vector4(1e3, 1e3, 0, 0) },
      uCursorRadius: { value: cfg.cursorRadius },
      uCursorStrength: { value: cfg.cursorStrength },
    };
    this.origin = new THREE.Vector2();
    this.size = new THREE.Vector2();
    this.cell = new THREE.Vector2();
    this.accumulator = 0;
    this.pendingDrops = [];
    this.ballFlow = Array.from({ length: maxBalls }, () => new THREE.Vector2());
    this.flowRange = 0.5; // м/с — диапазон кодирования скорости в RGBA8

    this.probeTarget = new THREE.WebGLRenderTarget(maxBalls, 1, { depthBuffer: false });
    this.probeBuffer = new Uint8Array(maxBalls * 4);
    this.probeUniforms = {
      uState: { value: null },
      uOrigin: { value: this.origin },
      uSize: { value: this.size },
      uBalls: this.uniforms.uBalls,
      uRange: { value: this.flowRange },
    };
    this.probePending = false;

    this.build(level);
  }

  // (пере)строить маску и GPU-сетку для уровня воды level
  build(level) {
    this.level = level;
    // пересчёт при каждой перестройке: молекула к этому моменту может быть повёрнута
    this.pivot.updateMatrixWorld(true);
    this.toPivot.copy(this.pivot.matrixWorld).invert();
    this.buildMask(level, this.cfg.cellSize);
    this.gpu?.dispose();

    const gpu = new GPUComputationRenderer(this.nx, this.nz, this.renderer);
    gpu.setDataType(THREE.HalfFloatType);
    const variable = gpu.addVariable('heightmap', SIM_FRAG, gpu.createTexture());
    variable.minFilter = variable.magFilter = THREE.LinearFilter;
    gpu.setVariableDependencies(variable, [variable]);
    variable.material.defines.MAX_BALLS = this.maxBalls;
    Object.assign(variable.material.uniforms, this.uniforms);
    const err = gpu.init();
    if (err) throw new Error(`[water] ${err}`);
    this.gpu = gpu;
    this.variable = variable;

    this.uniforms.uMask.value = this.maskTexture;
    this.uniforms.uOrigin.value.copy(this.origin);
    this.uniforms.uCell.value.copy(this.cell);

    this.probeMaterial?.dispose();
    this.probeMaterial = gpu.createShaderMaterial(PROBE_FRAG, this.probeUniforms);
    this.probeMaterial.defines.MAX_BALLS = this.maxBalls;
  }

  // сечение меша плоскостью y = level -> отрезки в локальных XZ pivot
  sliceMesh(mesh, level, segs, bounds) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const index = geo.index;
    const m = new THREE.Matrix4().copy(this.toPivot).multiply(mesh.matrixWorld);
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const triCount = index ? index.count / 3 : pos.count / 3;
    for (let t = 0; t < triCount; t++) {
      for (let k = 0; k < 3; k++) {
        const i = index ? index.getX(t * 3 + k) : t * 3 + k;
        v[k].fromBufferAttribute(pos, i).applyMatrix4(m);
      }
      const pts = [];
      for (let k = 0; k < 3; k++) {
        const a = v[k];
        const b = v[(k + 1) % 3];
        if ((a.y - level) * (b.y - level) < 0) {
          const s = (level - a.y) / (b.y - a.y);
          pts.push(a.x + (b.x - a.x) * s, a.z + (b.z - a.z) * s);
        }
      }
      if (pts.length === 4) {
        segs.push(pts);
        if (bounds) {
          bounds.min.x = Math.min(bounds.min.x, pts[0], pts[2]); bounds.max.x = Math.max(bounds.max.x, pts[0], pts[2]);
          bounds.min.y = Math.min(bounds.min.y, pts[1], pts[3]); bounds.max.y = Math.max(bounds.max.y, pts[1], pts[3]);
        }
      }
    }
  }

  // заливка чёт-нечет построчно
  rasterize(segs, target, value) {
    const { nx, nz, cell, origin } = this;
    const xs = [];
    for (let j = 0; j < nz; j++) {
      const z = origin.y + (j + 0.5) * cell.y;
      xs.length = 0;
      for (const s of segs) {
        if ((s[1] - z) * (s[3] - z) < 0) xs.push(s[0] + (s[2] - s[0]) * (z - s[1]) / (s[3] - s[1]));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const i0 = Math.max(0, Math.ceil((xs[k] - origin.x) / cell.x - 0.5));
        const i1 = Math.min(nx - 1, Math.floor((xs[k + 1] - origin.x) / cell.x - 0.5));
        for (let i = i0; i <= i1; i++) target[j * nx + i] = value;
      }
    }
  }

  // Маска + расстояние до ближайшей стенки/буквы + нормаль от неё
  buildMask(level, cellSize) {
    const segs = [];
    const bounds = { min: new THREE.Vector2(Infinity, Infinity), max: new THREE.Vector2(-Infinity, -Infinity) };
    this.sliceMesh(this.innerShell, level, segs, bounds);
    const { min, max } = bounds;
    const pad = cellSize * 2;
    min.subScalar(pad);
    max.addScalar(pad);
    const nx = Math.ceil((max.x - min.x) / cellSize);
    const nz = Math.ceil((max.y - min.y) / cellSize);
    this.nx = nx;
    this.nz = nz;
    this.origin.copy(min);
    this.cell.set((max.x - min.x) / nx, (max.y - min.y) / nz);
    this.size.set(max.x - min.x, max.y - min.y);

    const inside = new Uint8Array(nx * nz);
    this.rasterize(segs, inside, 1);
    // буквы в воде — препятствия (с запасом в одну ячейку, чтобы тонкие штрихи не «протекали»)
    const solid = new Uint8Array(nx * nz);
    for (const o of this.obstacles) {
      const os = [];
      this.sliceMesh(o, level, os, null);
      if (os.length) this.rasterize(os, solid, 1);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      let s = 0;
      for (let dj = -1; dj <= 1 && !s; dj++) for (let di = -1; di <= 1 && !s; di++) {
        const x = i + di;
        const y = j + dj;
        if (x >= 0 && y >= 0 && x < nx && y < nz && solid[y * nx + x]) s = 1;
      }
      if (s) inside[j * nx + i] = 0;
    }

    // расстояние до стенки (двухпроходный chamfer 3-4), в метрах
    const INF = 1e9;
    const d = new Float32Array(nx * nz);
    for (let i = 0; i < d.length; i++) d[i] = inside[i] ? INF : 0;
    const relax = (i, j, di, dj, w) => {
      const x = i + di;
      const y = j + dj;
      if (x < 0 || y < 0 || x >= nx || y >= nz) return;
      const q = d[y * nx + x] + w;
      if (q < d[j * nx + i]) d[j * nx + i] = q;
    };
    const b = Math.SQRT2;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      relax(i, j, -1, 0, 1); relax(i, j, 0, -1, 1); relax(i, j, -1, -1, b); relax(i, j, 1, -1, b);
    }
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
      relax(i, j, 1, 0, 1); relax(i, j, 0, 1, 1); relax(i, j, 1, 1, b); relax(i, j, -1, 1, b);
    }
    const cs = (this.cell.x + this.cell.y) * 0.5;
    for (let i = 0; i < d.length; i++) d[i] *= cs;
    this.distance = d;
    this.inside = inside;

    // RGBA8: r — внутри, g — расстояние до стенки (0..0.2 м), ba — нормаль от стенки внутрь
    const data = new Uint8Array(nx * nz * 4);
    const at = (i, j) => d[Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      let gx = at(i + 1, j) - at(i - 1, j);
      let gz = at(i, j + 1) - at(i, j - 1);
      const l = Math.hypot(gx, gz) || 1;
      gx /= l; gz /= l;
      data[k * 4] = inside[k] * 255;
      data[k * 4 + 1] = Math.min(255, (d[k] / 0.2) * 255);
      data[k * 4 + 2] = (gx * 0.5 + 0.5) * 255;
      data[k * 4 + 3] = (gz * 0.5 + 0.5) * 255;
    }
    this.maskTexture?.dispose();
    const tex = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.maskTexture = tex;
  }

  // CPU-доступ к маске: расстояние до стенки/буквы и нормаль в точке (x, z); вне воды distance = -1
  wallAt(x, z, out) {
    const i = Math.floor((x - this.origin.x) / this.cell.x);
    const j = Math.floor((z - this.origin.y) / this.cell.y);
    const { nx, nz } = this;
    const d = (a, b) => this.distance[Math.min(nz - 1, Math.max(0, b)) * nx + Math.min(nx - 1, Math.max(0, a))];
    const inside = i >= 0 && j >= 0 && i < nx && j < nz && this.inside[j * nx + i] === 1;
    out.distance = inside ? d(i, j) : -1;
    out.nx = d(i + 1, j) - d(i - 1, j);
    out.nz = d(i, j + 1) - d(i, j - 1);
    const l = Math.hypot(out.nx, out.nz) || 1;
    out.nx /= l;
    out.nz /= l;
    return out;
  }

  // ближайшая к (x, z) точка воды (не у самой стенки) -> out.x, out.z; false — воды нет
  nearestWater(x, z, out) {
    const { nx, nz, cell, origin, distance } = this;
    let best = Infinity;
    let bi = -1;
    for (let j = 0; j < nz; j++) {
      const dz = origin.y + (j + 0.5) * cell.y - z;
      for (let i = 0; i < nx; i++) {
        if (distance[j * nx + i] < 0.05) continue;
        const dx = origin.x + (i + 0.5) * cell.x - x;
        const d = dx * dx + dz * dz;
        if (d < best) { best = d; bi = j * nx + i; }
      }
    }
    if (bi < 0) return false;
    out.x = origin.x + (bi % nx + 0.5) * cell.x;
    out.z = origin.y + (Math.floor(bi / nx) + 0.5) * cell.y;
    return true;
  }

  // курсор над водой: позиция и скорость в локальных XZ; null — курсор не над водой
  setCursor(x, z, vx, vz) {
    const c = this.uniforms.uCursor.value;
    if (x === null) c.set(1e3, 1e3, 0, 0);
    else c.set(x, z, vx, vz);
  }

  drop(x, z, radius, amount) {
    this.pendingDrops.push(new THREE.Vector4(x, z, radius, amount));
  }

  // случайная капля внутри воды (для клика / встряхивания)
  randomDrop(amount) {
    for (let tries = 0; tries < 30; tries++) {
      const x = this.origin.x + Math.random() * this.size.x;
      const z = this.origin.y + Math.random() * this.size.y;
      if (this.wallAt(x, z, _w).distance > 0.15) {
        this.drop(x, z, 0.12 + Math.random() * 0.1, amount);
        return;
      }
    }
  }

  setBalls(balls, radius) {
    const arr = this.uniforms.uBalls.value;
    for (let i = 0; i < this.maxBalls; i++) {
      const b = balls[i];
      if (b) arr[i].set(b.pos.x, b.pos.y, b.vel.x, b.vel.y);
      else arr[i].set(1e3, 1e3, 0, 0);
    }
    this.uniforms.uBallRadius.value = radius;
  }

  /** dt — кадр; omega, alpha — угловая скорость и ускорение контейнера вокруг Y (уже сглаженные) */
  update(dt, omega, alpha) {
    const u = this.uniforms;
    const f = this.cfg.forceScale;
    u.uOmega.value = omega * Math.sqrt(f);
    u.uAlpha.value = alpha * f;
    u.uDt.value = 1 / this.cfg.stepsPerSecond;
    const step = u.uDt.value;
    this.accumulator = Math.min(this.accumulator + dt, step * this.cfg.maxStepsPerFrame);
    while (this.accumulator >= step) {
      const drops = u.uDrops.value;
      for (let i = 0; i < 4; i++) {
        const d = this.pendingDrops.shift();
        if (d) drops[i].copy(d);
        else drops[i].set(0, 0, 1, 0);
      }
      this.gpu.compute();
      this.accumulator -= step;
    }
    this.probeFlow();
  }

  // скорость воды под шариками: рендер 8×1 и асинхронное чтение (результат — с задержкой в кадр)
  probeFlow() {
    if (this.probePending) return;
    this.probeUniforms.uState.value = this.texture;
    this.gpu.doRenderTarget(this.probeMaterial, this.probeTarget);
    this.probePending = true;
    this.renderer.readRenderTargetPixelsAsync(this.probeTarget, 0, 0, this.maxBalls, 1, this.probeBuffer)
      .then((buf) => {
        for (let i = 0; i < this.maxBalls; i++) {
          this.ballFlow[i].set(
            (buf[i * 4] / 255 - 0.5) * 2 * this.flowRange,
            (buf[i * 4 + 1] / 255 - 0.5) * 2 * this.flowRange,
          );
        }
      })
      .catch(() => { /* чтение недоступно — шарики без течения */ })
      .finally(() => { this.probePending = false; });
  }

  get texture() {
    return this.gpu.getCurrentRenderTarget(this.variable).texture;
  }

  reset() {
    const init = this.gpu.createTexture();
    for (const rt of this.variable.renderTargets) this.gpu.renderTexture(init, rt);
    init.dispose();
    this.pendingDrops.length = 0;
  }

  dispose() {
    this.gpu?.dispose();
    this.maskTexture?.dispose();
    this.probeMaterial?.dispose();
    this.probeTarget.dispose();
  }
}

const _w = {};
