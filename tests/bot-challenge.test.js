import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

// Node has no CSS loader. Exercise the unchanged component logic with its CSS import omitted.
const source = (await readFile(new URL('../src/bot-challenge.js', import.meta.url), 'utf8'))
  .replace(/^import '\.\/bot-challenge\.css';\n/, '');
const { createBotChallenge } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

class EventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(handler);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, handler) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(value => value !== handler));
  }
  fire(type, event = {}) { return (this.listeners.get(type) || []).map(handler => handler(event)); }
}

class Node extends EventTarget {
  constructor(tagName, document) {
    super(); this.tagName = tagName.toUpperCase(); this.ownerDocument = document;
    this.children = []; this.attributes = {}; this.className = ''; this.hidden = false;
  }
  append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = value; }
  remove() { this.parentNode.children = this.parentNode.children.filter(node => node !== this); }
  all() { return this.children.flatMap(child => [child, ...child.all()]); }
  querySelector(selector) { return this.all().find(node => node.className.split(' ').includes(selector.slice(1))); }
  focus() { this.focused = true; }
}

function setup(callbacks = {}) {
  const keyboard = new EventTarget();
  const document = { defaultView: keyboard };
  document.createElement = tag => new Node(tag, document);
  const container = new Node('main', document);
  const challenge = createBotChallenge({ container, onHit: async job => ({ jobId: job.id, hits: 1, required: 1, won: false }), ...callbacks });
  return {
    challenge, container, keyboard,
    button: () => container.querySelector('.bot-challenge-hit'),
    status: () => container.querySelector('.bot-challenge-status').textContent,
    dots: () => container.all().filter(node => node.className.includes('bot-challenge-dot ') && node.className.includes('is-complete')).length,
    click: () => container.querySelector('.bot-challenge-hit').fire('click')[0],
    key(key, options = {}) {
      const event = { key, target: container, repeat: false, prevented: false, stopped: false,
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...options };
      keyboard.fire('keydown', event);
      return event;
    },
  };
}

const firstJob = { id: 'brand-designer', title: 'Brand Designer', company: 'Goodkind' };
const nextJob = { id: 'community-lead', title: 'Community Lead', company: 'Common Ground' };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('one deliberate push confirms the win and waits for the chair without taking focus', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  let strikes = 0; let calls = 0;
  const ui = setup({ onStrike: () => strikes++, onHit: async job => { calls++; return { jobId: job.id, hits: 1, required: 1, won: true }; } });
  assert.equal(ui.challenge.isOpen(), false);
  ui.challenge.open(firstJob);
  assert.equal(ui.challenge.getJobId(), firstJob.id);
  assert.equal(ui.status(), '0 of 1 push');
  assert.equal(ui.container.querySelector('.bot-challenge-heading').textContent, 'Push the bot to take this seat');
  assert.match(ui.container.querySelector('.bot-challenge-description').textContent, /tumbles off.*chair is clear/);
  assert.equal(ui.button().textContent, 'Push · Space');
  assert.equal(ui.container.all().some(node => node.focused), false);
  const key = ui.key(' ');
  await flush();
  assert.equal(key.prevented, true);
  assert.equal(key.stopped, true);
  assert.equal(ui.dots(), 1);
  assert.equal(strikes, 1);
  assert.match(ui.status(), /sit when the chair is clear/);
  assert.equal(ui.button().disabled, true);
  t.mock.timers.tick(1000);
  await ui.click(); ui.key(' ');
  assert.equal(calls, 1, 'a winning push never starts another request');
  ui.challenge.destroy();
});

test('duplicate clicks, held Space, editable fields, and in-flight requests cannot add pushes', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  let complete; let calls = 0; let strikes = 0;
  const ui = setup({ onStrike: () => strikes++, onHit: job => {
    calls++;
    if (calls === 1) return new Promise(resolve => { complete = resolve; });
    return Promise.resolve({ jobId: job.id, hits: 1, required: 1, won: true });
  } });
  ui.challenge.open(firstJob);
  ui.key(' ', { repeat: true });
  const editableEvent = ui.key(' ', { target: { tagName: 'TEXTAREA' } });
  assert.equal(editableEvent.prevented, false);
  const otherButtonEvent = ui.key(' ', { target: ui.container.querySelector('.bot-challenge-close') });
  assert.equal(otherButtonEvent.prevented, false, 'other controls keep their normal Space activation');
  assert.equal(calls, 0);
  const pending = ui.click();
  await ui.click(); ui.key(' ');
  t.mock.timers.tick(600);
  ui.key(' ');
  assert.equal(calls, 1);
  assert.equal(strikes, 1);
  assert.equal(ui.button().disabled, true);
  complete({ jobId: firstJob.id, hits: 0, required: 1, won: false, reason: 'too-far' });
  await pending;
  assert.equal(ui.button().disabled, false);
  ui.key(' '); await flush();
  assert.equal(calls, 2, 'a failed push allows a fresh deliberate attempt');
  ui.key(' ', { repeat: true }); await ui.click();
  assert.equal(calls, 2);
  assert.equal(strikes, 2);
  assert.equal(ui.button().disabled, true);
  ui.challenge.destroy();
});

test('switching tables ignores a late winning push and resets the next chair', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  let complete;
  const ui = setup({ onHit: job => job.id === firstJob.id
    ? new Promise(resolve => { complete = resolve; })
    : Promise.resolve({ jobId: job.id, hits: 1, required: 1, won: true }) });
  ui.challenge.open(firstJob);
  const oldHit = ui.click();
  ui.challenge.open(nextJob);
  assert.equal(ui.status(), '0 of 1 push');
  assert.equal(ui.button().disabled, false);
  complete({ jobId: firstJob.id, hits: 1, required: 1, won: true });
  await oldHit;
  assert.equal(ui.challenge.getJobId(), nextJob.id);
  assert.equal(ui.dots(), 0);
  assert.match(ui.container.querySelector('.bot-challenge-heading').textContent, /Push the bot/);
  await ui.click();
  assert.equal(ui.dots(), 1);
  ui.challenge.open(nextJob);
  assert.equal(ui.button().disabled, true, 'repeated proximity updates do not reset a confirmed win');
  ui.challenge.destroy();
});

test('user cancellation differs from programmatic close, rejects late results, and cleans up listeners', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  let cancels = 0; let complete;
  const ui = setup({ onCancel: () => cancels++, onHit: () => new Promise(resolve => { complete = resolve; }) });
  ui.challenge.open(firstJob);
  const pending = ui.click();
  const escape = ui.key('Escape');
  assert.equal(escape.prevented, true);
  assert.equal(escape.stopped, true);
  assert.equal(cancels, 1);
  assert.equal(ui.challenge.isOpen(), false);
  assert.equal(ui.challenge.getJobId(), null);
  complete({ jobId: firstJob.id, hits: 1, required: 1, won: true });
  await pending;
  assert.equal(ui.challenge.isOpen(), false);
  ui.key('Escape');
  assert.equal(cancels, 1);
  ui.challenge.open(nextJob);
  ui.challenge.close();
  assert.equal(cancels, 1);
  ui.challenge.open(nextJob);
  ui.container.querySelector('.bot-challenge-close').fire('click');
  assert.equal(cancels, 2);
  ui.challenge.destroy();
  assert.equal(ui.container.children.length, 0);
  assert.equal(ui.keyboard.listeners.get('keydown').length, 0);
  ui.challenge.open(firstJob);
  assert.equal(ui.challenge.isOpen(), false);
});

test('visible bot challenge X and Escape notify one dismissal with the original event after cancellation', () => {
  const dismissed = [];
  const order = [];
  let ui;
  ui = setup({
    onCancel: () => order.push('cancel'),
    onDismiss(event) {
      assert.equal(ui.challenge.isOpen(), false);
      assert.equal(ui.challenge.getJobId(), null, 'the existing challenge is fully cancelled before notification');
      order.push('dismiss');
      dismissed.push(event);
    },
  });
  const close = ui.container.querySelector('.bot-challenge-close');
  const x = { type: 'click', target: close };
  assert.deepEqual(dismissed, [], 'construction is silent');
  ui.challenge.open(firstJob);
  assert.deepEqual(dismissed, [], 'opening is silent');
  close.fire('click', x);
  assert.deepEqual(dismissed, [x]);
  assert.equal(dismissed[0], x);
  close.fire('click', x);
  ui.key('Escape');
  assert.deepEqual(dismissed, [x], 'hidden X and repeated Escape do not notify again');

  ui.challenge.open(nextJob);
  const escape = ui.key('Escape');
  assert.equal(escape.prevented, true);
  assert.equal(escape.stopped, true);
  assert.deepEqual(dismissed, [x, escape]);
  assert.equal(dismissed[1], escape);
  assert.deepEqual(order, ['cancel', 'dismiss', 'cancel', 'dismiss'], 'dismissal does not replace or duplicate the existing cancel callback');
  ui.challenge.destroy();
});

test('automatic bot challenge close, replacement, and teardown stay silent', () => {
  const dismissed = [];
  let cancels = 0;
  const ui = setup({ onCancel: () => cancels++, onDismiss: event => dismissed.push(event) });
  const close = ui.container.querySelector('.bot-challenge-close');
  ui.challenge.close();
  ui.challenge.open(firstJob);
  ui.challenge.open(nextJob);
  ui.challenge.close();
  ui.challenge.close();
  ui.challenge.open(firstJob);
  ui.challenge.destroy();
  close.fire('click', { type: 'click' });
  ui.key('Escape');
  assert.deepEqual(dismissed, []);
  assert.equal(cancels, 0, 'automatic transitions keep their previous cancellation semantics');
});

test('range failures and transport errors remain retryable after the click cooldown', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  let calls = 0;
  const ui = setup({ onHit: async job => {
    calls++;
    if (calls === 1) return { jobId: job.id, hits: 0, required: 1, won: false, reason: 'too-far' };
    if (calls === 2) throw new Error('offline');
    return { jobId: job.id, hits: 1, required: 1, won: true };
  } });
  ui.challenge.open(firstJob);
  await ui.click();
  assert.equal(ui.dots(), 0);
  assert.match(ui.status(), /Move closer/);
  assert.equal(ui.button().disabled, true);
  t.mock.timers.tick(450);
  await ui.click();
  assert.match(ui.status(), /Could not connect/);
  assert.equal(ui.button().disabled, true);
  t.mock.timers.tick(450);
  assert.equal(ui.button().disabled, false);
  await ui.click();
  assert.equal(ui.dots(), 1);
  ui.challenge.destroy();
});

test('malformed or mismatched confirmations cannot show a winning push', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  const invalid = [
    { jobId: nextJob.id, hits: 1, required: 1, won: true },
    { jobId: firstJob.id, hits: 1, required: 3, won: true },
    { jobId: firstJob.id, hits: 0, required: 1, won: true },
    { jobId: firstJob.id, hits: 2, required: 1, won: true },
    { jobId: firstJob.id, hits: 1, required: 1, won: 'true' },
    null,
  ];
  const ui = setup({ onHit: async () => invalid.shift() });
  ui.challenge.open(firstJob);
  for (let count = 0; count < 6; count++) {
    await ui.click();
    assert.equal(ui.dots(), 0);
    assert.match(ui.status(), /Could not confirm/);
    t.mock.timers.tick(450);
    assert.equal(ui.button().disabled, false);
  }
  ui.challenge.destroy();
});
