import * as THREE from 'three';
import { createSphereMaterials } from './sphere-material.js';
import { makeInterior } from './scene-utils.js';
import { REFRACTION_LAYER } from './preview-water.js';

/**
 * Плавающие шарики. Движение в плоскости воды (локальные XZ молекулы) считается на CPU:
 * их несёт течение воды из GPU-симуляции (волны, плеск от вращения, встряхивание), они отталкиваются
 * от стенок и букв (поле расстояний из WaterSurfaceSim) и друг от друга. Высота — в вершинном шейдере по GPU-воде.
 * Шарики передаются в симуляцию и оставляют на воде небольшой след.
 *
 * Видимость сквозь воду:
 *  - в проходе преломления шарики пишут глубину — вода считает поглощение по реальной толщине
 *    перед шариком, а не до дальней стенки;
 *  - надводная часть — отдельный меш, рисуется после поверхности воды (renderOrder 4.6).
 */
export class FloatingSpheres {
  constructor({ meshes, cfg, water, pivot }) {
    this.cfg = cfg;
    this.water = water;
    const geo = new THREE.SphereGeometry(1, 48, 32);
    const { below, above } = createSphereMaterials(cfg, water.uniforms);
    this.materials = [below, above];
    const refrPass = water.uniforms.uRefrPass;
    const toPivot = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
    this.items = meshes.filter(Boolean).map((mesh, i) => {
      mesh.geometry = geo;
      mesh.scale.setScalar(cfg.radius);
      mesh.material = below;
      makeInterior(mesh, 3);
      mesh.layers.enable(REFRACTION_LAYER); // видны сквозь воду с преломлением
      const interiorHook = mesh.onBeforeRender;
      mesh.onBeforeRender = (renderer) => {
        interiorHook(renderer);
        below.depthWrite = cfg.depthUnderWater && refrPass.value > 0.5;
      };
      // надводная часть — после крышки воды (4.5), до ближней внутренней стенки (5)
      const top = new THREE.Mesh(geo, above);
      mesh.add(makeInterior(top, 4.6));
      for (const m of this.materials) m.blendSrc = THREE.OneFactor; // premultiplied
      // pivot <- родитель шарика
      const fromPivot = new THREE.Matrix4().copy(toPivot).multiply(mesh.parent.matrixWorld).invert();
      const p = mesh.getWorldPosition(new THREE.Vector3()).applyMatrix4(toPivot);
      return {
        mesh,
        fromPivot,
        start: new THREE.Vector2(p.x, p.z),
        pos: new THREE.Vector2(p.x, p.z),
        vel: new THREE.Vector2(),
        phase: i * 1.7,
      };
    });
    this.reset();
  }

  update(dt, time, motion) {
    const c = this.cfg;
    const sim = this.water.sim;
    const r = c.radius;
    const f = sim.cfg.forceScale * c.forceResponse;
    const wall = {};
    this.items.forEach((b, i) => {
      const { pos, vel, phase } = b;
      // шарик увлекается течением воды (скорость из GPU-симуляции под шариком)
      const flow = sim.ballFlow[i];
      let ax = (flow.x * c.flowFollow - vel.x) * c.drag;
      let az = (flow.y * c.flowFollow - vel.y) * c.drag;
      // прямое действие инерционной силы (обычно небольшое — вода уже передаёт её через течение)
      ax += (motion.omega * motion.omega * pos.x - motion.alpha * pos.y) * f;
      az += (motion.omega * motion.omega * pos.y + motion.alpha * pos.x) * f;
      // лёгкое блуждание
      ax += Math.sin(time * 0.37 + phase) * c.wander;
      az += Math.cos(time * 0.29 + phase * 1.3) * c.wander;
      // мягкое отталкивание от стенок и букв
      sim.wallAt(pos.x, pos.y, wall);
      const gap = r * c.wallRange - wall.distance;
      if (gap > 0) {
        ax += wall.nx * gap * c.wallStiffness;
        az += wall.nz * gap * c.wallStiffness;
      }
      vel.x += ax * dt;
      vel.y += az * dt;
    });
    // шарики не проходят друг сквозь друга
    for (let i = 0; i < this.items.length; i++) {
      for (let j = i + 1; j < this.items.length; j++) {
        const a = this.items[i];
        const b = this.items[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.y - a.pos.y;
        const d = Math.hypot(dx, dz) || 1e-6;
        const overlap = r * 2.05 - d;
        if (overlap > 0) {
          const nx = dx / d;
          const nz = dz / d;
          a.pos.x -= nx * overlap * 0.5; a.pos.y -= nz * overlap * 0.5;
          b.pos.x += nx * overlap * 0.5; b.pos.y += nz * overlap * 0.5;
          const rel = (b.vel.x - a.vel.x) * nx + (b.vel.y - a.vel.y) * nz;
          if (rel < 0) {
            a.vel.x += nx * rel * 0.5; a.vel.y += nz * rel * 0.5;
            b.vel.x -= nx * rel * 0.5; b.vel.y -= nz * rel * 0.5;
          }
        }
      }
    }
    const v = new THREE.Vector3();
    for (const b of this.items) {
      const { pos, vel, mesh } = b;
      const speed = vel.length();
      if (speed > c.maxSpeed) vel.multiplyScalar(c.maxSpeed / speed);
      const px = pos.x;
      const pz = pos.y;
      pos.addScaledVector(vel, dt);
      // жёсткое ограничение: центр не ближе радиуса к стенке/букве
      sim.wallAt(pos.x, pos.y, wall);
      if (wall.distance < 0) {
        // шаг увёл за стенку или внутрь буквы — откат и отскок
        pos.set(px, pz);
        vel.multiplyScalar(-c.restitution);
      } else if (wall.distance < r) {
        const push = r - Math.max(wall.distance, 0);
        pos.x += wall.nx * push;
        pos.y += wall.nz * push;
        const vn = vel.x * wall.nx + vel.y * wall.nz;
        if (vn < 0) {
          vel.x -= (1 + c.restitution) * vn * wall.nx;
          vel.y -= (1 + c.restitution) * vn * wall.nz;
        }
      }
      v.set(pos.x, this.water.levelLocal + r * c.buoyancy, pos.y).applyMatrix4(b.fromPivot);
      mesh.position.copy(v);
    }
    sim.setBalls(this.items, r);
  }

  reset() {
    for (const b of this.items) {
      b.pos.copy(b.start);
      b.vel.set(0, 0);
    }
  }

  set visible(v) {
    for (const { mesh } of this.items) mesh.visible = v;
  }
}
