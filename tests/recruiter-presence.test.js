import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import {
  createMemoryWorld, createRedisWorld, validateCommand, handleWorldRequest,
  VISITOR_TTL_MS, RECRUITER_HITS, RECRUITER_BUMP_COOLDOWN_MS,
  RECRUITER_PROGRESS_TTL_MS, RECRUITER_ENCOUNTER_TTL_MS, RECRUITER_HOME,
} from '../api/world.js';
import { createPresence } from '../src/presence.js';
import { SEAT_POSITIONS } from '../src/seat-catalog.js';

const near = () => ({ x: RECRUITER_HOME.x + .9, z: RECRUITER_HOME.z, rotation: -Math.PI / 2, hair: 5 });
const command = (suffix, action = 'move', state = {}, extra = {}) => validateCommand({
  id: `visitor-pm-000000-${suffix}`, token: suffix.repeat(64).slice(0, 64),
  action, state: { ...near(), ...state }, ...extra,
});
const make = () => {
  let time = 1_000_000;
  return { world: createMemoryWorld({ now: () => time }), now: () => time, advance(ms) { time += ms; } };
};
const bump = (fixture, suffix = 'a', contactKind = 'chair', state = {}) => fixture.world.dispatch(command(suffix, 'recruiter-bump', state, { contactKind }));
async function start(fixture, suffix = 'a') {
  await fixture.world.dispatch(command(suffix, 'join'));
  await bump(fixture, suffix);
  fixture.advance(RECRUITER_BUMP_COOLDOWN_MS);
  await bump(fixture, suffix, 'recruiter');
  fixture.advance(RECRUITER_BUMP_COOLDOWN_MS);
  const result = await bump(fixture, suffix);
  assert.equal(result.recruiterBump.started, true, 'the third deliberate chair contact starts an encounter');
  return result.recruiterEncounter;
}
const combat = (encounter, now, extra = {}) => ({
  encounterId: encounter.id, phase: 'fighting', elapsed: 300,
  x: RECRUITER_HOME.x + 1.2, z: RECRUITER_HOME.z - 1, rotation: .4,
  playerHealth: 100, recruiterHealth: 70,
  playerAttack: { type: 'punch', seq: 1, startedAt: now },
  recruiterAttack: null, hitSeq: 1, outcome: null, ...extra,
});
const assertPrivate = (value, suffixes = ['a', 'b']) => {
  for (const suffix of suffixes) assert.equal(JSON.stringify(value).includes(suffix.repeat(64)), false, 'credentials never appear in snapshots');
  assert.ok(value.visitors.every(visitor => !Object.hasOwn(visitor, 'token')));
};

test('three deliberate contacts start only the Product Manager encounter, and the last contact must be the chair', async () => {
  const fixture = make();
  const first = await bump(fixture, 'a', 'recruiter');
  assert.equal(first.recruiterBump.hits, 1); assert.equal(first.recruiterBump.required, RECRUITER_HITS);
  assert.equal(first.recruiterBump.started, false); assert.equal(first.recruiterEncounter, null);
  fixture.advance(RECRUITER_BUMP_COOLDOWN_MS);
  assert.equal((await bump(fixture, 'a', 'chair')).recruiterBump.hits, 2);
  fixture.advance(RECRUITER_BUMP_COOLDOWN_MS);
  const body = await bump(fixture, 'a', 'recruiter');
  assert.equal(body.recruiterBump.hits, 2); assert.equal(body.recruiterBump.reason, 'chair-needed');
  fixture.advance(RECRUITER_BUMP_COOLDOWN_MS);
  const last = await bump(fixture);
  assert.equal(last.recruiterBump.hits, 3); assert.equal(last.recruiterBump.started, true);
  assert.equal(last.recruiterEncounter.ownerId, command('a').id);
  assert.equal(last.recruiterEncounter.startedAt, fixture.now());
  assert.equal(last.recruiterEncounter.updatedAt, fixture.now());
  assert.deepEqual(last.seats, {}, 'triggering the recruiter does not claim an application chair');
  assert.deepEqual(last.botDefeats, {}, 'the ordinary bot-seat challenge is independent');
  assertPrivate(last);
});

test('bump cooldown and progress expiry prevent one sustained request stream or an old counter from starting a fight', async () => {
  const fixture = make();
  assert.equal((await bump(fixture)).recruiterBump.hits, 1);
  fixture.advance(RECRUITER_BUMP_COOLDOWN_MS - 1);
  const fast = await bump(fixture);
  assert.equal(fast.recruiterBump.started, false); assert.equal(fast.recruiterBump.hits, 1);
  assert.equal(fast.recruiterBump.reason, 'cooldown');
  fixture.advance(1);
  assert.equal((await bump(fixture)).recruiterBump.hits, 2);
  fixture.advance(RECRUITER_PROGRESS_TTL_MS + 1);
  assert.equal((await bump(fixture)).recruiterBump.hits, 1, 'expired personal progress starts again');
});

test('separate visitor counters and simultaneous third contacts yield exactly one shared owner', async () => {
  const fixture = make();
  for (const suffix of ['a', 'b']) {
    const result = await bump(fixture, suffix);
    assert.equal(result.recruiterBump.hits, 1, 'another visitor cannot contribute the second hit');
  }
  fixture.advance(RECRUITER_BUMP_COOLDOWN_MS);
  await Promise.all(['a', 'b'].map(suffix => bump(fixture, suffix)));
  fixture.advance(RECRUITER_BUMP_COOLDOWN_MS);
  const results = await Promise.all(['a', 'b'].map(suffix => bump(fixture, suffix)));
  assert.equal(results.filter(result => result.recruiterBump.started).length, 1);
  assert.equal(new Set(results.map(result => result.recruiterEncounter.id)).size, 1);
  assert.equal(results.find(result => !result.recruiterBump.started).recruiterBump.reason, 'busy');
  assertPrivate(await fixture.world.dispatch());
});

test('recruiter contacts require a nearby standing visitor with their own credential', async () => {
  const fixture = make();
  const far = await bump(fixture, 'a', 'chair', { x: RECRUITER_HOME.x + 10 });
  assert.equal(far.recruiterBump.reason, 'too-far'); assert.equal(far.recruiterBump.hits, 0);
  await fixture.world.dispatch(command('a', 'claim', {}, { jobId: 'product-manager' }));
  const seated = await bump(fixture);
  assert.equal(seated.recruiterBump.reason, 'seated'); assert.equal(seated.recruiterEncounter, null);
  await fixture.world.dispatch(command('a', 'release'));
  assert.equal((await bump(fixture)).recruiterBump.hits, 1);
  const stolen = await fixture.world.dispatch({ ...command('a', 'recruiter-bump', {}, { contactKind: 'chair' }), token: 'b'.repeat(64) });
  assert.equal(stolen.code, 403);
  fixture.advance(RECRUITER_BUMP_COOLDOWN_MS);
  assert.equal((await bump(fixture)).recruiterBump.hits, 2, 'a forged credential cannot add progress');
});

test('owner combat and player attacks reach other snapshots, while non-owners cannot move the recruiter', async () => {
  const fixture = make(), encounter = await start(fixture);
  const update = combat(encounter, fixture.now());
  const moved = await fixture.world.dispatch(command('a', 'move', { recruiterCombat: update, combatAction: update.playerAttack }));
  assert.equal(moved.recruiterEncounter.combat.phase, 'fighting');
  assert.equal(moved.recruiterEncounter.combat.x, update.x);
  assert.equal(moved.visitors.find(visitor => visitor.id === command('a').id).combatAction.type, 'punch');
  const hostile = combat(encounter, fixture.now(), { x: RECRUITER_HOME.x - 4, recruiterHealth: 0 });
  const foreign = await fixture.world.dispatch(command('b', 'move', { recruiterCombat: hostile, combatAction: hostile.playerAttack }));
  assert.equal(foreign.recruiterEncounter.ownerId, command('a').id);
  assert.equal(foreign.recruiterEncounter.combat.x, update.x);
  assert.equal(foreign.recruiterEncounter.combat.recruiterHealth, 70);
  assert.equal(foreign.visitors.find(visitor => visitor.id === command('b').id).combatAction ?? null, null);
  assert.equal(foreign.visitors.some(visitor => Object.hasOwn(visitor, 'recruiterCombat')), false, 'only the whitelisted global encounter is relayed');
  assertPrivate(foreign);
  const settled = await fixture.world.dispatch(command('a', 'move', {
    recruiterCombat: combat(encounter, fixture.now(), { phase: 'seated' }), combatAction: update.playerAttack,
  }));
  assert.equal(settled.recruiterEncounter, null);
  assert.equal(settled.visitors.find(visitor => visitor.id === command('a').id).combatAction ?? null, null,
    'a finished encounter clears the public punch even when the final packet still carries it');
});

test('stale encounter packets cannot move or finish a later encounter', async () => {
  const fixture = make(), old = await start(fixture);
  await fixture.world.dispatch(command('a', 'move', { recruiterCombat: combat(old, fixture.now(), { phase: 'seated' }) }));
  assert.equal((await fixture.world.dispatch()).recruiterEncounter, null);
  fixture.advance(3100);
  const current = await start(fixture);
  assert.notEqual(old.id, current.id);
  const stale = await fixture.world.dispatch(command('a', 'move', { recruiterCombat: combat(old, fixture.now(), { phase: 'seated' }) }));
  assert.equal(stale.recruiterEncounter.id, current.id);
  assert.equal(stale.recruiterEncounter.combat, null);
});

test('leaving clears ownership and starts a short reset cooldown for every visitor', async () => {
  const fixture = make(); await start(fixture);
  const left = await fixture.world.dispatch(command('a', 'leave'));
  assert.equal(left.recruiterEncounter, null);
  const early = await bump(fixture, 'b');
  assert.equal(early.recruiterBump.started, false); assert.equal(early.recruiterBump.reason, 'cooldown');
  fixture.advance(3100);
  assert.equal((await bump(fixture, 'b')).recruiterBump.hits, 1);
});

test('expired owners, the maximum encounter age, and a newly seated owner release the recruiter', async () => {
  const stale = make(); await start(stale); stale.advance(VISITOR_TTL_MS + 1);
  assert.equal((await stale.world.dispatch()).recruiterEncounter, null);
  const capped = make(); const encounter = await start(capped);
  for (let elapsed = 10_000; elapsed < RECRUITER_ENCOUNTER_TTL_MS; elapsed += 10_000) {
    capped.advance(10_000); await capped.world.dispatch(command('a'));
  }
  capped.advance(10_000);
  assert.equal((await capped.world.dispatch(command('a'))).recruiterEncounter, null, 'heartbeats cannot extend the absolute encounter lifetime');
  const seated = make(); await start(seated);
  const claim = await seated.world.dispatch(command('a', 'claim', {}, { jobId: 'product-designer' }));
  assert.equal(claim.claimed, true); assert.equal(claim.recruiterEncounter, null);
  assert.equal(claim.visitors[0].combatAction ?? null, null);
  assert.ok(encounter.id);
});

test('malformed actions, combat poses and attack sequences are rejected rather than reaching public snapshots', () => {
  for (const contactKind of ['', 'desk', 'applicant-chair', null, 1]) {
    assert.throws(() => command('a', 'recruiter-bump', {}, { contactKind }), /Invalid|Unknown/);
  }
  assert.throws(() => command('a', 'recruiter-bump', { x: Infinity }, { contactKind: 'chair' }), /Invalid/);
  const example = { id: 'visitor-pm-000000-a:1000000' };
  for (const patch of [{ x: Infinity }, { elapsed: -1 }, { rotation: NaN }, { phase: 'teleport' }, { playerHealth: 101 }, { recruiterHealth: -1 }, { hitSeq: 1.5 }, { encounterId: '' }, { playerAttack: { type: 'laser', seq: 1, startedAt: 1000000 } }, { playerAttack: { type: 'punch', seq: -1, startedAt: 1000000 } }]) {
    assert.throws(() => command('a', 'move', { recruiterCombat: combat(example, 1_000_000, patch) }), /Invalid|Unknown/);
  }
});

test('the HTTP boundary validates recruiter commands before dispatching', async () => {
  const fixture = make();
  const request = async body => {
    const req = Readable.from([]); req.method = 'POST'; req.headers = { host: 'localhost:4173', origin: 'http://localhost:4173' }; req.body = body;
    const res = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
    await handleWorldRequest(req, res, fixture.world); return res;
  };
  const accepted = await request({ ...command('a', 'recruiter-bump', {}, { contactKind: 'chair' }) });
  assert.equal(accepted.statusCode, 200); assert.equal(accepted.body.recruiterBump.hits, 1);
  const invalid = await request({ ...command('a'), action: 'recruiter-bump', contactKind: 'wrong-chair' });
  assert.equal(invalid.statusCode, 400); assert.equal(invalid.body.recruiterEncounter, undefined);
});

test('Redis receives the same owner-only combat state and contact in one atomic operation', async () => {
  const requests = [];
  const encounter = { id: 'visitor-pm-000000-a:1000000', ownerId: command('a').id, startedAt: 1_000_000, updatedAt: 1_000_000, combat: null };
  const world = createRedisWorld({ url: 'https://redis.example/', token: 'server-private', now: () => 1_000_000, fetcher: async (url, init) => {
    requests.push({ url, ...init });
    return { ok: true, json: async () => ({ result: JSON.stringify({ visitors: [], seats: {}, botDefeats: {}, recruiterEncounter: encounter, recruiterBump: { hits: 3, required: 3, started: true }, serverTime: 1_000_000, status: 'shared', storage: 'redis' }) }) };
  } });
  const result = await world.dispatch(command('a', 'recruiter-bump', { recruiterCombat: combat(encounter, 1_000_000) }, { contactKind: 'chair' }));
  assert.equal(requests.length, 1); assert.equal(result.recruiterEncounter.id, encounter.id);
  const wire = JSON.parse(requests[0].body);
  assert.equal(wire[0], 'EVAL'); assert.equal(wire[2], 0);
  assert.ok(wire[1].includes('recruiter-bump'), 'the atomic command owns the bump and encounter transition');
  assert.ok(wire[1].includes('ownerId') && wire[1].includes('encounterId'), 'the operation checks both owner and encounter identity');
  assert.ok(wire[1].includes('visitor.token=nil'), 'private credentials are removed before relay');
  assert.equal(JSON.parse(wire.at(-1))['product-manager'].z - 2.62, RECRUITER_HOME.z, 'existing seat coordinates remain authoritative');
  const encoded = wire.filter(value => typeof value === 'string' && value.startsWith('{')).map(value => { try { return JSON.parse(value); } catch { return null; } });
  assert.ok(encoded.some(value => value?.recruiterCombat?.encounterId === encounter.id));
  assert.equal(requests[0].headers.Authorization, 'Bearer server-private');
});

function browser(t, { store = null, response } = {}) {
  const previous = { window: globalThis.window, fetch: globalThis.fetch, now: Date.now };
  let time = 2_000_000;
  Date.now = () => time;
  const callbacks = [], requests = [], snapshots = [];
  globalThis.window = { setInterval(callback) { callbacks.push(callback); return callbacks.length; }, addEventListener() {}, removeEventListener() {} };
  const backing = store || createMemoryWorld({ now: () => time });
  const defaultFetch = async (_url, options) => {
    const body = JSON.parse(options.body); requests.push(body);
    return response ? response(body) : { ok: true, json: async () => backing.dispatch(validateCommand(body)) };
  };
  globalThis.fetch = defaultFetch;
  const client = createPresence({ name: 'Visitor One', onVisitors: snapshot => snapshots.push(snapshot) });
  t.after(() => { client.destroy(); globalThis.window = previous.window; globalThis.fetch = previous.fetch; Date.now = previous.now; });
  return { client, callbacks, requests, snapshots, backing, tick: () => callbacks[0](), advance(ms) { time += ms; }, setFetch(fn) { globalThis.fetch = fn; } };
}

test('a browser visitor can start the shared encounter and publish its combat without claiming a seat', async t => {
  const fixture = browser(t); fixture.client.update(near()); await fixture.tick();
  for (let hit = 1; hit <= 3; hit++) {
    const snapshot = await fixture.client.bumpRecruiter('chair');
    assert.equal(snapshot.recruiterBump.hits, hit);
    fixture.advance(RECRUITER_BUMP_COOLDOWN_MS);
  }
  const encounter = fixture.snapshots.at(-1).recruiterEncounter;
  assert.equal(encounter.ownerId, fixture.client.id);
  const update = combat(encounter, Date.now());
  fixture.client.update({ recruiterCombat: update, combatAction: update.playerAttack });
  fixture.advance(1000); await fixture.tick();
  const latest = fixture.snapshots.at(-1);
  assert.equal(latest.recruiterEncounter.combat.phase, 'fighting');
  assert.equal(latest.visitors.find(visitor => visitor.id === fixture.client.id).combatAction.type, 'punch');
  assert.deepEqual(latest.seats, {});
  fixture.client.destroy();
  const after = await fixture.client.bumpRecruiter('chair');
  assert.equal(after.recruiterBump.started, false);
});

test('an unconfigured preview supports deliberate bumps locally, including the last-chair condition', async t => {
  const fixture = browser(t, { response: () => ({ ok: false, status: 503 }) });
  fixture.client.update(near()); await fixture.tick();
  assert.equal((await fixture.client.bumpRecruiter('recruiter')).recruiterBump.hits, 1);
  fixture.advance(RECRUITER_BUMP_COOLDOWN_MS);
  assert.equal((await fixture.client.bumpRecruiter('chair')).recruiterBump.hits, 2);
  fixture.advance(RECRUITER_BUMP_COOLDOWN_MS);
  assert.equal((await fixture.client.bumpRecruiter('recruiter')).recruiterBump.reason, 'chair-needed');
  fixture.advance(RECRUITER_BUMP_COOLDOWN_MS);
  const started = await fixture.client.bumpRecruiter('chair');
  assert.equal(started.recruiterBump.started, true); assert.equal(started.status, 'local');
  assert.equal(started.recruiterEncounter.ownerId, fixture.client.id);
});

test('a lost connection cannot turn a known foreign live owner into a local fight', async t => {
  const fixture = browser(t); fixture.client.update(near()); await fixture.tick();
  const other = { id: 'visitor-pm-000000-b', token: 'b'.repeat(64), state: near() };
  await fixture.backing.dispatch(validateCommand({ ...other, action: 'join' }));
  for (let hit = 0; hit < 3; hit++) {
    await fixture.backing.dispatch(validateCommand({ ...other, action: 'recruiter-bump', contactKind: 'chair' }));
    fixture.advance(RECRUITER_BUMP_COOLDOWN_MS);
  }
  fixture.advance(1000); await fixture.tick();
  assert.equal(fixture.snapshots.at(-1).recruiterEncounter.ownerId, other.id);
  fixture.setFetch(async () => ({ ok: false, status: 503 }));
  fixture.advance(1000); await fixture.tick();
  const blocked = await fixture.client.bumpRecruiter('chair');
  assert.equal(blocked.recruiterBump.started, false);
  assert.equal(blocked.recruiterEncounter.ownerId, other.id, 'the last known shared lock survives the local fallback');
});

// Optional real-Lua contract checks use only the dedicated, disposable local
// Unix socket. Ordinary npm test never needs Redis or a production credential.
const redisSocket = process.env.RECRUITER_REDIS_TEST_SOCKET;
const redisCase = (name, callback) => test(name, { skip: !redisSocket }, callback);
function realRedis(initialTime = 3_000_000) {
  assert.equal(redisSocket, '/tmp/common-ground-v52-redis.sock', 'only the isolated test database may be flushed');
  const cli = '/workspace/hiring-world/.tools/redis-test/root/usr/bin/redis-cli';
  const libraryPath = '/workspace/hiring-world/.tools/redis-test/root/usr/lib/x86_64-linux-gnu';
  const env = { ...process.env, LD_LIBRARY_PATH: libraryPath + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '') };
  const call = (...args) => execFileSync(cli, ['-e', '-s', redisSocket, '--raw', ...args.map(String)], { env, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).trim();
  assert.equal(call('PING'), 'PONG');
  assert.equal(call('FLUSHDB'), 'OK');
  let time = initialTime;
  const fixture = { now: () => time, advance(ms) { time += ms; }, call };
  fixture.world = createRedisWorld({ url: 'https://isolated-redis.invalid', token: 'local-test-only', now: fixture.now,
    fetcher: async (_url, init) => {
      const redisCommand = JSON.parse(init.body);
      const result = call(...redisCommand);
      return { ok: true, json: async () => ({ result }) };
    },
  });
  return fixture;
}

redisCase('actual Redis Lua matches memory bump progress, cooldowns and the final-chair rule', async () => {
  const fixture = realRedis(), memory = createMemoryWorld({ now: fixture.now });
  const compare = async value => {
    const expected = await memory.dispatch(value), actual = await fixture.world.dispatch(value);
    assert.deepEqual(actual.recruiterBump, expected.recruiterBump);
    assert.deepEqual(actual.recruiterEncounter, expected.recruiterEncounter);
    assert.deepEqual(actual.seats, expected.seats);
    assert.deepEqual(actual.botDefeats, expected.botDefeats);
    assertPrivate(actual);
    return actual;
  };
  await compare(command('a', 'join'));
  await compare(command('b', 'join'));
  const value = (suffix, contactKind) => command(suffix, 'recruiter-bump', {}, { contactKind });
  await compare(value('a', 'recruiter'));
  await compare(value('a', 'chair'));
  fixture.advance(RECRUITER_BUMP_COOLDOWN_MS);
  await compare(value('a', 'chair'));
  fixture.advance(RECRUITER_BUMP_COOLDOWN_MS);
  assert.equal((await compare(value('a', 'recruiter'))).recruiterBump.reason, 'chair-needed');
  fixture.advance(RECRUITER_BUMP_COOLDOWN_MS);
  assert.equal((await compare(value('a', 'chair'))).recruiterBump.started, true);
  assert.equal((await compare(value('b', 'chair'))).recruiterBump.reason, 'busy');
});

redisCase('actual Redis Lua awards competing third contacts to only one visitor', async () => {
  const fixture = realRedis();
  for (const suffix of ['a', 'b']) assert.equal((await bump(fixture, suffix)).recruiterBump.hits, 1);
  fixture.advance(RECRUITER_BUMP_COOLDOWN_MS);
  for (const suffix of ['a', 'b']) assert.equal((await bump(fixture, suffix)).recruiterBump.hits, 2);
  fixture.advance(RECRUITER_BUMP_COOLDOWN_MS);
  const results = await Promise.all(['a', 'b'].map(suffix => bump(fixture, suffix)));
  assert.equal(results.filter(value => value.recruiterBump.started).length, 1);
  assert.equal(new Set(results.map(value => value.recruiterEncounter.id)).size, 1);
  const owner = results[0].recruiterEncounter.ownerId;
  assert.ok([command('a').id, command('b').id].includes(owner));
  assert.equal((await fixture.world.dispatch()).recruiterEncounter.ownerId, owner);
});

redisCase('actual Redis Lua relays only owner combat and strips private and foreign attack fields', async () => {
  const fixture = realRedis(), encounter = await start(fixture);
  const update = combat(encounter, fixture.now());
  const owned = await fixture.world.dispatch(command('a', 'move', { name: '  Asha   Patel ', recruiterCombat: update, combatAction: update.playerAttack }));
  assert.equal(owned.recruiterEncounter.combat.recruiterHealth, 70);
  assert.equal(owned.visitors.find(value => value.id === command('a').id).combatAction.seq, 1);
  const foreign = await fixture.world.dispatch(command('b', 'move', { name: 'Noah', recruiterCombat: { ...update, x: RECRUITER_HOME.x - 4 }, combatAction: update.playerAttack }));
  assert.equal(foreign.recruiterEncounter.combat.x, update.x);
  assert.equal(foreign.visitors.find(value => value.id === command('b').id).combatAction ?? null, null);
  assert.equal(foreign.visitors.find(value => value.id === command('a').id).name, 'Asha Patel');
  assertPrivate(foreign);
  const wrong = await fixture.world.dispatch({ ...command('a', 'move', { recruiterCombat: { ...update, recruiterHealth: 0 } }), token: 'b'.repeat(64) });
  assert.equal(wrong.code, 403);
  assert.equal((await fixture.world.dispatch()).recruiterEncounter.combat.recruiterHealth, 70);
});

redisCase('actual Redis Lua clears settled encounters, enforces reset and ignores a stale previous fight', async () => {
  const fixture = realRedis(), previous = await start(fixture);
  const ended = await fixture.world.dispatch(command('a', 'move', { recruiterCombat: combat(previous, fixture.now(), { phase: 'seated' }), combatAction: { type: 'kick', seq: 2, startedAt: fixture.now() } }));
  assert.equal(ended.recruiterEncounter, null);
  assert.equal(ended.visitors.find(value => value.id === command('a').id).combatAction ?? null, null);
  assert.equal((await bump(fixture, 'b')).recruiterBump.reason, 'cooldown');
  fixture.advance(3100);
  const current = await start(fixture);
  assert.notEqual(current.id, previous.id);
  const stale = await fixture.world.dispatch(command('a', 'move', { recruiterCombat: combat(previous, fixture.now(), { phase: 'seated' }) }));
  assert.equal(stale.recruiterEncounter.id, current.id);
  assert.equal(stale.recruiterEncounter.combat, null);
});

redisCase('actual Redis Lua cleans departed, expired and maximum-age encounter owners', async () => {
  const departed = realRedis(); await start(departed);
  assert.equal((await departed.world.dispatch(command('a', 'leave'))).recruiterEncounter, null);
  assert.equal((await bump(departed, 'b')).recruiterBump.reason, 'cooldown');
  const expired = realRedis(); const old = await start(expired);
  assert.equal(expired.call('DEL', 'common-ground:v2:visitor:' + old.ownerId), '1');
  assert.equal((await expired.world.dispatch()).recruiterEncounter, null, 'a missing visitor lease immediately clears the global lock');
  const maximum = realRedis(); await start(maximum);
  for (let step = 1; step < RECRUITER_ENCOUNTER_TTL_MS / 10_000; step++) {
    maximum.advance(10_000); await maximum.world.dispatch(command('a'));
  }
  maximum.advance(10_000);
  assert.equal((await maximum.world.dispatch(command('a'))).recruiterEncounter, null, 'visitor heartbeats cannot renew the absolute fight lifetime');
});

redisCase('actual Redis Lua preserves ordinary seat leases, authoritative positions and private credentials', async () => {
  const fixture = realRedis();
  await fixture.world.dispatch(command('a', 'join', { name: 'Maya' }));
  const claim = await fixture.world.dispatch(command('a', 'claim', {}, { jobId: 'product-designer' }));
  assert.equal(claim.claimed, true);
  assert.equal(claim.recruiterEncounter, null);
  const occupant = claim.visitors.find(value => value.id === command('a').id);
  assert.equal(occupant.seatedJobId, 'product-designer');
  assert.equal(occupant.x, SEAT_POSITIONS['product-designer'].x);
  assert.equal(occupant.z, SEAT_POSITIONS['product-designer'].z);
  assertPrivate(claim);
  assert.equal((await bump(fixture)).recruiterBump.reason, 'seated');
  const competing = await fixture.world.dispatch(command('b', 'claim', {}, { jobId: 'product-designer' }));
  assert.equal(competing.claimed, false);
  await fixture.world.dispatch(command('a', 'leave'));
  assert.equal((await fixture.world.dispatch(command('b', 'claim', {}, { jobId: 'product-designer' }))).claimed, true);
});

test('fractional attack clocks survive authenticated relay while invalid clocks and noninteger sequences are rejected', async () => {
  const fixture = make(), encounter = await start(fixture);
  const startedAt = fixture.now() + 80.666666667;
  const attack = { type: 'punch', seq: 2, startedAt };
  const update = combat(encounter, fixture.now(), { playerAttack: attack });
  const normalized = command('a', 'move', { recruiterCombat: update, combatAction: attack });
  assert.equal(normalized.state.combatAction.startedAt, startedAt);
  assert.equal(normalized.state.recruiterCombat.playerAttack.startedAt, startedAt);
  const snapshot = await fixture.world.dispatch(normalized);
  assert.equal(snapshot.recruiterEncounter.combat.playerAttack.startedAt, startedAt);
  assert.equal(snapshot.visitors.find(value => value.id === command('a').id).combatAction.startedAt, startedAt);
  for (const invalid of [Infinity, -Infinity, NaN, -.01, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => command('a', 'move', { combatAction: { ...attack, startedAt: invalid } }), /Invalid/);
    assert.throws(() => command('a', 'move', { recruiterCombat: { ...update, playerAttack: { ...attack, startedAt: invalid } } }), /Invalid/);
  }
  for (const seq of [1.5, -1, Infinity, '2']) assert.throws(() => command('a', 'move', { combatAction: { ...attack, seq } }), /Invalid/);
});

test('return-to-chair relay preserves bounded offsets and distinguishes a nullable lowering pose from omitted fields', async t => {
  const fixture = make(), encounter = await start(fixture);
  for (const [chairOffset, sitProgress] of [[-.5, null], [-.25, .5], [0, 1]]) {
    const update = combat(encounter, fixture.now(), { phase: 'returning', chairOffset, sitProgress });
    const normalized = command('a', 'move', { recruiterCombat: update });
    assert.equal(normalized.state.recruiterCombat.chairOffset, chairOffset);
    assert.equal(normalized.state.recruiterCombat.sitProgress, sitProgress);
    const snapshot = await fixture.world.dispatch(normalized);
    assert.equal(snapshot.recruiterEncounter.combat.chairOffset, chairOffset);
    assert.equal(snapshot.recruiterEncounter.combat.sitProgress, sitProgress);
  }
  const omitted = JSON.parse(JSON.stringify(combat(encounter, fixture.now(), { phase: 'returning', chairOffset: undefined, sitProgress: undefined })));
  const snapshot = await fixture.world.dispatch(command('a', 'move', { recruiterCombat: omitted }));
  assert.equal(Object.hasOwn(snapshot.recruiterEncounter.combat, 'chairOffset'), false);
  assert.equal(Object.hasOwn(snapshot.recruiterEncounter.combat, 'sitProgress'), false);
  for (const patch of [{ chairOffset: -.501 }, { chairOffset: .01 }, { chairOffset: NaN }, { chairOffset: Infinity }, { sitProgress: -.01 }, { sitProgress: 1.01 }, { sitProgress: NaN }, { sitProgress: Infinity }, { sitProgress: '0.5' }]) {
    assert.throws(() => command('a', 'move', { recruiterCombat: combat(encounter, fixture.now(), patch) }), /Invalid/);
  }
  const local = browser(t, { response: () => ({ ok: false, status: 503 }) });
  local.client.update(near()); await local.tick();
  let started;
  for (let hit = 0; hit < 3; hit++) {
    started = await local.client.bumpRecruiter('chair'); local.advance(RECRUITER_BUMP_COOLDOWN_MS);
  }
  const valid = combat(started.recruiterEncounter, Date.now(), { phase: 'returning', chairOffset: -.2, sitProgress: null,
    playerAttack: { type: 'punch', seq: 1, startedAt: Date.now() + .666666667 } });
  local.client.update({ recruiterCombat: valid });
  const accepted = await local.client.bumpRecruiter('chair');
  assert.equal(accepted.recruiterEncounter.combat.sitProgress, null);
  assert.equal(accepted.recruiterEncounter.combat.playerAttack.startedAt, valid.playerAttack.startedAt);
  local.client.update({ recruiterCombat: { ...valid, x: valid.x + 2, playerAttack: { ...valid.playerAttack, startedAt: Infinity } } });
  const rejected = await local.client.bumpRecruiter('chair');
  assert.equal(rejected.recruiterEncounter.combat.x, valid.x, 'local fallback also ignores a malformed whole combat update');
  rejected.recruiterEncounter.combat.chairOffset = 123;
  assert.equal((await local.client.bumpRecruiter('chair')).recruiterEncounter.combat.chairOffset, -.2,
    'a caller cannot mutate the private local encounter through a returned snapshot');
});

redisCase('actual Redis Lua retains fractional attack clocks, nullable chair poses and normalized return offsets', async () => {
  const fixture = realRedis(1_800_000_000_000), encounter = await start(fixture);
  const startedAt = fixture.now() + 80.666666667;
  const attack = { type: 'kick', seq: 3, startedAt };
  const update = combat(encounter, fixture.now(), { phase: 'returning', playerAttack: attack, chairOffset: -.31, sitProgress: null });
  const snapshot = await fixture.world.dispatch(command('a', 'move', { recruiterCombat: update, combatAction: attack }));
  assert.ok(Math.abs(snapshot.recruiterEncounter.combat.playerAttack.startedAt - startedAt) < .2,
    'Redis CJSON retains the sub-millisecond animation clock at a real epoch despite decimal rounding');
  assert.ok(Math.abs(snapshot.visitors.find(value => value.id === command('a').id).combatAction.startedAt - startedAt) < .2);
  assert.equal(snapshot.recruiterEncounter.combat.chairOffset, -.31);
  assert.equal(snapshot.recruiterEncounter.combat.sitProgress, null);
  const lowering = await fixture.world.dispatch(command('a', 'move', { recruiterCombat: { ...update, chairOffset: 0, sitProgress: .75 } }));
  assert.equal(lowering.recruiterEncounter.combat.chairOffset, 0);
  assert.equal(lowering.recruiterEncounter.combat.sitProgress, .75);
  const omitted = JSON.parse(JSON.stringify({ ...update, chairOffset: undefined, sitProgress: undefined }));
  const walking = await fixture.world.dispatch(command('a', 'move', { recruiterCombat: omitted }));
  assert.equal(Object.hasOwn(walking.recruiterEncounter.combat, 'chairOffset'), false);
  assert.equal(Object.hasOwn(walking.recruiterEncounter.combat, 'sitProgress'), false);
  assertPrivate(walking);
});
