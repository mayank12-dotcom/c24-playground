import './bot-challenge.css';

const PUSH_COOLDOWN_MS = 450;
const REQUIRED_PUSHES = 1;
const isEditable = target => Boolean(target && (
  ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName?.toUpperCase()) ||
  target.isContentEditable || target.closest?.('[contenteditable="true"]')
));

const reasons = {
  occupied: 'Another visitor has this chair. Try a different table.',
  taken: 'Another visitor reached this chair first. Try a different table.',
  'seat-taken': 'Another visitor reached this chair first. Try a different table.',
  'not-near': 'Move closer to the chair to push the bot.',
  'too-far': 'Move closer to the chair to push the bot.',
  range: 'Move closer to the chair to push the bot.',
  'space-needed': 'Give the bot a little room to land, then push again.',
  cooldown: 'Give the bot a moment, then push again.',
  offline: 'The push could not connect. Try again in a moment.',
  unavailable: 'That seat is no longer available. Try a different table.',
  'not-bot': 'This chair no longer has a bot to push.',
  'already-defeated': 'You already won this chair. Move closer to take a seat.',
  seated: 'Leave your current chair before pushing a bot.',
};

/** A non-modal seat challenge. World movement and seat ownership remain with the caller. */
export function createBotChallenge({ container, onHit, onCancel = () => {}, onStrike = () => {}, onDismiss = () => {} }) {
  const document = container.ownerDocument || globalThis.document;
  const keyboardTarget = document.defaultView || document;
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const card = node('section', 'bot-challenge');
  card.hidden = true;
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Win a seat from the bot');
  const closeButton = node('button', 'bot-challenge-close', '×');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Leave bot challenge');
  const eyebrow = node('span', 'bot-challenge-eyebrow', 'MAKE A LITTLE ROOM');
  const heading = node('h2', 'bot-challenge-heading', 'Push the bot to take this seat');
  const identity = node('p', 'bot-challenge-role');
  const explanation = node('p', 'bot-challenge-description', 'Give the bot a playful push. It tumbles off, then you sit once the chair is clear.');
  const footer = node('div', 'bot-challenge-footer');
  const progress = node('div', 'bot-challenge-progress');
  const dots = node('div', 'bot-challenge-dots');
  dots.setAttribute('aria-hidden', 'true');
  const status = node('p', 'bot-challenge-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  progress.append(dots, status);
  const hitButton = node('button', 'bot-challenge-hit', 'Push · Space');
  hitButton.type = 'button';
  footer.append(progress, hitButton);
  card.append(closeButton, eyebrow, heading, identity, explanation, footer);
  container.append(card);

  let job = null;
  let hits = 0;
  let required = REQUIRED_PUSHES;
  let generation = 0;
  let pending = false;
  let won = false;
  let nextPushAt = 0;
  let cooldownTimer = null;
  let destroyed = false;

  function cancelTimer() {
    if (cooldownTimer !== null) clearTimeout(cooldownTimer);
    cooldownTimer = null;
  }

  function updateButton() {
    cancelTimer();
    const remaining = nextPushAt - Date.now();
    hitButton.disabled = pending || won || remaining > 0;
    hitButton.setAttribute('aria-busy', String(pending));
    if (remaining > 0 && !destroyed && !card.hidden) {
      cooldownTimer = setTimeout(updateButton, remaining);
    }
  }

  function renderProgress(message = `${hits} of ${required} push`) {
    dots.replaceChildren();
    for (let index = 0; index < required; index++) {
      dots.append(node('span', `bot-challenge-dot${index < hits ? ' is-complete' : ''}`));
    }
    status.textContent = message;
    updateButton();
  }

  function close() {
    generation++;
    job = null;
    pending = false;
    card.hidden = true;
    cancelTimer();
  }

  function cancel(event) {
    if (card.hidden || destroyed) return;
    close();
    onCancel();
    onDismiss(event);
  }

  async function hit() {
    if (destroyed || card.hidden || !job || pending || won || Date.now() < nextPushAt) return;
    const attempt = generation;
    const hitJob = job;
    pending = true;
    nextPushAt = Date.now() + PUSH_COOLDOWN_MS;
    updateButton();
    try {
      onStrike();
      const result = await onHit(hitJob);
      if (attempt !== generation || destroyed || card.hidden) return;
      if (!result || result.jobId !== hitJob.id || result.required !== REQUIRED_PUSHES || !Number.isInteger(result.hits) || result.hits < 0 || result.hits > REQUIRED_PUSHES || typeof result.won !== 'boolean' || (result.won && result.hits !== REQUIRED_PUSHES)) {
        renderProgress('Could not confirm that push. Try again.');
        return;
      }
      required = REQUIRED_PUSHES;
      hits = Math.max(0, Math.min(required, Math.floor(Number(result.hits) || 0)));
      won = result.won === true;
      if (won) {
        heading.textContent = 'The chair is yours!';
        renderProgress('The bot is moving. You’ll sit when the chair is clear.');
      } else {
        renderProgress(result.reason ? reasons[result.reason] || 'Could not land that push. Try again.' : `${hits} of ${required} push`);
      }
    } catch {
      if (attempt === generation && !destroyed && !card.hidden) {
        renderProgress('Could not connect that push. Try again.');
      }
    } finally {
      if (attempt === generation && !destroyed && !card.hidden) {
        pending = false;
        updateButton();
      }
    }
  }

  function onKeyDown(event) {
    if (card.hidden || destroyed) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancel(event);
      return;
    }
    const control = event.target?.closest?.('button, a, summary, [role="button"]') ||
      (['BUTTON', 'A', 'SUMMARY'].includes(event.target?.tagName?.toUpperCase()) ? event.target : null);
    if ((event.key === ' ' || event.code === 'Space') && !isEditable(event.target) && (!control || control === hitButton)) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) void hit();
    }
  }

  hitButton.addEventListener('click', hit);
  closeButton.addEventListener('click', cancel);
  keyboardTarget.addEventListener('keydown', onKeyDown, true);

  return {
    open(nextJob) {
      if (destroyed || !nextJob?.id) return;
      if (!card.hidden && job?.id === nextJob.id) return;
      generation++;
      job = nextJob;
      hits = 0;
      required = REQUIRED_PUSHES;
      pending = false;
      won = false;
      nextPushAt = 0;
      heading.textContent = 'Push the bot to take this seat';
      identity.textContent = `${nextJob.title}${nextJob.company ? ` · ${nextJob.company}` : ''}`;
      card.hidden = false;
      renderProgress();
    },
    close,
    isOpen: () => !card.hidden,
    getJobId: () => job?.id || null,
    destroy() {
      if (destroyed) return;
      close();
      destroyed = true;
      hitButton.removeEventListener('click', hit);
      closeButton.removeEventListener('click', cancel);
      keyboardTarget.removeEventListener('keydown', onKeyDown, true);
      card.remove();
    },
  };
}
