import { CustomBlending, OneFactor, OneMinusSrcAlphaFactor, SrcAlphaFactor } from 'three';

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// GLTFLoader убирает точки из имён (Sphere.002 -> Sphere002), поэтому ищем по нормализованному имени
export function findByName(root, name) {
  const target = norm(name);
  let found = null;
  root.traverse((o) => {
    if (!found && norm(o.name) === target) found = o;
  });
  if (!found) console.warn(`[scene] объект "${name}" не найден`);
  return found;
}

/**
 * Transmission-проход three.js захватывает только непрозрачный список объектов.
 * Внутренние полупрозрачные объекты (вода, шарики, пузырьки) помечаются как непрозрачные,
 * но смешиваются через CustomBlending, а в основном проходе не пишут цвет —
 * их видно только через преломление стекла.
 */
export function makeInterior(mesh, renderOrder) {
  const mat = mesh.material;
  mat.transparent = false;
  mat.blending = CustomBlending;
  mat.blendSrc = SrcAlphaFactor;
  mat.blendDst = OneMinusSrcAlphaFactor;
  mat.blendSrcAlpha = OneFactor;
  mat.blendDstAlpha = OneMinusSrcAlphaFactor;
  mat.depthWrite = false;
  mesh.renderOrder = renderOrder;
  mesh.castShadow = false;
  const colorWrite = mat.colorWrite;
  mesh.onBeforeRender = (renderer) => {
    mat.colorWrite = colorWrite && renderer.getRenderTarget() !== null;
  };
  return mesh;
}
