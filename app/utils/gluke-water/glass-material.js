import * as THREE from 'three';

/**
 * Внешнее стекло (Sphere.002): transmission + premultiplied-вывод,
 * чтобы на прозрачном фоне страницы блики оставались яркими, а пустое стекло — прозрачным.
 *
 * Толщина для преломления/поглощения считается по длине пути луча в стенке:
 * wallThickness / |cos(угол к нормали)|. В центре стенка тонкая и почти не искажает,
 * у силуэта путь в стекле длинный — сильное преломление и более плотный цвет, как у толстого стекла.
 */
export function createOuterGlassMaterial(p) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: p.color,
    transmission: p.transmission,
    roughness: p.roughness,
    metalness: 0,
    ior: p.ior,
    thickness: p.thickness,
    dispersion: p.dispersion,
    attenuationColor: new THREE.Color(p.attenuationColor),
    attenuationDistance: p.attenuationDistance,
    clearcoat: p.clearcoat,
    clearcoatRoughness: p.clearcoatRoughness,
    envMapIntensity: p.envMapIntensity,
    specularIntensity: p.specularIntensity,
    side: THREE.FrontSide,
  });
  mat.blending = THREE.CustomBlending;
  mat.blendSrc = THREE.OneFactor;
  mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  mat.blendSrcAlpha = THREE.OneFactor;
  mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;

  const uniforms = {
    uRimAlpha: { value: p.rimAlpha },
    uMaxPath: { value: p.maxPathFactor },
    uEdgeColor: { value: new THREE.Color(p.edgeColor) },
    uEdgeStrength: { value: p.edgeStrength },
    uEdgePower: { value: p.edgePower },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `uniform float uRimAlpha;
        uniform float uMaxPath;
        uniform vec3 uEdgeColor;
        uniform float uEdgeStrength;
        uniform float uEdgePower;
        void main() {`)
      // Не срабатывает (и не срабатывала в исходной сцене): в onBeforeCompile фрагмент
      // <transmission_fragment> ещё не раскрыт, строки в коде нет — толщина стенки постоянная.
      .replace(
        'material.thickness = thickness;',
        `float wallCos = abs(dot(normalize(cameraPosition - vWorldPosition), transformNormalByInverseViewMatrix(normal, viewMatrix)));
        material.thickness = thickness * min(1.0 / max(wallCos, 1e-3), uMaxPath);`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float glassFresnel = pow(1.0 - abs(dot(normal, geometryViewDir)), 3.0);
        // свет, идущий внутри толстой стенки: край светится, а не просвечивает тёмным фоном
        float glassEdge = pow(1.0 - abs(dot(normal, geometryViewDir)), uEdgePower) * uEdgeStrength;
        gl_FragColor.rgb += uEdgeColor * glassEdge;
        gl_FragColor.a = clamp(max(gl_FragColor.a, glassFresnel * uRimAlpha + 0.04) + glassEdge * 0.5, 0.0, 1.0);`,
      );
  };
  return mat;
}

/**
 * Внутренняя поверхность стекла (Sphere.006), видимая сквозь внешнюю.
 * Слабые мягкие отражения + френелевская кромка: у силуэта внутренняя граница читается
 * как вторая линия, отстоящая от внешней на толщину стенки.
 */
export function createInnerGlassMaterial(p, side) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x000000,
    roughness: p.roughness,
    metalness: 0,
    opacity: p.opacity,
    envMapIntensity: p.envMapIntensity,
    clearcoat: 0,
    side,
  });
  const uniforms = {
    uRimColor: { value: new THREE.Color(p.rimColor) },
    uRimStrength: { value: p.rimStrength },
    uRimPower: { value: p.rimPower },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uRimPower;\nvoid main() {')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float innerRim = pow(1.0 - abs(dot(normal, geometryViewDir)), uRimPower) * uRimStrength;
        gl_FragColor.rgb += uRimColor * innerRim;
        gl_FragColor.a = clamp(gl_FragColor.a + innerRim * 0.6, 0.0, 1.0);`,
      );
  };
  return mat;
}
