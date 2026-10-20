const PREFERENCE_KEY = 'common-ground:music-enabled';
const NON_PLAY_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape']);

/** A single, lazy HTML audio element. No audio is requested before a user gesture. */
export function createBackgroundMusic({
  button,
  document: doc = globalThis.document,
  window: win = globalThis.window,
  mediaQuery,
  audioFactory = () => new win.Audio(),
  storage,
  src = '/audio/background.mp3',
  volume = 0.06,
  onChange
} = {}) {
  let persistence = storage;
  if (persistence === undefined) {
    try { persistence = win?.localStorage; } catch { /* Private browsing may deny storage. */ }
  }
  let enabled = true;
  try { enabled = persistence?.getItem(PREFERENCE_KEY) !== 'false'; } catch { /* Keep the default. */ }

  let audio = null;
  let hasGesture = false;
  let needsGesture = false;
  let pageActive = true;
  let disposed = false;
  let playing = false;
  let pending = null;
  let generation = 0;
  let lastState = '';
  const soundLevel = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.06;
  const desktop = mediaQuery || win?.matchMedia?.('(min-width: 1280px)');

  const getState = () => ({
    enabled,
    playing,
    waitingForGesture: !disposed && enabled && (!hasGesture || needsGesture)
  });
  function render() {
    const state = getState();
    const serialized = JSON.stringify(state);
    if (serialized === lastState) return;
    lastState = serialized;
    button?.setAttribute('aria-pressed', String(enabled));
    button?.setAttribute('aria-label', enabled ? 'Mute background music' : 'Play background music');
    button?.setAttribute('title', enabled ? 'Mute background music' : 'Play background music');
    button?.setAttribute('data-music-enabled', String(enabled));
    button?.setAttribute('data-playing', String(playing));
    onChange?.(state);
  }
  function wanted() {
    return !disposed && enabled && hasGesture && pageActive &&
      doc?.visibilityState !== 'hidden' && !doc?.hidden && desktop?.matches !== false;
  }
  function pause() {
    // Some browsers settle an earlier play() after pause(); its completion also
    // checks wanted(), so a late grant cannot bring muted or hidden music back.
    generation++;
    pending = null;
    playing = false;
    try { audio?.pause(); } catch { /* A broken media device must not affect the world. */ }
  }
  function reconcile() {
    if (!wanted()) {
      pause();
      render();
      return;
    }
    if (needsGesture || pending !== null || playing) { render(); return; }

    const attempt = ++generation;
    pending = attempt;
    let result;
    try {
      if (!audio) {
        audio = audioFactory();
        audio.preload = 'none';
        audio.loop = true;
        audio.volume = soundLevel;
        audio.src = src;
      }
      result = audio.play();
    } catch {
      pause();
      needsGesture = true;
      render();
      return;
    }
    Promise.resolve(result).then(() => {
      if (!wanted()) {
        pause();
        render();
        return;
      }
      if (attempt !== generation) return;
      pending = null;
      playing = true;
      render();
    }, () => {
      if (attempt !== generation) return;
      pause();
      needsGesture = true;
      render();
    });
    render();
  }
  function setEnabled(value) {
    if (disposed) return;
    enabled = Boolean(value);
    try { persistence?.setItem(PREFERENCE_KEY, String(enabled)); } catch { /* Session controls still work. */ }
    reconcile();
  }
  const toggle = () => setEnabled(!enabled);
  const isToggleTarget = target => Boolean(button && (target === button || (target && button.contains?.(target))));
  const isRealGesture = event => event?.isTrusted !== false;
  function onGesture(event) {
    if (!isRealGesture(event) || isToggleTarget(event?.target)) return;
    if (event?.type === 'keydown') {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || NON_PLAY_KEYS.has(event.key)) return;
      const target = event.target;
      if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '') ||
          target?.closest?.('[contenteditable="true"], [contenteditable=""]')) return;
    } else if (event?.button !== undefined && event.button !== 0) return;
    hasGesture = true;
    needsGesture = false;
    reconcile();
  }
  function onToggle(event) {
    // Capture-phase gesture listeners skip this control. Muting on the very
    // first click therefore never starts the track for an instant.
    if (!enabled && isRealGesture(event)) {
      hasGesture = true;
      needsGesture = false;
    }
    toggle();
  }
  const onVisibility = () => reconcile();
  const onPageHide = () => { pageActive = false; reconcile(); };
  const onPageShow = () => { pageActive = true; reconcile(); };
  const onViewport = () => reconcile();

  doc?.addEventListener('pointerdown', onGesture, true);
  doc?.addEventListener('keydown', onGesture, true);
  doc?.addEventListener('visibilitychange', onVisibility);
  win?.addEventListener('pagehide', onPageHide);
  win?.addEventListener('pageshow', onPageShow);
  button?.addEventListener('click', onToggle);
  if (desktop?.addEventListener) desktop.addEventListener('change', onViewport);
  else desktop?.addListener?.(onViewport);
  render();

  return {
    getState,
    setEnabled,
    toggle,
    dispose() {
      if (disposed) return;
      disposed = true;
      pause();
      doc?.removeEventListener('pointerdown', onGesture, true);
      doc?.removeEventListener('keydown', onGesture, true);
      doc?.removeEventListener('visibilitychange', onVisibility);
      win?.removeEventListener('pagehide', onPageHide);
      win?.removeEventListener('pageshow', onPageShow);
      button?.removeEventListener('click', onToggle);
      if (desktop?.removeEventListener) desktop.removeEventListener('change', onViewport);
      else desktop?.removeListener?.(onViewport);
      render();
    }
  };
}
