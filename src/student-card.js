import * as THREE from 'three';
import { canvasesFromSnapshot } from './persist.js';
import { createMouse, DEFAULT_PART_TUNING, disposeMouse, setMouseUniform } from './mouse.js';

const CARD_WIDTH = 720;
const CARD_HEIGHT = 960;

function waitForBadge(mouse) {
  const texture = mouse.getObjectByName('school-badge')?.material?.map;
  const image = texture?.image;
  if (!texture || image?.complete) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    texture.addEventListener('load', done, { once: true });
    setTimeout(done, 500);
  });
}

/** Front-facing head-and-shoulders render of a saved mouse, like a student card photo. */
export async function renderStudentCard(snapshot, uniformColor) {
  const canvases = await canvasesFromSnapshot(snapshot);
  const mouse = createMouse(canvases, {
    traits: snapshot.traits,
    faceSettings: {
      featureScale: snapshot.featureScale,
      nostrilScale: snapshot.nostrilScale,
      eyePosition: snapshot.eyePosition,
    },
    partTuning: { ...DEFAULT_PART_TUNING, ...snapshot.partTuning },
    id: snapshot.id,
    staticFace: true,
    switchableUniformColor: uniformColor,
  });
  setMouseUniform(mouse, true);
  await waitForBadge(mouse);

  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(CARD_WIDTH, CARD_HEIGHT, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e4, 0x8d735c, 0.85));
  const key = new THREE.DirectionalLight(0xfff7ee, 1.15);
  key.position.set(-1.4, 3.2, 3.4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffd8c2, 0.35);
  fill.position.set(2.2, 1.6, 2);
  scene.add(fill);
  scene.add(mouse);

  const head = mouse.userData.head;
  head.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(head);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(27, CARD_WIDTH / CARD_HEIGHT, 0.05, 20);
  const fit = Math.max(size.x, size.y) * 0.72;
  const distance = fit / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(center.x, center.y - size.y * 0.02, center.z + distance * 1.22);
  camera.lookAt(center.x, center.y - size.y * 0.28, center.z);
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  disposeMouse(mouse);
  renderer.dispose();
  if (!blob) throw new Error('Could not encode the student card');
  return blob;
}
