import * as THREE from 'three';

export function createLighting(scene) {
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(3, 8, 5);
  // тени нет: на прозрачном фоне сайта её видно только в светлой теме, а карта теней
  // считалась бы каждый кадр
  scene.add(key, key.target);

  // Одна лампа: контровая и заполняющая точечные лампы давали на стекле по своему набору бликов
  // (вместе с ключевой — 15 ярких пятен на кадр). Объём держат софтбоксы окружения.
  return { key };
}
