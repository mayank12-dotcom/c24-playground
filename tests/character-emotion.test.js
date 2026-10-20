import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createCharacterFactory } from '../src/character.js';
import { createCharacterEmotion } from '../src/character-emotion.js';

function fixture(t, count = 1) {
  const factory = createCharacterFactory();
  const characters = Array.from({ length: count }, () => factory.create());
  const resources = new Set();
  const emotions = [];
  const emotion = character => {
    const expression = createCharacterEmotion(character, { allResources: resources });
    emotions.push(expression);
    return expression;
  };
  t.after(() => { for (const expression of emotions) expression.dispose(); factory.dispose(); });
  return { characters, emotion, resources };
}

test('only decorated fighters have expressions and their white shared skin stays unchanged', t => {
  const { characters: [fighter, bystander], emotion } = fixture(t, 2);
  const skin = fighter.userData.mesh.material;
  const originalColor = skin.color.clone();
  const expression = emotion(fighter);
  expression.update(1);
  assert.equal(expression.root.parent, fighter.userData.rig.head);
  assert.equal(bystander.getObjectByName('fighter-angry-expression'), undefined);
  assert.equal(fighter.userData.mesh.material, bystander.userData.mesh.material);
  assert.ok(skin.color.equals(originalColor));
  assert.equal(fighter.userData.hair, 5);
  assert.equal(fighter.getObjectByName('single-piece-hairstyle'), undefined);
  assert.equal(fighter.userData.rig.head.children.filter(child => child.name === 'minimal-dot-eye').length, 2);
});

test('anger fades independently per fighter and handles reset and invalid values', t => {
  const { characters: [one, two], emotion } = fixture(t, 2);
  const first = emotion(one), second = emotion(two);
  assert.equal(first.root.visible, false);
  first.update(1); second.update(.25);
  const a = first.root.getObjectByName('fighter-head-blush');
  const b = second.root.getObjectByName('fighter-head-blush');
  assert.notEqual(a.material, b.material);
  assert.equal(a.material.opacity, .38);
  assert.equal(b.material.opacity, .095);
  assert.equal(first.root.getObjectByName('fighter-left-angry-brow').material.opacity, .95);
  first.update(-1); assert.equal(first.root.visible, false);
  first.update(2); assert.equal(a.material.opacity, .38);
  first.update(Number.NaN); assert.equal(first.root.visible, false);
  assert.equal(a.material.opacity, 0);
  assert.equal(b.material.opacity, .095);
});

test('the soft blush follows the actual head surface and brows leave the dot eyes visible', t => {
  const { characters: [character], emotion } = fixture(t);
  const expression = emotion(character);
  expression.update(1);
  const blush = expression.root.getObjectByName('fighter-head-blush');
  const geometry = blush.geometry;
  geometry.computeBoundingBox();
  assert.ok(geometry.index.count > 300, 'the tint follows the smooth existing head mesh');
  const bodyTriangles = character.userData.mesh.geometry.index.count / 3;
  assert.ok(geometry.index.count / 3 < 4500 && geometry.index.count / 3 < bodyTriangles / 3,
    'the head-only expression stays below one third of the skin and within its shared geometry budget');
  assert.ok(geometry.boundingBox.min.y > -.18, 'the blush must not spread down the neck or body');
  character.userData.mesh.geometry.computeBoundingBox();
  const headRestHeight = character.userData.rig.rest.hips.position[1]
    + character.userData.rig.rest.torso.position[1] + character.userData.rig.rest.head.position[1];
  assert.ok(geometry.boundingBox.max.y <= character.userData.mesh.geometry.boundingBox.max.y - headRestHeight + .002,
    'the tint remains on the actual head surface');
  assert.equal(blush.material.depthWrite, false);
  assert.equal(blush.material.vertexColors, true);
  assert.ok(geometry.attributes.color.count === geometry.attributes.position.count);
  const colors = geometry.attributes.color, vertices = geometry.attributes.position;
  let lowerBlue = 0, upperBlue = 0, lowerCount = 0, upperCount = 0;
  for (let index = 0; index < vertices.count; index++) {
    assert.ok([vertices.getX(index), vertices.getY(index), vertices.getZ(index)].every(Number.isFinite));
    if (vertices.getY(index) < -.09) { lowerBlue += colors.getZ(index); lowerCount++; }
    if (vertices.getY(index) > .22) { upperBlue += colors.getZ(index); upperCount++; }
  }
  assert.ok(lowerCount > 0 && upperCount > 0);
  assert.ok(lowerBlue / lowerCount > upperBlue / upperCount + .4, 'warm color blends out before the lower edge');
  const left = expression.root.getObjectByName('fighter-left-angry-brow');
  const right = expression.root.getObjectByName('fighter-right-angry-brow');
  assert.ok(left.rotation.z < 0 && right.rotation.z > 0, 'brows angle down toward the center');
  for (const brow of [left, right]) {
    const eye = character.userData.rig.head.children.find(child => child.name === 'minimal-dot-eye'
      && Math.sign(child.position.x) === Math.sign(brow.position.x));
    assert.ok(eye);
    assert.ok(brow.position.y > eye.position.y + .05, 'brows leave a visible gap above the actual dot eyes');
    // At each sample, raycast the real head skin rather than assuming its old
    // radius or front depth. All four brow corners must remain on the outside.
    const source = character.userData.mesh.geometry;
    const proxy = new THREE.Mesh(source, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const ray = new THREE.Raycaster();
    try {
      for (const x of [-.0525, .0525]) for (const y of [-.0075, .0075]) {
        const point = new THREE.Vector3(x, y, -brow.geometry.parameters.depth / 2)
          .applyEuler(brow.rotation).add(brow.position);
        ray.set(new THREE.Vector3(point.x, headRestHeight + point.y, 1), new THREE.Vector3(0, 0, -1));
        const hit = ray.intersectObject(proxy, false)[0];
        assert.ok(hit, 'the brow projects onto the head');
        assert.ok(point.z >= hit.point.z - .001, 'the entire brow sits outside the actual face');
      }
    } finally { proxy.material.dispose(); }
  }
  character.userData.rig.head.rotation.set(.4, -.5, .25);
  character.updateMatrixWorld(true);
  const point = left.getWorldPosition(new THREE.Vector3());
  const expected = character.userData.rig.head.localToWorld(left.position.clone());
  assert.ok(point.distanceTo(expected) < 1e-9, 'the expression follows the animated head');
});

test('updating the expression reuses its geometry, materials, and object tree', t => {
  const { characters: [character], emotion } = fixture(t);
  const expression = emotion(character);
  const objects = [], geometries = [], materials = [];
  expression.root.traverse(object => {
    objects.push(object);
    if (object.geometry) geometries.push(object.geometry);
    if (object.material) materials.push(object.material);
  });
  for (let frame = 0; frame < 2000; frame++) expression.update((frame % 100) / 100);
  const after = [];
  expression.root.traverse(object => after.push(object));
  assert.deepEqual(after, objects);
  assert.deepEqual(after.filter(object => object.geometry).map(object => object.geometry), geometries);
  assert.deepEqual(after.filter(object => object.material).map(object => object.material), materials);
});

test('head overlays follow the bind height instead of a fixed character proportion', t => {
  const { characters: [character], emotion } = fixture(t);
  const original = emotion(character);
  const rig = character.userData.rig;
  const offset = .125;
  const shiftedGeometry = character.userData.mesh.geometry.clone().translate(0, offset, 0);
  const shiftedHead = new THREE.Group();
  for (const eye of rig.head.children.filter(child => child.name === 'minimal-dot-eye')) shiftedHead.add(eye.clone());
  const rest = structuredClone(rig.rest);
  rest.hips.position[1] += offset;
  const shifted = createCharacterEmotion({ userData: {
    rig: { head: shiftedHead, rest }, mesh: { geometry: shiftedGeometry },
  } });
  t.after(() => { shifted.dispose(); shiftedGeometry.dispose(); });
  const originalTint = original.root.getObjectByName('fighter-head-blush').geometry;
  const shiftedTint = shifted.root.getObjectByName('fighter-head-blush').geometry;
  assert.equal(shiftedTint.index.count, originalTint.index.count,
    'the same head-relative skin region is selected at a different bind height');
  for (const attribute of ['position', 'normal', 'color']) {
    const a = originalTint.attributes[attribute], b = shiftedTint.attributes[attribute];
    assert.equal(a.count, b.count);
    for (let index = 0; index < a.array.length; index++) assert.ok(Math.abs(a.array[index] - b.array[index]) < 1e-6,
      `head-local ${attribute} must stay aligned when the bind height changes`);
  }
  for (const name of ['fighter-left-angry-brow', 'fighter-right-angry-brow']) {
    assert.ok(original.root.getObjectByName(name).position.distanceTo(shifted.root.getObjectByName(name).position) < 1e-6,
      'brow depth is projected using the matching bind height');
  }
});

test('disposing one fighter preserves the other overlay and the last disposal releases shared resources once', t => {
  const { characters: [one, two], emotion, resources } = fixture(t, 2);
  const first = emotion(one), second = emotion(two);
  const a = first.root.getObjectByName('fighter-head-blush');
  const b = second.root.getObjectByName('fighter-head-blush');
  assert.equal(a.geometry, b.geometry, 'fighters share one head overlay geometry');
  assert.equal(resources.size, 6, 'two shared geometries and four independently fading materials');
  let geometryDisposals = 0, materialDisposals = 0, bodyDisposals = 0;
  a.geometry.addEventListener('dispose', () => geometryDisposals++);
  a.material.addEventListener('dispose', () => materialDisposals++);
  one.userData.mesh.geometry.addEventListener('dispose', () => bodyDisposals++);
  first.dispose(); first.dispose(); first.update(1);
  assert.equal(first.root.parent, null);
  assert.equal(geometryDisposals, 0);
  assert.equal(materialDisposals, 1);
  assert.equal(resources.size, 4);
  second.update(1); assert.equal(second.root.visible, true);
  second.dispose(); second.dispose();
  assert.equal(geometryDisposals, 1);
  assert.equal(bodyDisposals, 0, 'expression cleanup cannot dispose shared character skin');
  assert.equal(resources.size, 0);
});

test('shared geometry stays registered for separately owned expression lifecycles', t => {
  const factory = createCharacterFactory();
  const firstResources = new Set(), secondResources = new Set();
  const first = createCharacterEmotion(factory.create(), { allResources: firstResources });
  const second = createCharacterEmotion(factory.create(), { allResources: secondResources });
  t.after(() => { first.dispose(); second.dispose(); factory.dispose(); });
  const geometry = second.root.getObjectByName('fighter-head-blush').geometry;
  first.dispose();
  assert.equal(firstResources.size, 0);
  assert.ok(secondResources.has(geometry));
  second.dispose();
  assert.equal(secondResources.size, 0);
});
