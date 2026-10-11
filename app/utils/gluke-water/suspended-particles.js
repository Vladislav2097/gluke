import * as THREE from 'three';
import { makeInterior } from './scene-utils.js';
import { createBubbleMaterial, REFRACTION_LAYER } from './preview-water.js';

/**
 * Взвесь в воде для режима высокой воды: микропузырьки и частицы в объёме под поверхностью.
 * Их движение делает большую толщу воды водой, а не цветным стеклом:
 *  - медленно всплывают и дрейфуют по плавному полю течения;
 *  - при вращении отстают от стенок (вода раскручивается с запаздыванием, spinUp);
 *  - курсор расталкивает их в своём вертикальном столбе.
 * Движение на CPU в пространстве pivot; границы — воксельная маска объёма (сечения внутренней
 * оболочки по высоте) и буквы: они поворачиваются, поэтому проверяются каждый кадр по своему
 * габариту в собственном кадре, а не впекаются в маску.
 */
export class SuspendedParticles {
  constructor({ pivot, innerShell, obstacles, sim, cfg, count, level }) {
    this.cfg = cfg;
    this.level = level; // () => текущий уровень воды (локальный y)
    this.sim = sim;
    this.count = count;
    this.obstacles = obstacles;
    this.obstacleBoxes = obstacles.map((o) => {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      return o.geometry.boundingBox.clone().expandByScalar(0.01);
    });
    this.obstacleInv = obstacles.map(() => new THREE.Matrix4());
    this.buildVolume(innerShell, cfg.voxel);
    this.syncObstacles();

    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), createBubbleMaterial(false), count);
    this.mesh.material.uniforms.uOpacity.value = cfg.opacity;
    this.mesh.frustumCulled = false;
    this.mesh.layers.enable(REFRACTION_LAYER);
    pivot.add(makeInterior(this.mesh, 3));

    this.items = Array.from({ length: count }, () => ({
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, life: 1, size: 0, phase: 0,
    }));
    for (const p of this.items) this.spawn(p, Math.random());
    this.fluidOmega = 0; // угловая скорость, до которой раскрутилась вода
    this.matrix = new THREE.Matrix4();
    this.update(0, 0, { omega: 0 });
  }

  // воксели внутри внутренней оболочки и вне букв: сечения по высоте + заливка чёт-нечет
  buildVolume(innerShell, cell) {
    const { sim } = this;
    const box = new THREE.Box3().setFromObject(innerShell); // pivot вращается только вокруг Y — берём по XZ с запасом
    const half = Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z);
    this.min = new THREE.Vector3(-half, box.min.y, -half);
    this.n = new THREE.Vector3(
      Math.ceil((2 * half) / cell), Math.ceil((box.max.y - box.min.y) / cell), Math.ceil((2 * half) / cell));
    this.cell = cell;
    const { x: nx, y: ny, z: nz } = this.n;
    this.voxels = new Uint8Array(nx * ny * nz);
    const fill = (segs, value, layer) => {
      const xs = [];
      for (let k = 0; k < nz; k++) {
        const z = this.min.z + (k + 0.5) * cell;
        xs.length = 0;
        for (const s of segs) {
          if ((s[1] - z) * (s[3] - z) < 0) xs.push(s[0] + (s[2] - s[0]) * (z - s[1]) / (s[3] - s[1]));
        }
        xs.sort((a, b) => a - b);
        for (let q = 0; q + 1 < xs.length; q += 2) {
          const i0 = Math.max(0, Math.ceil((xs[q] - this.min.x) / cell - 0.5));
          const i1 = Math.min(nx - 1, Math.floor((xs[q + 1] - this.min.x) / cell - 0.5));
          for (let i = i0; i <= i1; i++) this.voxels[(layer * nz + k) * nx + i] = value;
        }
      }
    };
    sim.pivot.updateMatrixWorld(true);
    sim.toPivot.copy(sim.pivot.matrixWorld).invert();
    for (let j = 0; j < ny; j++) {
      const y = this.min.y + (j + 0.5) * cell;
      const segs = [];
      sim.sliceMesh(innerShell, y, segs, null);
      fill(segs, 1, j);
    }
    // отступ от стенок: частица не должна «влипать» в стекло
    const eroded = new Uint8Array(this.voxels);
    for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      const idx = (j * nz + k) * nx + i;
      if (!this.voxels[idx]) continue;
      if (!this.voxelAt(i + 1, j, k) || !this.voxelAt(i - 1, j, k) || !this.voxelAt(i, j + 1, k)
        || !this.voxelAt(i, j - 1, k) || !this.voxelAt(i, j, k + 1) || !this.voxelAt(i, j, k - 1)) eroded[idx] = 0;
    }
    this.voxels = eroded;
    this.cells = [];
    for (let idx = 0; idx < eroded.length; idx++) if (eroded[idx]) this.cells.push(idx);
  }

  voxelAt(i, j, k) {
    const { x: nx, y: ny, z: nz } = this.n;
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return 0;
    return this.voxels[(j * nz + k) * nx + i];
  }

  inside(p) {
    if (p.y > this.level() - 0.03) return false; // под поверхностью
    for (let i = 0; i < this.obstacles.length; i++) {
      if (this.obstacleBoxes[i].containsPoint(_q.copy(p).applyMatrix4(this.obstacleInv[i]))) return false;
    }
    const c = this.cell;
    return this.voxelAt(Math.floor((p.x - this.min.x) / c), Math.floor((p.y - this.min.y) / c),
      Math.floor((p.z - this.min.z) / c)) === 1;
  }

  spawn(p, ageFrac = 0) {
    const { x: nx, z: nz } = this.n;
    for (let tries = 0; tries < 20; tries++) {
      const idx = this.cells[Math.floor(Math.random() * this.cells.length)] ?? 0;
      const i = idx % nx;
      const k = Math.floor(idx / nx) % nz;
      const j = Math.floor(idx / (nx * nz));
      p.pos.set(i + Math.random(), j + Math.random(), k + Math.random()).multiplyScalar(this.cell).add(this.min);
      if (this.inside(p.pos)) break;
    }
    p.vel.set(0, 0, 0);
    p.life = 8 + Math.random() * 14;
    p.age = ageFrac * p.life;
    // в основном мелкие пузырьки, изредка крупнее
    p.size = this.cfg.size * (0.4 + Math.pow(Math.random(), 4) * 1.6);
    p.phase = Math.random() * 100;
    p.rise = this.cfg.rise * (0.3 + p.size / this.cfg.size); // крупные всплывают быстрее
  }

  // pivot -> кадр буквы с её текущим поворотом
  syncObstacles() {
    this.obstacles.forEach((o, i) => {
      o.updateMatrixWorld();
      this.obstacleInv[i].copy(o.matrixWorld).invert().multiply(this.sim.pivot.matrixWorld);
    });
  }

  /** motion — { omega }: угловая скорость контейнера вокруг Y */
  update(dt, time, motion) {
    const c = this.cfg;
    this.syncObstacles();
    // вода раскручивается вслед за стенками с запаздыванием; разница — течение относительно молекулы
    this.fluidOmega += (motion.omega - this.fluidOmega) * (1 - Math.exp(-dt / c.spinUp));
    const lag = (this.fluidOmega - motion.omega) * c.inertia;
    const cur = this.sim.uniforms.uCursor.value;
    const cr = this.sim.uniforms.uCursorRadius.value * 1.5;
    const k = 1 - Math.exp(-dt * c.drag);
    for (let n = 0; n < this.count; n++) {
      const p = this.items[n];
      p.age += dt;
      if (p.age > p.life) this.spawn(p);
      const { pos, vel } = p;
      // желаемая скорость: всплытие + плавное поле течения + отставание от вращения (ω × r вокруг оси Y)
      const t = time * 0.25 + p.phase;
      _target.set(
        Math.sin(pos.y * 1.7 + t) * c.drift + lag * pos.z,
        p.rise + Math.sin(pos.x * 1.3 + t * 0.7) * c.drift * 0.4,
        Math.cos(pos.x * 1.1 - t * 0.8) * c.drift - lag * pos.x,
      );
      // курсор: толкает всё в вертикальном столбе под/над собой
      const dx = pos.x - cur.x;
      const dz = pos.z - cur.y;
      const d2 = dx * dx + dz * dz;
      if (d2 < cr * cr) {
        const w = 1 - Math.sqrt(d2) / cr;
        _target.x += cur.z * w * c.cursorPush;
        _target.z += cur.w * w * c.cursorPush;
      }
      vel.lerp(_target, k);
      _next.copy(pos).addScaledVector(vel, dt);
      if (this.inside(_next)) pos.copy(_next);
      else {
        // у стенки: гасим скорость и пробуем скользить вдоль неё по отдельным осям
        for (const axis of ['x', 'y', 'z']) {
          const prev = pos[axis];
          pos[axis] += vel[axis] * dt;
          if (!this.inside(pos)) { pos[axis] = prev; vel[axis] *= -0.3; }
        }
        if (!this.inside(pos)) this.spawn(p);
      }
      const fade = Math.min(1, p.age / 1.5, (p.life - p.age) / 1.5);
      this.matrix.makeScale(p.size * fade, p.size * fade, p.size * fade).setPosition(pos);
      this.mesh.setMatrixAt(n, this.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  reset() {
    this.fluidOmega = 0;
    for (const p of this.items) this.spawn(p, Math.random());
  }

  set visible(v) { this.mesh.visible = v; }
  get visible() { return this.mesh.visible; }
}

const _target = new THREE.Vector3();
const _q = new THREE.Vector3();
const _next = new THREE.Vector3();
