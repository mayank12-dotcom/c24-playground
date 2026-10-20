import './recruiter-controls.css';

const ACTIVE_STAGES = new Set(['falling', 'grounded', 'recovering', 'approaching', 'fighting']);
const isEditable = target => Boolean(target && (
  ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName?.toUpperCase()) ||
  target.isContentEditable || target.closest?.('[contenteditable="true"], [contenteditable=""]')
));
const bounded = (value, fallback = 0, maximum = 100) => Number.isFinite(value)
  ? Math.max(0, Math.min(maximum, Math.round(value))) : fallback;

/** Non-modal controls: dismissing this card never ends the encounter. */
export function createRecruiterControls({
  container,
  window: suppliedWindow,
  document: suppliedDocument,
  onAttack = () => false,
  onDisengage = () => {},
  onDismiss = () => {},
} = {}) {
  const doc = suppliedDocument || container?.ownerDocument || globalThis.document;
  const win = suppliedWindow || doc?.defaultView || globalThis.window;
  if (!container || !doc?.createElement) throw new TypeError('Recruiter controls need a document and container.');
  const keyboard = win || doc;
  const desktop = win?.matchMedia?.('(min-width: 1280px)');
  const element = (tag, className, text) => {
    const node = doc.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const card = element('section', 'recruiter-controls');
  card.hidden = true;
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Product Manager encounter controls');
  const close = element('button', 'recruiter-controls-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Hide fight controls');
  const eyebrow = element('span', 'recruiter-controls-eyebrow', 'A LITTLE OFFICE RIVALRY');
  const heading = element('h2', 'recruiter-controls-heading', 'Product Manager showdown');
  const status = element('p', 'recruiter-controls-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('aria-atomic', 'true');
  const health = element('p', 'recruiter-controls-health');
  const actions = element('div', 'recruiter-controls-actions');
  const punch = element('button', 'recruiter-controls-attack', 'Punch · J');
  punch.type = 'button';
  punch.setAttribute('aria-keyshortcuts', 'J');
  const kick = element('button', 'recruiter-controls-attack', 'Kick · K');
  kick.type = 'button';
  kick.setAttribute('aria-keyshortcuts', 'K');
  const leave = element('button', 'recruiter-controls-leave', 'Step away · Esc');
  leave.type = 'button';
  leave.setAttribute('aria-keyshortcuts', 'Escape');
  actions.append(punch, kick, leave);
  const hint = element('p', 'recruiter-controls-hint', 'WASD or arrow keys to move. Step away to end the fight.');
  card.append(close, eyebrow, heading, status, health, actions, hint);
  container.append(card);

  let state = { stage: 'idle', localPlayer: false, hits: 0, required: 3 };
  let disposed = false, dismissed = false, ending = false;
  const held = new Set();

  function blockedAncestry(node) {
    for (let current = node; current; current = current.parentElement || current.parentNode) {
      if (current.inert || current.hidden || current.getAttribute?.('aria-hidden') === 'true') return true;
    }
    return false;
  }
  function visibleModal() {
    const dialogs = doc.querySelectorAll?.('dialog[open], [aria-modal="true"]') || [];
    return Array.from(dialogs).some(dialog => {
      if (blockedAncestry(dialog)) return false;
      const style = win?.getComputedStyle?.(dialog);
      return !style || (style.display !== 'none' && style.visibility !== 'hidden');
    });
  }
  function explorationPopupOpen() {
    return ['controls-help', 'opportunity-panel'].some(id => {
      const popup = doc.getElementById?.(id);
      if (!popup || blockedAncestry(popup)) return false;
      const style = win?.getComputedStyle?.(popup);
      return !style || (style.display !== 'none' && style.visibility !== 'hidden');
    });
  }
  function available() {
    return !disposed && desktop?.matches !== false && !doc.hidden && doc.visibilityState !== 'hidden'
      && !blockedAncestry(container) && !visibleModal();
  }
  const ownsEncounter = () => state.localPlayer === true && ACTIVE_STAGES.has(state.stage);
  const canAttack = () => available() && ownsEncounter() && state.stage === 'fighting' && !ending;
  const canLeave = () => available() && ownsEncounter() && !ending;

  function description() {
    if (state.message) return String(state.message);
    if (state.stage === 'progress') {
      const hits = bounded(state.hits, 0, 3), required = bounded(state.required, 3, 3) || 3;
      return hits >= required - 1
        ? `${hits} of ${required} bumps. One more bump into the recruiter's chair.`
        : `${hits} of ${required} bumps. Step back, then bump again.`;
    }
    if (!state.localPlayer) return 'Another visitor has challenged the Product Manager. Give them a little room.';
    return ({
      falling: 'The recruiter is taking a tumble. Give them room to get up.',
      grounded: 'Give the recruiter a little room. They are not finished yet.',
      recovering: 'They are getting up. Get ready.',
      approaching: 'The recruiter is coming over. Make a little space.',
      fighting: 'J to punch · K to kick. Your hits connect when you are close.',
      returning: 'That is enough for now. The recruiter is heading back.',
    })[state.stage] || '';
  }
  function putText(node, text) {
    // In particular, do not repeatedly announce an unchanged status at 60 fps.
    if (node.textContent !== text) node.textContent = text;
  }
  function render() {
    const relevant = state.stage === 'progress' || ACTIVE_STAGES.has(state.stage) || state.stage === 'returning';
    card.hidden = !relevant || dismissed || !available();
    card.setAttribute('data-local', state.localPlayer ? 'true' : 'false');
    card.setAttribute('data-stage', state.stage);
    putText(heading, state.stage === 'progress' ? 'Mind the recruiter’s chair' : 'Product Manager showdown');
    putText(status, description());
    const showHealth = state.localPlayer && ['fighting', 'returning'].includes(state.stage)
      && (Number.isFinite(state.playerHealth) || Number.isFinite(state.recruiterHealth));
    health.hidden = !showHealth;
    if (showHealth) putText(health, `You ${bounded(state.playerHealth, 100)} · Recruiter ${bounded(state.recruiterHealth, 100)}`);
    actions.hidden = !state.localPlayer || !ACTIVE_STAGES.has(state.stage);
    hint.hidden = actions.hidden;
    punch.disabled = kick.disabled = !canAttack();
    leave.disabled = !canLeave();
  }
  function refocusWorld() {
    if (card.contains?.(doc.activeElement)) container.querySelector?.('canvas')?.focus?.({ preventScroll: true });
  }
  function dismiss(event) {
    if (disposed || card.hidden) return;
    dismissed = true;
    card.hidden = true;
    refocusWorld();
    onDismiss(event);
  }
  function attack(type, event) {
    if (!canAttack() || (event && (isEditable(event.target) || event.defaultPrevented))) return false;
    onAttack(type);
    return true;
  }
  function disengage(event) {
    if (!canLeave() || isEditable(event?.target)) return false;
    ending = true;
    render();
    onDisengage();
    return true;
  }
  const punchClick = event => attack('punch', event);
  const kickClick = event => attack('kick', event);
  function keyDown(event) {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229
      || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isEditable(event.target)
      || blockedAncestry(event.target) || !available()) return;
    const key = String(event.key || '').toLowerCase();
    const code = String(event.code || '');
    const action = key === 'j' || code === 'KeyJ' ? 'punch' : key === 'k' || code === 'KeyK' ? 'kick' : null;
    const control = action || (key === 'escape' ? 'leave' : null);
    if (!control || held.has(control)) return;
    // Existing document-level Escape handlers close the current help/sidebar
    // before another press can disengage. Other combat keys remain available.
    if (control === 'leave' && explorationPopupOpen()) return;
    if (control === 'leave' ? !canLeave() : !canAttack()) return;
    held.add(control);
    event.preventDefault?.();
    event.stopPropagation?.();
    if (control === 'leave') disengage(event);
    else attack(control, { target: event.target });
  }
  function keyUp(event) {
    const key = String(event.key || '').toLowerCase(), code = String(event.code || '');
    if (key === 'j' || code === 'KeyJ') held.delete('punch');
    if (key === 'k' || code === 'KeyK') held.delete('kick');
    if (key === 'escape') held.delete('leave');
  }
  const releaseHeld = () => held.clear();
  const environmentChanged = () => { releaseHeld(); render(); };
  close.addEventListener('click', dismiss);
  punch.addEventListener('click', punchClick);
  kick.addEventListener('click', kickClick);
  leave.addEventListener('click', disengage);
  keyboard.addEventListener('keydown', keyDown, true);
  keyboard.addEventListener('keyup', keyUp, true);
  keyboard.addEventListener('blur', releaseHeld);
  doc.addEventListener?.('visibilitychange', environmentChanged);
  desktop?.addEventListener?.('change', environmentChanged);

  return {
    update(next = {}) {
      if (disposed) return;
      const previous = state;
      state = { ...state, ...next };
      if (next.stage && next.stage !== previous.stage && !Object.hasOwn(next, 'message')) state.message = null;
      const nextGroup = state.stage === 'progress' ? 'progress' : 'combat';
      const oldGroup = previous.stage === 'progress' ? 'progress' : 'combat';
      const newEncounter = state.encounterId && state.encounterId !== previous.encounterId;
      if (newEncounter || nextGroup !== oldGroup || state.localPlayer !== previous.localPlayer
        || ['idle', 'seated'].includes(previous.stage)) { dismissed = false; ending = false; }
      if (!ownsEncounter()) { held.clear(); ending = false; }
      render();
    },
    reset() {
      if (disposed) return;
      state = { stage: 'idle', localPlayer: false, hits: 0, required: 3 };
      held.clear(); dismissed = false; ending = false;
      render();
    },
    isOpen: () => !disposed && !card.hidden,
    dispose() {
      if (disposed) return;
      disposed = true; held.clear(); card.hidden = true;
      close.removeEventListener('click', dismiss);
      punch.removeEventListener('click', punchClick);
      kick.removeEventListener('click', kickClick);
      leave.removeEventListener('click', disengage);
      keyboard.removeEventListener('keydown', keyDown, true);
      keyboard.removeEventListener('keyup', keyUp, true);
      keyboard.removeEventListener('blur', releaseHeld);
      doc.removeEventListener?.('visibilitychange', environmentChanged);
      desktop?.removeEventListener?.('change', environmentChanged);
      card.remove();
    },
  };
}
