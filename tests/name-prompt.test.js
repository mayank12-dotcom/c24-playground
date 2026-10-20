import assert from 'node:assert/strict';
import test from 'node:test';
import { createNamePrompt } from '../src/name-prompt.js';
import { VISITOR_NAME_STORAGE_KEY } from '../src/visitor-profile.js';

class Target {
  constructor(document) { this.document = document; this.listeners = new Map(); this.attributes = new Map(); this.inert = false; this.value = ''; this.open = false; this.showCount = 0; this.textContent = ''; }
  addEventListener(type, fn) { this.listeners.set(type, [...this.listeners.get(type) || [], fn]); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== fn)); }
  fire(type, options = {}) {
    const event = { defaultPrevented: false, propagationStopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.propagationStopped = true; }, ...options };
    for (const fn of this.listeners.get(type) || []) fn(event);
    return event;
  }
  setAttribute(name, value) { this.attributes.set(name, value); if (name === 'open') this.open = true; }
  removeAttribute(name) { this.attributes.delete(name); if (name === 'open') this.open = false; }
  focus() { this.document.activeElement = this; }
  showModal() { this.open = true; this.showCount++; }
  close() { this.open = false; this.fire('close'); }
  set innerHTML(value) { throw new Error(`Visitor data cannot be inserted as HTML: ${value}`); }
}

function setup({ cached = null, desktop = true, deniedStorage = false, fallback = false, onComplete = () => {} } = {}) {
  const document = { activeElement: null };
  const elements = Object.fromEntries(['dialog', 'form', 'input', 'submit', 'error'].map(name => [name, new Target(document)]));
  const ids = Object.fromEntries(Object.entries(elements).map(([name, element]) => [`visitor-name-${name}`, element]));
  const workspace = new Target(document), originalFocus = new Target(document);
  document.activeElement = originalFocus;
  document.getElementById = id => ids[id];
  document.querySelector = selector => selector === '.workspace' ? workspace : null;
  const mediaQuery = new Target(document);
  mediaQuery.matches = desktop;
  const values = new Map(cached === null ? [] : [[VISITOR_NAME_STORAGE_KEY, cached]]);
  const window = { localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  if (deniedStorage) Object.defineProperty(window, 'localStorage', { get() { throw new Error('SecurityError'); } });
  if (fallback) { elements.dialog.showModal = undefined; elements.dialog.close = undefined; }
  const api = createNamePrompt({ document, window, mediaQuery, onComplete });
  return { api, ...elements, workspace, originalFocus, document, mediaQuery, values };
}

test('first visit opens a modal, focuses the labeled input, and blocks the world', () => {
  const ui = setup();
  assert.equal(ui.api.getName(), null);
  assert.equal(ui.dialog.open, false, 'construction does not unexpectedly open the dialog');
  assert.equal(ui.api.open(), true);
  assert.equal(ui.dialog.open, true);
  assert.equal(ui.workspace.inert, true);
  assert.equal(ui.document.activeElement, ui.input);
  assert.equal(ui.api.open(), false);
  assert.equal(ui.dialog.showCount, 1);
});

test('invalid submission stays modal with a readable error until a valid name is submitted once', () => {
  const completed = [];
  const ui = setup({ onComplete: name => {
    assert.equal(ui.dialog.open, false);
    assert.equal(ui.workspace.inert, false);
    completed.push(name);
  } });
  ui.api.open();
  ui.input.value = ' \t\n ';
  const event = ui.form.fire('submit');
  assert.equal(event.defaultPrevented, true);
  assert.equal(ui.dialog.open, true);
  assert.equal(ui.input.attributes.get('aria-invalid'), 'true');
  assert.match(ui.error.textContent, /enter your name/i);
  ui.input.value = '  Amina   山田 ';
  ui.input.fire('input');
  assert.equal(ui.error.textContent, '');
  assert.equal(ui.input.attributes.has('aria-invalid'), false);
  ui.form.fire('submit');
  assert.equal(ui.api.getName(), 'Amina 山田');
  assert.equal(ui.values.get(VISITOR_NAME_STORAGE_KEY), 'Amina 山田');
  assert.equal(ui.input.value, 'Amina 山田');
  assert.equal(ui.submit.disabled, true);
  assert.deepEqual(completed, ['Amina 山田']);
  ui.form.fire('submit');
  ui.api.open();
  ui.mediaQuery.fire('change');
  assert.deepEqual(completed, ['Amina 山田']);
  assert.equal(ui.dialog.open, false);
});

test('cached names bypass the popup and never invoke its completion callback', () => {
  const completed = [];
  const ui = setup({ cached: '  Leo  ', onComplete: name => completed.push(name) });
  assert.equal(ui.api.getName(), 'Leo');
  assert.equal(ui.api.open(), false);
  ui.mediaQuery.fire('change');
  assert.equal(ui.dialog.open, false);
  assert.equal(ui.workspace.inert, false);
  assert.deepEqual(completed, []);
});

test('small screens show no prompt and resizing keeps an incomplete introduction ready on desktop', () => {
  const ui = setup({ desktop: false });
  assert.equal(ui.api.open(), false);
  assert.equal(ui.workspace.inert, false);
  ui.mediaQuery.matches = true;
  ui.mediaQuery.fire('change');
  assert.equal(ui.dialog.open, true);
  ui.input.value = 'Draft name';
  ui.mediaQuery.matches = false;
  ui.mediaQuery.fire('change');
  assert.equal(ui.dialog.open, false);
  assert.equal(ui.workspace.inert, false);
  ui.form.fire('submit');
  assert.equal(ui.api.getName(), null, 'a hidden form cannot submit during the smaller-screen notice');
  ui.mediaQuery.matches = true;
  ui.mediaQuery.fire('change');
  assert.equal(ui.dialog.open, true);
  assert.equal(ui.input.value, 'Draft name');
});

test('Escape cannot bypass the prompt and keyboard focus remains inside the form', () => {
  const ui = setup();
  ui.api.open();
  assert.equal(ui.dialog.fire('cancel').defaultPrevented, true);
  const escape = ui.dialog.fire('keydown', { key: 'Escape' });
  assert.equal(escape.defaultPrevented, true);
  assert.equal(escape.propagationStopped, true);
  assert.equal(ui.dialog.open, true);
  ui.dialog.fire('keydown', { key: 'Tab', shiftKey: true });
  assert.equal(ui.document.activeElement, ui.submit);
  ui.dialog.fire('keydown', { key: 'Tab' });
  assert.equal(ui.document.activeElement, ui.input);
  ui.dialog.close();
  assert.equal(ui.dialog.open, true, 'an unsolicited close cannot skip naming');
});

test('storage denial still lets the visitor enter and retains the name for the current visit', () => {
  const completed = [];
  const ui = setup({ deniedStorage: true, onComplete: name => completed.push(name) });
  ui.api.open();
  ui.input.value = 'Visitor';
  ui.form.fire('submit');
  assert.equal(ui.api.getName(), 'Visitor');
  assert.deepEqual(completed, ['Visitor']);
  assert.equal(ui.dialog.open, false);
});

test('names remain text even when they contain HTML-like characters, and Unicode editing is not interrupted', () => {
  const ui = setup();
  ui.api.open();
  ui.input.value = '<img src=x onerror=alert(1)>';
  ui.form.fire('submit');
  assert.equal(ui.api.getName(), '<img src=x onerror=alert(1)>');
  const composing = setup();
  composing.api.open();
  composing.input.value = '😀'.repeat(35);
  composing.input.fire('input', { isComposing: true });
  assert.equal(Array.from(composing.input.value).length, 35, 'normalization waits for submit instead of breaking IME editing');
  composing.form.fire('submit');
  assert.equal(Array.from(composing.api.getName()).length, 32);
});

test('fallback modal blocks background controls, and destroy restores focus and removes behavior', () => {
  const ui = setup({ fallback: true });
  ui.api.open();
  assert.equal(ui.dialog.open, true);
  assert.equal(ui.workspace.inert, true);
  ui.api.destroy();
  assert.equal(ui.dialog.open, false);
  assert.equal(ui.workspace.inert, false);
  assert.equal(ui.document.activeElement, ui.originalFocus);
  ui.input.value = 'No longer active';
  ui.form.fire('submit');
  ui.mediaQuery.fire('change');
  assert.equal(ui.api.getName(), null);
  assert.equal(ui.api.open(), false);
  ui.api.destroy();
});
