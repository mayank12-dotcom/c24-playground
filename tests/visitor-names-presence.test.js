import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresence } from '../src/presence.js';
import { createMemoryWorld, createRedisWorld, validateCommand } from '../api/world.js';

const position = { x: 2, z: -3, rotation: 0, hair: 5 };
const command = (suffix, action = 'join', state = {}, extra = {}) => validateCommand({
  id: `visitor-00000000-${suffix}`, token: suffix.repeat(64).slice(0, 64),
  action, state: { ...position, ...state }, ...extra,
});

test('two independent named browser clients retain names while moving, sitting and leaving a chair', async t => {
  const previous = { window: globalThis.window, fetch: globalThis.fetch, now: Date.now };
  const ticks = [], requests = [], received = [[], []];
  let time = 1000;
  Date.now = () => time;
  globalThis.window = {
    setInterval(callback) { ticks.push(callback); return 0; },
    addEventListener() {}, removeEventListener() {},
  };
  const world = createMemoryWorld({ now: () => time });
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);
    return { ok: true, json: async () => world.dispatch(validateCommand(body)) };
  };
  const clients = ['  Asha   Patel  ', 'Noah'].map((name, index) => createPresence({
    name, onVisitors: snapshot => received[index].push(snapshot),
  }));
  t.after(() => {
    for (const client of clients) client.destroy();
    globalThis.window = previous.window; globalThis.fetch = previous.fetch; Date.now = previous.now;
  });

  await ticks[0](); await ticks[1]();
  assert.notEqual(clients[0].id, clients[1].id, 'each browser owns a separate avatar');
  assert.deepEqual(received[1].at(-1).visitors.map(value => value.name), ['Asha Patel', 'Noah']);
  clients[0].update({ ...position, x: 7, name: undefined });
  time += 1000; await ticks[0](); await ticks[1]();
  const other = received[1].at(-1).visitors.find(value => value.id === clients[0].id);
  assert.equal(other.x, 7);
  assert.equal(other.name, 'Asha Patel', 'movement state cannot discard the profile name');

  assert.equal(await clients[0].claimSeat('product-designer'), true);
  time += 1000; await ticks[1]();
  const seated = received[1].at(-1).visitors.find(value => value.id === clients[0].id);
  assert.equal(seated.name, 'Asha Patel');
  assert.equal(seated.seatedJobId, 'product-designer');
  await clients[0].releaseSeat();
  const released = (await world.dispatch()).visitors.find(value => value.id === clients[0].id);
  assert.equal(released.name, 'Asha Patel');
  assert.equal(released.seatedJobId, null);

  assert.ok(['join', 'move', 'claim', 'release'].every(action => requests.some(value => value.action === action)));
  for (const value of requests) assert.equal(value.state.name, value.id === clients[0].id ? 'Asha Patel' : 'Noah');
  for (const snapshots of received) for (const snapshot of snapshots) {
    assert.ok(snapshot.visitors.every(visitor => visitor.token === undefined));
    for (const request of requests) assert.equal(JSON.stringify(snapshot).includes(request.token), false);
  }
});

test('API normalizes bounded multilingual names and treats markup as plain text', async () => {
  assert.equal(command('a', 'join', { name: '  Asha   Patel  ' }).state.name, 'Asha Patel');
  assert.equal(command('a', 'join', { name: '\u0000\u0007 Mayank \u202E' }).state.name, 'Mayank');
  const unicode = command('a', 'join', { name: '😀'.repeat(40) }).state.name;
  assert.equal([...unicode].length, 32);
  assert.equal(unicode, '😀'.repeat(32), 'Unicode characters are not split into invalid surrogates');
  for (const name of ['', '  ', null, 42, {}, ['Name']]) assert.equal(command('a', 'join', { name }).state.name, 'Visitor');
  const markup = '<img src=x onerror=alert(1)>';
  const world = createMemoryWorld();
  const snapshot = await world.dispatch(command('a', 'join', { name: markup }));
  assert.equal(snapshot.visitors[0].name, markup, 'display code must render a name with textContent');
  assert.equal(snapshot.visitors[0].token, undefined);
});

test('old clients use Visitor and omitted name fields never erase an existing chosen name', async () => {
  const world = createMemoryWorld();
  const first = await world.dispatch(command('a'));
  assert.equal(first.visitors[0].name, 'Visitor');
  assert.equal(Object.hasOwn(command('a').state, 'name'), false);
  await world.dispatch(command('a', 'move', { name: 'Asha' }));
  for (const [action, extra] of [['move', {}], ['claim', { jobId: 'product-designer' }], ['release', {}]]) {
    const snapshot = await world.dispatch(command('a', action, {}, extra));
    assert.equal(snapshot.visitors[0].name, 'Asha', action);
    assert.equal(snapshot.visitors[0].token, undefined);
  }
});

test('Redis atomic commands carry a sanitized optional name and return only public fields', async () => {
  const requests = [];
  const world = createRedisWorld({
    url: 'https://redis.example/', token: 'fixture-server-only', now: () => 1000,
    fetcher: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ result: JSON.stringify({
        visitors: [{ id: 'visitor-00000000-a', name: '  Asha   Patel ', ...position, token: 'private-client-credential', privateField: true }],
        seats: {}, serverTime: 1000, status: 'shared',
      }) }) };
    },
  });
  // Sanitize even when an internal caller bypasses validateCommand.
  const result = await world.dispatch({ ...command('a'), state: { ...position, name: ` Asha\u0000 ${'😀'.repeat(40)}` } });
  const payload = JSON.parse(requests[0][9]);
  assert.equal([...payload.name].length, 32);
  assert.equal(payload.name.includes('\u0000'), false);
  assert.equal(result.visitors[0].name, 'Asha Patel');
  assert.equal(result.visitors[0].token, undefined);
  assert.equal(result.visitors[0].privateField, undefined);
  assert.equal(JSON.stringify(result).includes('private-client-credential'), false);
  assert.match(requests[0][1], /name='Visitor'/, 'new records have a compatible fallback');
  assert.match(requests[0][1], /if state\.name ~= nil then visitor\.name=state\.name end/, 'omitted names do not overwrite Redis records');
  assert.match(requests[0][1], /visitor\.name=visitor\.name or 'Visitor'/, 'existing old records get a public name');
  assert.match(requests[0][1], /visitor\.token=nil/, 'private tokens stay out of Lua snapshots');
  await world.dispatch(command('a', 'move'));
  assert.equal(Object.hasOwn(JSON.parse(requests[1][9]), 'name'), false);
});
