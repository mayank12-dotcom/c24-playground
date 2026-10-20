const NON_PLAY_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape']);

/** Lazy, gesture-unlocked one-shot audio shared by effects and avatar steps. */
export function createSampleAudio({
  button,
  document: doc = globalThis.document,
  window: win = globalThis.window,
  mediaQuery,
  sources = [],
  playbackRates = [1],
  selection = 'cycle',
  random = Math.random,
  maxVoices = 4,
  enabled: initiallyEnabled = true,
  volume = 0.22,
  fetch: fetchSample = (...args) => (win?.fetch || globalThis.fetch)(...args),
  audioContextFactory = () => {
    const AudioContext = win?.AudioContext || win?.webkitAudioContext;
    return AudioContext ? new AudioContext() : null;
  }
} = {}) {
  const desktop = mediaQuery || win?.matchMedia?.('(min-width: 1280px)');
  const urls = Array.isArray(sources) ? sources.filter(source => typeof source === 'string' && source) : [];
  let soundLevel = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.22;
  const configuredRates = Array.isArray(playbackRates)
    ? playbackRates.filter(rate => Number.isFinite(rate) && rate > 0) : [];
  const rates = configuredRates.length ? configuredRates : [1];
  const voiceLimit = Number.isFinite(maxVoices) ? Math.max(1, Math.floor(maxVoices)) : 4;
  const activeSources = new Set();
  let enabled = Boolean(initiallyEnabled);
  let context = null;
  let gain = null;
  let buffers = [];
  let sampleIndex = 0;
  let lastBufferIndex = -1;
  let unlocked = false;
  let needsGesture = false;
  let pageActive = true;
  let disposed = false;
  let loading = false;
  let loadGeneration = 0;
  let loadAbort = null;
  let resumeGeneration = 0;
  let pendingResume = null;
  let suspending = false;

  const wanted = () => !disposed && enabled && pageActive &&
    doc?.visibilityState !== 'hidden' && !doc?.hidden && desktop?.matches !== false;

  function getState() {
    return {
      enabled,
      volume: soundLevel,
      unlocked,
      ready: buffers.length > 0,
      loading,
      activeSources: activeSources.size,
      disposed,
      waitingForGesture: !disposed && enabled && (!unlocked || needsGesture)
    };
  }

  function releaseSource(source, stop = false) {
    if (!activeSources.delete(source)) return;
    source.onended = null;
    if (stop) { try { source.stop(); } catch { /* It may have already ended. */ } }
    try { source.disconnect(); } catch { /* An interrupted device can disconnect first. */ }
  }

  function stopSources() {
    for (const source of [...activeSources]) releaseSource(source, true);
  }

  function suspend() {
    stopSources();
    if (!context || context.state === 'closed' ||
        (context.state === 'suspended' && pendingResume === null) || suspending) return;
    const current = context;
    let result;
    try { result = current.suspend(); } catch { return; }
    suspending = true;
    Promise.resolve(result).then(() => {
      if (context !== current || disposed) return;
      suspending = false;
      // An enable/visibility change may have arrived while suspend was pending.
      if (wanted() && unlocked && !needsGesture) resume();
    }, () => {
      if (context === current) suspending = false;
    });
  }

  function resume(fromGesture = false) {
    if (!context || !wanted() || !unlocked || (!fromGesture && needsGesture)) return;
    if (context.state === 'running' && !suspending) return;
    if (pendingResume !== null && !fromGesture) return;
    const current = context;
    const attempt = ++resumeGeneration;
    pendingResume = attempt;
    let result;
    try { result = current.resume(); } catch {
      pendingResume = null;
      needsGesture = true;
      return;
    }
    Promise.resolve(result).then(() => {
      if (context !== current || disposed) return;
      if (pendingResume === attempt) pendingResume = null;
      if (!wanted()) suspend();
    }, () => {
      if (context !== current || disposed || attempt !== resumeGeneration) return;
      pendingResume = null;
      needsGesture = true;
      stopSources();
    });
  }

  function decode(current, bytes) {
    // The callback form also covers browsers that do not return a promise.
    return new Promise((resolve, reject) => {
      const result = current.decodeAudioData(bytes, resolve, reject);
      if (result?.then) result.then(resolve, reject);
    });
  }

  function loadSamples() {
    if (!context || loading || buffers.length || !urls.length || disposed) return;
    const current = context;
    const generation = ++loadGeneration;
    loading = true;
    const Abort = win?.AbortController || globalThis.AbortController;
    try { loadAbort = Abort ? new Abort() : null; } catch { loadAbort = null; }
    const signal = loadAbort?.signal;
    Promise.allSettled(urls.map(async url => {
      const response = await fetchSample(url, signal ? { signal } : undefined);
      if (response?.ok === false) throw new Error('Audio sample unavailable');
      const bytes = await response.arrayBuffer();
      if (disposed || generation !== loadGeneration || current !== context) return null;
      return decode(current, bytes);
    })).then(results => {
      if (disposed || generation !== loadGeneration || current !== context) return;
      buffers = results.filter(result => result.status === 'fulfilled' && result.value)
        .map(result => result.value);
      loading = false;
      loadAbort = null;
      // Loading never replays an earlier request: each effect needs a current trigger.
    });
  }

  function unlock(event) {
    if (event?.isTrusted !== true || !wanted()) return false;
    if (!context) {
      let created;
      try {
        created = audioContextFactory();
        if (!created || created.state === 'closed') return false;
        const level = created.createGain();
        level.gain.value = soundLevel;
        level.connect(created.destination);
        context = created;
        gain = level;
      } catch {
        try { Promise.resolve(created?.close()).catch(() => {}); } catch { /* Unsupported audio. */ }
        return false;
      }
    }
    unlocked = true;
    needsGesture = false;
    // Keep resume synchronous with the trusted browser event, before fetching.
    resume(true);
    loadSamples();
    return true;
  }

  function onGesture(event) {
    const target = event?.target;
    if (button && (target === button || (target && button.contains?.(target)))) return;
    if (event?.type === 'keydown') {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || NON_PLAY_KEYS.has(event.key)) return;
      if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName || '') ||
          target?.closest?.('[contenteditable="true"], [contenteditable=""]')) return;
    } else if (event?.button !== undefined && event.button !== 0) return;
    unlock(event);
  }

  function reconcile() {
    if (!wanted()) suspend();
    else if (unlocked && !needsGesture) resume();
  }

  function setVolume(value, { timeConstant = 0.08 } = {}) {
    if (disposed || !Number.isFinite(value)) return;
    const target = Math.max(0, Math.min(1, value));
    if (target === soundLevel) return;
    soundLevel = target;
    if (!context || !gain) return;
    const parameter = gain.gain;
    const time = Number.isFinite(context.currentTime) ? context.currentTime : 0;
    const tau = Number.isFinite(timeConstant) && timeConstant > 0 ? Math.max(0.001, timeConstant) : 0.08;
    try {
      if (parameter.setTargetAtTime) {
        let held = false;
        if (parameter.cancelAndHoldAtTime) {
          try { parameter.cancelAndHoldAtTime(time); held = true; } catch { /* Fall back to the current value. */ }
        }
        if (!held) {
          const current = Number.isFinite(parameter.value) ? parameter.value : target;
          parameter.cancelScheduledValues?.(time);
          if (parameter.setValueAtTime) parameter.setValueAtTime(current, time);
          else parameter.value = current;
        }
        parameter.setTargetAtTime(target, time, tau);
      } else parameter.value = target;
    } catch {
      try { parameter.value = target; } catch { /* Audio device changes must not interrupt the world. */ }
    }
  }

  function nextBufferIndex() {
    if (selection !== 'random') return sampleIndex % buffers.length;
    let value;
    try { value = random(); } catch { value = 0; }
    const draw = Number.isFinite(value) ? Math.min(1 - Number.EPSILON, Math.max(0, value)) : 0;
    if (buffers.length < 2 || lastBufferIndex < 0) return Math.floor(draw * buffers.length);
    // Draw from every sample except the one that was just heard, without retries.
    const choice = Math.floor(draw * (buffers.length - 1));
    return choice >= lastBufferIndex ? choice + 1 : choice;
  }

  function play() {
    if (!wanted() || !unlocked || needsGesture || !buffers.length || context?.state !== 'running' ||
        suspending || pendingResume !== null) return false;
    let source;
    try {
      source = context.createBufferSource();
      const bufferIndex = nextBufferIndex();
      source.buffer = buffers[bufferIndex];
      if (source.playbackRate) source.playbackRate.value = rates[sampleIndex % rates.length];
      source.connect(gain);
      if (activeSources.size >= voiceLimit) releaseSource(activeSources.values().next().value, true);
      activeSources.add(source);
      source.onended = () => releaseSource(source);
      source.start(context.currentTime);
      lastBufferIndex = bufferIndex;
      sampleIndex++;
      return true;
    } catch {
      if (source) {
        if (activeSources.has(source)) releaseSource(source, true);
        else { try { source.disconnect(); } catch { /* A failed source has no graph connection. */ } }
      }
      return false;
    }
  }

  const onPageHide = () => { pageActive = false; reconcile(); };
  const onPageShow = () => { pageActive = true; reconcile(); };
  doc?.addEventListener('pointerdown', onGesture, true);
  doc?.addEventListener('keydown', onGesture, true);
  doc?.addEventListener('visibilitychange', reconcile);
  win?.addEventListener('pagehide', onPageHide);
  win?.addEventListener('pageshow', onPageShow);
  if (desktop?.addEventListener) desktop.addEventListener('change', reconcile);
  else desktop?.addListener?.(reconcile);

  return {
    play,
    unlock,
    getState,
    setVolume,
    setEnabled(value) { if (!disposed) { enabled = Boolean(value); reconcile(); } },
    dispose() {
      if (disposed) return;
      disposed = true;
      loadGeneration++;
      resumeGeneration++;
      pendingResume = null;
      loading = false;
      stopSources();
      try { loadAbort?.abort(); } catch { /* A completed fetch needs no cancellation. */ }
      loadAbort = null;
      buffers = [];
      try { gain?.disconnect(); } catch { /* Already disconnected. */ }
      const current = context;
      context = null;
      gain = null;
      try { Promise.resolve(current?.close()).catch(() => {}); } catch { /* Closed/unsupported device. */ }
      doc?.removeEventListener('pointerdown', onGesture, true);
      doc?.removeEventListener('keydown', onGesture, true);
      doc?.removeEventListener('visibilitychange', reconcile);
      win?.removeEventListener('pagehide', onPageHide);
      win?.removeEventListener('pageshow', onPageShow);
      if (desktop?.removeEventListener) desktop.removeEventListener('change', reconcile);
      else desktop?.removeListener?.(reconcile);
    }
  };
}
