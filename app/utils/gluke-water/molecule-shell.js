import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { createInnerGlassMaterial, createOuterGlassMaterial } from './glass-material.js';
import { createBubbleMaterial, REFRACTION_LAYER } from './preview-water.js';
import { makeInterior } from './scene-utils.js';

export class MoleculeShell {
  constructor({ outer, inner, cfg, quality }) {
    this.outer = outer;
    this.inner = inner;

    outer.material = createOuterGlassMaterial({
      ...cfg.glassOuter,
      dispersion: quality.dispersion ? cfg.glassOuter.dispersion : 0,
    });
    outer.castShadow = true;
    outer.renderOrder = 10;

    // внутренняя поверхность рисуется двумя слоями: дальняя стенка до воды, ближняя — после
    inner.material = createInnerGlassMaterial(cfg.glassInner, THREE.FrontSide);
    makeInterior(inner, 1);
    inner.layers.enable(REFRACTION_LAYER); // дальняя стенка видна сквозь воду
    const innerNear = new THREE.Mesh(inner.geometry, createInnerGlassMaterial(cfg.glassInner, THREE.BackSide));
    innerNear.matrix.copy(inner.matrix);
    innerNear.matrixAutoUpdate = false;
    inner.parent.add(makeInterior(innerNear, 5));
    this.innerLayers = [inner, innerNear];
    for (const l of this.innerLayers) l.material.blendSrc = THREE.OneFactor; // блики не гасятся альфой

    this.bubbles = this.createGlassBubbles({
      ...cfg.glassBubbles,
      count: Math.round(cfg.glassBubbles.count * quality.bubbleFactor),
    });
  }

  // пузырьки воздуха в толще стекла (между Sphere.006 и Sphere.002, толщина ~0.13)
  createGlassBubbles({ count, minSize, maxSize }) {
    const sampler = new MeshSurfaceSampler(this.outer).build();
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), createBubbleMaterial(false), count);
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      sampler.sample(p, n);
      p.addScaledVector(n, -(0.025 + Math.random() * 0.08));
      const s = minSize + Math.pow(Math.random(), 3) * (maxSize - minSize);
      m.makeScale(s, s, s).setPosition(p);
      mesh.setMatrixAt(i, m);
    }
    mesh.material.uniforms.uOpacity.value = 0.7;
    this.outer.add(makeInterior(mesh, 6));
    return mesh;
  }

  setGlassVisible(v) {
    this.outer.visible = v;
    for (const l of this.innerLayers) l.visible = v;
  }
}
