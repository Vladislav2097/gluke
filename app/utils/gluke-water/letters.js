import * as THREE from 'three';
import { makeInterior } from './scene-utils.js';
import { REFRACTION_LAYER } from './preview-water.js';

function createLetterMaterial(p) {
  return new THREE.MeshPhysicalMaterial({
    color: p.color,
    emissive: p.emissive,
    emissiveIntensity: p.emissiveIntensity,
    roughness: p.roughness,
    metalness: p.metalness,
    clearcoat: p.clearcoat,
    clearcoatRoughness: 0.35,
  });
}

/**
 * Буквы: смоделированы в GLB (Letter_H1, Letter_O, Letter_H2 — H·O·H), здесь им назначается
 * материал и центр вращения. Препятствием для воды служат сами буквы: их сечение на уровне
 * воды поворачивается вместе с ними (WaterSurfaceSim.syncObstacles). Заменить буквы — значит
 * заменить их меши в модели (имена — config.names.letters); режим «высокая вода» отсчитывает
 * уровень от низа одной из них (config.water.high.levelMesh).
 */
export class Letters {
  // Буквы уже смоделированы в GLB (Молекула.blend): только назначаем материал
  static fromMeshes({ meshes, cfg }) {
    const material = createLetterMaterial(cfg);
    const found = meshes.filter(Boolean);
    for (const mesh of found) {
      mesh.material = material;
      // внутри стекла: видны через его преломление и подкрашиваются водой, а не рисуются поверх
      makeInterior(mesh, 1.5);
      mesh.layers.enable(REFRACTION_LAYER); // видны сквозь воду с преломлением
      mesh.castShadow = true;
      centerPivot(mesh);
    }
    material.depthWrite = true;
    return new Letters(found, material, cfg);
  }

  constructor(meshes, material, cfg) {
    this.meshes = meshes;
    this.obstacles = meshes; // препятствия для воды — сами буквы, с их текущим поворотом
    this.material = material;
    this.cfg = cfg;
    this.rest = meshes.map((m) => m.quaternion.clone());
  }

  // Поворот букв лицом к камере: вокруг вертикали (+ наклон по высоте, faceTilt 0..1).
  // В покое буква смотрит вдоль +Z родителя — туда, где камера при нулевом повороте молекулы.
  faceCamera(camera) {
    const { faceCamera, faceTilt } = this.cfg;
    this.meshes.forEach((mesh, i) => {
      if (!faceCamera) {
        mesh.quaternion.copy(this.rest[i]);
        return;
      }
      mesh.parent.worldToLocal(_cam.copy(camera.position)).sub(mesh.position);
      const yaw = Math.atan2(_cam.x, _cam.z);
      const pitch = -Math.atan2(_cam.y, Math.hypot(_cam.x, _cam.z)) * faceTilt;
      _euler.set(pitch, yaw, 0, 'YXZ');
      mesh.quaternion.setFromEuler(_euler).multiply(this.rest[i]);
    });
  }

  set visible(v) {
    for (const m of this.meshes) m.visible = v;
  }
}

// Переносит центр вращения буквы в центр её габарита (по X/Z), чтобы она вращалась на месте
function centerPivot(mesh) {
  const geo = mesh.geometry;
  geo.computeBoundingBox();
  const c = geo.boundingBox.getCenter(new THREE.Vector3());
  c.y = 0;
  geo.translate(-c.x, 0, -c.z);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  mesh.position.add(c.multiply(mesh.scale).applyQuaternion(mesh.quaternion));
}

const _cam = new THREE.Vector3();
const _euler = new THREE.Euler();
