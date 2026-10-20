import assert from 'node:assert/strict';
import test from 'node:test';
import { getSeatArrival, BOT_SEAT_HOLD_MS, BOT_SEAT_WALK_MS } from '../src/seat-arrival.js';
import { BOT_SEATED_JOB_INDICES, STATION_POSITIONS, getBots } from '../src/crowd.js';
import { isGardenBlocked } from '../src/garden-layout.js';

const epoch = 1_792_340_000_000;
const jobs = Array.from({ length: 9 }, (_, index) => ({ id: `job-${index}` }));

test('ordinary seats and completed arrivals preserve their original logical state', () => {
  const [x, z] = STATION_POSITIONS[1];
  const seated = { x, z: z + 1.5, rotation: Math.PI, seatedJobId: 'job-1' };
  assert.strictEqual(getSeatArrival(seated, epoch, {}), seated);
  assert.strictEqual(getSeatArrival(seated, epoch, { 'job-2': epoch }), seated);
  assert.strictEqual(getSeatArrival({ ...seated, seatedJobId: null }, epoch, {} )?.seatedJobId, null);
  const defeats = { 'job-1': epoch };
  assert.strictEqual(getSeatArrival(seated, epoch + BOT_SEAT_HOLD_MS + BOT_SEAT_WALK_MS, defeats), seated);
  assert.strictEqual(getSeatArrival(seated, epoch + 86400000, defeats), seated);
});

test('the won seat is held logically while its human waits, walks in continuously and sits', () => {
  const defeats = { 'job-2': epoch };
  const [x, z] = STATION_POSITIONS[2];
  const seated = { x, z: z + 1.5, rotation: Math.PI, seatedJobId: 'job-2', hair: 3 };
  const original = { ...seated };
  const first = getSeatArrival(seated, epoch, defeats);
  assert.equal(first.seatedJobId, null);
  assert.equal(first.logicalSeatedJobId, 'job-2');
  assert.equal(first.hair, seated.hair);
  assert.equal(first.moving, false);
  assert.equal(first.arriving, true);
  assert.deepEqual(getSeatArrival(seated, epoch + BOT_SEAT_HOLD_MS, defeats), first);
  let previous = first;
  for (let elapsed = 10; elapsed <= BOT_SEAT_HOLD_MS + BOT_SEAT_WALK_MS; elapsed += 10) {
    const next = getSeatArrival(seated, epoch + elapsed, defeats);
    assert.ok(Math.hypot(next.x - previous.x, next.z - previous.z) <= .030001, 'the human must not teleport into the chair');
    const turn = Math.atan2(Math.sin(next.rotation - previous.rotation), Math.cos(next.rotation - previous.rotation));
    assert.ok(Math.abs(turn) < .06, 'the approach should turn smoothly into the seated facing');
    if (elapsed < BOT_SEAT_HOLD_MS + BOT_SEAT_WALK_MS) assert.equal(next.seatedJobId, null);
    previous = next;
  }
  assert.deepEqual(seated, original, 'rendering must not move the logical claim');
  assert.equal(previous.seatedJobId, 'job-2');
  assert.equal(previous.x, seated.x);
  assert.equal(previous.z, seated.z);
});

test('waiting and arrival stay clear of the outgoing bot at every fixed bot table', () => {
  const defeats = Object.fromEntries(BOT_SEATED_JOB_INDICES.map(index => [`job-${index}`, epoch]));
  for (let elapsed = 0; elapsed <= 15000; elapsed += 10) {
    const bots = getBots(epoch + elapsed, jobs, defeats);
    for (const [botIndex, stationIndex] of BOT_SEATED_JOB_INDICES.entries()) {
      const [x, z] = STATION_POSITIONS[stationIndex];
      const pose = getSeatArrival({ x, z: z + 1.5, rotation: Math.PI, seatedJobId: `job-${stationIndex}` }, epoch + elapsed, defeats);
      const bot = bots[botIndex];
      assert.equal(isGardenBlocked(pose.x, pose.z, .28), false, 'waiting and arrival must stay clear of the garden furniture and railings');
      assert.equal(isGardenBlocked(bot.x, bot.z, .28), false, 'the outgoing bot must leave through the open garden gate');
      assert.ok(Math.hypot(pose.x - bot.x, pose.z - bot.z) > 1.05, 'the arriving human and departing bot must not overlap');
      for (const [tableX, tableZ] of STATION_POSITIONS) {
        assert.ok(Math.abs(pose.x - tableX) >= 1.6 || Math.abs(pose.z - tableZ) >= 1, 'arrival must avoid the desktop');
      }
    }
  }
});

test('clock zero is valid and invalid defeat or clock data never produce a broken pose', () => {
  const state = { x: 1, z: 2, rotation: Math.PI, seatedJobId: 'job-2' };
  const atZero = getSeatArrival(state, 0, { 'job-2': 0 });
  assert.equal(atZero.logicalSeatedJobId, 'job-2');
  assert.ok(Number.isFinite(atZero.x));
  assert.deepEqual(getSeatArrival(state, -100, { 'job-2': 0 }), atZero, 'a clock behind the victory starts at the waiting pose');
  for (const timestamp of [Number.NaN, Infinity, undefined, '0']) {
    assert.strictEqual(getSeatArrival(state, 0, { 'job-2': timestamp }), state);
    assert.strictEqual(getSeatArrival(state, timestamp, { 'job-2': 0 }), state);
  }
  assert.strictEqual(getSeatArrival(state, 0, null), state);
});
