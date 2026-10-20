import { createVisitorProfile } from './visitor-profile.js';

export function createNamePrompt({ document, window, mediaQuery, onComplete } = {}) {
  const profile = createVisitorProfile({ window });
  const desktop = mediaQuery || window.matchMedia('(min-width: 1280px)');
  const dialog = document.getElementById('visitor-name-dialog');
  const form = document.getElementById('visitor-name-form');
  const input = document.getElementById('visitor-name-input');
  const submit = document.getElementById('visitor-name-submit');
  const error = document.getElementById('visitor-name-error');
  const workspace = document.querySelector('.workspace');
  let visible = false, destroyed = false, completed = false;
  let previousFocus = null, previousInert = false;

  function close({ restoreFocus = false } = {}) {
    if (!visible) return;
    visible = false;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    if (workspace) workspace.inert = previousInert;
    if (restoreFocus && previousFocus?.isConnected !== false) previousFocus?.focus?.();
  }

  function open() {
    if (destroyed || completed || profile.getName() || !desktop.matches || visible) return false;
    previousFocus = document.activeElement;
    previousInert = Boolean(workspace?.inert);
    if (workspace) workspace.inert = true;
    visible = true;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    input.focus();
    return true;
  }

  function onSubmit(event) {
    event.preventDefault();
    if (destroyed || completed || !visible || !desktop.matches) return;
    const name = profile.setName(input.value);
    if (!name) {
      error.textContent = 'Please enter your name to join the office.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    completed = true;
    submit.disabled = true;
    input.value = name;
    close();
    onComplete?.(name);
  }

  function onInput() {
    error.textContent = '';
    input.removeAttribute('aria-invalid');
    // Normalize on submission, without modifying a multilingual IME composition.
  }

  function onCancel(event) { event.preventDefault(); }
  function onKeyDown(event) {
    // Native modal dialogs contain focus. Keep the same focus loop in the
    // lightweight fallback, and keep these keys out of world input handlers.
    event.stopPropagation();
    if (event.key === 'Escape') event.preventDefault();
    if (event.key !== 'Tab') return;
    if (event.shiftKey && document.activeElement === input) {
      event.preventDefault(); submit.focus();
    } else if (!event.shiftKey && document.activeElement === submit) {
      event.preventDefault(); input.focus();
    }
  }
  function onClose() {
    // An external form or browser close cannot bypass the naming step.
    if (!dialog.open && visible && !completed && !destroyed) { visible = false; if (workspace) workspace.inert = previousInert; open(); }
  }
  function onViewportChange() {
    if (!desktop.matches) close();
    else open();
  }

  form.addEventListener('submit', onSubmit);
  input.addEventListener('input', onInput);
  dialog.addEventListener('cancel', onCancel);
  dialog.addEventListener('keydown', onKeyDown);
  dialog.addEventListener('close', onClose);
  desktop.addEventListener('change', onViewportChange);

  return {
    getName: profile.getName,
    open,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      close({ restoreFocus: true });
      form.removeEventListener('submit', onSubmit);
      input.removeEventListener('input', onInput);
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('keydown', onKeyDown);
      dialog.removeEventListener('close', onClose);
      desktop.removeEventListener('change', onViewportChange);
    }
  };
}
