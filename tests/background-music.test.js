import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackgroundMusic } from '../src/background-music.js';

class Target {
  constructor() { this.listeners = new Map(); this.attributes = {}; }
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
  setAttribute(name, value) { this.attributes[name] = String(value); }
  contains(target) { return target === this || target?.parentElement === this; }
}

const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup({ stored, desktop = true, hidden = false, volume, playResults = [], brokenStorage = false } = {}) {
  const document = Object.assign(new Target(), { visibilityState: hidden ? 'hidden' : 'visible', hidden });
  const window = new Target(), button = new Target(), mediaQuery = Object.assign(new Target(), { matches: desktop });
  const values = new Map(stored === undefined ? [] : [['common-ground:music-enabled', stored]]);
  const storage = {
    getItem(key) { if (brokenStorage) throw new Error('Storage is blocked'); return values.get(key) ?? null; },
    setItem(key, value) { if (brokenStorage) throw new Error('Storage is blocked'); values.set(key, String(value)); },
  };
  const audios = [], creations = [], changes = [];
  function audioFactory(src) {
    creations.push(src);
    const audio = Object.assign(new Target(), {
      src: src || '', paused: true, playCalls: 0, pauseCalls: 0, loadCalls: 0,
      play() {
        this.playCalls++;
        const result = playResults.shift();
        if (result instanceof Error) return Promise.reject(result);
        if (result?.promise) return result.promise.then(() => { this.paused = false; this.fire('playing'); });
        this.paused = false; this.fire('playing');
        return Promise.resolve();
      },
      pause() { this.pauseCalls++; this.paused = true; this.fire('pause'); },
      load() { this.loadCalls++; },
    });
    audios.push(audio); return audio;
  }
  const controller = createBackgroundMusic({
    button, document, window, mediaQuery, audioFactory, storage,
    src: '/audio/background.mp3', ...(volume === undefined ? {} : { volume }),
    onChange: state => changes.push({ ...state }),
  });
  function gesture(type = 'pointerdown', values = {}) { document.fire(type, { target: document, key: 'w', ...values }); }
  function clickButton() {
    // A browser dispatches the document capture listener before button click.
    const icon = { parentElement: button };
    document.fire('pointerdown', { target: icon });
    button.fire('click', { target: icon });
  }
  function visibility(visible) {
    document.visibilityState = visible ? 'visible' : 'hidden'; document.hidden = !visible;
    document.fire('visibilitychange');
  }
  function viewport(matches) { mediaQuery.matches = matches; mediaQuery.fire('change', { matches }); }
  return { controller, document, window, button, mediaQuery, audios, creations, changes, values, gesture, clickButton, visibility, viewport };
}

test('initializing music does not create, load, or play an audio element', () => {
  const f = setup();
  assert.deepEqual(f.creations, []);
  assert.equal(f.controller.getState().enabled, true);
  assert.equal(f.controller.getState().playing, false);
  assert.equal(f.button.attributes['aria-pressed'], 'true');
  f.gesture('pointerdown', { isTrusted: false });
  f.gesture('keydown', { isTrusted: false });
  assert.deepEqual(f.creations, [], 'synthetic input cannot grant browser playback permission');
  f.controller.dispose();
});

test('a real world gesture starts one quiet looping track and later input reuses it', async () => {
  const f = setup();
  f.gesture(); await flush();
  assert.equal(f.audios.length, 1);
  const audio = f.audios[0];
  assert.equal(audio.src, '/audio/background.mp3');
  assert.equal(audio.loop, true);
  assert.equal(audio.preload, 'none');
  assert.equal(audio.volume, .06);
  assert.equal(audio.playCalls, 1);
  assert.equal(f.controller.getState().playing, true);
  f.gesture(); f.gesture('keydown'); await flush();
  assert.equal(f.audios.length, 1);
  assert.equal(audio.playCalls, 1, 'walking keys and mouse drags do not restart music');
  f.controller.dispose();
});

test('clicking the sound button before any world gesture mutes without a moment of playback', async () => {
  const f = setup();
  f.clickButton(); await flush();
  assert.equal(f.controller.getState().enabled, false);
  assert.equal(f.button.attributes['aria-pressed'], 'false');
  assert.equal(f.button.attributes['aria-label'], 'Play background music');
  assert.equal(f.values.get('common-ground:music-enabled'), 'false');
  assert.equal(f.audios.length, 0, 'toggle capture must not unlock audio before the click mutes it');
  f.gesture(); await flush();
  assert.equal(f.audios.length, 0);
  f.controller.dispose();
});

test('a remembered mute stays quiet until explicit unmute and saves the new preference', async () => {
  const f = setup({ stored: 'false' });
  f.gesture(); f.gesture('keydown'); await flush();
  assert.equal(f.audios.length, 0);
  f.clickButton(); await flush();
  assert.equal(f.controller.getState().enabled, true);
  assert.equal(f.controller.getState().playing, true);
  assert.equal(f.values.get('common-ground:music-enabled'), 'true');
  assert.equal(f.button.attributes['aria-label'], 'Mute background music');
  assert.equal(f.audios[0].playCalls, 1);
  f.controller.dispose();
});

test('muting pauses the existing track and unmuting resumes that same element', async () => {
  const f = setup();
  f.gesture(); await flush();
  f.clickButton(); await flush();
  assert.equal(f.audios[0].paused, true);
  assert.equal(f.controller.getState().playing, false);
  f.clickButton(); await flush();
  assert.equal(f.audios.length, 1);
  assert.equal(f.audios[0].playCalls, 2);
  assert.equal(f.controller.getState().playing, true);
  f.controller.dispose();
});

test('a rejected browser play request is handled and the next gesture can retry', async () => {
  const f = setup({ playResults: [new Error('NotAllowedError')] });
  f.gesture(); await flush();
  assert.equal(f.controller.getState().enabled, true);
  assert.equal(f.controller.getState().playing, false);
  assert.equal(f.controller.getState().waitingForGesture, true);
  f.gesture('keydown'); await flush();
  assert.equal(f.audios[0].playCalls, 2);
  assert.equal(f.controller.getState().playing, true);
  f.controller.dispose();
});

test('hiding the tab pauses and showing it resumes only an enabled, previously unlocked track', async () => {
  const f = setup();
  f.visibility(false); f.visibility(true); await flush();
  assert.equal(f.audios.length, 0);
  f.gesture(); await flush();
  f.visibility(false); await flush();
  assert.equal(f.audios[0].paused, true);
  assert.equal(f.controller.getState().playing, false);
  f.visibility(true); await flush();
  assert.equal(f.audios[0].playCalls, 2);
  assert.equal(f.controller.getState().playing, true);
  f.controller.setEnabled(false);
  f.visibility(false); f.visibility(true); await flush();
  assert.equal(f.audios[0].playCalls, 2, 'a tab switch cannot undo mute');
  f.controller.dispose();
});

test('page lifecycle suspends music and a restored page resumes without creating another track', async () => {
  const f = setup();
  f.gesture(); await flush();
  f.window.fire('pagehide'); await flush();
  assert.equal(f.audios[0].paused, true);
  assert.equal(f.controller.getState().playing, false);
  f.gesture(); await flush();
  assert.equal(f.audios[0].playCalls, 1, 'a hidden page cannot restart from a late gesture');
  f.window.fire('pageshow'); await flush();
  assert.equal(f.audios.length, 1);
  assert.equal(f.audios[0].playCalls, 2);
  f.controller.dispose();
});

test('the desktop viewport gate pauses music below 1280 pixels and safely resumes above it', async () => {
  const f = setup();
  f.gesture(); await flush();
  f.viewport(false); await flush();
  assert.equal(f.audios[0].paused, true);
  f.gesture(); await flush();
  assert.equal(f.audios[0].playCalls, 1);
  f.viewport(true); await flush();
  assert.equal(f.audios[0].playCalls, 2);
  assert.equal(f.controller.getState().playing, true);
  f.controller.setEnabled(false);
  f.viewport(false); f.viewport(true); await flush();
  assert.equal(f.audios[0].playCalls, 2);
  f.controller.dispose();
});

test('initially hidden and small-screen pages remain silent even when they receive gestures', async () => {
  for (const options of [{ desktop: false }, { hidden: true }]) {
    const f = setup(options);
    f.gesture(); f.gesture('keydown'); await flush();
    assert.equal(f.audios.length, 0);
    assert.equal(f.controller.getState().playing, false);
    f.controller.dispose();
  }
});

test('storage denial does not prevent music playback or mute controls', async () => {
  const f = setup({ brokenStorage: true });
  f.gesture(); await flush();
  assert.equal(f.controller.getState().playing, true);
  assert.doesNotThrow(() => f.controller.setEnabled(false));
  assert.equal(f.audios[0].paused, true);
  assert.doesNotThrow(() => f.controller.setEnabled(true));
  await flush();
  assert.equal(f.controller.getState().playing, true);
  f.controller.dispose();
});

test('volume is clamped to legal media values', async () => {
  for (const [volume, expected] of [[-5, 0], [5, 1], [NaN, .06]]) {
    const f = setup({ volume }); f.gesture(); await flush();
    assert.equal(f.audios[0].volume, expected);
    f.controller.dispose();
  }
});

test('keyboard activation on the music button does not unlock before the subsequent mute click', async () => {
  const f = setup();
  f.gesture('keydown', { target: f.button, key: 'Enter' });
  f.button.fire('click'); await flush();
  assert.equal(f.audios.length, 0);
  assert.equal(f.controller.getState().enabled, false);
  f.controller.dispose();
});

test('typing, key repeats, shortcuts, and secondary mouse clicks do not accidentally unlock music', async () => {
  const f = setup();
  for (const values of [
    { key: 'Shift' }, { key: 'Tab' }, { key: 'Escape' }, { key: 'w', repeat: true },
    { key: 'r', ctrlKey: true }, { key: 'a', altKey: true }, { key: 'a', metaKey: true },
    { key: 'a', target: { tagName: 'INPUT' } }, { key: 'a', target: { tagName: 'TEXTAREA' } },
    { key: 'a', target: { isContentEditable: true } },
  ]) f.gesture('keydown', values);
  f.gesture('pointerdown', { button: 2 });
  await flush();
  assert.equal(f.audios.length, 0);
  f.gesture('keydown', { key: 'ArrowLeft' }); await flush();
  assert.equal(f.controller.getState().playing, true, 'an actual navigation key may unlock the track');
  f.controller.dispose();
});

test('repeated gestures during an outstanding play request do not duplicate it', async () => {
  const pending = deferred(), f = setup({ playResults: [pending] });
  f.gesture(); f.gesture(); f.gesture('keydown');
  assert.equal(f.audios[0].playCalls, 1);
  pending.resolve(); await flush();
  assert.equal(f.controller.getState().playing, true);
  f.controller.dispose();
});

test('a synchronous audio-device failure stays recoverable on a later gesture', async () => {
  const f = setup();
  f.gesture(); await flush();
  f.controller.setEnabled(false);
  const normalPlay = f.audios[0].play;
  f.audios[0].play = () => { throw new Error('Device is unavailable'); };
  assert.doesNotThrow(() => f.controller.setEnabled(true));
  assert.equal(f.controller.getState().playing, false);
  assert.equal(f.controller.getState().waitingForGesture, true);
  f.audios[0].play = normalPlay;
  f.gesture(); await flush();
  assert.equal(f.controller.getState().playing, true);
  f.controller.dispose();
});

test('a pending play cannot revive music after mute, lifecycle suspension, or disposal', async () => {
  for (const stop of [f => f.controller.setEnabled(false), f => f.visibility(false), f => f.viewport(false), f => f.window.fire('pagehide'), f => f.controller.dispose()]) {
    const pending = deferred(), f = setup({ playResults: [pending] });
    f.gesture();
    assert.equal(f.audios[0].playCalls, 1);
    stop(f); pending.resolve(); await flush();
    assert.equal(f.audios[0].paused, true, 'late play resolution must be explicitly stopped');
    assert.equal(f.controller.getState().playing, false);
    f.controller.dispose();
  }
});

test('a stale rejected play cannot overwrite a successful later unmute', async () => {
  const first = deferred(), second = deferred(), f = setup({ playResults: [first, second] });
  f.gesture();
  f.controller.setEnabled(false); f.clickButton();
  second.resolve(); await flush();
  assert.equal(f.controller.getState().playing, true);
  first.reject(new Error('Superseded request')); await flush();
  assert.equal(f.controller.getState().playing, true);
  assert.equal(f.controller.getState().waitingForGesture, false);
  assert.equal(f.audios[0].paused, false);
  f.controller.dispose();
});

test('dispose detaches event handlers and prevents subsequent playback and preference changes', async () => {
  const f = setup();
  f.gesture(); await flush();
  f.controller.dispose();
  const calls = f.audios[0].playCalls, enabled = f.controller.getState().enabled;
  f.gesture(); f.clickButton(); f.visibility(false); f.visibility(true); f.viewport(false); f.viewport(true);
  f.window.fire('pageshow'); f.controller.setEnabled(!enabled); await flush();
  assert.equal(f.audios[0].playCalls, calls);
  assert.equal(f.controller.getState().enabled, enabled);
  assert.equal(f.audios[0].paused, true);
});
