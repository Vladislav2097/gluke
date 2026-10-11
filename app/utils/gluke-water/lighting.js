import * as THREE from 'three';

export function createLighting(scene) {
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(3, 8, 5);
  // тени нет: на прозрачном фоне сайта её видно только в светлой теме, а карта теней
  // считалась бы каждый кадр
  scene.add(key, key.target);

  const rim = new THREE.PointLight('#8fc8ff', 30, 20);
  rim.position.set(-4, 3, -5);
  const fill = new THREE.PointLight('#bfe0ff', 12, 20);
  fill.position.set(4, -1, 6);
  scene.add(rim, fill);

  return { key, rim, fill };
}
