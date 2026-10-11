import * as THREE from 'three';

export function createLighting(scene, cfg) {
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(3, 8, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 6;
  key.shadow.blurSamples = 16;
  key.shadow.bias = -0.0005;
  const cam = key.shadow.camera;
  cam.left = cam.bottom = -5;
  cam.right = cam.top = 5;
  cam.near = 1;
  cam.far = 25;
  scene.add(key, key.target);

  const rim = new THREE.PointLight('#8fc8ff', 30, 20);
  rim.position.set(-4, 3, -5);
  const fill = new THREE.PointLight('#bfe0ff', 12, 20);
  fill.position.set(4, -1, 6);
  scene.add(rim, fill);

  // Shadow catcher: на прозрачном фоне видна только тень
  const catcher = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.ShadowMaterial({ opacity: cfg.shadow.opacity }),
  );
  catcher.rotation.x = -Math.PI / 2;
  catcher.receiveShadow = true;
  scene.add(catcher);

  return { key, rim, fill, catcher };
}
