const TAU = Math.PI * 2;
const TURN_RATE = 8;
const POSITION_RATE = 12;
const AUTO_TURN_SPEED = 25 * Math.PI / 180;
const AUTO_TURN_ACCELERATION = 35 * Math.PI / 180;
const AUTO_BRAKE_ACCELERATION = 90 * Math.PI / 180;
const AUTO_TURN_DELAY = .25;
const AUTO_TURN_DISTANCE = .18;
const WALK_START_SECONDS = .12;

const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const angleDifference = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const point = (value, fallback) => ({ x: finite(value?.x, fallback.x), z: finite(value?.z, fallback.z) });

/**
 * Camera-relative walking with a gesture-stable input basis. The character
 * turns towards a walking intention while travelling, while the trailing
 * camera settles continuously.
 * No DOM or Three.js state is required, so steering can be checked directly.
 */
export function createThirdPersonController({ yaw = Math.PI, position = { x: 0, z: 4.8 }, distance = 14 } = {}) {
  let facing = finite(yaw, Math.PI);
  let desiredFacing = facing;
  let cameraFacing = facing;
  let focus = point(position, { x: 0, z: 4.8 });
  let currentPosition = { ...focus };
  let inputFacing = facing;
  let inputActive = false;
  let cameraVelocity = 0;
  let travelTime = 0, travelDistance = 0, travelHeading = facing;
  let manualTarget = null, manualGrace = 0;
  let desiredDistance = clamp(finite(distance, 14), 8, 24);
  let cameraDistance = desiredDistance;
  let walkScale = 0;

  function pose() {
    const camera = {
      x: focus.x - Math.sin(cameraFacing) * cameraDistance,
      y: 8 * cameraDistance / 14,
      z: focus.z - Math.cos(cameraFacing) * cameraDistance,
    };
    return {
      yaw: facing,
      camera,
      lookAt: {
        x: focus.x + Math.sin(cameraFacing) * 2.8,
        y: 1.1,
        z: focus.z + Math.cos(cameraFacing) * 2.8,
      },
    };
  }

  // Position tracking and camera yaw are independent. In particular, the avatar
  // is allowed to turn away from the view while the camera catches up slowly.
  function advanceCamera(target, duration, manual = false) {
    if (duration <= 0) return;
    const steps = Math.ceil(duration * 240);
    const step = duration / steps;
    for (let index = 0; index < steps; index++) {
      const error = target === null ? 0 : angleDifference(target, cameraFacing);
      const maxSpeed = manual ? 2.5 : AUTO_TURN_SPEED;
      const desiredVelocity = target === null ? 0 : clamp(error * (manual ? 6 : .9), -maxSpeed, maxSpeed);
      const braking = desiredVelocity === 0 || desiredVelocity * cameraVelocity < 0 || Math.abs(desiredVelocity) < Math.abs(cameraVelocity);
      const acceleration = manual ? 10 : braking ? AUTO_BRAKE_ACCELERATION : AUTO_TURN_ACCELERATION;
      const previousVelocity = cameraVelocity;
      cameraVelocity += clamp(desiredVelocity - cameraVelocity, -acceleration * step, acceleration * step);
      cameraFacing += (previousVelocity + cameraVelocity) * .5 * step;
    }
  }

  const controller = {
    beginInput() {
      if (!inputActive) { inputFacing = cameraFacing; travelTime = travelDistance = 0; }
      inputActive = true;
    },
    endInput() {
      inputActive = false;
    },
    turn(delta) {
      if (!Number.isFinite(delta)) return;
      if (manualTarget === null) { manualTarget = cameraFacing; cameraVelocity = 0; }
      manualTarget += delta;
      manualGrace = .35;
      travelTime = travelDistance = 0;
      desiredFacing += delta;
      if (inputActive) inputFacing += delta;
    },
    getInputDirection(x, z) {
      const right = finite(x, 0), forward = finite(z, 0);
      const magnitude = Math.hypot(right, forward);
      if (!magnitude) return { x: 0, z: 0 };
      const heading = inputActive ? inputFacing : cameraFacing;
      return {
        x: (Math.sin(heading) * forward - Math.cos(heading) * right) / magnitude,
        z: (Math.cos(heading) * forward + Math.sin(heading) * right) / magnitude,
      };
    },
    // Call once before advancing the root, then update once after it. Only a
    // fresh start ramps up: changing direction keeps the walk continuous while
    // the body turns, rather than planting and restarting at every corner.
    prepareWalk(direction, dt = 0) {
      const x = finite(direction?.x, 0), z = finite(direction?.z, 0);
      if (Math.hypot(x, z) <= 1e-6) { walkScale = 0; return 0; }
      const heading = Math.atan2(x, z);
      desiredFacing = heading;
      walkScale = Math.min(1, walkScale + clamp(finite(dt, 0), 0, .05) / WALK_START_SECONDS);
      return walkScale;
    },
    update({ dt = 0, position: nextPosition, direction = null, moving = false, seated = false, yaw: explicitYaw } = {}) {
      const elapsed = clamp(finite(dt, 0), 0, .05);
      const previousPosition = currentPosition;
      currentPosition = point(nextPosition, currentPosition);
      if (Number.isFinite(explicitYaw)) desiredFacing = explicitYaw;
      else if (!seated && direction && Math.hypot(finite(direction.x, 0), finite(direction.z, 0)) > 1e-6) {
        desiredFacing = Math.atan2(direction.x, direction.z);
      }

      // The character responds promptly; it no longer drags the view around.
      const desired = facing + angleDifference(desiredFacing, facing);
      const bodyDecay = Math.exp(-TURN_RATE * elapsed);
      facing = desired + (facing - desired) * bodyDecay;

      const travelled = Math.hypot(currentPosition.x - previousPosition.x, currentPosition.z - previousPosition.z);
      const travelling = !seated && moving && travelled > 1e-7 && travelled <= .8 && elapsed > 0;
      let automaticDuration = 0;
      if (travelling) {
        if (Math.abs(angleDifference(desiredFacing, travelHeading)) > .3) {
          travelTime = travelDistance = 0;
          travelHeading = desiredFacing;
        }
        const waitForTime = Math.max(0, AUTO_TURN_DELAY - travelTime);
        const waitForDistance = Math.max(0, AUTO_TURN_DISTANCE - travelDistance) / travelled * elapsed;
        automaticDuration = Math.max(0, elapsed - Math.max(waitForTime, waitForDistance));
        travelTime += elapsed;
        travelDistance += travelled;
      } else {
        travelTime = travelDistance = 0;
        travelHeading = desiredFacing;
      }
      manualGrace = Math.max(0, manualGrace - elapsed);
      if (manualTarget !== null && manualGrace === 0 && automaticDuration > 0
        && Math.abs(cameraVelocity) < AUTO_TURN_SPEED && Math.abs(angleDifference(manualTarget, cameraFacing)) < .03) manualTarget = null;
      if (manualTarget !== null) advanceCamera(manualTarget, elapsed, true);
      else {
        advanceCamera(null, elapsed - automaticDuration);
        advanceCamera(automaticDuration > 0 ? desiredFacing : null, automaticDuration);
      }

      const positionBlend = 1 - Math.exp(-POSITION_RATE * elapsed);
      focus.x += (currentPosition.x - focus.x) * positionBlend;
      focus.z += (currentPosition.z - focus.z) * positionBlend;
      // Keep tracking lag modest while walking and after large position jumps.
      const lag = Math.hypot(focus.x - currentPosition.x, focus.z - currentPosition.z);
      if (lag > .6) {
        focus.x = currentPosition.x + (focus.x - currentPosition.x) * .6 / lag;
        focus.z = currentPosition.z + (focus.z - currentPosition.z) * .6 / lag;
      }
      cameraDistance += (desiredDistance - cameraDistance) * positionBlend;
      // Bounded angles keep long sessions numerically stable without changing
      // direction or the gesture's independently captured input basis.
      if (Math.abs(facing) > TAU * 100) {
        const offset = Math.trunc(facing / TAU) * TAU;
        facing -= offset;
        desiredFacing -= offset;
        cameraFacing -= offset;
        inputFacing -= offset;
        travelHeading -= offset;
        if (manualTarget !== null) manualTarget -= offset;
      }
      return pose();
    },
    reset({ position: nextPosition = currentPosition, yaw: nextYaw = facing } = {}) {
      currentPosition = point(nextPosition, currentPosition);
      focus = { ...currentPosition };
      facing = finite(nextYaw, facing);
      desiredFacing = cameraFacing = inputFacing = facing;
      inputActive = false;
      cameraVelocity = travelTime = travelDistance = 0;
      travelHeading = facing;
      manualTarget = null; manualGrace = 0;
      cameraDistance = desiredDistance;
      walkScale = 0;
      return pose();
    },
    setDistance(value) {
      desiredDistance = clamp(finite(value, desiredDistance), 8, 24);
      return desiredDistance;
    },
    get distance() { return desiredDistance; },
    set distance(value) { controller.setDistance(value); },
    get yaw() { return facing; },
  };
  return controller;
}
