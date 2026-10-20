import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SOCIAL_ROOMS, SOCIAL_SEATS, SOCIAL_COLLIDERS, SOCIAL_FURNITURE } from '../src/social-layout.js';
import { createSocialSpace } from '../src/social-space.js';
import { moveUntilBlocked } from '../src/collision.js';
import { GARDEN_ROOMS, GARDEN_COLLIDERS } from '../src/garden-layout.js';
import { createCharacterFactory } from '../src/character.js';
import { animateCharacter } from '../src/character-motion.js';

const outside = (item, point, margin = .32) => Math.abs(point.x - item.x) >= item.halfX + margin
  || Math.abs(point.z - item.z) >= item.halfZ + margin;

test('desk-free social rooms provide separate shared sofa seats and four usable visitor beanbags', () => {
  assert.equal(SOCIAL_ROOMS.length, 2);
  assert.equal(SOCIAL_SEATS.length, 8);
  assert.equal(new Set(SOCIAL_SEATS.map(seat => seat.id)).size, 8);
  assert.ok(SOCIAL_SEATS.every(seat => seat.id.startsWith('lounge-')));
  assert.equal(SOCIAL_SEATS.filter(seat => seat.occupiedBy).length, 4);
  assert.equal(SOCIAL_SEATS.filter(seat => !seat.occupiedBy).length, 4);
  assert.equal(new Set(SOCIAL_SEATS.filter(seat => seat.occupiedBy).map(seat => seat.occupiedBy)).size, 4);
  for (const room of SOCIAL_ROOMS) {
    const seats = SOCIAL_SEATS.filter(seat => seat.roomId === room.id);
    assert.equal(seats.filter(seat => seat.kind === 'couch').length, 2);
    assert.equal(seats.filter(seat => seat.kind === 'beanbag' && !seat.occupiedBy).length, 2);
    assert.ok(SOCIAL_FURNITURE.filter(item => item.roomId === room.id).every(item => !['table', 'desk', 'laptop'].includes(item.kind)));
    for (const item of SOCIAL_COLLIDERS.filter(item => item.roomId === room.id)) {
      assert.ok(Math.abs(item.x - room.x) + item.halfX < room.width / 2 - .5);
      assert.ok(Math.abs(item.z - room.z) + item.halfZ < room.depth / 2 - .5);
    }
  }
});

test('central door aisles, seat approaches and exits stay clear of social furniture', () => {
  for (let index = 0; index < SOCIAL_COLLIDERS.length; index++) {
    const item = SOCIAL_COLLIDERS[index];
    for (const other of SOCIAL_COLLIDERS.slice(index + 1)) {
      assert.ok(Math.abs(item.x - other.x) >= item.halfX + other.halfX + .05
        || Math.abs(item.z - other.z) >= item.halfZ + other.halfZ + .05,
      `${item.id} must not overlap another lounge furnishing`);
    }
  }
  for (const room of SOCIAL_ROOMS) {
    for (let z = room.z - 1.3; z <= room.z + room.depth / 2 + .1; z += .1) {
      for (const x of [room.x - 1.45, room.x, room.x + 1.45]) {
        assert.ok(SOCIAL_COLLIDERS.every(item => outside(item, { x, z }, .4)), 'the doorway connects to a broad open middle');
      }
    }
  }
  for (const seat of SOCIAL_SEATS) {
    assert.ok(SOCIAL_COLLIDERS.some(item => item.id === seat.colliderId));
    for (const target of [seat.approach, seat.exit]) {
      assert.ok(SOCIAL_COLLIDERS.every(item => outside(item, target, .4)), `${seat.id} must have a reachable approach and exit`);
    }
    assert.equal(seat.seatHeight, .30, 'the upholstery matches the current seated rig');
  }
});

test('social furniture agrees with the campus rooms and stays clear of rails, trees and other room props', () => {
  for (const room of SOCIAL_ROOMS) {
    const campusRoom = GARDEN_ROOMS.find(item => item.id === room.id);
    assert.ok(campusRoom, `${room.id} must exist in the shared campus layout`);
    assert.equal(campusRoom.kind, 'social');
    for (const field of ['x', 'z', 'width', 'depth']) assert.equal(campusRoom[field], room[field]);
    assert.equal(campusRoom.workspaceIndices.length, 0);
  }
  for (const seat of SOCIAL_SEATS) {
    for (const point of [seat, seat.approach, seat.exit]) {
      assert.ok(GARDEN_COLLIDERS.every(item => outside(item, point, .4)), `${seat.id} must clear the shared campus obstacles`);
    }
  }
  for (const item of SOCIAL_COLLIDERS) {
    for (const other of GARDEN_COLLIDERS) {
      assert.ok(Math.abs(item.x - other.x) >= item.halfX + other.halfX + .15
        || Math.abs(item.z - other.z) >= item.halfZ + other.halfZ + .15,
      `${item.id} must not overlap a campus object`);
    }
  }
});

test('a seat owner can enter only its own furnishing while all other pieces remain solid', () => {
  const inflated = SOCIAL_COLLIDERS.map(item => ({ ...item, halfX: item.halfX + .32, halfZ: item.halfZ + .32 }));
  for (const seat of SOCIAL_SEATS) {
    const blocked = moveUntilBlocked(seat.approach, seat, inflated);
    assert.equal(blocked.blocked, true, `${seat.id} furniture must block ordinary walking`);
    const ownerBounds = inflated.filter(item => item.id !== seat.colliderId);
    const allowed = moveUntilBlocked(seat.approach, seat, ownerBounds);
    assert.equal(allowed.blocked, false, `${seat.id} owner can sit without crossing another object`);
    const exit = moveUntilBlocked(seat, seat.exit, ownerBounds);
    assert.equal(exit.blocked, false);
    assert.ok(Math.hypot(allowed.x - seat.x, allowed.z - seat.z) < 1e-9);
  }
});

test('the social renderer shares resources, allocates no animated geometry and disposes its room root', () => {
  const scene = new THREE.Scene(), box = new THREE.BoxGeometry(), allResources = new Set([box]);
  const shape = (parent, geometry, material, position, scale) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh); return mesh;
  };
  const social = createSocialSpace({ scene, box, allResources, shape });
  assert.equal(social.seats, SOCIAL_SEATS);
  assert.equal(social.colliders, SOCIAL_COLLIDERS);
  assert.equal(scene.children.length, 1);
  const geometries = new Set(), materials = new Set(); let meshCount = 0;
  scene.traverse(object => {
    if (!object.isMesh) return;
    meshCount++; geometries.add(object.geometry); materials.add(object.material);
    assert.ok(Array.from(object.geometry.getAttribute('position').array).every(Number.isFinite));
  });
  assert.ok(meshCount > 0 && meshCount < 230, 'the furnished lounges stay below a modest shared-mesh budget');
  assert.ok(geometries.size <= 6);
  for (const resource of [...geometries, ...materials]) assert.ok(allResources.has(resource));
  const before = allResources.size;
  for (const clock of [0, 6000, 1_792_340_000_000]) social.update(clock);
  assert.equal(allResources.size, before);
  social.dispose(); assert.equal(scene.children.length, 0);
  allResources.forEach(resource => resource.dispose());
});

test('sofas, beanbags and leaves fit their solid bounds, with cushions aligned to the shared seated rig', () => {
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
  const social = createSocialSpace({ scene, box, allResources, shape });
  try {
    for (const footprint of social.colliders) {
      const group = scene.getObjectByName(footprint.id), bounds = new THREE.Box3().setFromObject(group, true);
      for (const axis of ['x', 'z']) {
        const half = footprint[axis === 'x' ? 'halfX' : 'halfZ'];
        assert.ok(bounds.min[axis] >= footprint[axis] - half - 1e-6, `${group.name} ${axis} minimum is solid`);
        assert.ok(bounds.max[axis] <= footprint[axis] + half + 1e-6, `${group.name} ${axis} maximum is solid`);
      }
    }
    for (const seat of social.seats) {
      // Perching supports the rear of the pelvis; the root sits just beyond
      // the rounded front lip rather than in the centre of the cushion.
      const support = new THREE.Vector3(seat.x - Math.sin(seat.rotation) * .18, .5,
        seat.z - Math.cos(seat.rotation) * .18);
      const raycaster = new THREE.Raycaster(support, new THREE.Vector3(0, -1, 0));
      const hits = raycaster.intersectObject(scene.getObjectByName(seat.colliderId), true);
      assert.ok(hits.length > 0, `${seat.id} has upholstery beneath the character`);
      assert.ok(Math.abs(hits[0].point.y - seat.seatHeight) < .012, `${seat.id} meets the shared seated rig without floating`);
    }
  } finally { social.dispose(); allResources.forEach(resource => resource.dispose()); }
});

test('the visible seated skin and its ink hull stay outside sofa and beanbag solids while gesturing', () => {
  const scene = new THREE.Scene(), box = new THREE.BoxGeometry(), allResources = new Set([box]);
  const solidMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); allResources.add(solidMaterial);
  const shape = (parent, geometry, material, position, scale) => {
    const mesh = new THREE.Mesh(geometry, solidMaterial);
    mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh); return mesh;
  };
  const social = createSocialSpace({ scene, box, allResources, shape });
  const factory = createCharacterFactory(), character = factory.create(); scene.add(character);
  const skins = [];
  character.traverse(object => { if (object.isSkinnedMesh) skins.push(object); });
  assert.equal(skins.length, 2, 'sample both the white body and its expanded black silhouette');
  const point = new THREE.Vector3(), direction = new THREE.Vector3(1, .417, .239).normalize();
  const raycaster = new THREE.Raycaster();
  try {
    for (const seat of social.seats) {
      character.position.set(seat.x, 0, seat.z); character.rotation.y = seat.rotation;
      const furniture = scene.getObjectByName(seat.colliderId), solids = [];
      furniture.updateWorldMatrix(true, true);
      furniture.traverse(mesh => {
        if (mesh.isMesh) solids.push({ mesh, bounds: new THREE.Box3().setFromObject(mesh, true) });
      });
      for (const time of [0, .25, .7, 1, 1.6, 2.4, 3.2]) {
        animateCharacter(character, { dt: 1 / 60, time, seated: true, talking: true, lounging: true });
        character.updateMatrixWorld(true);
        for (const skin of skins) {
          const vertices = skin.geometry.attributes.position;
          for (let index = 0; index < vertices.count; index++) {
            point.fromBufferAttribute(vertices, index);
            skin.applyBoneTransform(index, point); skin.localToWorld(point);
            if (skin === character.userData.mesh) assert.ok(point.y >= -.003, `${seat.id} keeps its visible feet above the floor`);
            for (const solid of solids) {
              if (!solid.bounds.containsPoint(point)) continue;
              // A closed mesh contains a point when a ray from it crosses an
              // odd number of surfaces. Deduplicate shared triangle edges.
              raycaster.set(point, direction);
              const hits = raycaster.intersectObject(solid.mesh, false);
              let crossings = 0, previous = -Infinity;
              for (const hit of hits) {
                if (hit.distance - previous <= 1e-5) continue;
                crossings++; previous = hit.distance;
              }
              assert.equal(crossings % 2, 0,
                `${seat.id} skin vertex ${index} must not merge into furniture at ${time}s`);
            }
          }
        }
      }
    }
  } finally {
    factory.dispose(); social.dispose(); allResources.forEach(resource => resource.dispose());
  }
});
