import assert from 'node:assert/strict';
import test from 'node:test';
import { createFloatingPanel } from '../src/panels.js';

class Target {
  constructor(document) { this.ownerDocument = document; this.listeners = new Map(); this.attributes = {}; }
  addEventListener(type, listener) { this.listeners.set(type, [...this.listeners.get(type) || [], listener]); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== listener)); }
  fire(type, event = {}) { for (const listener of this.listeners.get(type) || []) listener(event); }
  setAttribute(name, value) { this.attributes[name] = value; }
  contains(node) { return node === this || node?.parent === this; }
  focus() { this.ownerDocument.activeElement = this; }
}

function setup(onChange, onDismiss) {
  const document = new Target();
  const panel = new Target(document), toggle = new Target(document), close = new Target(document);
  panel.id = 'opportunity-panel';
  close.parent = panel;
  const api = createFloatingPanel({ panel, toggle, close, onChange, onDismiss });
  return { document, panel, toggle, close, api };
}

test('panel reports opening and closing through direct calls, FAB, close button, and Escape', () => {
  const changes = [];
  const ui = setup(open => changes.push(open));
  assert.deepEqual(changes, [false]);
  ui.api.open();
  ui.close.fire('click');
  ui.toggle.fire('click');
  ui.document.fire('keydown', { key: 'Escape' });
  ui.toggle.fire('click');
  ui.toggle.fire('click');
  ui.api.open();
  ui.api.close();
  assert.deepEqual(changes, [false, true, false, true, false, true, false, true, false]);
  assert.equal(ui.panel.hidden, true);
  assert.equal(ui.toggle.attributes['aria-expanded'], 'false');
});

test('panel is persistent, moves focus on request, and removes listeners on teardown', () => {
  const changes = [];
  const ui = setup(open => changes.push(open));
  const draft = { text: 'My unsent answer' };
  ui.panel.currentContent = draft;
  ui.api.open({ focus: true });
  assert.equal(ui.document.activeElement, ui.close);
  ui.close.fire('click');
  assert.equal(ui.document.activeElement, ui.toggle);
  ui.api.open();
  assert.equal(ui.panel.currentContent, draft);
  ui.api.destroy();
  const count = changes.length;
  ui.document.fire('keydown', { key: 'Escape' });
  ui.close.fire('click');
  ui.toggle.fire('click');
  assert.equal(changes.length, count);
  assert.equal(ui.panel.hidden, false);
});

test('a visible panel reports each deliberate X, FAB, and Escape dismissal once with the original event', () => {
  const dismissed = [];
  let ui;
  ui = setup(undefined, event => {
    assert.equal(ui.api.isOpen(), false, 'the dismissal notification follows the actual close');
    dismissed.push(event);
  });
  const x = { type: 'click', target: ui.close };
  const fab = { type: 'click', target: ui.toggle };
  const escape = { type: 'keydown', key: 'Escape', target: ui.panel };
  assert.deepEqual(dismissed, [], 'initial state is silent');
  ui.api.open({ focus: true });
  assert.deepEqual(dismissed, [], 'opening is silent');
  ui.close.fire('click', x);
  assert.equal(ui.document.activeElement, ui.toggle, 'the existing X focus restoration is preserved');
  ui.close.fire('click', x);
  ui.document.fire('keydown', escape);
  assert.deepEqual(dismissed, [x], 'hidden controls and repeated Escape cannot sound');
  ui.toggle.fire('click', fab);
  assert.equal(ui.api.isOpen(), true);
  assert.deepEqual(dismissed, [x], 'the FAB opening action is silent');
  ui.toggle.fire('click', fab);
  ui.api.open({ focus: true });
  ui.document.fire('keydown', escape);
  assert.equal(ui.document.activeElement, ui.toggle, 'Escape keeps the existing focus rule');
  assert.deepEqual(dismissed, [x, fab, escape]);
  assert.equal(dismissed[0], x);
  assert.equal(dismissed[1], fab);
  assert.equal(dismissed[2], escape);
});

test('programmatic close, toggle, and destruction never report a user dismissal', () => {
  const dismissed = [];
  const ui = setup(undefined, event => dismissed.push(event));
  ui.api.close();
  ui.api.open();
  ui.api.close({ restoreFocus: true });
  ui.api.toggle();
  ui.api.toggle();
  ui.api.open();
  ui.api.destroy();
  ui.close.fire('click', { type: 'click' });
  ui.toggle.fire('click', { type: 'click' });
  ui.document.fire('keydown', { type: 'keydown', key: 'Escape' });
  assert.deepEqual(dismissed, []);
});

test('a caller can explicitly identify a navigation dismissal without changing normal close semantics', () => {
  const dismissed = [];
  const ui = setup(undefined, event => dismissed.push(event));
  const navigationClick = { type: 'click', target: { id: 'info-room-toggle' } };
  ui.api.close({ dismissEvent: navigationClick });
  assert.deepEqual(dismissed, [], 'a hidden panel has nothing to dismiss');
  ui.api.open();
  ui.api.close({ dismissEvent: navigationClick });
  ui.api.close({ dismissEvent: navigationClick });
  assert.deepEqual(dismissed, [navigationClick]);
  assert.equal(dismissed[0], navigationClick);
  ui.api.open();
  ui.api.close();
  assert.equal(dismissed.length, 1, 'the optional marker does not make later automatic closes audible');
});
