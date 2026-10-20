import assert from 'node:assert/strict';
import test from 'node:test';
import { createFootstepAudio } from '../src/footstep-audio.js';

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener); this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== listener));
  }
  fire(type, values = {}) {
    const event = { type, target: this, isTrusted: true, ...values };
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
    return event;
  }
  contains(target) { return target === this || target?.parentElement === this; }
}

const flush = async () => { for (let count = 0; count < 20; count++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup({ enabled = true, desktop = true, hidden = false, volume,
  resumeResults = [], fetchResults = [], decodeResults = [], contextFailures = 0, unavailable = false } = {}) {
  const document = Object.assign(new Target(), { visibilityState: hidden ? 'hidden' : 'visible', hidden });
  const window = new Target(), button = new Target(), mediaQuery = Object.assign(new Target(), { matches: desktop });
  const contexts = [], fetched = [], sources = ['/audio/a.wav', '/audio/b.wav', '/audio/c.wav', '/audio/d.wav'];
  let factoryCalls = 0;
  function audioContextFactory() {
    factoryCalls++;
    if (unavailable) return null;
    if (contextFailures-- > 0) throw new Error('Audio device is unavailable');
    const context = {
      state: 'suspended', currentTime: 0, destination: {},
      resumeCalls: 0, suspendCalls: 0, closeCalls: 0, decoded: [], nodes: [], gains: [],
      resume() {
        this.resumeCalls++;
        const result = resumeResults.shift();
        if (result instanceof Error) return Promise.reject(result);
        if (result?.promise) return result.promise.then(() => { this.state = 'running'; });
        this.state = 'running'; return Promise.resolve();
      },
      suspend() { this.suspendCalls++; this.state = 'suspended'; return Promise.resolve(); },
      close() { this.closeCalls++; this.state = 'closed'; return Promise.resolve(); },
      decodeAudioData(bytes) {
        this.decoded.push(bytes);
        const result = decodeResults.shift();
        if (result instanceof Error) return Promise.reject(result);
        const buffer = { sample: new Uint8Array(bytes)[0], duration: .12 };
        return result?.promise ? result.promise.then(() => buffer) : Promise.resolve(buffer);
      },
      createGain() {
        const parameter = { value: 1,
          setValueAtTime(value) { this.value = value; },
          linearRampToValueAtTime(value) { this.value = value; },
          setTargetAtTime(value) { this.value = value; },
        };
        const gain = { gain: parameter, connected: null, disconnectCalls: 0,
          connect(destination) { this.connected = destination; }, disconnect() { this.disconnectCalls++; },
        };
        this.gains.push(gain); return gain;
      },
      createBufferSource() {
        const node = Object.assign(new Target(), {
          buffer: null, playbackRate: { value: 1 }, starts: [], stopCalls: 0, disconnectCalls: 0,
          connect(destination) { this.connected = destination; },
          start(...args) { this.starts.push(args); },
          stop() { this.stopCalls++; this.end(); },
          disconnect() { this.disconnectCalls++; },
          end() { if (this.ended) return; this.ended = true; this.onended?.(); this.fire('ended'); },
        });
        this.nodes.push(node); return node;
      },
    };
    contexts.push(context); return context;
  }
  function fetch(url, options) {
    fetched.push({ url, options });
    const result = fetchResults.shift();
    if (result instanceof Error) return Promise.reject(result);
    const response = { ok: true, arrayBuffer: async () => Uint8Array.of(sources.indexOf(url) + 1).buffer };
    return result?.promise ? result.promise.then(() => response) : Promise.resolve(response);
  }
  const controller = createFootstepAudio({ button, document, window, mediaQuery, enabled, sources,
    audioContextFactory, fetch, ...(volume === undefined ? {} : { volume }),
  });
  function gesture(type = 'pointerdown', values = {}) { document.fire(type, { key: 'w', target: document, ...values }); }
  function visibility(visible) {
    document.hidden = !visible; document.visibilityState = visible ? 'visible' : 'hidden';
    document.fire('visibilitychange');
  }
  function viewport(matches) { mediaQuery.matches = matches; mediaQuery.fire('change', { matches }); }
  const step = (foot = 'left') => controller.playStep({ foot, strength: 1 });
  return { controller, document, window, button, mediaQuery, contexts, fetched, sources, gesture, visibility, viewport, step,
    get factoryCalls() { return factoryCalls; },
  };
}

test('footsteps create no audio context or sample requests until an eligible real gesture', async () => {
  const f = setup();
  assert.equal(f.step(), false);
  assert.equal(f.controller.getState().unlocked, false);
  assert.equal(f.controller.getState().ready, false);
  f.gesture('pointerdown', { isTrusted: false });
  f.gesture('keydown', { isTrusted: false });
  f.controller.unlock({ type: 'pointerdown', isTrusted: false });
  await flush();
  assert.equal(f.factoryCalls, 0);
  assert.equal(f.fetched.length, 0);
  f.controller.dispose();
});

test('a gesture creates and resumes the audio context synchronously, then loads reusable samples', async () => {
  const f = setup();
  f.gesture();
  assert.equal(f.factoryCalls, 1, 'construction happens inside the browser gesture');
  assert.equal(f.contexts[0].resumeCalls, 1, 'resume also runs before returning from the gesture');
  await flush();
  assert.deepEqual(f.fetched.map(item => item.url).sort(), [...f.sources].sort());
  assert.equal(f.contexts[0].decoded.length, 4);
  assert.equal(f.controller.getState().ready, true);
  assert.equal(f.controller.getState().unlocked, true);
  assert.equal(f.controller.getState().activeSources, 0, 'unlocking alone never emits a footfall');
  f.gesture(); f.gesture('keydown'); await flush();
  assert.equal(f.factoryCalls, 1);
  assert.equal(f.fetched.length, 4);
  assert.equal(f.contexts[0].decoded.length, 4);
  f.controller.dispose();
});

test('each current contact starts one short sample immediately, alternating the supplied variations', async () => {
  const f = setup(); f.gesture(); await flush();
  for (let index = 0; index < 4; index++) {
    assert.equal(f.step(index % 2 ? 'right' : 'left'), true);
    assert.equal(f.contexts[0].nodes.length, index + 1);
    assert.equal(f.contexts[0].nodes[index].starts.length, 1);
    assert.notEqual(f.contexts[0].nodes[index].loop, true, 'footsteps are one-shots');
  }
  assert.deepEqual(f.contexts[0].nodes.map(node => node.buffer.sample), [1, 2, 3, 4]);
  assert.ok(new Set(f.contexts[0].nodes.map(node => node.playbackRate.value)).size > 1);
  assert.equal(f.contexts[0].gains[0].gain.value, .22);
  assert.equal(f.fetched.length, 4);
  f.controller.dispose();
});

test('contacts that arrive before loading finishes are discarded without a delayed burst', async () => {
  const first = deferred(), second = deferred(), third = deferred(), fourth = deferred();
  const f = setup({ fetchResults: [first, second, third, fourth] });
  f.gesture(); await flush();
  assert.equal(f.controller.getState().loading, true);
  for (let index = 0; index < 12; index++) assert.equal(f.step(), false);
  first.resolve(); second.resolve(); third.resolve(); fourth.resolve(); await flush();
  assert.equal(f.controller.getState().ready, true);
  assert.equal(f.contexts[0].nodes.length, 0, 'past contacts are never replayed');
  assert.equal(f.step(), true);
  assert.equal(f.contexts[0].nodes.length, 1);
  f.controller.dispose();
});

test('overlap stays bounded to four sources and ended samples release their audio nodes', async () => {
  const f = setup(); f.gesture(); await flush();
  for (let index = 0; index < 8; index++) assert.equal(f.step(), true);
  assert.ok(f.controller.getState().activeSources <= 4);
  const context = f.contexts[0];
  assert.ok(context.nodes.slice(0, 4).every(node => node.stopCalls > 0));
  for (const node of context.nodes) node.end();
  assert.equal(f.controller.getState().activeSources, 0);
  assert.ok(context.nodes.every(node => node.disconnectCalls > 0));
  f.controller.dispose();
});

test('muting stops active footsteps and suppresses new contacts until enabled again', async () => {
  const f = setup(); f.gesture(); await flush();
  f.step(); f.step('right');
  f.controller.setEnabled(false);
  assert.equal(f.controller.getState().enabled, false);
  assert.equal(f.controller.getState().activeSources, 0);
  assert.ok(f.contexts[0].nodes.every(node => node.stopCalls > 0));
  assert.equal(f.step(), false);
  f.controller.setEnabled(true); f.gesture(); await flush();
  assert.equal(f.step(), true);
  assert.equal(f.fetched.length, 4, 'unmuting reuses decoded samples');
  f.controller.dispose();
});

test('an initially muted sound controller stays lazy through ordinary gestures', async () => {
  const f = setup({ enabled: false });
  f.gesture(); f.gesture('keydown'); await flush();
  assert.equal(f.factoryCalls, 0);
  assert.equal(f.fetched.length, 0);
  assert.equal(f.step(), false);
  f.controller.setEnabled(true);
  f.controller.unlock({ type: 'click', target: f.button, isTrusted: true }); await flush();
  assert.equal(f.step(), true);
  f.controller.dispose();
});

test('the shared Sound control is excluded from capture so its first mute never initializes footsteps', async () => {
  const f = setup();
  const icon = { parentElement: f.button };
  f.gesture('pointerdown', { target: icon });
  f.gesture('keydown', { key: 'Enter', target: f.button });
  f.controller.setEnabled(false); await flush();
  assert.equal(f.factoryCalls, 0);
  assert.equal(f.fetched.length, 0);
  f.controller.setEnabled(true);
  assert.equal(f.controller.unlock({ type: 'click', target: icon, isTrusted: true }), true);
  await flush();
  assert.equal(f.step(), true, 'explicit unmute can unlock within the same Sound-button activation');
  f.controller.dispose();
});

test('modifier keys, repeated input, text entry, and secondary mouse clicks do not unlock footsteps', async () => {
  const f = setup();
  for (const values of [{ key: 'Shift' }, { key: 'Escape' }, { key: 'Tab' }, { key: 'w', repeat: true },
    { key: 'r', ctrlKey: true }, { key: 'a', altKey: true }, { key: 'a', metaKey: true },
    { target: { tagName: 'INPUT' } }, { target: { tagName: 'TEXTAREA' } }, { target: { isContentEditable: true } }]) f.gesture('keydown', values);
  f.gesture('pointerdown', { button: 2 }); await flush();
  assert.equal(f.factoryCalls, 0);
  f.gesture('keydown', { key: 'ArrowLeft' }); await flush();
  assert.equal(f.step(), true);
  f.controller.dispose();
});

test('hidden tabs stop active contacts and never replay footsteps missed while hidden', async () => {
  const f = setup(); f.gesture(); await flush(); f.step();
  f.visibility(false);
  assert.equal(f.controller.getState().activeSources, 0);
  assert.equal(f.step(), false);
  const count = f.contexts[0].nodes.length;
  f.visibility(true); f.gesture(); await flush();
  assert.equal(f.contexts[0].nodes.length, count, 'visibility changes do not invent contacts');
  assert.equal(f.step(), true);
  f.controller.dispose();
});

test('the 1280-pixel desktop boundary suspends footsteps without losing decoded samples', async () => {
  const f = setup(); f.gesture(); await flush(); f.step();
  f.viewport(false);
  assert.equal(f.step(), false);
  assert.equal(f.controller.getState().activeSources, 0);
  f.viewport(true); f.gesture(); await flush();
  assert.equal(f.step(), true);
  assert.equal(f.fetched.length, 4);
  f.controller.dispose();
});

test('pagehide blocks even late gestures until pageshow permits fresh contacts', async () => {
  const f = setup(); f.gesture(); await flush(); f.step();
  f.window.fire('pagehide'); f.gesture(); await flush();
  assert.equal(f.step(), false);
  assert.equal(f.controller.getState().activeSources, 0);
  const count = f.contexts[0].nodes.length;
  f.window.fire('pageshow'); f.gesture(); await flush();
  assert.equal(f.contexts[0].nodes.length, count);
  assert.equal(f.step(), true);
  f.controller.dispose();
});

test('initially hidden or small-screen pages do not request samples from stray gestures', async () => {
  for (const options of [{ hidden: true }, { desktop: false }]) {
    const f = setup(options);
    f.gesture(); f.gesture('keydown'); await flush();
    assert.equal(f.factoryCalls, 0);
    assert.equal(f.fetched.length, 0);
    assert.equal(f.step(), false);
    f.controller.dispose();
  }
});

test('a refused context resume is handled and recovers only from a later real gesture', async () => {
  const f = setup({ resumeResults: [new Error('NotAllowedError')] });
  f.gesture(); await flush();
  assert.equal(f.step(), false);
  assert.equal(f.controller.getState().waitingForGesture, true);
  f.controller.unlock({ type: 'pointerdown', isTrusted: false }); await flush();
  assert.equal(f.contexts[0].resumeCalls, 1);
  f.gesture(); await flush();
  assert.equal(f.factoryCalls, 1);
  assert.equal(f.step(), true);
  assert.equal(f.controller.getState().waitingForGesture, false);
  f.controller.dispose();
});

test('a context construction failure stays silent and a subsequent gesture can recover', async () => {
  const f = setup({ contextFailures: 1 });
  assert.doesNotThrow(() => f.gesture()); await flush();
  assert.equal(f.step(), false);
  f.gesture(); await flush();
  assert.equal(f.step(), true);
  f.controller.dispose();
});

test('unsupported Web Audio leaves navigation contacts harmless and never fetches samples', async () => {
  const f = setup({ unavailable: true });
  assert.doesNotThrow(() => f.gesture());
  assert.doesNotThrow(() => f.gesture('keydown'));
  await flush();
  assert.equal(f.fetched.length, 0);
  assert.equal(f.controller.getState().ready, false);
  assert.equal(f.step(), false);
  f.controller.dispose();
});

test('network failure does not queue contacts and a later gesture can retry sample loading', async () => {
  const f = setup({ fetchResults: Array.from({ length: 4 }, () => new Error('Offline')) });
  f.gesture(); await flush();
  assert.equal(f.controller.getState().ready, false);
  assert.equal(f.step(), false);
  f.gesture(); await flush();
  assert.equal(f.controller.getState().ready, true);
  assert.equal(f.contexts[0].nodes.length, 0);
  assert.equal(f.step(), true);
  f.controller.dispose();
});

test('undecodable audio samples fail quietly and become playable after a successful retry', async () => {
  const f = setup({ decodeResults: Array.from({ length: 4 }, () => new Error('Unsupported audio')) });
  f.gesture(); await flush();
  assert.equal(f.controller.getState().ready, false);
  assert.equal(f.step(), false);
  f.gesture(); await flush();
  assert.equal(f.controller.getState().ready, true);
  assert.equal(f.step(), true);
  f.controller.dispose();
});

test('a late resume grant cannot play contacts or unlock a muted or disposed controller', async () => {
  for (const stop of [f => f.controller.setEnabled(false), f => f.controller.dispose(), f => f.visibility(false), f => f.viewport(false)]) {
    const pending = deferred(), f = setup({ resumeResults: [pending] });
    f.gesture(); stop(f); pending.resolve(); await flush();
    assert.equal(f.step(), false);
    assert.equal(f.controller.getState().activeSources, 0);
    assert.equal(f.contexts[0].nodes.length, 0);
    f.controller.dispose();
  }
});

test('late decoded samples cannot emit stale footsteps after disposal', async () => {
  const decodes = Array.from({ length: 4 }, deferred), f = setup({ decodeResults: decodes });
  f.gesture(); await flush();
  assert.equal(f.controller.getState().loading, true);
  f.controller.dispose();
  for (const pending of decodes) pending.resolve(); await flush();
  assert.equal(f.controller.getState().disposed, true);
  assert.equal(f.controller.getState().activeSources, 0);
  assert.equal(f.step(), false);
  assert.equal(f.contexts[0].nodes.length, 0);
  assert.ok(f.contexts[0].closeCalls > 0);
});

test('a device failure while starting one sample releases its node and permits the next contact', async () => {
  const f = setup(); f.gesture(); await flush();
  const context = f.contexts[0], createSource = context.createBufferSource;
  context.createBufferSource = function () {
    const node = createSource.call(this);
    node.start = () => { throw new Error('Device disconnected'); };
    return node;
  };
  assert.equal(f.step(), false);
  assert.equal(f.controller.getState().activeSources, 0);
  assert.ok(context.nodes[0].disconnectCalls > 0);
  context.createBufferSource = createSource;
  assert.equal(f.step(), true);
  f.controller.dispose();
});

test('dispose stops voices, removes handlers, closes its context, and ignores future contacts', async () => {
  const f = setup(); f.gesture(); await flush(); f.step(); f.step('right');
  f.controller.dispose(); f.controller.dispose();
  const context = f.contexts[0], count = context.nodes.length, fetchCount = f.fetched.length;
  f.gesture(); f.controller.unlock({ type: 'pointerdown', isTrusted: true });
  f.controller.setEnabled(false); f.controller.setEnabled(true);
  f.visibility(false); f.visibility(true); f.viewport(false); f.viewport(true);
  f.window.fire('pageshow'); await flush();
  assert.equal(f.step(), false);
  assert.equal(f.controller.getState().activeSources, 0);
  assert.equal(context.nodes.length, count);
  assert.equal(f.fetched.length, fetchCount);
  assert.equal(context.closeCalls, 1);
  assert.ok(context.nodes.every(node => node.stopCalls > 0 && node.disconnectCalls > 0));
});
