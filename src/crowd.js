import * as THREE from 'three';
import { createMouse, disposeMouse, refreshLiveFace, retargetFace } from './mouse.js';

const LIVE = { x: 0.05, z: 1.55, ry: 0.02, s: 1.06 };
const SLOTS = [
  { x: -1.45, z: 0.15, ry: 0.38, s: 0.9 },
  { x: 1.55, z: 0.05, ry: -0.42, s: 0.88 },
  { x: -0.45, z: -0.95, ry: 0.12, s: 0.76 },
  { x: 0.85, z: -1.05, ry: -0.16, s: 0.74 },
  { x: -2.15, z: -0.7, ry: 0.5, s: 0.68 },
  { x: 2.25, z: -0.75, ry: -0.55, s: 0.66 },
];

const _camQ = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();
const _localQ = new THREE.Quaternion();

function smoothstep(t) {
  const k = THREE.MathUtils.clamp(t, 0, 1);
  return k * k * (3 - 2 * k);
}

function readPose(mesh) {
  return {
    x: mesh.position.x,
    z: mesh.position.z,
    ry: mesh.rotation.y,
    s: mesh.scale.x,
  };
}

function writePose(mesh, pose) {
  mesh.position.set(pose.x, 0, pose.z);
  mesh.rotation.y = pose.ry;
  mesh.scale.setScalar(pose.s);
}

function mixPose(from, to, t) {
  return {
    x: THREE.MathUtils.lerp(from.x, to.x, t),
    z: THREE.MathUtils.lerp(from.z, to.z, t),
    ry: THREE.MathUtils.lerp(from.ry, to.ry, t),
    s: THREE.MathUtils.lerp(from.s, to.s, t),
  };
}

function billboard(plane, camera) {
  if (!plane.parent) return;
  camera.getWorldQuaternion(_camQ);
  plane.parent.getWorldQuaternion(_parentQ);
  _localQ.copy(_parentQ).invert().multiply(_camQ);
  plane.quaternion.copy(_localQ);
}

export function createCrowd(scene) {
  const actors = [];
  let live = null;

  function removeActor(actor) {
    const index = actors.indexOf(actor);
    if (index >= 0) actors.splice(index, 1);
    if (live === actor) live = null;
    scene.remove(actor.mesh);
    disposeMouse(actor.mesh);
  }

  function frozenActors() {
    return actors.filter((actor) => actor.role === 'frozen');
  }

  function dismissOldest() {
    const frozen = frozenActors().sort((a, b) => a.born - b.born);
    const oldest = frozen[0];
    if (!oldest) return;
    const slot = SLOTS[oldest.slot] || readPose(oldest.mesh);
    const exit = {
      x: slot.x + Math.sign(slot.x || 1) * 2.8,
      z: slot.z - 1.4,
      ry: slot.ry,
      s: 0.08,
    };
    oldest.role = 'exiting';
    oldest.slot = null;
    oldest.anim = {
      from: readPose(oldest.mesh),
      to: exit,
      t: 0,
      dur: 1.25,
      then: () => removeActor(oldest),
    };
  }

  function takeSlot() {
    if (frozenActors().length >= SLOTS.length) dismissOldest();
    const used = new Set(actors.filter((actor) => actor.slot != null).map((actor) => actor.slot));
    for (let i = 0; i < SLOTS.length; i += 1) {
      if (!used.has(i)) return i;
    }
    return 0;
  }

  return {
    hasLive() {
      return Boolean(live);
    },
    spawnLive(canvases) {
      if (live) this.freeze();
      const mesh = createMouse(canvases);
      mesh.userData.live = true;
      const from = { ...LIVE, s: LIVE.s * 0.84 };
      writePose(mesh, from);
      scene.add(mesh);
      const actor = {
        mesh,
        role: 'live',
        slot: null,
        born: performance.now(),
        anim: { from, to: { ...LIVE }, t: 0, dur: 0.42 },
      };
      actors.push(actor);
      live = actor;
    },
    updateLive(face) {
      if (!live) return;
      live.mesh.userData.targetYaw = face.yaw;
      live.mesh.userData.targetPitch = face.pitch;
      live.mesh.userData.targetRoll = face.roll;
      if (face.patchesDirty) refreshLiveFace(live.mesh);
    },
    freeze() {
      if (!live) return;
      const actor = live;
      retargetFace(actor.mesh, actor.mesh.userData.liveCanvases, { copy: true });
      actor.mesh.userData.live = false;
      actor.role = 'frozen';
      actor.born = performance.now();
      live = null;
      const slot = takeSlot();
      actor.slot = slot;
      actor.anim = {
        from: readPose(actor.mesh),
        to: { ...SLOTS[slot] },
        t: 0,
        dur: 1.15,
      };
    },
    clear() {
      for (const actor of [...actors]) removeActor(actor);
      live = null;
    },
    update(dt, time, camera) {
      for (const actor of [...actors]) {
        if (actor.anim) {
          actor.anim.t += dt / actor.anim.dur;
          const pose = mixPose(actor.anim.from, actor.anim.to, smoothstep(actor.anim.t));
          writePose(actor.mesh, pose);
          if (actor.anim.t >= 1) {
            writePose(actor.mesh, actor.anim.to);
            const then = actor.anim.then;
            actor.anim = null;
            if (then) then();
          }
        }
        if (!actor.mesh.parent) continue;
        const phase = actor.mesh.userData.phase;
        const isLive = actor.mesh.userData.live;
        const bob = actor.mesh.userData.bob;
        // Head-only sway — body and feet stay planted.
        bob.position.y = Math.sin(time * (isLive ? 1.8 : 1.2) + phase) * (isLive ? 0.006 : 0.01);
        bob.rotation.z = Math.sin(time * 1.1 + phase) * (isLive ? 0.004 : 0.008);
        const head = actor.mesh.userData.head;
        if (isLive) {
          head.rotation.y = THREE.MathUtils.damp(head.rotation.y, actor.mesh.userData.targetYaw || 0, 5, dt);
          head.rotation.x = THREE.MathUtils.damp(head.rotation.x, actor.mesh.userData.targetPitch || 0, 5, dt);
          head.rotation.z = THREE.MathUtils.damp(head.rotation.z, actor.mesh.userData.targetRoll || 0, 5, dt);
        } else {
          head.rotation.y = Math.sin(time * 0.45 + phase) * 0.06;
          head.rotation.x = Math.sin(time * 0.32 + phase * 1.3) * 0.03;
          head.rotation.z = Math.sin(time * 0.28 + phase * 0.7) * 0.04;
        }
        const orderBias = Math.round(actor.mesh.position.z * 20);
        for (const plane of Object.values(actor.mesh.userData.planes)) {
          billboard(plane, camera);
          plane.renderOrder = plane.userData.order + orderBias;
          if (plane.userData.targetScale) {
            plane.scale.lerp(plane.userData.targetScale, 1 - Math.exp(-8 * dt));
          }
        }
      }
    },
  };
}
