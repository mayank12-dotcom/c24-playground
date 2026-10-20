import test from 'node:test';
import assert from 'node:assert/strict';
import { getStationColliders, SEAT_APPROACH_OFFSET } from '../src/station-layout.js';
import { STATION_POSITIONS } from '../src/crowd.js';

const avatarClearance = .32;
const colliders = getStationColliders(STATION_POSITIONS);
const blocked = (x, z) => colliders.some(object => Math.abs(x - object.x) < object.halfX + avatarClearance
  && Math.abs(z - object.z) < object.halfZ + avatarClearance);

test('every job desk and both rendered chairs are solid while walking', () => {
  assert.equal(colliders.length, STATION_POSITIONS.length * 3);
  for (const [index, [x, z]] of STATION_POSITIONS.entries()) {
    const station = colliders.filter(object => object.stationIndex === index);
    assert.deepEqual(station.map(object => object.kind), ['desk', 'recruiter-chair', 'applicant-chair']);
    for (const object of station) {
      assert.equal(blocked(object.x, object.z), true);
      assert.equal(blocked(object.x + object.halfX + avatarClearance - .001, object.z), true,
        `${object.kind} stops a body approaching its side`);
    }
    assert.equal(blocked(x, z - 1.12), true, 'the recruiter chair cannot be crossed');
    assert.equal(blocked(x, z + 1.5), true, 'an applicant chair is solid even while vacant');
  }
});

test('free-seat approaches, bot challenges and standing positions remain reachable without entering chairs', () => {
  assert.ok(SEAT_APPROACH_OFFSET < .78, 'the free approach reaches the automatic seating trigger');
  assert.ok(SEAT_APPROACH_OFFSET > .38 + avatarClearance, 'the free approach stops before chair contact');
  for (const [x, z] of STATION_POSITIONS) {
    const seatZ = z + 1.5;
    for (const offset of [SEAT_APPROACH_OFFSET, 1.3, 1]) {
      assert.equal(blocked(x, seatZ + offset), false, `front approach ${offset} leaves the chair clear`);
    }
    assert.equal(blocked(x, seatZ + .38 + avatarClearance - .001), true,
      'continuing into the chair is blocked');
  }
});

test('station footprint generation preserves caller coordinates', () => {
  const positions = [[7, -12], [-8, 20]], original = structuredClone(positions);
  const bounds = getStationColliders(positions);
  assert.deepEqual(positions, original);
  assert.equal(bounds[0].x, 7); assert.equal(bounds[0].z, -12);
  assert.equal(bounds[3].x, -8); assert.equal(bounds[3].z, 20);
  assert.deepEqual(getStationColliders([]), []);
});
