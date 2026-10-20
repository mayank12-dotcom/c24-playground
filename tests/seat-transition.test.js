import assert from 'node:assert/strict';
import test from 'node:test';
import { inflateObstacles } from '../src/collision.js';
import { getStationColliders } from '../src/station-layout.js';
import { SOCIAL_COLLIDERS, SOCIAL_SEATS } from '../src/social-layout.js';
import { FURNITURE_SEATS, FURNITURE_SEAT_STRUCTURES } from '../src/furniture-seats.js';
import { getSeatStructure, getSeatTransitionBounds, moveSeatTransfer, rankSeatRoutes, seatDepartureOptions, seatEntryGates, seatRouteLength } from '../src/seat-transition.js';

const job = { job: { id: 'role' }, seat: { x: 0, z: 1.5 }, approach: { x: -1.1, z: 1.07 }, rotation: Math.PI, stationIndex: 0 };
const physical = inflateObstacles(getStationColliders([[0, 0]]));
const bounds = getSeatTransitionBounds(job, physical);
const stage = { x: 0, z: 1.21 };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} versus ${expected}`);
const clearDeparture = (option, people = []) => {
  const points = [stage, ...option.via, option.to];
  return points.slice(1).every((point, index) => !moveSeatTransfer(points[index], point, job, bounds, people).blocked);
};

test('approach ranking chooses the nearby open side instead of a fixed left gate', () => {
  const routes = seatEntryGates(job).map(entrance => ({ to: entrance.gate, via: [] }));
  assert.ok(rankSeatRoutes({ x: 2, z: 1.07 }, routes)[0].to.x > 0);
  assert.ok(rankSeatRoutes({ x: -2, z: 1.07 }, routes)[0].to.x < 0);
  const blockedRight = route => route.to.x < 0;
  assert.ok(rankSeatRoutes({ x: 2, z: 1.07 }, routes, { isClear: blockedRight })[0].to.x < 0);
});

test('a received clear front strip permits a short backstep while the backrest remains solid', () => {
  const front = { x: 0, z: 1.20 };
  assert.equal(moveSeatTransfer(front, stage, job, bounds, []).blocked, false);
  assert.equal(moveSeatTransfer({ x: 0, z: 2.3 }, stage, job, bounds, []).blocked, true);
  assert.equal(moveSeatTransfer(stage, job.seat, job, bounds, [], { fromSlide: .29, toSlide: 0 }).blocked, false);
});

test('a desk rejects front departure and the next destination selects the nearest safe side', () => {
  const owned = physical.find(bound => bound.kind === 'applicant-chair');
  const options = seatDepartureOptions(job, owned);
  assert.equal(clearDeparture(options[0]), false, 'the table stays solid in front of the chair');
  const clear = rankSeatRoutes(stage, options, { isClear: clearDeparture });
  assert.equal(clear.length, 2);
  const toward = x => point => Math.hypot(point.x - x, point.z - 1.07);
  assert.ok(rankSeatRoutes(stage, options, { isClear: clearDeparture, remainingDistance: toward(6) })[0].to.x > 0);
  assert.ok(rankSeatRoutes(stage, options, { isClear: clearDeparture, remainingDistance: toward(-6) })[0].to.x < 0);
  const blocker = [{ id: 'visitor', x: 1.1, z: 1.07, radius: .4 }];
  const available = rankSeatRoutes(stage, options, { isClear: option => clearDeparture(option, blocker), remainingDistance: toward(6) });
  assert.equal(available.length, 1);
  assert.ok(available[0].to.x < 0, 'another person outweighs the preferred direction');
});

test('both beanbag facings allow a short forward exit outside their normal walking footprint', () => {
  for (const seat of SOCIAL_SEATS.filter(seat => seat.kind === 'beanbag').slice(0, 2)) {
    const station = { job: { ...seat, kind: 'lounge', seatType: 'beanbag' }, seat, approach: seat.approach, exit: seat.exit, rotation: seat.rotation, colliderId: seat.colliderId };
    const all = inflateObstacles(SOCIAL_COLLIDERS), owned = all.find(bound => bound.id === seat.colliderId);
    const seatBounds = getSeatTransitionBounds(station, all);
    const facing = { x: Math.sin(seat.rotation), z: Math.cos(seat.rotation) };
    const rise = { x: seat.x + facing.x * .29, z: seat.z + facing.z * .29 };
    const front = seatDepartureOptions(station, owned)[0];
    assert.equal(moveSeatTransfer(rise, front.to, station, seatBounds, []).blocked, false);
    assert.ok(Math.abs(front.to.x - owned.x) > owned.halfX || Math.abs(front.to.z - owned.z) > owned.halfZ);
    assert.ok(Math.hypot(front.to.x - seat.x, front.to.z - seat.z) < Math.hypot(seat.exit.x - seat.x, seat.exit.z - seat.z));
    const further = { x: front.to.x + facing.x * .5, z: front.to.z + facing.z * .5 };
    assert.equal(moveSeatTransfer(front.to, further, null, all, []).blocked, false, 'the front stop does not trap the visitor inside the beanbag');
  }
});

test('route ranking measures the full walk around obstacles rather than only endpoint distance', () => {
  const from = { x: 0, z: 0 };
  const detour = { to: { x: 1, z: 0 }, via: [{ x: 0, z: 4 }, { x: 1, z: 4 }] };
  const direct = { to: { x: -2, z: 0 }, via: [] };
  near(seatRouteLength(from, [...detour.via, detour.to]), 9);
  assert.equal(rankSeatRoutes(from, [detour, direct])[0], direct);
  assert.deepEqual(rankSeatRoutes(from, [detour, direct], { isClear: () => false }), []);
});

const loungeStation = seat => ({ job: { ...seat, kind: 'lounge', seatType: seat.kind }, seat,
  approach: seat.approach, exit: seat.exit, rotation: seat.rotation, colliderId: seat.colliderId });
const furnitureBound = seat => {
  const item = FURNITURE_SEAT_STRUCTURES[seat.colliderId];
  const c = Math.abs(Math.cos(item.rotation)), s = Math.abs(Math.sin(item.rotation));
  return inflateObstacles([{ ...item, halfX: c * item.halfX + s * item.halfZ,
    halfZ: s * item.halfX + c * item.halfZ }])[0];
};
const pointAtSeat = (seat, x, z) => ({ x: seat.x + Math.cos(seat.rotation) * x + Math.sin(seat.rotation) * z,
  z: seat.z - Math.sin(seat.rotation) * x + Math.cos(seat.rotation) * z });

test('every free furnishing permits a grounded settle, rise and clear front departure through its own structure', () => {
  for (const seat of FURNITURE_SEATS) {
    const station = loungeStation(seat), own = furnitureBound(seat);
    const bounds = getSeatTransitionBounds(station, [own]);
    const stage = pointAtSeat(seat, 0, .29);
    const options = { fromRotation: seat.rotation, toRotation: seat.rotation };
    assert.equal(moveSeatTransfer(stage, seat, station, bounds, [], { ...options, fromSlide: .29, toSlide: 0 }).blocked, false, `${seat.id}: settle`);
    assert.equal(moveSeatTransfer(seat, stage, station, bounds, [], { ...options, fromSlide: 0, toSlide: .29 }).blocked, false, `${seat.id}: rise`);
    const departure = seatDepartureOptions(station, own)[0];
    assert.equal(moveSeatTransfer(stage, departure.to, station, bounds, [], options).blocked, false, `${seat.id}: front departure`);
    assert.ok(Math.abs(departure.to.x - own.x) > own.halfX || Math.abs(departure.to.z - own.z) > own.halfZ, `${seat.id}: clear ordinary footprint`);
  }
});

test('a rotated armchair retains its back and arms without closing the opening between them', () => {
  const seat = FURNITURE_SEATS.find(item => item.kind === 'armchair' && Math.abs(Math.sin(item.rotation * 2)) > .1);
  assert.ok(seat, 'the actual garden includes a rotated armchair');
  const station = loungeStation(seat), bounds = getSeatTransitionBounds(station, [furnitureBound(seat)]);
  const stage = pointAtSeat(seat, 0, .29);
  assert.ok(getSeatStructure(station).filter(part => part.id.includes(':arm:')).length > 2, 'rotated arms use narrow structural strips');
  assert.equal(moveSeatTransfer(pointAtSeat(seat, 0, .9), stage, station, bounds, [], { fromRotation: seat.rotation, toRotation: seat.rotation }).blocked, false);
  assert.equal(moveSeatTransfer(pointAtSeat(seat, 0, -1.2), stage, station, bounds, [], { fromRotation: seat.rotation, toRotation: seat.rotation }).blocked, true, 'the back remains solid');
  assert.equal(moveSeatTransfer(pointAtSeat(seat, 1.2, -.2), seat, station, bounds, [], { fromRotation: seat.rotation, toRotation: seat.rotation }).blocked, true, 'the side arm remains solid');
});

test('rotated ottoman soles use its local support instead of a broad world-axis box', () => {
  const seat = FURNITURE_SEATS.find(item => item.kind === 'ottoman' && item.source === 'social');
  const station = loungeStation(seat), furnishing = FURNITURE_SEAT_STRUCTURES[seat.colliderId];
  const bounds = getSeatTransitionBounds(station, [furnitureBound(seat)]);
  const frontOfBase = .39 + .15 - (seat.x - furnishing.x) * Math.sin(seat.rotation) - (seat.z - furnishing.z) * Math.cos(seat.rotation);
  const options = { fromRotation: seat.rotation, toRotation: seat.rotation, fromSlide: .29, toSlide: .29 };
  assert.equal(moveSeatTransfer(pointAtSeat(seat, 0, .9), pointAtSeat(seat, 0, frontOfBase + .001), station, bounds, [], options).blocked, false);
  assert.equal(moveSeatTransfer(pointAtSeat(seat, 0, .9), pointAtSeat(seat, 0, frontOfBase - .001), station, bounds, [], options).blocked, true, 'the soles stop at the real low base');
});

test('a lounge gate stays outside the widened walking footprint at every furnishing rotation', () => {
  for (const seat of FURNITURE_SEATS) {
    const own = furnitureBound(seat), station = loungeStation(seat);
    const margin = seat.kind === 'beanbag' ? 0 : .36;
    const wide = { ...own, halfX: own.halfX + margin, halfZ: own.halfZ + margin };
    for (const { gate, via } of seatEntryGates(station, wide)) {
      assert.ok(Math.abs(gate.x - wide.x) > wide.halfX || Math.abs(gate.z - wide.z) > wide.halfZ, `${seat.id}: outside approach`);
      const points = [gate, ...via];
      assert.ok(points.slice(1).every((to, index) => !moveSeatTransfer(points[index], to, station,
        getSeatTransitionBounds(station, [own]), [], { fromRotation: seat.rotation, toRotation: seat.rotation }).blocked), `${seat.id}: open front or end transfer`);
    }
  }
});

test('claiming one cushion preserves another furnishing and a person in an adjacent cushion', () => {
  const seat = FURNITURE_SEATS.find(item => item.kind === 'couch');
  const station = loungeStation(seat), neighbor = { id: 'neighboring-furniture', x: seat.x, z: seat.z + 2, halfX: .5, halfZ: .5 };
  const bounds = getSeatTransitionBounds(station, [furnitureBound(seat), neighbor]);
  assert.ok(bounds.includes(neighbor));
  const stage = pointAtSeat(seat, 0, .29);
  const person = { id: 'other-visitor', x: stage.x, z: stage.z, radius: .32 };
  assert.equal(moveSeatTransfer(pointAtSeat(seat, 0, 1.3), stage, station, bounds, [person], { fromRotation: seat.rotation, toRotation: seat.rotation }).blocked, true);
});

test('an unknown lounge ID cannot remove an arbitrary object collider', () => {
  const physical = [{ id: 'unknown-chair', x: 0, z: 0, halfX: 1, halfZ: 1 }];
  const station = { job: { id: 'invented-seat', kind: 'lounge' }, colliderId: 'unknown-chair' };
  assert.equal(getSeatTransitionBounds(station, physical), physical);
});

test('an ottoman beside a beanbag leaves through its clear front-side lane instead of cutting the beanbag', () => {
  const all = inflateObstacles(SOCIAL_COLLIDERS);
  for (const seat of FURNITURE_SEATS.filter(item => item.kind === 'ottoman' && item.source === 'social')) {
    const station = loungeStation(seat), bounds = getSeatTransitionBounds(station, all);
    const own = all.find(bound => bound.id === seat.colliderId), rise = pointAtSeat(seat, 0, .29);
    const options = seatDepartureOptions(station, own);
    const isClear = option => {
      const points = [rise, ...option.via, option.to];
      return points.slice(1).every((to, index) => !moveSeatTransfer(points[index], to, station, bounds, [], {
        fromRotation: seat.rotation, toRotation: seat.rotation }).blocked);
    };
    assert.equal(isClear(options[0]), false, `${seat.id}: the nearby beanbag blocks the distant straight exit`);
    const clear = rankSeatRoutes(rise, options, { isClear });
    assert.ok(clear.length > 0, `${seat.id}: a bent departure remains available`);
    for (const option of clear) assert.ok(Math.abs(option.to.x - own.x) > own.halfX || Math.abs(option.to.z - own.z) > own.halfZ);
  }
});

test('a shared sofa retains room for both occupants but rejects the approach across an occupied cushion', () => {
  const seat = FURNITURE_SEATS.find(item => item.kind === 'couch' && item.source === 'cozy');
  const neighbor = FURNITURE_SEATS.find(item => item.colliderId === seat.colliderId && item.id !== seat.id);
  const station = loungeStation(seat), own = furnitureBound(seat);
  const bounds = getSeatTransitionBounds(station, [own]);
  const people = [{ id: 'seated-visitor', x: neighbor.x, z: neighbor.z, radius: .52 }];
  const wide = { ...own, halfX: own.halfX + .36, halfZ: own.halfZ + .36 };
  const entries = seatEntryGates(station, wide);
  const clear = entries.map(entry => {
    const points = [entry.gate, ...entry.via];
    return points.slice(1).every((point, index) => !moveSeatTransfer(points[index], point, station, bounds, people, {
      fromRotation: seat.rotation, toRotation: seat.rotation }).blocked);
  });
  assert.ok(clear.some(Boolean), 'the free cushion has an open approach');
  assert.ok(clear.some(value => !value), 'the route across the occupied cushion is rejected');
  assert.equal(moveSeatTransfer(pointAtSeat(seat, 0, .29), seat, station, bounds, people, {
    fromRotation: seat.rotation, toRotation: seat.rotation, fromSlide: .29, toSlide: 0 }).blocked, false, 'adjacent fully seated people remain separate');
});
