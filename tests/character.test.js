import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createCharacterFactory } from '../src/character.js';
import { animateCharacter, resetCharacterPose, SEATED_FOOT_REACH } from '../src/character-motion.js';
import { createSeatExit, SEAT_RISE_MS } from '../src/seat-exit.js';

const dt = 1 / 60;
const position = object => object.getWorldPosition(new THREE.Vector3());
const span = values => Math.max(...values) - Math.min(...values);

function makeCharacter(t, options = {}) {
  const factory = createCharacterFactory();
  t.after(() => factory.dispose());
  const character = factory.create(options);
  resetCharacterPose(character);
  character.updateMatrixWorld(true);
  return character;
}

function assertFinitePose(character) {
  character.updateMatrixWorld(true);
  character.traverse(object => {
    assert.ok(object.matrixWorld.elements.every(Number.isFinite), `${object.name || object.type} has a non-finite transform`);
    if (object.isBone) assert.ok(Math.abs(object.quaternion.length() - 1) < 1e-5, `${object.name} has an invalid rotation`);
  });
}

// Move the root before posing it, matching the world's rendering loop. This is
// deliberately measured in world space: a cycling leg can still slide forever.
function step(character, frame, { velocityX = 0, velocityZ = 0, seated = false, talking = false } = {}) {
  character.position.x += velocityX * dt;
  character.position.z += velocityZ * dt;
  animateCharacter(character, { dt, time: frame * dt, velocityX, velocityZ, seated, talking, phaseOffset: 0 });
  character.updateMatrixWorld(true);
}

function skinnedMeshes(character) {
  const meshes = [];
  character.traverse(object => { if (object.isSkinnedMesh) meshes.push(object); });
  return meshes;
}

function vertexBounds(character) {
  const bounds = new THREE.Box3();
  const point = new THREE.Vector3();
  for (const mesh of skinnedMeshes(character)) {
    const vertices = mesh.geometry.getAttribute('position');
    for (let index = 0; index < vertices.count; index++) {
      point.fromBufferAttribute(vertices, index);
      mesh.applyBoneTransform(index, point);
      bounds.expandByPoint(mesh.localToWorld(point));
    }
  }
  return bounds;
}

function correlation(a, b) {
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let covariance = 0, varianceA = 0, varianceB = 0;
  for (let index = 0; index < a.length; index++) {
    const da = a[index] - meanA, db = b[index] - meanB;
    covariance += da * db; varianceA += da * da; varianceB += db * db;
  }
  return covariance / Math.sqrt(varianceA * varianceB);
}

test('characters start bald and the five Fresh Look hairstyles remain optional', t => {
  const factory = createCharacterFactory();
  t.after(() => factory.dispose());
  const defaultCharacter = factory.create();
  const explicitBald = factory.create({ hair: 5, tie: true });
  for (const character of [defaultCharacter, explicitBald]) {
    assert.equal(character.userData.hair, 5);
    assert.equal(character.getObjectByName('single-piece-hairstyle'), undefined, 'bald characters must omit hair geometry');
    assert.equal(character.userData.rig.head.children.filter(child => child.name === 'minimal-dot-eye').length, 2);
  }
  assert.ok(explicitBald.getObjectByName('recruiter-necktie'), 'removing hair must not remove recruiter accessories');
  for (let hair = 0; hair < 5; hair++) {
    const character = factory.create({ hair });
    assert.equal(character.userData.hair, hair);
    assert.equal(character.getObjectByName('single-piece-hairstyle')?.geometry.name, `continuous-hair-cap-${hair}`);
    assert.equal(character.userData.mesh.geometry, defaultCharacter.userData.mesh.geometry, 'style changes reuse the shared body');
  }
  assert.equal(factory.create({ hair: Number.NaN }).userData.hair, 5, 'invalid style data keeps the bald default');
});

test('the soft silhouette has narrow relaxed shoulders and continuous unit normals', t => {
  const character = makeCharacter(t);
  const geometry = character.userData.mesh.geometry;
  const vertices = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
  let shoulderSpan = 0, armSpan = 0, headSpan = 0;
  for (let index = 0; index < vertices.count; index++) {
    const x = Math.abs(vertices.getX(index)), y = vertices.getY(index);
    if (y > 1.27 && y < 1.39) shoulderSpan = Math.max(shoulderSpan, x * 2);
    if (y > .78 && y < 1.20) armSpan = Math.max(armSpan, x * 2);
    if (y > 1.50) headSpan = Math.max(headSpan, x * 2);
    assert.ok(Math.abs(Math.hypot(normals.getX(index), normals.getY(index), normals.getZ(index)) - 1) < 1e-5,
      'field normals should stay finite and normalized at every smooth joint');
  }
  assert.ok(shoulderSpan < .85, `the shoulder silhouette should slope gently; width ${shoulderSpan}`);
  assert.ok(armSpan / headSpan < 1.58,
    `relaxed arms should follow the reference's slim rounded silhouette; arm/head span ${armSpan / headSpan}`);
  assert.equal(character.userData.mesh.material.flatShading, false);
});

test('the neutral silhouette follows the new large-head 3D reference with a compact body and low dot eyes', t => {
  const character = makeCharacter(t);
  const { mesh, rig } = character.userData;
  const point = new THREE.Vector3(), points = [];
  const bounds = new THREE.Box3();
  for (let index = 0; index < mesh.geometry.attributes.position.count; index++) {
    mesh.getVertexPosition(index, point); mesh.localToWorld(point);
    points.push(point.clone()); bounds.expandByPoint(point);
  }
  const height = bounds.max.y - bounds.min.y;
  const headCenter = position(rig.head);
  const headPoints = points.filter(item => item.y > headCenter.y - .2);
  const headWidth = Math.max(...headPoints.map(item => Math.abs(item.x))) * 2;
  const headDepth = Math.max(...headPoints.map(item => item.z)) - Math.min(...headPoints.map(item => item.z));
  const width = bounds.max.x - bounds.min.x;
  const crotch = Math.min(...points.filter(item => Math.abs(item.x) < .018 && Math.abs(item.z) < .075).map(item => item.y));
  // The latest 3D reference replaces the earlier drawing's broad pear body:
  // the round head is about .39 of the height, relaxed hands span about .46,
  // and the exposed leg split starts around .28 above the floor.
  // These bands describe the reference proportions rather than mesher constants.
  assert.ok(headWidth / height >= .38 && headWidth / height <= .42,
    `reference head/height should be .38–.42; measured ${headWidth / height}`);
  assert.ok(headDepth / headWidth >= .92 && headDepth / headWidth <= 1.04,
    `the round head should read as circular in profile too; depth/width ${headDepth / headWidth}`);
  assert.ok(width / height >= .43 && width / height <= .49,
    `reference relaxed width/height should be .43–.49; measured ${width / height}`);
  assert.ok((crotch - bounds.min.y) / height >= .25 && (crotch - bounds.min.y) / height <= .30,
    `reference leg split/height should be .25–.30; measured ${(crotch - bounds.min.y) / height}`);
  const eyes = rig.head.children.filter(child => child.name === 'minimal-dot-eye');
  assert.equal(eyes.length, 2, 'the reference face has only two minimal dot eyes');
  for (const eye of eyes) {
    const eyeY = position(eye).y;
    const fractionDownHead = (bounds.max.y - eyeY) / headWidth;
    assert.ok(fractionDownHead >= .63 && fractionDownHead <= .73,
      `reference eyes sit low on the round face; measured ${fractionDownHead} down the head`);
    assert.ok(Math.max(eye.scale.x, eye.scale.y) / headWidth < .035, 'the eyes remain small dots');
  }
});

test('the lightweight white body is one connected skin with valid limb influences', t => {
  const character = makeCharacter(t, { hair: 2, tie: true });
  const { mesh, rig } = character.userData;
  assert.ok(mesh?.isSkinnedMesh, 'the body must deform with its skeleton, including its legs');
  assert.ok(['r', 'g', 'b'].every(channel => mesh.material.color[channel] > .9),
    'the shared character body remains white while accessories provide contrast');
  assert.equal(mesh.material.map, null, 'the reference changes form without adding its photographed texture');
  assert.equal(character.userData.outline.material.side, THREE.BackSide, 'the white body retains its continuous ink silhouette');
  const geometry = mesh.geometry;
  const vertices = geometry.getAttribute('position');
  const weights = geometry.getAttribute('skinWeight');
  const influences = geometry.getAttribute('skinIndex');
  assert.equal(weights.count, vertices.count);
  assert.equal(influences.count, vertices.count);
  const affectedBones = new Set();
  for (let index = 0; index < vertices.count; index++) {
    let total = 0;
    for (let axis = 0; axis < 4; axis++) {
      const weight = weights.getComponent(index, axis);
      const bone = influences.getComponent(index, axis);
      assert.ok(Number.isFinite(weight) && weight >= 0 && weight <= 1);
      assert.ok(Number.isInteger(bone) && bone >= 0 && bone < rig.bones.length);
      total += weight;
      if (weight > .05) affectedBones.add(rig.bones[bone].name);
    }
    assert.ok(Math.abs(total - 1) < 1e-5, `skin weights at vertex ${index} sum to ${total}`);
    assert.ok([vertices.getX(index), vertices.getY(index), vertices.getZ(index)].every(Number.isFinite));
  }
  for (const name of ['leftLeg', 'leftShin', 'leftFoot', 'rightLeg', 'rightShin', 'rightFoot', 'leftArm', 'leftForearm', 'rightArm', 'rightForearm']) {
    assert.ok(affectedBones.has(name), `${name} must influence the actual visible skin`);
  }

  // A merged set of disconnected spheres would pass a mesh-count assertion.
  // Triangle connectivity verifies the body is really a continuous surface.
  const parents = Array.from({ length: vertices.count }, (_, index) => index);
  const find = index => {
    while (parents[index] !== index) { parents[index] = parents[parents[index]]; index = parents[index]; }
    return index;
  };
  const join = (a, b) => { parents[find(a)] = find(b); };
  const indices = geometry.index;
  assert.ok(indices, 'indexed skin shares vertices at the joints');
  const edgeUses = new Map();
  for (let index = 0; index < indices.count; index += 3) {
    const triangle = [indices.getX(index), indices.getX(index + 1), indices.getX(index + 2)];
    join(triangle[0], triangle[1]);
    join(triangle[1], triangle[2]);
    for (const [a, b] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      const edge = a < b ? `${a}:${b}` : `${b}:${a}`;
      edgeUses.set(edge, (edgeUses.get(edge) || 0) + 1);
    }
  }
  assert.equal(new Set(parents.map((_, index) => find(index))).size, 1, 'head, torso and limbs must share one continuous skin');
  assert.ok([...edgeUses.values()].every(count => count === 2),
    'the rounded skin stays closed, including the top of the head and limb tips');

  const geometries = new Set();
  character.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
  const triangles = [...geometries].reduce((count, item) => count + (item.index?.count ?? item.getAttribute('position').count) / 3, 0);
  assert.ok(triangles < 30_000, `a character including its outline uses ${triangles} triangles`);
  assertFinitePose(character);
  const bounds = vertexBounds(character);
  assert.ok(bounds.min.y > -.04 && bounds.min.y < .08, `standing feet should meet the floor, min ${bounds.min.y}`);
  assert.ok(bounds.max.y > 1.7 && bounds.max.y < 2.4);
});

test('hand gestures do not stretch the white skin or ink hull into torso sheets', t => {
  const character = makeCharacter(t);
  const surfaces = skinnedMeshes(character).map(mesh => ({ mesh,
    points: Array.from({ length: mesh.geometry.getAttribute('position').count }, () => new THREE.Vector3()) }));
  const poses = [];
  for (let sample = 0; sample <= 10; sample++) {
    poses.push({ name: `push ${sample / 10}`, options: { pushing: true, strike: sample / 10 } });
  }
  for (const lounging of [false, true]) {
    for (let sample = 0; sample <= 8; sample++) {
      poses.push({ name: `${lounging ? 'lounge' : 'desk'} gesture ${sample}`,
        options: { seated: true, lounging, talking: true, time: sample * .4 } });
    }
  }
  // A skin triangle spanning an entire forearm is a stretched torso/hand
  // bridge, rather than a normal elbow fold. This physical limit also catches
  // the expanded black hull that can expose such a bridge as a dark wedge.
  // The reference has longer relaxed arms, but that must not loosen the old
  // local-surface limit and conceal a new hand-to-belly triangle bridge.
  const maximumEdge = Math.min(.24, character.userData.rig.dimensions.forearmLength);
  for (const pose of poses) {
    resetCharacterPose(character);
    animateCharacter(character, pose.options);
    character.updateMatrixWorld(true);
    for (const { mesh, points } of surfaces) {
      points.forEach((point, index) => mesh.getVertexPosition(index, point));
      const indices = mesh.geometry.index;
      let largestSquared = 0;
      for (let index = 0; index < indices.count; index += 3) {
        const a = points[indices.getX(index)], b = points[indices.getX(index + 1)], c = points[indices.getX(index + 2)];
        largestSquared = Math.max(largestSquared, a.distanceToSquared(b), b.distanceToSquared(c), c.distanceToSquared(a));
      }
      assert.ok(largestSquared < maximumEdge * maximumEdge,
        `${mesh.name} must stay locally joined through ${pose.name}; longest edge ${Math.sqrt(largestSquared)}`);
    }
  }
});

test('walking articulates both legs and counter-swings the hands instead of floating', t => {
  const character = makeCharacter(t);
  const { rig } = character.userData;
  const tracks = { left: [], right: [] };
  for (let frame = 0; frame < 300; frame++) {
    step(character, frame, { velocityZ: 1.6 });
    assertFinitePose(character);
    if (frame < 60) continue; // Exclude the short acceleration transition.
    for (const side of ['left', 'right']) {
      const foot = position(rig[`${side}Foot`]);
      const hand = position(rig[`${side}Hand`]);
      const knee = position(rig[`${side}Shin`]);
      tracks[side].push({ foot, hand, knee, localZ: foot.z - character.position.z, handZ: hand.z - character.position.z });
    }
  }
  for (const [side, samples] of Object.entries(tracks)) {
    assert.ok(span(samples.map(item => item.localZ)) > .2, `${side} foot must take a visible step`);
    assert.ok(span(samples.map(item => item.foot.y)) > .07, `${side} foot must lift off the ground`);
    assert.ok(span(samples.map(item => item.handZ)) > .1, `${side} arm must swing from its shoulder and elbow`);
    assert.ok(span(samples.map(item => item.knee.z - item.foot.z)) > .08, `${side} knee must articulate during the stride`);
    assert.ok(correlation(samples.map(item => item.localZ), samples.map(item => item.handZ)) < -.3, `${side} arm and leg should counter-swing`);
  }
  assert.ok(correlation(tracks.left.map(item => item.localZ), tracks.right.map(item => item.localZ)) < -.5,
    'left and right feet must alternate rather than hop together');
});

test('a planted foot stays near its world-space contact point while the avatar advances', t => {
  const character = makeCharacter(t);
  const { rig } = character.userData;
  const tracks = { left: [], right: [] };
  for (let frame = 0; frame < 300; frame++) {
    step(character, frame, { velocityZ: 1.6 });
    if (frame < 60) continue;
    for (const side of ['left', 'right']) tracks[side].push(position(rig[`${side}Foot`]));
  }
  for (const [side, samples] of Object.entries(tracks)) {
    const floorHeight = Math.min(...samples.map(point => point.y));
    const contacts = [];
    for (let index = 1; index < samples.length; index++) {
      const before = samples[index - 1], after = samples[index];
      if (Math.max(before.y, after.y) < floorHeight + .015) contacts.push(Math.hypot(after.x - before.x, after.z - before.z) / dt);
    }
    assert.ok(contacts.length >= 25, `${side} foot needs a readable planted portion of each step`);
    contacts.sort((a, b) => a - b);
    const medianSpeed = contacts[Math.floor(contacts.length / 2)];
    assert.ok(medianSpeed < .5, `${side} stance foot slides at ${medianSpeed.toFixed(3)} units/s while the avatar travels at 1.6`);
  }
});

test('stopping settles into a grounded idle and sitting bends knees with feet below the chair', t => {
  const character = makeCharacter(t);
  const { rig } = character.userData;
  for (let frame = 0; frame < 90; frame++) step(character, frame, { velocityZ: 1.6 });
  for (let frame = 90; frame < 270; frame++) step(character, frame);
  const stoppedFeet = [position(rig.leftFoot), position(rig.rightFoot)];
  for (let frame = 270; frame < 330; frame++) step(character, frame);
  [rig.leftFoot, rig.rightFoot].forEach((foot, index) => {
    assert.ok(position(foot).distanceTo(stoppedFeet[index]) < .025, 'idle feet should not keep shuffling or bobbing');
  });
  let bounds = vertexBounds(character);
  assert.ok(bounds.min.y > -.06 && bounds.min.y < .08, `idle body is not grounded: ${bounds.min.y}`);
  for (let frame = 330; frame < 450; frame++) step(character, frame, { seated: true, talking: true });
  assertFinitePose(character);
  for (const side of ['left', 'right']) {
    const hip = position(rig[`${side}Leg`]), knee = position(rig[`${side}Shin`]), ankle = position(rig[`${side}Foot`]);
    const kneeAngle = hip.clone().sub(knee).angleTo(ankle.clone().sub(knee));
    assert.ok(kneeAngle > .9 && kneeAngle < 2.5, `${side} knee should bend in the seated pose; angle ${kneeAngle}`);
    assert.ok(ankle.y < .32 && ankle.y > -.04, `${side} seated foot should remain close to the floor: ${ankle.y}`);
    assert.ok(hip.y - ankle.y > .25, `${side} foot should hang below the seat`);
    const hand = position(rig[`${side}Hand`]);
    assert.ok(hand.y > hip.y + .12, `${side} hand should be raised to interact rather than dangle beside the chair`);
  }
  bounds = vertexBounds(character);
  assert.ok(bounds.min.y > -.08, `seated feet penetrate the floor by ${-bounds.min.y}`);
});

test('the visible seated pelvis rests above the cushion instead of sinking into it', t => {
  const character = makeCharacter(t);
  const { mesh, rig } = character.userData;
  const point = new THREE.Vector3();
  for (const lounging of [false, true]) {
    for (const time of [0, 1.1, 2.4]) {
      animateCharacter(character, { seated: true, lounging, talking: true, time });
      const vertices = mesh.geometry.getAttribute('position');
      let underside = Infinity;
      for (let index = 0; index < vertices.count; index++) {
        point.fromBufferAttribute(vertices, index);
        mesh.applyBoneTransform(index, point);
        // Sample the supporting pelvis, rather than shins and feet which
        // intentionally extend below the cushion in front of its edge.
        if (Math.abs(point.x) < .30 && point.z > -.15 && point.z < .10 && point.y < .60) {
          underside = Math.min(underside, point.y);
        }
      }
      assert.ok(underside > .30 && underside < .325,
        `the visible pelvis must contact the .30-high cushion from above; underside ${underside}`);
      for (const side of ['left', 'right']) {
        const ankle = position(rig[`${side}Foot`]);
        assert.ok(Math.abs(ankle.y - .11) < .001, `${side} foot must stay planted after lifting the pelvis`);
      }
    }
  }
});

test('lowering, seated and rising endpoints share one supported pose without a pop', t => {
  const character = makeCharacter(t);
  const { rig } = character.userData;
  const bones = [rig.hips, rig.leftShin, rig.rightShin, rig.leftFoot, rig.rightFoot, rig.leftHand, rig.rightHand];
  for (const lounging of [false, true]) {
    resetCharacterPose(character);
    for (let frame = 1; frame <= 100; frame++) animateCharacter(character, { dt: .01, sitProgress: frame / 100, lounging });
    const lowered = bones.map(position);
    animateCharacter(character, { seated: true, lounging, time: 0 });
    const seated = bones.map(position);
    animateCharacter(character, { standProgress: 0, lounging, time: 0 });
    bones.forEach((bone, index) => {
      assert.ok(seated[index].distanceTo(lowered[index]) < .001, `${bone.name} must finish lowering at the seated pose`);
      assert.ok(position(bone).distanceTo(seated[index]) < .001, `${bone.name} must start rising at the seated pose`);
    });
  }
});

test('the rounded typing mittens stay above the oval desk throughout seated gestures', t => {
  const character = makeCharacter(t, { tie: true });
  character.position.z = -1.12;
  const mesh = character.userData.mesh, point = new THREE.Vector3();
  // The recruiter's actual desk surface is .95 high, .08 thick, and oval.
  // Its smooth ellipse is slightly larger than the rendered 32-sided top.
  for (let recruiter = 0; recruiter < 9; recruiter++) {
    for (let sample = 0; sample <= 8; sample++) {
      animateCharacter(character, { seated: true, talking: recruiter === 0,
        time: sample * .4, phaseOffset: recruiter * .7 });
      character.updateMatrixWorld(true);
      const vertices = mesh.geometry.getAttribute('position');
      for (let index = 0; index < vertices.count; index++) {
        mesh.getVertexPosition(index, point); mesh.localToWorld(point);
        const aboveTop = point.y >= .95, belowTop = point.y <= .87;
        const outsideEdge = Math.hypot(point.x / 1.18, point.z / .62) >= 1;
        assert.ok(aboveTop || belowTop || outsideEdge,
          `seated skin vertex ${index} must stay clear of the desktop at phase ${recruiter}, sample ${sample}`);
      }
    }
  }
});

test('backward walking, strafing and changes of facing keep a finite articulated pose', t => {
  const character = makeCharacter(t, { hair: 4 });
  let frame = 0;
  for (const [velocityX, velocityZ, facing] of [[0, -1.6, 0], [1.6, 0, 0], [-1.1, 1.1, Math.PI / 2], [0, 0, Math.PI]]) {
    character.rotation.y = facing;
    const footHeights = [];
    for (let tick = 0; tick < 90; tick++, frame++) {
      step(character, frame, { velocityX, velocityZ });
      assertFinitePose(character);
      footHeights.push(position(character.userData.rig.leftFoot).y);
    }
    if (velocityX || velocityZ) assert.ok(span(footHeights) > .07, 'movement in every direction should produce an actual lifted step');
  }
});

test('a playful shove articulates shoulder and elbow while the feet stay planted', t => {
  const character = makeCharacter(t);
  const { rig } = character.userData;
  animateCharacter(character, { time: 0 });
  const feet = [position(rig.leftFoot), position(rig.rightFoot)];
  const handStart = position(rig.rightHand);
  const reach = [], elbows = [];
  for (let frame = 0; frame <= 60; frame++) {
    animateCharacter(character, { dt, time: 0, strike: frame / 60 });
    assertFinitePose(character);
    reach.push(position(rig.rightHand).z);
    elbows.push(rig.rightForearm.rotation.x);
    [rig.leftFoot, rig.rightFoot].forEach((foot, index) => {
      assert.ok(position(foot).distanceTo(feet[index]) < .002, 'upper body interaction must preserve the planted foot');
    });
  }
  assert.ok(Math.max(...reach) - handStart.z > .3, 'an open hand should reach forward visibly');
  assert.ok(span(elbows) > .4, 'the elbow should bend then extend rather than swinging a rigid arm');
  assert.ok(position(rig.rightHand).distanceTo(handStart) < .002, 'the gesture should return to its base pose');
});

test('a table-tennis forehand sweeps a hand-held paddle and returns without sliding planted feet', t => {
  const character = makeCharacter(t);
  const { rig } = character.userData;
  const paddle = new THREE.Object3D();
  paddle.position.set(0, 0, .07);
  rig.rightHand.add(paddle);
  animateCharacter(character, { time: 0, paddleSwing: 0 });
  const feet = [position(rig.leftFoot), position(rig.rightFoot)];
  const ready = position(paddle);
  const trajectory = [], elbows = [];
  for (let frame = 0; frame <= 60; frame++) {
    animateCharacter(character, { dt, time: 0, paddleSwing: frame / 60 });
    assertFinitePose(character);
    trajectory.push(position(paddle));
    elbows.push(rig.rightForearm.rotation.x);
    assert.ok(rig.rightForearm.rotation.x < -.45, 'the forearm must stay bent while returning the ball');
    [rig.leftFoot, rig.rightFoot].forEach((foot, index) => {
      assert.ok(position(foot).distanceTo(feet[index]) < .002, 'a forehand must preserve stationary foot plants');
    });
  }
  assert.ok(span(trajectory.map(point => point.x)) > .14, 'the paddle should visibly sweep across the body');
  assert.ok(span(trajectory.map(point => point.z)) > .14, 'the paddle should move forward to meet the ball');
  assert.ok(span(elbows) > .28, 'the elbow should articulate instead of rotating one rigid arm');
  const contact = trajectory[30];
  assert.ok(Math.hypot(contact.x - .36, contact.z - .4) < .10, 'the paddle must reach the rally contact point');
  assert.ok(Math.abs(contact.y - 1.03) < .07, `the paddle must meet the ball above the table, height ${contact.y}`);
  assert.ok(position(paddle).distanceTo(ready) < .002, 'the completed stroke should return continuously to ready');
});

test('a seated bot flinches and rises out of the chair without losing floor contact', t => {
  const character = makeCharacter(t);
  const { rig } = character.userData;
  animateCharacter(character, { seated: true, time: 0 });
  const feet = [position(rig.leftFoot), position(rig.rightFoot)];
  const restLean = rig.torso.rotation.x;
  animateCharacter(character, { seated: true, time: 0, recoil: 1 });
  assert.ok(rig.torso.rotation.x < restLean - .1, 'the bot should visibly lean back');
  [rig.leftFoot, rig.rightFoot].forEach((foot, index) => {
    assert.ok(position(foot).distanceTo(feet[index]) < .002, 'recoil must not disturb seated feet');
  });
  let previousHip = position(rig.hips).y;
  for (let frame = 0; frame < 60; frame++) {
    animateCharacter(character, { dt, time: frame * dt, standProgress: frame / 60 });
    assertFinitePose(character);
    const hip = position(rig.hips).y;
    assert.ok(hip >= previousHip - 1e-6, 'standing should raise the pelvis continuously');
    previousHip = hip;
    const ankles = [position(rig.leftFoot), position(rig.rightFoot)];
    assert.ok(ankles.every(ankle => ankle.y > .08 && ankle.y < .17), 'feet should remain close to the floor');
    assert.ok(Math.min(...ankles.map(ankle => Math.abs(ankle.y - rig.dimensions.footHeight))) < .003,
      'one foot must remain planted while the other adjusts');
  }
  animateCharacter(character, { dt, standProgress: 1 });
  assert.ok(position(rig.hips).y > .67, 'the bot must finish standing');
  assert.ok(vertexBounds(character).min.y > -.06, 'the standing pose must not penetrate the floor');
});

test('a visitor takes the full seat-exit rise to lift the pelvis before walking away', t => {
  const character = makeCharacter(t);
  const { rig } = character.userData;
  character.position.set(2, 0, -4);
  resetCharacterPose(character, { seated: true });
  const exit = createSeatExit({ from: { x: 2, z: -4 }, to: { x: 2, z: -3 } });
  const seatedHip = position(rig.hips).y;
  let previousHip = seatedHip;
  const interval = 25;
  for (let elapsed = 0; elapsed <= SEAT_RISE_MS; elapsed += interval) {
    const pose = elapsed === 0 ? exit.state : exit.update(interval);
    character.position.set(pose.x, 0, pose.z);
    animateCharacter(character, {
      dt: interval / 1000, time: elapsed / 1000, seated: false,
      standProgress: pose.standProgress,
    });
    assertFinitePose(character);
    const hip = position(rig.hips).y;
    assert.ok(hip >= previousHip - 1e-6, 'the actual pelvis should rise continuously');
    assert.ok(hip - previousHip < .025, 'the first get-up frame must not snap to a standing pose');
    assert.equal(character.position.x, 2);
    assert.equal(character.position.z, -4, 'the avatar must finish rising before leaving its chair');
    assert.equal(pose.mayWalk, false);
    const ankles = [position(rig.leftFoot), position(rig.rightFoot)];
    assert.ok(ankles.every(ankle => ankle.y > .08 && ankle.y < .17), 'the rig must keep both feet close to the floor');
    assert.ok(ankles.some(ankle => Math.abs(ankle.y - rig.dimensions.footHeight) < .003),
      'at least one foot stays planted throughout the rise');
    previousHip = hip;
  }
  // The reference's lower belly needs a higher supported hip over the same
  // cushion. Require a visible rise relative to the actual body size rather
  // than the superseded model's fixed .20-unit pelvis travel.
  const bodyHeight = vertexBounds(character).getSize(new THREE.Vector3()).y;
  assert.ok(previousHip > seatedHip + bodyHeight * .06, 'the skin skeleton should visibly lift from its supported seat');
  assert.ok(Math.abs(previousHip - (rig.rest.hips.position[1] - .012)) < .001,
    'the rise must finish at the fully standing hip height');
  assert.equal(exit.active, true, 'rising alone must not release the chair');
  assert.ok(vertexBounds(character).min.y > -.06, 'the completed get-up must not penetrate the floor');
});

test('shifting forward while rising keeps the seated feet planted through the return to idle', t => {
  const character = makeCharacter(t);
  const { rig } = character.userData;
  for (const facing of [0, Math.PI / 2]) {
    character.position.set(2, 0, -4);
    character.rotation.y = facing;
    resetCharacterPose(character, { seated: true });
    animateCharacter(character, { seated: true, lounging: true });
    const seatRoot = character.position.clone();
    const forward = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
    const plantedFeet = [position(rig.leftFoot), position(rig.rightFoot)];
    let previousHip = position(rig.hips).y;
    for (let frame = 0; frame <= 100; frame++) {
      const progress = frame / 100;
      const shift = Math.max(0, Math.min(1, (progress - .12) / .30));
      const seatSlide = SEATED_FOOT_REACH * shift * shift * (3 - 2 * shift);
      character.position.copy(seatRoot).addScaledVector(forward, seatSlide);
      animateCharacter(character, { dt: .01, standProgress: progress, seatSlide, lounging: true });
      const hip = position(rig.hips).y;
      assert.ok(hip >= previousHip - .000001, 'the pelvis rises continuously during the forward transfer');
      previousHip = hip;
      [rig.leftFoot, rig.rightFoot].forEach((foot, index) => {
        assert.ok(position(foot).distanceTo(plantedFeet[index]) < .002,
          `${foot.name} stays outside the cushion at its original world contact through progress ${progress}`);
      });
    }
    for (let frame = 0; frame < 10; frame++) animateCharacter(character, { dt: .01, lounging: true });
    [rig.leftFoot, rig.rightFoot].forEach((foot, index) => {
      assert.ok(position(foot).distanceTo(plantedFeet[index]) < .002,
        `${foot.name} must not snap back underneath the seat after rising`);
    });
    assert.ok(vertexBounds(character).min.y > -.06, 'the forward rise keeps the skin above the floor');
  }
});

test('controlled lowering backs onto the seat edge while the feet remain planted in front', t => {
  const character = makeCharacter(t), rig = character.userData.rig;
  const ease = value => value * value * (3 - 2 * value);
  for (const facing of [0, Math.PI / 2]) for (const lounging of [false, true]) for (const reverseRise of [false, true]) {
    const seat = new THREE.Vector3(2, 0, -4), forward = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
    const front = seat.clone().addScaledVector(forward, SEATED_FOOT_REACH);
    character.position.copy(front); character.rotation.y = facing;
    resetCharacterPose(character);
    for (let frame = 0; frame < 40; frame++) animateCharacter(character, { dt: .01 });
    const plants = [position(rig.leftFoot), position(rig.rightFoot)];
    let previousHip = position(rig.hips).y;
    for (let frame = 0; frame <= 100; frame++) {
      const rise = 1 - frame / 100;
      const seatSlide = SEATED_FOOT_REACH * (reverseRise
        ? ease(Math.max(0, Math.min(1, (rise - .12) / .30))) : ease(rise));
      character.position.copy(seat).addScaledVector(forward, seatSlide);
      animateCharacter(character, { dt: .01, sitProgress: 1 - ease(rise), seatSlide, lounging });
      assert.ok(position(rig.hips).y <= previousHip + .000001, 'the body lowers continuously while backing onto the edge');
      previousHip = position(rig.hips).y;
      [rig.leftFoot, rig.rightFoot].forEach((foot, index) => {
        assert.ok(position(foot).distanceTo(plants[index]) < .002,
          `${foot.name} must stay in front of the cushion during lowering`);
      });
    }
    const lowered = [rig.hips, rig.leftHand, rig.rightHand].map(position);
    animateCharacter(character, { seated: true, lounging });
    [rig.hips, rig.leftHand, rig.rightHand].forEach((bone, index) => {
      assert.ok(position(bone).distanceTo(lowered[index]) < .001, 'the completed lower and seated pose must share an endpoint');
    });
  }
});

test('an interrupted controlled lower rises from its current pose without retracting feet through the chair', t => {
  const character = makeCharacter(t), rig = character.userData.rig;
  const ease = value => value * value * (3 - 2 * value), seat = new THREE.Vector3(0, 0, 0);
  character.position.z = SEATED_FOOT_REACH;
  resetCharacterPose(character);
  for (let frame = 0; frame < 40; frame++) animateCharacter(character, { dt: .01 });
  let startingSlide;
  for (let frame = 0; frame <= 65; frame++) {
    const rise = 1 - frame / 100;
    startingSlide = SEATED_FOOT_REACH * ease(rise);
    character.position.set(0, 0, startingSlide);
    animateCharacter(character, { dt: .01, sitProgress: 1 - ease(rise), seatSlide: startingSlide, lounging: true });
  }
  const plants = [position(rig.leftFoot), position(rig.rightFoot)];
  const before = [rig.hips, rig.leftHand, rig.rightHand].map(position);
  const exit = createSeatExit({ from: character.position, riseTo: { x: seat.x, z: SEATED_FOOT_REACH },
    to: { x: 1.1, z: .5 }, initialStand: .35, startingSlide, riseMs: SEAT_RISE_MS * .65 });
  animateCharacter(character, { dt: .01, standProgress: exit.state.standProgress, seatSlide: exit.state.seatSlide, lounging: true });
  [rig.hips, rig.leftHand, rig.rightHand].forEach((bone, index) => {
    assert.ok(position(bone).distanceTo(before[index]) < .002, 'interrupting a lower preserves the current visible body pose');
  });
  while (exit.state.phase === 'rising') {
    const pose = exit.update(10);
    character.position.set(pose.x, 0, pose.z);
    animateCharacter(character, { dt: .01, standProgress: pose.standProgress, seatSlide: pose.seatSlide, lounging: true });
    [rig.leftFoot, rig.rightFoot].forEach((foot, index) => {
      assert.ok(position(foot).distanceTo(plants[index]) < .002, 'the feet stay outside the chair while reversing the lower');
    });
  }
  assert.equal(exit.active, true, 'reaching standing height does not release the seat before departing');
});

test('a short backward chair approach does not predict footsteps beyond its endpoint', t => {
  const character = makeCharacter(t), rig = character.userData.rig;
  const goal = { x: 0, z: SEATED_FOOT_REACH }, start = .50;
  character.position.z = start;
  resetCharacterPose(character);
  let previous = character.position.z;
  for (let frame = 0; frame <= 24; frame++) {
    const progress = frame / 24, blend = progress * progress * (3 - 2 * progress);
    character.position.z = start + (goal.z - start) * blend;
    const velocityZ = (character.position.z - previous) / dt;
    animateCharacter(character, { dt, time: frame * dt, velocityZ, walkTarget: goal });
    character.updateMatrixWorld(true);
    for (const foot of [rig.leftFoot, rig.rightFoot]) {
      assert.ok(position(foot).z >= goal.z - .002, 'a predicted plant cannot pass through the chair-front goal plane');
    }
    const mesh = character.userData.mesh, vertices = mesh.geometry.getAttribute('position'), point = new THREE.Vector3();
    for (let index = 0; index < vertices.count; index++) {
      mesh.getVertexPosition(index, point); mesh.localToWorld(point);
      if (point.y < .31) assert.ok(point.z > .15,
        'the visible feet and shins must stay in front of the actual cushion edge');
    }
    previous = character.position.z;
  }
});

test('an absent, invalid or rearward walking target preserves ordinary walking motion', t => {
  const factory = createCharacterFactory(); t.after(() => factory.dispose());
  const targets = [null, { x: NaN, z: 0 }, { x: 0, z: Infinity }, { x: 0, z: -5 }];
  const characters = targets.map(() => { const character = factory.create(); resetCharacterPose(character); return character; });
  for (let frame = 0; frame < 90; frame++) {
    characters.forEach((character, index) => {
      character.position.z += 1.6 * dt;
      animateCharacter(character, { dt, time: frame * dt, velocityZ: 1.6, walkTarget: targets[index] });
    });
    for (const character of characters.slice(1)) for (const side of ['left', 'right']) {
      assert.ok(position(character.userData.rig[`${side}Foot`]).distanceTo(position(characters[0].userData.rig[`${side}Foot`])) < 1e-9,
        'ordinary footsteps must remain unchanged when there is no valid endpoint ahead');
    }
  }
});
