import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeatExit, SEAT_RISE_MS, SEAT_STEP_MS, SEAT_FORWARD_REACH } from '../src/seat-exit.js';

const from = { x: 2, z: -4 };
const to = { x: 2, z: -3 };
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} versus ${expected}`);

test('leaving a seat visibly rises in place before stepping clear and permitting walking', () => {
  const exit = createSeatExit({ from, to });
  assert.equal(exit.active, true);
  assert.deepEqual(exit.state, {
    ...from, standProgress: 0, phase: 'rising', complete: false, mayWalk: false, elapsedMs: 0,
  });
  let previousProgress = 0;
  for (let elapsed = 50; elapsed < SEAT_RISE_MS; elapsed += 50) {
    const state = exit.update(50);
    assert.deepEqual({ x: state.x, z: state.z }, from);
    assert.ok(state.standProgress > previousProgress && state.standProgress < 1);
    assert.equal(state.phase, 'rising');
    assert.equal(state.mayWalk, false);
    previousProgress = state.standProgress;
  }
  const upright = exit.update(50);
  assert.equal(upright.phase, 'stepping');
  assert.equal(upright.standProgress, 1);
  assert.deepEqual({ x: upright.x, z: upright.z }, from);
  assert.equal(upright.mayWalk, false);
  const halfway = exit.update(SEAT_STEP_MS / 2);
  close(halfway.z, (from.z + to.z) / 2, 'halfway through the step');
  assert.equal(halfway.mayWalk, false);
  const almostDone = exit.update(SEAT_STEP_MS / 2 - 1);
  assert.equal(almostDone.complete, false);
  const finished = exit.update(1);
  assert.deepEqual({ x: finished.x, z: finished.z }, to);
  assert.equal(finished.phase, 'complete');
  assert.equal(finished.mayWalk, true);
  assert.equal(exit.active, false);
  assert.deepEqual(exit.update(10_000), finished, 'a completed exit cannot restart on repeated input');
});

test('previewing a collision does not move the avatar and a blocked step retains its seat', () => {
  const exit = createSeatExit({ from, to });
  const proposal = exit.peek(10_000);
  assert.equal(proposal.complete, true);
  assert.equal(exit.state.elapsedMs, 0, 'collision probes must not commit time');
  const blockedAfterRise = exit.update(10_000, { blocked: true });
  assert.deepEqual({ x: blockedAfterRise.x, z: blockedAfterRise.z }, from);
  assert.equal(blockedAfterRise.standProgress, 1, 'an occupied exit should still allow the occupant to get upright');
  assert.equal(blockedAfterRise.phase, 'stepping');
  assert.equal(blockedAfterRise.complete, false);
  assert.equal(exit.active, true);
  exit.update(100);
  const waiting = exit.state;
  for (let frame = 0; frame < 100; frame++) assert.deepEqual(exit.update(16, { blocked: true }), waiting);
  assert.equal(waiting.mayWalk, false, 'blocked departures cannot release the chair or resume keyboard movement');
  const clear = exit.update(SEAT_STEP_MS - 100);
  assert.equal(clear.complete, true);
  assert.deepEqual({ x: clear.x, z: clear.z }, to);
});

test('a collision pause during the rise preserves the rise duration and does not consume the step', () => {
  const exit = createSeatExit({ from, to });
  for (let frame = 0; frame < 6; frame++) exit.update(100, { blocked: true });
  close(exit.state.standProgress, .8, 'rise progress while the route is occupied');
  assert.equal(exit.state.elapsedMs, 600);
  exit.update(200, { blocked: true });
  assert.equal(exit.state.elapsedMs, SEAT_RISE_MS);
  assert.equal(exit.state.complete, false);
  exit.update(SEAT_STEP_MS - 1);
  assert.equal(exit.state.mayWalk, false);
  exit.update(1);
  assert.equal(exit.state.mayWalk, true);
});

test('the same elapsed time yields the same exit pose at 30, 60, and 144 frames per second', () => {
  for (const fps of [30, 60, 144]) {
    const exit = createSeatExit({ from, to });
    for (let frame = 0; frame < fps; frame++) exit.update(1000 / fps);
    close(exit.state.elapsedMs, 1000, `${fps} fps elapsed time`);
    assert.equal(exit.state.complete, false);
    close(exit.state.z, from.z + 25 / 27, `${fps} fps step position`);
    exit.update(51);
    assert.equal(exit.state.complete, true);
    assert.deepEqual({ x: exit.state.x, z: exit.state.z }, to);
  }
});

test('invalid frame intervals cannot rewind, jump, or introduce a non-finite pose', () => {
  const exit = createSeatExit({ from, to });
  const partial = exit.update(200);
  for (const delta of [-100, NaN, Infinity, -Infinity, undefined, '100']) {
    assert.deepEqual(exit.update(delta), partial);
    assert.deepEqual(exit.peek(delta), partial);
  }
  const state = exit.state;
  state.x = NaN;
  state.elapsedMs = 10_000;
  assert.deepEqual(exit.state, partial, 'callers cannot mutate a snapshot to complete an active exit');
  assert.equal(exit.active, true);
});

test('coordinates and timing are copied and validated before a departure starts', () => {
  const start = { ...from }, end = { ...to };
  const exit = createSeatExit({ from: start, to: end, riseMs: 500, stepMs: 200 });
  start.x = 100;
  end.z = 100;
  assert.deepEqual({ x: exit.state.x, z: exit.state.z }, from);
  assert.equal(exit.update(500).mayWalk, false);
  assert.deepEqual({ x: exit.update(200).x, z: exit.state.z }, to);
  for (const invalid of [-1, Infinity, NaN, '750']) {
    assert.throws(() => createSeatExit({ from, to, riseMs: invalid }), RangeError);
    assert.throws(() => createSeatExit({ from, to, stepMs: invalid }), RangeError);
  }
  assert.throws(() => createSeatExit({ from, to, stepMs: 0 }), RangeError);
  for (const invalid of [null, {}, { x: 0, z: NaN }, { x: Infinity, z: 0 }]) {
    assert.throws(() => createSeatExit({ from: invalid, to }), TypeError);
    assert.throws(() => createSeatExit({ from, to: invalid }), TypeError);
  }
});

test('a visitor still approaching a won chair skips the rise but steps clear before releasing', () => {
  const exit = createSeatExit({ from, to, riseMs: 0 });
  assert.equal(exit.state.standProgress, 1);
  assert.equal(exit.state.phase, 'stepping');
  assert.equal(exit.state.complete, false);
  exit.update(299);
  assert.equal(exit.state.mayWalk, false);
  assert.equal(exit.update(1).mayWalk, true);
});

test('an explicit exit transfers over the planted feet before walking beside the chair at walking speed', () => {
  const front = { x: from.x, z: from.z + SEAT_FORWARD_REACH }, side = { x: from.x + 1.1, z: front.z };
  const exit = createSeatExit({ from, riseTo: front, to: side });
  close(exit.state.x, from.x, 'the first position is the actual seat position');
  close(exit.state.z, from.z, 'the first position cannot jump to the feet');
  let previous = exit.state;
  for (let elapsed = 10; elapsed <= SEAT_RISE_MS; elapsed += 10) {
    const pose = exit.update(10);
    assert.ok(Math.hypot(pose.x - previous.x, pose.z - previous.z) <= 2.25 * .01 + 1e-8);
    assert.equal(pose.x, from.x, 'the rise moves only towards the seat front');
    close(pose.z - from.z, pose.seatSlide, 'the root and planted-foot offset share the same transfer');
    assert.equal(pose.mayWalk, false);
    previous = pose;
  }
  close(previous.z, front.z, 'the standing root finishes above the planted feet');
  close(previous.standProgress, 1, 'the pelvis fully rises before stepping aside');
  assert.equal(previous.phase, 'stepping');
  while (exit.active) {
    const pose = exit.update(10);
    assert.ok(Math.hypot(pose.x - previous.x, pose.z - previous.z) <= 2.25 * .01 + 1e-8,
      'the departure uses normal walking speed instead of a fast slide');
    close(pose.z, front.z, 'the side departure never crosses the chair back');
    previous = pose;
  }
  close(previous.x, side.x, 'the final position is outside the chair');
  assert.equal(previous.seatSlide, 0);
  assert.equal(previous.mayWalk, true);
});

test('an obstruction freezes the entire explicit transfer, including the rise and foot offset', () => {
  const exit = createSeatExit({ from, riseTo: { x: from.x, z: from.z + SEAT_FORWARD_REACH }, to });
  const first = exit.state;
  assert.deepEqual(exit.peek(200, { blocked: true }), first);
  assert.deepEqual(exit.update(200, { blocked: true }), first);
  const partial = exit.update(200);
  assert.ok(partial.standProgress > 0 && partial.seatSlide > 0);
  for (let frame = 0; frame < 20; frame++) assert.deepEqual(exit.update(50, { blocked: true }), partial);
  assert.equal(exit.active, true, 'a blocked weight transfer retains its seat');
  assert.equal(exit.update(10_000).complete, true, 'the same transfer resumes after clearance returns');
});

test('a cancelled lower resumes from its actual position and full standing progress without a jump', () => {
  for (const [initialStand, startingSlide] of [[.36, .25984], [.35, .0817075], [.8, .18]]) {
    const start = { x: from.x, z: from.z + startingSlide };
    const front = { x: from.x, z: from.z + SEAT_FORWARD_REACH };
    const exit = createSeatExit({ from: start, riseTo: front, to, initialStand, startingSlide,
      riseMs: SEAT_RISE_MS * (1 - initialStand) });
    close(exit.state.z, start.z, 'the actual partial-lowering position is preserved');
    close(exit.state.standProgress, initialStand, 'the pose continues from the current rise height');
    close(exit.state.seatSlide, startingSlide, 'the planted-foot offset is preserved');
    const remainingRiseMs = SEAT_RISE_MS * (1 - initialStand);
    const previewUpright = exit.peek(remainingRiseMs);
    close(previewUpright.standProgress, 1, 'a partial lower finishes its remaining rise without an unnecessarily extended shift');
    close(previewUpright.z, front.z, 'the root finishes above its already planted feet');
    let previous = exit.state;
    while (exit.active) {
      const pose = exit.update(5);
      assert.ok(pose.standProgress >= previous.standProgress);
      assert.ok(Math.hypot(pose.x - previous.x, pose.z - previous.z) <= 2.25 * .005 + 1e-8);
      previous = pose;
    }
    assert.equal(previous.complete, true);
    close(previous.z, to.z, 'the interrupted transfer finishes at its clear departure point');
  }
});

test('an already upright explicit transfer cannot teleport to a different front point', () => {
  const exit = createSeatExit({ from, riseTo: { x: from.x, z: from.z + SEAT_FORWARD_REACH }, to,
    initialStand: 1, riseMs: 0 });
  close(exit.state.z, from.z, 'even zero requested rise time begins at the actual root');
  let previous = exit.state;
  while (exit.active) {
    const pose = exit.update(5);
    assert.ok(Math.hypot(pose.x - previous.x, pose.z - previous.z) <= 2.25 * .005 + 1e-8);
    previous = pose;
  }
});

test('explicit transfer coordinates and movement parameters are copied and validated', () => {
  const front = { x: from.x, z: from.z + SEAT_FORWARD_REACH };
  const exit = createSeatExit({ from, to, riseTo: front });
  front.z = 100;
  close(exit.update(SEAT_RISE_MS).z, from.z + SEAT_FORWARD_REACH, 'front point is copied');
  for (const invalid of [null, {}, { x: Infinity, z: 0 }]) {
    if (invalid === null) continue; // Null deliberately selects the legacy mode.
    assert.throws(() => createSeatExit({ from, to, riseTo: invalid }), TypeError);
  }
  for (const speed of [0, -1, NaN, Infinity]) assert.throws(() => createSeatExit({ from, to, riseTo: from, speed }), RangeError);
  for (const initialStand of [-.1, 1.1, NaN]) assert.throws(() => createSeatExit({ from, to, riseTo: from, initialStand }), RangeError);
  for (const startingSlide of [-.1, .30, NaN]) assert.throws(() => createSeatExit({ from, to, riseTo: from, startingSlide }), RangeError);
});

test('a routed departure commits its front waypoint before turning beside the chair', () => {
  const front = { x: 0, z: SEAT_FORWARD_REACH }, clearFront = { x: 0, z: .50 }, side = { x: 1.1, z: .50 };
  const exit = createSeatExit({ from: { x: 0, z: 0 }, riseTo: front, to: side, via: [clearFront] });
  clearFront.z = 100;
  const upright = exit.update(SEAT_RISE_MS);
  close(upright.z, front.z, 'the rise first finishes above the feet');
  assert.deepEqual(upright.walkTarget, { x: 0, z: .50 });
  const corner = exit.peek(10_000);
  close(corner.x, 0, 'a frame cannot cut diagonally into the chair legs');
  close(corner.z, .50, 'the explicit route reaches the front lane before turning');
  assert.equal(corner.complete, false);
  close(exit.state.z, front.z, 'previewing the corner does not move the actor');
  assert.deepEqual(exit.update(10_000), corner);
  const lateral = exit.peek(10);
  assert.ok(lateral.x > 0);
  close(lateral.z, .50, 'the next step follows the lateral lane');
  assert.deepEqual(lateral.walkTarget, side, 'footstep prediction uses this segment endpoint');
  const finished = exit.update(10_000);
  assert.equal(finished.complete, true);
  close(finished.x, side.x, 'the final position follows both route segments');
});
