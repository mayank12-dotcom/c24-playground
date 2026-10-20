import test from 'node:test';
import assert from 'node:assert/strict';
import { findWalkRoute } from '../src/navigation.js';
import { inflateObstacles } from '../src/collision.js';
import { GARDEN_SPAWN, GARDEN_COLLIDERS, GARDEN_WORKSPACES, GARDEN_ROOMS, GARDEN_WALLS } from '../src/garden-layout.js';
import { STATION_POSITIONS } from '../src/crowd.js';
import { COZY_FURNITURE, TABLE_TENNIS_TABLES } from '../src/lounge-layout.js';
import { getStationColliders, SEAT_APPROACH_OFFSET } from '../src/station-layout.js';

const avatarMargin = .32;
const loungeBounds = COZY_FURNITURE.map(item => {
  const c = Math.abs(Math.cos(item.rotation)), s = Math.abs(Math.sin(item.rotation));
  return { x: item.x, z: item.z, halfX: item.halfX * c + item.halfZ * s, halfZ: item.halfZ * c + item.halfX * s };
});
const allBounds = [
  ...GARDEN_COLLIDERS,
  ...loungeBounds,
  ...TABLE_TENNIS_TABLES.map(item => ({ x: item.x, z: item.z, halfX: item.width / 2, halfZ: item.length / 2 })),
  ...getStationColliders(STATION_POSITIONS),
];
const blocker = bounds => {
  const inflated = inflateObstacles(bounds, avatarMargin);
  return (x, z) => inflated.some(item => Math.abs(x - item.x) < item.halfX
    && Math.abs(z - item.z) < item.halfZ);
};
const isBlocked = blocker(allBounds);
const inflate = bounds => inflateObstacles(bounds, avatarMargin);
const obstacles = inflate(allBounds);

function checkedRoute(start, goal, options = {}) {
  const route = findWalkRoute(start, goal, { isBlocked, obstacles, ...options });
  assert.notEqual(route, null, `a route exists from (${start.x}, ${start.z}) to (${goal.x}, ${goal.z})`);
  const points = [start, ...(route.length ? route : [goal])];
  const blocked = options.isBlocked || isBlocked;
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1], to = points[index];
    const sampleCount = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .05));
    for (let sample = 0; sample <= sampleCount; sample++) {
      const t = sample / sampleCount;
      const x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
      assert.equal(blocked(x, z), false, `smoothed route crosses an obstacle at (${x.toFixed(3)}, ${z.toFixed(3)})`);
    }
  }
  assert.deepEqual(points.at(-1), goal, 'the route reaches the exact chair or approach point');
  return points;
}

test('actual chair routing reaches all nine desks through the connected rooms', () => {
  assert.equal(STATION_POSITIONS.length, 9);
  for (const workspace of GARDEN_WORKSPACES) {
    const { x, z } = workspace;
    checkedRoute(GARDEN_SPAWN, { x, z: z + 1.5 + SEAT_APPROACH_OFFSET });
  }
});

test('bot challenge approaches remain reachable without walking through furniture', () => {
  for (const [x, z] of STATION_POSITIONS) checkedRoute(GARDEN_SPAWN, { x, z: z + 2.8 });
});

test('long walks between garden work zones avoid physical furniture', () => {
  for (const [fromIndex, toIndex] of [[0, 8], [6, 2], [5, 1]]) {
    const from = STATION_POSITIONS[fromIndex], to = STATION_POSITIONS[toIndex];
    checkedRoute({ x: from[0], z: from[1] + 2.5 }, { x: to[0], z: to[1] + 1.5 + SEAT_APPROACH_OFFSET });
  }
});

test('shared-room paths can move directly between the open floor areas', () => {
  const start = { x: -4.5, z: -2 }, goal = { x: -8.5, z: -2 };
  assert.deepEqual(checkedRoute(start, goal), [start, goal], 'no invisible old workspace partition divides the studio');
});

test('routes from the lounge and tennis forecourt also avoid their physical furniture', () => {
  const [x, z] = STATION_POSITIONS[4];
  checkedRoute({ x: 9.1, z: 14 }, { x, z: z + 1.5 + SEAT_APPROACH_OFFSET });
  checkedRoute({ x: 19, z: 9 }, { x, z: z + 1.5 + SEAT_APPROACH_OFFSET });
});

test('lateral room destinations route through real doorways instead of crossing solid side walls', () => {
  for (const zone of GARDEN_ROOMS) for (const side of [-1, 1]) {
    const edge = zone.x + side * zone.width / 2;
    const wallSide = side < 0 ? 'left' : 'right';
    assert.ok(GARDEN_WALLS.some(wall => wall.roomId === zone.id && wall.side === wallSide));
    const endpoints = [-1.8, 0, 1.8, -3, 3].map(offset => ({
      from: { x: edge + side * .9, z: zone.z + offset },
      to: { x: edge - side * .9, z: zone.z + offset },
    })).find(({ from, to }) => !isBlocked(from.x, from.z) && !isBlocked(to.x, to.z));
    assert.ok(endpoints, `${zone.id} has clear walking positions beside its ${wallSide} wall`);
    const route = checkedRoute(endpoints.from, endpoints.to);
    assert.ok(route.length > 2, `${zone.id} ${wallSide} approach detours through an opening`);
  }
});

test('a genuinely sealed physical obstacle still rejects unreachable goals', () => {
  const enclosure = [
    { x: 0, z: -2, halfX: 2.1, halfZ: .1 },
    { x: 0, z: 2, halfX: 2.1, halfZ: .1 },
    { x: -2, z: 0, halfX: .1, halfZ: 2.1 },
    { x: 2, z: 0, halfX: .1, halfZ: 2.1 },
  ];
  assert.equal(findWalkRoute({ x: 0, z: 4 }, { x: 0, z: 0 }, {
    isBlocked: blocker(enclosure), obstacles: inflate(enclosure),
  }), null, 'navigation never crosses a physical closed ring to reach its clear center');
});

test('open path segments remain direct and blocked goals are rejected', () => {
  const goal = { x: 6.5, z: GARDEN_SPAWN.z };
  assert.deepEqual(checkedRoute(GARDEN_SPAWN, goal), [GARDEN_SPAWN, goal]);
  assert.deepEqual(findWalkRoute(GARDEN_SPAWN, goal, { isBlocked, obstacles }), []);
  const [x, z] = STATION_POSITIONS[0];
  assert.equal(findWalkRoute(GARDEN_SPAWN, { x, z }, { isBlocked, obstacles }), null);
});

test('predicate-only routes can still avoid an irregular custom exclusion area', () => {
  const customBlocked = (x, z) => Math.hypot(x - 1, z) < .8;
  const start = { x: -1, z: 0 }, goal = { x: 3, z: 0 };
  const points = checkedRoute(start, goal, { isBlocked: customBlocked, obstacles: undefined });
  assert.ok(points.length > 2, 'the direct route around the exclusion area needs a detour');
});
