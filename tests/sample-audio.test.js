import assert from 'node:assert/strict';
import test from 'node:test';
import { createSampleAudio } from '../src/sample-audio.js';

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(callback); this.listeners.set(type, listeners);
  }
  removeEventListener(type, callback) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== callback));
  }
  fire(type, properties = {}) {
    for (const callback of [...(this.listeners.get(type) || [])]) callback({ type, target: this, isTrusted: true, ...properties });
  }
  contains(target) { return target === this || target?.parentElement === this; }
}

const flush = async () => { for (let count = 0; count < 20; count++) await Promise.resolve(); };
function deferred() {
  let resolve;
  const promise = new Promise(finish => { resolve = finish; });
  return { promise, resolve };
}

function setup({ decodeWait, ...options } = {}) {
  const document = Object.assign(new Target(), { hidden: false, visibilityState: 'visible' });
  const window = new Target(), button = new Target(), mediaQuery = Object.assign(new Target(), { matches: true });
  const contexts = [], requests = [];
  const audioContextFactory = () => {
    const context = {
      state: 'suspended', destination: {}, currentTime: 3, nodes: [], gains: [], resumeCalls: 0, closeCalls: 0,
      resume() { this.resumeCalls++; this.state = 'running'; return Promise.resolve(); },
      suspend() { this.state = 'suspended'; return Promise.resolve(); },
      close() { this.closeCalls++; this.state = 'closed'; return Promise.resolve(); },
      decodeAudioData() {
        const buffer = { duration: .2 };
        return decodeWait ? decodeWait.promise.then(() => buffer) : Promise.resolve(buffer);
      },
      createGain() {
        const parameter = { value: 1, automation: [],
          cancelAndHoldAtTime(time) { this.automation.push(['hold', time]); },
          cancelScheduledValues(time) { this.automation.push(['cancel', time]); },
          setValueAtTime(value, time) { this.value = value; this.automation.push(['value', value, time]); },
          setTargetAtTime(value, time, constant) { this.automation.push(['target', value, time, constant]); },
        };
        const gain = { gain: parameter, connect() {}, disconnect() {} };
        this.gains.push(gain); return gain;
      },
      createBufferSource() {
        const node = {
          playbackRate: { value: 1 }, starts: [], stopCalls: 0, disconnectCalls: 0,
          connect(destination) { this.destination = destination; },
          start(...args) { this.starts.push(args); },
          stop() { this.stopCalls++; },
          disconnect() { this.disconnectCalls++; },
          end() { this.onended?.(); },
        };
        this.nodes.push(node); return node;
      },
    };
    contexts.push(context); return context;
  };
  const fetch = async url => {
    requests.push(url);
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) };
  };
  const player = createSampleAudio({ document, window, button, mediaQuery, fetch, audioContextFactory,
    sources: ['/audio/dismiss.wav'], volume: .4, ...options,
  });
  const gesture = properties => document.fire('pointerdown', properties);
  return { player, document, window, button, mediaQuery, contexts, requests, gesture };
}

test('a dismiss sample stays unloaded before a trusted gesture and never plays just from unlocking', async () => {
  const f = setup();
  assert.equal(f.player.play(), false);
  f.gesture({ isTrusted: false }); await flush();
  assert.equal(f.contexts.length, 0);
  assert.equal(f.requests.length, 0);
  f.gesture();
  assert.equal(f.contexts[0].resumeCalls, 1, 'resume executes inside the user activation');
  await flush();
  assert.deepEqual(f.requests, ['/audio/dismiss.wav']);
  assert.equal(f.player.getState().ready, true);
  assert.equal(f.contexts[0].nodes.length, 0);
  f.player.dispose();
});

test('the same decoded whoosh is reused as unpitched one-shots at the requested volume', async () => {
  const f = setup(); f.gesture(); await flush();
  for (let count = 0; count < 3; count++) assert.equal(f.player.play(), true);
  const context = f.contexts[0];
  assert.equal(f.requests.length, 1);
  assert.ok(context.nodes.every(node => node.buffer === context.nodes[0].buffer));
  assert.ok(context.nodes.every(node => node.playbackRate.value === 1));
  assert.ok(context.nodes.every(node => node.loop !== true));
  assert.ok(context.nodes.every(node => node.starts.length === 1 && node.starts[0][0] === context.currentTime));
  assert.equal(context.gains[0].gain.value, .4);
  f.player.dispose();
});

test('maxVoices one replaces the old whoosh instead of stacking repeated dismissal sounds', async () => {
  const f = setup({ maxVoices: 1 }); f.gesture(); await flush();
  f.player.play(); f.player.play();
  const [first, second] = f.contexts[0].nodes;
  assert.equal(first.stopCalls, 1);
  assert.equal(first.disconnectCalls, 1);
  assert.equal(second.stopCalls, 0);
  assert.equal(f.player.getState().activeSources, 1);
  first.end();
  assert.equal(f.player.getState().activeSources, 1, 'the replaced source cannot remove its replacement');
  second.end();
  assert.equal(f.player.getState().activeSources, 0);
  f.player.dispose();
});

test('custom playback rates cycle only through valid positive finite options', async () => {
  const f = setup({ playbackRates: [NaN, .9, 0, 1.1, Infinity, -1], maxVoices: 8 });
  f.gesture(); await flush();
  for (let count = 0; count < 4; count++) f.player.play();
  assert.deepEqual(f.contexts[0].nodes.map(node => node.playbackRate.value), [.9, 1.1, .9, 1.1]);
  f.player.dispose();
});

test('an empty or invalid rate list uses natural pitch and invalid voice limits remain bounded', async () => {
  for (const options of [
    { playbackRates: [], maxVoices: 0 },
    { playbackRates: [0, NaN, -1], maxVoices: 1.9 },
    { playbackRates: null, maxVoices: Infinity },
  ]) {
    const f = setup(options); f.gesture(); await flush();
    for (let count = 0; count < 6; count++) assert.equal(f.player.play(), true);
    assert.ok(f.contexts[0].nodes.every(node => node.playbackRate.value === 1));
    assert.equal(f.player.getState().activeSources, options.maxVoices === Infinity ? 4 : 1);
    f.player.dispose();
  }
});

test('dismissals before readiness are discarded and sample completion cannot replay them later', async () => {
  const decodeWait = deferred(), f = setup({ decodeWait });
  f.gesture(); await flush();
  assert.equal(f.player.getState().loading, true);
  for (let count = 0; count < 4; count++) assert.equal(f.player.play(), false);
  decodeWait.resolve(); await flush();
  assert.equal(f.contexts[0].nodes.length, 0);
  assert.equal(f.player.play(), true);
  assert.equal(f.contexts[0].nodes.length, 1);
  f.player.dispose();
});

test('shared mute, hidden pages, and narrow viewports suppress UI effects without queuing them', async () => {
  const f = setup(); f.gesture(); await flush(); f.player.play();
  f.player.setEnabled(false);
  assert.equal(f.player.getState().activeSources, 0);
  assert.equal(f.player.play(), false);
  f.player.setEnabled(true); f.gesture(); await flush();
  f.document.hidden = true; f.document.visibilityState = 'hidden'; f.document.fire('visibilitychange');
  assert.equal(f.player.play(), false);
  f.document.hidden = false; f.document.visibilityState = 'visible'; f.document.fire('visibilitychange');
  f.mediaQuery.matches = false; f.mediaQuery.fire('change', { matches: false });
  assert.equal(f.player.play(), false);
  f.mediaQuery.matches = true; f.mediaQuery.fire('change', { matches: true });
  f.gesture(); await flush();
  assert.equal(f.contexts[0].nodes.length, 1, 'restoring sound cannot invent a dismissal');
  assert.equal(f.player.play(), true);
  f.player.dispose();
});

test('the shared Sound button remains excluded from capture, with explicit unmute supported', async () => {
  const f = setup();
  f.gesture({ target: { parentElement: f.button } });
  f.player.setEnabled(false); await flush();
  assert.equal(f.contexts.length, 0);
  f.player.setEnabled(true);
  assert.equal(f.player.unlock({ type: 'click', target: f.button, isTrusted: true }), true);
  await flush();
  assert.equal(f.player.play(), true);
  f.player.dispose();
});

test('disposing during whoosh decoding ignores completion and cannot create playback nodes', async () => {
  const decodeWait = deferred(), f = setup({ decodeWait });
  f.gesture(); await flush(); f.player.dispose(); decodeWait.resolve(); await flush();
  assert.equal(f.player.getState().disposed, true);
  assert.equal(f.player.getState().ready, false);
  assert.equal(f.player.play(), false);
  assert.equal(f.contexts[0].nodes.length, 0);
  assert.equal(f.contexts[0].closeCalls, 1);
});

test('random sample selection uses all supplied variations without repeating adjacent impacts', async () => {
  const randomValues = [0, .22, .51, .79, .99, .42, .12];
  let index = 0;
  const f = setup({ sources: ['/a.wav', '/b.wav', '/c.wav', '/d.wav'], selection: 'random',
    random: () => randomValues[index++ % randomValues.length], maxVoices: 4 });
  f.gesture(); await flush();
  for (let count = 0; count < 40; count++) assert.equal(f.player.play(), true);
  const samples = f.contexts[0].nodes.map(node => node.buffer);
  assert.equal(new Set(samples).size, 4, 'each sound remains available to the selector');
  for (let count = 1; count < samples.length; count++) assert.notEqual(samples[count], samples[count - 1]);
  assert.equal(f.requests.length, 4, 'variation reuses decoded audio');
  f.player.dispose();
});

test('a constant random source cannot cause immediate repeats or an unbounded resampling loop', async () => {
  for (const random of [() => 0, () => .999999]) {
    const f = setup({ sources: ['/a.wav', '/b.wav', '/c.wav'], selection: 'random', random });
    f.gesture(); await flush();
    for (let count = 0; count < 12; count++) assert.equal(f.player.play(), true);
    const nodes = f.contexts[0].nodes;
    for (let count = 1; count < nodes.length; count++) assert.notEqual(nodes[count].buffer, nodes[count - 1].buffer);
    f.player.dispose();
  }
  const one = setup({ selection: 'random', random: () => 0 });
  one.gesture(); await flush();
  assert.equal(one.player.play(), true); assert.equal(one.player.play(), true);
  one.player.dispose();
});

test('the default selection retains ordered cycling for existing multi-sample effects', async () => {
  const f = setup({ sources: ['/a.wav', '/b.wav', '/c.wav'] });
  f.gesture(); await flush();
  for (let count = 0; count < 6; count++) f.player.play();
  const buffers = f.contexts[0].nodes.map(node => node.buffer);
  assert.equal(new Set(buffers.slice(0, 3)).size, 3);
  assert.deepEqual(buffers.slice(0, 3), buffers.slice(3));
  f.player.dispose();
});

test('volume changed before unlock becomes the initial gain without constructing audio early', async () => {
  const f = setup();
  f.player.setVolume(.07, { timeConstant: .08 });
  assert.equal(f.contexts.length, 0);
  f.gesture(); await flush();
  assert.equal(f.contexts[0].gains[0].gain.value, .07, 'the first sample cannot burst at the old full volume');
  f.player.dispose();
});

test('moving listener volume uses safe AudioParam ramps on the shared gain, including active tails', async () => {
  const f = setup(); f.gesture(); await flush(); f.player.play();
  const context = f.contexts[0], parameter = context.gains[0].gain, node = context.nodes[0];
  f.player.setVolume(.12, { timeConstant: .08 });
  assert.ok(parameter.automation.some(event => event[0] === 'target' && event[1] === .12 && event[2] === 3 && event[3] === .08));
  assert.equal(parameter.value, .4, 'the current value is not replaced abruptly when ramp support exists');
  assert.equal(node.stopCalls, 0, 'a distance change changes an existing tail instead of restarting it');
  assert.equal(context.gains.length, 1);
  f.player.setVolume(-5, { timeConstant: .08 });
  f.player.setVolume(5, { timeConstant: .08 });
  const targets = parameter.automation.filter(event => event[0] === 'target').map(event => event[1]);
  assert.ok(targets.includes(0)); assert.ok(targets.includes(1));
  assert.ok(targets.every(value => Number.isFinite(value) && value >= 0 && value <= 1));
  f.player.dispose();
});

test('invalid and redundant level updates preserve the last gain while unsafe ramp times are normalized', async () => {
  const f = setup(); f.gesture(); await flush();
  const parameter = f.contexts[0].gains[0].gain;
  for (const value of [NaN, Infinity, undefined, .4]) f.player.setVolume(value);
  assert.equal(f.player.getState().volume, .4);
  assert.equal(parameter.automation.length, 0, 'a static listener does not repeatedly reset the gain ramp');
  f.player.setVolume(.2, { timeConstant: NaN });
  f.player.setVolume(.1, { timeConstant: .000001 });
  const targets = parameter.automation.filter(event => event[0] === 'target');
  assert.equal(targets[0][3], .08);
  assert.ok(targets[1][3] >= .001);
  f.player.dispose();
  const count = parameter.automation.length;
  f.player.setVolume(.9);
  assert.equal(parameter.automation.length, count);
});

test('the ramp fallback holds the current audible level when cancelAndHold is unsupported', async () => {
  const f = setup(); f.gesture(); await flush();
  const parameter = f.contexts[0].gains[0].gain;
  parameter.cancelAndHoldAtTime = undefined;
  parameter.value = .17;
  f.player.setVolume(.06, { timeConstant: .08 });
  assert.ok(parameter.automation.some(event => event[0] === 'value' && event[1] === .17));
  assert.ok(parameter.automation.some(event => event[0] === 'target' && event[1] === .06));
  assert.equal(parameter.value, .17, 'fallback automation begins from the current level rather than an old target');
  parameter.setTargetAtTime = undefined;
  assert.doesNotThrow(() => f.player.setVolume(.03));
  assert.equal(parameter.value, .03);
  f.player.dispose();
});

test('an invalid or failing injected random source cannot interrupt current sound playback', async () => {
  for (const random of [() => NaN, () => Infinity, () => { throw new Error('Unavailable randomness'); }]) {
    const f = setup({ sources: ['/a.wav', '/b.wav'], selection: 'random', random });
    f.gesture(); await flush();
    assert.equal(f.player.play(), true); assert.equal(f.player.play(), true);
    assert.notEqual(f.contexts[0].nodes[0].buffer, f.contexts[0].nodes[1].buffer);
    f.player.dispose();
  }
});
