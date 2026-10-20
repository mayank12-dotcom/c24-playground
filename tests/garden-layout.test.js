import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GARDEN_SPAWN, GARDEN_WORKSPACES, GARDEN_ROOMS, GARDEN_DOORWAYS, GARDEN_PATHS, GARDEN_RAILINGS,
  GARDEN_PROPS, GARDEN_TREES, GARDEN_COLLIDERS, GARDEN_LAWNS, GARDEN_JUNCTIONS,
  GARDEN_PATH_CURVES, GARDEN_TERRACES, GARDEN_PLANTING_ISLANDS, GARDEN_RUGS,
  GARDEN_WALLS, GARDEN_WALL_THICKNESS, GARDEN_WALL_HEIGHTS, isGardenBlocked,
  OFFICE_FLOOR,
} from '../src/garden-layout.js';
import { getStationColliders, SEAT_APPROACH_OFFSET } from '../src/station-layout.js';

const contains = (rectangle, point) => Math.abs(point.x - rectangle.x) <= rectangle.width / 2 + .00001
  && Math.abs(point.z - rectangle.z) <= rectangle.length / 2 + .00001;

test('a stable varied campus shares nine jobs and includes spacious desk-free rooms', () => {
  const workRooms = GARDEN_ROOMS.filter(room => room.kind === 'workspace');
  assert.equal(workRooms.length, 5);
  assert.equal(GARDEN_ROOMS.filter(room => room.kind === 'social').length, 2);
  assert.equal(GARDEN_ROOMS.filter(room => room.kind === 'information').length, 1);
  assert.deepEqual(GARDEN_WORKSPACES.map(({ x, z }) => [x, z]), [
    [0, -3], [-13, -3], [13, -3], [-13, -17], [0, -17], [13, -17], [-13, -31], [0, -31], [13, -31],
  ]);
  assert.ok(new Set(GARDEN_ROOMS.map(room => room.width)).size >= 6, 'quiet rooms, studios, social rooms, and a wider lab have different proportions');
  assert.ok(new Set(GARDEN_ROOMS.map(room => room.depth)).size >= 4);
  assert.ok(workRooms.every(room => room.depth >= 9));
  assert.ok(workRooms.reduce((area, room) => area + room.width * room.depth, 0) > 950, 'job rooms gain meaningful open floor area');
  assert.ok(GARDEN_ROOMS.filter(room => room.kind !== 'workspace').every(room => room.workspaceIndices.length === 0));
  assert.deepEqual(GARDEN_ROOMS.flatMap(room => room.workspaceIndices).sort((a, b) => a - b), GARDEN_WORKSPACES.map(workspace => workspace.index));
  for (const room of GARDEN_ROOMS) {
    for (const workspaceIndex of room.workspaceIndices) {
      const workspace = GARDEN_WORKSPACES[workspaceIndex];
      assert.equal(workspace.roomId, room.id);
      assert.ok(Math.abs(workspace.x - room.x) + workspace.width / 2 <= room.width / 2);
      assert.ok(Math.abs(workspace.z - room.z) + workspace.depth / 2 <= room.depth / 2);
    }
    for (const rail of GARDEN_RAILINGS.filter(rail => rail.roomId === room.id)) {
      assert.ok(Math.abs(rail.x - room.x) === room.width / 2 || Math.abs(rail.z - room.z) === room.depth / 2, 'rails only follow the outer room edges');
    }
  }
  assert.equal(isGardenBlocked(-4, -3), false, 'the studio has no old partition beside its central desk');
  assert.equal(isGardenBlocked(4, -17), false, 'the lab has no old partition between desks');
  assert.equal(isGardenBlocked(4, -31), false, 'the loft shares one continuous floor');
});

test('garden paths connect the arrival point and all nine front desk entrances', () => {
  assert.equal(GARDEN_WORKSPACES.length, 9);
  const overlaps = (a, b) => Math.abs(a.x - b.x) <= (a.width + b.width) / 2
    && Math.abs(a.z - b.z) <= (a.length + b.length) / 2;
  const first = GARDEN_PATHS.findIndex(path => contains(path, GARDEN_SPAWN));
  assert.ok(first >= 0, 'arrival point is on a path');
  const connected = new Set([first]), pending = [first];
  for (let index = 0; index < pending.length; index++) {
    GARDEN_PATHS.forEach((path, other) => {
      if (!connected.has(other) && overlaps(GARDEN_PATHS[pending[index]], path)) {
        connected.add(other); pending.push(other);
      }
    });
  }
  assert.equal(connected.size, GARDEN_PATHS.length, 'the entire path network is connected');
  for (const workspace of GARDEN_WORKSPACES) {
    const room = GARDEN_ROOMS.find(room => room.id === workspace.roomId);
    const entrance = { x: workspace.x, z: room.z + room.depth / 2 };
    assert.ok(GARDEN_PATHS.some(path => contains(path, entrance)), `workspace ${workspace.index} has a path to its entrance`);
  }
  for (const room of GARDEN_ROOMS.filter(room => room.kind !== 'workspace')) {
    const doorway = GARDEN_DOORWAYS.find(door => door.roomId === room.id);
    assert.ok(GARDEN_PATHS.some(path => contains(path, doorway)), `${room.name} joins the same path network`);
  }
});

test('eight enclosed rooms have solid partition edges and wide physical doorway gaps', () => {
  assert.deepEqual(GARDEN_RAILINGS, []);
  assert.equal(GARDEN_COLLIDERS.some(item => item.kind === 'railing'), false);
  for (const room of GARDEN_ROOMS) {
    const walls = GARDEN_WALLS.filter(wall => wall.roomId === room.id);
    assert.ok(walls.length >= 4, `${room.id} has four finished room edges`);
    assert.deepEqual([...new Set(walls.map(wall => wall.side))].sort(), ['back', 'front', 'left', 'right']);
    for (const wall of walls) {
      assert.equal(wall.height, GARDEN_WALL_HEIGHTS[wall.side]);
      assert.equal(Math.min(wall.halfX, wall.halfZ), GARDEN_WALL_THICKNESS / 2);
      assert.equal(isGardenBlocked(wall.x, wall.z, .32), true, `${wall.id} is physically solid`);
      assert.ok(GARDEN_COLLIDERS.some(collider => collider.id === wall.id && collider.kind === 'room-wall'
        && collider.halfX === wall.halfX && collider.halfZ === wall.halfZ), 'visible partitions and collision share exact dimensions');
    }
  }
  for (const door of GARDEN_DOORWAYS) for (const across of [-1.2, -.9, 0, .9, 1.2]) for (const through of [-.65, 0, .65]) {
    // The full opening is clear at its threshold. A central two-meter lane
    // continues inside; nearby furnishings can sit beside that lane.
    if (through !== 0 && Math.abs(across) > .9) continue;
    const horizontal = door.side === 'front' || door.side === 'back';
    const x = door.x + (horizontal ? across : through);
    const z = door.z + (horizontal ? through : across);
    assert.equal(isGardenBlocked(x, z, .32), false, `${door.roomId} ${door.side} doorway admits an avatar through both sides`);
  }
});

test('both main garden promenades remain clear through the outdoor work zones', () => {
  for (const x of [-6.5, 6.5]) {
    for (let z = -38; z <= GARDEN_SPAWN.z; z += .05) {
      assert.equal(isGardenBlocked(x, z, .32), false, `the main avenue stays clear at (${x}, ${z})`);
    }
    for (const room of GARDEN_ROOMS.filter(room => room.kind === 'workspace' && Math.abs(room.x - x) < room.width / 2)) {
      for (const side of ['front', 'back']) assert.ok(GARDEN_DOORWAYS.some(door => door.roomId === room.id && door.side === side && door.x === x));
    }
  }
});

test('varied lounge groupings leave every desk, chair, and shared avenue clear', () => {
  const rotatedBounds = prop => {
    const c = Math.abs(Math.cos(prop.rotation)), s = Math.abs(Math.sin(prop.rotation));
    return { halfX: prop.halfX * c + prop.halfZ * s, halfZ: prop.halfZ * c + prop.halfX * s };
  };
  const stations = getStationColliders(GARDEN_WORKSPACES.map(({ x, z }) => [x, z]));
  assert.ok(GARDEN_PROPS.length < 40, 'living-room groupings remain sparse across the five work zones');
  for (const room of GARDEN_ROOMS.filter(room => room.kind === 'workspace')) {
    const props = GARDEN_PROPS.filter(item => item.roomId === room.id);
    assert.ok(props.some(item => item.kind === 'plant'));
    assert.ok(props.some(item => item.kind === 'sofa'), `${room.id} has upholstered living-room seating`);
    assert.ok(props.some(item => item.kind === 'armchair' || item.kind === 'ottoman'), `${room.id} has a second softer furniture shape`);
    assert.ok(props.some(item => item.kind === 'coffee-table'));
    assert.ok(props.some(item => item.kind === 'lamp'));
    assert.equal(props.some(item => item.kind === 'whiteboard'), false, 'office boards no longer define the lounge rooms');
    for (const prop of props) {
      const bounds = rotatedBounds(prop);
      assert.ok(Math.abs(prop.x - room.x) + bounds.halfX < room.width / 2 - .05);
      assert.ok(Math.abs(prop.z - room.z) + bounds.halfZ < room.depth / 2 - .05);
      for (const station of stations) assert.ok(Math.abs(prop.x - station.x) > bounds.halfX + station.halfX + .32
        || Math.abs(prop.z - station.z) > bounds.halfZ + station.halfZ + .32, `${room.id} furniture leaves the station footprint clear`);
    }
  }
  for (const workspace of GARDEN_WORKSPACES) assert.equal(isGardenBlocked(workspace.x, workspace.z + 1.5, .32), false);
  for (const room of GARDEN_ROOMS.filter(room => room.kind !== 'workspace')) {
    assert.equal(GARDEN_PROPS.some(item => item.roomId === room.id), false, 'special rooms receive furnishings from their own shared plan');
  }
  const sofa = GARDEN_COLLIDERS.find(item => item.kind === 'sofa' && Math.abs(item.halfX - .51) < 1e-9);
  assert.ok(Math.abs(sofa.halfX - .51) < 1e-9);
  assert.ok(Math.abs(sofa.halfZ - 1.125) < 1e-9);
});

test('a walking avatar reaches all nine chairs and every new room entrance', () => {
  const margin = .32, step = .4;
  const stations = getStationColliders(GARDEN_WORKSPACES.map(({ x, z }) => [x, z]));
  const blocked = (x, z) => isGardenBlocked(x, z, margin) || stations.some(object =>
    Math.abs(x - object.x) < object.halfX + margin && Math.abs(z - object.z) < object.halfZ + margin);
  const clear = (a, b) => {
    for (let fraction = 0; fraction <= 1.00001; fraction += .25) {
      if (blocked(a.x + (b.x - a.x) * fraction, a.z + (b.z - a.z) * fraction)) return false;
    }
    return true;
  };
  const key = (x, z) => `${x},${z}`;
  const point = (x, z) => ({ x: GARDEN_SPAWN.x + x * step, z: GARDEN_SPAWN.z + z * step });
  const seen = new Set([key(0, 0)]), queue = [[0, 0]];
  const reached = new Set();
  const goals = [
    ...GARDEN_WORKSPACES.map(workspace => ({ x: workspace.x, z: workspace.z + 1.5 + SEAT_APPROACH_OFFSET, index: workspace.index })),
    ...GARDEN_ROOMS.filter(room => room.kind !== 'workspace').map((room, index) => {
      const door = GARDEN_DOORWAYS.find(door => door.roomId === room.id);
      return { x: door.x, z: door.z + (door.side === 'front' ? -.65 : .65), index: 9 + index };
    }),
  ];
  for (let head = 0; head < queue.length; head++) {
    const [gridX, gridZ] = queue[head], from = point(gridX, gridZ);
    for (const goal of goals) {
      // The nearest grid point can sit inside the chair footprint. A clear
      // connection from an adjacent cell still reaches the exact approach.
      if (Math.hypot(from.x - goal.x, from.z - goal.z) <= step * Math.SQRT2 && clear(from, goal)) reached.add(goal.index);
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = gridX + dx, nz = gridZ + dz, id = key(nx, nz), to = point(nx, nz);
      if (seen.has(id) || to.x < -38 || to.x > 38 || to.z < -43 || to.z > 32 || !clear(from, to)) continue;
      seen.add(id); queue.push([nx, nz]);
    }
  }
  assert.deepEqual([...reached].sort((a, b) => a - b), goals.map(goal => goal.index), 'job approaches, social rooms, and the gallery are reachable from arrival');
});

test('scenery stays bounded and tree roots do not obstruct the paths', () => {
  assert.ok(GARDEN_COLLIDERS.length < 150, 'the static collision plan stays small');
  assert.ok(GARDEN_TREES.length < 24, 'the garden uses scattered trees rather than a dense forest');
  for (const collider of GARDEN_COLLIDERS) {
    for (const field of ['x', 'z', 'halfX', 'halfZ']) assert.ok(Number.isFinite(collider[field]));
    assert.ok(collider.halfX > 0 && collider.halfZ > 0);
  }
  for (const tree of GARDEN_TREES) {
    assert.ok(!GARDEN_PATHS.some(path => contains({ ...path, width: path.width + 1.32 * tree.scale, length: path.length + 1.32 * tree.scale }, tree)));
  }
});


test('one indoor office floor connects every department and clear hallway junction', () => {
  assert.equal(GARDEN_LAWNS.length, 0, 'outdoor lawns no longer separate the office departments');
  assert.equal(GARDEN_PLANTING_ISLANDS.length, 0);
  assert.equal(GARDEN_TREES.length, 0);
  assert.ok(OFFICE_FLOOR.width >= 80 && OFFICE_FLOOR.depth >= 78);
  for (const room of GARDEN_ROOMS) {
    assert.ok(Math.abs(room.x - OFFICE_FLOOR.x) + room.width / 2 < OFFICE_FLOOR.width / 2, `${room.name} fits inside the shared office floor`);
    assert.ok(Math.abs(room.z - OFFICE_FLOOR.z) + room.depth / 2 < OFFICE_FLOOR.depth / 2, `${room.name} fits inside the shared office floor`);
  }
  assert.ok(GARDEN_JUNCTIONS.some(junction => junction.x === GARDEN_SPAWN.x && junction.z === GARDEN_SPAWN.z));
  for (const junction of GARDEN_JUNCTIONS) assert.equal(isGardenBlocked(junction.x, junction.z, .32), false);
});


test('rectangular room floors and straight hall guides form a coherent office plan', () => {
  assert.equal(GARDEN_PATH_CURVES.length, GARDEN_PATHS.length);
  assert.equal(GARDEN_TERRACES.length, GARDEN_ROOMS.length);
  for (const [index, curve] of GARDEN_PATH_CURVES.entries()) {
    const guide = GARDEN_PATHS[index];
    assert.equal(curve.width, guide.direction === 'horizontal' ? guide.length : guide.width, 'hall floor width matches its stable walking guide');
    assert.ok(curve.points.flat().every(Number.isFinite));
    const bends = curve.points.some(([x, z]) => guide.direction === 'horizontal' ? Math.abs(z - guide.z) > .01 : Math.abs(x - guide.x) > .01);
    assert.equal(bends, false, 'rectilinear halls align with room entrances');
  }
  for (const zone of GARDEN_ROOMS) {
    const patio = GARDEN_TERRACES.find(item => item.roomId === zone.id);
    assert.equal(patio.x, zone.x); assert.equal(patio.z, zone.z);
    assert.equal(patio.width, zone.width); assert.equal(patio.depth, zone.depth);
    assert.equal(patio.rotation, 0); assert.equal(patio.shape, 'rectangle');
  }
  for (const island of GARDEN_PLANTING_ISLANDS) {
    assert.equal(isGardenBlocked(island.x, island.z), true, 'planted beds remain physical garden objects');
    assert.ok(GARDEN_COLLIDERS.some(item => item.kind === 'planting' && item.x === island.x && item.z === island.z));
  }
});

test('every bot chair has a clear +X tumble landing and a clear applicant waiting spot', () => {
  for (const index of [2, 5, 8]) {
    const seat = GARDEN_WORKSPACES[index];
    const seatZ = seat.z + 1.5;
    for (let dx = .2; dx <= 2.8; dx += .05) for (let dz = -.65; dz <= .9; dz += .05) {
      assert.equal(isGardenBlocked(seat.x + dx, seatZ + dz, .32), false, `workspace ${index} tumble avoids garden furniture`);
    }
    assert.equal(isGardenBlocked(seat.x - 1.2, seatZ, .4), false, 'the applicant can wait to the left of the chair');
  }
});


test('flat woven lounge rugs organize furniture without adding walking barriers', () => {
  const workRooms = GARDEN_ROOMS.filter(room => room.kind === 'workspace');
  for (const workspace of GARDEN_WORKSPACES) {
    const rug = GARDEN_RUGS.find(item => item.kind === 'interview' && item.x === workspace.x && Math.abs(item.z - workspace.z - .1) < 1e-7);
    assert.ok(rug, `workspace ${workspace.index} has a welcoming upholstered-chair rug`);
    for (const station of getStationColliders([[workspace.x, workspace.z]])) {
      assert.ok(Math.abs(station.x - rug.x) + station.halfX < rug.width / 2);
      assert.ok(Math.abs(station.z - rug.z) + station.halfZ < rug.depth / 2);
    }
  }
  for (const room of workRooms) {
    const rug = GARDEN_RUGS.find(item => item.kind === 'lounge' && item.roomId === room.id);
    assert.ok(rug, `${room.id} has its own lounge vignette floor`);
    const sofa = GARDEN_PROPS.find(item => item.kind === 'sofa' && item.roomId === room.id);
    const table = GARDEN_PROPS.find(item => item.kind === 'coffee-table' && item.roomId === room.id);
    // A usable front lane needs more space than the old purely decorative
    // grouping. Keep the sofa on its rug and the low table within arm's reach
    // of that same lounge area without extending rugs into interview aisles.
    assert.ok(Math.hypot(sofa.x - table.x, sofa.z - table.z) < 2.6, 'sofa and low table stay in one compact lounge grouping');
    assert.ok(Math.abs(sofa.x - rug.x) < rug.width / 2 && Math.abs(sofa.z - rug.z) < rug.depth / 2);
    const tableBeyondRug = Math.hypot(Math.max(0, Math.abs(table.x - rug.x) - rug.width / 2),
      Math.max(0, Math.abs(table.z - rug.z) - rug.depth / 2));
    assert.ok(tableBeyondRug <= 1, 'the low table remains beside its lounge rug while keeping the sitting lane clear');
  }
  for (let index = 0; index < GARDEN_RUGS.length; index++) {
    const a = GARDEN_RUGS[index];
    const bounds = rug => ({
      x: Math.abs(Math.cos(rug.rotation)) * rug.width / 2 + Math.abs(Math.sin(rug.rotation)) * rug.depth / 2,
      z: Math.abs(Math.cos(rug.rotation)) * rug.depth / 2 + Math.abs(Math.sin(rug.rotation)) * rug.width / 2,
    });
    const aBounds = bounds(a);
    for (const b of GARDEN_RUGS.slice(index + 1)) {
      const bBounds = bounds(b);
      assert.ok(Math.abs(a.x - b.x) > aBounds.x + bBounds.x || Math.abs(a.z - b.z) > aBounds.z + bBounds.z,
        `${a.roomId} floor rugs cannot overlap at the same depth and flicker`);
    }
  }
  assert.equal(GARDEN_COLLIDERS.some(item => item.kind === 'rug'), false, 'rugs stay flat and are traversable');
});
