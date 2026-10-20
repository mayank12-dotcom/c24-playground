import assert from 'node:assert/strict';
import test from 'node:test';
import { BOT_COUNT, BOT_SPARRING_PAIRS, BOT_TABLE_TENNIS_PAIRS, STATION_POSITIONS, getBots, getBotOccupiedJobs, SOCIAL_BOT_COUNT, getSocialBots } from '../src/crowd.js';
import { COZY_FURNITURE, TABLE_TENNIS_TABLES, getTableTennisState } from '../src/lounge-layout.js';
import { GARDEN_PATHS, GARDEN_WORKSPACES, isGardenBlocked } from '../src/garden-layout.js';
import { SOCIAL_SEATS } from '../src/social-layout.js';
import { BOT_PUSH_HANDOFF_MS, BOT_PUSH_LANDING_OFFSET } from '../src/bot-push.js';
import { FIGHTER_IDS, SPECTATOR_IDS, FIGHT_CYCLE_MS, FIGHT_CENTER, getFightScene, getFightBodyVolumes } from '../src/fight-choreography.js';

const jobs = Array.from({ length: 9 }, (_, index) => ({ id: `job-${index}` }));
const epoch = 1_792_340_000_000;
const sparringIds = BOT_SPARRING_PAIRS.flat();
const routineWalkers = bots => bots.filter(bot => !bot.seatedJobId && !bot.fightRole && !bot.tableTennis);
const loungeBounds = [
  ...COZY_FURNITURE.map(item => {
    const c = Math.abs(Math.cos(item.rotation || 0)), s = Math.abs(Math.sin(item.rotation || 0));
    return { x: item.x, z: item.z, halfX: item.halfX * c + item.halfZ * s, halfZ: item.halfZ * c + item.halfX * s };
  }),
  ...TABLE_TENNIS_TABLES.map(table => ({ x: table.x, z: table.z, halfX: table.width / 2, halfZ: table.length / 2 })),
];
function assertClearGarden(bot, context) {
  assert.equal(isGardenBlocked(bot.x, bot.z, .28), false, `${bot.id} crossed a garden railing, tree, or furnishing ${context}`);
  for (const item of loungeBounds) {
    assert.ok(Math.abs(bot.x - item.x) >= item.halfX + .28 || Math.abs(bot.z - item.z) >= item.halfZ + .28,
      `${bot.id} crossed lounge furniture ${context}`);
  }
}

test('fifteen shared bots have deterministic appearances, positions, and occupied seats', () => {
  const bots = getBots(epoch, jobs);
  assert.deepEqual(bots, getBots(epoch, jobs));
  assert.equal(bots.length, BOT_COUNT);
  assert.equal(new Set(bots.map(bot => bot.id)).size, BOT_COUNT);
  assert.deepEqual(STATION_POSITIONS, GARDEN_WORKSPACES.map(({ x, z }) => [x, z]), 'bots and shared seat ownership use the garden plan');
  assert.equal(bots.filter(bot => bot.tableTennis).length, 4);
  assert.equal(bots.filter(bot => bot.fightRole === 'fighter').length, 2);
  assert.equal(bots.filter(bot => bot.fightRole === 'spectator').length, 3);
  assert.equal(routineWalkers(bots).length, 3);
  const sitting = bots.filter(bot => bot.seatedJobId);
  assert.equal(sitting.length, 3);
  assert.deepEqual(getBotOccupiedJobs(epoch, jobs), ['job-2', 'job-5', 'job-8']);
  assert.equal(new Set(sitting.map(bot => bot.seatedJobId)).size, 3);
  assert.deepEqual(getBotOccupiedJobs(epoch + 24 * 60 * 60 * 1000, jobs), getBotOccupiedJobs(epoch, jobs));
  for (const bot of sitting) {
    const jobIndex = jobs.findIndex(job => job.id === bot.seatedJobId);
    assert.equal(bot.x, STATION_POSITIONS[jobIndex][0]);
    assert.equal(bot.z, STATION_POSITIONS[jobIndex][1] + 1.5);
    assert.equal(bot.rotation, Math.PI);
    assert.equal(bot.moving, false);
  }
});

test('three routine walkers follow connected garden paths and avoid railings, props, tables and chairs', () => {
  const before = getBots(epoch, jobs);
  const after = getBots(epoch + 50, jobs);
  assert.equal(routineWalkers(before).length, 3);
  assert.deepEqual(routineWalkers(before).map(bot => bot.id), ['bot-10', 'bot-13', 'bot-14']);
  for (const bot of routineWalkers(before)) {
    const next = after.find(visitor => visitor.id === bot.id);
    const speed = Math.hypot(next.x - bot.x, next.z - bot.z) / .05;
    assert.ok(speed > .7 && speed < 1.2, `${bot.id} speed ${speed}`);
  }
  // Five minutes cover the long garden circuit more than twice.
  let previous = getBots(epoch - 100, jobs);
  for (let tick = 0; tick <= 3000; tick++) {
    const bots = getBots(epoch + tick * 100, jobs);
    for (const bot of routineWalkers(bots)) {
      assert.ok(Number.isFinite(bot.rotation));
      const last = previous.find(visitor => visitor.id === bot.id);
      const speed = Math.hypot(bot.x - last.x, bot.z - last.z) / .1;
      assert.ok(speed > .7 && speed < 1.2, `${bot.id} jumped or stopped at ${tick}`);
      const turn = Math.atan2(Math.sin(bot.rotation - last.rotation), Math.cos(bot.rotation - last.rotation));
      assert.ok(Math.abs(turn) < .11, `${bot.id} heading jumped at ${tick}`);
      assertClearGarden(bot, `at ${tick}`);
      assert.ok(GARDEN_PATHS.some(path => Math.abs(bot.x - path.x) < path.width / 2 && Math.abs(bot.z - path.z) < path.length / 2),
        `${bot.id} left the connected path network at ${tick}`);
      for (const [x, z] of STATION_POSITIONS) {
        assert.ok(Math.abs(bot.x - x) >= 1.6 || Math.abs(bot.z - z) >= 1, `${bot.id} crossed a table at ${tick}`);
        for (const chairZ of [z - 1.12, z + 1.5]) {
          assert.ok(Math.hypot(bot.x - x, bot.z - chairZ) >= .95, `${bot.id} crossed a chair at ${tick}`);
        }
      }
    }
    previous = bots;
  }
});

test('the loop remains continuous across Unix-time boundaries and invalid clocks stay finite', () => {
  for (const clock of [0, -1000, Number.NaN, Infinity]) {
    for (const bot of getBots(clock, jobs)) {
      assert.ok([bot.x, bot.z, bot.rotation].every(Number.isFinite));
      if (bot.encounterId) assert.ok([bot.strike, bot.recoil, bot.impact].every(value => Number.isFinite(value) && value >= 0 && value <= 1));
      if (bot.tableTennis) assert.ok(Number.isFinite(bot.swing) && bot.swing >= 0 && bot.swing <= 1);
    }
  }
  assert.deepEqual(getBotOccupiedJobs(epoch, []), []);
});

test('two table-tennis pairs shuffle continuously and meet the ball with alternating forehands', () => {
  const contactCounts = BOT_TABLE_TENNIS_PAIRS.map(() => [0, 0]);
  let previous = getBots(-10, jobs);
  for (let clock = 0; clock <= 6000; clock += 10) {
    const bots = getBots(clock, jobs);
    assert.deepEqual(bots, getBots(clock, jobs), 'rallies must be shared by every visitor');
    assert.equal(bots.length, 15);
    assert.deepEqual(getBotOccupiedJobs(clock, jobs), ['job-2', 'job-5', 'job-8']);
    BOT_TABLE_TENNIS_PAIRS.forEach((ids, tableIndex) => {
      const table = TABLE_TENNIS_TABLES[tableIndex];
      const rally = getTableTennisState(clock, tableIndex);
      ids.forEach((id, side) => {
        const bot = bots.find(visitor => visitor.id === id);
        assertClearGarden(bot, `during tennis at ${clock}`);
        const before = previous.find(visitor => visitor.id === id);
        assert.equal(bot.tableTennis, true);
        assert.equal(bot.tableId, table.id);
        assert.equal(bot.seatedJobId, null, 'tennis players must never reserve job chairs');
        assert.equal(bot.swing, rally.players[side].swing);
        assert.ok(Math.hypot(bot.x - before.x, bot.z - before.z) < .006, 'small lateral steps must never jump at the rally seam');
        assert.ok(Math.abs(bot.x - table.x) < .15, 'players should shuffle close to their own side of the table');
        const facing = side === 0 ? 1 : -1;
        assert.ok((table.z - bot.z) * Math.cos(bot.rotation) > 2.4, 'players must face across the net');
        for (const [x, z] of STATION_POSITIONS) {
          assert.ok(Math.abs(bot.x - x) >= 1.6 || Math.abs(bot.z - z) >= 1, `${id} crossed a job table`);
          for (const chairZ of [z - 1.12, z + 1.5]) assert.ok(Math.hypot(bot.x - x, bot.z - chairZ) >= .95, `${id} crossed a job chair`);
        }
        if (Math.abs(bot.swing - .5) < .001) {
          contactCounts[tableIndex][side]++;
          const paddleX = bot.x + .36 * facing;
          const paddleZ = bot.z + .4 * facing;
          assert.ok(Math.hypot(rally.ball.x - paddleX, rally.ball.z - paddleZ) < .06,
            'the shared ball must arrive when this player reaches the contact pose');
          assert.ok(Math.abs(rally.ball.y - 1.03) < .04, 'contact must occur at paddle height');
        }
      });
    });
    previous = bots;
  }
  for (const counts of contactCounts) assert.ok(counts.every(count => count >= 2), 'both players should return the ball in each repeated rally');
});

test('one walking collision develops into reciprocal punches, a shove, a fall, two kicks and recovery', () => {
  const scene = time => getFightScene(time).states;
  const actor = (time, side = 0) => scene(time)[side];
  assert.deepEqual(BOT_SPARRING_PAIRS, [FIGHTER_IDS]);
  assert.deepEqual(sparringIds, ['bot-3', 'bot-4']);
  assert.ok(actor(1000).moving && actor(1000, 1).moving);
  assert.ok(Math.abs(actor(0).x - actor(0, 1).x) > 4);
  assert.ok(Math.abs(actor(3200).x - actor(3200, 1).x) < 1, 'the two walkers meet before becoming angry');
  assert.ok(actor(3500).fightPose.bump > .9 && actor(3500).anger > 0);
  for (let exchange = 0; exchange < 4; exchange++) {
    const time = 5150 + exchange * 1000;
    const attacker = actor(time, exchange % 2), receiver = actor(time, 1 - exchange % 2);
    assert.equal(attacker.fightPose.punch, .5, 'a complete jab reaches its contact pose');
    assert.ok(Math.abs(attacker.x - receiver.x) > .89 && Math.abs(attacker.x - receiver.x) < .92, 'the lunge brings the short arms into contact without crossing body cores');
    assert.equal(receiver.fightPose.punch, 0);
    assert.ok(receiver.fightPose.flinch > .8, 'the receiving bot visibly recoils');
    assert.equal(attacker.impact, 1);
    assert.equal(attacker.impact, receiver.impact);
    assert.equal(attacker.opponentId, receiver.id);
    assert.equal(attacker.encounterId, receiver.encounterId);
  }
  assert.equal(actor(9300).fightPose.shove, .5);
  assert.ok(Math.abs(Math.abs(actor(9300).x - actor(9300, 1).x) - .95) < 1e-9, 'the planted step reaches the measured two-palm contact gap before the fall starts');
  assert.ok(actor(9700, 1).fightPose.fallProgress > 0 && actor(9700, 1).fightPose.fallProgress < 1);
  for (const time of [10975, 12175]) {
    assert.equal(actor(time).fightPose.kick, .5);
    assert.equal(actor(time, 1).fightPose.grounded, true);
    assert.equal(actor(time, 1).fightPose.fallProgress, 1);
    assert.equal(actor(time).impactHeight, .35, 'grounded contact belongs at foot height');
    assert.equal(actor(time).impact, 1);
  }
  assert.ok(actor(14200, 1).fightPose.recoverProgress > 0 && actor(14200, 1).fightPose.recoverProgress < 1);
  assert.equal(actor(15000, 1).fightPose.fallProgress, null);
  assert.ok(actor(17500).moving && actor(17500, 1).moving, 'both bots walk away after the recovery');
  assert.equal(actor(21500).fighting, false);
  assert.equal(actor(21500).anger, 0);
  assert.ok(scene(4100).slice(0, 2).every(bot => bot.speech && !/[a-z0-9]/i.test(bot.speech)), 'angry clouds use symbols only');
});

test('one encounter preserves every bot and three spectators face the action without sealing off the crowd', () => {
  let previous = getFightScene(-10);
  for (let clock = 0; clock <= FIGHT_CYCLE_MS * 2; clock += 10) {
    const encounter = getFightScene(clock), bots = getBots(clock, jobs);
    assert.deepEqual(encounter, getFightScene(clock), 'the scene is shared and deterministic');
    assert.equal(bots.length, BOT_COUNT);
    assert.equal(new Set([...bots, ...getSocialBots(clock)].map(bot => bot.id)).size, 19);
    assert.deepEqual(bots.filter(bot => bot.fightRole === 'fighter').map(bot => bot.id), FIGHTER_IDS);
    assert.deepEqual(bots.filter(bot => bot.fightRole === 'spectator').map(bot => bot.id), SPECTATOR_IDS);
    assert.equal(bots.filter(bot => bot.tableTennis).length, 4);
    assert.equal(routineWalkers(bots).length, 3);
    assert.deepEqual(getBotOccupiedJobs(clock, jobs), ['job-2', 'job-5', 'job-8']);
    assert.ok(bots.filter(bot => bot.fighting).length <= 2, 'a second fight must never appear');
    const repeated = getFightScene(clock + FIGHT_CYCLE_MS);
    assert.deepEqual(encounter, repeated, 'the whole scene repeats without a reset jump');
    for (const bot of encounter.states) {
      assertClearGarden(bot, `during the encounter at ${clock}`);
      const last = previous.states.find(state => state.id === bot.id);
      assert.ok(Math.hypot(bot.x - last.x, bot.z - last.z) < .025, `${bot.id} must take continuous steps`);
      const turn = Math.atan2(Math.sin(bot.rotation - last.rotation), Math.cos(bot.rotation - last.rotation));
      assert.ok(Math.abs(turn) < .065, `${bot.id} must turn gradually`);
      if (bot.fightRole === 'spectator') {
        const distance = Math.hypot(FIGHT_CENTER.x - bot.x, FIGHT_CENTER.z - bot.z);
        const facing = ((FIGHT_CENTER.x - bot.x) * Math.sin(bot.rotation) + (FIGHT_CENTER.z - bot.z) * Math.cos(bot.rotation)) / distance;
        assert.ok(facing > .999 && bot.watching, 'spectators look into the encounter');
        assert.ok(bot.z > FIGHT_CENTER.z + 1.8, 'the front of the crowd stays open for the visitor');
      } else {
        assert.ok(Number.isFinite(bot.anger) && bot.anger >= 0 && bot.anger <= 1);
        assert.ok(Math.abs(bot.anger - last.anger) < .03, 'the red reaction fades in and out');
        assert.ok(!/[a-z0-9]/i.test(bot.speech), 'a curse cloud must contain no actual words');
        for (const field of ['guard', 'punch', 'shove', 'kick', 'flinch', 'bump']) {
          const value = bot.fightPose[field];
          assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${field} stays finite and bounded`);
          // Gesture progress may wrap from one to zero; both endpoints are the
          // same resting pose, so compare their physical movement envelopes.
          if (['punch', 'shove', 'kick'].includes(field)) {
            const envelope = value => Math.sin(value * Math.PI) ** 2;
            assert.ok(Math.abs(envelope(value) - envelope(last.fightPose[field])) < .065, `${field} must settle before ending`);
          }
        }
      }
      const volumes = getFightBodyVolumes(bot);
      for (const volume of volumes) {
        assertClearGarden({ ...volume, id: bot.id }, `under the body at ${clock}`);
        for (const watcher of encounter.states.filter(state => state.fightRole === 'spectator' && state.id !== bot.id)) {
          assert.ok(Math.hypot(volume.x - watcher.x, volume.z - watcher.z) > volume.radius + .4, 'a falling body stays clear of onlookers');
        }
        for (const walker of routineWalkers(bots)) assert.ok(Math.hypot(volume.x - walker.x, volume.z - walker.z) >= volume.radius + .35, 'circulating visitors stay clear of the actual bodies');
      }
    }
    const [left, right] = encounter.states;
    assert.ok(Math.hypot(left.x - right.x, left.z - right.z) >= .88 - 1e-9, 'the shove and kicking poses preserve separate body roots');
    previous = encounter;
  }
});

test('a blocked encounter can pause independently while tennis and ordinary garden visitors continue', () => {
  const first = getBots(10000, jobs, {}, 10975), later = getBots(11500, jobs, {}, 10975);
  const sceneIds = [...FIGHTER_IDS, ...SPECTATOR_IDS];
  assert.deepEqual(first.filter(bot => sceneIds.includes(bot.id)), later.filter(bot => sceneIds.includes(bot.id)));
  for (const id of ['bot-10', 'bot-13', 'bot-14']) {
    const before = first.find(bot => bot.id === id), after = later.find(bot => bot.id === id);
    assert.ok(Math.hypot(after.x - before.x, after.z - before.z) > 1);
  }
  assert.notDeepEqual(first.filter(bot => bot.tableTennis), later.filter(bot => bot.tableTennis));
});

test('pushed seated bots fall, recover, leave continuously and keep their chairs free for every viewer', () => {
  const defeats = { 'job-2': epoch, 'job-5': epoch, 'job-8': epoch };
  assert.deepEqual(getBotOccupiedJobs(epoch, jobs, defeats), []);
  let before = getBots(epoch, jobs, defeats);
  for (let index = 0; index < 3; index++) {
    assert.equal(before[index].pushStage, 'falling');
    assert.equal(before[index].fallProgress, 0);
    assert.equal(before[index].recoveryProgress, 0);
    assert.equal(before[index].pushJobId, `job-${[2, 5, 8][index]}`);
    assert.equal(before[index].seatedJobId, null);
    assert.equal(before[index].moving, false);
  }
  // Cover the tumble, grounded pause, recovery, front path and two circuits.
  const crossedEntrance = [false, false, false];
  for (let tick = 1; tick <= 6000; tick++) {
    const bots = getBots(epoch + tick * 50, jobs, defeats);
    assert.deepEqual(bots, getBots(epoch + tick * 50, jobs, defeats));
    assert.equal(bots.length, 15);
    assert.equal(new Set(bots.map(bot => bot.id)).size, 15);
    for (let index = 0; index < 3; index++) {
      const bot = bots[index], last = before[index];
      assertClearGarden(bot, `during departure at ${tick}`);
      const [seatX, tableZ] = STATION_POSITIONS[[2, 5, 8][index]];
      if (!crossedEntrance[index] && last.z <= tableZ + 4 && bot.z > tableZ + 4) {
        assert.ok(Math.abs(bot.x - seatX - BOT_PUSH_LANDING_OFFSET.x) < .01, 'the bot leaves along the clear side of its front path');
        crossedEntrance[index] = true;
      }
      assert.equal(bot.seatedJobId, null, 'a defeated bot must never reclaim its chair');
      assert.ok(bot.standProgress >= last.standProgress && bot.standProgress <= 1);
      const maxSpeed=tick*50<=BOT_PUSH_HANDOFF_MS?3:.85;
      assert.ok(Math.hypot(bot.x - last.x, bot.z - last.z) <= maxSpeed * .05 + 1e-6, 'tumbling and departure must not jump');
      const turn = Math.atan2(Math.sin(bot.rotation - last.rotation), Math.cos(bot.rotation - last.rotation));
      assert.ok(Math.abs(turn) < .8, 'recovery and aisle turns should remain continuous');
      for (const [stationIndex, [x, z]] of STATION_POSITIONS.entries()) {
        assert.ok(Math.abs(bot.x - x) >= 1.6 || Math.abs(bot.z - z) >= 1, `${bot.id} crossed table ${stationIndex}`);
        for (const chairZ of [z - 1.12, z + 1.5]) {
          // Its starting chair is necessarily occupied during the rise and
          // first step, but the eventual circuit never returns to that chair.
          const startingChair = stationIndex === [2, 5, 8][index] && chairZ === z + 1.5;
          if (startingChair && tick * .05 < 2.5) continue;
          assert.ok(Math.hypot(bot.x - x, bot.z - chairZ) >= .95, `${bot.id} crossed a chair`);
        }
      }
    }
    before = bots;
  }
  assert.ok(crossedEntrance.every(Boolean), 'every displaced occupant must walk out of its garden workspace');
  assert.deepEqual(getBotOccupiedJobs(epoch + 86_400_000, jobs, defeats), []);
});

test('only completed, finite bot defeats remove the corresponding fixed occupant', () => {
  const defeats = { 'job-2': epoch, 'job-5': Number.NaN, 'job-8': undefined, 'job-0': epoch };
  assert.deepEqual(getBotOccupiedJobs(epoch, jobs, defeats), ['job-5', 'job-8']);
  const bots = getBots(epoch + 3000, jobs, defeats);
  assert.equal(bots[0].moving, true);
  assert.equal(bots[1].seatedJobId, 'job-5');
  assert.equal(bots[2].seatedJobId, 'job-8');
  // A viewer whose adjusted clock is momentarily behind starts at the chair.
  assert.equal(getBots(epoch - 100, jobs, { 'job-2': epoch })[0].fallProgress, 0);
  assert.equal(getBotOccupiedJobs(epoch, jobs, { 'job-2': 0 }).includes('job-2'), false);
});

test('four silent companions sit on shared couches without using application seats', () => {
  const bots = getSocialBots(epoch);
  assert.equal(bots.length, SOCIAL_BOT_COUNT);
  assert.deepEqual(bots, getSocialBots(epoch));
  assert.deepEqual(bots.map(bot => bot.id), ['social-0', 'social-1', 'social-2', 'social-3']);
  assert.equal(new Set([...getBots(epoch, jobs), ...bots].map(bot => bot.id)).size, BOT_COUNT + SOCIAL_BOT_COUNT);
  for (const bot of bots) {
    const seat = SOCIAL_SEATS.find(seat => seat.id === bot.loungeSeatId);
    assert.equal(bot.id, seat.occupiedBy);
    assert.equal(bot.x, seat.x); assert.equal(bot.z, seat.z); assert.equal(bot.rotation, seat.rotation);
    assert.equal(bot.social, true); assert.equal(bot.moving, false); assert.equal(bot.seatedJobId, null);
    assert.equal(bot.seatType, 'couch'); assert.equal(bot.hair, 5);
  }
});

test('companions alternate short speech turns, listen between lines and never move at cycle seams', () => {
  const spoken = new Map();
  for (let clock = -100; clock <= 36000; clock += 100) {
    const bots = getSocialBots(clock);
    for (const pair of [['social-0', 'social-1'], ['social-2', 'social-3']]) {
      const companions = pair.map(id => bots.find(bot => bot.id === id));
      assert.ok(companions.filter(bot => bot.talking).length <= 1);
      for (const bot of companions) {
        assert.equal(Boolean(bot.speech), bot.talking);
        assert.ok(bot.speech.length <= 36);
        if (bot.talking) spoken.set(bot.id, (spoken.get(bot.id) || new Set()).add(bot.speech));
        const next = getSocialBots(clock + 1).find(next => next.id === bot.id);
        assert.equal(next.x, bot.x); assert.equal(next.z, bot.z); assert.equal(next.rotation, bot.rotation);
      }
    }
  }
  assert.equal(spoken.size, 4);
  assert.ok([...spoken.values()].every(lines => lines.size === 3), 'each companion should vary their short lines');
  for (const clock of [NaN, Infinity, undefined]) assert.deepEqual(getSocialBots(clock), getSocialBots(0));
});

test('all ambient characters start bald and never randomize hair with the shared clock', () => {
  for (const clock of [0, epoch, epoch + 1_000_000]) {
    assert.ok([...getBots(clock, jobs), ...getSocialBots(clock)].every(bot => bot.hair === 5));
    assert.ok(getBots(clock, jobs, { 'job-2': epoch }).every(bot => bot.hair === 5));
  }
});
