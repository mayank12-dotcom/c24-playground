import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  OFFICE_FLOOR, OFFICE_PERIMETER_WALLS, OFFICE_PROPS,
  GARDEN_SPAWN, GARDEN_ROOMS, GARDEN_PATHS, GARDEN_DOORWAYS,
  GARDEN_WORKSPACES, GARDEN_COLLIDERS, GARDEN_LAWNS,
  GARDEN_TREES, GARDEN_PLANTING_ISLANDS,
} from '../src/garden-layout.js';
import { createGardenSpace } from '../src/garden-space.js';
import { createCozySpace } from '../src/cozy-space.js';
import { createInfoRoom } from '../src/info-room.js';
import { SOCIAL_COLLIDERS, SOCIAL_SEATS } from '../src/social-layout.js';
import { FURNITURE_SEATS } from '../src/furniture-seats.js';
import { SEAT_IDS, SEAT_POSITIONS } from '../src/seat-catalog.js';
import { getStationColliders } from '../src/station-layout.js';
import { getBots, getSocialBots } from '../src/crowd.js';
import { jobs } from '../src/application.js';
import { inflateObstacles, segmentObstacleEntry } from '../src/collision.js';
import { findWalkRoute } from '../src/navigation.js';
import { getSeatTransitionBounds, moveSeatTransfer, seatEntryGates } from '../src/seat-transition.js';

const inFloor = (point, margin = 0) => Math.abs(point.x - OFFICE_FLOOR.x) + margin <= OFFICE_FLOOR.width / 2
  && Math.abs(point.z - OFFICE_FLOOR.z) + margin <= OFFICE_FLOOR.depth / 2;
const contains = (bound, point) => Math.abs(point.x - bound.x) < bound.halfX
  && Math.abs(point.z - bound.z) < bound.halfZ;

function fixture(t) {
  const scene = new THREE.Scene(), box = new THREE.BoxGeometry(), allResources = new Set([box]);
  const shape = (parent, geometry, material, position, scale) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh);
    return mesh;
  };
  const garden = createGardenSpace({ scene, box, allResources });
  const cozy = createCozySpace({ scene, shape, box, allResources });
  const information = createInfoRoom({ scene, shape, box, allResources });
  const bounds = inflateObstacles([
    ...garden.colliders,
    ...getStationColliders(GARDEN_WORKSPACES.map(({ x, z }) => [x, z])),
    ...SOCIAL_COLLIDERS, ...cozy.colliders, ...information.colliders,
  ]);
  t.after(() => {
    garden.dispose(); cozy.dispose(); information.dispose();
    for (const resource of allResources) resource.dispose();
  });
  return { scene, bounds };
}

test('one indoor office floor supports every department, hall, and public seating position', () => {
  assert.ok(OFFICE_FLOOR.width * OFFICE_FLOOR.depth >= 6000, 'the full campus has one large continuous floor');
  assert.deepEqual(GARDEN_LAWNS, []);
  assert.deepEqual(GARDEN_TREES, []);
  assert.deepEqual(GARDEN_PLANTING_ISLANDS, []);
  assert.deepEqual(GARDEN_ROOMS.map(room => room.id).sort(), [
    'class24-info', 'lab', 'loft', 'quiet', 'social-common', 'social-reading', 'studio', 'workshop',
  ]);
  assert.equal(SEAT_IDS.length, 47, 'the office keeps all nine application seats and 38 lounge seats');
  assert.ok(inFloor(GARDEN_SPAWN, 1.4), 'arrival has a generous interior floor margin');
  for (const rectangle of [...GARDEN_ROOMS, ...GARDEN_PATHS]) {
    const halfX = rectangle.width / 2, halfZ = (rectangle.depth ?? rectangle.length) / 2;
    for (const dx of [-halfX, halfX]) for (const dz of [-halfZ, halfZ]) {
      assert.ok(inFloor({ x: rectangle.x + dx, z: rectangle.z + dz }), 'all room and hallway corners lie on the common floor');
    }
  }
  for (const [id, seat] of Object.entries(SEAT_POSITIONS)) assert.ok(inFloor(seat, .6), `${id} remains inside the office`);
  for (const seat of [...SOCIAL_SEATS, ...FURNITURE_SEATS]) {
    assert.ok(inFloor(seat.approach, .5), `${seat.id} has an indoor approach`);
    assert.ok(inFloor(seat.exit, .5), `${seat.id} has an indoor exit`);
  }
});

test('new perimeter walls and office fixtures share solid footprints while every doorway stays open', t => {
  const { bounds } = fixture(t);
  assert.deepEqual(OFFICE_PERIMETER_WALLS.map(wall => wall.side).sort(), ['back', 'front', 'left', 'right']);
  assert.ok(OFFICE_PROPS.some(prop => prop.kind === 'reception'), 'arrival has a reception desk');
  assert.ok(OFFICE_PROPS.some(prop => prop.kind === 'cafe-counter'), 'the shared office has a break-area counter');
  assert.ok(OFFICE_PROPS.some(prop => prop.kind === 'storage'));
  assert.ok(OFFICE_PROPS.some(prop => prop.kind === 'printer'));
  for (const item of [...OFFICE_PERIMETER_WALLS, ...OFFICE_PROPS]) {
    const collider = GARDEN_COLLIDERS.find(bound => bound.id === item.id);
    assert.ok(collider, `${item.id} is part of the actual walking collision plan`);
    for (const field of ['x', 'z', 'halfX', 'halfZ']) assert.equal(collider[field], item[field], `${item.id} ${field} agrees with rendering data`);
    assert.ok(bounds.some(bound => contains(bound, item)), `${item.id} stops a walking character`);
  }
  for (const prop of OFFICE_PROPS) {
    for (const dx of [-prop.halfX, prop.halfX]) for (const dz of [-prop.halfZ, prop.halfZ]) {
      assert.ok(inFloor({ x: prop.x + dx, z: prop.z + dz }, .6), `${prop.id} stays inside the building envelope`);
    }
  }
  for (const door of GARDEN_DOORWAYS) {
    const horizontal = door.side === 'front' || door.side === 'back';
    for (const across of [-.9, 0, .9]) for (const through of [-.65, 0, .65]) {
      const point = { x: door.x + (horizontal ? across : through), z: door.z + (horizontal ? through : across) };
      assert.ok(bounds.every(bound => !contains(bound, point)), `${door.roomId} ${door.side} admits a walking character through the complete furnished office`);
    }
  }
});

test('rendered office shell and fixtures fit their physical footprints on the continuous floor', t => {
  const { scene } = fixture(t);
  const root = scene.getObjectByName('open-garden');
  assert.equal(root.userData.environment, 'large-office');
  scene.updateMatrixWorld(true);
  const renderedProps = OFFICE_PROPS.map(() => new THREE.Box3());
  const renderedWalls = OFFICE_PERIMETER_WALLS.map(() => new THREE.Box3());
  const matrix = new THREE.Matrix4(), world = new THREE.Matrix4();
  let continuousFloor = false;
  for (const batch of root.children) {
    if (!batch.isInstancedMesh || batch.material.side === THREE.BackSide) continue;
    batch.geometry.computeBoundingBox();
    for (let index = 0; index < batch.count; index++) {
      batch.getMatrixAt(index, matrix); world.multiplyMatrices(batch.matrixWorld, matrix);
      const bounds = batch.geometry.boundingBox.clone().applyMatrix4(world);
      const prop = batch.userData.officePropIndices?.[index] ?? -1;
      const wall = batch.userData.officeWallIndices?.[index] ?? -1;
      if (prop >= 0) renderedProps[prop].union(bounds);
      if (wall >= 0) renderedWalls[wall].union(bounds);
      if (bounds.min.x <= OFFICE_FLOOR.x - OFFICE_FLOOR.width / 2 + 1e-6
        && bounds.max.x >= OFFICE_FLOOR.x + OFFICE_FLOOR.width / 2 - 1e-6
        && bounds.min.z <= OFFICE_FLOOR.z - OFFICE_FLOOR.depth / 2 + 1e-6
        && bounds.max.z >= OFFICE_FLOOR.z + OFFICE_FLOOR.depth / 2 - 1e-6
        && Math.abs(bounds.max.y) < 1e-6) continuousFloor = true;
    }
  }
  assert.ok(continuousFloor, 'one actual rendered floor supports the complete office at walking height');
  for (const [items, bounds] of [[OFFICE_PROPS, renderedProps], [OFFICE_PERIMETER_WALLS, renderedWalls]]) {
    items.forEach((item, index) => {
      const rendered = bounds[index];
      assert.ok(!rendered.isEmpty(), `${item.id} has visible 3D geometry`);
      for (const [axis, half] of [['x', 'halfX'], ['z', 'halfZ']]) {
        assert.ok(rendered.min[axis] >= item[axis] - item[half] - 1e-6, `${item.id} ${axis} minimum stays solid`);
        assert.ok(rendered.max[axis] <= item[axis] + item[half] + 1e-6, `${item.id} ${axis} maximum stays solid`);
        assert.ok(rendered.max[axis] - rendered.min[axis] >= item[half] * 1.8, `${item.id} is a full-size rendered furnishing or wall`);
      }
      assert.ok(rendered.min.y >= -1e-6 && rendered.max.y <= item.height + 1e-6, `${item.id} matches the intended vertical envelope`);
    });
  }
});

test('all 47 public chairs and lounge seats retain a collision-free route and natural final transfer from arrival', t => {
  const { bounds } = fixture(t);
  const stations = [
    ...GARDEN_WORKSPACES.map((workspace, stationIndex) => ({
      job: jobs[stationIndex], seat: { x: workspace.x, z: workspace.z + 1.5 }, rotation: Math.PI, stationIndex,
    })),
    ...[...SOCIAL_SEATS.filter(seat => !seat.occupiedBy), ...FURNITURE_SEATS].map(seat => ({
      job: { ...seat, kind: 'lounge', seatType: seat.kind }, seat, rotation: seat.rotation,
      colliderId: seat.colliderId, approach: seat.approach, exit: seat.exit,
    })),
  ];
  assert.deepEqual(stations.map(station => station.job.id).sort(), [...SEAT_IDS].sort());
  for (const station of stations) {
    const own = bounds.find(bound => station.colliderId ? bound.id === station.colliderId
      : bound.kind === 'applicant-chair' && bound.stationIndex === station.stationIndex);
    assert.ok(own, `${station.job.id} retains a physical furnishing`);
    const turn = station.job.seatType === 'beanbag' ? 0 : .36;
    const wide = { ...own, halfX: own.halfX + turn, halfZ: own.halfZ + turn };
    const transfer = getSeatTransitionBounds(station, bounds);
    const routing = [...bounds.filter(bound => bound !== own), wide,
      ...transfer.filter(bound => bound.id?.startsWith('seat-structure:'))];
    const isBlocked = (x, z) => routing.some(bound => contains(bound, { x, z }));
    const errors = [];
    let accessible = false;
    for (const entrance of seatEntryGates(station, wide)) {
      let previous = entrance.gate, problem = null;
      for (const next of entrance.via) {
        const move = moveSeatTransfer(previous, next, station, transfer, [], { fromRotation: station.rotation, toRotation: station.rotation });
        if (move.blocked) { problem = move.obstacle?.id ?? move.obstacle?.kind; break; }
        previous = next;
      }
      const lower = moveSeatTransfer(entrance.stage, station.seat, station, transfer, [], {
        fromRotation: station.rotation, toRotation: station.rotation, fromSlide: .29, toSlide: 0,
      });
      if (problem || lower.blocked) { errors.push(problem ?? lower.obstacle?.id ?? lower.obstacle?.kind); continue; }
      const route = findWalkRoute(GARDEN_SPAWN, entrance.gate, { isBlocked, obstacles: routing })
        ?? findWalkRoute(GARDEN_SPAWN, entrance.gate, { isBlocked, obstacles: routing, step: .2 });
      if (route === null) { errors.push('unreachable gate'); continue; }
      previous = GARDEN_SPAWN;
      for (const next of [...route, entrance.gate]) {
        assert.ok(inFloor(next, .32), `${station.job.id} never routes outside the building`);
        assert.ok(routing.every(bound => segmentObstacleEntry(previous, next, bound) === null), `${station.job.id} route stays clear of all furniture and walls`);
        previous = next;
      }
      accessible = true;
      break;
    }
    assert.ok(accessible, `${station.job.id} remains reachable and can sit without crossing objects: ${errors.join(', ')}`);
  }
});

test('all 19 background characters remain inside the office and clear of new fixtures throughout their shared cycle', () => {
  const additions = inflateObstacles(GARDEN_COLLIDERS.filter(bound => OFFICE_PROPS.some(prop => prop.id === bound.id)
    || OFFICE_PERIMETER_WALLS.some(wall => wall.id === bound.id)));
  const ids = new Set();
  for (let clock = 0; clock <= 24_000; clock += 250) {
    const bots = [...getBots(clock, jobs), ...getSocialBots(clock)];
    assert.equal(bots.length, 19, 'the office conversion preserves every background visitor');
    assert.equal(new Set(bots.map(bot => bot.id)).size, 19);
    for (const bot of bots) {
      ids.add(bot.id);
      assert.ok(inFloor(bot, .6), `${bot.id} stays on the office floor at ${clock}ms`);
      assert.ok(additions.every(bound => !contains(bound, bot)), `${bot.id} does not walk through a new office fixture at ${clock}ms`);
    }
  }
  assert.equal(ids.size, 19);
});
