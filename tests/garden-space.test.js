import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGardenSpace } from '../src/garden-space.js';
import { GARDEN_COLLIDERS, GARDEN_TERRACES, GARDEN_RUGS, GARDEN_PROPS, GARDEN_WALLS, GARDEN_PATHS } from '../src/garden-layout.js';
import { FURNITURE_SEATS } from '../src/furniture-seats.js';
import { createCharacterFactory } from '../src/character.js';
import { animateCharacter } from '../src/character-motion.js';

function gardenFurnitureFixture() {
  const scene = new THREE.Scene(), allResources = new Set();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const garden = createGardenSpace({ scene, box, allResources });
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const solids = new Map(), matrix = new THREE.Matrix4();
  // Raycast the actual instanced geometry, preserving every furniture rotation.
  // A proxy per instance lets a seat test its own back, cushions, arms and legs
  // without treating the entire shared batch as one piece of furniture.
  for (const batch of scene.getObjectByName('open-garden').children) {
    if (batch.material.side === THREE.BackSide) continue;
    for (let instance = 0; instance < batch.count; instance++) {
      const index = batch.userData.propIndices[instance];
      if (index < 0) continue;
      batch.getMatrixAt(instance, matrix);
      const mesh = new THREE.Mesh(batch.geometry, material);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(matrix); mesh.matrixWorld.copy(matrix);
      const parts = solids.get(GARDEN_PROPS[index].id) || [];
      parts.push({ mesh, bounds: new THREE.Box3().setFromObject(mesh, true) });
      solids.set(GARDEN_PROPS[index].id, parts);
    }
  }
  return { scene, solids, dispose() {
    garden.dispose(); material.dispose(); box.dispose();
    allResources.forEach(resource => resource.dispose());
  } };
}

test('the whole garden stays within a small static draw-call budget', () => {
  const scene = new THREE.Scene(), allResources = new Set();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const garden = createGardenSpace({ scene, box, allResources });
  const root = scene.getObjectByName('open-garden');
  assert.ok(root);
  assert.ok(root.children.length < 50, `garden uses ${root.children.length} batches`);
  assert.ok(root.userData.instanceCount > 800 && root.userData.instanceCount < 1400, 'solid rooms, light lounge details and woven rugs stay batched within the static geometry budget');
  const floors = [], halls = [];
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
  const rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  for (const mesh of root.children) {
    assert.ok(mesh.isInstancedMesh, 'all static garden parts share batches');
    assert.ok(Array.from(mesh.instanceMatrix.array).every(Number.isFinite));
    assert.ok(allResources.has(mesh.material));
    assert.ok(mesh.geometry === box || allResources.has(mesh.geometry));
    assert.notEqual(mesh.geometry.type, 'BufferGeometry', 'corridors have straight rectangular joins rather than curved gravel ribbons');
    for (let index = 0; index < mesh.count; index++) {
      mesh.getMatrixAt(index, matrix); matrix.decompose(position, rotation, scale);
      const roomId = mesh.userData.roomIds[index];
      if (roomId) {
        assert.equal(mesh.geometry, box, 'room floors share rectangular box geometry');
        assert.ok(Math.abs(position.y + scale.y / 2 - .015) < .00001, 'room floors remain flush with the original walking surface');
        assert.ok(Math.abs(rotation.y) < .00001, 'room floors follow the orthogonal floor plan');
        floors.push({ roomId, x: position.x, z: position.z, width: scale.x, depth: scale.z });
      }
      const hallIndex = mesh.userData.hallIndices[index];
      if (hallIndex >= 0) {
        assert.equal(mesh.geometry, box);
        const hall = GARDEN_PATHS[hallIndex];
        assert.ok(Math.abs(position.x - hall.x) < .00001 && Math.abs(position.z - hall.z) < .00001);
        assert.ok(Math.abs(scale.x - hall.width) < .00001 && Math.abs(scale.z - hall.length) < .00001,
          'visible corridors match the shared straight hallway plan');
        halls.push(hallIndex);
      }
    }
  }
  assert.equal(halls.length, GARDEN_PATHS.length, 'every connecting hall has one visible floor');
  assert.equal(floors.length, GARDEN_TERRACES.length, 'every room has a flush rectangular floor');
  for (const terrace of GARDEN_TERRACES) assert.ok(floors.some(floor =>
    floor.roomId === terrace.roomId && Math.abs(floor.x - terrace.x) < .00001 && Math.abs(floor.z - terrace.z) < .00001 &&
    Math.abs(floor.width - terrace.width) < .00001 && Math.abs(floor.depth - terrace.depth) < .00001
  ), `${terrace.roomId} has its own exact rectangular floor footprint`);
  assert.equal(garden.colliders, GARDEN_COLLIDERS);
  garden.dispose();
  assert.equal(scene.children.length, 0);
  allResources.forEach(resource => resource.dispose()); box.dispose();
});

test('solid cutaway walls match their collision segments without filling the doorways', () => {
  const scene = new THREE.Scene(), allResources = new Set();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const garden = createGardenSpace({ scene, box, allResources });
  const root = scene.getObjectByName('open-garden');
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  const rendered = new Map();
  for (const mesh of root.children) {
    const vertices = mesh.geometry.getAttribute('position');
    for (let instance = 0; instance < mesh.count; instance++) {
      const wallIndex = mesh.userData.wallIndices[instance];
      if (wallIndex < 0) continue;
      const wall = GARDEN_WALLS[wallIndex];
      assert.ok(GARDEN_COLLIDERS.some(bounds => bounds.id === wall.id && bounds.kind === 'room-wall'),
        `${wall.id} has a matching solid walking collider`);
      assert.equal(mesh.geometry, box, 'walls are solid panels rather than railings');
      mesh.getMatrixAt(instance, matrix);
      let minimumY = Infinity, maximumY = -Infinity;
      for (let vertex = 0; vertex < vertices.count; vertex++) {
        point.fromBufferAttribute(vertices, vertex).applyMatrix4(matrix);
        assert.ok(Math.abs(point.x - wall.x) <= wall.halfX + .00001 && Math.abs(point.z - wall.z) <= wall.halfZ + .00001,
          `${wall.id} visible structure stays within its exact collision footprint`);
        assert.ok(point.y >= -.00001 && point.y <= wall.height + .00001, 'the low cutaway wall has no overhanging roof');
        minimumY = Math.min(minimumY, point.y); maximumY = Math.max(maximumY, point.y);
      }
      const layers = rendered.get(wallIndex) || [];
      layers.push([minimumY, maximumY]); rendered.set(wallIndex, layers);
    }
  }
  assert.equal(rendered.size, GARDEN_WALLS.length, 'every physical wall is visibly rendered');
  for (const [index, layers] of rendered) {
    layers.sort((a, b) => a[0] - b[0]);
    assert.equal(layers.length, 3, 'each wall has a baseboard, plaster panel and colored cap');
    assert.ok(Math.abs(layers[0][0]) < .00001 && Math.abs(layers.at(-1)[1] - GARDEN_WALLS[index].height) < .00001);
    for (let layer = 1; layer < layers.length; layer++) assert.ok(Math.abs(layers[layer][0] - layers[layer - 1][1]) < .00001,
      'the solid wall layers meet without a visual gap or overlapping faces');
  }
  garden.dispose(); allResources.forEach(resource => resource.dispose()); box.dispose();
});

test('removing the garden leaves shared resource disposal to the world', () => {
  const scene = new THREE.Scene(), allResources = new Set();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const garden = createGardenSpace({ scene, box, allResources });
  let disposed = 0;
  for (const resource of allResources) resource.addEventListener('dispose', () => disposed++);
  garden.dispose();
  garden.dispose();
  assert.equal(disposed, 0);
  allResources.forEach(resource => resource.dispose());
  assert.equal(disposed, allResources.size);
  box.dispose();
});


test('every lounge furniture instance fits inside its solid collision footprint', () => {
  const scene = new THREE.Scene(), allResources = new Set();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const garden = createGardenSpace({ scene, box, allResources });
  const root = scene.getObjectByName('open-garden');
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  const propsRendered = new Set();
  let rugLayers = 0;
  for (const mesh of root.children) {
    const vertices = mesh.geometry.getAttribute('position');
    for (let instance = 0; instance < mesh.count; instance++) {
      mesh.getMatrixAt(instance, matrix);
      const propIndex = mesh.userData.propIndices[instance];
      if (propIndex < 0) {
        const y = matrix.elements[13];
        if (Math.abs(y - .022) < .00001 || Math.abs(y - .027) < .00001) rugLayers++;
        continue;
      }
      propsRendered.add(propIndex);
      const prop = GARDEN_PROPS[propIndex];
      const bounds = GARDEN_COLLIDERS[propIndex];
      for (let vertex = 0; vertex < vertices.count; vertex++) {
        point.fromBufferAttribute(vertices, vertex).applyMatrix4(matrix);
        assert.ok(Math.abs(point.x - bounds.x) <= bounds.halfX + .00001, `${prop.roomId} ${prop.kind} visual width remains solid`);
        assert.ok(Math.abs(point.z - bounds.z) <= bounds.halfZ + .00001, `${prop.roomId} ${prop.kind} visual depth remains solid`);
      }
    }
  }
  assert.equal(propsRendered.size, GARDEN_PROPS.length, 'every planned solid prop has visible furniture');
  assert.equal(rugLayers, GARDEN_RUGS.length * 2, 'every rug has two thin batched floor layers');
  garden.dispose();
  allResources.forEach(resource => resource.dispose()); box.dispose();
});

test('every garden sofa cushion, armchair and ottoman supports the shared seated pelvis at .30', () => {
  const fixture = gardenFurnitureFixture();
  const seats = FURNITURE_SEATS.filter(seat => seat.source === 'garden');
  try {
    for (const seat of seats) {
      // Perching leaves the feet beyond the front lip, with the rear pelvis
      // resting on upholstery rather than floating over its cushion.
      const support = new THREE.Vector3(seat.x - Math.sin(seat.rotation) * .18, .5,
        seat.z - Math.cos(seat.rotation) * .18);
      const ray = new THREE.Raycaster(support, new THREE.Vector3(0, -1, 0));
      const parts = fixture.solids.get(seat.colliderId);
      assert.ok(parts?.length > 0, `${seat.id} has visible furniture`);
      const hits = ray.intersectObjects(parts.map(part => part.mesh), false);
      assert.ok(hits.length > 0, `${seat.id} has upholstery beneath its pelvis`);
      assert.ok(Math.abs(hits[0].point.y - seat.seatHeight) < .012,
        `${seat.id} support meets the articulated seated pose; actual height ${hits[0].point.y}`);
    }
  } finally { fixture.dispose(); }
});

test('garden lounge occupants and their ink silhouettes clear actual furniture solids while chatting', () => {
  const fixture = gardenFurnitureFixture(), factory = createCharacterFactory();
  const character = factory.create(); fixture.scene.add(character);
  const skins = [];
  character.traverse(mesh => { if (mesh.isSkinnedMesh) skins.push(mesh); });
  assert.equal(skins.length, 2, 'both white skin and its black outline are checked');
  const point = new THREE.Vector3(), direction = new THREE.Vector3(1, .417, .239).normalize();
  const ray = new THREE.Raycaster();
  try {
    for (const seat of FURNITURE_SEATS.filter(seat => seat.source === 'garden')) {
      character.position.set(seat.x, 0, seat.z); character.rotation.y = seat.rotation;
      for (const time of [0, .25, .7, 1, 1.6, 2.4, 3.2]) {
        animateCharacter(character, { dt: 1 / 60, time, seated: true, talking: true, lounging: true });
        character.updateMatrixWorld(true);
        for (const skin of skins) {
          const vertices = skin.geometry.attributes.position;
          for (let index = 0; index < vertices.count; index++) {
            skin.getVertexPosition(index, point); point.applyMatrix4(skin.matrixWorld);
            if (skin === character.userData.mesh) assert.ok(point.y >= -.003,
              `${seat.id} keeps its feet above the floor`);
            for (const solid of fixture.solids.get(seat.colliderId)) {
              if (!solid.bounds.containsPoint(point)) continue;
              // A ray from inside a closed part crosses an odd number of its
              // surfaces. Shared triangle edges count as a single crossing.
              ray.set(point, direction);
              let crossings = 0, previous = -Infinity;
              for (const hit of ray.intersectObject(solid.mesh, false)) {
                if (hit.distance - previous <= 1e-5) continue;
                crossings++; previous = hit.distance;
              }
              assert.equal(crossings % 2, 0,
                `${seat.id} ${skin.name} vertex ${index} merges with furniture at ${time}s`);
            }
          }
        }
      }
    }
  } finally { factory.dispose(); fixture.dispose(); }
});
