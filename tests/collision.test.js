import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateObstacles, segmentObstacleEntry, moveUntilBlocked } from '../src/collision.js';

const near = (actual, expected, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is close to ${expected}`);
};
const inside = (point, obstacle) => Math.abs(point.x - obstacle.x) < obstacle.halfX
  && Math.abs(point.z - obstacle.z) < obstacle.halfZ;
const box = { x: 0, z: 0, halfX: 1, halfZ: 1, kind: 'desk' };

test('obstacle inflation accounts for the avatar without changing source scenery bounds', () => {
  const source = Object.freeze({ x: 4, z: -3, halfX: .055, halfZ: 2.4, kind: 'railing', workspaceIndex: 2 });
  const bounds = Object.freeze([source]);
  const inflated = inflateObstacles(bounds);
  assert.equal(inflated.length, 1);
  assert.notEqual(inflated[0], source);
  assert.equal(inflated[0].x, source.x);
  assert.equal(inflated[0].z, source.z);
  assert.equal(inflated[0].kind, 'railing');
  assert.equal(inflated[0].workspaceIndex, 2);
  near(inflated[0].halfX, .375);
  near(inflated[0].halfZ, 2.72);
  assert.equal(source.halfX, .055);
  assert.equal(source.halfZ, 2.4);
  near(inflateObstacles(bounds, .5)[0].halfX, .555);
});

test('full-height room panels retain walking limb clearance without enlarging furniture or visual bounds', () => {
  const wall = Object.freeze({ x: 4, z: 2.25, halfX: 2, halfZ: .09, kind: 'room-wall', roomId: 'studio' });
  const furniture = Object.freeze({ ...box });
  const [panel, desk] = inflateObstacles(Object.freeze([wall, furniture]));
  near(panel.halfX, 2.5); near(panel.halfZ, .59);
  near(desk.halfX, 1.32); near(desk.halfZ, 1.32);
  assert.equal(panel.roomId, 'studio');
  assert.equal(wall.halfX, 2); assert.equal(wall.halfZ, .09);
  const [minimumWall, smallDesk] = inflateObstacles([wall, furniture], .1);
  near(minimumWall.halfZ, .59, 1e-9);
  near(smallDesk.halfX, 1.1);
  near(inflateObstacles([wall], .8)[0].halfZ, .89, 1e-9);
});

test('wall bumps keep the walking limb envelope outside every panel side while the doorway stays open', () => {
  const physical = { x: 0, z: 0, halfX: 2, halfZ: .09, kind: 'room-wall' };
  const [wall] = inflateObstacles([physical]);
  // The actual garden walking probe measured a .37242-unit hand projection.
  // Include the forward sole and that hand envelope at every held-key bump.
  const limbReach = .38;
  for (const [axis, half] of [['x', 'halfX'], ['z', 'halfZ']]) for (const sign of [-1, 1]) {
    const other = axis === 'x' ? 'z' : 'x';
    let position = { x: 0, z: 0, [axis]: sign * (physical[half] + 2) };
    const goal = { ...position, [axis]: -sign * (physical[half] + 2) };
    const stopped = moveUntilBlocked(position, goal, [wall]);
    assert.equal(stopped.blocked, true);
    assert.equal(stopped[other], 0, 'a wall never slides the character along its face');
    assert.ok(Math.abs(stopped[axis]) - physical[half] > limbReach, 'hands and shoes remain outside the actual panel');
    position = stopped;
    for (let frame = 0; frame < 20; frame++) {
      const next = moveUntilBlocked(position, { ...position, [axis]: position[axis] - sign * .1125 }, [wall]);
      assert.equal(next.blocked, true);
      near(next.x, stopped.x); near(next.z, stopped.z);
      position = next;
    }
    const away = moveUntilBlocked(position, { ...position, [axis]: position[axis] + sign }, [wall]);
    assert.equal(away.blocked, false, 'the visitor can back away deliberately');
  }
  const doorway = inflateObstacles([-1, 1].map(sign => ({ ...physical, x: sign * 2, halfX: .9 })));
  const through = moveUntilBlocked({ x: 0, z: 3 }, { x: 0, z: -3 }, doorway);
  assert.equal(through.blocked, false, 'the wall clearance leaves the central doorway open');
  const besideDoor = moveUntilBlocked({ x: .9, z: 3 }, { x: .9, z: -3 }, doorway);
  assert.equal(besideDoor.blocked, true, 'the solid panel beside the door still stops the character');
});

test('a held forward key stays stopped just outside the object after the first bump', () => {
  let position = { x: -3, z: .25 };
  const first = moveUntilBlocked(position, { x: 3, z: .25 }, [box]);
  assert.equal(first.blocked, true);
  assert.equal(first.obstacle, box);
  assert.ok(first.x < -1 && first.x > -1.001, 'the avatar stops immediately before contact');
  assert.equal(first.z, .25);
  assert.equal(inside(first, box), false);
  position = first;
  for (let frame = 0; frame < 120; frame++) {
    const result = moveUntilBlocked(position, { x: position.x + .08, z: position.z }, [box]);
    assert.equal(result.blocked, true);
    near(result.x, first.x, 1e-7);
    near(result.z, first.z);
    position = result;
  }
});

test('a diagonal bump stops both axes instead of automatically sliding around the object', () => {
  const from = { x: -3, z: -2 }, to = { x: 3, z: 1 };
  const result = moveUntilBlocked(from, to, [box]);
  assert.equal(result.blocked, true);
  assert.ok(result.x < -1 && result.x > -1.001);
  assert.ok(result.z < -1 && result.z > -1.001);
  near((result.x - from.x) / (to.x - from.x), (result.z - from.z) / (to.z - from.z));
  assert.equal(inside(result, box), false);
});

test('a clear walking direction reaches the requested position in full', () => {
  const to = { x: 4, z: 2 };
  const result = moveUntilBlocked({ x: -4, z: 2 }, to, [box]);
  assert.equal(result.x, to.x);
  assert.equal(result.z, to.z);
  assert.equal(result.blocked, false);
  assert.equal(result.obstacle, null);
  assert.equal(segmentObstacleEntry({ x: -4, z: 2 }, to, box), null);
});

test('the player can deliberately move aside or back away after hitting an object', () => {
  const stopped = moveUntilBlocked({ x: -3, z: 0 }, { x: 3, z: 0 }, [box]);
  const aside = moveUntilBlocked(stopped, { x: stopped.x, z: 2 }, [box]);
  assert.equal(aside.blocked, false);
  assert.equal(aside.z, 2);
  const past = moveUntilBlocked(aside, { x: 3, z: 2 }, [box]);
  assert.equal(past.blocked, false);
  near(past.x, 3);
  const back = moveUntilBlocked(stopped, { x: -3, z: 0 }, [box]);
  assert.equal(back.blocked, false);
  assert.equal(back.x, -3);
  const approachAgain = moveUntilBlocked(back, { x: 3, z: 0 }, [box]);
  assert.equal(approachAgain.blocked, true);
  near(approachAgain.x, stopped.x);
});

test('a large movement step cannot tunnel through a thin railing even with a clear endpoint', () => {
  const rail = { x: .123, z: 0, halfX: .055, halfZ: 4, kind: 'railing' };
  const from = { x: -20, z: .5 }, to = { x: 20, z: .5 };
  assert.equal(inside(from, rail), false);
  assert.equal(inside(to, rail), false);
  const result = moveUntilBlocked(from, to, [rail]);
  assert.equal(result.blocked, true);
  assert.equal(result.obstacle, rail);
  assert.ok(result.x < rail.x - rail.halfX);
  assert.ok(result.x > rail.x - rail.halfX - .001);
  assert.equal(result.z, .5);
});

test('movement stops at the earliest physical obstacle regardless of array order', () => {
  const nearBox = { x: -1, z: 0, halfX: .5, halfZ: .5, kind: 'plant' };
  const farBox = { x: 3, z: 0, halfX: 1, halfZ: 1, kind: 'sofa' };
  const result = moveUntilBlocked({ x: -5, z: 0 }, { x: 6, z: 0 }, [farBox, nearBox]);
  assert.equal(result.blocked, true);
  assert.equal(result.obstacle, nearBox);
  assert.ok(result.x < -1.5 && result.x > -1.501);
  near(segmentObstacleEntry({ x: -5, z: 0 }, { x: 6, z: 0 }, nearBox), 3.5 / 11);
});

test('touching an edge or corner does not trap the player, but moving into it is blocked', () => {
  for (const [from, to] of [
    [{ x: -3, z: -1 }, { x: 3, z: -1 }],
    [{ x: -2, z: 0 }, { x: 0, z: -2 }],
    [{ x: -1, z: 0 }, { x: -3, z: 0 }],
    [{ x: -1, z: 0 }, { x: -1, z: 2 }],
  ]) {
    assert.equal(segmentObstacleEntry(from, to, box), null);
    const result = moveUntilBlocked(from, to, [box]);
    assert.equal(result.blocked, false);
    near(result.x, to.x);
    near(result.z, to.z);
  }
  assert.equal(segmentObstacleEntry({ x: -1, z: 0 }, { x: 0, z: 0 }, box), 0);
  const into = moveUntilBlocked({ x: -1, z: 0 }, { x: 0, z: 0 }, [box]);
  assert.equal(into.blocked, true);
  assert.equal(inside(into, box), false);
  near(into.x, -1);
});

test('a routed corner tangent remains clear when split into actual walking frames', () => {
  // This shared-room route grazes the inflated beanbag corner (3.57, -28.03).
  // Repeated frame-sized steps introduce round-off that must not create a bump
  // when the complete route segment is already clear.
  const beanbag = { x: 2.6, z: -29, halfX: .97, halfZ: .97, kind: 'beanbag' };
  const start = { x: 8.450000000000001, z: -29.25 };
  const goal = { x: 3.25, z: -27.95 };
  assert.equal(segmentObstacleEntry(start, goal, beanbag), null);
  let position = start;
  for (let frame = 0; frame < 100 && Math.hypot(goal.x - position.x, goal.z - position.z) > .0001; frame++) {
    const length = Math.hypot(goal.x - position.x, goal.z - position.z);
    const step = Math.min(2.25 / 20, length);
    const next = {
      x: position.x + (goal.x - position.x) / length * step,
      z: position.z + (goal.z - position.z) / length * step,
    };
    const result = moveUntilBlocked(position, next, [beanbag]);
    assert.equal(result.blocked, false, `a tangent route must remain clear at frame ${frame}`);
    position = { x: result.x, z: result.z };
  }
  near(position.x, goal.x);
  near(position.z, goal.z);
});

test('a diagonal corner crossing is caught even when both endpoints are clear', () => {
  const from = { x: -2, z: .1 }, to = { x: .1, z: -2 };
  assert.equal(inside(from, box), false);
  assert.equal(inside(to, box), false);
  const result = moveUntilBlocked(from, to, [box]);
  assert.equal(result.blocked, true);
  assert.ok(result.x < -1 && result.x > -1.001);
  assert.ok(result.z > -1 && result.z < -.89);
  assert.equal(inside(result, box), false);
});
