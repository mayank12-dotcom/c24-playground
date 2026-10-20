import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createFloatingPanel } from '../src/panels.js';

// Execute the real application coordinator with its rendering/network boundaries
// stubbed. No WebGL, browser automation, or production-only test hooks are needed.
const imports = {
  './world.js': 'export const createWorld = options => globalThis.fixture.createWorld(options);',
  './application.js': 'export const jobs = globalThis.fixture.jobs; export const createApplication = options => globalThis.fixture.createApplication(options);',
  './presence.js': 'export const createPresence = options => globalThis.fixture.createPresence(options);',
  './crowd.js': 'export const getBotOccupiedJobs = () => [];',
  './panels.js': 'export const createFloatingPanel = options => globalThis.fixture.createFloatingPanel(options);',
  './bot-challenge.js': 'export const createBotChallenge = options => globalThis.fixture.createBotChallenge(options);',
  './footstep-audio.js': 'export const createFootstepAudio = options => globalThis.fixture.createFootstepAudio(options);',
  './sample-audio.js': 'export const createSampleAudio = options => globalThis.fixture.createSampleAudio(options);',
  './button-audio.js': 'export const createButtonAudio = options => globalThis.fixture.createButtonAudio(options);',
  './fight-audio.js': 'export const createFightAudio = options => globalThis.fixture.createFightAudio(options);',
  './name-prompt.js': 'export const createNamePrompt = options => globalThis.fixture.createNamePrompt(options);',
  lucide: 'export const createIcons = () => {}; export const Armchair = 0, ArrowUpRight = 0, Keyboard = 0, LocateFixed = 0, Minus = 0, Plus = 0, X = 0, Move = 0, ZoomIn = 0, Shuffle = 0;',
};
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../src/main.js', import.meta.url))],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  plugins: [{
    name: 'coordinator-boundaries',
    setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, args => {
        if (Object.hasOwn(imports, args.path) || args.path.endsWith('.css')) return { path: args.path, namespace: 'fixture' };
      });
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: imports[args.path] || '', loader: 'js' }));
    },
  }],
});
const source = bundled.outputFiles[0].text;

class EventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) || [];
    listeners.push(listener); this.listeners.set(name, listeners);
  }
  removeEventListener(name, listener) {
    this.listeners.set(name, (this.listeners.get(name) || []).filter(item => item !== listener));
  }
  fire(name, event = {}) { return (this.listeners.get(name) || []).map(listener => listener(event)); }
}

function setup({ claimSeat = async () => true, deferSeatReady = false, deferStandUp = false, releaseSeat = async () => {}, nearBot = false, canPush = true, soundStorage = new Map(), desktop = true, visitorName = 'Alex' } = {}) {
  const calls = [];
  const nodes = new Map();
  const document = new EventTarget();
  document.getElementById = id => {
    if (!nodes.has(id)) {
      const node = new EventTarget();
      Object.assign(node, {
        id, ownerDocument: document, hidden: ['near-prompt', 'seated-nudge', 'opportunity-panel', 'controls-help', 'info-sidebar'].includes(id),
        parentElement: { dataset: {} }, textContent: '', attributes: {},
        classList: { add() {}, remove() {} },
        setAttribute(name, value) { this.attributes[name] = value; },
        contains(other) { return this === other || (id === 'opportunity-panel' && ['panel-close', 'sidebar', 'info-sidebar'].includes(other?.id)); },
        focus() { document.activeElement = this; },
        remove() { this.removed = true; },
      });
      nodes.set(id, node);
    }
    return nodes.get(id);
  };
  const viewport = Object.assign(new EventTarget(), { matches: desktop });
  const window = Object.assign(new EventTarget(), { matchMedia: () => viewport, localStorage: {
    getItem: key => soundStorage.get(key) ?? null,
    setItem: (key, value) => soundStorage.set(key, value),
  } });
  const fixture = {
    jobs: [{ id: 'product-designer', title: 'Product Designer', company: 'Forma' }, { id: 'frontend-engineer', title: 'Frontend Engineer', company: 'Orbit' }],
    loungeSeats: [{ id: 'lounge-beanbag-1', title: 'The reading corner', kind: 'lounge' }],
    worlds: [], presences: [],
    createNamePrompt(config) {
      let name = visitorName;
      fixture.namePromptConfig = config;
      const prompt = {
        open() { if (!name && viewport.matches) fixture.namePromptOpen = true; },
        getName: () => name,
        destroy() { fixture.namePromptDestroyed = true; },
      };
      fixture.completeName = value => {
        if (name) return;
        name = value;
        fixture.namePromptOpen = false;
        config.onComplete(value);
      };
      return prompt;
    },
    createFightAudio(config) {
      const ownCalls = [];
      const instance = {
        config, calls: ownCalls, enabled: config.enabled ?? true,
        setEnabled(value) { instance.enabled = Boolean(value); ownCalls.push(['setEnabled', Boolean(value)]); },
        update(frame) { ownCalls.push(['update', frame]); },
        unlock(event) { ownCalls.push(['unlock', event]); },
        reset() { ownCalls.push(['reset']); },
        dispose() { ownCalls.push(['dispose']); },
      };
      fixture.fightAudio = instance;
      return instance;
    },
    createButtonAudio(config) {
      const ownCalls = [];
      const instance = {
        config, calls: ownCalls, enabled: config.enabled ?? true,
        setEnabled(value) { instance.enabled = Boolean(value); ownCalls.push(['setEnabled', Boolean(value)]); },
        playClick(event) { ownCalls.push(['playClick', event, { enabled: instance.enabled }]); },
        dispose() { ownCalls.push(['dispose']); },
      };
      fixture.buttonAudio = instance;
      return instance;
    },
    createSampleAudio(config) {
      const ownCalls = [];
      const instance = {
        config, calls: ownCalls, enabled: config.enabled ?? true,
        setEnabled(value) { instance.enabled = Boolean(value); ownCalls.push(['setEnabled', Boolean(value)]); },
        play(...args) { ownCalls.push(['play', ...args]); },
        unlock(event) { ownCalls.push(['unlock', event]); },
        dispose() { ownCalls.push(['dispose']); },
      };
      fixture.dismissAudio = instance;
      return instance;
    },
    createFootstepAudio(config) {
      const ownCalls = [];
      const instance = {
        config, calls: ownCalls, enabled: config.enabled ?? true,
        setEnabled(value) { instance.enabled = Boolean(value); ownCalls.push(['setEnabled', Boolean(value)]); },
        playStep(event) { ownCalls.push(['playStep', event]); },
        unlock(event) { ownCalls.push(['unlock', event]); },
        dispose() { ownCalls.push(['dispose']); },
      };
      fixture.footsteps = instance;
      return instance;
    },
    applicationConfig: null, worldConfig: null, presenceConfig: null,
    view: 'explore', activeJob: null, readyJob: null, state: { x: 0, z: 4.8, seatedJobId: null },
    completeSeatArrival(id) {
      fixture.world.completeSeatArrival(id);
    },
    completeStandUp() {
      fixture.world.completeStandUp();
    },
    createApplication(config) {
      this.applicationConfig = config;
      return {
        showJob: job => { calls.push(['showJob', job.id]); fixture.view = 'job'; fixture.activeJob = job.id; },
        showExplore: () => { calls.push(['showExplore']); fixture.view = 'explore'; fixture.activeJob = null; },
        markSeated: id => calls.push(['markSeated', id]),
        markStanding: () => calls.push(['markStanding']),
        cancelPending: () => calls.push(['cancelPending']),
        setOccupancy: () => {},
        getSessions: () => ({}),
      };
    },
    createFloatingPanel(config) {
      fixture.panelConfig = config;
      fixture.panel = createFloatingPanel({ ...config, onChange(open) { calls.push([open ? 'open' : 'close']); config.onChange(open); } });
      return fixture.panel;
    },
    createBotChallenge(config) {
      fixture.challengeConfig = config;
      let job = null;
      const challenge = {
        open(next) { job = next; calls.push(['challenge', next.id]); },
        close() { job = null; },
        getJobId: () => job?.id ?? null,
        isOpen: () => !!job,
        destroy() {},
      };
      fixture.challenge = challenge;
      return challenge;
    },
    createWorld(config) {
      this.worldConfig = config;
      const state = { x: 0, z: 4.8, seatedJobId: null };
      fixture.state = state;
      let readyJob = null, exiting = null;
      const ownCalls = [];
      const record = (...args) => { calls.push(args); ownCalls.push(args); };
      const instance = {
        calls: ownCalls, config,
        goToJob(id) { record('goToJob', id); config.onNavigateIntent(id); return true; },
        goToInfoRoom() { record('goToInfoRoom'); config.onNavigateIntent(null); return true; },
        clearSeatRequest() { record('clearSeatRequest'); },
        getPlayerState: () => ({ ...state }),
        completeSeatArrival(id) {
          readyJob = id;
          config.onSeatReady([...fixture.jobs, ...fixture.loungeSeats].find(job => job.id === id));
        },
        completeStandUp() {
          const previousExit = exiting;
          if (!previousExit) return;
          state.seatedJobId = null;
          readyJob = null;
          exiting = null;
          config.onStandUp(previousExit.previous, previousExit.reason);
          previousExit.resolve(true);
        },
        sitAt(id) {
          record('sitAt', id);
          state.seatedJobId = id;
          readyJob = null;
          config.onSeat([...fixture.jobs, ...fixture.loungeSeats].find(job => job.id === id));
          if (!deferSeatReady) instance.completeSeatArrival(id);
          return true;
        },
        isSeatReady: id => !exiting && state.seatedJobId === id && readyJob === id,
        standUp(reason = 'navigation') {
          record('standUp', reason);
          if (exiting) return exiting.promise;
          const previous = state.seatedJobId;
          if (!previous) return Promise.resolve();
          readyJob = null;
          let resolve;
          const promise = new Promise(finish => { resolve = finish; });
          exiting = { previous, reason, promise, resolve };
          config.onStandUpStart(previous, reason);
          if (!deferStandUp) instance.completeStandUp();
          return promise;
        },
        setBotDefeats() {}, setSeatOccupancy() {}, setVisitors() {}, setServerTime() {},
        isNearBotSeat: () => nearBot,
        canPushBot: () => canPush,
        pushBot(id) { record('pushBot', id); return true; },
        cancelBotChallenge() {}, bumpBot() {}, setTalking() {}, say() {},
        zoom() {}, recenter() {}, randomizeHair() {},
        destroy() { record('destroyWorld'); exiting?.resolve(false); exiting = null; },
      };
      fixture.worlds.push(instance);
      fixture.world = instance;
      return instance;
    },
    createPresence(config) {
      this.presenceConfig = config;
      const ownCalls = [];
      const instance = {
        id: `visitor-test-${fixture.presences.length}`, calls: ownCalls, config,
        claimSeat: async id => { ownCalls.push(['claimSeat', id]); return claimSeat(id, instance); },
        challengeBot: async id => { calls.push(['challengeBot', id]); return { jobId: id, hits: 1, required: 1, won: true }; },
        releaseSeat: async () => { calls.push(['releaseSeat']); ownCalls.push(['releaseSeat']); await releaseSeat(instance); },
        update() {}, destroy() { ownCalls.push(['destroyPresence']); },
      };
      fixture.presences.push(instance);
      return instance;
    },
  };
  const errors = [];
  vm.runInNewContext(source, {
    fixture, document, window,
    console: { error: (...args) => errors.push(args) },
    setTimeout: () => 1, clearTimeout() {},
  }, { filename: 'main-interaction.bundle.js' });
  assert.deepEqual(errors, [], 'the real coordinator starts successfully');
  if (desktop && visitorName) assert.ok(fixture.worldConfig);
  else assert.equal(fixture.worldConfig, null, 'startup waits for a desktop viewport and a saved name');
  calls.length = 0;
  return { ...fixture, fixture, calls, viewport, document, window, node: id => document.getElementById(id) };
}

const descriptions = calls => calls.filter(([type]) => type === 'showJob' || type === 'open');
const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };

test('a returning visitor starts immediately using the saved name for the world and live presence', () => {
  const ui = setup({ visitorName: 'Asha Roy' });
  assert.equal(ui.fixture.worlds.length, 1);
  assert.equal(ui.fixture.presences.length, 1);
  assert.equal(ui.fixture.worldConfig.playerName, 'Asha Roy');
  assert.equal(ui.fixture.presenceConfig.name, 'Asha Roy');
  assert.notEqual(ui.fixture.namePromptOpen, true);
});

test('live connection loss is visible and a successful reconnect restores the shared status', () => {
  const ui = setup();
  const status = ui.node('presence-status');
  const publish = mode => ui.fixture.presenceConfig.onStatus({ mode, message: 'Live visitors connected' });
  publish('connecting');
  assert.equal(status.textContent, 'Joining the world…');
  publish('shared');
  assert.equal(status.textContent, 'Live visitors connected');
  assert.equal(status.parentElement.dataset.connection, 'shared');
  publish('local');
  assert.equal(status.textContent, 'Live visitors unavailable');
  assert.match(status.title, /Other candidates cannot see you/);
  assert.equal(status.parentElement.dataset.connection, 'local');
  publish('shared');
  assert.equal(status.textContent, 'Live visitors connected');
  assert.equal(status.parentElement.dataset.connection, 'shared');
});

test('first entry waits for a name before creating or publishing a visitor', () => {
  const ui = setup({ visitorName: null });
  assert.equal(ui.fixture.namePromptOpen, true);
  assert.equal(ui.fixture.worlds.length, 0);
  assert.equal(ui.fixture.presences.length, 0);
  ui.node('recenter').fire('click');
  ui.node('zoom-in').fire('click');
  ui.node('info-room-toggle').fire('click');
  assert.equal(ui.fixture.worlds.length, 0, 'background actions cannot bypass the name gate');
  ui.fixture.completeName('Noor');
  assert.equal(ui.fixture.namePromptOpen, false);
  assert.equal(ui.fixture.worlds.length, 1);
  assert.equal(ui.fixture.presences.length, 1);
  assert.equal(ui.fixture.worldConfig.playerName, 'Noor');
  assert.equal(ui.fixture.presenceConfig.name, 'Noor');
  assert.equal(ui.node('loading').removed, true);
  ui.fixture.completeName('Noor');
  assert.equal(ui.fixture.worlds.length, 1, 'repeated completion cannot create duplicate characters');
});

test('a name submitted during a small-screen resize does not start the desktop experience', () => {
  const ui = setup({ visitorName: null });
  ui.viewport.matches = false;
  ui.viewport.fire('change');
  ui.fixture.completeName('Mei');
  assert.equal(ui.fixture.worlds.length, 0);
  assert.equal(ui.fixture.presences.length, 0);
  ui.viewport.matches = true;
  ui.viewport.fire('change');
  assert.equal(ui.fixture.worlds.length, 1);
  assert.equal(ui.fixture.presenceConfig.name, 'Mei');
});

test('desktop world restarts preserve the same name without prompting again', () => {
  const ui = setup({ visitorName: 'Sam' });
  ui.viewport.matches = false;
  ui.viewport.fire('change');
  ui.viewport.matches = true;
  ui.viewport.fire('change');
  assert.equal(ui.fixture.worlds.length, 2);
  assert.deepEqual(ui.fixture.worlds.map(world => world.config.playerName), ['Sam', 'Sam']);
  assert.deepEqual(ui.fixture.presences.map(presence => presence.config.name), ['Sam', 'Sam']);
  assert.notEqual(ui.fixture.namePromptOpen, true);
});

test('leaving the page disposes a pending first-visit dialog without publishing a visitor', () => {
  const ui = setup({ visitorName: null });
  ui.window.fire('pagehide');
  assert.equal(ui.fixture.namePromptDestroyed, true);
  assert.equal(ui.fixture.worlds.length, 0);
  assert.equal(ui.fixture.presences.length, 0);
});

test('the original available-seat label stays synchronized with live occupancy and its accessible label', () => {
  const ui = setup();
  assert.equal(ui.node('world-count').textContent, '2 available seats');
  ui.presenceConfig.onVisitors({ visitors: [], seats: { 'product-designer': 'another-visitor' } });
  assert.equal(ui.node('world-count').textContent, '1 available seat');
  assert.match(ui.node('seats-toggle').attributes['aria-label'], /1 available seat$/);
  ui.presenceConfig.onVisitors({ visitors: [], seats: { 'product-designer': 'another-visitor', 'frontend-engineer': 'a-second-visitor' } });
  assert.equal(ui.node('world-count').textContent, '0 available seats');
  assert.match(ui.node('seats-toggle').attributes['aria-label'], /0 available seats$/);
  ui.presenceConfig.onVisitors({ visitors: [], seats: {} });
  assert.equal(ui.node('world-count').textContent, '2 available seats');
});

test('the shared sound control mutes music, footsteps, dismissal, button, and fight sounds and restores that preference on reload', () => {
  const soundStorage = new Map();
  const ui = setup({ soundStorage });
  assert.equal(ui.footsteps.enabled, true, 'new visitors have the step sounds enabled with music');
  assert.equal(ui.dismissAudio.enabled, true, 'dismissal sounds use the same initial preference');
  assert.equal(ui.buttonAudio.enabled, true, 'button sounds use the same initial preference');
  assert.equal(ui.fightAudio.enabled, true, 'fight sounds use the same initial preference');
  assert.equal(ui.node('music-toggle').attributes['aria-pressed'], 'true');
  ui.node('music-toggle').fire('click', { type: 'click', isTrusted: true });
  assert.equal(ui.footsteps.enabled, false, 'the music control also mutes step impacts');
  assert.equal(ui.dismissAudio.enabled, false, 'dismissal sounds obey the shared mute');
  assert.equal(ui.buttonAudio.enabled, false, 'button sounds obey the shared mute');
  assert.equal(ui.fightAudio.enabled, false, 'fight sounds obey the shared mute');
  assert.equal(ui.node('music-toggle').attributes['aria-pressed'], 'false');
  assert.equal(soundStorage.get('common-ground:music-enabled'), 'false');

  const reloaded = setup({ soundStorage });
  assert.equal(reloaded.footsteps.enabled, false, 'a saved mute applies before any world step can sound');
  assert.equal(reloaded.dismissAudio.enabled, false, 'a saved mute applies before a popup can sound');
  assert.equal(reloaded.buttonAudio.enabled, false, 'a saved mute applies before any button feedback');
  assert.equal(reloaded.fightAudio.enabled, false, 'a saved mute applies before a fight frame can sound');
  assert.equal(reloaded.node('music-toggle').attributes['aria-pressed'], 'false');
  reloaded.node('music-toggle').fire('click', { type: 'click', isTrusted: true });
  assert.equal(reloaded.footsteps.enabled, true);
  assert.equal(reloaded.dismissAudio.enabled, true);
  assert.equal(reloaded.buttonAudio.enabled, true);
  assert.equal(reloaded.fightAudio.enabled, true);
  assert.equal(soundStorage.get('common-ground:music-enabled'), 'true');
});

test('the shared sound control unlocks footsteps, dismissal, and fight playback in the same explicit unmute gesture', () => {
  const ui = setup({ soundStorage: new Map([['common-ground:music-enabled', 'false']]) });
  const gesture = { type: 'click', isTrusted: true };
  ui.node('music-toggle').fire('click', gesture);
  assert.equal(ui.footsteps.enabled, true);
  const unlocked = ui.footsteps.calls.filter(([type]) => type === 'unlock');
  assert.equal(unlocked.length, 1);
  assert.equal(unlocked[0][1], gesture, 'the controller receives the actual browser gesture rather than a deferred synthetic event');
  const dismissUnlocked = ui.dismissAudio.calls.filter(([type]) => type === 'unlock');
  assert.equal(dismissUnlocked.length, 1);
  assert.equal(dismissUnlocked[0][1], gesture);
  assert.equal(ui.dismissAudio.enabled, true);
  const fightUnlocked = ui.fightAudio.calls.filter(([type]) => type === 'unlock');
  assert.equal(fightUnlocked.length, 1);
  assert.equal(fightUnlocked[0][1], gesture, 'nearby impacts unlock in that same explicit unmute gesture');
  assert.equal(ui.fightAudio.enabled, true);
});

test('fight audio starts quietly with its four local samples and shares the desktop sound control', () => {
  const ui = setup();
  assert.equal(ui.fightAudio.config.enabled, false, 'the shared preference is applied after construction');
  assert.equal(ui.fightAudio.config.document, ui.document);
  assert.equal(ui.fightAudio.config.window, ui.window);
  assert.equal(ui.fightAudio.config.button, ui.node('music-toggle'));
  assert.equal(ui.fightAudio.config.mediaQuery, ui.viewport);
  assert.deepEqual(Array.from(ui.fightAudio.config.sources), [
    '/audio/fight-1.wav', '/audio/fight-2.wav', '/audio/fight-3.wav', '/audio/click.wav',
  ], 'the fourth fight variant reuses the supplied click sample');
  assert.equal(ui.fightAudio.config.volume, .45);
  assert.equal(ui.fightAudio.config.innerRadius, 3);
  assert.equal(ui.fightAudio.config.outerRadius, 10);
  assert.equal(ui.fightAudio.calls.some(([type]) => type === 'update' || type === 'unlock'), false, 'startup does not invent a contact or gesture');
});

test('only the current world forwards fight frames and teardown clears rather than repeats its audio', () => {
  const ui = setup();
  const oldWorld = ui.fixture.world;
  const firstFrame = Object.freeze({ listener: { x: 0, z: 4.8 }, fighters: [{ id: 'fighter-a', x: 1, z: 2 }], impacts: [{ id: 'contact-1', kind: 'punch' }] });
  oldWorld.config.onFightFrame(firstFrame);
  let updates = ui.fightAudio.calls.filter(([type]) => type === 'update');
  assert.equal(updates.length, 1);
  assert.equal(updates[0][1], firstFrame, 'the spatial/contact frame reaches the audio controller unchanged');

  ui.viewport.matches = false; ui.viewport.fire('change');
  assert.equal(ui.fightAudio.calls.filter(([type]) => type === 'reset').length, 1);
  oldWorld.config.onFightFrame(firstFrame);
  assert.equal(ui.fightAudio.calls.filter(([type]) => type === 'update').length, 1, 'a stopped world cannot restore old contact state');

  ui.viewport.matches = true; ui.viewport.fire('change');
  const currentWorld = ui.fixture.world;
  assert.notEqual(currentWorld, oldWorld);
  oldWorld.config.onFightFrame(firstFrame);
  const nextFrame = Object.freeze({ listener: { x: 2, z: 5 }, fighters: [], impacts: [] });
  currentWorld.config.onFightFrame(nextFrame);
  updates = ui.fightAudio.calls.filter(([type]) => type === 'update');
  assert.equal(updates.length, 2);
  assert.equal(updates[1][1], nextFrame);
  const sound = ui.fightAudio;
  ui.window.fire('pagehide');
  assert.equal(sound.calls.filter(([type]) => type === 'reset').length, 2);
  currentWorld.config.onFightFrame(nextFrame);
  assert.equal(sound.calls.filter(([type]) => type === 'update').length, 2, 'page teardown clears without replaying the last frame');
  assert.equal(ui.fixture.fightAudio, sound, 'world restarts reuse one audio controller');
});

test('the Sound button forwards its original event only after applying the new sound preference', () => {
  const ui = setup();
  assert.equal(ui.buttonAudio.config.root, ui.node('app'), 'button feedback is delegated over the full application');
  assert.equal(ui.buttonAudio.config.button, ui.node('music-toggle'));
  assert.equal(ui.buttonAudio.config.mediaQuery, ui.viewport);
  assert.equal(ui.buttonAudio.calls.some(([type]) => type === 'playClick'), false, 'startup never sounds like a button click');

  const muteGesture = { type: 'click', isTrusted: true };
  ui.node('music-toggle').fire('click', muteGesture);
  let clicks = ui.buttonAudio.calls.filter(([type]) => type === 'playClick');
  assert.equal(clicks.length, 1);
  assert.equal(clicks[0][1], muteGesture);
  assert.equal(clicks[0][2].enabled, false, 'the click that turns Sound off observes the already-muted state');
  assert.equal(ui.footsteps.enabled, false);
  assert.equal(ui.dismissAudio.enabled, false);

  const enableGesture = { type: 'click', isTrusted: true };
  ui.node('music-toggle').fire('click', enableGesture);
  clicks = ui.buttonAudio.calls.filter(([type]) => type === 'playClick');
  assert.equal(clicks.length, 2);
  assert.equal(clicks[1][1], enableGesture);
  assert.equal(clicks[1][2].enabled, true, 'the explicit enable click can provide feedback immediately');
  assert.equal(ui.footsteps.enabled, true);
  assert.equal(ui.dismissAudio.enabled, true);
});

test('button audio integration starts safely below desktop width and survives normal world restarts', () => {
  const ui = setup({ desktop: false, soundStorage: new Map([['common-ground:music-enabled', 'false']]) });
  const buttonAudio = ui.buttonAudio;
  assert.equal(ui.fixture.worlds.length, 0);
  assert.equal(buttonAudio.enabled, false);
  assert.equal(buttonAudio.config.mediaQuery, ui.viewport);
  assert.equal(buttonAudio.calls.some(([type]) => type === 'playClick'), false);
  ui.viewport.matches = true; ui.viewport.fire('change');
  assert.equal(ui.fixture.worlds.length, 1);
  ui.viewport.matches = false; ui.viewport.fire('change');
  ui.viewport.matches = true; ui.viewport.fire('change');
  assert.equal(ui.fixture.worlds.length, 2, 'the existing world lifecycle still restarts normally');
  assert.equal(ui.fixture.buttonAudio, buttonAudio, 'world restarts do not create duplicate button controllers');
  assert.equal(buttonAudio.enabled, false, 'the saved shared mute survives the restart');
  assert.equal(buttonAudio.calls.some(([type]) => type === 'playClick'), false, 'automatic lifecycle changes remain silent');
});

const dismissalPlays = ui => ui.dismissAudio.calls.filter(([type]) => type === 'play');

for (const closeWith of ['close button', 'help toggle', 'Escape']) {
  test(`dismissing exploration help with ${closeWith} requests one sound and opening it stays silent`, () => {
    const ui = setup();
    ui.node('help-toggle').fire('click', { type: 'click', isTrusted: true });
    assert.equal(ui.node('controls-help').hidden, false);
    assert.equal(dismissalPlays(ui).length, 0, 'opening a popup is silent');
    const gesture = { type: closeWith === 'Escape' ? 'keydown' : 'click', key: 'Escape', isTrusted: true };
    if (closeWith === 'close button') ui.node('help-close').fire('click', gesture);
    else if (closeWith === 'help toggle') ui.node('help-toggle').fire('click', gesture);
    else ui.document.fire('keydown', gesture);
    assert.equal(ui.node('controls-help').hidden, true);
    assert.equal(dismissalPlays(ui).length, 1);
    assert.ok(ui.dismissAudio.calls.some(([type, event]) => type === 'unlock' && event === gesture), 'the explicit close gesture can unlock the sound');
    ui.node('help-close').fire('click', { type: 'click', isTrusted: true });
    ui.document.fire('keydown', { type: 'keydown', key: 'Escape', isTrusted: true });
    assert.equal(dismissalPlays(ui).length, 1, 'an already closed popup never sounds again');
  });
}

test('one Escape shared by help, sidebar, and challenge dismissals requests only one sound', () => {
  const ui = setup();
  ui.world.sitAt(ui.jobs[0].id);
  ui.node('help-toggle').fire('click', { type: 'click', isTrusted: true });
  assert.equal(ui.node('opportunity-panel').hidden, false);
  assert.equal(ui.node('controls-help').hidden, false);
  assert.equal(dismissalPlays(ui).length, 0);
  const gesture = { type: 'keydown', key: 'Escape', isTrusted: true };
  ui.document.fire('keydown', gesture);
  assert.equal(ui.node('opportunity-panel').hidden, true);
  assert.equal(ui.node('controls-help').hidden, true);
  assert.equal(dismissalPlays(ui).length, 1, 'two real close listeners sharing one event do not overlap sounds');
  ui.challengeConfig.onDismiss(gesture);
  ui.panelConfig.onDismiss(gesture);
  assert.equal(dismissalPlays(ui).length, 1, 'the bot challenge uses the same deduplicating callback');
  assert.equal(ui.world.getPlayerState().seatedJobId, ui.jobs[0].id);
  assert.equal(ui.world.isSeatReady(ui.jobs[0].id), true);
  assert.equal(ui.calls.some(([type]) => type === 'standUp' || type === 'releaseSeat'), false);
});

test('automatic navigation, lounge seating, and lifecycle panel closures stay silent', async () => {
  for (const action of ['movement', 'another role', 'leave without event', 'lounge seating', 'seat lost', 'small viewport', 'pagehide']) {
    const ui = setup();
    ui.world.sitAt(ui.jobs[0].id);
    assert.equal(ui.node('opportunity-panel').hidden, false);
    if (action === 'movement') ui.world.standUp('movement');
    else if (action === 'another role') ui.applicationConfig.onNavigate(ui.jobs[1].id);
    else if (action === 'leave without event') ui.applicationConfig.onLeave();
    else if (action === 'lounge seating') ui.world.sitAt(ui.loungeSeats[0].id);
    else if (action === 'seat lost') ui.presenceConfig.onSeatLost();
    else if (action === 'small viewport') { ui.viewport.matches = false; ui.viewport.fire('change'); }
    else ui.window.fire('pagehide');
    await flush();
    assert.equal(ui.node('opportunity-panel').hidden, true, action);
    assert.equal(dismissalPlays(ui).length, 0, action);
  }
});

test('an explicit Leave table action dismisses once while preserving the normal delayed chair release', async () => {
  const ui = setup({ deferStandUp: true });
  ui.world.sitAt(ui.jobs[0].id);
  const gesture = { type: 'click', isTrusted: true };
  ui.applicationConfig.onLeave(gesture);
  await flush();
  assert.equal(ui.node('opportunity-panel').hidden, true);
  assert.equal(dismissalPlays(ui).length, 1, 'the manual close is not repeated by the ensuing automatic rise');
  assert.ok(ui.dismissAudio.calls.some(([type, event]) => type === 'unlock' && event === gesture));
  assert.equal(ui.world.getPlayerState().seatedJobId, ui.jobs[0].id, 'the chair stays reserved through the get-up');
  assert.equal(ui.world.isSeatReady(ui.jobs[0].id), false);
  assert.equal(ui.calls.filter(([type]) => type === 'releaseSeat').length, 0);
  ui.completeStandUp();
  await flush();
  assert.equal(ui.world.getPlayerState().seatedJobId, null);
  assert.equal(ui.calls.filter(([type]) => type === 'releaseSeat').length, 1);
  assert.equal(dismissalPlays(ui).length, 1);
});

test('only the active desktop world can forward local gait contacts to footstep audio', () => {
  const ui = setup();
  const oldWorld = ui.fixture.world;
  const firstStep = { side: 'left', position: { x: 0, y: 0, z: 4.8 }, speed: 2.25, time: .3 };
  oldWorld.config.onFootstep(firstStep);
  assert.equal(ui.footsteps.calls.filter(([type]) => type === 'playStep').length, 1);
  assert.equal(ui.footsteps.calls.find(([type]) => type === 'playStep')[1], firstStep, 'the solved landing is forwarded unchanged');

  ui.viewport.matches = false; ui.viewport.fire('change');
  oldWorld.config.onFootstep({ ...firstStep, time: .5 });
  ui.viewport.matches = true; ui.viewport.fire('change');
  const newWorld = ui.fixture.world;
  assert.notEqual(newWorld, oldWorld);
  oldWorld.config.onFootstep({ ...firstStep, time: .7 });
  const secondStep = { ...firstStep, side: 'right', time: .9 };
  newWorld.config.onFootstep(secondStep);
  const played = ui.footsteps.calls.filter(([type]) => type === 'playStep');
  assert.equal(played.length, 2, 'neither teardown nor a later viewport restart can revive an obsolete world’s sounds');
  assert.equal(played[1][1], secondStep);
});

test('a blocked landing rejects the push before reserving a chair or starting the animation', async () => {
  const ui = setup({ nearBot: true, canPush: false });
  ui.challenge.open(ui.jobs[0]);
  const result = await ui.challengeConfig.onHit(ui.jobs[0]);
  assert.equal(result.reason, 'space-needed');
  assert.equal(result.won, false);
  assert.equal(ui.calls.some(([type]) => ['challengeBot', 'pushBot', 'sitAt'].includes(type)), false);
  assert.equal(ui.world.getPlayerState().seatedJobId, null);
});

test('one confirmed push animates the shove before seating and waits for visible readiness to show the role', async () => {
  const ui = setup({ nearBot: true, deferSeatReady: true });
  ui.challenge.open(ui.jobs[0]);
  const result = await ui.challengeConfig.onHit(ui.jobs[0]);
  assert.equal(result.won, true);
  assert.deepEqual(ui.calls.filter(([type]) => ['challengeBot', 'pushBot', 'sitAt'].includes(type)), [
    ['challengeBot', ui.jobs[0].id], ['pushBot', ui.jobs[0].id], ['sitAt', ui.jobs[0].id],
  ]);
  assert.equal(ui.node('opportunity-panel').hidden, true);
  ui.completeSeatArrival(ui.jobs[0].id);
  assert.equal(ui.node('opportunity-panel').hidden, false);
});

test('passing any desk leaves the job description and nearby popup closed', () => {
  const ui = setup();
  for (const job of [ui.jobs[0], null, ui.jobs[1], ui.jobs[0]]) {
    ui.worldConfig.onNear(job);
    assert.equal(ui.node('near-prompt').hidden, true);
    assert.equal(ui.node('opportunity-panel').hidden, true);
  }
  assert.deepEqual(descriptions(ui.calls), []);
});

test('passing desks cannot replace the opportunity roster opened manually with the FAB', () => {
  const ui = setup();
  ui.node('seats-toggle').fire('click');
  assert.equal(ui.node('opportunity-panel').hidden, false);
  ui.calls.length = 0;
  ui.worldConfig.onNear(ui.jobs[0]);
  ui.worldConfig.onNear(ui.jobs[1]);
  ui.worldConfig.onNear(null);
  assert.equal(ui.fixture.view, 'explore');
  assert.equal(ui.node('opportunity-panel').hidden, false);
  assert.equal(ui.node('near-prompt').hidden, true);
  assert.deepEqual(descriptions(ui.calls), []);
});

test('selecting a world label or roster role waits for seating before displaying its description', () => {
  const ui = setup();
  ui.worldConfig.onSelect(ui.jobs[0]);
  assert.deepEqual(descriptions(ui.calls), []);
  ui.applicationConfig.onNavigate(ui.jobs[1].id);
  assert.ok(ui.calls.some(([type, id]) => type === 'goToJob' && id === ui.jobs[1].id));
  assert.deepEqual(descriptions(ui.calls), []);
  assert.equal(ui.node('opportunity-panel').hidden, true);
});

test('successful chair seating marks the seat before rendering and opening the job description', () => {
  const ui = setup();
  ui.world.sitAt(ui.jobs[0].id);
  assert.deepEqual(ui.calls.filter(([type]) => ['markSeated', 'showJob', 'open'].includes(type)), [
    ['markSeated', ui.jobs[0].id], ['showJob', ui.jobs[0].id], ['open'],
  ]);
  assert.equal(ui.node('opportunity-panel').hidden, false);
  assert.equal(ui.node('near-prompt').hidden, true);
});

test('a lounge seat is claimed and released normally without opening a ghost job description', async () => {
  const ui = setup({ deferSeatReady: true });
  const lounge = ui.loungeSeats[0];
  ui.worldConfig.onSeatRequest(lounge);
  await flush();
  assert.equal(ui.world.getPlayerState().seatedJobId, lounge.id);
  assert.ok(ui.fixture.presences[0].calls.some(([type, id]) => type === 'claimSeat' && id === lounge.id));
  ui.completeSeatArrival(lounge.id);
  assert.equal(ui.node('opportunity-panel').hidden, true);
  assert.equal(ui.node('seated-nudge').hidden, true);
  assert.equal(ui.node('world-notice').textContent, 'Take a moment. You’re settled in.');
  assert.equal(ui.calls.some(([type]) => type === 'markSeated' || type === 'showJob'), false);
  ui.applicationConfig.onLeave();
  await flush();
  assert.equal(ui.world.getPlayerState().seatedJobId, null);
  assert.equal(ui.calls.filter(([type]) => type === 'releaseSeat').length, 1);
});

test('information uses a separate panel body and preserves the seated chat draft when closed or reopened', () => {
  const ui = setup();
  ui.world.sitAt(ui.jobs[0].id);
  const retainedChat = ui.node('sidebar');
  retainedChat.innerHTML = '<textarea>My unfinished answer</textarea>';
  retainedChat.draft = 'My unfinished answer';
  ui.calls.length = 0;
  ui.worldConfig.onInfoSelect({ id: 'info-story', title: 'Our story', summary: 'A placeholder introduction.', sections: [{ title: 'A little context', body: 'More to come.' }] });
  assert.equal(ui.node('opportunity-panel').hidden, false);
  assert.equal(ui.node('opportunity-title').textContent, 'Class 24');
  assert.equal(retainedChat.hidden, true);
  assert.equal(ui.node('info-sidebar').hidden, false);
  assert.match(ui.node('info-sidebar').innerHTML, /Our story/);
  assert.match(ui.node('info-sidebar').innerHTML, /More to come/);
  assert.equal(retainedChat.innerHTML, '<textarea>My unfinished answer</textarea>');
  assert.equal(retainedChat.draft, 'My unfinished answer');
  assert.equal(ui.calls.some(([type]) => ['showJob', 'showExplore', 'markSeated', 'standUp', 'releaseSeat'].includes(type)), false);
  ui.node('panel-close').fire('click');
  assert.equal(ui.world.getPlayerState().seatedJobId, ui.jobs[0].id);
  assert.equal(ui.node('seated-nudge').hidden, false);
  ui.node('reopen-job').fire('click');
  assert.equal(ui.node('opportunity-panel').hidden, false);
  assert.equal(ui.node('opportunity-title').textContent, 'Your Current Next Chapter');
  assert.equal(retainedChat.hidden, false);
  assert.equal(ui.node('info-sidebar').hidden, true);
  assert.equal(retainedChat.draft, 'My unfinished answer');
  assert.equal(ui.calls.some(([type]) => type === 'showJob'), false, 'restoring a retained chat must not rerender it');
});

test('the seats FAB restores job mode while preserving its existing open and close toggle behavior', () => {
  const ui = setup();
  ui.worldConfig.onInfoSelect({ title: 'Our people', summary: 'A placeholder.' });
  ui.node('seats-toggle').fire('click');
  assert.equal(ui.node('opportunity-panel').hidden, true, 'the FAB closes the currently open window');
  assert.equal(ui.node('sidebar').hidden, false);
  assert.equal(ui.node('info-sidebar').hidden, true);
  ui.node('seats-toggle').fire('click');
  assert.equal(ui.node('opportunity-panel').hidden, false);
  assert.equal(ui.node('opportunity-title').textContent, 'Your Current Next Chapter');
});

test('information content is escaped before insertion into its independent sidebar', () => {
  const ui = setup();
  ui.worldConfig.onInfoSelect({
    title: '<img src=x onerror=alert(1)>', summary: 'A & B <script>bad()</script>',
    sections: [{ title: 'A "section"', body: '<button onclick="bad()">Text</button>' }],
  });
  const html = ui.node('info-sidebar').innerHTML;
  assert.doesNotMatch(html, /<img|<script|<button/);
  assert.match(html, /&lt;img/);
  assert.match(html, /A &amp; B/);
  assert.match(html, /A &quot;section&quot;/);
});

test('information selections from an obsolete world cannot replace the current panel', () => {
  const ui = setup();
  const oldWorld = ui.world;
  ui.viewport.matches = false; ui.viewport.fire('change');
  ui.viewport.matches = true; ui.viewport.fire('change');
  ui.fixture.worldConfig.onInfoSelect({ title: 'Current room', summary: 'Current information.' });
  oldWorld.config.onInfoSelect({ title: 'Obsolete room', summary: 'Old information.' });
  assert.match(ui.node('info-sidebar').innerHTML, /Current room/);
  assert.doesNotMatch(ui.node('info-sidebar').innerHTML, /Obsolete room/);
});

test('the Class 24 navigation button walks to the room without opening information remotely', () => {
  const ui = setup();
  ui.node('seats-toggle').fire('click');
  const gesture = { type: 'click', isTrusted: true };
  ui.node('info-room-toggle').fire('click', gesture);
  assert.ok(ui.calls.some(([type]) => type === 'goToInfoRoom'));
  assert.equal(ui.node('opportunity-panel').hidden, true);
  assert.equal(ui.node('info-sidebar').hidden, true);
  assert.equal(ui.node('info-sidebar').innerHTML, undefined);
  assert.equal(dismissalPlays(ui).length, 1, 'deliberately dismissing the sidebar to visit the room sounds once');
  assert.ok(ui.dismissAudio.calls.some(([type, event]) => type === 'unlock' && event === gesture));
  ui.node('info-room-toggle').fire('click', { type: 'click', isTrusted: true });
  assert.equal(dismissalPlays(ui).length, 1, 'navigation with no open panel stays silent');
});

test('standing with movement closes the description and later proximity cannot reopen it', () => {
  const ui = setup();
  ui.world.sitAt(ui.jobs[0].id);
  ui.calls.length = 0;
  ui.world.standUp('movement');
  assert.ok(ui.calls.some(([type]) => type === 'markStanding'));
  assert.ok(ui.calls.some(([type]) => type === 'close'));
  ui.calls.length = 0;
  for (const job of [ui.jobs[0], null, ui.jobs[1], ui.jobs[0]]) ui.worldConfig.onNear(job);
  assert.equal(ui.node('opportunity-panel').hidden, true);
  assert.equal(ui.node('near-prompt').hidden, true);
  assert.deepEqual(descriptions(ui.calls), []);
});

test('an asynchronous seat claim opens nothing until the chair is successfully occupied', async () => {
  let resolveClaim;
  const ui = setup({ claimSeat: () => new Promise(resolve => { resolveClaim = resolve; }) });
  ui.worldConfig.onSeatRequest(ui.jobs[0]);
  await flush();
  assert.equal(typeof resolveClaim, 'function');
  assert.deepEqual(descriptions(ui.calls), []);
  resolveClaim(true);
  await flush();
  assert.deepEqual(descriptions(ui.calls), [['showJob', ui.jobs[0].id], ['open']]);
});

test('cancelling an asynchronous seat request prevents a late description popup', async () => {
  let resolveClaim;
  const ui = setup({ claimSeat: () => new Promise(resolve => { resolveClaim = resolve; }) });
  ui.worldConfig.onSeatRequest(ui.jobs[0]);
  await flush();
  ui.worldConfig.onNavigateIntent(null);
  resolveClaim(true);
  await flush();
  assert.equal(ui.node('opportunity-panel').hidden, true);
  assert.deepEqual(descriptions(ui.calls), []);
  assert.ok(ui.calls.some(([type]) => type === 'releaseSeat'), 'a late server claim is released');
});

test('winning logical chair ownership waits for the bot handoff to finish before showing details', () => {
  const ui = setup({ deferSeatReady: true });
  ui.world.sitAt(ui.jobs[0].id);
  assert.equal(ui.fixture.state.seatedJobId, ui.jobs[0].id, 'the shared chair is already reserved');
  assert.equal(ui.world.isSeatReady(ui.jobs[0].id), false, 'the avatar has not sat down yet');
  assert.deepEqual(descriptions(ui.calls), []);
  assert.equal(ui.calls.some(([type]) => type === 'markSeated'), false);
  assert.equal(ui.node('opportunity-panel').hidden, true);
  ui.completeSeatArrival(ui.jobs[0].id);
  assert.equal(ui.world.isSeatReady(ui.jobs[0].id), true);
  assert.deepEqual(ui.calls.filter(([type]) => ['markSeated', 'showJob', 'open'].includes(type)), [
    ['markSeated', ui.jobs[0].id], ['showJob', ui.jobs[0].id], ['open'],
  ]);
});

test('standing before the bot handoff completes ignores a stale seat-ready callback', () => {
  const ui = setup({ deferSeatReady: true });
  ui.world.sitAt(ui.jobs[0].id);
  ui.world.standUp('movement');
  ui.calls.length = 0;
  ui.completeSeatArrival(ui.jobs[0].id);
  assert.equal(ui.node('opportunity-panel').hidden, true);
  assert.equal(ui.calls.some(([type]) => type === 'markSeated'), false);
  assert.deepEqual(descriptions(ui.calls), []);
});

for (const closeWith of ['close button', 'Escape', 'FAB']) {
  test(`closing the seated sidebar with ${closeWith} keeps the chair and offers a persistent reopen nudge`, async () => {
    const ui = setup();
    ui.world.sitAt(ui.jobs[0].id);
    // Treat the sidebar as a live conversation with an unsent draft: hiding and
    // reopening must not call its renderer or replace its current view.
    ui.fixture.view = 'chat';
    ui.node('sidebar').draft = 'An unfinished answer';
    ui.calls.length = 0;
    const gesture = { type: closeWith === 'Escape' ? 'keydown' : 'click', key: 'Escape', isTrusted: true };
    if (closeWith === 'close button') ui.node('panel-close').fire('click', gesture);
    else if (closeWith === 'Escape') ui.document.fire('keydown', gesture);
    else ui.node('seats-toggle').fire('click', gesture);
    await flush();
    assert.equal(ui.node('opportunity-panel').hidden, true);
    assert.equal(ui.node('seated-nudge').hidden, false);
    assert.equal(ui.node('seated-nudge-label').textContent, 'You’re seated at Product Designer.');
    assert.equal(ui.fixture.state.seatedJobId, ui.jobs[0].id);
    assert.equal(ui.world.isSeatReady(ui.jobs[0].id), true);
    assert.equal(dismissalPlays(ui).length, 1, 'the explicit dismissal requests one whoosh');
    assert.ok(ui.dismissAudio.calls.some(([type, event]) => type === 'unlock' && event === gesture));
    assert.equal(ui.calls.some(([type]) => ['releaseSeat', 'standUp', 'markStanding', 'showExplore', 'showJob', 'goToJob'].includes(type)), false);
    ui.node('reopen-job').fire('click');
    assert.equal(ui.node('opportunity-panel').hidden, false);
    assert.equal(ui.node('seated-nudge').hidden, true);
    assert.equal(ui.fixture.view, 'chat');
    assert.equal(ui.node('sidebar').draft, 'An unfinished answer');
    assert.equal(dismissalPlays(ui).length, 1, 'reopening the retained chat does not play dismissal audio');
    assert.equal(ui.calls.some(([type]) => ['releaseSeat', 'standUp', 'showJob', 'goToJob', 'sitAt'].includes(type)), false);
  });
}

test('getting up hides the panel and nudge immediately but retains the chair until the animation completes', async () => {
  const ui = setup({ deferStandUp: true });
  ui.world.sitAt(ui.jobs[0].id);
  ui.node('panel-close').fire('click');
  assert.equal(ui.node('seated-nudge').hidden, false);
  ui.calls.length = 0;
  const exit = ui.world.standUp('movement');
  await flush();
  assert.equal(ui.node('opportunity-panel').hidden, true);
  assert.equal(ui.node('seated-nudge').hidden, true);
  assert.equal(ui.fixture.state.seatedJobId, ui.jobs[0].id, 'the character still owns the chair while rising');
  assert.equal(ui.world.isSeatReady(ui.jobs[0].id), false);
  assert.ok(ui.calls.some(([type]) => type === 'cancelPending'));
  assert.equal(ui.calls.some(([type]) => ['markStanding', 'releaseSeat'].includes(type)), false);
  ui.node('reopen-job').fire('click');
  assert.equal(ui.node('opportunity-panel').hidden, true, 'a stale nudge cannot reopen during exit');
  ui.completeStandUp();
  await exit;
  await flush();
  assert.equal(ui.fixture.state.seatedJobId, null);
  assert.equal(ui.node('seated-nudge').hidden, true);
  assert.equal(ui.calls.filter(([type]) => type === 'markStanding').length, 1);
  assert.equal(ui.calls.filter(([type]) => type === 'releaseSeat').length, 1);
});

test('choosing the current role from the roster reopens its description without leaving the chair', async () => {
  const ui = setup({ deferStandUp: true });
  ui.world.sitAt(ui.jobs[0].id);
  ui.fixture.view = 'explore';
  ui.calls.length = 0;
  ui.applicationConfig.onNavigate(ui.jobs[0].id);
  await flush();
  assert.equal(ui.fixture.state.seatedJobId, ui.jobs[0].id);
  assert.equal(ui.world.isSeatReady(ui.jobs[0].id), true);
  assert.equal(ui.fixture.view, 'job');
  assert.equal(ui.fixture.activeJob, ui.jobs[0].id);
  assert.equal(ui.node('opportunity-panel').hidden, false);
  assert.equal(ui.calls.some(([type]) => ['standUp', 'releaseSeat', 'markStanding', 'goToJob', 'sitAt'].includes(type)), false);
});

test('moving to another role waits for both getting up and server release before claiming its chair', async () => {
  let finishRelease;
  const ui = setup({
    deferStandUp: true,
    claimSeat: async id => { ui.calls.push(['claimSeat', id]); return true; },
    releaseSeat: () => new Promise(resolve => { finishRelease = resolve; }),
  });
  ui.world.sitAt(ui.jobs[0].id);
  ui.calls.length = 0;
  ui.applicationConfig.onNavigate(ui.jobs[1].id);
  // Even an early world seat request cannot claim while the old chair is owned.
  ui.worldConfig.onSeatRequest(ui.jobs[1]);
  await flush();
  assert.equal(ui.calls.some(([type]) => type === 'claimSeat'), false);
  assert.equal(ui.calls.some(([type]) => type === 'releaseSeat'), false);
  assert.equal(ui.fixture.state.seatedJobId, ui.jobs[0].id);
  ui.completeStandUp();
  await flush();
  assert.equal(typeof finishRelease, 'function');
  assert.equal(ui.calls.some(([type]) => type === 'claimSeat'), false, 'network release is still in flight');
  finishRelease();
  await flush();
  assert.deepEqual(ui.calls.filter(([type]) => type === 'releaseSeat' || type === 'claimSeat'), [
    ['releaseSeat'], ['claimSeat', ui.jobs[1].id],
  ]);
  assert.equal(ui.fixture.state.seatedJobId, ui.jobs[1].id);
  assert.equal(ui.node('opportunity-panel').hidden, false);
  assert.equal(ui.node('seated-nudge').hidden, true);
});

test('duplicate leave requests share one delayed exit and one server release', async () => {
  const ui = setup({ deferStandUp: true });
  ui.world.sitAt(ui.jobs[0].id);
  ui.calls.length = 0;
  ui.applicationConfig.onLeave();
  ui.applicationConfig.onLeave();
  await flush();
  assert.equal(ui.calls.filter(([type]) => type === 'standUp').length, 1);
  assert.equal(ui.calls.some(([type]) => type === 'releaseSeat'), false);
  ui.completeStandUp();
  await flush();
  assert.equal(ui.calls.filter(([type]) => type === 'releaseSeat').length, 1);
  assert.equal(ui.node('seated-nudge').hidden, true);
});

test('seat loss, a smaller viewport, and page teardown dismiss the seated nudge', async () => {
  for (const action of ['lost seat', 'small viewport', 'pagehide']) {
    const ui = setup({ deferStandUp: true });
    ui.world.sitAt(ui.jobs[0].id);
    ui.node('panel-close').fire('click');
    assert.equal(ui.node('seated-nudge').hidden, false);
    if (action === 'lost seat') ui.presenceConfig.onSeatLost();
    else if (action === 'small viewport') { ui.viewport.matches = false; ui.viewport.fire('change'); }
    else ui.window.fire('pagehide');
    await flush();
    assert.equal(ui.node('seated-nudge').hidden, true, action);
  }
});

test('a stale successful claim after viewport restart releases only its old presence and cannot clear the new chair request', async () => {
  let finishOldClaim;
  const ui = setup({ claimSeat: (id, provider) => provider.id === 'visitor-test-0'
    ? new Promise(resolve => { finishOldClaim = resolve; }) : true });
  const oldWorld = ui.fixture.world, oldPresence = ui.fixture.presences[0];
  oldWorld.config.onSeatRequest(ui.jobs[0]);
  await flush();
  assert.equal(typeof finishOldClaim, 'function');
  ui.viewport.matches = false; ui.viewport.fire('change');
  ui.viewport.matches = true; ui.viewport.fire('change');
  const newWorld = ui.fixture.world, newPresence = ui.fixture.presences[1];
  assert.notEqual(newWorld, oldWorld);
  assert.notEqual(newPresence, oldPresence);
  newWorld.config.onSeatRequest(ui.jobs[1]);
  await flush();
  assert.equal(newWorld.getPlayerState().seatedJobId, ui.jobs[1].id, 'a new lifecycle is not blocked behind an obsolete claim');
  const newClearCount = newWorld.calls.filter(([type]) => type === 'clearSeatRequest').length;
  finishOldClaim(true);
  await flush();
  assert.equal(oldPresence.calls.filter(([type]) => type === 'releaseSeat').length, 1);
  assert.equal(newPresence.calls.filter(([type]) => type === 'releaseSeat').length, 0);
  assert.equal(newWorld.calls.filter(([type]) => type === 'clearSeatRequest').length, newClearCount);
  assert.equal(newWorld.getPlayerState().seatedJobId, ui.jobs[1].id);
  assert.equal(ui.node('opportunity-panel').hidden, false);
  assert.equal(ui.fixture.activeJob, ui.jobs[1].id);
});

test('destroying a pending rise allows a fresh world to claim and ignores old completion or presence callbacks', async () => {
  const ui = setup({ deferStandUp: true });
  const oldWorld = ui.fixture.world, oldPresence = ui.fixture.presences[0];
  oldWorld.sitAt(ui.jobs[0].id);
  ui.applicationConfig.onLeave();
  const oldExit = oldWorld.standUp();
  ui.viewport.matches = false; ui.viewport.fire('change');
  assert.equal(await oldExit, false, 'destroy cancels the old visual transition');
  ui.viewport.matches = true; ui.viewport.fire('change');
  const newWorld = ui.fixture.world, newPresence = ui.fixture.presences[1];
  newWorld.config.onSeatRequest(ui.jobs[1]);
  await flush();
  assert.equal(newWorld.getPlayerState().seatedJobId, ui.jobs[1].id);
  oldWorld.config.onStandUp(ui.jobs[0].id, 'movement');
  oldPresence.config.onSeatLost();
  oldWorld.config.onSeatReady(ui.jobs[0]);
  await flush();
  assert.equal(newPresence.calls.filter(([type]) => type === 'releaseSeat').length, 0);
  assert.equal(newWorld.getPlayerState().seatedJobId, ui.jobs[1].id);
  assert.equal(ui.fixture.activeJob, ui.jobs[1].id);
  assert.equal(ui.node('opportunity-panel').hidden, false);
  assert.equal(ui.node('seated-nudge').hidden, true);
});
