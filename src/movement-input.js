const movementKeys = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd']);

export function isEditableTarget(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
}

/** Capture movement before non-editable sidebar controls stop keyboard bubbling. */
export function bindMovementInput({ window, document, keys, onMoveKey, onStop, onEditableFocus = () => {} }) {
  const keyDown = event => {
    const key = event.key.toLowerCase();
    if (!movementKeys.has(key) || isEditableTarget(event.target)) return;
    event.preventDefault();
    onMoveKey(key);
    keys.add(key);
  };
  const keyUp = event => {
    const key = event.key.toLowerCase();
    if (!movementKeys.has(key)) return;
    keys.delete(key);
    if (!keys.size) onStop();
  };
  const stop = () => { keys.clear(); onStop(); };
  const focusIn = event => {
    if (!isEditableTarget(event.target)) return;
    stop();
    onEditableFocus();
  };
  window.addEventListener('keydown', keyDown, true);
  window.addEventListener('keyup', keyUp, true);
  window.addEventListener('blur', stop);
  document.addEventListener('focusin', focusIn);
  return () => {
    stop();
    window.removeEventListener('keydown', keyDown, true);
    window.removeEventListener('keyup', keyUp, true);
    window.removeEventListener('blur', stop);
    document.removeEventListener('focusin', focusIn);
  };
}
