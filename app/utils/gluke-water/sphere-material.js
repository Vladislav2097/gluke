import * as THREE from 'three';
import { WAVE_GLSL } from './preview-water.js';

/**
 * Шарики как пузырьки/частицы в воде: почти прозрачная середина, плотная френелевская кромка
 * (фон за кромкой затемняется, как при преломлении у настоящего пузырька), мягкие отражения окружения.
 * Вывод premultiplied: блики не гасятся прозрачностью.
 * Вертикальное покачивание считается в вершинном шейдере по высоте GPU-воды в центре шарика.
 *
 * Две части с общими uniform'ами:
 *  - below — весь шарик, кроме надводной части (рисуется до воды и в проход преломления, где пишет глубину);
 *  - above — только надводная часть, рисуется после поверхности воды, иначе вода её перекрывает.
 * На ватерлинии части плавно перетекают друг в друга (uWaterlineSoft).
 */
export function createSphereMaterials(p, waterUniforms) {
  const uniforms = {
    ...waterUniforms,
    uCoreAlpha: { value: p.coreAlpha },
    uRimAlpha: { value: p.rimAlpha },
    uRimColor: { value: new THREE.Color(p.rimColor) },
    uWaterlineSoft: { value: p.waterlineSoft },
    uAboveOn: { value: p.aboveWater ? 1 : 0 },
    uUnderContrast: { value: p.underContrast },
  };
  const make = (above) => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: p.color,
      roughness: p.roughness,
      metalness: 0,
      envMapIntensity: p.envMapIntensity,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      iridescence: p.iridescence,
      iridescenceIOR: 1.3,
      specularIntensity: 1,
    });
    mat.userData.uniforms = uniforms;
    if (above) mat.defines = { BALL_ABOVE: '' };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', `${WAVE_GLSL}\nvarying vec3 vBallWorld;\nvoid main() {`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec3 ballCenter = (uWorldToLocal * modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float ballScale = length(modelMatrix[0].xyz);
          transformed.y += (waterHeight(ballCenter.xz) - uLevel) / ballScale;
          vBallWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${WAVE_GLSL}
          uniform float uCoreAlpha;
          uniform float uRimAlpha;
          uniform vec3 uRimColor;
          uniform float uWaterlineSoft;
          uniform float uAboveOn;
          uniform float uUnderContrast;
          uniform float uRefrPass;
          varying vec3 vBallWorld;
          void main() {`)
        .replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
          float ballFres = pow(1.0 - abs(dot(normal, geometryViewDir)), 2.2);
          gl_FragColor.rgb += uRimColor * ballFres * 0.35;
          gl_FragColor.a = mix(uCoreAlpha, uRimAlpha, ballFres);
          // доля фрагмента над поверхностью воды
          vec3 ballL = (uWorldToLocal * vec4(vBallWorld, 1.0)).xyz;
          float ballH = waterHeight(ballL.xz);
          float ballUp = smoothstep(ballH - uWaterlineSoft, ballH + uWaterlineSoft + 1e-4, ballL.y);
          #ifdef BALL_ABOVE
          float ballPart = ballUp * uAboveOn;
          #else
          float ballPart = 1.0 - ballUp * uAboveOn;
          // в проходе преломления (то, что видно сквозь воду) — отдельная настройка заметности
          if (uRefrPass > 0.5) gl_FragColor = min(gl_FragColor * uUnderContrast, vec4(4.0, 4.0, 4.0, 1.0));
          #endif
          if (ballPart < 0.002) discard;
          gl_FragColor *= ballPart;`,
        );
    };
    return mat;
  };
  return { below: make(false), above: make(true), uniforms };
}
