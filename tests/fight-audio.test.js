import assert from 'node:assert/strict';
import test from 'node:test';
import { createFightAudio, fightDistanceGain } from '../src/fight-audio.js';

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    const list = this.listeners.get(type) || []; list.push(callback); this.listeners.set(type, list);
  }
  removeEventListener(type, callback) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== callback)); }
  fire(type, properties = {}) {
    const event = { type, target: this, isTrusted: true, ...properties };
    for (const callback of [...(this.listeners.get(type) || [])]) callback(event);
  }
}

function setup({ ready = true, enabled = true, ...options } = {}) {
  const document = Object.assign(new Target(), { hidden: false, visibilityState: 'visible' });
  const window = new Target(), mediaQuery = Object.assign(new Target(), { matches: true });
  const calls = [], sources = ['/fight-a.wav', '/fight-b.wav', '/fight-c.wav', '/fight-d.wav'];
  const state = { enabled, unlocked: false, ready, loading: !ready, activeSources: 0,
    disposed: false, waitingForGesture: true, volume: 0 };
  let factoryOptions, pageActive = true;
  window.addEventListener('pagehide', () => { pageActive = false; });
  window.addEventListener('pageshow', () => { pageActive = true; });
  const eligible = () => !state.disposed && state.enabled && !document.hidden && document.visibilityState !== 'hidden' && mediaQuery.matches && pageActive;
  function audioFactory(config) {
    factoryOptions = config; state.enabled = config.enabled; state.volume = config.volume;
    return {
      unlock(event) {
        calls.push(['unlock', event]);
        if (!eligible() || event?.isTrusted !== true) return false;
        state.unlocked = true; state.waitingForGesture = false; return true;
      },
      play() {
        calls.push(['attempt', state.volume]);
        if (!eligible() || !state.unlocked || !state.ready) return false;
        calls.push(['played', state.volume]); state.activeSources++; return true;
      },
      setVolume(value, ramp) { state.volume = value; calls.push(['volume', value, ramp]); },
      setEnabled(value) { state.enabled = Boolean(value); if (!state.enabled) state.activeSources = 0; calls.push(['enabled', state.enabled]); },
      getState: () => ({ ...state }),
      dispose() { calls.push(['dispose']); state.disposed = true; state.activeSources = 0; },
    };
  }
  const controller = createFightAudio({ document, window, mediaQuery, enabled, sources, audioFactory,
    volume: .45, random: () => .5, ...options });
  const unlock = () => controller.unlock({ type: 'pointerdown', isTrusted: true });
  const frame = (distance = 0, impacts = [], extra = {}) => controller.update({
    dt: 1 / 60, listener: { x: distance, z: 0 }, source: { x: 0, z: 0 }, impacts, paused: false, ...extra,
  });
  const played = () => calls.filter(([name]) => name === 'played').length;
  return { controller, document, window, mediaQuery, state, calls, sources, unlock, frame, played,
    get options() { return factoryOptions; } };
}

test('fight distance gain is full nearby, smoothly decreases, and reaches silence at the outer radius', () => {
  assert.equal(fightDistanceGain(0), 1);
  assert.equal(fightDistanceGain(3), 1);
  assert.equal(fightDistanceGain(10), 0);
  assert.equal(fightDistanceGain(100), 0);
  let previous = 1;
  for (let distance = 3; distance <= 10; distance += .025) {
    const gain = fightDistanceGain(distance);
    assert.ok(gain >= 0 && gain <= previous + 1e-12);
    previous = gain;
  }
  assert.ok(fightDistanceGain(6.5) > .1 && fightDistanceGain(6.5) < .9, 'the audible region includes intermediate levels');
  assert.ok(Math.abs(1 - fightDistanceGain(3.001)) < .00001, 'falloff begins without a level discontinuity');
  assert.ok(fightDistanceGain(9.999) < .00001, 'falloff reaches silence gently');
});

test('custom proximity radii work and malformed distances never yield an unsafe gain', () => {
  assert.equal(fightDistanceGain(2, 2, 8), 1);
  assert.equal(fightDistanceGain(8, 2, 8), 0);
  assert.ok(Math.abs(fightDistanceGain(5, 2, 8) - .5) < 1e-12);
  for (const args of [[NaN], [Infinity], [undefined], [5, NaN, Infinity], [5, 8, 2]]) {
    const gain = fightDistanceGain(...args);
    assert.ok(Number.isFinite(gain) && gain >= 0 && gain <= 1);
  }
});

test('fight effects start at zero gain with four random variations and do not play during setup or unlock', () => {
  const f = setup();
  assert.equal(f.options.volume, 0, 'no first sample may inherit full volume before position is known');
  assert.deepEqual(f.options.sources, f.sources);
  assert.equal(f.options.selection, 'random');
  assert.equal(typeof f.options.random, 'function');
  assert.equal(f.played(), 0);
  f.unlock();
  assert.equal(f.played(), 0);
  assert.equal(f.state.volume, 0);
  f.controller.dispose();
});

test('the first spatial frame sets distance gain before a nearby impact is played', () => {
  const f = setup(); f.unlock();
  assert.equal(f.frame(0, [{ id: 'contact-1', type: 'punch' }]), 1);
  const played = f.calls.find(([name]) => name === 'played');
  assert.equal(played[1], .45);
  const gainIndex = f.calls.findIndex(([name, value]) => name === 'volume' && value === .45);
  assert.ok(gainIndex < f.calls.indexOf(played));
  f.controller.dispose();
});

test('moving away ramps active tails and leaves decoded audio enabled instead of toggling it at a boundary', () => {
  const f = setup(); f.unlock(); f.frame(0, [{ id: 1 }]);
  const volumes = [];
  for (const distance of [3, 4, 5, 6, 7, 8, 9, 10, 12]) {
    f.frame(distance); volumes.push(f.state.volume);
    assert.equal(f.state.enabled, true);
    assert.equal(f.state.ready, true);
    assert.equal(f.state.unlocked, true);
  }
  for (let index = 1; index < volumes.length; index++) assert.ok(volumes[index] <= volumes[index - 1]);
  assert.equal(volumes.at(-1), 0);
  assert.equal(f.calls.filter(([name]) => name === 'enabled').length, 0, 'distance is a continuous gain change');
  const updates = f.calls.filter(([name]) => name === 'volume');
  assert.ok(updates.some(([, , ramp]) => ramp?.timeConstant > 0));
  assert.equal(f.played(), 1, 'moving changes an existing tail and never restarts its impact');
  f.controller.dispose();
});

test('proximity uses the source and listener positions in both horizontal axes', () => {
  const f = setup(); f.unlock();
  f.frame(0, [], { listener: { x: 5, z: 6 }, source: { x: 2, z: 2 } });
  assert.equal(f.controller.getState().distance, 5);
  assert.ok(Math.abs(f.state.volume - .45 * fightDistanceGain(5)) < 1e-12);
  f.frame(0, [], { listener: { x: 2, z: 2 }, source: { x: 5, z: 6 } });
  assert.ok(Math.abs(f.state.volume - .45 * fightDistanceGain(5)) < 1e-12);
  f.controller.dispose();
});

test('repeating the same impact across paused clock frames produces one sound', () => {
  const f = setup(); f.unlock();
  const impact = { id: 'cycle-0:punch-1', type: 'punch' };
  assert.equal(f.frame(0, [impact, impact]), 1);
  for (let index = 0; index < 100; index++) assert.equal(f.frame(0, [impact]), 0);
  assert.equal(f.frame(0, [{ id: 'cycle-0:punch-2', type: 'punch' }, { id: 'cycle-0:kick-1', type: 'kick' }]), 2);
  assert.equal(f.played(), 3);
  f.controller.dispose();
});

test('paused impacts are consumed so resuming the encounter cannot replay old contacts', () => {
  const f = setup(); f.unlock();
  assert.equal(f.frame(0, [{ id: 'paused-hit' }], { paused: true }), 0);
  assert.equal(f.frame(0, [{ id: 'paused-hit' }]), 0);
  assert.equal(f.frame(0, [{ id: 'new-hit' }]), 1);
  f.controller.dispose();
});

test('muted impacts do not queue or replay when Sound is reenabled', () => {
  const f = setup({ enabled: false });
  assert.equal(f.frame(0, [{ id: 'muted-hit' }]), 0);
  f.controller.setEnabled(true); f.unlock();
  assert.equal(f.frame(0, [{ id: 'muted-hit' }]), 0);
  assert.equal(f.frame(0, [{ id: 'fresh-hit' }]), 1);
  f.controller.setEnabled(false); f.frame(0, [{ id: 'muted-again' }]);
  f.controller.setEnabled(true); f.unlock();
  assert.equal(f.frame(0, [{ id: 'muted-again' }]), 0);
  f.controller.dispose();
});

test('out-of-range impacts stay silent and entering the crowd permits only new contacts', () => {
  const f = setup(); f.unlock();
  assert.equal(f.frame(11, [{ id: 'far-hit' }]), 0);
  assert.equal(f.state.enabled, true);
  assert.equal(f.frame(1, [{ id: 'far-hit' }]), 0);
  assert.equal(f.frame(1, [{ id: 'near-hit' }]), 1);
  f.controller.dispose();
});

test('contacts before decoding finishes are dropped rather than collected for a later burst', () => {
  const f = setup({ ready: false }); f.unlock();
  assert.equal(f.frame(0, [{ id: 'loading-hit' }]), 0);
  f.state.ready = true; f.state.loading = false;
  assert.equal(f.frame(0, [{ id: 'loading-hit' }]), 0);
  assert.equal(f.frame(0, [{ id: 'ready-hit' }]), 1);
  f.controller.dispose();
});

test('hidden, small-screen, and page-hidden contacts remain consumed after the page returns', () => {
  const transitions = [
    { hide(f) { f.document.hidden = true; f.document.fire('visibilitychange'); }, show(f) { f.document.hidden = false; f.document.fire('visibilitychange'); } },
    { hide(f) { f.mediaQuery.matches = false; f.mediaQuery.fire('change', { matches: false }); }, show(f) { f.mediaQuery.matches = true; f.mediaQuery.fire('change', { matches: true }); } },
    { hide(f) { f.window.fire('pagehide'); }, show(f) { f.window.fire('pageshow'); } },
  ];
  for (const transition of transitions) {
    const f = setup(); f.unlock(); transition.hide(f);
    assert.equal(f.frame(0, [{ id: 'hidden-hit' }]), 0);
    transition.show(f); f.unlock();
    assert.equal(f.frame(0, [{ id: 'hidden-hit' }]), 0);
    assert.equal(f.frame(0, [{ id: 'fresh-hit' }]), 1);
    f.controller.dispose();
  }
});

test('malformed frames, positions, impacts, and clocks cannot throw or emit unsafe full-volume sounds', () => {
  const f = setup(); f.unlock();
  for (const frame of [undefined, null, 0, {}, { listener: null, source: null, impacts: [null] },
    { dt: NaN, listener: { x: NaN, z: Infinity }, source: {}, impacts: [{ id: 'bad-position' }] }]) {
    assert.doesNotThrow(() => f.controller.update(frame));
    assert.ok(Number.isFinite(f.state.volume) && f.state.volume >= 0 && f.state.volume <= 1);
  }
  assert.equal(f.played(), 0);
  assert.equal(f.frame(0, [null, {}, { id: null }, { id: NaN }, { id: Infinity }, { id: '' }]), 0);
  assert.equal(f.frame(0, [{ id: 0 }, 'plain-id']), 2, 'valid zero and primitive IDs remain usable');
  f.controller.dispose();
});

test('impact history stays bounded during long-running sessions', () => {
  const f = setup(); f.unlock();
  for (let index = 0; index < 1000; index++) f.frame(20, [{ id: `hit-${index}` }]);
  assert.ok(f.controller.getState().seenImpacts <= 256);
  assert.equal(f.played(), 0);
  f.controller.dispose();
});

test('world reset clears old encounter IDs and returns gain to zero until new spatial data arrives', () => {
  const f = setup(); f.unlock(); f.frame(0, [{ id: 'cycle-0:punch' }]);
  f.controller.reset();
  assert.equal(f.state.volume, 0);
  assert.equal(f.controller.getState().seenImpacts, 0);
  assert.equal(f.frame(0, [{ id: 'cycle-0:punch' }]), 1);
  f.controller.dispose();
});

test('dispose prevents new effects and forwards disposal to the shared player only once', () => {
  const f = setup(); f.unlock(); f.frame(0, [{ id: 'before-dispose' }]);
  f.controller.dispose(); f.controller.dispose();
  f.controller.setEnabled(true); f.unlock();
  assert.equal(f.frame(0, [{ id: 'after-dispose' }]), 0);
  assert.equal(f.played(), 1);
  assert.equal(f.calls.filter(([name]) => name === 'dispose').length, 1);
  assert.equal(f.controller.getState().disposed, true);
});
