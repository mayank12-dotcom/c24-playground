import assert from 'node:assert/strict';
import test from 'node:test';
import { COZY_FURNITURE } from '../src/lounge-layout.js';
import { GARDEN_PROPS, GARDEN_COLLIDERS } from '../src/garden-layout.js';
import { SOCIAL_FURNITURE, SOCIAL_SEATS } from '../src/social-layout.js';
import { FURNITURE_SEATS, FURNITURE_SEAT_STRUCTURES, INFO_LOUNGE_FURNITURE } from '../src/furniture-seats.js';
import { SEAT_IDS, SEAT_POSITIONS } from '../src/seat-catalog.js';

const inversePoint = (origin, point) => {
  const x = point.x - origin.x, z = point.z - origin.z;
  return { x: Math.cos(origin.rotation) * x - Math.sin(origin.rotation) * z,
    z: Math.sin(origin.rotation) * x + Math.cos(origin.rotation) * z };
};

test('every free sitting furnishing exposes a seat while tables and display objects remain solid props', () => {
  const inventory = [
    ...COZY_FURNITURE.map(item => ({ ...item, kind: item.type, source: 'cozy' })),
    ...GARDEN_PROPS.map(item => ({ ...item, source: 'garden' })),
    ...INFO_LOUNGE_FURNITURE,
    ...SOCIAL_FURNITURE.filter(item => item.kind === 'ottoman').map(item => ({ ...item, source: 'social' })),
  ];
  assert.deepEqual(FURNITURE_SEATS.reduce((counts, seat) => ({ ...counts, [seat.source]: (counts[seat.source] || 0) + 1 }), {}),
    { cozy: 11, garden: 17, information: 4, social: 2 });
  for (const item of inventory) {
    const seats = FURNITURE_SEATS.filter(seat => seat.colliderId === item.id);
    const count = ['sofa', 'couch'].includes(item.kind) ? 2 : ['beanbag', 'armchair', 'ottoman'].includes(item.kind) ? 1 : 0;
    assert.equal(seats.length, count, `${item.id} has ${count} independently usable cushion(s)`);
    if (count) assert.equal(FURNITURE_SEAT_STRUCTURES[item.id].source, item.source);
  }
});

test('all furniture positions are authoritative shared seats without claiming companions reserved couch slots', () => {
  assert.equal(FURNITURE_SEATS.length, 34);
  assert.equal(SEAT_IDS.length, 47);
  assert.equal(new Set(SEAT_IDS).size, SEAT_IDS.length);
  for (const seat of FURNITURE_SEATS) {
    assert.deepEqual(SEAT_POSITIONS[seat.id], { x: seat.x, z: seat.z, rotation: seat.rotation });
    assert.equal(seat.seatHeight, .30, `${seat.id} supports the current short-legged rig`);
    assert.ok(Object.isFrozen(seat));
  }
  for (const seat of SOCIAL_SEATS.filter(seat => seat.occupiedBy)) assert.ok(!SEAT_IDS.includes(seat.id));
});

test('multi-place couches support two distinct front-edge positions, including the rotated corner sofa', () => {
  const couches = Object.values(FURNITURE_SEAT_STRUCTURES).filter(item => item.kind === 'couch');
  assert.equal(couches.length, 9);
  assert.ok(couches.some(item => Math.abs(item.rotation - Math.PI / 2) < 1e-8));
  for (const couch of couches) {
    const [left, right] = FURNITURE_SEATS.filter(seat => seat.colliderId === couch.id);
    const a = inversePoint(couch, left), b = inversePoint(couch, right);
    assert.ok(Math.hypot(left.x - right.x, left.z - right.z) >= 1.05, `${couch.id} leaves space between neighboring characters`);
    assert.ok(a.x < 0 && b.x > 0);
    assert.ok(a.z >= .30 && a.z <= .36);
    assert.ok(Math.abs(a.z - b.z) < 1e-8);
    assert.equal(left.rotation, couch.rotation);
    assert.equal(right.rotation, couch.rotation);
  }
});

test('furniture approaches clear the full rotated footprint and leave room for the standing body to turn', () => {
  for (const seat of FURNITURE_SEATS) {
    const item = FURNITURE_SEAT_STRUCTURES[seat.colliderId];
    const c = Math.abs(Math.cos(item.rotation)), s = Math.abs(Math.sin(item.rotation));
    const halfX = item.halfX * c + item.halfZ * s, halfZ = item.halfZ * c + item.halfX * s;
    const margin = .32 + (item.kind === 'beanbag' ? 0 : .36);
    assert.ok(Math.abs(seat.approach.x - item.x) > halfX + margin || Math.abs(seat.approach.z - item.z) > halfZ + margin,
      `${seat.id} reaches its transfer lane before the ordinary footprint`);
    const local = inversePoint(item, seat), approach = inversePoint(item, seat.approach);
    assert.ok(approach.z > local.z, `${seat.id} starts on the open front side`);
    assert.ok(Math.abs(local.x - approach.x) < 1e-8);
  }
});

test('front-edge support positions clear every solid back and arm in their local furniture profiles', () => {
  for (const seat of FURNITURE_SEATS) {
    const item = FURNITURE_SEAT_STRUCTURES[seat.colliderId], local = inversePoint(item, seat);
    for (const part of item.parts.filter(part => part.profile === 'body')) {
      assert.ok(Math.abs(local.x - part.x) > part.halfX || Math.abs(local.z - part.z) > part.halfZ,
        `${seat.id} does not merge with ${part.label}`);
    }
    if (item.kind === 'couch' || item.kind === 'armchair') {
      assert.ok(item.parts.some(part => part.label === 'backrest'));
      assert.equal(item.parts.filter(part => part.label.startsWith('arm:')).length, 2);
    }
    assert.ok(Object.isFrozen(item.parts));
  }
});

test('garden collider identities survive rotations and cozy beanbag bounds contain their shared sculpt', () => {
  for (const prop of GARDEN_PROPS) {
    const bound = GARDEN_COLLIDERS.find(item => item.id === prop.id);
    assert.ok(bound, `${prop.id} retains its ownership identity`);
    assert.equal(bound.x, prop.x);
    assert.equal(bound.z, prop.z);
  }
  for (const beanbag of COZY_FURNITURE.filter(item => item.type === 'beanbag')) {
    assert.ok(beanbag.halfX >= .71 && beanbag.halfZ >= .73);
  }
});
