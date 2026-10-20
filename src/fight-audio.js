import { createSampleAudio } from './sample-audio.js';

const DEFAULT_SOURCES = ['/audio/fight-1.wav', '/audio/fight-2.wav', '/audio/fight-3.wav', '/audio/click.wav'];
const MAX_REMEMBERED_IMPACTS = 256;

/** Full nearby volume, followed by a smooth falloff to silence. */
export function fightDistanceGain(distance, innerRadius = 3, outerRadius = 10) {
  if (!Number.isFinite(distance)) return 0;
  const inner = Number.isFinite(innerRadius) ? Math.max(0, innerRadius) : 3;
  const outer = Number.isFinite(outerRadius) && outerRadius > inner ? outerRadius : inner + 7;
  const t = Math.max(0, Math.min(1, (distance - inner) / (outer - inner)));
  return 1 - t * t * (3 - 2 * t);
}

/** Play only current fight contacts, with distance applied to their existing tails. */
export function createFightAudio({
  document: doc = globalThis.document,
  window: win = globalThis.window,
  mediaQuery,
  button,
  enabled: initiallyEnabled = false,
  sources = DEFAULT_SOURCES,
  volume = 0.45,
  innerRadius = 3,
  outerRadius = 10,
  audioFactory = createSampleAudio,
  random = Math.random
} = {}) {
  const desktop = mediaQuery || win?.matchMedia?.('(min-width: 1280px)');
  const maximumGain = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.45;
  const audio = audioFactory({
    document: doc, window: win, mediaQuery: desktop, button, sources,
    enabled: Boolean(initiallyEnabled), volume: 0, selection: 'random', random,
    playbackRates: [1], maxVoices: 4
  });
  const seen = new Set();
  let enabled = Boolean(initiallyEnabled);
  let disposed = false;
  let pageActive = true;
  let distance = Infinity;
  let targetGain = 0;
  let paused = true;

  function getState() {
    return {
      ...audio.getState(), enabled, volume: targetGain, distance, paused,
      seenImpacts: seen.size, disposed
    };
  }

  function impactId(impact) {
    const id = impact && typeof impact === 'object' ? impact.id : impact;
    if ((typeof id === 'string' && id.length > 0) || (typeof id === 'number' && Number.isFinite(id))) return id;
    return null;
  }

  function update(frame = {}) {
    if (disposed) return 0;
    const { listener, source, impacts = [], paused: framePaused = false } =
      frame && typeof frame === 'object' ? frame : {};
    const coordinates = [listener?.x, listener?.z, source?.x, source?.z];
    distance = coordinates.every(Number.isFinite)
      ? Math.hypot(listener.x - source.x, listener.z - source.z) : Infinity;
    targetGain = maximumGain * fightDistanceGain(distance, innerRadius, outerRadius);
    paused = Boolean(framePaused);
    // Distance never mutes the controller: loaded samples stay ready and any
    // already playing contact fades through the same shared gain parameter.
    audio.setVolume(targetGain, { timeConstant: 0.08 });
    const active = enabled && pageActive && !paused && targetGain > 0 &&
      desktop?.matches !== false && doc?.visibilityState !== 'hidden' && !doc?.hidden;
    let played = 0;
    for (const impact of Array.isArray(impacts) ? impacts : []) {
      const id = impactId(impact);
      if (id === null || seen.has(id)) continue;
      seen.add(id);
      if (seen.size > MAX_REMEMBERED_IMPACTS) seen.delete(seen.values().next().value);
      // Consume inaudible contacts too. Returning nearby must never replay them.
      if (active && audio.play()) played++;
    }
    return played;
  }

  const onPageHide = () => { pageActive = false; };
  const onPageShow = () => { pageActive = true; };
  win?.addEventListener('pagehide', onPageHide);
  win?.addEventListener('pageshow', onPageShow);

  return {
    update,
    getState,
    unlock(event) { return disposed ? false : audio.unlock(event); },
    setEnabled(value) {
      if (disposed) return;
      enabled = Boolean(value);
      audio.setEnabled(enabled);
    },
    reset() {
      if (disposed) return;
      seen.clear();
      distance = Infinity;
      targetGain = 0;
      paused = true;
      audio.setVolume(0, { timeConstant: 0.08 });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      seen.clear();
      win?.removeEventListener('pagehide', onPageHide);
      win?.removeEventListener('pageshow', onPageShow);
      audio.dispose();
    }
  };
}
