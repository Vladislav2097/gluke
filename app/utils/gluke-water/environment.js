import * as THREE from 'three';

// Софтбокс с мягким спадом к краям. Жёсткие прямоугольники давали во вогнутой внутренней стенке
// чёткие квадратные блики-«рамки» вокруг букв.
function softbox(w, h, intensity, color) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(intensity) } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying vec2 vUv;
        void main() {
          vec2 d = abs(vUv - 0.5) * 2.0;
          float f = (1.0 - smoothstep(0.2, 1.0, d.x)) * (1.0 - smoothstep(0.2, 1.0, d.y));
          gl_FragColor = vec4(uColor * f * f, 1.0);
        }`,
    }),
  );
}

// Студийное окружение: тёмно-синий купол + мягкие софтбоксы для бликов на стекле
export function createEnvironment(renderer) {
  const env = new THREE.Scene();

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(20, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color('#0e1d3d') },
        bottom: { value: new THREE.Color('#010308') },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 bottom; varying vec3 vDir;
        void main() { gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.4, 0.8, vDir.y)), 1.0); }`,
    }),
  );
  env.add(dome);

  const box = (w, h, intensity, pos, color = '#ffffff') => {
    const m = softbox(w, h, intensity, color);
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  box(10, 4, 7, [0, 12, 6]); // верхний ключевой
  box(4, 10, 3.5, [-11, 3, 5]); // левый вертикальный
  box(4, 10, 2.5, [11, 2, 4], '#cfe6ff'); // правый
  box(12, 3, 2, [0, 4, -12], '#9fd0ff'); // контровой
  box(8, 2.5, 1.2, [0, -8, 8], '#6fb6ff'); // снизу-спереди

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.04);
  pmrem.dispose();
  return rt.texture;
}
