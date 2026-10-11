import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createConfig } from './config.js';
import { createEnvironment } from './environment.js';
import { createLighting } from './lighting.js';
import { MoleculeShell } from './molecule-shell.js';
import { Letters } from './letters.js';
import { FloatingSpheres } from './floating-spheres.js';
import { PreviewWater, REFRACTION_LAYER } from './preview-water.js';
import { findByName } from './scene-utils.js';

// опция `quality` > автоопределение устройства
export function resolveQuality(option, presets) {
  if (option && presets[option]) return option;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const short = Math.min(screen.width, screen.height);
  if (coarse && short < 600) return 'low'; // телефон
  if (coarse) return 'medium'; // планшет
  return 'high';
}

/**
 * Вьювер молекулы. На сайте живёт внутри виджета `gluke-water.js`: тот держит цикл кадров,
 * размер контейнера и параметры лаборатории, а вьювер — сцену.
 *   viewer.setRotationSpeed(rad/s), viewer.setScrollProgress(0..1), viewer.shake(), viewer.reset()
 *   new MoleculeViewer(el, { model, quality: 'low' | 'medium' | 'high', ratioCap, pixelBudget })
 *   viewer.setMaxFps(60) / { maxFps } — лимит кадров на мониторах 120–360 Гц (0 — без лимита)
 */
export class MoleculeViewer {
  constructor(container, options = {}) {
    this.cfg = createConfig();
    this.container = container;
    this.modelUrl = options.model;
    this.ratioCap = options.ratioCap ?? 2;
    this.pixelBudget = options.pixelBudget ?? Infinity;
    this.rotationSpeed = options.rotationSpeed ?? this.cfg.animation.rotationSpeed;
    this.maxFps = options.maxFps ?? this.cfg.animation.maxFps;
    this.vsyncMs = 0;
    this.vsyncPrev = null;
    this.vsyncCount = 0;
    this.scrollProgress = 0;
    this.paused = false;
    this.pointer = new THREE.Vector2();
    this.pointerSmooth = new THREE.Vector2();
    this.pointerActive = false;
    this.raycaster = new THREE.Raycaster();
    this.cursorHit = new THREE.Vector3();
    this.cursorPrev = null;
    this.cursorVel = new THREE.Vector3();
    this.autoAngle = 0;
    this.angle = 0;
    this.angularVel = 0;
    this.angularAccel = 0;
    this.motion = { omega: 0, alpha: 0 };
    this.time = 0;
    this.waterMode = options.waterMode ?? this.cfg.water.mode;
    this.spheresEnabled = true;
    this.qualityName = resolveQuality(options.quality, this.cfg.quality);
    this.quality = this.cfg.quality[this.qualityName];
    const q = this.quality;

    const renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance',
    });
    renderer.transmissionResolutionScale = q.transmissionScale;
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.environment = createEnvironment(renderer);
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    this.lights = createLighting(this.scene, this.cfg);
    this.lights.key.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
    // свет нужен и в проходе преломления воды
    for (const l of [this.lights.key, this.lights.rim, this.lights.fill]) l.layers.enable(REFRACTION_LAYER);
    this.backdrop = this.createTransmissionBackdrop();
    this.scene.add(this.backdrop);

    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    this.target = new THREE.Vector3();

    this.clock = new THREE.Timer();
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerLeave = () => {
      this.pointer.set(0, 0);
      this.pointerActive = false;
    };
    this.onClick = () => this.shake();
    renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    renderer.domElement.addEventListener('pointerleave', this.onPointerLeave);
    renderer.domElement.addEventListener('click', this.onClick);
  }

  // Заливает буфер transmission слабым «телом» стекла вместо полупрозрачного белого по умолчанию
  createTransmissionBackdrop() {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Vector4(...this.cfg.glassBody) } },
        vertexShader: 'void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }',
        fragmentShader: 'uniform vec4 uColor; void main() { gl_FragColor = vec4(uColor.rgb * uColor.a, uColor.a); }',
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      }),
    );
    mesh.frustumCulled = false;
    mesh.renderOrder = -100;
    mesh.onBeforeRender = (r) => {
      mesh.material.colorWrite = r.getRenderTarget() !== null;
    };
    return mesh;
  }

  async load() {
    const { cfg } = this;
    const gltf = await new GLTFLoader().loadAsync(this.modelUrl);
    // виджет могли уничтожить, пока грузилась модель
    if (this.disposed) return this;
    const model = gltf.scene;
    const n = cfg.names;

    const outer = findByName(model, n.outerShell);
    const inner = findByName(model, n.innerShell);
    const seed = findByName(model, n.fluidSeed);
    seed.visible = false;

    // центрируем по внешней оболочке и ставим чуть над «полом» для тени
    const box = new THREE.Box3().setFromObject(outer);
    const center = box.getCenter(new THREE.Vector3());
    const lift = 0.35;
    model.position.set(-center.x, -box.min.y + lift, -center.z);
    this.pivot.add(model);
    this.target.set(0, box.max.y - box.min.y, 0).multiplyScalar(0.5).add(new THREE.Vector3(0, lift, 0));
    this.size = box.getSize(new THREE.Vector3());
    this.pivot.updateMatrixWorld(true);

    this.shell = new MoleculeShell({ outer, inner, cfg, quality: this.quality });
    this.letters = Letters.fromMeshes({ meshes: n.letters.map((l) => findByName(model, l)), cfg: cfg.letters });
    this.water = new PreviewWater({
      renderer: this.renderer, pivot: this.pivot, innerShell: inner, fluidSeed: seed,
      highLevelMesh: findByName(model, cfg.water.high.levelMesh),
      obstacles: this.letters.colliders, cfg: cfg.water, quality: this.quality,
    });
    this.spheres = new FloatingSpheres({
      meshes: n.spheres.map((s) => findByName(model, s)), cfg: cfg.spheres, water: this.water, pivot: this.pivot,
    });

    this.setWaterMode(this.waterMode);
    this.lights.key.target.position.copy(this.target);
    this.onResize();
    this.ready = true;
    return this;
  }

  // Размер — по контейнеру (цикл и ResizeObserver держит виджет). Плотность пикселей
  // ограничена пресетом качества, потолком dpr сайта и площадью буфера: стекло с transmission
  // и проход преломления воды рисуют сцену несколько раз за кадр.
  onResize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    let ratio = Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio, this.ratioCap);
    if (w * h * ratio * ratio > this.pixelBudget) ratio = Math.sqrt(this.pixelBudget / (w * h));
    this.cssW = w;
    this.cssH = h;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const fitH = (this.size?.y ?? 4.4) * 0.5 * 1.35 / Math.tan(vFov / 2);
    const fitW = (this.size?.x ?? 6) * 0.5 * 1.25 / Math.tan(vFov / 2) / this.camera.aspect;
    this.distance = Math.max(fitH, fitW);
    this.camera.updateProjectionMatrix();
  }

  onPointerMove(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.pointerActive = true;
  }

  // Курсор над молекулой. Действует везде, где курсор касается молекулы (луч попадает во внешнюю
  // оболочку), на любой высоте: точка проецируется на вертикальную плоскость через центр молекулы
  // (лицом к камере) и опускается по вертикали на уровень воды — вода возмущается прямо под/над курсором.
  // В симуляцию уходит скорость движения курсора: горизонтальное движение — вдоль плоскости,
  // вертикальное — частично «вглубь» (cursorVertical). Неподвижный курсор воду не возмущает.
  updateCursor(dt) {
    const sim = this.water.sim;
    const hit = this.cursorHit;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    _n.set(this.camera.position.x, 0, this.camera.position.z).normalize();
    _plane.setFromNormalAndCoplanarPoint(_n, _origin);
    _hits.length = 0;
    if (!this.pointerActive || dt <= 0 || !this.raycaster.ray.intersectPlane(_plane, hit)
      || !this.raycaster.intersectObject(this.shell.outer, false, _hits).length) {
      this.cursorPrev = null;
      this.cursorVel.set(0, 0, 0);
      sim.setCursor(null);
      return;
    }
    if (this.cursorPrev) {
      _v.subVectors(hit, this.cursorPrev).divideScalar(dt);
      _v.addScaledVector(_n, -_v.y * sim.cfg.cursorVertical); // вверх — от камеры
      _v.y = 0;
      const max = sim.cfg.cursorMaxSpeed;
      if (_v.length() > max) _v.setLength(max);
      this.cursorVel.lerp(_v, 1 - Math.exp(-dt * 20));
    }
    this.cursorPrev = (this.cursorPrev ?? new THREE.Vector3()).copy(hit);
    hit.y = this.water.levelLocal; // pivot вращается только вокруг Y: мировой y == локальный
    _inv.copy(this.pivot.matrixWorld).invert();
    // вода под/над курсором: идём по лучу сквозь молекулу от точки входа и опускаем каждую точку
    // по вертикали на уровень воды; если столб нигде не пересекает воду (шар над уровнем, буква) —
    // берём ближайшую к нему воду
    const ray = this.raycaster.ray;
    const local = _v;
    let found = false;
    for (let t = _hits[0].distance; t < _hits[0].distance + CURSOR_RAY_DEPTH; t += CURSOR_RAY_STEP) {
      ray.at(t, local).applyMatrix4(_inv);
      if (sim.wallAt(local.x, local.z, _wall).distance >= 0) { found = true; break; }
    }
    if (!found) {
      ray.at(_hits[0].distance + CURSOR_RAY_DEPTH * 0.25, local).applyMatrix4(_inv);
      if (!sim.nearestWater(local.x, local.z, local)) {
        sim.setCursor(null);
        return;
      }
    }
    const speed = this.cursorVel.length();
    const lv = _v2.copy(this.cursorVel).transformDirection(_inv).multiplyScalar(speed);
    sim.setCursor(local.x, local.z, lv.x, lv.z);
  }

  /** 'level' — вода по Plane с шариками; 'high' — высокая вода до буквы C, без шариков */
  setWaterMode(mode) {
    this.waterMode = mode === 'high' ? 'high' : 'level';
    const high = this.waterMode === 'high';
    this.water.setHigh(high);
    this.spheres.visible = this.spheresEnabled && !high;
    if (high) this.water.sim.setBalls([], this.cfg.spheres.radius); // шарики не оставляют следа
  }

  setSpheresVisible(v) {
    this.spheresEnabled = v;
    this.spheres.visible = v && this.waterMode !== 'high';
  }

  setRotationSpeed(v) { this.rotationSpeed = v; }
  setMaxFps(v) { this.maxFps = v; }
  setScrollProgress(p) { this.scrollProgress = THREE.MathUtils.clamp(p, 0, 1); }
  shake(strength = 1) { this.water?.shake(strength); }
  togglePause() { this.paused = !this.paused; }

  reset() {
    this.autoAngle = 0;
    this.angle = 0;
    this.angularVel = 0;
    this.angularAccel = 0;
    this.water.reset();
    this.spheres.reset();
  }

  // Лимит кадров для мониторов 120–360 Гц: рисуем каждый N-й кадр развёртки (N подбирается по
  // измеренной частоте так, чтобы fps был не ниже maxFps) — ровный темп без рывков.
  // Скорость анимации от частоты не зависит (всё на dt), лимит только снимает лишнюю нагрузку.
  skipFrame(timestamp) {
    const raw = timestamp - (this.vsyncPrev ?? timestamp);
    this.vsyncPrev = timestamp;
    if (raw > 0 && raw < 50) this.vsyncMs = this.vsyncMs ? this.vsyncMs + (raw - this.vsyncMs) * 0.05 : raw;
    if (!this.maxFps || !this.vsyncMs) return false;
    const every = Math.max(1, Math.floor(1000 / this.maxFps / this.vsyncMs + 0.1));
    return ++this.vsyncCount % every !== 0;
  }

  // force — кадр вне цикла (виджет стоит, а параметр поменялся): лимит кадров его не пропускает
  tick(timestamp, force = false) {
    if (!this.ready) return;
    if (this.skipFrame(timestamp) && !force) return;
    if (this.container.clientWidth !== this.cssW || this.container.clientHeight !== this.cssH) this.onResize();
    this.clock.update(timestamp);
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    if (!this.paused) {
      this.time += dt;
      this.autoAngle += this.rotationSpeed * dt;
    }
    const anim = this.cfg.animation;

    // вращение: авто + скролл. Желаемая скорость пропорциональна оставшемуся углу (с потолком),
    // скорость догоняет её с ограниченным ускорением: плавный разгон и торможение без перелёта.
    const targetAngle = this.autoAngle + this.scrollProgress * anim.scrollRotation;
    const baseVel = this.paused ? 0 : this.rotationSpeed;
    const desiredVel = baseVel + THREE.MathUtils.clamp(
      (targetAngle - this.angle) * anim.follow, -anim.maxAngularVel, anim.maxAngularVel);
    const acc = THREE.MathUtils.clamp((desiredVel - this.angularVel) * anim.velResponse,
      -anim.maxAngularAccel, anim.maxAngularAccel);
    this.angularVel += acc * dt;
    this.angle += this.angularVel * dt;
    this.pivot.rotation.y = this.angle;
    this.pivot.updateMatrixWorld(true);

    // воде — сглаженные ω и α (фильтр убирает дрожание от неравномерных событий скролла)
    this.angularAccel = THREE.MathUtils.damp(this.angularAccel, acc, anim.accelSmoothing, dt);
    this.motion.omega = THREE.MathUtils.damp(this.motion.omega, this.angularVel, anim.accelSmoothing, dt);
    this.motion.alpha = this.angularAccel;

    // камера: угол обзора от скролла + лёгкий параллакс от курсора
    this.pointerSmooth.lerp(this.pointer, 1 - Math.exp(-dt * 4));
    const elev = THREE.MathUtils.lerp(0.12, 0.42, this.scrollProgress) + this.pointerSmooth.y * anim.hoverTilt;
    const azim = this.pointerSmooth.x * anim.hoverTilt * 1.5;
    this.camera.position.set(
      this.target.x + Math.sin(azim) * Math.cos(elev) * this.distance,
      this.target.y + Math.sin(elev) * this.distance,
      this.target.z + Math.cos(azim) * Math.cos(elev) * this.distance,
    );
    this.camera.lookAt(this.target);
    this.letters.faceCamera(this.camera);

    if (!this.paused) {
      this.updateCursor(dt);
      if (this.waterMode !== 'high') this.spheres.update(dt, this.time, this.motion);
      this.water.update(dt, this.time, this.motion);
    }
    this.water.renderRefraction(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  // Канвас перецепляется между контейнерами (кэш виджетов сайта): сцена остаётся прежней.
  attach(container) {
    this.container = container;
    container.appendChild(this.renderer.domElement);
    this.vsyncPrev = null;
    if (this.ready) this.onResize();
  }

  detach() {
    this.renderer.domElement.remove();
    this.onPointerLeave();
  }

  dispose() {
    this.disposed = true;
    this.ready = false;
    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('click', this.onClick);
    el.remove();
    const textures = new Set();
    this.scene.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material ?? [])) {
        for (const u of Object.values(m.uniforms ?? {})) if (u?.value?.isTexture) textures.add(u.value);
        m.dispose();
      }
    });
    for (const t of textures) t.dispose();
    this.scene.environment?.dispose();
    this.water?.dispose();
    this.renderer.dispose();
    // контекст отпускаем сразу, как и остальные виджеты сайта: живых контекстов у браузера немного
    this.renderer.forceContextLoss();
  }
}

const _plane = new THREE.Plane();
const CURSOR_RAY_DEPTH = 2.5; // м — насколько вглубь молекулы искать воду вдоль луча
const CURSOR_RAY_STEP = 0.04;
const _n = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _inv = new THREE.Matrix4();
const _wall = {};
const _hits = [];
