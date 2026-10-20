import assert from 'node:assert/strict';
import test from 'node:test';
import { createThirdPersonController } from '../src/third-person.js';

const difference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const close = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const initialPosition = { x: 0, z: 4.8 };
const cameraYaw = state => Math.atan2(state.lookAt.x - state.camera.x, state.lookAt.z - state.camera.z);

function advance(controller, direction, seconds = 1, fps = 60, position = initialPosition) {
  let state;
  for (let i = 0; i < seconds * fps; i++) state = controller.update({ dt: 1 / fps, position, direction, moving: !!direction });
  return state;
}

function walk(controller, direction, seconds, fps = 60, position = { ...initialPosition }) {
  let state;
  for (let frame = 0; frame < Math.round(seconds * fps); frame++) {
    position.x += direction.x * 2.25 / fps;
    position.z += direction.z * 2.25 / fps;
    state = controller.update({ dt: 1 / fps, position, direction, moving: true });
  }
  return state;
}

test('left and right make the avatar face its movement instead of strafing', () => {
  for (const sign of [-1, 1]) {
    const controller = createThirdPersonController();
    controller.beginInput();
    const direction = controller.getInputDirection(sign, 0);
    close(direction.x, sign);
    close(direction.z, 0);
    const first = controller.update({ dt: 1 / 60, position: initialPosition, direction, moving: true });
    assert.ok(Math.abs(difference(first.yaw, Math.PI)) > .1);
    assert.ok(Math.abs(difference(first.yaw, Math.atan2(direction.x, direction.z))) > .5, 'turning should ease instead of snapping');
    const settled = advance(controller, direction);
    close(difference(settled.yaw, Math.atan2(direction.x, direction.z)), 0, .001);
  }
});

test('sideways and reverse intentions start moving while the body turns smoothly', () => {
  for (const fps of [30, 60, 144]) for (const direction of [{ x: -1, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }]) {
    const controller = createThirdPersonController();
    const position = { ...initialPosition }, heading = Math.atan2(direction.x, direction.z);
    let previousScale = 0, previousError = Math.abs(difference(heading, controller.yaw));
    for (let frame = 0; frame < fps; frame++) {
      const before = { ...position }, beforeYaw = controller.yaw;
      const scale = controller.prepareWalk(direction, 1 / fps);
      position.x += direction.x * 2.25 * scale / fps;
      position.z += direction.z * 2.25 * scale / fps;
      const travelled = Math.hypot(position.x - before.x, position.z - before.z);
      const state = controller.update({ dt: 1 / fps, position, direction, moving: travelled > 0 });
      assert.ok(travelled > 0, 'the character must not pause to finish facing');
      assert.ok(scale >= previousScale, 'the initial launch builds speed without turn-related resets');
      assert.ok(Math.abs(difference(state.yaw, beforeYaw)) < Math.PI / 3, 'the body eases rather than snapping');
      const error = Math.abs(difference(heading, state.yaw));
      assert.ok(error <= previousError + 1e-10, 'facing converges throughout movement');
      if (frame === 0) {
        assert.ok(error > .5, 'walking already starts before the body has completed the turn');
        close(difference(cameraYaw(state), Math.PI), 0, 1e-8);
      }
      previousScale = scale; previousError = error;
    }
    assert.equal(previousScale, 1);
    assert.ok(previousError < .002);
  }
});

test('corners and reversals retain walking speed while the body changes direction', () => {
  const controller = createThirdPersonController();
  const position = { ...initialPosition };
  for (let frame = 0; frame < 30; frame++) {
    const direction = { x: 0, z: -1 }, scale = controller.prepareWalk(direction, 1 / 60);
    position.z -= 2.25 * scale / 60;
    controller.update({ dt: 1 / 60, position, direction, moving: true });
  }
  for (const direction of [{ x: -1, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }]) {
    const heading = Math.atan2(direction.x, direction.z);
    let previousError = Math.abs(difference(heading, controller.yaw));
    for (let frame = 0; frame < 45; frame++) {
      const before = { ...position }, beforeYaw = controller.yaw;
      const scale = controller.prepareWalk(direction, 1 / 60);
      assert.equal(scale, 1, 'a new direction must not restart the launch ramp');
      position.x += direction.x * 2.25 / 60;
      position.z += direction.z * 2.25 / 60;
      close(Math.hypot(position.x - before.x, position.z - before.z), 2.25 / 60);
      const state = controller.update({ dt: 1 / 60, position, direction, moving: true });
      assert.ok(Math.abs(difference(state.yaw, beforeYaw)) < .45, 'each visible turn stays smooth');
      const error = Math.abs(difference(heading, state.yaw));
      assert.ok(error <= previousError + 1e-10);
      previousError = error;
    }
    assert.ok(previousError < .01, 'the body completes each turn while walking');
  }
});

test('walking preparation handles wrapped headings and resets its launch when idle', () => {
  const controller = createThirdPersonController({ yaw: Math.PI - .01 });
  const direction = { x: -.01, z: -1 };
  for (let frame = 0; frame < 10; frame++) controller.prepareWalk(direction, 1 / 60);
  assert.equal(controller.prepareWalk(direction, 1 / 60), 1, 'heading across ±π is already aligned');
  assert.equal(controller.prepareWalk(null, 1 / 60), 0);
  close(controller.prepareWalk(direction, 1 / 60), (1 / 60) / .12);
  assert.equal(controller.prepareWalk({ x: NaN, z: Infinity }, 1 / 60), 0);
  for (const dt of [NaN, Infinity, -1]) assert.equal(controller.prepareWalk(direction, dt), 0);
  controller.prepareWalk(direction, .05);
  controller.reset();
  close(controller.prepareWalk(direction, 1 / 60), (1 / 60) / .12);
});

test('holding a movement gesture follows a straight path as its trailing camera turns', () => {
  const controller = createThirdPersonController();
  controller.beginInput();
  const position = { ...initialPosition };
  let first, state;
  for (let frame = 0; frame < 180; frame++) {
    // The world reasserts active input each frame, including after opposing
    // keys cancel or recenter resets the gesture. It must not relatch mid-walk.
    controller.beginInput();
    const direction = controller.getInputDirection(-1, 0);
    first ??= direction;
    close(direction.x, first.x);
    close(direction.z, first.z);
    position.x += direction.x * 2.25 / 60;
    position.z += direction.z * 2.25 / 60;
    state = controller.update({ dt: 1 / 60, position, direction, moving: true });
  }
  close(position.x, -6.75);
  close(position.z, initialPosition.z);
  controller.endInput();
  controller.beginInput();
  // A fresh gesture uses the current view, which can still trail the body.
  const forward = controller.getInputDirection(0, 1);
  close(forward.x, Math.sin(cameraYaw(state)));
  close(forward.z, Math.cos(cameraYaw(state)));
});

test('releasing keys does not change the camera or heading update rule', () => {
  const holding = createThirdPersonController();
  const released = createThirdPersonController();
  holding.beginInput();
  released.beginInput();
  const direction = { x: -1, z: 0 };
  advance(holding, direction, .1);
  const before = advance(released, direction, .1);
  released.endInput();
  const after = released.update({ dt: 1 / 60, position: initialPosition, moving: false });
  const stillHeld = holding.update({ dt: 1 / 60, position: initialPosition, moving: true, direction });
  assert.deepEqual(after, stillHeld);
  assert.ok(Math.hypot(after.camera.x - before.camera.x, after.camera.z - before.camera.z) < 1.5, 'release must not snap the camera');
  const settled = advance(released, null);
  close(difference(settled.yaw, -Math.PI / 2), 0, .001);
});

test('a reversal turns the body promptly while the camera starts gently and stays rate limited', () => {
  const controller = createThirdPersonController();
  const position = { ...initialPosition };
  let previousYaw = Math.PI, previousVelocity = 0;
  for (let frame = 0; frame < 240; frame++) {
    position.z += 2.25 / 60;
    const state = controller.update({ dt: 1 / 60, position, direction: { x: 0, z: 1 }, moving: true });
    const heading = cameraYaw(state);
    const velocity = difference(heading, previousYaw) * 60;
    assert.ok(Math.abs(velocity) <= 25 * Math.PI / 180 + 1e-8, 'automatic orbit must remain slow');
    assert.ok(Math.abs(velocity - previousVelocity) * 60 <= 90 * Math.PI / 180 + 1e-7, 'no forced rear-view snap');
    if (frame < 15) close(difference(heading, Math.PI), 0);
    if (frame === 29) {
      assert.ok(Math.abs(state.yaw) < .06, 'the body should already face its walk');
      assert.ok(Math.abs(difference(heading, Math.PI)) < 2 * Math.PI / 180, 'the view should barely turn in the first half second');
    }
    previousYaw = heading; previousVelocity = velocity;
  }
});

test('automatic turning during actual travel remains consistent at 30, 60, and 144 fps', () => {
  const states = [30, 60, 144].map(fps => walk(createThirdPersonController(), { x: -1, z: 0 }, 2, fps));
  for (const state of states.slice(1)) {
    close(state.yaw, states[0].yaw);
    close(difference(cameraYaw(state), cameraYaw(states[0])), 0, .0001);
  }
});

test('short taps and keys held against furniture do not rotate the view later', () => {
  const tap = createThirdPersonController();
  tap.beginInput();
  const position = { ...initialPosition };
  const beforeRelease = walk(tap, { x: -1, z: 0 }, .2, 60, position);
  close(difference(cameraYaw(beforeRelease), Math.PI), 0);
  tap.endInput();
  const afterRelease = advance(tap, null, 2, 60, position);
  close(difference(cameraYaw(afterRelease), Math.PI), 0);
  const blocked = createThirdPersonController();
  const blockedState = advance(blocked, { x: -1, z: 0 }, 3);
  close(difference(blockedState.yaw, -Math.PI / 2), 0, .001);
  close(difference(cameraYaw(blockedState), Math.PI), 0);
});

test('stopping brakes camera momentum instead of continuing to orbit toward the avatar', () => {
  const controller = createThirdPersonController();
  const position = { ...initialPosition };
  controller.beginInput();
  const walking = walk(controller, { x: -1, z: 0 }, 2, 60, position);
  controller.endInput();
  const stopped = advance(controller, null, 2, 60, position);
  const drift = Math.abs(difference(cameraYaw(stopped), cameraYaw(walking)));
  assert.ok(drift < 4 * Math.PI / 180, 'only a small smooth braking drift is allowed');
  const stillStopped = advance(controller, null, 2, 60, position);
  close(difference(cameraYaw(stillStopped), cameraYaw(stopped)), 0);
});

test('direction changes, large position jumps, and a fresh gesture never force a camera reorientation', () => {
  const controller = createThirdPersonController();
  const position = { ...initialPosition };
  controller.beginInput();
  let state = walk(controller, { x: -1, z: 0 }, 2, 60, position);
  for (const direction of [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }]) {
    for (let frame = 0; frame < 45; frame++) {
      const previousYaw = cameraYaw(state);
      state = walk(controller, direction, 1 / 60, 60, position);
      assert.ok(Math.abs(difference(cameraYaw(state), previousYaw)) <= 25 * Math.PI / 180 / 60 + 1e-8);
    }
  }
  const previousYaw = cameraYaw(state);
  controller.endInput(); controller.beginInput();
  position.x += 80; position.z -= 50;
  state = controller.update({ dt: 1 / 60, position, direction: { x: 0, z: 1 }, moving: true });
  assert.ok(Math.abs(difference(cameraYaw(state), previousYaw)) < .01, 'teleport must not apply the old rear-angle clamp');
  assert.ok(Object.values(state.camera).every(Number.isFinite));

  const renewed = createThirdPersonController(), stopping = createThirdPersonController();
  const renewedPosition = { ...initialPosition }, stoppingPosition = { ...initialPosition };
  renewed.beginInput(); stopping.beginInput();
  walk(renewed, { x: -1, z: 0 }, 2, 60, renewedPosition);
  walk(stopping, { x: -1, z: 0 }, 2, 60, stoppingPosition);
  renewed.endInput(); renewed.beginInput(); stopping.endInput();
  const newGesture = walk(renewed, { x: -1, z: 0 }, .2, 60, renewedPosition);
  const brakingOnly = advance(stopping, null, .2, 60, stoppingPosition);
  close(difference(cameraYaw(newGesture), cameraYaw(brakingOnly)), 0, .0001);
});

test('mouse turning changes the held input basis, and idle turns ease the avatar and camera', () => {
  const controller = createThirdPersonController();
  controller.beginInput();
  controller.turn(Math.PI / 2);
  const direction = controller.getInputDirection(0, 1);
  close(direction.x, -1);
  close(direction.z, 0);
  controller.endInput();
  const first = controller.update({ dt: 1 / 60, position: initialPosition });
  assert.ok(Math.abs(difference(first.yaw, Math.PI)) < .3);
  const settled = advance(controller, null);
  close(difference(settled.yaw, -Math.PI / 2), 0, .001);
});

test('zoom limits, seating reset, and invalid time values keep finite rear poses', () => {
  const controller = createThirdPersonController();
  controller.distance = 100;
  assert.equal(controller.distance, 24);
  controller.setDistance(-10);
  assert.equal(controller.distance, 8);
  const reset = controller.reset({ position: { x: 5, z: -10 }, yaw: 0 });
  close(reset.camera.x, 5);
  close(reset.camera.z, -18);
  for (const dt of [NaN, Infinity, -2, 100]) {
    const state = controller.update({ dt, position: { x: 5, z: -10 }, seated: true, yaw: 0 });
    assert.ok([state.yaw, ...Object.values(state.camera), ...Object.values(state.lookAt)].every(Number.isFinite));
  }
});
