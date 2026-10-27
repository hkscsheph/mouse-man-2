import * as THREE from 'three';


export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf0c2a4, 14, 42);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  const look = new THREE.Vector3(0.05, 1.02, 0.25);
  let cameraYaw = 0;
  let cameraPitch = 0;


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
