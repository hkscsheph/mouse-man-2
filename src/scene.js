import * as THREE from 'three';

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      topColor: { value: new THREE.Color('#f6c14a') },
      midColor: { value: new THREE.Color('#f08a3a') },
      horizonColor: { value: new THREE.Color('#f3c4a4') },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 horizonColor;
      void main() {
        // Softer vertical falloff so sky bands cover more of the view.
        float h = clamp(vDir.y * 0.72 + 0.22, 0.0, 1.0);
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.55, h));
        col = mix(col, topColor, smoothstep(0.28, 1.0, h));
        vec3 sunDir = normalize(vec3(-0.45, 0.42, -0.2));
        float sun = pow(max(dot(normalize(vDir), sunDir), 0.0), 22.0);
        col += vec3(1.0, 0.78, 0.4) * sun * 0.55;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

function groundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grd = ctx.createRadialGradient(256, 270, 30, 256, 250, 360);
  grd.addColorStop(0, '#d48458');
  grd.addColorStop(0.45, '#c4623c');
  grd.addColorStop(1, '#a34b30');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addHills(scene) {
  const geo = new THREE.SphereGeometry(1, 28, 18);
  const hills = [
    { x: -7.2, z: -10.5, sx: 5.4, sy: 2.6, sz: 3.1, color: 0x6d9148 },
    { x: -1.6, z: -12.2, sx: 6.8, sy: 3.2, sz: 3.4, color: 0x5d843c },
    { x: 3.4, z: -11.4, sx: 5.2, sy: 2.5, sz: 2.8, color: 0x7aa350 },
    { x: 8.6, z: -12.6, sx: 7.2, sy: 3.4, sz: 3.6, color: 0x4e7838 },
    { x: -4.2, z: -14.5, sx: 8.4, sy: 3.8, sz: 4.2, color: 0x547a3a },
    { x: 5.8, z: -15.2, sx: 7.6, sy: 3.5, sz: 3.8, color: 0x628c44 },
  ];
  for (const hill of hills) {
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: hill.color, roughness: 1, metalness: 0 }),
    );
    mesh.scale.set(hill.sx, hill.sy, hill.sz);
    mesh.position.set(hill.x, -0.15, hill.z);
    scene.add(mesh);
  }
}

function addTree(scene) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.16, 1.35, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.92 }),
  );
  trunk.position.set(5.15, 0.68, -3.6);
  scene.add(trunk);

  const clump = new THREE.SphereGeometry(1, 20, 16);
  const leafA = new THREE.MeshStandardMaterial({ color: 0x3d8a46, roughness: 0.88 });
  const leafB = new THREE.MeshStandardMaterial({ color: 0x2f7340, roughness: 0.9 });
  const puffs = [
    [0, 1.55, 0, 0.58, leafA],
    [-0.38, 1.72, 0.12, 0.4, leafB],
    [0.4, 1.78, -0.06, 0.38, leafA],
    [0.02, 2.12, 0.04, 0.46, leafB],
    [-0.12, 1.32, 0.22, 0.3, leafA],
    [0.22, 1.38, -0.18, 0.28, leafB],
  ];
  for (const [x, y, z, s, mat] of puffs) {
    const mesh = new THREE.Mesh(clump, mat);
    mesh.scale.setScalar(s);
    mesh.position.set(5.15 + x, y, -3.6 + z);
    scene.add(mesh);
  }
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf0c2a4, 14, 42);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  const look = new THREE.Vector3(0.05, 1.02, 0.25);
  let cameraYaw = 0;
  let cameraPitch = 0;

  const sky = new THREE.Mesh(new THREE.SphereGeometry(48, 32, 20), skyMaterial());
  sky.scale.set(1, 1.55, 1);
  sky.frustumCulled = false;
  scene.add(sky);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(32, 64),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.96, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  addHills(scene);
  addTree(scene);

  scene.add(new THREE.HemisphereLight(0xffc27a, 0x8a4030, 0.62));

  const key = new THREE.DirectionalLight(0xfff1d2, 1.45);
  key.position.set(-4.5, 8.5, 6);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xffb088, 0.38);
  fill.position.set(6, 3.2, 3);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffe2b8, 0.28);
  rim.position.set(0.5, 4, -6);
  scene.add(rim);

  function applyCameraOrbit(aspect) {
    const offset = new THREE.Vector3(0.15 - look.x, 1.48 - look.y, (aspect < 1 ? 10.4 : 7.7) - look.z);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += cameraYaw;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + cameraPitch, 0.25, Math.PI - 0.25);
    camera.position.copy(look).add(offset.setFromSpherical(spherical));
  }

  function rotateCamera(deltaX, deltaY) {
    cameraYaw += deltaX * 0.006;
    cameraPitch = THREE.MathUtils.clamp(cameraPitch + deltaY * 0.006, -0.8, 0.8);
    applyCameraOrbit(camera.aspect);
    camera.lookAt(look);
  }

  function frame() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.aspect = aspect;
    applyCameraOrbit(aspect);
    camera.lookAt(look);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  frame();
  window.addEventListener('resize', frame);

  return { scene, camera, renderer, rotateCamera };
}
