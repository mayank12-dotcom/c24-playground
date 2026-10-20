import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createCharacterFactory } from '../src/character.js';
import { animateCharacter, resetCharacterPose } from '../src/character-motion.js';

function makeCharacter(t) {
  const factory = createCharacterFactory();
  t.after(() => factory.dispose());
  const character = factory.create();
  resetCharacterPose(character);
  character.updateMatrixWorld(true);
  return character;
}

function surfaceDepth(mesh, x, y) {
  // Intersect the actual deformed triangles, from either side of the body.
  // A watertight topology can still contain the unwanted high armpit slit.
  const side = mesh.material.side;
  mesh.material.side = THREE.DoubleSide;
  const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1));
  const hits = ray.intersectObject(mesh);
  mesh.material.side = side;
  return hits.length ? hits[0].point.z - hits.at(-1).point.z : 0;
}

test('the upper shoulders form a visible chest-to-arm bridge while the lower arms remain separate', t => {
  const character = makeCharacter(t), mesh = character.userData.mesh;
  // The narrow slit used to extend almost to the shoulder. In a front or back
  // view, it cut through this band even though the skin was one closed mesh.
  // Require actual surface thickness here, rather than relying on vertex or
  // triangle counts that say nothing about the visible shoulder connection.
  for (const side of [-1, 1]) {
    for (const y of [1.14, 1.16, 1.18, 1.20]) for (const x of [.28, .30, .32, .34, .36, .38]) {
      const thickness = surfaceDepth(mesh, side * x, y);
      assert.ok(thickness > .04,
        `the ${side < 0 ? 'left' : 'right'} upper shoulder must stay visibly joined at ${side * x}, ${y}; thickness ${thickness}`);
    }
    for (const y of [.86, .92, .98]) {
      assert.equal(surfaceDepth(mesh, side * .35, y), 0,
        'the lower relaxed arm must retain its soft separation from the body instead of becoming a solid torso slab');
    }
  }
});

test('the shoulder skin and outline stay locally joined through walking, seated gestures and active bot poses', t => {
  const character = makeCharacter(t), surfaces = [];
  character.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const geometry = mesh.geometry, vertices = geometry.attributes.position, edges = new Set();
    const isShoulder = index => Math.abs(vertices.getX(index)) > .17
      && Math.abs(vertices.getX(index)) < .50 && vertices.getY(index) > 1.07 && vertices.getY(index) < 1.43;
    for (let index = 0; index < geometry.index.count; index += 3) {
      const triangle = [0, 1, 2].map(offset => geometry.index.getX(index + offset));
      for (const [a, b] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
        if (isShoulder(a) || isShoulder(b)) edges.add(a < b ? `${a}:${b}` : `${b}:${a}`);
      }
    }
    surfaces.push({ mesh, edges: [...edges].map(edge => edge.split(':').map(Number)),
      points: Array.from({ length: vertices.count }, () => new THREE.Vector3()) });
  });
  assert.equal(surfaces.length, 2, 'both the white skin and the black outline must be measured');
  const poses = [{ name: 'idle', options: {} }];
  for (let sample = 0; sample <= 8; sample++) {
    const progress = sample / 8;
    poses.push(
      { name: `desk gesture ${sample}`, options: { seated: true, talking: true, time: sample * .4 } },
      { name: `lounge gesture ${sample}`, options: { seated: true, lounging: true, talking: true, time: sample * .4 } },
      { name: `push ${sample}`, options: { pushing: true, strike: progress } },
      { name: `tennis ${sample}`, options: { paddleSwing: progress } },
      { name: `fight right punch ${sample}`, options: { fight: { guard: 1, punch: progress } } },
      { name: `fight left punch ${sample}`, options: { fight: { guard: 1, punch: progress, punchSide: 'left' } } },
      { name: `fight shove ${sample}`, options: { fight: { guard: 1, shove: progress } } },
      { name: `fall ${sample}`, options: { fallProgress: progress, recoveryProgress: 0 } },
      { name: `fall recovery ${sample}`, options: { fallProgress: 1, recoveryProgress: progress } },
      { name: `grounded fight ${sample}`, options: { fight: { fallProgress: progress, flinch: .4 } } },
    );
  }
  const check = name => {
    character.updateMatrixWorld(true);
    for (const { mesh, edges, points } of surfaces) {
      points.forEach((point, index) => mesh.getVertexPosition(index, point));
      let longest = 0;
      for (const [a, b] of edges) longest = Math.max(longest, points[a].distanceTo(points[b]));
      assert.ok(longest < .24,
        `${mesh.name} must not form a shoulder-to-arm sheet through ${name}; longest local edge ${longest}`);
    }
  };
  for (const { name, options } of poses) {
    resetCharacterPose(character);
    animateCharacter(character, options);
    check(name);
  }
  resetCharacterPose(character);
  for (let frame = 0; frame <= 180; frame++) {
    character.position.z += 1.8 / 60;
    animateCharacter(character, { dt: 1 / 60, time: frame / 60, velocityZ: 1.8 });
    if (frame >= 60 && frame % 10 === 0) check(`walking frame ${frame}`);
  }
});
