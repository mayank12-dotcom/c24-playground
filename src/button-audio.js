import { createSampleAudio } from './sample-audio.js';

const RETRY_MS = 8;
const MAX_DELAY_MS = 150;
const BUTTON_INPUTS = new Set(['button', 'submit', 'reset', 'image']);

/** Give each real app button activation one short, bounded audio response. */
export function createButtonAudio({
  root,
  document: doc = globalThis.document,
  window: win = globalThis.window,
  mediaQuery,
  button,
  enabled: initiallyEnabled = false,
  src = '/audio/click.wav',
  volume = 0.4,
  audioFactory = createSampleAudio,
  now = () => win?.performance?.now?.() ?? globalThis.performance?.now?.() ?? Date.now(),
  setTimeout: schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimeout: cancel = timer => globalThis.clearTimeout(timer)
} = {}) {
  const app = root || doc?.getElementById?.('app');
  const desktop = mediaQuery || win?.matchMedia?.('(min-width: 1280px)');
  const audio = audioFactory({
    document: doc, window: win, mediaQuery: desktop, button,
    enabled: Boolean(initiallyEnabled), sources: [src], volume, playbackRates: [1], maxVoices: 2
  });
  const playedEvents = new WeakSet();
  let enabled = Boolean(initiallyEnabled);
  let disposed = false;
  let pageActive = true;
  let pendingDeadline = null;
  let timer = null;

  const wanted = () => !disposed && enabled && pageActive && desktop?.matches !== false &&
    doc?.visibilityState !== 'hidden' && !doc?.hidden;

  function cancelPending() {
    pendingDeadline = null;
    if (timer !== null) { cancel(timer); timer = null; }
  }

  function getState() {
    return { ...audio.getState(), enabled, disposed, pending: pendingDeadline !== null };
  }

  function isButton(node) {
    const tag = String(node?.tagName || node?.nodeName || '').toUpperCase();
    if (tag === 'BUTTON' || node?.getAttribute?.('role') === 'button') return true;
    return tag === 'INPUT' && BUTTON_INPUTS.has(String(node.type || node.getAttribute?.('type') || '').toLowerCase());
  }

  function findButton(target) {
    let node = target?.nodeType === 3 ? target.parentElement : target;
    while (node) {
      if (isButton(node)) return node;
      if (node === app) return null;
      node = node.parentElement;
    }
    return null;
  }

  function isEligible(control) {
    if (!app || !control || control.isConnected === false ||
        (control !== app && !app.contains?.(control))) return false;
    if (control.disabled || control.hasAttribute?.('disabled') || control.matches?.(':disabled')) return false;
    for (let node = control; node; node = node.parentElement) {
      if (node.hidden || node.inert || node.hasAttribute?.('hidden') || node.hasAttribute?.('inert') ||
          node.getAttribute?.('aria-disabled') === 'true' || node.getAttribute?.('aria-hidden') === 'true' ||
          node.style?.display === 'none' || /^(hidden|collapse)$/.test(node.style?.visibility || '')) return false;
      if (win?.getComputedStyle) {
        try {
          const style = win.getComputedStyle(node);
          if (style.display === 'none' || /^(hidden|collapse)$/.test(style.visibility || '')) return false;
        } catch { /* Lightweight DOM fixtures and detached SVG nodes may not expose computed styles. */ }
      }
      if (node === app) break;
    }
    try {
      const boxes = control.getClientRects?.();
      if (boxes && boxes.length === 0) return false;
    } catch { return false; }
    return true;
  }

  function mayWait() {
    const state = audio.getState();
    return state.unlocked && !state.waitingForGesture && !state.disposed && (state.loading || state.ready);
  }

  function retry() {
    timer = null;
    if (pendingDeadline === null) return;
    if (!wanted() || now() >= pendingDeadline || !mayWait()) { cancelPending(); return; }
    if (audio.play()) { cancelPending(); return; }
    timer = schedule(retry, Math.min(RETRY_MS, pendingDeadline - now()));
  }

  function playClick(event) {
    if (event?.isTrusted !== true || event.type !== 'click' ||
        (event.button !== undefined && event.button !== 0)) return false;
    if (playedEvents.has(event)) return false;
    cancelPending();
    if (!wanted() || !isEligible(findButton(event.target))) return false;
    playedEvents.add(event);
    // The capture listener runs before a button action can remove its own DOM.
    // Unlock inside that trusted event; later retries only wait for its sample.
    audio.unlock(event);
    if (audio.play()) return true;
    if (!mayWait()) return false;
    pendingDeadline = now() + MAX_DELAY_MS;
    timer = schedule(retry, RETRY_MS);
    return false;
  }

  function onClick(event) {
    if (event?.isTrusted !== true || playedEvents.has(event)) return;
    cancelPending();
    const target = event.target;
    if (button && (target === button || (target && button.contains?.(target)))) return;
    playClick(event);
  }

  const onLifecycle = () => cancelPending();
  const onPageHide = () => { pageActive = false; cancelPending(); };
  const onPageShow = () => { pageActive = true; cancelPending(); };
  doc?.addEventListener('click', onClick, true);
  doc?.addEventListener('visibilitychange', onLifecycle);
  win?.addEventListener('pagehide', onPageHide);
  win?.addEventListener('pageshow', onPageShow);
  if (desktop?.addEventListener) desktop.addEventListener('change', onLifecycle);
  else desktop?.addListener?.(onLifecycle);

  return {
    playClick,
    getState,
    setEnabled(value) {
      if (disposed) return;
      enabled = Boolean(value);
      if (!enabled) cancelPending();
      audio.setEnabled(enabled);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelPending();
      doc?.removeEventListener('click', onClick, true);
      doc?.removeEventListener('visibilitychange', onLifecycle);
      win?.removeEventListener('pagehide', onPageHide);
      win?.removeEventListener('pageshow', onPageShow);
      if (desktop?.removeEventListener) desktop.removeEventListener('change', onLifecycle);
      else desktop?.removeListener?.(onLifecycle);
      audio.dispose();
    }
  };
}
