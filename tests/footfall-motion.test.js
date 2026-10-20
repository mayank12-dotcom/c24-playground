import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { animateCharacter, resetCharacterPose } from '../src/character-motion.js';

const DT = 1 / 60;

// A bone-only articulated visitor exercises the real gait and two-bone IK
// without generating the shared skin for each audio synchronization case.
function visitor() {
  const character = new THREE.Group(), rig = {};
  function bone(name, parent, x, y, z) {
    const joint = new THREE.Bone(); joint.name = name; joint.position.set(x, y, z);
    rig[name] = joint; (parent ? rig[parent] : character).add(joint);
  }
  bone('hips', null, 0, .70, 0); bone('torso', 'hips', 0, .28, 0); bone('head', 'torso', 0, .74, 0);
  for (const [side, prefix] of [[-1, 'left'], [1, 'right']]) {
    bone(`${prefix}Arm`, 'torso', side * .28, .32, 0);
    bone(`${prefix}Forearm`, `${prefix}Arm`, side * .19, -.27, 0);
    bone(`${prefix}Hand`, `${prefix}Forearm`, side * .01, -.39, .025);
    bone(`${prefix}Leg`, 'hips', side * .16, -.02, 0);
    bone(`${prefix}Shin`, `${prefix}Leg`, 0, -.29, 0);
    bone(`${prefix}Foot`, `${prefix}Shin`, 0, -.28, .01);
  }
  rig.bones = Object.values(rig);
  rig.rest = Object.fromEntries(rig.bones.map(joint => [joint.name,
    { position: joint.position.toArray(), rotation: joint.rotation.toArray().slice(0, 3) }]));
  rig.dimensions = { thighLength: .29, shinLength: .28, footHeight: .11, legSeparation: .32 };
  character.userData.rig = rig;
  resetCharacterPose(character);
  return character;
}

function tick(character, frame, { speed = 1.2, angle = 0, move = true, dt = DT, ...options } = {}) {
  const velocityX = Math.sin(angle) * speed, velocityZ = Math.cos(angle) * speed;
  if (move) { character.position.x += velocityX * dt; character.position.z += velocityZ * dt; }
  animateCharacter(character, { dt, time: frame * dt, velocityX, velocityZ, ...options });
}

function walk(character, count, options = {}) {
  for (let frame = 0; frame < count; frame++) tick(character, frame, options);
}

test('footfalls coincide with alternating visible swing-to-stance landings after the solved pose', () => {
  const character = visitor(), events = [];
  const callback = event => {
    const index = event.side === 'left' ? 0 : 1, foot = character.userData.motion.feet[index];
    assert.equal(foot.swing, false, 'the sounding foot is in its planted stance');
    assert.ok(foot.target.distanceTo(foot.plant) < 1e-10, 'the gait target has reached its ground plant');
    const ankle = foot.ankle.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(event.position.x - ankle.x) < 1e-10);
    assert.ok(Math.abs(event.position.z - ankle.z) < 1e-10);
    assert.ok(Math.abs(event.position.y - (ankle.y - .11)) < 1e-10, 'event uses the actual solved sole');
    assert.ok(Math.abs(event.position.y) < .006, 'the audible sole is on the walking surface');
    assert.equal(event.speed, 1.2); assert.ok(Number.isFinite(event.time));
    events.push(event);
  };
  for (let frame = 0; frame < 180; frame++) {
    const priorSwing = character.userData.motion.feet.map(foot => foot.swing);
    const count = events.length;
    tick(character, frame, { onFootstep: callback });
    for (const event of events.slice(count)) assert.equal(priorSwing[event.side === 'left' ? 0 : 1], true);
  }
  assert.ok(events.length >= 7, 'a sustained walk produces successive contacts');
  for (let index = 1; index < events.length; index++) assert.notEqual(events[index].side, events[index - 1].side);
  const first = structuredClone(events[0]);
  walk(character, 120, { onFootstep: callback });
  assert.deepEqual(events[0], first, 'event contact coordinates are stable snapshots');
});

test('cadence follows distance and changing speed rather than an independent timer', () => {
  const slow = visitor(), fast = visitor(), slowEvents = [], fastEvents = [];
  walk(slow, 240, { speed: .6, onFootstep: event => slowEvents.push(event) });
  walk(fast, 240, { speed: 1.8, onFootstep: event => fastEvents.push(event) });
  assert.ok(fastEvents.length > slowEvents.length * 2, 'the faster gait lands substantially more steps');
  assert.ok(slowEvents.length > 3);
});

test('turning while moving keeps footsteps attached to the current direction and solved feet', () => {
  const character = visitor(), events = [];
  for (let frame = 0; frame < 240; frame++) {
    const angle = frame * Math.PI / 180; character.rotation.y = angle;
    tick(character, frame, { angle, onFootstep: event => events.push(event) });
  }
  assert.ok(events.length > 8);
  assert.ok(events.some(event => event.position.x > .6), 'contacts follow the turned path in world space');
  assert.ok(events.every(event => Math.abs(event.position.y) < .006));
});

test('spawn, initialization and hairstyle pose reset never manufacture a contact', () => {
  const character = visitor(), events = [];
  character.userData.motion = undefined;
  tick(character, 0, { onFootstep: event => events.push(event) });
  assert.equal(events.length, 0);
  walk(character, 20, { onFootstep: event => events.push(event) });
  const count = events.length;
  resetCharacterPose(character);
  tick(character, 21, { onFootstep: event => events.push(event) });
  assert.equal(events.length, count);
});

test('idle time, stationary input and direction-only turns are silent', () => {
  for (const options of [{ speed: 0 }, { move: false }]) {
    const character = visitor(), events = [];
    for (let frame = 0; frame < 180; frame++) {
      character.rotation.y += .035;
      tick(character, frame, { ...options, onFootstep: event => events.push(event) });
    }
    assert.equal(events.length, 0);
  }
});

test('stopping and settling an airborne foot does not keep a cadence running', () => {
  const character = visitor(), events = [];
  walk(character, 9, { onFootstep: event => events.push(event) });
  assert.ok(character.userData.motion.feet.some(foot => foot.target.y > .12));
  const count = events.length;
  walk(character, 180, { speed: 0, onFootstep: event => events.push(event) });
  assert.equal(events.length, count);
  walk(character, 90, { onFootstep: event => events.push(event) });
  assert.ok(events.length > count, 'new genuine walking contacts resume normally');
});

test('a collision stop cancels an armed swing before later walking resumes', () => {
  const character = visitor(), events = [];
  walk(character, 9, { onFootstep: event => events.push(event) });
  const count = events.length;
  walk(character, 120, { move: false, onFootstep: event => events.push(event) });
  assert.equal(events.length, count, 'velocity intent alone cannot sound a footstep');
  walk(character, 90, { onFootstep: event => events.push(event) });
  assert.ok(events.length > count);
});

test('teleports and zero-time updates clear a pending contact without sounding', () => {
  const character = visitor(), events = [];
  walk(character, 9, { onFootstep: event => events.push(event) });
  const count = events.length;
  character.position.x += 10;
  tick(character, 10, { onFootstep: event => events.push(event) });
  assert.equal(events.length, count);
  walk(character, 8, { onFootstep: event => events.push(event) });
  const beforeZero = events.length;
  tick(character, 19, { dt: 0, onFootstep: event => events.push(event) });
  assert.equal(events.length, beforeZero);
});

test('sitting, lowering, standing and lounging remain silent even with translated roots', () => {
  for (const pose of [{ seated: true }, { seated: true, lounging: true }, { sitProgress: .4 }, { standProgress: .4 }]) {
    const character = visitor(), events = [];
    walk(character, 8, { onFootstep: event => events.push(event) });
    const count = events.length;
    walk(character, 100, { ...pose, onFootstep: event => events.push(event) });
    assert.equal(events.length, count, JSON.stringify(pose));
    tick(character, 101, { onFootstep: event => events.push(event) });
    assert.equal(events.length, count, 'leaving a non-walking pose does not report its stale swing');
  }
});

test('tumbles, fights, pushing and table-tennis actions do not emit walking samples', () => {
  const poses = [{ fallProgress: .5, recoveryProgress: 0 }, { fight: { guard: 1 } },
    { fight: { grounded: true, fallProgress: 1 } }, { paddleSwing: .4 }, { pushing: true }, { strike: .5 }, { recoil: .5 }];
  for (const pose of poses) {
    const character = visitor(), events = [];
    walk(character, 8, { onFootstep: event => events.push(event) });
    const count = events.length;
    walk(character, 100, { ...pose, onFootstep: event => events.push(event) });
    assert.equal(events.length, count, JSON.stringify(pose));
  }
});

test('normal frame skips only report feet that were visibly lifted before their landing', () => {
  const character = visitor(), events = [];
  for (let frame = 0; frame < 60; frame++) {
    const priorSwing = character.userData.motion.feet.map(foot => foot.swing), count = events.length;
    tick(character, frame, { dt: .075, speed: 1.8, onFootstep: event => events.push(event) });
    for (const event of events.slice(count)) assert.equal(priorSwing[event.side === 'left' ? 0 : 1], true);
  }
  assert.ok(events.length > 10);
});

test('footstep observers are optional and malformed observers leave animation finite', () => {
  const character = visitor();
  walk(character, 90);
  walk(character, 90, { onFootstep: true });
  character.traverse(object => assert.ok(object.matrixWorld.elements.every(Number.isFinite)));
});
