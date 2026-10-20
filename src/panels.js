/** Manage the persistent, non-modal opportunity panel without replacing its content. */
export function createFloatingPanel({ panel, toggle: toggleButton, close: closeButton, onChange = () => {}, onDismiss = () => {} }) {
  const document = panel.ownerDocument;
  const movementKeys = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd']);

  function sync(open) {
    panel.hidden = !open;
    toggleButton.setAttribute('aria-expanded', String(open));
    onChange(open);
  }

  function open({ focus = false } = {}) {
    sync(true);
    if (focus) closeButton.focus({ preventScroll: true });
  }

  function close({ restoreFocus = false, dismissEvent } = {}) {
    const wasOpen = !panel.hidden;
    sync(false);
    if (wasOpen && restoreFocus) toggleButton.focus({ preventScroll: true });
    if (wasOpen && dismissEvent) onDismiss(dismissEvent);
  }

  function toggle(event) {
    if (panel.hidden) open();
    else close({ restoreFocus: panel.contains(document.activeElement), dismissEvent: event });
  }

  function onCloseClick(event) {
    close({ restoreFocus: true, dismissEvent: event });
  }

  function onEscape(event) {
    if (event.key === 'Escape' && !panel.hidden) {
      close({ restoreFocus: panel.contains(document.activeElement), dismissEvent: event });
    }
  }

  function stopMovement(event) {
    if (movementKeys.has(event.key.toLowerCase())) event.stopPropagation();
  }

  if (panel.id) toggleButton.setAttribute('aria-controls', panel.id);
  sync(false);
  toggleButton.addEventListener('click', toggle);
  closeButton.addEventListener('click', onCloseClick);
  // Capture Escape because the chat deliberately stops keyboard bubbling.
  document.addEventListener('keydown', onEscape, true);
  const controls = new Set([panel, toggleButton, closeButton]);
  controls.forEach(control => control.addEventListener('keydown', stopMovement));

  return {
    open,
    close,
    toggle,
    isOpen: () => !panel.hidden,
    destroy() {
      toggleButton.removeEventListener('click', toggle);
      closeButton.removeEventListener('click', onCloseClick);
      document.removeEventListener('keydown', onEscape, true);
      controls.forEach(control => control.removeEventListener('keydown', stopMovement));
    }
  };
}
