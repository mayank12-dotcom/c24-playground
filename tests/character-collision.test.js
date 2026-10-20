import test from 'node:test';
import assert from 'node:assert/strict';
import { moveUntilBlocked } from '../src/collision.js';
import {
  CHARACTER_RADIUS, sweepCharacterMovement, moveWithCharacters, findCharacterPlacement,
} from '../src/character-collision.js';

const near = (actual, expected, tolerance = 1e-8) => assert.ok(
  Math.abs(actual - expected) <= tolerance, `${actual} is close to ${expected}`,
);
const bot = { id: 'bot-1', x: 0, z: 0 };
const clearOf = (position, characters, radius = CHARACTER_RADIUS) => characters.every(character =>
  Math.hypot(position.x - character.x, position.z - character.z)
  >= radius + (character.radius ?? CHARACTER_RADIUS));
const inside = (point, bounds) => bounds.some(bound =>
  Math.abs(point.x - bound.x) < bound.halfX && Math.abs(point.z - bound.z) < bound.halfZ);

test('a fast character cannot pass through a bot despite a clear endpoint', () => {
  const result = sweepCharacterMovement({ x: -30, z: 0 }, { x: 30, z: 0 }, [bot]);
  assert.equal(result.blocked, true);
  assert.equal(result.obstacle, bot);
  assert.ok(result.x < -.8 && result.x > -.801);
  assert.equal(result.z, 0);
  assert.equal(clearOf(result, [bot]), true);
});

test('head-on and diagonal contact stop both movement axes without sliding', () => {
  for (const [from, to] of [
    [{ x: -3, z: 0 }, { x: 3, z: 0 }],
    [{ x: -3, z: -2 }, { x: 3, z: 2 }],
  ]) {
    const result = sweepCharacterMovement(from, to, [bot]);
    assert.equal(result.blocked, true);
    near((result.x - from.x) * (to.z - from.z)
      - (result.z - from.z) * (to.x - from.x), 0);
    near(Math.hypot(result.x, result.z), .8001);
    assert.equal(clearOf(result, [bot]), true);
  }
});

test('holding a movement key remains stopped before the same character', () => {
  const first = sweepCharacterMovement({ x: -2, z: .25 }, { x: 2, z: .25 }, [bot]);
  assert.equal(first.blocked, true);
  let position = first;
  for (let frame = 0; frame < 180; frame++) {
    const result = sweepCharacterMovement(position, { x: position.x + .12, z: position.z }, [bot]);
    assert.equal(result.blocked, true);
    near(result.x, first.x);
    near(result.z, first.z);
    position = result;
  }
});

test('after bumping, deliberate movement aside and away remains possible', () => {
  const stopped = sweepCharacterMovement({ x: -2, z: 0 }, { x: 2, z: 0 }, [bot]);
  const aside = sweepCharacterMovement(stopped, { x: stopped.x, z: 1.2 }, [bot]);
  assert.equal(aside.blocked, false);
  const past = sweepCharacterMovement(aside, { x: 2, z: 1.2 }, [bot]);
  assert.equal(past.blocked, false);
  assert.equal(past.x, 2);
  const back = sweepCharacterMovement(stopped, { x: -2, z: 0 }, [bot]);
  assert.equal(back.blocked, false);
  assert.equal(back.x, -2);
});

test('a walking bot approaching a stationary player stops from either side', () => {
  const player = { id: 'local-player', x: 5, z: -3 };
  for (const direction of [-1, 1]) {
    const from = { x: player.x + direction * 3, z: player.z };
    const to = { x: player.x - direction * 3, z: player.z };
    const result = moveWithCharacters(from, to, [], [player]);
    assert.equal(result.blocked, true);
    assert.equal(result.obstacle, player);
    assert.ok((result.x - player.x) * direction >= .8);
    near(result.z, player.z);
  }
});

test('the first body is selected regardless of array order and metadata is retained', () => {
  const recruiter = { id: 'host', x: -1, z: 0, radius: .45, seated: true, kind: 'recruiter' };
  const visitor = { id: 'visitor', x: 3, z: 0, radius: .35, seated: true };
  const result = sweepCharacterMovement({ x: -5, z: 0 }, { x: 6, z: 0 }, [visitor, recruiter]);
  assert.equal(result.obstacle, recruiter);
  assert.ok(result.x < -1.85 && result.x > -1.851);
  assert.equal(result.obstacle.seated, true);
});

test('combined movement stops at the earliest static or character contact', () => {
  const from = { x: -5, z: 0 }, to = { x: 6, z: 0 };
  const wall = { x: 0, z: 0, halfX: .5, halfZ: 2, kind: 'railing' };
  const earlyBot = { id: 'early', x: -2, z: 0 };
  const lateBot = { id: 'late', x: 3, z: 0 };
  const dynamicFirst = moveWithCharacters(from, to, [wall], [earlyBot]);
  assert.equal(dynamicFirst.obstacle, earlyBot);
  assert.ok(dynamicFirst.x < -2.8 && dynamicFirst.x > -2.801);
  const staticFirst = moveWithCharacters(from, to, [wall], [lateBot]);
  assert.equal(staticFirst.obstacle, wall);
  assert.deepEqual(staticFirst, moveUntilBlocked(from, to, [wall]));
});

test('static bounds receive no second inflation and preserve existing collision results', () => {
  const wall = { x: 0, z: 0, halfX: .375, halfZ: 4 };
  const from = { x: -2, z: 0 }, to = { x: 2, z: 0 };
  assert.deepEqual(moveWithCharacters(from, to, [wall], []), moveUntilBlocked(from, to, [wall]));
  const edge = moveWithCharacters({ x: -2, z: 4 }, { x: 2, z: 4 }, [wall], []);
  assert.equal(edge.blocked, false);
});

test('exact tangents and outward movement from contact do not trap a character', () => {
  for (const [from, to] of [
    [{ x: -3, z: .8 }, { x: 3, z: .8 }],
    [{ x: -.8, z: 0 }, { x: -.8, z: 2 }],
    [{ x: -.8, z: 0 }, { x: -2, z: 0 }],
    [{ x: -2, z: 0 }, { x: -.8, z: 0 }],
  ]) {
    const result = sweepCharacterMovement(from, to, [bot]);
    assert.equal(result.blocked, false);
    near(result.x, to.x);
    near(result.z, to.z);
  }
  const inward = sweepCharacterMovement({ x: -.8, z: 0 }, { x: -.4, z: 0 }, [bot]);
  assert.equal(inward.blocked, true);
  near(inward.x, -.8);
});

test('existing overlaps can unwind, but cannot escape through the other character', () => {
  for (const to of [{ x: -2, z: 0 }, { x: -.3, z: 1.5 }]) {
    const escape = sweepCharacterMovement({ x: -.3, z: 0 }, to, [bot]);
    assert.equal(escape.blocked, false);
    assert.equal(escape.x, to.x);
    assert.equal(escape.z, to.z);
  }
  const through = sweepCharacterMovement({ x: -.3, z: 0 }, { x: 2, z: 0 }, [bot]);
  assert.equal(through.blocked, true);
  near(through.x, -.3);
  const coincidentEscape = sweepCharacterMovement({ x: 0, z: 0 }, { x: 0, z: -2 }, [bot]);
  assert.equal(coincidentEscape.blocked, false);
});

test('a zero-length movement is stable even at an existing overlap', () => {
  const point = { x: .2, z: 0 };
  assert.deepEqual(sweepCharacterMovement(point, point, [bot]), {
    x: .2, z: 0, blocked: false, obstacle: null,
  });
});

test('self identity is ignored without ignoring unrelated anonymous characters', () => {
  const self = { id: 'self', x: -1, z: 0 }, anonymous = { x: 1, z: 0 };
  const result = sweepCharacterMovement({ x: -2, z: 0 }, { x: 3, z: 0 }, [self, anonymous], { ignoreId: 'self' });
  assert.equal(result.obstacle, anonymous);
  const defaultIds = sweepCharacterMovement({ x: -2, z: 0 }, { x: 3, z: 0 }, [anonymous]);
  assert.equal(defaultIds.obstacle, anonymous);
});

test('custom body radii apply consistently to moving and stationary characters', () => {
  const large = { id: 'large', x: 0, z: 0, radius: .6 };
  const result = sweepCharacterMovement({ x: -3, z: 0 }, { x: 3, z: 0 }, [large], { radius: .5 });
  assert.ok(result.x < -1.1 && result.x > -1.101);
  const zero = sweepCharacterMovement({ x: -3, z: 0 }, { x: 3, z: 0 }, [{ x: 0, z: 0, radius: 0 }], { radius: 0 });
  assert.equal(zero.blocked, false);
});

test('a clear spawn keeps its exact position and an overlapping spawn finds free nearby space', () => {
  const clear = findCharacterPlacement({ x: 3, z: 2 }, [], [bot]);
  assert.deepEqual(clear, { x: 3, z: 2 });
  const placement = findCharacterPlacement({ x: 0, z: 0 }, [], [bot]);
  assert.notEqual(placement, null);
  assert.equal(clearOf(placement, [bot]), true);
  assert.ok(Math.hypot(placement.x, placement.z) <= 2);
  assert.deepEqual(findCharacterPlacement({ x: 0, z: 0 }, [], [bot]), placement);
});

test('spawn resolution near walls and corners stays clear and never crosses solid geometry', () => {
  const point = { x: .5, z: .5 };
  const characters = [{ id: 'occupied-spawn', ...point }];
  const bounds = [
    { x: -.5, z: 0, halfX: .5, halfZ: 4 },
    { x: 0, z: -.5, halfX: 4, halfZ: .5 },
    { x: 1.2, z: 1.2, halfX: .2, halfZ: .2 },
  ];
  const placement = findCharacterPlacement(point, bounds, characters);
  assert.notEqual(placement, null);
  assert.equal(inside(placement, bounds), false);
  assert.equal(clearOf(placement, characters), true);
  assert.equal(moveUntilBlocked(point, placement, bounds).blocked, false);
  assert.ok(placement.x >= 0 && placement.z >= 0);
});

test('spawn resolution cannot jump through a nearby wall to reach clear space', () => {
  const bounds = [{ x: .3, z: 0, halfX: .02, halfZ: 4 }];
  const point = { x: 0, z: 0 };
  const placement = findCharacterPlacement(point, bounds, [bot], { maxDistance: 1 });
  assert.notEqual(placement, null);
  assert.ok(placement.x <= .28);
  assert.equal(moveUntilBlocked(point, placement, bounds).blocked, false);
  assert.equal(findCharacterPlacement({ x: .3, z: 0 }, bounds, []), null);
});

test('spawn correction cannot cross another character while escaping an overlap', () => {
  const characters = [bot, { id: 'second', x: 1, z: 0 }];
  const point = { x: .3, z: 0 };
  const placement = findCharacterPlacement(point, [], characters);
  assert.notEqual(placement, null);
  assert.equal(clearOf(placement, characters), true);
  assert.equal(sweepCharacterMovement(point, placement, characters).blocked, false);
});

test('placement returns null if no collision-clear position fits within the limit', () => {
  assert.equal(findCharacterPlacement({ x: 0, z: 0 }, [], [bot], { maxDistance: .5 }), null);
  assert.equal(findCharacterPlacement({ x: 0, z: 0 }, [], [bot], { maxDistance: 0 }), null);
  const ignored = findCharacterPlacement({ x: 0, z: 0 }, [], [bot], { ignoreId: bot.id });
  assert.deepEqual(ignored, { x: 0, z: 0 });
});

test('sweeps remain stable at distant world coordinates and small repeated steps', () => {
  const distant = { id: 'distant', x: 1000000, z: -1000000 };
  const result = sweepCharacterMovement(
    { x: distant.x - 100, z: distant.z + .2 },
    { x: distant.x + 100, z: distant.z + .2 }, [distant],
  );
  assert.equal(result.blocked, true);
  assert.equal(clearOf(result, [distant]), true);
  let position = { x: distant.x - 2, z: distant.z };
  for (let i = 0; i < 300; i++) {
    position = sweepCharacterMovement(position, { x: position.x + .018, z: position.z }, [distant]);
    assert.equal(Number.isFinite(position.x), true);
    assert.equal(clearOf(position, [distant]), true);
  }
  near(position.x - distant.x, -.8001, 1e-8);
});

test('collision and placement do not mutate positions, bounds, character metadata, or options', () => {
  const from = Object.freeze({ x: -3, z: 0 });
  const to = Object.freeze({ x: 3, z: 0 });
  const character = Object.freeze({ ...bot, radius: .4, seated: true });
  const characters = Object.freeze([character]);
  const staticBounds = Object.freeze([Object.freeze({ x: 2, z: 0, halfX: .3, halfZ: 1 })]);
  const options = Object.freeze({ radius: .4, maxDistance: 2 });
  const result = moveWithCharacters(from, to, staticBounds, characters, options);
  assert.equal(result.obstacle, character);
  const placement = findCharacterPlacement(character, staticBounds, characters, options);
  assert.notEqual(placement, null);
  assert.equal(clearOf(placement, characters), true);
  assert.deepEqual(from, { x: -3, z: 0 });
  assert.deepEqual(to, { x: 3, z: 0 });
});

test('invalid coordinates, radii, and placement distances fail explicitly', () => {
  assert.throws(() => sweepCharacterMovement({ x: NaN, z: 0 }, { x: 0, z: 0 }, []), TypeError);
  assert.throws(() => sweepCharacterMovement({ x: 0, z: 0 }, { x: 1, z: 0 }, [], { radius: -1 }), RangeError);
  assert.throws(() => findCharacterPlacement({ x: 0, z: 0 }, [], [], { maxDistance: Infinity }), RangeError);
});
