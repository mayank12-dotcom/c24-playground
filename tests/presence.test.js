import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createMemoryWorld, createRedisWorld, handleWorldRequest, validateCommand, VISITOR_TTL_MS } from '../api/world.js';
import { createPresence } from '../src/presence.js';
import { STATION_POSITIONS } from '../src/crowd.js';
import { SOCIAL_SEATS } from '../src/social-layout.js';
import { SEAT_POSITIONS } from '../src/seat-catalog.js';

const state = { x: 2, z: -3, rotation: Math.PI, hair: 2 };
const visitor = (suffix, action = 'join', extra = {}) => validateCommand({ id: `visitor-00000000-${suffix}`, token: suffix.repeat(64).slice(0, 64), action, state, ...extra });

test('anonymous visitors need their own private credential; snapshots never expose it', async () => {
  const world = createMemoryWorld();
  await world.dispatch(visitor('a'));
  const result = await world.dispatch(visitor('a', 'move', { token: 'b'.repeat(64), state: { ...state, x: 100 } }));
  assert.equal(result.code, 403);
  const snapshot = await world.dispatch();
  assert.equal(snapshot.visitors[0].x, 2);
  assert.equal(snapshot.visitors[0].token, undefined);
  assert.equal(JSON.stringify(snapshot).includes('a'.repeat(64)), false);
});

test('seat claims are exclusive, bots keep their seats, and leave releases a seat', async () => {
  const world = createMemoryWorld();
  await Promise.all([world.dispatch(visitor('a')), world.dispatch(visitor('b'))]);
  const claims = await Promise.all(['a', 'b'].map(id => world.dispatch(visitor(id, 'claim', { jobId: 'product-designer' }))));
  assert.equal(claims.filter(result => result.claimed).length, 1);
  assert.equal((await world.dispatch(visitor('b', 'claim', { jobId: 'brand-designer' }))).claimed, false);
  assert.equal((await world.dispatch()).seats['product-designer'], visitor('a').id);
  await world.dispatch(visitor('a', 'leave'));
  assert.equal((await world.dispatch(visitor('b', 'claim', { jobId: 'product-designer' }))).claimed, true);
  const publicVisitor = (await world.dispatch()).visitors.find(value => value.id === visitor('b').id);
  assert.equal(publicVisitor.seatedJobId, 'product-designer');
});

test('stale seats expire and a late heartbeat cannot steal a replacement occupant’s seat', async () => {
  let time = 1000;
  const world = createMemoryWorld({ now: () => time });
  await world.dispatch(visitor('a', 'claim', { jobId: 'frontend-engineer' }));
  time += VISITOR_TTL_MS + 1;
  assert.deepEqual((await world.dispatch()).visitors, []);
  await world.dispatch(visitor('b', 'claim', { jobId: 'frontend-engineer' }));
  const late = await world.dispatch(visitor('a', 'move', { state: { ...state, seatedJobId: 'frontend-engineer' } }));
  assert.equal(late.seats['frontend-engineer'], visitor('b').id);
  assert.equal(late.visitors.find(value => value.id === visitor('a').id).seatedJobId, null);
});

test('active heartbeats renew seat leases and a seat switch releases the previous seat', async () => {
  let time = 1000;
  const world = createMemoryWorld({ now: () => time });
  await world.dispatch(visitor('a', 'claim', { jobId: 'frontend-engineer' }));
  time += 20_000;
  await world.dispatch(visitor('a', 'move'));
  time += 20_000;
  assert.equal((await world.dispatch()).seats['frontend-engineer'], visitor('a').id);
  const switched = await world.dispatch(visitor('a', 'claim', { jobId: 'product-designer' }));
  assert.equal(switched.seats['frontend-engineer'], undefined);
  assert.equal(switched.seats['product-designer'], visitor('a').id);
});

test('claim snapshots sit at the authoritative chair and seated movement cannot relocate it', async () => {
  const world = createMemoryWorld();
  const [chairX, chairZ] = STATION_POSITIONS[0];
  const assertSeated = snapshot => {
    const occupant = snapshot.visitors.find(value => value.id === visitor('a').id);
    assert.equal(occupant.seatedJobId, 'product-designer');
    assert.equal(occupant.x, chairX);
    assert.equal(occupant.z, chairZ + 1.5);
    assert.equal(occupant.rotation, Math.PI);
  };
  assertSeated(await world.dispatch(visitor('a', 'claim', { jobId: 'product-designer' })));
  assertSeated(await world.dispatch(visitor('a', 'move', { state: { ...state, x: 999, z: -999, rotation: 0 } })));
  await world.dispatch(visitor('a', 'release'));
  const walking = await world.dispatch(visitor('a', 'move', { state: { ...state, x: 6, z: 7, rotation: 0 } }));
  assert.equal(walking.visitors[0].seatedJobId, null);
  assert.equal(walking.visitors[0].x, 6);
});

test('invalid coordinates, hairstyle, secrets, and fabricated jobs are rejected', () => {
  for (const extra of [{ state: { ...state, x: Infinity } }, { state: { ...state, hair: 12 } }, { token: '' }, { action: 'claim', jobId: 'fake' }]) {
    assert.throws(() => visitor('a', 'move', extra));
  }
});

test('bald avatars can join while unsupported hairstyle values remain invalid', async () => {
  const world = createMemoryWorld();
  const joined = await world.dispatch(visitor('a', 'join', { state: { ...state, hair: 5 } }));
  assert.equal(joined.visitors[0].hair, 5);
  assert.throws(() => visitor('a', 'move', { state: { ...state, hair: 6 } }));
});

test('free lounge seats have exclusive authoritative ownership and release like job chairs', async () => {
  const world = createMemoryWorld();
  const seat = SOCIAL_SEATS.find(value => !value.occupiedBy);
  const claims = await Promise.all(['a', 'b'].map(suffix => world.dispatch(visitor(suffix, 'claim', { jobId: seat.id, state: { ...state, hair: 5 } }))));
  assert.equal(claims.filter(value => value.claimed).length, 1);
  const seated = (await world.dispatch()).visitors.find(value => value.seatedJobId === seat.id);
  assert.deepEqual({ x: seated.x, z: seated.z, rotation: seated.rotation }, SEAT_POSITIONS[seat.id]);
  const held = await world.dispatch(visitor('a', 'move', { state: { ...state, x: 999, z: 999 } }));
  assert.equal(held.visitors.find(value => value.id === visitor('a').id).x, seat.x);
  await world.dispatch(visitor('a', 'release'));
  assert.equal((await world.dispatch(visitor('b', 'claim', { jobId: seat.id }))).claimed, true);
  assert.throws(() => visitor('a', 'claim', { jobId: SOCIAL_SEATS.find(value => value.occupiedBy).id }), 'social companions retain their own couch seats');
  assert.throws(() => visitor('a', 'challenge', { jobId: seat.id }), 'relaxing seats cannot start job-seat challenges');
});

test('solo presence starts bald and supports free lounge seating without a job application', async t => {
  const previous = { window: globalThis.window, fetch: globalThis.fetch };
  let tick, posted;
  globalThis.window = { setInterval(callback) { tick = callback; return 0; }, addEventListener() {}, removeEventListener() {} };
  globalThis.fetch = async (_url, options) => { posted = JSON.parse(options.body); return { ok: false, status: 503 }; };
  const snapshots = [], client = createPresence({ onVisitors: value => snapshots.push(value) });
  t.after(() => { client.destroy(); Object.assign(globalThis, previous); });
  await tick();
  assert.equal(posted.state.hair, 5);
  const seat = SOCIAL_SEATS.find(value => !value.occupiedBy);
  assert.equal(await client.claimSeat(seat.id), true);
  assert.equal(snapshots.at(-1).seats[seat.id], client.id);
  await client.releaseSeat();
  assert.equal(snapshots.at(-1).seats[seat.id], undefined);
});

test('HTTP API shares visitor positions, rejects foreign origins and oversized requests, and reports absent production storage', async () => {
  const world = createMemoryWorld();
  const request = async ({ method = 'GET', origin = 'http://localhost:4173', body = '', store = world } = {}) => {
    const req = Readable.from([body]); req.method = method; req.headers = { host: 'localhost:4173', origin };
    const res = { statusCode: 0, setHeader() {}, end(value) { this.body = JSON.parse(value); } };
    await handleWorldRequest(req, res, store); return res;
  };
  const join = await request({ method: 'POST', body: JSON.stringify(visitor('a')) });
  assert.equal(join.statusCode, 200);
  const snapshot = (await request()).body;
  assert.equal(snapshot.visitors[0].id, visitor('a').id);
  assert.equal((await request({ origin: 'https://foreign.example' })).statusCode, 403);
  assert.equal((await request({ method: 'POST', body: 'x'.repeat(5000) })).statusCode, 413);
  assert.equal((await request({ store: null })).statusCode, 503);
});

test('Redis uses a single atomic script and keeps credentials only in its server request', async () => {
  let request;
  const world = createRedisWorld({ url: 'https://redis.example/', token: 'server-only', fetcher: async (url, init) => {
    request = { url, ...init };
    return { ok: true, json: async () => ({ result: JSON.stringify({ visitors: {}, seats: {}, serverTime: 1, status: 'shared' }) }) };
  } });
  assert.deepEqual((await world.dispatch(visitor('a'))).visitors, []);
  const redisCommand = JSON.parse(request.body);
  assert.equal(redisCommand[0], 'EVAL');
  assert.ok(redisCommand[1].includes("'PX',ttl,'NX'"));
  assert.ok(redisCommand[1].includes('visitor.token=nil'));
  assert.ok(redisCommand[1].includes('hits=0,required=1,won=false'));
  assert.ok(redisCommand[1].includes('challenge.hits=1; challenge.won=true; claimed=true'));
  assert.equal(redisCommand[1].includes("redis.call('GET',progressKey)"), false, 'old multi-push progress cannot delay a one-push win');
  assert.ok(redisCommand[1].includes('visitor.x=position.x; visitor.z=position.z; visitor.rotation=position.rotation'));
  assert.deepEqual(JSON.parse(redisCommand.at(-1))['product-designer'], { x: STATION_POSITIONS[0][0], z: STATION_POSITIONS[0][1] + 1.5, rotation: Math.PI });
  const lounge = SOCIAL_SEATS.find(value => !value.occupiedBy);
  assert.deepEqual(JSON.parse(redisCommand.at(-1))[lounge.id], { x: lounge.x, z: lounge.z, rotation: lounge.rotation });
  assert.ok(JSON.parse(redisCommand.at(-3)).includes(lounge.id), 'lounge leases participate in the same atomic store snapshot');
  assert.equal(request.headers.Authorization, 'Bearer server-only');
});

test('browser presence publishes movement, keeps chair switches seated, and reports lease loss', async t => {
  const previous = { window: globalThis.window, fetch: globalThis.fetch };
  let tick;
  globalThis.window = { setInterval(callback) { tick = callback; return 0; }, addEventListener() {}, removeEventListener() {} };
  const world = createMemoryWorld();
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body); requests.push(body);
    return { ok: true, json: async () => world.dispatch(validateCommand(body)) };
  };
  t.after(() => Object.assign(globalThis, previous));
  const statuses = [], lost = [], snapshots = [];
  const client = createPresence({ onStatus: value => statuses.push(value.mode), onVisitors: value => snapshots.push(value), onSeatLost: id => lost.push(id) });
  client.update({ ...state });
  await tick();
  assert.deepEqual(statuses, ['connecting', 'shared']);
  assert.equal(snapshots.at(-1).visitors[0].x, state.x);
  assert.equal(await client.claimSeat('product-designer'), true);
  assert.equal(await client.claimSeat('frontend-engineer'), true);
  assert.deepEqual(lost, []);
  const own = requests[0];
  // Mimic another page transition releasing this session's lease.
  await world.dispatch(validateCommand({ ...own, action: 'release' }));
  // Tick gating is bypassed by changing state after a simulated elapsed second.
  const realNow = Date.now; Date.now = () => realNow() + 2000;
  try { client.update({ x: 3 }); await tick(); } finally { Date.now = realNow; }
  assert.deepEqual(lost, ['frontend-engineer']);
  client.destroy();
});

test('unconfigured live connection explicitly becomes solo mode and still permits local seating', async t => {
  const previous = { window: globalThis.window, fetch: globalThis.fetch };
  let tick;
  globalThis.window = { setInterval(callback) { tick = callback; return 0; }, addEventListener() {}, removeEventListener() {} };
  globalThis.fetch = async () => ({ ok: false });
  t.after(() => Object.assign(globalThis, previous));
  const statuses = [], snapshots = [];
  const client = createPresence({ onStatus: value => statuses.push(value.mode), onVisitors: value => snapshots.push(value) });
  await tick();
  assert.deepEqual(statuses, ['connecting', 'local']);
  assert.equal(snapshots.at(-1).status, 'local');
  assert.equal(await client.claimSeat('product-designer'), true);
  client.destroy();
});

const botJob = 'brand-designer';
const nearBot = { ...state, x: STATION_POSITIONS[2][0] + 1, z: STATION_POSITIONS[2][1] + 1.5 };
const strike = (suffix, overrides = {}) => visitor(suffix, 'challenge', { jobId: botJob, state: nearBot, ...overrides });

test('one nearby push atomically reserves the bot chair and permanently frees it', async () => {
  let time = 1000;
  const world = createMemoryWorld({ now: () => time });
  await world.dispatch(visitor('a', 'join', { state: nearBot }));
  assert.equal((await world.dispatch(visitor('a', 'claim', { jobId: botJob }))).claimed, false);
  const won = await world.dispatch(strike('a'));
  assert.deepEqual(won.challenge, { jobId: botJob, hits: 1, required: 1, won: true });
  assert.equal(won.claimed, true);
  assert.equal(won.seats[botJob], visitor('a').id);
  assert.equal(won.botDefeats[botJob], time);
  assert.equal(won.visitors[0].x, STATION_POSITIONS[2][0]);
  assert.equal(won.visitors[0].z, STATION_POSITIONS[2][1] + 1.5);
  assert.equal(won.visitors[0].rotation, Math.PI);
  const duplicate = await world.dispatch(strike('a'));
  assert.equal(duplicate.challenge.won, false);
  assert.equal(duplicate.challenge.reason, 'already-defeated');
  assert.equal(duplicate.botDefeats[botJob], 1000, 'duplicate requests do not replay the fall');
  await world.dispatch(visitor('a', 'leave'));
  time += VISITOR_TTL_MS + 1;
  assert.equal((await world.dispatch()).botDefeats[botJob], 1000);
  assert.equal((await world.dispatch(visitor('b', 'claim', { jobId: botJob }))).claimed, true);
  assert.equal((await world.dispatch(visitor('c', 'claim', { jobId: 'community-lead' }))).claimed, false);
});

test('a push rejects distant or seated visitors and ordinary jobs without disturbing another seat', async () => {
  const world = createMemoryWorld();
  const distant = await world.dispatch(strike('a', { state }));
  assert.equal(distant.challenge.reason, 'too-far');
  assert.equal(distant.challenge.hits, 0);
  assert.equal((await world.dispatch(strike('a', { jobId: 'product-designer' }))).challenge.reason, 'not-bot');
  await world.dispatch(visitor('a', 'claim', { jobId: 'product-designer' }));
  const seated = await world.dispatch(strike('a'));
  assert.equal(seated.challenge.reason, 'seated');
  assert.equal(seated.visitors[0].seatedJobId, 'product-designer');
  assert.equal(seated.seats['product-designer'], visitor('a').id);
  assert.equal(seated.botDefeats[botJob], undefined);
  assert.throws(() => visitor('a', 'challenge', { jobId: 'unknown' }));
  assert.throws(() => strike('a', { state: { ...nearBot, x: Infinity } }));
});

test('push range ends at 2.4 units from the applicant chair', async () => {
  const position = SEAT_POSITIONS[botJob];
  const world = createMemoryWorld();
  const commandAt = distance => strike('a', { state: { ...state, x: position.x + distance, z: position.z } });
  const tooFar = await world.dispatch(commandAt(2.401));
  assert.equal(tooFar.challenge.reason, 'too-far');
  assert.equal(tooFar.seats[botJob], undefined);
  assert.equal((await world.dispatch(commandAt(2.4))).challenge.won, true);
});

test('simultaneous pushers produce only one winning owner and cannot displace a real visitor', async () => {
  let time = 1000;
  const world = createMemoryWorld({ now: () => time });
  const finals = await Promise.all(['a', 'b'].map(suffix => world.dispatch(strike(suffix))));
  assert.equal(finals.filter(result => result.challenge.won).length, 1);
  assert.equal(finals[1].challenge.reason, 'occupied');
  const snapshot = await world.dispatch();
  assert.equal(snapshot.seats[botJob], visitor('a').id);
  assert.equal(snapshot.visitors.filter(value => value.seatedJobId === botJob).length, 1);
  time += 1000;
  assert.equal((await world.dispatch(strike('b'))).challenge.reason, 'occupied');
  assert.equal((await world.dispatch(visitor('b', 'claim', { jobId: botJob }))).claimed, false);
  assert.equal((await world.dispatch()).botDefeats[botJob], 1000);
  await world.dispatch(visitor('a', 'leave'));
  assert.equal((await world.dispatch(strike('b'))).challenge.reason, 'already-defeated');
  assert.equal((await world.dispatch(visitor('b', 'claim', { jobId: botJob }))).claimed, true);
});

test('offline pushing needs one nearby action and retains the cleared chair across reconnect attempts', async t => {
  const previous = { window: globalThis.window, fetch: globalThis.fetch, now: Date.now };
  let tick, time = 1000;
  Date.now = () => time;
  globalThis.window = { setInterval(callback) { tick = callback; return 0; }, addEventListener() {}, removeEventListener() {} };
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  t.after(() => { globalThis.window = previous.window; globalThis.fetch = previous.fetch; Date.now = previous.now; });
  const snapshots = [];
  const client = createPresence({ onVisitors: value => snapshots.push(value) });
  await tick();
  assert.equal(await client.claimSeat(botJob), false);
  assert.equal((await client.challengeBot(botJob)).reason, 'too-far');
  client.update(nearBot);
  const won = await client.challengeBot(botJob);
  assert.deepEqual(won, { jobId: botJob, hits: 1, required: 1, won: true });
  assert.equal(snapshots.at(-1).botDefeats[botJob], time);
  assert.equal(snapshots.at(-1).seats[botJob], client.id);
  assert.equal((await client.challengeBot('community-lead')).reason, 'seated');
  assert.equal((await client.challengeBot(botJob)).reason, 'already-defeated');
  await client.releaseSeat();
  assert.equal(snapshots.at(-1).seats[botJob], undefined);
  time += 6000;
  await tick();
  assert.equal(snapshots.at(-1).botDefeats[botJob], 1000);
  assert.equal((await client.challengeBot(botJob)).reason, 'already-defeated');
  assert.equal(await client.claimSeat(botJob), true);
  client.destroy();
});

test('shared presence reserves a bot chair after exactly one server-confirmed push', async t => {
  const previous = { window: globalThis.window, fetch: globalThis.fetch, now: Date.now };
  let tick, time = 1000;
  Date.now = () => time;
  globalThis.window = { setInterval(callback) { tick = callback; return 0; }, addEventListener() {}, removeEventListener() {} };
  const world = createMemoryWorld({ now: () => time });
  const requests = [], snapshots = [];
  globalThis.fetch = async (_url, options) => {
    const command = JSON.parse(options.body); requests.push(command);
    return { ok: true, json: async () => world.dispatch(validateCommand(command)) };
  };
  t.after(() => { globalThis.window = previous.window; globalThis.fetch = previous.fetch; Date.now = previous.now; });
  const client = createPresence({ onVisitors: value => snapshots.push(value) });
  client.update(nearBot);
  await tick();
  assert.equal(snapshots.at(-1).seats[botJob], undefined);
  const [won, duplicate] = await Promise.all([client.challengeBot(botJob), client.challengeBot(botJob)]);
  assert.deepEqual(won, { jobId: botJob, hits: 1, required: 1, won: true });
  assert.equal(duplicate.reason, 'already-defeated');
  assert.equal(duplicate.won, false);
  assert.equal(requests.filter(value => value.action === 'challenge').length, 2, 'one command per deliberate call, with no synthetic progress requests');
  assert.equal(snapshots.at(-1).seats[botJob], client.id);
  assert.equal(snapshots.at(-1).botDefeats[botJob], 1000);
  time += 1000;
  await tick();
  assert.equal(requests.at(-1).state.x, STATION_POSITIONS[2][0]);
  assert.equal(requests.at(-1).state.z, STATION_POSITIONS[2][1] + 1.5);
  await client.releaseSeat();
  assert.equal((await world.dispatch()).seats[botJob], undefined);
  client.destroy();
  assert.equal((await client.challengeBot(botJob)).reason, 'unavailable');
});

test('HTTP failures never masquerade as a successful challenge or seat takeover', async t => {
  const previous = { window: globalThis.window, fetch: globalThis.fetch };
  let tick;
  globalThis.window = { setInterval(callback) { tick = callback; return 0; }, addEventListener() {}, removeEventListener() {} };
  const world = createMemoryWorld();
  let deny = false;
  globalThis.fetch = async (_url, options) => deny ? { ok: false, status: 403 } : { ok: true, json: async () => world.dispatch(validateCommand(JSON.parse(options.body))) };
  t.after(() => Object.assign(globalThis, previous));
  const snapshots = [];
  const client = createPresence({ onVisitors: value => snapshots.push(value) });
  client.update(nearBot);
  await tick();
  deny = true;
  const result = await client.challengeBot(botJob);
  assert.equal(result.won, false);
  assert.equal(result.reason, 'unavailable');
  assert.equal(snapshots.at(-1).botDefeats[botJob], undefined);
  assert.equal(await client.claimSeat('product-designer'), false);
  assert.equal((await client.challengeBot(botJob)).reason, 'unavailable');
  assert.equal((await world.dispatch()).seats[botJob], undefined);
  client.destroy();
});

test('a cached real visitor lease remains protected when the live service goes offline', async t => {
  const previous = { window: globalThis.window, fetch: globalThis.fetch, now: Date.now };
  let tick, time = 1000, online = true;
  Date.now = () => time;
  globalThis.window = { setInterval(callback) { tick = callback; return 0; }, addEventListener() {}, removeEventListener() {} };
  globalThis.fetch = async () => online
    ? { ok: true, json: async () => ({ visitors: [], seats: { [botJob]: 'another-live-visitor' }, botDefeats: {}, serverTime: time }) }
    : { ok: false, status: 503 };
  const snapshots = [], client = createPresence({ onVisitors: value => snapshots.push(value) });
  t.after(() => { client.destroy(); globalThis.window = previous.window; globalThis.fetch = previous.fetch; Date.now = previous.now; });
  client.update(nearBot);
  await tick();
  online = false; time += 1000;
  await tick();
  const rejected = await client.challengeBot(botJob);
  assert.equal(rejected.reason, 'occupied');
  assert.equal(rejected.won, false);
  assert.equal(snapshots.at(-1).seats[botJob], 'another-live-visitor');
  assert.equal(snapshots.at(-1).botDefeats[botJob], undefined);
});

test('malformed or unowned server wins do not become confirmed client seat takeovers', async t => {
  const previous = { window: globalThis.window, fetch: globalThis.fetch };
  let tick, malformed;
  globalThis.window = { setInterval(callback) { tick = callback; return 0; }, addEventListener() {}, removeEventListener() {} };
  globalThis.fetch = async (_url, options) => {
    const command = JSON.parse(options.body);
    const snapshot = { visitors: [], seats: {}, botDefeats: {}, serverTime: Date.now() };
    if (command.action === 'challenge') Object.assign(snapshot, malformed);
    return { ok: true, json: async () => snapshot };
  };
  const client = createPresence();
  t.after(() => { client.destroy(); Object.assign(globalThis, previous); });
  client.update(nearBot);
  await tick();
  const valid = { jobId: botJob, hits: 1, required: 1, won: true };
  for (const value of [
    { claimed: false, challenge: valid },
    { claimed: true, seats: { [botJob]: 'another-live-visitor' }, challenge: valid },
    { claimed: true, seats: { [botJob]: client.id }, challenge: { ...valid, required: 3 } },
    { claimed: true, seats: { [botJob]: client.id }, challenge: { ...valid, hits: 0 } },
    { claimed: true, seats: { [botJob]: client.id }, challenge: { ...valid, hits: 2 } },
    { claimed: true, seats: { [botJob]: client.id }, challenge: { ...valid, won: 'true' } },
  ]) {
    malformed = value;
    const result = await client.challengeBot(botJob);
    assert.equal(result.won, false);
    assert.equal(result.reason, 'unavailable');
  }
});
