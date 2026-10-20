import assert from 'node:assert/strict';
import test from 'node:test';
import { createButtonAudio } from '../src/button-audio.js';

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    const list = this.listeners.get(type) || []; list.push(callback); this.listeners.set(type, list);
  }
  removeEventListener(type, callback) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== callback)); }
  fire(type, values = {}) {
    const event = { type, target: this, isTrusted: true, detail: 1, ...values };
    for (const callback of [...(this.listeners.get(type) || [])]) callback(event);
    return event;
  }
}

class Element {
  constructor(tagName = 'div', attributes = {}) {
    this.tagName = tagName.toUpperCase(); this.nodeType = 1; this.parentElement = null;
    this.parentNode = null; this.attributes = { ...attributes }; this.disabled = false; this.hidden = false;
    this.style = {}; this.children = []; this.type = attributes.type || '';
  }
  append(child) { child.parentElement = this; child.parentNode = this; this.children.push(child); return child; }
  remove() { this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; this.parentNode = null; }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  get isConnected() { for (let node = this; node; node = node.parentNode) if (node.nodeType === 9) return true; return false; }
  contains(other) { for (let node = other; node; node = node.parentNode) if (node === this) return true; return false; }
  matches(selector) {
    return selector.split(',').some(part => {
      const value = part.trim();
      if (value === ':disabled') return this.disabled;
      if (value === 'button') return this.tagName === 'BUTTON';
      if (value === 'input') return this.tagName === 'INPUT';
      if (value === '[hidden]') return this.hidden || this.hasAttribute('hidden');
      const attribute = value.match(/^(input)?\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
      return Boolean(attribute && (!attribute[1] || this.tagName === 'INPUT') &&
        (attribute[3] === undefined ? this.hasAttribute(attribute[2]) :
          (attribute[2] === 'type' ? this.type : this.getAttribute(attribute[2])) === attribute[3]));
    });
  }
  closest(selector) { for (let node = this; node?.nodeType === 1; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  getClientRects() { return this.closest('[hidden]') ? [] : [{}]; }
}

function setup({ ready = true, loading = false, enabled = true, unlockAllowed = true } = {}) {
  const document = Object.assign(new Target(), { nodeType: 9, hidden: false, visibilityState: 'visible' });
  const root = new Element('main'), outside = new Element('section');
  root.parentNode = document; outside.parentNode = document;
  document.contains = target => root.contains(target) || outside.contains(target);
  const window = Object.assign(new Target(), {
    getComputedStyle: node => ({ display: node.hidden ? 'none' : node.style.display || 'block', visibility: node.style.visibility || 'visible' }),
  });
  const mediaQuery = Object.assign(new Target(), { matches: true });
  const sound = root.append(new Element('button'));
  const calls = [], engines = [], timerTasks = new Map();
  let time = 0, timerId = 0, engineOptions;
  const state = { enabled, unlocked: false, ready, loading, activeSources: 0, disposed: false, waitingForGesture: true };
  function audioFactory(options) {
    engineOptions = options;
    state.enabled = options.enabled;
    const engine = {
      unlock(event) {
        calls.push(['unlock', event]);
        if (!unlockAllowed || !event?.isTrusted || !state.enabled || state.disposed) return false;
        state.unlocked = true; state.waitingForGesture = false; return true;
      },
      play() {
        calls.push(['attempt']);
        const success = state.enabled && state.unlocked && state.ready && !state.disposed;
        if (success) calls.push(['played', time]);
        return success;
      },
      setEnabled(value) { state.enabled = Boolean(value); calls.push(['enabled', state.enabled]); },
      getState: () => ({ ...state }),
      dispose() { state.disposed = true; calls.push(['dispose']); },
    };
    engines.push(engine); return engine;
  }
  const controller = createButtonAudio({ root, document, window, mediaQuery, button: sound, enabled,
    src: '/audio/click.wav', volume: .4, audioFactory, now: () => time,
    setTimeout(callback, delay) { const id = ++timerId; timerTasks.set(id, { at: time + delay, callback }); return id; },
    clearTimeout(id) { timerTasks.delete(id); },
  });
  function advance(ms) {
    const end = time + ms;
    for (let count = 0; count < 1000; count++) {
      const entry = [...timerTasks].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) { time = end; return; }
      time = entry[1].at; timerTasks.delete(entry[0]); entry[1].callback();
    }
    throw new Error('Unbounded button-audio timer loop');
  }
  function click(target, properties = {}) { return document.fire('click', { target, ...properties }); }
  const button = attributes => root.append(new Element('button', attributes));
  const played = () => calls.filter(([name]) => name === 'played').length;
  return { controller, document, window, mediaQuery, root, outside, sound, state, calls, engines, timerTasks,
    advance, click, button, played, get options() { return engineOptions; } };
}

test('real app button clicks, icon children, dynamic buttons, and keyboard clicks each sound once', () => {
  const f = setup();
  const normal = f.button(), icon = normal.append(new Element('svg', { 'aria-hidden': 'true' }));
  f.click(normal); f.click(icon); f.click(f.button()); f.click(normal, { detail: 0 });
  assert.equal(f.played(), 4);
  assert.equal(f.engines.length, 1);
  assert.deepEqual(f.options.sources, ['/audio/click.wav']);
  assert.equal(f.options.volume, .4);
  assert.deepEqual(f.options.playbackRates, [1]);
  f.controller.dispose();
});

test('disabled, inaccessible, detached, outside, non-button, and synthetic targets stay silent', () => {
  const f = setup();
  const disabled = f.button(); disabled.disabled = true;
  const ariaDisabled = f.button({ 'aria-disabled': 'true' });
  const hidden = f.button(); hidden.hidden = true;
  const hiddenParent = f.root.append(new Element('section', { 'aria-hidden': 'true' }));
  const inHiddenParent = hiddenParent.append(new Element('button'));
  const detached = f.button(); detached.remove();
  const outside = f.outside.append(new Element('button'));
  const nonButton = f.root.append(new Element('div'));
  for (const node of [disabled, ariaDisabled, hidden, inHiddenParent, detached, outside, nonButton]) f.click(node);
  f.click(f.button(), { isTrusted: false });
  f.click(f.button(), { button: 2 });
  assert.equal(f.played(), 0);
  assert.equal(f.calls.filter(([name]) => name === 'unlock').length, 0, 'excluded controls cannot unlock an effect');
  f.controller.dispose();
});

test('semantic button and input button controls are eligible, while text fields are quiet', () => {
  const f = setup();
  f.click(f.root.append(new Element('div', { role: 'button' })));
  f.click(f.root.append(new Element('input', { type: 'button' })));
  f.click(f.root.append(new Element('input', { type: 'submit' })));
  f.click(f.root.append(new Element('input', { type: 'text' })));
  assert.equal(f.played(), 3);
  f.controller.dispose();
});

test('Sound-toggle capture stays quiet until explicit playback after the preference changes', () => {
  const f = setup(), soundIcon = f.sound.append(new Element('svg'));
  const firstClick = f.click(soundIcon);
  f.controller.setEnabled(false); f.controller.playClick(firstClick);
  assert.equal(f.played(), 0, 'the first mute action must remain silent');
  const unmute = f.click(soundIcon);
  f.controller.setEnabled(true); f.controller.playClick(unmute);
  assert.equal(f.played(), 1, 'explicit unmute can sound once inside that activation');
  f.controller.dispose();
});

test('a first click may wait briefly for readiness, then plays once without requiring another click', () => {
  const f = setup({ ready: false, loading: true });
  f.click(f.button());
  assert.equal(f.played(), 0);
  assert.equal(f.controller.getState().pending, true);
  f.advance(64); f.state.ready = true; f.state.loading = false; f.advance(8);
  assert.equal(f.played(), 1);
  assert.equal(f.controller.getState().pending, false);
  f.advance(1000);
  assert.equal(f.played(), 1);
  f.controller.dispose();
});

test('rapid pending clicks retain only the latest request, avoiding a readiness burst', () => {
  const f = setup({ ready: false, loading: true });
  f.click(f.button()); f.advance(32); f.click(f.button()); f.advance(16); f.click(f.button());
  f.state.ready = true; f.state.loading = false; f.advance(16);
  assert.equal(f.played(), 1);
  f.advance(1000);
  assert.equal(f.played(), 1);
  assert.equal(f.timerTasks.size, 0);
  f.controller.dispose();
});

test('readiness that arrives beyond the short 150-millisecond window never replays an old click', () => {
  const f = setup({ ready: false, loading: true });
  f.click(f.button()); f.advance(151);
  assert.equal(f.controller.getState().pending, false);
  assert.equal(f.timerTasks.size, 0);
  f.state.ready = true; f.state.loading = false; f.advance(1000);
  assert.equal(f.played(), 0);
  f.click(f.button());
  assert.equal(f.played(), 1, 'a fresh click still works after the expired one');
  f.controller.dispose();
});

test('mute and lifecycle changes cancel pending clicks even when readiness arrives after restoration', () => {
  const scenarios = [
    f => { f.controller.setEnabled(false); f.controller.setEnabled(true); },
    f => { f.document.hidden = true; f.document.fire('visibilitychange'); f.document.hidden = false; f.document.fire('visibilitychange'); },
    f => { f.mediaQuery.matches = false; f.mediaQuery.fire('change', { matches: false }); f.mediaQuery.matches = true; f.mediaQuery.fire('change', { matches: true }); },
    f => { f.window.fire('pagehide'); f.window.fire('pageshow'); },
  ];
  for (const cancel of scenarios) {
    const f = setup({ ready: false, loading: true });
    f.click(f.button()); cancel(f); f.state.ready = true; f.state.loading = false; f.advance(200);
    assert.equal(f.played(), 0);
    assert.equal(f.controller.getState().pending, false);
    f.controller.dispose();
  }
});

test('a valid captured click still sounds once when its normal action disables, hides, or removes the button', () => {
  for (const change of [node => { node.disabled = true; }, node => { node.hidden = true; }, node => node.remove()]) {
    const f = setup({ ready: false, loading: true }), node = f.button();
    f.click(node); change(node); f.state.ready = true; f.state.loading = false; f.advance(100);
    assert.equal(f.played(), 1, 'normal UI rerendering must not swallow the captured activation');
    f.advance(1000); assert.equal(f.played(), 1);
    f.controller.dispose();
  }
});

test('a failed unlock or unavailable sample does not install a pointless retry timer', () => {
  for (const options of [{ ready: false, loading: false }, { ready: false, loading: true, unlockAllowed: false }]) {
    const f = setup(options);
    assert.doesNotThrow(() => f.click(f.button()));
    assert.equal(f.controller.getState().pending, false);
    assert.equal(f.timerTasks.size, 0);
    f.advance(1000); assert.equal(f.played(), 0);
    f.controller.dispose();
  }
});

test('a new trusted click elsewhere cancels a pending button click instead of replaying it after navigation', () => {
  const f = setup({ ready: false, loading: true });
  f.click(f.button()); f.click(f.root.append(new Element('div')));
  f.state.ready = true; f.state.loading = false; f.advance(200);
  assert.equal(f.played(), 0);
  assert.equal(f.controller.getState().pending, false);
  f.controller.dispose();
});

test('an initially muted control neither unlocks nor schedules audio from ordinary clicks', () => {
  const f = setup({ enabled: false, ready: false, loading: true });
  f.click(f.button()); f.advance(1000);
  assert.equal(f.played(), 0);
  assert.equal(f.calls.filter(([name]) => name === 'unlock').length, 0);
  assert.equal(f.timerTasks.size, 0);
  f.controller.dispose();
});

test('a ready button activation cannot sound twice if the same event is forwarded explicitly', () => {
  const f = setup(), event = f.click(f.button());
  f.controller.playClick(event);
  assert.equal(f.played(), 1);
  f.controller.dispose();
});

test('dispose removes delegated behavior, clears queued work, and disposes the underlying player once', () => {
  const f = setup({ ready: false, loading: true });
  f.click(f.button()); f.controller.dispose(); f.controller.dispose();
  f.state.ready = true; f.state.loading = false; f.advance(1000);
  f.click(f.button()); f.controller.playClick({ type: 'click', target: f.button(), isTrusted: true });
  assert.equal(f.played(), 0);
  assert.equal(f.timerTasks.size, 0);
  assert.equal(f.calls.filter(([name]) => name === 'dispose').length, 1);
});
