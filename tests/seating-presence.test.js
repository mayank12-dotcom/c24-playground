import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { jobs } from '../src/application.js';
import { FURNITURE_SEATS } from '../src/furniture-seats.js';
import { SOCIAL_SEATS } from '../src/social-layout.js';
import { SEAT_IDS, SEAT_POSITIONS } from '../src/seat-catalog.js';
import { createPresence } from '../src/presence.js';
import { createMemoryWorld, createRedisWorld, handleWorldRequest, validateCommand, VISITOR_TTL_MS } from '../api/world.js';

const state = { x: 0, z: 4.8, rotation: 0, hair: 5 };
const visitor = (suffix, action, extra = {}) => validateCommand({
  id: `seating-visitor-${suffix}`, token: suffix.repeat(64), action, state, ...extra,
});
const positionOf = value => ({ x: value.x, z: value.z, rotation: value.rotation });

test('every new furniture slot is public while companion seats and job opportunities remain distinct', () => {
  assert.equal(FURNITURE_SEATS.length, 34, 'all new lounge furnishings are represented');
  assert.equal(SEAT_IDS.length, 47);
  assert.equal(new Set(SEAT_IDS).size, SEAT_IDS.length);
  for (const seat of FURNITURE_SEATS) {
    assert.deepEqual(SEAT_POSITIONS[seat.id], positionOf(seat), seat.id);
    assert.ok(Object.values(SEAT_POSITIONS[seat.id]).every(Number.isFinite), seat.id);
    assert.ok(!jobs.some(job => job.id === seat.id), 'lounging never creates a job opportunity');
    assert.doesNotThrow(() => visitor('a', 'claim', { jobId: seat.id }));
    assert.throws(() => visitor('a', 'challenge', { jobId: seat.id }), /Unknown seat/);
  }
  for (const seat of SOCIAL_SEATS.filter(value => value.occupiedBy)) {
    assert.ok(!SEAT_IDS.includes(seat.id), `${seat.id} remains reserved for its companion`);
    assert.throws(() => visitor('a', 'claim', { jobId: seat.id }), /Unknown seat/);
  }
  assert.equal(jobs.length, 9, 'the opportunity roster contains the original jobs only');
});

test('every new couch, armchair, beanbag, and ottoman slot has an exclusive anchored lease', async () => {
  const world = createMemoryWorld();
  for (const seat of FURNITURE_SEATS) {
    const claims = await Promise.all(['a', 'b'].map(suffix => world.dispatch(visitor(suffix, 'claim', { jobId: seat.id }))));
    assert.equal(claims.filter(value => value.claimed).length, 1, seat.id);
    assert.equal(claims[0].claimed, true, seat.id);
    assert.equal(claims[1].claimed, false, seat.id);
    const seated = claims[1].visitors.find(value => value.id === visitor('a', 'join').id);
    assert.deepEqual(positionOf(seated), SEAT_POSITIONS[seat.id], seat.id);

    const moved = await world.dispatch(visitor('a', 'move', { state: { ...state, x: 999, z: -999, rotation: 2 } }));
    assert.deepEqual(positionOf(moved.visitors.find(value => value.id === seated.id)), SEAT_POSITIONS[seat.id], `${seat.id} is not relocated by a heartbeat`);
    await world.dispatch(visitor('b', 'release'));
    assert.equal((await world.dispatch()).seats[seat.id], seated.id, 'another visitor cannot release the owner');
    await world.dispatch(visitor('a', 'release'));
    assert.equal((await world.dispatch(visitor('b', 'claim', { jobId: seat.id }))).claimed, true, `${seat.id} is reusable`);
    await world.dispatch(visitor('b', 'leave'));
    assert.deepEqual((await world.dispatch()).seats, {});
  }
});

test('all two-place sofas allow independent adjacent occupants without double booking either cushion', async () => {
  const couches = Object.groupBy(FURNITURE_SEATS.filter(value => value.kind === 'couch'), value => value.colliderId);
  assert.equal(Object.keys(couches).length, 9);
  for (const [colliderId, seats] of Object.entries(couches)) {
    assert.equal(seats.length, 2, colliderId);
    assert.notDeepEqual(positionOf(seats[0]), positionOf(seats[1]), colliderId);
    const world = createMemoryWorld();
    const [first, second] = await Promise.all(seats.map((seat, index) => world.dispatch(visitor(index ? 'b' : 'a', 'claim', { jobId: seat.id }))));
    assert.equal(first.claimed, true, colliderId);
    assert.equal(second.claimed, true, colliderId);
    assert.equal((await world.dispatch(visitor('c', 'claim', { jobId: seats[0].id }))).claimed, false, colliderId);
    await world.dispatch(visitor('a', 'release'));
    const remaining = await world.dispatch();
    assert.equal(remaining.seats[seats[0].id], undefined, colliderId);
    assert.equal(remaining.seats[seats[1].id], visitor('b', 'join').id, colliderId);
    assert.equal((await world.dispatch(visitor('c', 'claim', { jobId: seats[0].id }))).claimed, true, colliderId);
  }
});

test('a furniture lease expires and a late previous occupant cannot take it from its replacement', async () => {
  for (const kind of ['couch', 'armchair', 'beanbag', 'ottoman']) {
    const seat = FURNITURE_SEATS.find(value => value.kind === kind);
    assert.ok(seat, kind);
    let time = 1000;
    const world = createMemoryWorld({ now: () => time });
    await world.dispatch(visitor('a', 'claim', { jobId: seat.id }));
    time += VISITOR_TTL_MS + 1;
    assert.equal((await world.dispatch(visitor('b', 'claim', { jobId: seat.id }))).claimed, true, kind);
    const late = await world.dispatch(visitor('a', 'move'));
    assert.equal(late.seats[seat.id], visitor('b', 'join').id, kind);
    assert.equal(late.visitors.find(value => value.id === visitor('a', 'join').id).seatedJobId, null, kind);
  }
});

test('the HTTP endpoint accepts every expanded furniture seat and rejects reserved companion cushions', async () => {
  const world = createMemoryWorld();
  async function post(command) {
    const request = Readable.from([JSON.stringify(command)]);
    request.method = 'POST';
    request.headers = { host: 'localhost:4173', origin: 'http://localhost:4173' };
    const response = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
    await handleWorldRequest(request, response, world);
    return response;
  }
  for (const seat of FURNITURE_SEATS) {
    const claimed = await post(visitor('a', 'claim', { jobId: seat.id }));
    assert.equal(claimed.statusCode, 200, seat.id);
    assert.equal(claimed.body.claimed, true, seat.id);
    assert.deepEqual(Object.keys(claimed.body.seats), [seat.id], 'switching seats releases the previous furniture slot');
    assert.deepEqual(positionOf(claimed.body.visitors[0]), SEAT_POSITIONS[seat.id], seat.id);
  }
  const occupied = SOCIAL_SEATS.find(value => value.occupiedBy);
  const invalid = { ...visitor('b', 'join'), action: 'claim', jobId: occupied.id };
  assert.equal((await post(invalid)).statusCode, 400);
});

test('Redis commands carry the complete furniture lease catalog and authoritative positions', async () => {
  const commands = [];
  const world = createRedisWorld({
    url: 'https://redis.example/', token: 'fixture-only', now: () => 1000,
    fetcher: async (_url, init) => {
      commands.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ result: JSON.stringify({ visitors: [], seats: {}, serverTime: 1000, status: 'shared' }) }) };
    },
  });
  for (const seat of FURNITURE_SEATS) await world.dispatch(visitor('a', 'claim', { jobId: seat.id }));
  assert.equal(commands.length, FURNITURE_SEATS.length);
  for (const [index, command] of commands.entries()) {
    assert.equal(command[0], 'EVAL');
    assert.equal(command[10], FURNITURE_SEATS[index].id);
    assert.deepEqual(JSON.parse(command.at(-3)), SEAT_IDS);
    assert.deepEqual(JSON.parse(command.at(-1)), SEAT_POSITIONS);
  }
});

test('shared browser presence claims, publishes, and releases every new furniture slot', async t => {
  const previous = { window: globalThis.window, fetch: globalThis.fetch, now: Date.now };
  let tick, time = 1000;
  Date.now = () => time;
  globalThis.window = { setInterval(callback) { tick = callback; return 0; }, addEventListener() {}, removeEventListener() {} };
  const world = createMemoryWorld({ now: () => time });
  globalThis.fetch = async (_url, options) => ({ ok: true, json: async () => world.dispatch(validateCommand(JSON.parse(options.body))) });
  const snapshots = [], client = createPresence({ onVisitors: value => snapshots.push(value) });
  t.after(() => { client.destroy(); globalThis.window = previous.window; globalThis.fetch = previous.fetch; Date.now = previous.now; });
  await tick();
  for (const seat of FURNITURE_SEATS) {
    assert.equal(await client.claimSeat(seat.id), true, seat.id);
    assert.equal(snapshots.at(-1).seats[seat.id], client.id, seat.id);
    assert.equal((await world.dispatch(visitor('b', 'claim', { jobId: seat.id }))).claimed, false, seat.id);
    client.update({ x: 999, z: -999, rotation: 2 });
    time += 1000;
    await tick();
    assert.deepEqual(positionOf(snapshots.at(-1).visitors.find(value => value.id === client.id)), SEAT_POSITIONS[seat.id], seat.id);
    await client.releaseSeat();
    assert.equal((await world.dispatch()).seats[seat.id], undefined, seat.id);
  }
});

test('solo browser presence can use every new furniture slot while companion cushions stay unavailable', async t => {
  const previous = { window: globalThis.window, fetch: globalThis.fetch };
  let tick;
  globalThis.window = { setInterval(callback) { tick = callback; return 0; }, addEventListener() {}, removeEventListener() {} };
  globalThis.fetch = async () => ({ ok: false, status: 503 });
  const snapshots = [], client = createPresence({ onVisitors: value => snapshots.push(value) });
  t.after(() => { client.destroy(); globalThis.window = previous.window; globalThis.fetch = previous.fetch; });
  await tick();
  for (const seat of FURNITURE_SEATS) {
    assert.equal(await client.claimSeat(seat.id), true, seat.id);
    assert.equal(snapshots.at(-1).seats[seat.id], client.id, seat.id);
    await client.releaseSeat();
    assert.equal(snapshots.at(-1).seats[seat.id], undefined, seat.id);
  }
  for (const seat of SOCIAL_SEATS.filter(value => value.occupiedBy)) assert.equal(await client.claimSeat(seat.id), false, seat.id);
});
