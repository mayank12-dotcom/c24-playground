import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../src/recruiter-controls.js', import.meta.url), 'utf8'))
  .replace(/^import '\.\/recruiter-controls\.css';\n/, '');
const { createRecruiterControls } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback, capture) {
    this.listeners.set(type, [...this.listeners.get(type) || [], { callback, capture }]);
  }
  removeEventListener(type, callback, capture) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item.callback !== callback || item.capture !== capture));
  }
  fire(type, event = {}) { return (this.listeners.get(type) || []).map(item => item.callback(event)); }
}
class Node extends Target {
  constructor(tag, doc) {
    super(); this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = [];
    this.attributes = {}; this.className = ''; this.hidden = false; this.writes = 0;
  }
  append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  set textContent(text) { this.text = text; this.writes++; }
  get textContent() { return this.text || ''; }
  all() { return this.children.flatMap(node => [node, ...node.all()]); }
  contains(target) { return target === this || this.all().includes(target); }
  querySelector(selector) {
    return this.all().find(node => selector === 'canvas' ? node.tagName === 'CANVAS' : node.className.split(' ').includes(selector.slice(1)));
  }
  focus() { this.ownerDocument.activeElement = this; this.focusCalls = (this.focusCalls || 0) + 1; }
  remove() { this.parentNode.children = this.parentNode.children.filter(node => node !== this); }
}
function fixture(callbacks = {}) {
  const win = new Target(), doc = new Target(), desktop = new Target();
  desktop.matches = true;
  win.matchMedia = () => desktop;
  doc.defaultView = win; doc.visibilityState = 'visible'; doc.modals = [];
  doc.querySelectorAll = () => doc.modals;
  doc.createElement = tag => new Node(tag, doc);
  const container = new Node('main', doc), canvas = new Node('canvas', doc);
  container.append(canvas); doc.activeElement = canvas;
  const attacks = [], departures = [], dismissals = [];
  const api = createRecruiterControls({ container, onAttack: type => attacks.push(type),
    onDisengage: () => departures.push(true), onDismiss: event => dismissals.push(event), ...callbacks });
  const find = name => container.querySelector(`.recruiter-controls${name ? '-'+name : ''}`);
  const buttons = () => find('actions').children;
  const event = (key, extra = {}) => ({ key, code: '', target: canvas, repeat: false, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...extra });
  return { api, win, doc, desktop, container, canvas, attacks, departures, dismissals, find, buttons,
    key(key, extra) { const value = event(key, extra); win.fire('keydown', value); return value; },
    up(key, extra) { win.fire('keyup', event(key, extra)); },
  };
}
const fighting = { stage: 'fighting', localPlayer: true, playerHealth: 100, recruiterHealth: 100, encounterId: 'round-1' };

test('walking nearby introduces J/K immediately without a click, bump or focus change', () => {
  const ui = fixture();
  assert.equal(ui.api.isOpen(), false);
  assert.equal(ui.key('j').defaultPrevented, false);
  ui.api.update({ stage: 'nearby', localPlayer: true });
  assert.match(ui.find('status').textContent, /Press J to punch or K to kick/);
  assert.match(ui.find('hint').textContent, /No bumping or clicking needed/);
  assert.equal(ui.find('actions').hidden, false);
  assert.equal(ui.buttons()[0].disabled, false);
  assert.equal(ui.buttons()[1].disabled, false);
  assert.equal(ui.find('health').hidden, true);
  assert.equal(ui.key('j').defaultPrevented, true);
  ui.api.update({ stage: 'nearby' });
  ui.key('j');
  assert.deepEqual(ui.attacks, ['punch'], 'repeated proximity frames do not re-arm a held key');
  ui.up('j'); ui.key('k');
  assert.deepEqual(ui.attacks, ['punch', 'kick']);
  ui.api.update({ stage: 'idle' });
  assert.equal(ui.api.isOpen(), false, 'leaving proximity removes the hint');
  assert.equal(ui.doc.activeElement, ui.canvas);
  assert.equal(ui.container.all().some(node => node.focusCalls), false);
  ui.api.dispose();
});

test('J and K accept fresh local presses once, leave movement alone, and share the button callbacks', () => {
  const ui = fixture(); ui.api.update(fighting);
  const punch = ui.key('j');
  assert.equal(punch.defaultPrevented, true); assert.equal(punch.stopped, true);
  ui.key('j'); ui.key('j', { repeat: true });
  assert.deepEqual(ui.attacks, ['punch']);
  ui.up('j'); ui.key('j');
  ui.key('k'); ui.up('k'); ui.key('x', { code: 'KeyK' });
  assert.deepEqual(ui.attacks, ['punch', 'punch', 'kick', 'kick']);
  const movement = ui.key('w');
  assert.equal(movement.defaultPrevented, false); assert.equal(movement.stopped, undefined);
  ui.buttons()[0].fire('click', { target: ui.buttons()[0] });
  ui.buttons()[1].fire('click', { target: ui.buttons()[1] });
  assert.deepEqual(ui.attacks.slice(-2), ['punch', 'kick']);
  assert.equal(ui.doc.activeElement, ui.canvas);
  ui.api.dispose();
});

test('J/K stay available through provocation, falling, ground contact, recovery and approach', () => {
  const ui = fixture();
  const stages = ['nearby', 'provoking', 'falling', 'grounded', 'recovering', 'approaching', 'fighting'];
  for (const stage of stages) {
    ui.api.update({ ...fighting, stage });
    assert.equal(ui.find('actions').hidden, false, `${stage} shows direct attack controls`);
    assert.equal(ui.key('j').defaultPrevented, true, `J remains available during ${stage}`);
    ui.up('j');
    assert.equal(ui.key('k').defaultPrevented, true, `K remains available during ${stage}`);
    ui.up('k');
  }
  assert.deepEqual(ui.attacks, stages.flatMap(() => ['punch', 'kick']));
  ui.api.dispose();
});

test('L and its button require slam readiness with a standing target and one fresh press', () => {
  const ui = fixture(); ui.api.update({ ...fighting, slamReady: false, slamHits: 2 });
  assert.equal(ui.key('l').defaultPrevented, false);
  ui.buttons()[2].fire('click', {});
  assert.equal(ui.buttons()[2].disabled, true);
  assert.deepEqual(ui.attacks, []);
  ui.api.update({ slamReady: true, slamHits: 3 });
  assert.equal(ui.buttons()[2].disabled, false);
  assert.equal(ui.key('l').defaultPrevented, true);
  ui.key('l'); ui.key('l', { repeat: true });
  assert.deepEqual(ui.attacks, ['slam']);
  ui.up('l'); ui.key('x', { code: 'KeyL' });
  ui.buttons()[2].fire('click', {});
  assert.deepEqual(ui.attacks, ['slam', 'slam', 'slam']);
  ui.up('l'); ui.api.update({ slamReady: false });
  assert.equal(ui.key('l').defaultPrevented, false);
  assert.equal(ui.buttons()[2].disabled, true);
  for (const stage of ['nearby', 'provoking', 'falling', 'grounded', 'recovering']) {
    ui.api.update({ stage, slamReady: true });
    assert.equal(ui.key('l').defaultPrevented, false, `L does not slam a non-standing target during ${stage}`);
  }
  assert.deepEqual(ui.attacks, ['slam', 'slam', 'slam']);
  ui.api.update({ stage: 'approaching', slamReady: true });
  assert.equal(ui.key('l').defaultPrevented, true);
  assert.equal(ui.attacks.at(-1), 'slam');
  ui.api.dispose();
});

test('slam readiness describes hit progress and the shared-clock cooldown without changing live status', () => {
  const ui = fixture();
  ui.api.update({ ...fighting, slamHits: 1, slamReady: false, slamReadyAt: 4500, now: 1000 });
  assert.match(ui.find('special').textContent, /4s cooldown.*1\/3 hits/);
  const statusWrites = ui.find('status').writes;
  ui.api.update({ now: 2000 });
  assert.match(ui.find('special').textContent, /3s cooldown/);
  ui.api.update({ now: 5000, slamHits: 2 });
  assert.match(ui.find('special').textContent, /2\/3 hits/);
  ui.api.update({ slamHits: 3 });
  assert.match(ui.find('special').textContent, /Make a little room/);
  assert.equal(ui.buttons()[2].disabled, true, 'three hits alone do not bypass the world landing preflight');
  ui.api.update({ slamReady: true });
  assert.equal(ui.find('special').textContent, 'Choke slam ready · L');
  assert.equal(ui.find('special').getAttribute('data-ready'), 'true');
  assert.equal(ui.buttons()[2].disabled, false);
  assert.equal(ui.find('status').writes, statusWrites, 'cooldown and hit updates do not repeat the stage announcement');
  ui.api.update({ slamReady: false, slamHits: 0, slamReadyAt: 8000 });
  assert.match(ui.find('special').textContent, /3s cooldown.*0\/3 hits/);
  ui.api.dispose();
});

test('health remains visible through active stages while slamming and return hide attack controls', () => {
  const ui = fixture();
  for (const stage of ['provoking', 'falling', 'grounded', 'recovering', 'approaching', 'fighting', 'slamming', 'returning']) {
    ui.api.update({ ...fighting, stage, playerHealth: 80, recruiterHealth: 65, slamReady: true });
    assert.equal(ui.find('health').hidden, false, `health stays visible during ${stage}`);
    assert.equal(ui.find('health').textContent, 'You 80 · Recruiter 65');
  }
  for (const stage of ['slamming', 'returning']) {
    ui.api.update({ ...fighting, stage, slamReady: true });
    assert.equal(ui.find('actions').hidden, true);
    assert.equal(ui.find('special').hidden, true);
    for (const key of ['j', 'k', 'l']) assert.equal(ui.key(key).defaultPrevented, false);
    ui.buttons().slice(0, 3).forEach(button => button.fire('click', {}));
  }
  assert.deepEqual(ui.attacks, []);
  assert.equal(ui.key('Escape').defaultPrevented, false, 'returning is already disengaged');
  ui.api.update({ stage: 'slamming' });
  assert.equal(ui.key('Escape').defaultPrevented, true, 'the world can safely queue disengagement during a slam');
  assert.deepEqual(ui.departures, [true]);
  ui.api.dispose();
});

test('editable fields, modifier shortcuts, composition and already handled events retain their normal behavior', () => {
  const ui = fixture(); ui.api.update({ ...fighting, slamReady: true });
  const suppressed = [
    { target: { tagName: 'INPUT' } }, { target: { tagName: 'TEXTAREA' } }, { target: { tagName: 'SELECT' } },
    { target: { isContentEditable: true } }, { target: { closest: () => ({}) } },
    { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true }, { isComposing: true },
    { keyCode: 229 }, { defaultPrevented: true }, { repeat: true },
  ];
  for (const options of suppressed) {
    const e = ui.key('j', options);
    assert.equal(e.stopped, undefined);
    ui.key('l', options);
    ui.key('Escape', options);
  }
  assert.deepEqual(ui.attacks, []); assert.deepEqual(ui.departures, []);
  ui.api.dispose();
});

test('spectators see status but cannot attack or disengage somebody else’s encounter', () => {
  const ui = fixture(); ui.api.update({ ...fighting, localPlayer: false, slamReady: true });
  assert.equal(ui.api.isOpen(), true);
  assert.match(ui.find('status').textContent, /Another visitor/);
  assert.equal(ui.find('actions').hidden, true);
  for (const key of ['j', 'k', 'l', 'Escape']) assert.equal(ui.key(key).defaultPrevented, false);
  ui.buttons().forEach(button => button.fire('click', {}));
  assert.deepEqual(ui.attacks, []); assert.deepEqual(ui.departures, []);
  ui.api.dispose();
});

test('X hides the toast without ending combat, and later pose or health updates do not reopen it', () => {
  const ui = fixture(); ui.api.update(fighting);
  const close = ui.find('close'), click = { type: 'click', target: close };
  ui.doc.activeElement = close;
  close.fire('click', click);
  assert.equal(ui.api.isOpen(), false); assert.deepEqual(ui.departures, []);
  assert.deepEqual(ui.dismissals, [click]); assert.equal(ui.doc.activeElement, ui.canvas);
  ui.api.update({ stage: 'fighting', playerHealth: 80 });
  assert.equal(ui.api.isOpen(), false);
  ui.key('j'); assert.deepEqual(ui.attacks, ['punch']);
  ui.api.update({ slamReady: true }); ui.key('l');
  assert.deepEqual(ui.attacks, ['punch', 'slam'], 'a hidden toast retains an unlocked slam shortcut');
  ui.api.update({ stage: 'returning' }); assert.equal(ui.api.isOpen(), false);
  close.fire('click', click); assert.deepEqual(ui.dismissals, [click]);
  ui.api.update({ stage: 'seated' }); ui.api.update({ ...fighting, encounterId: 'round-2' });
  assert.equal(ui.api.isOpen(), true);
  ui.api.dispose();
});

test('a dismissed proximity hint still starts from J and reintroduces controls when provocation begins', () => {
  const ui = fixture(); ui.api.update({ stage: 'nearby', localPlayer: true });
  ui.find('close').fire('click', {}); assert.equal(ui.api.isOpen(), false);
  ui.api.update({ stage: 'nearby' }); assert.equal(ui.api.isOpen(), false);
  ui.key('j'); assert.deepEqual(ui.attacks, ['punch']);
  ui.api.update({ stage: 'provoking' }); assert.equal(ui.api.isOpen(), true);
  ui.find('close').fire('click', {});
  ui.api.update({ stage: 'recovering' }); ui.api.update({ stage: 'fighting' });
  assert.equal(ui.api.isOpen(), false);
  ui.api.dispose();
});

test('an explicit null message clears a blocked-path notice without requiring a stage change', () => {
  for (const [stage, fallback] of [['falling', /taking a tumble/], ['returning', /heading back/]]) {
    const ui = fixture();
    const blockedMessage = 'Another visitor is in the way. Waiting for a clear path.';
    ui.api.update({ ...fighting, stage, message: blockedMessage });
    assert.equal(ui.find('status').textContent, blockedMessage);
    ui.api.update({ stage, message: null });
    assert.match(ui.find('status').textContent, fallback,
      `${stage} resumes its ordinary description when the same-stage waiting message is cleared`);
    assert.equal(ui.find('status').textContent.includes('Waiting for a clear path'), false);
    ui.api.dispose();
  }
});

test('Escape or the explicit leave button disengages once and does not imply a toast dismissal', () => {
  const ui = fixture(); ui.api.update(fighting);
  const escape = ui.key('Escape');
  assert.equal(escape.defaultPrevented, true);
  ui.key('Escape'); ui.buttons()[3].fire('click', {});
  assert.deepEqual(ui.departures, [true]); assert.deepEqual(ui.dismissals, []);
  ui.api.update({ stage: 'returning' }); ui.api.update({ ...fighting, encounterId: 'round-2' });
  ui.buttons()[3].fire('click', {});
  assert.deepEqual(ui.departures, [true, true]);
  ui.api.dispose();
});

test('Escape closes the existing help or opportunity popup before it can end a fight', () => {
  for (const id of ['controls-help', 'opportunity-panel']) {
    const ui = fixture(); ui.api.update(fighting);
    const popup = new Node('section', ui.doc);
    ui.doc.getElementById = name => name === id ? popup : null;
    const openEscape = ui.key('Escape');
    assert.equal(openEscape.defaultPrevented, false, `${id} retains its document-level Escape handler`);
    assert.equal(openEscape.stopped, undefined);
    assert.deepEqual(ui.departures, []);
    ui.key('j');
    assert.deepEqual(ui.attacks, ['punch'], 'the popup Escape priority does not suppress J/K');
    popup.hidden = true;
    const closedEscape = ui.key('Escape');
    assert.equal(closedEscape.defaultPrevented, true);
    assert.deepEqual(ui.departures, [true], 'a later press can leave once the popup has closed');
    ui.api.dispose();
  }
  for (const suppressed of ['inert', 'aria-hidden']) {
    const ui = fixture(); ui.api.update(fighting);
    const popup = new Node('section', ui.doc);
    if (suppressed === 'inert') popup.inert = true;
    else popup.setAttribute('aria-hidden', 'true');
    ui.doc.getElementById = name => name === 'opportunity-panel' ? popup : null;
    assert.equal(ui.key('Escape').defaultPrevented, true, `${suppressed} popups do not consume an extra Escape`);
    assert.deepEqual(ui.departures, [true]);
    ui.api.dispose();
  }
});

test('hidden pages, smaller screens, inert ancestors and modal dialogs suspend keyboard and button attacks', () => {
  const ui = fixture(); ui.api.update(fighting);
  const click = () => ui.buttons()[0].fire('click', {});
  ui.doc.hidden = true; ui.doc.fire('visibilitychange');
  assert.equal(ui.api.isOpen(), false); ui.key('j'); click();
  ui.doc.hidden = false; ui.doc.visibilityState = 'hidden'; ui.key('j'); click();
  ui.doc.visibilityState = 'visible'; ui.desktop.matches = false; ui.desktop.fire('change');
  assert.equal(ui.api.isOpen(), false); ui.key('j'); click();
  ui.desktop.matches = true; ui.container.inert = true; ui.key('j'); click();
  ui.container.inert = false;
  const dialog = new Node('dialog', ui.doc); ui.doc.modals = [dialog]; ui.key('j'); click();
  assert.deepEqual(ui.attacks, []);
  dialog.hidden = true; ui.doc.fire('visibilitychange'); ui.key('j');
  assert.deepEqual(ui.attacks, ['punch']);
  ui.api.dispose();
});

test('held-key latches clear on blur or visibility suspension, without announcing unchanged live status on health updates', () => {
  const ui = fixture(); ui.api.update(fighting);
  const writes = ui.find('status').writes;
  ui.api.update({ playerHealth: 90 }); ui.api.update({ playerHealth: 80 });
  assert.equal(ui.find('status').writes, writes);
  assert.equal(ui.find('health').textContent, 'You 80 · Recruiter 100');
  ui.key('j'); ui.win.fire('blur'); ui.key('j');
  ui.doc.hidden = true; ui.doc.fire('visibilitychange'); ui.doc.hidden = false; ui.doc.fire('visibilitychange');
  ui.key('j');
  assert.deepEqual(ui.attacks, ['punch', 'punch', 'punch']);
  ui.api.dispose();
});

test('reset and disposal are silent, remove exact listeners, and prevent old nodes or events from invoking callbacks', () => {
  const ui = fixture(); ui.api.update(fighting); const nodes = [...ui.buttons(), ui.find('close')];
  ui.api.reset(); assert.equal(ui.api.isOpen(), false);
  assert.deepEqual(ui.dismissals, []); assert.deepEqual(ui.departures, []);
  ui.api.update(fighting); ui.api.dispose(); ui.api.dispose();
  for (const type of ['keydown', 'keyup', 'blur']) assert.equal(ui.win.listeners.get(type).length, 0);
  assert.equal(ui.doc.listeners.get('visibilitychange').length, 0);
  assert.equal(ui.desktop.listeners.get('change').length, 0);
  assert.equal(ui.container.children.length, 1, 'only the existing world canvas remains');
  nodes.forEach(node => node.fire('click', {})); ui.key('j'); ui.key('Escape');
  ui.api.update(fighting); ui.api.reset();
  assert.equal(ui.api.isOpen(), false);
  assert.deepEqual(ui.attacks, []); assert.deepEqual(ui.dismissals, []); assert.deepEqual(ui.departures, []);
});
