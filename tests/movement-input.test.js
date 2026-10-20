import assert from 'node:assert/strict';
import test from 'node:test';
import { bindMovementInput } from '../src/movement-input.js';

class Events {
  listeners = [];
  addEventListener(type, listener, capture = false) { this.listeners.push({ type, listener, capture: Boolean(capture) }); }
  removeEventListener(type, listener, capture = false) { this.listeners = this.listeners.filter(item => item.type !== type || item.listener !== listener || item.capture !== Boolean(capture)); }
  emit(type, event) { for (const item of this.listeners.filter(item => item.type === type)) item.listener(event); }
  key(type, key, target) {
    const event = { key, target, defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
    const listeners = this.listeners.filter(item => item.type === type);
    for (const item of listeners.filter(item => item.capture)) item.listener(event);
    target.onKey?.(event);
    if (!event.stopped) for (const item of listeners.filter(item => !item.capture)) item.listener(event);
    return event;
  }
}
const control = (editable = false) => ({ closest: () => editable ? {} : null });

test('all movement directions exit a chair from a focused sidebar button before bubbling stops', () => {
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'a', 'D', 's', 'W']) {
    const window = new Events(), document = new Events(), keys = new Set();
    let seated = true, panelOpen = true, releases = 0, canvasFocused = false;
    const dispose = bindMovementInput({ window, document, keys,
      onMoveKey() {
        if (!seated) return;
        seated = false; panelOpen = false; releases++; canvasFocused = true;
        document.emit('focusin', { target: control() });
      },
      onStop() {}
    });
    const sidebarButton = control();
    sidebarButton.onKey = event => event.stopPropagation();
    const first = window.key('keydown', key, sidebarButton);
    assert.equal(first.defaultPrevented, true);
    assert.equal(seated, false);
    assert.equal(panelOpen, false);
    assert.equal(canvasFocused, true);
    assert.equal(keys.has(key.toLowerCase()), true, 'the exit key also starts and holds walking');
    window.key('keydown', key, control());
    assert.equal(releases, 1, 'keyboard repeat must not release a second time');
    assert.equal(keys.size, 1);
    window.key('keyup', key, sidebarButton);
    assert.equal(keys.size, 0, 'capture keyup reaches the world even if the sidebar consumes it');
    dispose();
  }
});

test('chat typing and caret keys never move the character or leave the chair', () => {
  const window = new Events(), document = new Events(), keys = new Set();
  let movementCalls = 0;
  const dispose = bindMovementInput({ window, document, keys,
    onMoveKey() { movementCalls++; }, onStop() {}
  });
  for (const key of ['w', 'a', 's', 'd', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    const event = window.key('keydown', key, control(true));
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(movementCalls, 0);
  assert.equal(keys.size, 0);
  dispose();
});

test('diagonal held input survives one key release and clears on input focus, blur, and teardown', () => {
  const window = new Events(), document = new Events(), keys = new Set();
  let stops = 0, editableFocus = 0;
  const dispose = bindMovementInput({ window, document, keys,
    onMoveKey() {}, onStop() { stops++; }, onEditableFocus() { editableFocus++; }
  });
  const button = control();
  window.key('keydown', 'w', button); window.key('keydown', 'a', button);
  window.key('keyup', 'a', button);
  assert.deepEqual([...keys], ['w']);
  assert.equal(stops, 0);
  document.emit('focusin', { target: control(true) });
  assert.equal(keys.size, 0); assert.equal(stops, 1); assert.equal(editableFocus, 1);
  window.key('keydown', 'ArrowDown', button); window.emit('blur', {});
  assert.equal(keys.size, 0); assert.equal(stops, 2);
  window.key('keydown', 'd', button); dispose();
  assert.equal(keys.size, 0); assert.equal(stops, 3);
  assert.equal(window.listeners.length, 0); assert.equal(document.listeners.length, 0);
});
