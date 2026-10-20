import assert from 'node:assert/strict';
import test from 'node:test';
import { FIGHT_CENTER, FIGHT_CYCLE_MS, FIGHTER_IDS, getFightScene } from '../src/fight-choreography.js';
import { FIGHT_CONTACTS, MAX_FIGHT_FRAME_MS, createFightImpactTracker, getFightSource } from '../src/fight-impacts.js';

function fightersAt(clockMs) {
  return getFightScene(clockMs).states.filter(state => state.fightRole === 'fighter').map(state => ({
    id: state.id, placed: true, visible: true, fightRole: state.fightRole,
    position: { x: state.x, y: 0, z: state.z }, target: { x: state.x, z: state.z },
    fightPose: { ...state.fightPose },
  }));
}

function update(tracker, clockMs, overrides = {}) {
  return tracker.update({ clockMs, fighters: fightersAt(clockMs), ...overrides });
}

test('the six audio slots exactly match the existing visible contact peaks without changing choreography', () => {
  assert.equal(FIGHT_CONTACTS.length, 6);
  assert.deepEqual(FIGHT_CONTACTS.map(contact => contact.atMs), [5150, 6150, 7150, 8150, 10975, 12175]);
  for (const contact of FIGHT_CONTACTS) {
    const scene = getFightScene(contact.atMs);
    const attacker = scene.states.find(state => state.id === contact.attackerId);
    const defender = scene.states.find(state => state.id === contact.defenderId);
    assert.equal(attacker.fightPose[contact.type], .5, `${contact.slot} reaches the action's contact midpoint`);
    assert.equal(attacker.impact, 1, `${contact.slot} aligns with the existing impact graphic`);
    if (contact.type === 'punch') assert.equal(attacker.fightPose.punchSide, contact.side);
    else assert.equal(defender.fightPose.grounded, true);
    assert.notEqual(attacker.id, defender.id);
    assert.ok(Object.isFrozen(contact));
  }
});

test('initialization on a contact is silent and the next genuine crossing emits once', () => {
  const tracker = createFightImpactTracker();
  assert.deepEqual(update(tracker, 5150), []);
  assert.deepEqual(update(tracker, 5150), []);
  assert.deepEqual(update(tracker, 6125), [], 'a jump establishes a new baseline without a backlog');
  const events = update(tracker, 6150);
  assert.equal(events.length, 1); assert.equal(events[0].attackerId, FIGHTER_IDS[1]);
  assert.deepEqual(update(tracker, 6150), []);
  assert.deepEqual(update(tracker, 6175), []);
});

test('different normal frame rates each emit exactly the same four punches and two kicks', () => {
  for (const frameMs of [1000 / 60, 25, 50, 100]) {
    const tracker = createFightImpactTracker(), events = [];
    update(tracker, 0);
    for (let clock = frameMs; clock <= FIGHT_CYCLE_MS + frameMs / 2; clock += frameMs) events.push(...update(tracker, clock));
    assert.equal(events.length, 6, `all six visible contacts at ${frameMs}ms frames`);
    assert.deepEqual(events.map(event => event.type), ['punch', 'punch', 'punch', 'punch', 'kick', 'kick']);
    assert.deepEqual(events.map(event => event.clockMs), FIGHT_CONTACTS.map(contact => contact.atMs));
    assert.equal(new Set(events.map(event => event.id)).size, 6);
  }
});

test('cycle and slot identities remain unique across encounter boundaries and absolute server clocks', () => {
  const tracker = createFightImpactTracker(), events = [], origin = 1_800_000_000_000;
  update(tracker, origin);
  for (let elapsed = 50; elapsed <= FIGHT_CYCLE_MS * 2; elapsed += 50) events.push(...update(tracker, origin + elapsed));
  assert.equal(events.length, 12); assert.equal(new Set(events.map(event => event.id)).size, 12);
  assert.equal(events[6].clockMs - events[0].clockMs, FIGHT_CYCLE_MS);
});

test('the cycle seam itself produces no impact and negative clocks keep valid cycle identities', () => {
  const tracker = createFightImpactTracker(), events = [];
  update(tracker, -FIGHT_CYCLE_MS);
  for (let clock = -FIGHT_CYCLE_MS + 25; clock <= 100; clock += 25) events.push(...update(tracker, clock));
  assert.equal(events.length, 6); assert.ok(events.every(event => event.id.startsWith('garden-fight:-1:')));
});

test('paused and repeated clocks are silent and resume at the next clock crossing without a burst', () => {
  const tracker = createFightImpactTracker(); update(tracker, 5125);
  for (let frame = 0; frame < 100; frame++) assert.deepEqual(update(tracker, 5125, { paused: true }), []);
  assert.equal(update(tracker, 5150).length, 1, 'the held contact occurs once when the actual pose resumes');
  for (let frame = 0; frame < 100; frame++) assert.deepEqual(update(tracker, 5150, { paused: true }), []);
  assert.deepEqual(update(tracker, 5175), []);
});

test('a paused crossed clock never queues its missed contact', () => {
  const tracker = createFightImpactTracker(); update(tracker, 5125);
  assert.deepEqual(update(tracker, 5150, { paused: true }), []);
  assert.deepEqual(update(tracker, 5175), []);
});

test('backward time, large jumps and returning over a recent slot do not replay impacts', () => {
  const tracker = createFightImpactTracker(); update(tracker, 5125);
  assert.equal(update(tracker, 5150).length, 1);
  assert.deepEqual(update(tracker, 5125), []);
  assert.deepEqual(update(tracker, 5150), [], 'the same cycle/slot cannot be sounded twice after a correction');
  assert.deepEqual(update(tracker, 6150 + MAX_FIGHT_FRAME_MS), [], 'a skipped action is dropped');
  assert.deepEqual(update(tracker, 6150 + MAX_FIGHT_FRAME_MS + 25), []);
});

test('reset and invalid clocks establish a fresh silent baseline', () => {
  const tracker = createFightImpactTracker(); update(tracker, 5125); tracker.reset();
  assert.deepEqual(update(tracker, 5150), []);
  assert.deepEqual(tracker.update(), []);
  assert.deepEqual(update(tracker, 6150), []);
  assert.deepEqual(update(tracker, Infinity), []);
  assert.deepEqual(update(tracker, 7150), []);
});

test('unplaced, hidden, missing, spectator and physically separated pairs cannot sound an impact', () => {
  const modifications = [
    fighters => { fighters[0].placed = false; },
    fighters => { fighters[1].visible = false; },
    fighters => { fighters.pop(); },
    fighters => { fighters[0].fightRole = 'spectator'; },
    fighters => { fighters[0].position.x -= 4; fighters[0].target.x -= 4; },
    fighters => { fighters[0].position.x -= .2; },
    fighters => { fighters[0].target = null; },
  ];
  for (const modify of modifications) {
    const tracker = createFightImpactTracker(); update(tracker, 5125);
    const fighters = fightersAt(5150); modify(fighters);
    assert.deepEqual(update(tracker, 5150, { fighters }), []);
    assert.deepEqual(update(tracker, 5175), [], 'restoring visibility does not replay a missed contact');
  }
});

test('only the matching actual punch hand or grounded kick action can produce its slot', () => {
  for (const contact of FIGHT_CONTACTS) {
    const tracker = createFightImpactTracker(); update(tracker, contact.atMs - 25);
    const fighters = fightersAt(contact.atMs), attacker = fighters.find(fighter => fighter.id === contact.attackerId);
    attacker.fightPose[contact.type] = 0;
    assert.deepEqual(update(tracker, contact.atMs, { fighters }), []);
  }
  const punch = createFightImpactTracker(); update(punch, 5125);
  const wrongHand = fightersAt(5150); wrongHand[0].fightPose.punchSide = 'right';
  assert.deepEqual(update(punch, 5150, { fighters: wrongHand }), []);
  const kick = createFightImpactTracker(); update(kick, 10950);
  const upright = fightersAt(10975); upright[1].fightPose.grounded = false;
  assert.deepEqual(update(kick, 10975, { fighters: upright }), []);
});

test('impact events retain solved limb positions as immutable coordinate snapshots', () => {
  const tracker = createFightImpactTracker(); update(tracker, 5125);
  const fighters = fightersAt(5150); fighters[0].punchPosition = { x: -4.7, y: 1.1, z: 9.04 };
  const [event] = update(tracker, 5150, { fighters });
  assert.deepEqual(event.position, fighters[0].punchPosition);
  fighters[0].punchPosition.x = 900;
  assert.equal(event.position.x, -4.7);
  assert.deepEqual(Object.keys(event).sort(), ['attackerId', 'clockMs', 'defenderId', 'id', 'position', 'type']);
});

test('fight source follows actual placed roots independently of action or pause state', () => {
  const fighters = fightersAt(6150);
  assert.deepEqual(getFightSource(fighters), { x: (fighters[0].position.x + fighters[1].position.x) / 2, z: 9 });
  fighters[0].position.x += .3;
  assert.equal(getFightSource(fighters).x, (fighters[0].position.x + fighters[1].position.x) / 2);
  fighters[1].visible = false;
  assert.deepEqual(getFightSource(fighters), FIGHT_CENTER);
  assert.deepEqual(getFightSource([]), FIGHT_CENTER);
});
