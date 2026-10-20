import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { INFO_OBJECTS, INFO_ROOM_BOUNDS, createInfoContent, getInfoInteraction } from '../src/info-content.js';
import { createInfoRoom } from '../src/info-room.js';
import { inflateObstacles } from '../src/collision.js';
import { findWalkRoute } from '../src/navigation.js';
import { GARDEN_COLLIDERS, GARDEN_SPAWN, GARDEN_ROOMS } from '../src/garden-layout.js';

function fixture() {
  const scene = new THREE.Scene(), box = new THREE.BoxGeometry(1, 1, 1), allResources = new Set([box]);
  const ink = new THREE.MeshBasicMaterial({ side: THREE.BackSide }); allResources.add(ink);
  const shape = (parent, geometry, material, position, scale, outlined = true) => {
    const part = new THREE.Mesh(geometry, material); part.position.set(...position); part.scale.set(...scale); parent.add(part);
    if (outlined) {
      const edge = new THREE.Mesh(geometry, ink);
      edge.scale.set(...scale.map(value => 1 + .027 / value)); part.add(edge);
    }
    return part;
  };
  const room = createInfoRoom({ scene, shape, box, allResources });
  return { scene, room, allResources, dispose() { room.dispose(); for (const resource of allResources) resource.dispose(); } };
}

test('the Class 24 gallery has five distinct objects, short placeholder content, and a clear entrance aisle', () => {
  assert.equal(INFO_OBJECTS.length, 5);
  assert.equal(new Set(INFO_OBJECTS.map(object => object.id)).size, 5);
  assert.equal(new Set(INFO_OBJECTS.map(object => object.kind)).size, 5);
  for (const object of INFO_OBJECTS) {
    assert.ok(object.title.length > 4 && object.label.length > 4);
    assert.equal(object.sections.length, 1);
    assert.ok(object.sections[0].body.length > 60 && object.sections[0].body.length < 280);
    const c = Math.abs(Math.cos(object.rotation)), s = Math.abs(Math.sin(object.rotation));
    const halfX = object.halfX * c + object.halfZ * s, halfZ = object.halfZ * c + object.halfX * s;
    assert.ok(Math.abs(object.x - INFO_ROOM_BOUNDS.x) + halfX < INFO_ROOM_BOUNDS.width / 2 - .3);
    assert.ok(Math.abs(object.z - INFO_ROOM_BOUNDS.z) + halfZ < INFO_ROOM_BOUNDS.depth / 2 - .1);
    if (object.z < 29) assert.ok(Math.abs(object.x) - halfX > 2, 'perimeter exhibits keep the central circulation aisle clear');
  }
});

test('information content changes independently from physical object positions', () => {
  const modified = createInfoContent({ [INFO_OBJECTS[0].id]: {
    title: 'A new story', x: 900, sections: [{ title: 'Chapter one', body: 'A new paragraph for the gallery.' }],
  } });
  assert.equal(modified[0].title, 'A new story');
  assert.equal(modified[0].x, INFO_OBJECTS[0].x);
  assert.equal(modified[0].sections[0].title, 'Chapter one');
  assert.notEqual(INFO_OBJECTS[0].title, modified[0].title);
  assert.ok(Object.isFrozen(modified[0]) && Object.isFrozen(modified[0].sections[0]));
});

test('only a nearby, finite character position can interact with an exhibit', () => {
  const object = INFO_OBJECTS[0];
  assert.equal(getInfoInteraction(object, { x: object.x, z: object.z + 2.599 }).allowed, true);
  assert.equal(getInfoInteraction(object, { x: object.x, z: object.z + 2.601 }).allowed, false);
  assert.equal(getInfoInteraction(object, { x: 0, z: 4.8 }).allowed, false);
  assert.equal(getInfoInteraction(object, { x: NaN, z: object.z }).allowed, false);
  assert.equal(getInfoInteraction(null, { x: 0, z: 0 }).allowed, false);
  assert.equal(getInfoInteraction(object, null).distance, Infinity);
});

test('the procedural display geometry fits within its solid footprint', () => {
  const f = fixture();
  try {
    assert.equal(f.room.colliders.filter(collider => collider.kind === 'information-object').length, INFO_OBJECTS.length);
    assert.equal(f.room.raycastTargets.length, INFO_OBJECTS.length);
    for (let index = 0; index < INFO_OBJECTS.length; index++) {
      const footprint = f.room.colliders[index], display = f.room.raycastTargets[index];
      const bounds = new THREE.Box3().setFromObject(display, true);
      assert.ok(bounds.min.x >= footprint.x - footprint.halfX - 1e-7, `${display.name} left edge is solid`);
      assert.ok(bounds.max.x <= footprint.x + footprint.halfX + 1e-7, `${display.name} right edge is solid`);
      assert.ok(bounds.min.z >= footprint.z - footprint.halfZ - 1e-7, `${display.name} back edge is solid`);
      assert.ok(bounds.max.z <= footprint.z + footprint.halfZ + 1e-7, `${display.name} front edge is solid`);
    }
    assert.ok(f.allResources.size < 20, 'all objects share a small local geometry and material set');
  } finally { f.dispose(); }
});

test('lounge furniture is solid, keeps the center aisle open, and does not obscure information picking', () => {
  const f = fixture();
  try {
    const furniture = f.room.colliders.filter(collider => collider.kind === 'information-lounge');
    assert.ok(furniture.some(collider => collider.furniture.startsWith('sofa')), 'the gallery has comfortable lounge seating');
    assert.ok(furniture.some(collider => collider.furniture.startsWith('side-table')), 'reading tables accompany the seating');
    for (const footprint of furniture) {
      const display = f.scene.getObjectByName(footprint.id);
      const bounds = new THREE.Box3().setFromObject(display, true);
      assert.ok(bounds.min.x >= footprint.x - footprint.halfX - 1e-7 && bounds.max.x <= footprint.x + footprint.halfX + 1e-7);
      assert.ok(bounds.min.z >= footprint.z - footprint.halfZ - 1e-7 && bounds.max.z <= footprint.z + footprint.halfZ + 1e-7);
      assert.ok(Math.abs(footprint.x) - footprint.halfX > 2, `${display.name} leaves the central approach clear`);
      const ray = new THREE.Raycaster(new THREE.Vector3(footprint.x, 6, footprint.z), new THREE.Vector3(0, -1, 0));
      assert.equal(f.room.pick(ray), null, 'decorative furniture cannot open an information sidebar');
    }
    const inflated = inflateObstacles(furniture);
    for (let z = 21; z <= 28; z += .25) for (const x of [-1.5, 0, 1.5]) {
      assert.ok(!inflated.some(item => Math.abs(x - item.x) < item.halfX && Math.abs(z - item.z) < item.halfZ), 'the entrance and central passage remain unobstructed');
    }
  } finally { f.dispose(); }
});

test('ray picking resolves child meshes to their information metadata and ignores misses', () => {
  const f = fixture();
  try {
    for (const object of INFO_OBJECTS) {
      const raycaster = new THREE.Raycaster(new THREE.Vector3(object.x, 6, object.z), new THREE.Vector3(0, -1, 0));
      assert.equal(f.room.pick(raycaster)?.id, object.id);
    }
    const miss = new THREE.Raycaster(new THREE.Vector3(0, 6, 23), new THREE.Vector3(0, -1, 0));
    assert.equal(f.room.pick(miss), null);
    assert.equal(f.room.pick(null), null);
    assert.equal(f.room.pick({ intersectObjects: () => [{ object: new THREE.Mesh() }] }), null);
  } finally { f.dispose(); }
});

test('each display is reachable from arrival through the real room entrance and railings', () => {
  const f = fixture();
  try {
    const obstacles = inflateObstacles([...GARDEN_COLLIDERS, ...f.room.colliders]);
    const gallery = GARDEN_ROOMS.find(room => room.kind === 'information');
    assert.deepEqual({ x: gallery.x, z: gallery.z, width: gallery.width, depth: gallery.depth }, INFO_ROOM_BOUNDS);
    for (const object of INFO_OBJECTS) {
      const approach = object.kind === 'careers' ? { x: object.x, z: object.z - 2 }
        : { x: object.x + (object.x < 0 ? 2.1 : -2.1), z: object.z };
      const route = findWalkRoute(GARDEN_SPAWN, approach, { obstacles, isBlocked: (x, z) => obstacles.some(obstacle => Math.abs(x - obstacle.x) < obstacle.halfX && Math.abs(z - obstacle.z) < obstacle.halfZ) });
      assert.ok(route !== null, `${object.label} is reachable from arrival through the gallery entrance`);
      assert.equal(getInfoInteraction(object, approach).allowed, true);
      assert.ok(!obstacles.some(obstacle => Math.abs(approach.x - obstacle.x) < obstacle.halfX && Math.abs(approach.z - obstacle.z) < obstacle.halfZ));
    }
  } finally { f.dispose(); }
});

test('disposing an information gallery detaches its interactive geometry', () => {
  const f = fixture();
  assert.equal(f.scene.children.length, 1);
  f.room.dispose(); f.room.dispose();
  assert.equal(f.scene.children.length, 0);
  f.dispose();
});
