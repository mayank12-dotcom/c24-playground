import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecruiterBumpGate, createRecruiterDuel, PM_ATTACK_MS,
  PM_FALL_MS, PM_GROUND_MS, PM_RECOVER_MS, PM_SLAM_MS, PM_SLAM_COOLDOWN_MS } from '../src/recruiter-combat.js';

const home = { x: 0, z: 0, rotation: 0 }, landing = { x: 1.2, z: .22 };
function fixture({ initialAttack } = {}) {
  const duel = createRecruiterDuel({ home, landing });
  let now = 10_000;
  assert.equal(duel.start({ id: 'encounter-a', ownerId: 'visitor-a', startedAt: now }, { initialAttack, now }), true);
  const start = initialAttack ? home : landing;
  const player = { x: start.x, z: start.z + .91, rotation: Math.PI };
  const options = { player };
  const tick = (duration, extra = {}) => {
    let impacts = [];
    for (let consumed = 0; consumed < duration;) {
      const dt = Math.min(25, duration - consumed); consumed += dt; now += dt;
      impacts.push(...duel.update(dt, { ...options, ...extra, now }).impacts);
    }
    return impacts;
  };
  const fight = () => { tick(PM_FALL_MS + PM_GROUND_MS + PM_RECOVER_MS + 25); assert.equal(duel.getState().phase, 'fighting'); };
  return { duel, player, tick, fight, now: () => now };
}

test('a held contact, including switching from recruiter to chair, remains a single bump', () => {
  const gate = createRecruiterBumpGate();
  assert.equal(gate.update('recruiter', 1000), true);
  for (let now = 1010; now < 5000; now += 10) assert.equal(gate.update(now % 2 ? 'chair' : 'recruiter', now), false);
  gate.update(null, 5000);
  assert.equal(gate.update('chair', 5100), false, 'a brief contact flicker cannot rearm it');
  gate.update(null, 5200); gate.update(null, 5400);
  assert.equal(gate.update('chair', 5500), true);
});

test('three separated deliberate contacts count while quick repeated taps are rejected', () => {
  const gate = createRecruiterBumpGate();
  let accepted = 0;
  for (const start of [1000, 2000, 3000]) {
    if (gate.update('chair', start)) accepted++;
    gate.update(null, start + 10); gate.update(null, start + 300);
  }
  assert.equal(accepted, 3);
  assert.equal(gate.update('chair', 3400), false, 'a rearmed contact still respects impact cooldown');
  gate.reset(); assert.equal(gate.update('chair', 0), true);
  assert.equal(gate.update('chair', Infinity), false);
});

test('the recruiter falls, pauses, recovers and approaches while player strikes remain available', () => {
  const f = fixture();
  assert.equal(f.duel.attack('punch', f.now()), true);
  f.tick(PM_FALL_MS - 25); assert.equal(f.duel.getState().phase, 'falling');
  f.tick(25); assert.equal(f.duel.getState().phase, 'grounded');
  assert.deepEqual({ x: f.duel.getState().x, z: f.duel.getState().z }, landing);
  f.tick(PM_GROUND_MS); assert.equal(f.duel.getState().phase, 'recovering');
  f.tick(PM_RECOVER_MS); assert.equal(f.duel.getState().phase, 'approaching');
  f.tick(25); assert.equal(f.duel.getState().phase, 'fighting');
  assert.equal(f.duel.attack('punch', f.now()), true);
});

test('a blocked fall holds both its root and its visible pose clock until space clears', () => {
  const f = fixture(); f.tick(200);
  const held = f.duel.getState();
  f.tick(2000, { canAdvanceFall: () => false });
  assert.deepEqual(f.duel.getState(), held);
  f.tick(PM_FALL_MS - 200); assert.equal(f.duel.getState().phase, 'grounded');
});

test('punches and kicks connect at their visible midpoint only once with separate cooldowns', () => {
  const f = fixture(); f.fight();
  assert.equal(f.duel.attack('punch', f.now()), true);
  assert.equal(f.duel.attack('kick', f.now()), false, 'an active punch cannot be overwritten');
  assert.equal(f.tick(PM_ATTACK_MS.punch / 2 - 25).length, 0);
  const hit = f.tick(25).filter(impact => impact.actor === 'player');
  assert.equal(hit.length, 1); assert.equal(hit[0].type, 'punch');
  assert.equal(f.duel.getState().recruiterHealth, 80);
  assert.equal(f.duel.update(0, { now: f.now(), player: f.player }).impacts.length, 0);
  assert.equal(f.tick(PM_ATTACK_MS.punch / 2).filter(impact => impact.actor === 'player').length, 0);
  assert.equal(f.duel.attack('kick', f.now()), true);
  assert.equal(f.tick(PM_ATTACK_MS.kick / 2).filter(impact => impact.actor === 'player').length, 1);
  assert.equal(f.duel.getState().recruiterHealth, 50);
});

test('an attack facing away is a miss and is never replayed when the player turns back', () => {
  const f = fixture(); f.fight();
  f.player.rotation = 0;
  assert.equal(f.duel.attack('punch', f.now()), true);
  assert.equal(f.tick(300).filter(impact => impact.actor === 'player').length, 0);
  f.player.rotation = Math.PI;
  assert.equal(f.tick(250).filter(impact => impact.actor === 'player').length, 0);
  assert.equal(f.duel.getState().recruiterHealth, 100);
});

test('stepping out of range at the impact makes a miss rather than a distant hit', () => {
  const f = fixture(); f.fight();
  assert.equal(f.duel.attack('punch', f.now()), true);
  f.player.z += 3;
  const hits = f.tick(600, { move: from => ({ ...from, blocked: true }) });
  assert.equal(hits.filter(impact => impact.actor === 'player').length, 0);
  assert.equal(f.duel.getState().recruiterHealth, 100);
});

test('strikes respect the measured hand and foot reach rather than a shared wide radius', () => {
  for (const [type, range] of [['punch', 1.1], ['kick', .94]]) {
    for (const [gap, expected] of [[range - .005, 1], [range + .005, 0]]) {
      const f = fixture(); f.fight();
      const recruiter = f.duel.getState();
      f.player.x = recruiter.x; f.player.z = recruiter.z + gap;
      assert.equal(f.duel.attack(type, f.now()), true);
      const hits = f.tick(PM_ATTACK_MS[type] / 2, { move: from => ({ ...from, blocked: true }) });
      assert.equal(hits.filter(hit => hit.actor === 'player').length, expected, `${type} at distance ${gap}`);
    }
  }
});

test('approaching closes to visible kick reach before entering the fighting stage', () => {
  const f = fixture(); f.player.z = landing.z + 1.02;
  f.tick(PM_FALL_MS + PM_GROUND_MS + PM_RECOVER_MS);
  assert.equal(f.duel.getState().phase, 'approaching');
  f.tick(100);
  const recruiter = f.duel.getState();
  assert.equal(recruiter.phase, 'fighting');
  assert.ok(Math.hypot(recruiter.x - f.player.x, recruiter.z - f.player.z) <= .94);
  assert.equal(f.duel.attack('kick', f.now()), true);
  assert.equal(f.tick(PM_ATTACK_MS.kick / 2).filter(hit => hit.actor === 'player').length, 1);
});

test('the recruiter counterpunches after a visible grace period and does not hit per frame', () => {
  const f = fixture(); f.fight();
  assert.equal(f.tick(450).filter(hit => hit.actor === 'recruiter').length, 0);
  assert.equal(f.duel.getState().playerHealth, 100);
  const impacts = f.tick(600).filter(hit => hit.actor === 'recruiter');
  assert.equal(impacts.length, 1); assert.equal(f.duel.getState().playerHealth, 86);
  assert.equal(f.tick(200).filter(hit => hit.actor === 'recruiter').length, 0);
});

test('attack timestamps retain finite fractional frame times accepted by shared presence', () => {
  const f = fixture(); f.fight();
  let now = f.now();
  for (let frame = 0; frame < 40; frame++) {
    now += 1000 / 60;
    f.duel.update(1000 / 60, { now, player: f.player });
    const attack = f.duel.getState().recruiterAttack;
    if (attack) assert.ok(Number.isFinite(attack.startedAt) && attack.startedAt >= 0 && attack.startedAt <= Number.MAX_SAFE_INTEGER,
      'shared AI actions use bounded finite epoch milliseconds accepted by the API');
  }
  assert.equal(f.duel.attack('punch', now + .25), true);
  assert.equal(f.duel.getState().playerAttack.startedAt, now + .25, 'sub-millisecond frame timing is preserved without quantization');
});

test('solid movement can stop a pursuit without allowing the root to cross the obstacle', () => {
  const f = fixture(); f.player.z = 5;
  f.tick(PM_FALL_MS + PM_GROUND_MS + PM_RECOVER_MS);
  const before = f.duel.getState(); let sweeps = 0;
  f.tick(1000, { move(from) { sweeps++; return { ...from, blocked: true }; } });
  assert.ok(sweeps > 0); assert.equal(f.duel.getState().x, before.x); assert.equal(f.duel.getState().z, before.z);
  f.tick(500); assert.ok(f.duel.getState().z > before.z);
});

test('ending during the fall still completes a supported recovery before returning', () => {
  const f = fixture(); f.tick(200); f.duel.end();
  assert.equal(f.duel.getState().phase, 'falling');
  f.tick(PM_FALL_MS + PM_GROUND_MS + PM_RECOVER_MS - 200);
  assert.equal(f.duel.getState().phase, 'returning');
  assert.equal(f.duel.getState().outcome, 'disengaged');
  f.tick(3000); assert.equal(f.duel.getState().phase, 'seated');
  assert.deepEqual({ x: f.duel.getState().x, z: f.duel.getState().z }, { x: home.x, z: home.z });
});

test('a return waits on a blocked route and on the world seat transfer instead of teleporting', () => {
  const f = fixture(); f.fight(); f.duel.end();
  const before = f.duel.getState();
  f.tick(1000, { move: from => ({ ...from, blocked: true }) });
  assert.equal(f.duel.getState().x, before.x); assert.equal(f.duel.getState().z, before.z);
  f.tick(3000, { canReturnSeat: () => false });
  assert.equal(f.duel.getState().phase, 'returning');
  assert.ok(Math.hypot(f.duel.getState().x, f.duel.getState().z) < .00002);
  f.tick(25, { canReturnSeat: () => true }); assert.equal(f.duel.getState().phase, 'seated');
});

test('a completed duel can be started by another visitor with fresh health and unique contacts', () => {
  const f = fixture(); f.fight(); f.duel.end(); f.tick(3000);
  assert.equal(f.duel.start({ id: 'encounter-b', ownerId: 'visitor-b', startedAt: f.now() }), true);
  assert.equal(f.duel.getIdentity().ownerId, 'visitor-b');
  assert.equal(f.duel.getState().playerHealth, 100);
  assert.equal(f.duel.getState().recruiterHealth, 100);
  assert.equal(f.duel.getState().outcome, null);
  assert.equal(f.duel.getState().hitSeq, 0);
});

test('successful kicks can beat the recruiter and finish the encounter without negative health', () => {
  const f = fixture(); f.fight();
  for (let strike = 0; strike < 4; strike++) {
    assert.equal(f.duel.attack('kick', f.now()), true);
    f.tick(PM_ATTACK_MS.kick);
  }
  assert.equal(f.duel.getState().recruiterHealth, 0);
  assert.equal(f.duel.getState().phase, 'returning');
  assert.equal(f.duel.getState().outcome, 'player');
  assert.equal(f.duel.attack('punch', f.now()), false);
  f.tick(3000); assert.equal(f.duel.getState().phase, 'seated');
});

test('a player who does not defend can lose, and the recruiter still returns to the desk', () => {
  const f = fixture(); f.fight();
  for (let frame = 0; frame < 520 && f.duel.getState().phase === 'fighting'; frame++) f.tick(25);
  assert.equal(f.duel.getState().playerHealth, 0);
  assert.equal(f.duel.getState().outcome, 'recruiter');
  assert.equal(f.duel.getState().phase, 'returning');
  f.tick(3000); assert.equal(f.duel.getState().phase, 'seated');
});

test('invalid movement proposals cannot teleport the recruiter and public state cannot mutate its controller', () => {
  const f = fixture(); f.player.z = 5;
  f.tick(PM_FALL_MS + PM_GROUND_MS + PM_RECOVER_MS);
  const before = f.duel.getState();
  f.tick(500, { move: () => ({ x: 100, z: 100, blocked: false }) });
  assert.equal(f.duel.getState().x, before.x); assert.equal(f.duel.getState().z, before.z);
  const snapshot = f.duel.getState(); snapshot.x = NaN; snapshot.phase = 'seated';
  assert.ok(Number.isFinite(f.duel.getState().x));
  assert.equal(f.duel.getState().phase, 'approaching');
});

test('an active encounter cannot be overwritten by another start or malformed identity', () => {
  const f = fixture();
  assert.equal(f.duel.start({ id: 'second', ownerId: 'visitor-b', startedAt: f.now() }), false);
  assert.equal(f.duel.getIdentity().ownerId, 'visitor-a');
  const idle = createRecruiterDuel({ home, landing });
  assert.equal(idle.start({ id: '', ownerId: 'visitor-a', startedAt: 0 }), false);
  assert.equal(idle.start({ id: 'valid', ownerId: 'visitor-a', startedAt: NaN }), false);
  assert.equal(idle.getState().phase, 'seated');
});

test('a custom chair-nudge trajectory starts at its real first point rather than the later return anchor', () => {
  const duel = createRecruiterDuel({ home: { x: 0, z: -.45, rotation: 0 }, landing,
    fallPosition: progress => ({ x: progress * landing.x, z: progress * landing.z }) });
  assert.equal(duel.start({ id: 'rolling-chair', ownerId: 'visitor-a', startedAt: 0 }), true);
  assert.equal(duel.getState().x, 0);
  assert.equal(duel.getState().z, 0);
  duel.update(25, { now: 25, player: { x: 2, z: 2 } });
  assert.ok(duel.getState().z >= 0 && duel.getState().z < .02, 'the first frame stays continuous with the visible seated recruiter');
});

test('lease-loss cleanup resumes the exact shared pose and returns smoothly instead of resetting home', () => {
  const f = fixture(); f.fight(); f.duel.attack('punch', f.now()); f.tick(300);
  const snapshot = f.duel.getState(), identity = f.duel.getIdentity();
  const cleanup = createRecruiterDuel({ home, landing });
  assert.equal(cleanup.resume(identity, { ...snapshot, ignoredExtra: 'drop this' }, f.now()), true);
  assert.deepEqual(cleanup.getState(), snapshot, 'only the validated core combat state is restored');
  cleanup.end();
  assert.equal(cleanup.getState().x, snapshot.x); assert.equal(cleanup.getState().z, snapshot.z);
  const frame = cleanup.update(25, { now: f.now() + 25, player: f.player });
  assert.equal(frame.impacts.length, 0);
  assert.ok(Math.hypot(frame.state.x - snapshot.x, frame.state.z - snapshot.z) <= 1.7 * .025 + .00001);
  for (let tick = 1; tick <= 120 && cleanup.getState().phase !== 'seated'; tick++) cleanup.update(25, { now: f.now() + 25 * (tick + 1), player: f.player });
  assert.equal(cleanup.getState().phase, 'seated');
});

test('resuming a disconnected owner during a fall finishes recovery before returning', () => {
  const f = fixture(); f.tick(200);
  const snapshot = f.duel.getState(), cleanup = createRecruiterDuel({ home, landing });
  assert.equal(cleanup.resume(f.duel.getIdentity(), snapshot, f.now()), true);
  cleanup.end();
  assert.equal(cleanup.getState().phase, 'falling');
  cleanup.update(25, { now: f.now() + 25, player: f.player });
  assert.equal(cleanup.getState().elapsed, snapshot.elapsed + 25);
  assert.equal(cleanup.getState().phase, 'falling');
});

test('malformed replicated combat is rejected without changing an idle controller', () => {
  const f = fixture(); f.fight();
  for (const patch of [{ x: NaN }, { phase: 'teleport' }, { playerHealth: 1000 }, { elapsed: -1 },
    { recruiterAttack: { type: 'kick', seq: 1, startedAt: Infinity } }, { hitSeq: Infinity },
    { chairOffset: -.8 }, { sitProgress: 2 }]) {
    const cleanup = createRecruiterDuel({ home, landing });
    assert.equal(cleanup.resume(f.duel.getIdentity(), { ...f.duel.getState(), ...patch }, f.now()), false);
    assert.equal(cleanup.getState().phase, 'seated');
  }
});

test('replicated chair and lowering offsets survive cleanup alongside valid fractional health and attack timing', () => {
  const f = fixture(); f.fight();
  const snapshot = { ...f.duel.getState(), playerHealth: 85.5, chairOffset: -.45, sitProgress: .3,
    hitSeq: 1_000_000, recruiterAttack: { type: 'punch', seq: 0, startedAt: f.now() - 30.333 } };
  const cleanup = createRecruiterDuel({ home, landing });
  assert.equal(cleanup.resume(f.duel.getIdentity(), snapshot, f.now()), true);
  assert.deepEqual(cleanup.getState(), snapshot);
  cleanup.end();
  assert.equal(cleanup.getState().chairOffset, -.45);
  assert.equal(cleanup.getState().sitProgress, .3);
});

test('walking away or timing out ends the exchange while malformed optional input stays finite', () => {
  const f = fixture(); f.fight(); f.player.z = 20; f.tick(25);
  assert.equal(f.duel.getState().phase, 'returning');
  const g = fixture(); g.fight();
  g.tick(20_000, { player: { x: landing.x, z: landing.z + 3, rotation: Math.PI }, move: from => ({ ...from, blocked: true }) });
  assert.equal(g.duel.getState().phase, 'returning');
  for (const dt of [NaN, Infinity, -100]) {
    g.duel.update(dt, { now: NaN, player: { x: NaN, z: Infinity } });
    for (const field of ['x', 'z', 'rotation', 'elapsed', 'playerHealth', 'recruiterHealth']) assert.ok(Number.isFinite(g.duel.getState()[field]));
  }
  assert.equal(g.duel.attack('unknown', g.now()), false);
  assert.throws(() => createRecruiterDuel({ home: { x: NaN, z: 0 }, landing }), TypeError);
});

test('a close chase stays within the twelve-unit home leash and returns without teleporting', () => {
  const f = fixture(); f.fight();
  let previous = f.duel.getState(), frames = 0;
  while (f.duel.getState().phase === 'fighting' && frames++ < 600) {
    f.player.x = previous.x; f.player.z = previous.z + 1.2;
    assert.ok(Math.hypot(previous.x - f.player.x, previous.z - f.player.z) < 8,
      'the home leash remains effective while the player stays close to the recruiter');
    f.tick(25);
    const next = f.duel.getState();
    assert.ok(Math.hypot(next.x - previous.x, next.z - previous.z) <= 1.7 * .025 + .00001,
      'the recruiter never jumps home when the leash is reached');
    previous = next;
  }
  assert.equal(previous.phase, 'returning');
  assert.equal(previous.outcome, 'disengaged');
  assert.ok(Math.hypot(f.player.x - home.x, f.player.z - home.z) > 12);
  assert.ok(Math.hypot(previous.x - home.x, previous.z - home.z) <= 12);
  f.tick(9000); assert.equal(f.duel.getState().phase, 'seated');

  const outside = createRecruiterDuel({ home, landing });
  const snapshot = { ...previous, phase: 'fighting', elapsed: 0, x: 12.01, z: 0, rotation: -Math.PI / 2 };
  assert.equal(outside.resume({ id: 'outside-home', ownerId: 'visitor-a', startedAt: 0 }, snapshot, 1000), true);
  const result = outside.update(25, { now: 1025, player: { x: 11.1, z: 0, rotation: Math.PI / 2 } });
  assert.equal(result.state.phase, 'returning', 'a recruiter outside the leash returns even when the player remains inside');
  assert.equal(result.state.x, snapshot.x, 'the first return frame preserves the actual outside position');
});

test('a direct punch starts seated and knocks the recruiter down only at actual contact', () => {
  const f = fixture({ initialAttack: 'punch' });
  assert.equal(f.duel.getState().phase, 'provoking');
  assert.deepEqual({ x: f.duel.getState().x, z: f.duel.getState().z }, { x: home.x, z: home.z });
  assert.equal(f.duel.getState().recruiterHealth, 100);
  assert.equal(f.tick(PM_ATTACK_MS.punch / 2 - 25).length, 0);
  assert.equal(f.duel.getState().phase, 'provoking');
  const contacts = f.tick(25);
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].type, 'punch');
  assert.equal(f.duel.getState().phase, 'falling');
  assert.equal(f.duel.getState().elapsed, 0, 'the seated roll and tumble begin after contact rather than at button press');
  assert.equal(f.duel.getState().recruiterHealth, 80);
  f.tick(25);
  assert.ok(f.duel.getState().elapsed > 0);
  assert.ok(Math.hypot(f.duel.getState().x - home.x, f.duel.getState().z - home.z) < .04);
});

test('a missed direct kick leaves the recruiter seated, and a later connected strike can provoke them', () => {
  const f = fixture({ initialAttack: 'kick' });
  f.player.rotation = 0;
  assert.equal(f.tick(PM_ATTACK_MS.kick).length, 0);
  assert.equal(f.duel.getState().phase, 'provoking');
  assert.equal(f.duel.getState().recruiterHealth, 100);
  f.player.rotation = Math.PI;
  assert.equal(f.duel.attack('punch', f.now()), true);
  assert.equal(f.tick(PM_ATTACK_MS.punch / 2).length, 1);
  assert.equal(f.duel.getState().phase, 'falling');
});

test('a direct encounter accepts the initial action on its shared identity and can end while still seated', () => {
  const duel = createRecruiterDuel({ home, landing });
  assert.equal(duel.start({ id: 'direct-owner', ownerId: 'visitor-a', startedAt: 1000, initialAttack: 'kick' }, { now: 1200 }), true);
  assert.equal(duel.getState().phase, 'provoking');
  assert.deepEqual(duel.getState().playerAttack, { type: 'kick', seq: 1, startedAt: 1200 });
  duel.end();
  assert.equal(duel.getState().phase, 'seated');
  assert.equal(duel.getState().playerAttack, null);
  assert.deepEqual({ x: duel.getState().x, z: duel.getState().z }, { x: home.x, z: home.z });
});

test('falling, grounded, recovering and approaching targets still resolve each player strike once', () => {
  for (const phase of ['falling', 'grounded', 'recovering', 'approaching']) {
    const f = fixture(), initial = { ...f.duel.getState(), phase, x: landing.x, z: landing.z, elapsed: 0,
      slamHits: 3, slamReady: true };
    const duel = createRecruiterDuel({ home, landing });
    assert.equal(duel.resume(f.duel.getIdentity(), initial, f.now()), true);
    if (phase !== 'approaching') assert.equal(duel.attack('slam', f.now(), { slamLanding: { x: landing.x + 1, z: landing.z } }), false,
      'a grounded or recovering target must stand before a charged throw can begin');
    assert.equal(duel.attack('kick', f.now()), true, `kicks remain available during ${phase}`);
    let now = f.now(), impacts = [];
    for (let frame = 0; frame < PM_ATTACK_MS.kick / 25; frame++) {
      now += 25;
      impacts.push(...duel.update(25, { now, player: f.player, canAdvanceFall: () => false,
        move: from => ({ ...from, blocked: true }) }).impacts);
    }
    assert.equal(impacts.filter(hit => hit.actor === 'player').length, 1, `${phase} has one visible contact`);
    assert.equal(duel.getState().recruiterHealth, 70);
    if (phase !== 'approaching') assert.equal(duel.getState().elapsed, 0,
      'a held pose clock does not prevent the independent player action reaching contact');
  }
});

test('actual limb contact can reject a ground hit or authorize a measured larger body footprint', () => {
  for (const contactAllowed of [false, true]) {
    const f = fixture(), duel = createRecruiterDuel({ home, landing });
    assert.equal(duel.resume(f.duel.getIdentity(), { ...f.duel.getState(), phase: 'grounded', ...landing }, f.now()), true);
    f.player.z = landing.z + 1.05;
    assert.equal(duel.attack('kick', f.now()), true);
    let now = f.now(), checks = 0, impacts = [];
    for (let frame = 0; frame < PM_ATTACK_MS.kick / 25; frame++) {
      now += 25;
      impacts.push(...duel.update(25, { now, player: f.player, canAdvanceFall: () => false,
        contactRange: ({ type, phase, actorSide }) => {
          assert.equal(type, 'kick'); assert.equal(phase, 'grounded'); assert.equal(actorSide, 'player');
          return 1.1;
        },
        canPlayerContact: (type, target, player) => {
          checks++; assert.equal(type, 'kick'); assert.equal(target.phase, 'grounded');
          assert.equal(player.z, f.player.z); return contactAllowed;
        } }).impacts);
    }
    assert.equal(checks, 1, 'geometry contact is evaluated once for the action');
    assert.equal(impacts.length, contactAllowed ? 1 : 0);
    assert.equal(duel.getState().recruiterHealth, contactAllowed ? 70 : 100);
  }
});

test('three successful contacts charge a slam, which only throws after its grab connects', () => {
  const f = fixture(); f.fight();
  const throwTo = { x: landing.x + 1.2, z: landing.z };
  assert.equal(f.duel.attack('slam', f.now(), { slamLanding: throwTo }), false, 'a slam cannot start before three hits');
  for (let hit = 0; hit < 3; hit++) {
    assert.equal(f.duel.attack('punch', f.now()), true);
    f.tick(PM_ATTACK_MS.punch);
    assert.equal(f.duel.getState().slamHits, hit + 1);
    assert.equal(f.duel.getState().slamReady, hit === 2);
  }
  assert.equal(f.duel.attack('slam', f.now()), false, 'a physically preflighted landing is required');
  assert.equal(f.duel.attack('slam', f.now(), { slamLanding: { x: Infinity, z: 0 } }), false);
  assert.equal(f.duel.attack('slam', f.now(), { slamLanding: throwTo }), true);
  const before = f.duel.getState();
  assert.equal(before.phase, 'fighting', 'requesting a grab never starts a throw or teleports its target');
  assert.equal(f.tick(PM_ATTACK_MS.slam / 2 - 25).filter(hit => hit.actor === 'player').length, 0);
  assert.equal(f.duel.getState().phase, 'fighting');
  const contacts = f.tick(25).filter(hit => hit.actor === 'player');
  assert.equal(contacts.length, 1); assert.equal(contacts[0].type, 'slam');
  const grabbed = f.duel.getState();
  assert.equal(grabbed.phase, 'slamming'); assert.equal(grabbed.elapsed, 0);
  assert.deepEqual(grabbed.slamOrigin, { x: grabbed.x, z: grabbed.z });
  assert.deepEqual(grabbed.slamLanding, throwTo);
  assert.equal(grabbed.slamHits, 0); assert.equal(grabbed.slamReady, false);
  assert.equal(grabbed.slamReadyAt, f.now() + PM_SLAM_COOLDOWN_MS);
  assert.equal(grabbed.recruiterHealth, 5);
  f.tick(3000, { canAdvanceSlam: () => false });
  const held = f.duel.getState();
  assert.equal(held.elapsed, 0); assert.equal(held.x, grabbed.x); assert.equal(held.z, grabbed.z);
  const travel = [];
  f.tick(PM_SLAM_MS, { slamPosition: (progress, state) => {
    travel.push(progress);
    return { x: state.slamOrigin.x + (state.slamLanding.x - state.slamOrigin.x) * progress, z: state.slamOrigin.z };
  } });
  assert.ok(travel.length > 1);
  assert.equal(f.duel.getState().phase, 'grounded');
  assert.equal(f.duel.getState().x, throwTo.x);
  assert.equal(f.duel.getState().hitSeq, grabbed.hitSeq, 'held or resumed throw frames cannot repeat grab contact');
});

test('a missed slam keeps its charge and never enters the throw phase', () => {
  const f = fixture(); f.fight();
  const ready = { ...f.duel.getState(), slamHits: 3, slamReady: true, slamReadyAt: 0 };
  const duel = createRecruiterDuel({ home, landing });
  assert.equal(duel.resume(f.duel.getIdentity(), ready, f.now()), true);
  assert.equal(duel.attack('slam', f.now(), { slamLanding: { x: landing.x + 1, z: landing.z } }), true);
  f.player.rotation = 0;
  let now = f.now(), impacts = [];
  for (let frame = 0; frame < PM_ATTACK_MS.slam / 25; frame++) {
    now += 25; impacts.push(...duel.update(25, { now, player: f.player }).impacts);
  }
  assert.equal(impacts.filter(hit => hit.actor === 'player').length, 0);
  assert.equal(duel.getState().phase, 'fighting');
  assert.equal(duel.getState().slamHits, 3);
  assert.equal(duel.getState().slamReady, true);
  assert.equal(duel.getState().recruiterHealth, 100);
});

test('slam cooldown blocks a new charged grab until eight seconds have elapsed', () => {
  const f = fixture(); f.fight();
  const duel = createRecruiterDuel({ home, landing }), readyAt = f.now() + PM_SLAM_COOLDOWN_MS;
  assert.equal(duel.resume(f.duel.getIdentity(), { ...f.duel.getState(), slamHits: 3, slamReady: false, slamReadyAt: readyAt }, f.now()), true);
  const plan = { slamLanding: { x: landing.x + 1, z: landing.z } };
  assert.equal(duel.attack('slam', readyAt - .001, plan), false);
  assert.equal(duel.attack('slam', readyAt, plan), true);
  assert.equal(duel.getState().slamReady, true);
});

test('replicated throw metadata resumes exactly and completes a supported return after owner departure', () => {
  const f = fixture(), duel = createRecruiterDuel({ home, landing });
  const snapshot = { ...f.duel.getState(), phase: 'slamming', elapsed: 400, x: 1.5, z: .22,
    slamHits: 0, slamReady: false, slamReadyAt: 18_000.5,
    slamOrigin: { x: 1.2, z: .22 }, slamLanding: { x: 2.4, z: .22 } };
  assert.equal(duel.resume(f.duel.getIdentity(), snapshot, f.now()), true);
  assert.deepEqual(duel.getState(), snapshot);
  duel.end(); assert.equal(duel.getState().phase, 'slamming');
  let now = f.now();
  for (let frame = 0; frame < 280 && duel.getState().phase !== 'seated'; frame++) {
    now += 25; duel.update(25, { now, player: f.player });
  }
  assert.equal(duel.getState().phase, 'seated');
  assert.equal(duel.getState().outcome, 'disengaged');
  assert.equal(duel.getState().hitSeq, snapshot.hitSeq, 'observer cleanup never replays an action');
  for (const patch of [{ slamHits: 4 }, { slamReady: 1 }, { slamReadyAt: Infinity },
    { slamOrigin: { x: NaN, z: 0 } }, { slamLanding: { x: 1e9, z: 0 } }]) {
    const invalid = createRecruiterDuel({ home, landing });
    assert.equal(invalid.resume(f.duel.getIdentity(), { ...snapshot, ...patch }, f.now()), false);
  }
});

test('the API’s fresh provoking snapshot with nullable throw endpoints accepts its initial action', () => {
  const duel = createRecruiterDuel({ home, landing }), startedAt = 10_000;
  const snapshot = { ...duel.getState(), phase: 'provoking', slamReady: false, slamReadyAt: startedAt,
    slamHits: 0, slamOrigin: null, slamLanding: null };
  assert.equal(duel.resume({ id: 'fresh-direct', ownerId: 'visitor-a', startedAt }, snapshot, startedAt), true);
  assert.deepEqual(duel.getState(), snapshot);
  assert.equal(duel.attack('punch', startedAt), true);
  const result = duel.update(300, { now: startedAt + 300, player: { x: home.x, z: home.z + .91, rotation: Math.PI } });
  assert.equal(result.state.phase, 'falling');
  assert.equal(result.impacts.length, 1);
});
