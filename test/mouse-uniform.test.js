import assert from 'node:assert/strict';
import test from 'node:test';
import { Scene } from 'three';
import { createCrowd } from '../src/crowd.js';
import { applyMousePartTuning, createMouse, disposeMouse } from '../src/mouse.js';

globalThis.document = {
  createElementNS(namespace, type) {
    assert.equal(type, 'img');
    const listeners = {};
    return {
      addEventListener(event, callback) { listeners[event] = callback; },
      removeEventListener(event) { delete listeners[event]; },
      set src(value) {
        this.imageUrl = value;
        listeners.load.call(this);
      },
      get src() { return this.imageUrl; },
    };
  },
  createElement(type) {
    assert.equal(type, 'canvas');
    return {
      width: 0,
      height: 0,
      getContext() {
        return {
          createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
          putImageData() {},
        };
      },
    };
  },
};

const patch = { width: 64, height: 64 };
const patches = { leftEye: patch, rightEye: patch, nose: patch, mouth: patch };

function radiusAt(points, y) {
  const index = points.findIndex((point) => point.y >= y);
  if (index <= 0) return points[0].x;
  const lower = points[index - 1];
  const upper = points[index];
  return lower.x + (upper.x - lower.x) * (y - lower.y) / (upper.y - lower.y);
}

function ringCenter(geometry, ring) {
  const positions = geometry.getAttribute('position');
  const center = [0, 0, 0];
  for (let i = 0; i < 12; i += 1) {
    const index = ring * 13 + i;
    center[0] += positions.getX(index) / 12;
    center[1] += positions.getY(index) / 12;
    center[2] += positions.getZ(index) / 12;
  }
  return center;
}

test('uniform follows the torso and arm curves independently of chest tuning', () => {
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const mouse = createMouse(patches, { uniformColor: 0x66764f });
    const { body, chest } = mouse.userData.tuneParts;
    const torso = mouse.userData.torso;
    const shirt = torso.children.find((part) => part.material?.color?.getHex() === 0x66764f);
    const pants = torso.children.find((part) => part.material?.color?.getHex() === 0x25272a);
    assert.ok(shirt && pants);
    assert.ok(shirt.material.normalMap);
    assert.ok(pants.material.normalMap);
    assert.equal(chest.visible, false);
    assert.deepEqual(shirt.position.toArray(), body.position.toArray());
    assert.deepEqual(shirt.scale.toArray(), body.scale.toArray());
    assert.deepEqual(pants.position.toArray(), body.position.toArray());
    assert.deepEqual(pants.scale.toArray(), body.scale.toArray());

    const shirtPoints = shirt.geometry.parameters.points;
    const bodyPoints = body.geometry.parameters.points;
    const pantsPoints = pants.geometry.parameters.points;
    for (let step = 0; step <= 188; step += 1) {
      const y = 0.3 + step * 0.005;
      assert.ok(radiusAt(shirtPoints, y) > radiusAt(bodyPoints, y), `shirt exposes body at ${y}`);
      if (y <= 0.5) {
        assert.ok(radiusAt(shirtPoints, y) > radiusAt(pantsPoints, y), `pants protrude through shirt at ${y}`);
      }
    }

    for (const arm of mouse.userData.arms) {
      const [fur, sleeve, cuff] = arm.children;
      assert.deepEqual(sleeve.scale.toArray(), [1, 1, 1]);
      assert.equal(sleeve.geometry.drawRange.count, 11 * 12 * 6);
      assert.equal(cuff.geometry.drawRange.start, 10 * 12 * 6);
      for (let ring = 0; ring <= 11; ring += 1) {
        const furCenter = ringCenter(fur.geometry, ring);
        const sleeveCenter = ringCenter(sleeve.geometry, ring);
        assert.ok(furCenter.every((value, i) => Math.abs(value - sleeveCenter[i]) < 1e-6));
      }
    }

    const position = shirt.position.toArray();
    const rotation = shirt.rotation.toArray();
    applyMousePartTuning(mouse, {
      chestPositionX: 0.2, chestPositionY: -0.2, chestPositionZ: 0.2, chestTilt: 1,
    });
    assert.deepEqual(shirt.position.toArray(), position);
    assert.deepEqual(shirt.rotation.toArray(), rotation);
    disposeMouse(mouse);
  }
});

test('default mouse retains its visible belly and has no uniform', () => {
  const mouse = createMouse(patches);
  assert.equal(mouse.userData.tuneParts.chest.visible, true);
  assert.equal(mouse.userData.torso.children.some((part) => part.material?.color?.getHex() === 0x25272a), false);
  assert.equal(mouse.userData.arms[0].children.length, 2);
  disposeMouse(mouse);
});

test('school badge is textured and attached only to the left uniform sleeve', () => {
  const mouse = createMouse(patches, { uniformColor: 0x66764f });
  const [rightArm, leftArm] = mouse.userData.arms;
  assert.equal(rightArm.getObjectByName('school-badge'), undefined);
  const badge = leftArm.getObjectByName('school-badge');
  assert.ok(badge);
  assert.equal(badge.parent, leftArm);
  assert.ok(badge.geometry.getAttribute('position').count > 0);
  assert.match(badge.material.map.image.src, /school-badge\.png$/);
  disposeMouse(mouse);
  const plainMouse = createMouse(patches);
  assert.equal(plainMouse.getObjectByName('school-badge'), undefined);
  disposeMouse(plainMouse);
});

test('uniform crowd cycles through the five shirt colors', () => {
  const colors = [0x171719, 0xe9e9e3, 0x66764f, 0x651e30, 0x3e376d];
  const crowd = createCrowd(new Scene(), { uniformMode: true });
  for (let i = 0; i < 7; i += 1) {
    const actor = crowd.spawnLive(patches, { staticFace: true, replaceLocked: true });
    const shirts = actor.mesh.userData.torso.children.filter((part) => (
      part.geometry?.type === 'LatheGeometry' && part.material?.color?.getHex() === colors[i % colors.length]
    ));
    assert.equal(shirts.length, 1);
  }
  crowd.clear();
});
