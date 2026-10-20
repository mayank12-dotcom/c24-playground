import { createSampleAudio } from './sample-audio.js';

const DEFAULT_SOURCES = [1, 2, 3, 4].map(index => `/audio/step-${index}.wav`);
const STEP_RATES = [1, 0.98, 1.02, 0.99];

/** Play the existing varied samples only on real avatar foot contacts. */
export function createFootstepAudio({ sources = DEFAULT_SOURCES, ...options } = {}) {
  const player = createSampleAudio({ ...options, sources, playbackRates: STEP_RATES, maxVoices: 4 });
  return { ...player, playStep: player.play };
}
