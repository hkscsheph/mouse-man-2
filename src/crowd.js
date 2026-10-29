import * as THREE from 'three';
import { captureFaceCanvases } from './persist.js';
import { createMouse, disposeMouse, refitFacePlanes, refreshLiveFace, retargetFace } from './mouse.js';

const LIVE = { x: 0.05, z: 1.55, ry: 0.02, s: 1.06 };
const MAX_FROZEN = 30;

function buildSlots(count) {
  // Flank the live spot in clear arcs so frozen mice stay on-camera.
  const rows = [
    { z: 0.85, n: 6, space: 1.05, s: 0.92, ry: 0.4 },
    { z: 0.15, n: 8, space: 0.92, s: 0.82, ry: 0.34 },
    { z: -0.55, n: 8, space: 0.85, s: 0.72, ry: 0.28 },
    { z: -1.2, n: 8, space: 0.8, s: 0.64, ry: 0.22 },
  ];
  const slots = [];
  for (const row of rows) {
    const start = -((row.n - 1) * row.space) / 2;
    for (let i = 0; i < row.n && slots.length < count; i += 1) {
      const x = start + i * row.space;
      const edge = (i / Math.max(1, row.n - 1)) * 2 - 1;
      slots.push({
        x: x + edge * 0.08,
        z: row.z + Math.abs(edge) * 0.08,
        ry: -edge * row.ry,
        s: row.s,
      });
    }
  }
  while (slots.length < count) {
    const i = slots.length;
    slots.push({
      x: ((i % 10) - 4.5) * 0.75,
      z: -1.8 - Math.floor(i / 10) * 0.5,
      ry: 0,
      s: 0.58,
    });
  }
  return slots;
}

const SLOTS = buildSlots(MAX_FROZEN);

const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();

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

function pickActor(actors, mesh) {
  let node = mesh;
  while (node) {
    const hit = actors.find((actor) => actor.mesh === node);
    if (hit) return hit;
    node = node.parent;
  }
  return null;
}
function randomWalkTarget() {
  return {
    x: THREE.MathUtils.randFloat(-4, 4),
    z: THREE.MathUtils.randFloat(-1.8, 2.8),
  };
}

export function createCrowd(scene) {
  const actors = [];
  let live = null;
  let onFrontChange = null;
  const partTuning = {
    chestPositionX: 0,
    chestPositionY: 0,
    chestPositionZ: -0.1,
    chestTilt: (30 * Math.PI) / 180,
    earPosition: 0.1,
    earTilt: (-25 * Math.PI) / 180,
  };

  function applyPartTuning(mesh) {
    const { chest, body, ears } = mesh.userData.tuneParts;
    chest.position.set(
      chest.userData.tuneBaseX + partTuning.chestPositionX * body.scale.x,
      chest.userData.tuneBaseY + partTuning.chestPositionY * body.scale.y,
      chest.userData.tuneBaseZ + partTuning.chestPositionZ * body.scale.z,
    );
    chest.rotation.x = chest.userData.tuneBaseRotationX + partTuning.chestTilt;
    for (const ear of ears) {
      ear.position.z = ear.userData.tuneBaseZ + partTuning.earPosition;
      ear.rotation.x = ear.userData.tuneBaseRotationX + partTuning.earTilt;
    }
  }

  function createTunedMouse(canvases, options) {
    const mesh = createMouse(canvases, options);
    applyPartTuning(mesh);
    return mesh;
  }

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
    while (frozenActors().length >= MAX_FROZEN) dismissOldest();
    const used = new Set(actors.filter((actor) => actor.slot != null).map((actor) => actor.slot));
    for (let i = 0; i < SLOTS.length; i += 1) {
      if (!used.has(i)) return i;
    }
    return 0;
  }

  function notifyFront() {
    onFrontChange?.(live);
  }

  function goLive(actor, { animate = true } = {}) {
    if (live && live !== actor) freezeActor(live);
    if (actor.slot != null) actor.slot = null;
    actor.role = 'live';
    actor.mesh.userData.live = true;
    actor.born = performance.now();
    live = actor;
    if (animate) {
      actor.anim = {
        from: readPose(actor.mesh),
        to: { ...LIVE },
        t: 0,
        dur: 0.7,
      };
    } else {
      writePose(actor.mesh, LIVE);
      actor.anim = null;
    }
    notifyFront();
  }

  function freezeActor(actor) {
    if (!actor || actor.role !== 'live') return;
    // Prefer the face captured at save time so the crowd keeps that snapshot,
    // not whatever the webcam last painted onto the live canvases.
    if (!actor.frozenFace && actor.mesh.userData.liveCanvases) {
      try {
        actor.frozenFace = captureFaceCanvases(actor.mesh);
      } catch (error) {
        console.warn('freeze face capture failed', error);
      }
    }
    const face = actor.frozenFace || actor.mesh.userData.liveCanvases;
    try {
      if (face) retargetFace(actor.mesh, face, { copy: true });
    } catch (error) {
      console.warn('freeze face copy failed', error);
    }
    actor.mesh.userData.live = false;
    actor.mesh.userData.liveCanvases = null;
    actor.locked = false;
    actor.role = 'frozen';
    actor.born = performance.now();
    if (live === actor) live = null;
    const slot = takeSlot();
    actor.slot = slot;
    const pose = SLOTS[slot] || SLOTS[0];
    actor.anim = {
      from: readPose(actor.mesh),
      to: { x: pose.x, z: pose.z, ry: pose.ry, s: pose.s },
      t: 0,
      dur: 1.15,
    };
  }

  return {
    onFrontChange(cb) {
      onFrontChange = cb;
    },
    hasLive() {
      return Boolean(live);
    },
    getLive() {
      return live;
    },
    spawnLive(canvases, options = {}) {
      if (live?.locked && !options.replaceLocked) {
        return live;
      }
      if (live) freezeActor(live);
      const mesh = createTunedMouse(canvases, options);
      mesh.userData.live = true;
      if (options.staticFace || options.locked) {
        mesh.userData.liveCanvases = null;
      }
      const from = { ...LIVE, s: LIVE.s * 0.84 };
      writePose(mesh, from);
      scene.add(mesh);
      const actor = {
        mesh,
        role: 'live',
        slot: null,
        born: performance.now(),
        saved: Boolean(options.id),
        locked: Boolean(options.locked || options.staticFace),
        anim: { from, to: { ...LIVE }, t: 0, dur: 0.42 },
      };
      actors.push(actor);
      live = actor;
      notifyFront();
      return actor;
    },
    spawnWanderers(canvases, count) {
      for (let i = 0; i < count; i += 1) {
        const mesh = createTunedMouse(canvases);
        mesh.position.set(
          THREE.MathUtils.randFloat(-4, 4),
          0,
          THREE.MathUtils.randFloat(-1.8, 2.8),
        );
        mesh.rotation.y = Math.random() * Math.PI * 2 - Math.PI;
        mesh.scale.setScalar(0.45 + Math.random() * 0.3);
        scene.add(mesh);
        actors.push({
          mesh,
          role: 'wanderer',
          slot: null,
          born: performance.now(),
          saved: false,
          locked: false,
          anim: null,
          walk: { target: randomWalkTarget(), speed: 0.25 + Math.random() * 0.3 },
        });
      }
    },
    updateLive(face) {
      if (!live) return;
      live.mesh.userData.targetYaw = face.yaw;
      live.mesh.userData.targetPitch = face.pitch;
      live.mesh.userData.targetRoll = face.roll;
      if (face.patchesDirty && live.mesh.userData.liveCanvases) {
        refreshLiveFace(live.mesh);
      }
    },
    freeze() {
      if (!live) return;
      freezeActor(live);
      notifyFront();
    },
    promoteAt(clientX, clientY, camera, canvas) {
      const rect = canvas.getBoundingClientRect();
      _pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointer, camera);
      const meshes = [];
      for (const actor of actors) {
        if (actor.role !== 'frozen') continue;
        actor.mesh.traverse((obj) => {
          if (obj.isMesh) meshes.push(obj);
        });
      }
      const hits = _raycaster.intersectObjects(meshes, false);
      if (!hits.length) return null;
      const actor = pickActor(actors, hits[0].object);
      if (!actor || actor.role !== 'frozen') return null;
      goLive(actor);
      return actor;
    },
    hoverAt(clientX, clientY, camera, canvas) {
      const rect = canvas.getBoundingClientRect();
      _pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointer, camera);
      const meshes = [];
      for (const actor of actors) {
        if (actor.role !== 'frozen') continue;
        actor.mesh.traverse((obj) => {
          if (obj.isMesh) meshes.push(obj);
        });
      }
      return _raycaster.intersectObjects(meshes, false).length > 0;
    },
    clear() {
      for (const actor of [...actors]) removeActor(actor);
      live = null;
      notifyFront();
    },
    refitFaces() {
      for (const actor of actors) refitFacePlanes(actor.mesh, true);
    },
    setPartTuning(values) {
      Object.assign(partTuning, values);
      for (const actor of actors) applyPartTuning(actor.mesh);
    },
    update(dt, time) {
      for (const actor of [...actors]) {
        if (actor.walk) {
          const dx = actor.walk.target.x - actor.mesh.position.x;
          const dz = actor.walk.target.z - actor.mesh.position.z;
          const distance = Math.hypot(dx, dz);
          if (distance < 0.12) {
            actor.walk.target = randomWalkTarget();
          } else {
            const heading = Math.atan2(dx, dz);
            const turn = Math.atan2(
              Math.sin(heading - actor.mesh.rotation.y),
              Math.cos(heading - actor.mesh.rotation.y),
            );
            actor.mesh.rotation.y += turn * (1 - Math.exp(-5 * dt));
            const step = Math.min(distance, actor.walk.speed * dt);
            actor.mesh.position.x += (dx / distance) * step;
            actor.mesh.position.z += (dz / distance) * step;
          }
        }
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
        const torso = actor.mesh.userData.torso;
        const head = actor.mesh.userData.head;
        bob.position.y = Math.sin(time * (isLive ? 1.8 : 1.2) + phase) * (isLive ? 0.006 : 0.01);
        bob.rotation.z = Math.sin(time * 1.1 + phase) * (isLive ? 0.004 : 0.008);
        if (actor.walk) {
          const gait = Math.sin(time * 9 + phase);
          actor.mesh.userData.legs[0].rotation.x = 0.02 + gait * 0.48;
          actor.mesh.userData.legs[1].rotation.x = 0.02 - gait * 0.48;
          actor.mesh.userData.arms[0].rotation.x = 0.2 - gait * 0.18;
          actor.mesh.userData.arms[1].rotation.x = 0.2 + gait * 0.18;
        }
        if (isLive) {
          const yaw = actor.mesh.userData.targetYaw || 0;
          const pitch = actor.mesh.userData.targetPitch || 0;
          const roll = actor.mesh.userData.targetRoll || 0;
          torso.rotation.y = THREE.MathUtils.damp(torso.rotation.y, yaw * 0.32, 4, dt);
          torso.rotation.z = THREE.MathUtils.damp(torso.rotation.z, roll * 0.18, 4, dt);
          head.rotation.y = THREE.MathUtils.damp(head.rotation.y, yaw * 0.68, 5, dt);
          head.rotation.x = THREE.MathUtils.damp(head.rotation.x, pitch, 5, dt);
          head.rotation.z = THREE.MathUtils.damp(head.rotation.z, roll, 5, dt);
        } else {
          torso.rotation.y = THREE.MathUtils.damp(torso.rotation.y, Math.sin(time * 0.35 + phase) * 0.04, 2, dt);
          torso.rotation.z = THREE.MathUtils.damp(torso.rotation.z, Math.sin(time * 0.22 + phase) * 0.02, 2, dt);
          head.rotation.y = Math.sin(time * 0.45 + phase) * 0.06;
          head.rotation.x = Math.sin(time * 0.32 + phase * 1.3) * 0.03;
          head.rotation.z = Math.sin(time * 0.28 + phase * 0.7) * 0.04;
        }

        const orderBias = Math.round(actor.mesh.position.z * 20);
        for (const plane of Object.values(actor.mesh.userData.planes)) {
          plane.renderOrder = plane.userData.order + orderBias;
          if (plane.userData.targetScale) {
            plane.scale.lerp(plane.userData.targetScale, 1 - Math.exp(-8 * dt));
          }
        }
      }
    },
  };
}
