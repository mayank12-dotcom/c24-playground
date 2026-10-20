import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { COZY_FURNITURE, TABLE_TENNIS_TABLES, TENNIS_FLIGHT_MS, getTableTennisState } from '../src/lounge-layout.js';
import { createCozySpace } from '../src/cozy-space.js';
import { GARDEN_PATHS, GARDEN_SPAWN, GARDEN_WORKSPACES, isGardenBlocked } from '../src/garden-layout.js';

const epoch = 1_792_340_000_000;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('each shared tennis rally alternates opponents, clears the net, and bounces on the receiving half', () => {
  TABLE_TENNIS_TABLES.forEach((table, index) => {
    const offset = index * 750;
    for (const side of [0, 1]) {
      const start = side * TENNIS_FLIGHT_MS - offset;
      const hit = getTableTennisState(start, index);
      assert.equal(hit.hitter, side);
      assert.equal(hit.players[side].swing, .5, 'the paddle contact matches the start of each flight');
      assert.equal(hit.players[1 - side].swing, 0);
      assert.equal(hit.players[side].x, table.x);
      assert.ok(Math.abs(hit.ball.z - hit.players[side].z) <= .401, 'a bat must meet the ball in front of its player');
      assert.equal(hit.ball.y, table.topY + .13);
      assert.equal(hit.players[0].rotation, 0);
      assert.equal(hit.players[1].rotation, Math.PI);
      const net = getTableTennisState(start + TENNIS_FLIGHT_MS / 2, index);
      assert.equal(net.ball.z, table.z);
      assert.ok(net.ball.y > table.topY + .255, 'the ball must clear the net and its own radius');
      const bounceClock = start + TENNIS_FLIGHT_MS * .77;
      const bounce = getTableTennisState(bounceClock, index).ball;
      assert.ok(Math.abs(bounce.y - table.topY - .035) < 1e-12, 'the ball radius touches the tabletop');
      assert.equal(Math.sign(bounce.z - table.z), side === 0 ? 1 : -1);
      assert.ok(Math.abs(bounce.z - table.z) < table.length / 2);
      assert.ok(getTableTennisState(bounceClock - 1, index).ball.y > bounce.y);
      assert.ok(getTableTennisState(bounceClock + 1, index).ball.y > bounce.y);
      const nextHit = getTableTennisState(start + TENNIS_FLIGHT_MS, index);
      assert.equal(nextHit.hitter, 1 - side);
      assert.equal(nextHit.players[1 - side].swing, .5);
    }
  });
});

test('rallies remain continuous at hits and cycle seams and use the same large shared clock', () => {
  for (let index = 0; index < TABLE_TENNIS_TABLES.length; index++) {
    let last = getTableTennisState(epoch - 1, index);
    for (let tick = 0; tick <= 6000; tick++) {
      const state = getTableTennisState(epoch + tick, index);
      assert.ok(distance(state.ball, last.ball) < .004, 'no teleporting at hits, bounces, or rally repeats');
      state.players.forEach((player, side) => {
        assert.ok(Math.abs(player.x - last.players[side].x) < .001);
        assert.ok(player.swing >= 0 && player.swing <= 1);
      });
      last = state;
    }
    assert.deepEqual(getTableTennisState(epoch, index), getTableTennisState(epoch + 3000, index));
    assert.deepEqual(getTableTennisState(epoch, index), getTableTennisState(epoch, index));
    for (const invalid of [NaN, Infinity, undefined]) {
      const state = getTableTennisState(invalid, index);
      assert.ok(Object.values(state.ball).every(Number.isFinite));
      assert.ok(state.players.every(player => Object.values(player).every(Number.isFinite)));
    }
  }
});

test('cozy furnishings leave the garden start, job chairs and connected paths clear', () => {
  const stations = GARDEN_WORKSPACES.map(({ x, z }) => [x, z]);
  const furniture = [...COZY_FURNITURE, ...TABLE_TENNIS_TABLES.map(table => ({ ...table, halfX: table.width / 2, halfZ: table.length / 2 }))];
  const outside = (object, point, radius) => Math.abs(point.x - object.x) > object.halfX + radius || Math.abs(point.z - object.z) > object.halfZ + radius;
  for (const item of furniture) {
    const c = Math.abs(Math.cos(item.rotation || 0)), s = Math.abs(Math.sin(item.rotation || 0));
    const physical = { ...item, halfX: item.halfX * c + item.halfZ * s, halfZ: item.halfZ * c + item.halfX * s };
    assert.ok(outside(physical, GARDEN_SPAWN, 1.4), 'the starting area remains open');
    for (const [x, z] of stations) {
      assert.ok(outside(physical, { x, z }, 1.6), 'decor must not intersect a working table');
      assert.ok(outside(physical, { x, z: z + 1.5 }, 1), 'all applicant chairs remain accessible');
      assert.ok(outside(physical, { x, z: z - 1.12 }, 1), 'all recruiter chairs remain accessible');
    }
    for (const path of GARDEN_PATHS) {
      const left = path.x - path.width / 2, right = path.x + path.width / 2;
      const top = path.z - path.length / 2, bottom = path.z + path.length / 2;
      assert.ok(physical.x + physical.halfX + .5 < left || physical.x - physical.halfX - .5 > right
        || physical.z + physical.halfZ + .5 < top || physical.z - physical.halfZ - .5 > bottom,
      'decor must leave a clear buffer around the connected garden paths');
    }
  }
  const footprints = COZY_FURNITURE.map(item => {
    const c = Math.abs(Math.cos(item.rotation || 0)), s = Math.abs(Math.sin(item.rotation || 0));
    return { ...item, halfX: item.halfX * c + item.halfZ * s, halfZ: item.halfZ * c + item.halfX * s };
  });
  for (let index = 0; index < footprints.length; index++) {
    const item = footprints[index];
    for (const other of footprints.slice(index + 1)) {
      assert.ok(Math.abs(item.x - other.x) >= item.halfX + other.halfX + .05
        || Math.abs(item.z - other.z) >= item.halfZ + other.halfZ + .05,
      `${item.type} must not overlap another arrival lounge furnishing`);
    }
  }
  for (const { x, z } of GARDEN_WORKSPACES) {
    const cross = Math.min(...GARDEN_PATHS.filter(path => path.width > 20 && path.z > z + 4).map(path => path.z));
    for (let approachZ = z + 1.5; approachZ <= cross; approachZ += .1) {
      assert.equal(isGardenBlocked(x, approachZ, .4), false, 'every applicant chair has a clear route through its gate');
      assert.ok(furniture.every(item => outside(item, { x, z: approachZ }, .4)), 'public furniture must not block a workspace entrance');
    }
  }
});

test('the procedural lounge reuses geometry and moves only its two balls each frame', () => {
  const scene = new THREE.Scene();
  const box = new THREE.BoxGeometry();
  const allResources = new Set([box]);
  const shape = (parent, geometry, material, position, scale) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh); return mesh;
  };
  const lounge = createCozySpace({ scene, box, allResources, shape });
  assert.equal(lounge.colliders.length, COZY_FURNITURE.length + TABLE_TENNIS_TABLES.length);
  assert.ok(lounge.colliders.every(collider => ['x', 'z', 'halfX', 'halfZ'].every(key => Number.isFinite(collider[key])) && collider.halfX > 0 && collider.halfZ > 0));
  assert.deepEqual(lounge.colliders.slice(0, COZY_FURNITURE.length).map(collider => collider.id), COZY_FURNITURE.map(item => item.id),
    'furniture IDs identify the one support cushion its occupant can enter');
  const meshes = [], geometries = new Set(), materials = new Set();
  scene.traverse(object => { if (object.isMesh) { meshes.push(object); geometries.add(object.geometry); materials.add(object.material); } });
  assert.ok(meshes.length > 150 && meshes.length < 300, 'the space contains furniture and tennis detail with a bounded scene cost');
  assert.ok(geometries.size <= 7, 'decor shares a handful of small primitive geometries');
  for (const resource of [...geometries, ...materials]) assert.ok(allResources.has(resource), 'the owner can dispose every allocated GPU resource');
  const beforeResources = allResources.size, beforeMeshCount = meshes.length;
  for (const clock of [0, epoch, epoch + 1155, epoch + 1500, epoch + 3000]) {
    lounge.update(clock);
    TABLE_TENNIS_TABLES.forEach((_, index) => {
      const mesh = scene.getObjectByName(`tennis-ball-${index}`);
      const position = getTableTennisState(clock, index).ball;
      assert.ok(mesh.position.distanceTo(new THREE.Vector3(position.x, position.y, position.z)) < 1e-12);
    });
  }
  assert.equal(allResources.size, beforeResources);
  let afterMeshCount = 0; scene.traverse(object => { if (object.isMesh) afterMeshCount++; });
  assert.equal(afterMeshCount, beforeMeshCount, 'animation must never allocate fresh meshes');
  lounge.dispose();
  assert.equal(scene.children.length, 0);
  allResources.forEach(resource => resource.dispose());
});

test('every outdoor furnishing, tennis post and physical outline stays within its walking obstacle', () => {
  const scene = new THREE.Scene(), box = new THREE.BoxGeometry(), allResources = new Set([box]);
  const ink = new THREE.MeshBasicMaterial({ side: THREE.BackSide }); allResources.add(ink);
  const shape = (parent, geometry, material, position, scale, outlined = true) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh);
    if (outlined) {
      const edge = new THREE.Mesh(geometry, ink);
      edge.scale.set(...scale.map(value => 1 + .027 / value)); mesh.add(edge);
    }
    return mesh;
  };
  const lounge = createCozySpace({ scene, box, allResources, shape });
  try {
    const furnitureIds = new Set(COZY_FURNITURE.map(item => item.id));
    const furnishings = scene.getObjectByName('cozy-lounge').children.filter(group => group.name === 'table-tennis'
      || furnitureIds.has(group.name));
    assert.equal(furnishings.length, lounge.colliders.length);
    furnishings.forEach((group, index) => {
      const bounds = new THREE.Box3().setFromObject(group, true), footprint = lounge.colliders[index];
      for (const axis of ['x', 'z']) {
        const half = footprint[axis === 'x' ? 'halfX' : 'halfZ'];
        assert.ok(bounds.min[axis] >= footprint[axis] - half - 1e-6, `${group.name} ${axis} minimum is solid`);
        assert.ok(bounds.max[axis] <= footprint[axis] + half + 1e-6, `${group.name} ${axis} maximum is solid`);
      }
    });
  } finally { lounge.dispose(); allResources.forEach(resource => resource.dispose()); }
});
