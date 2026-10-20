import './recruiter-controls.css';

const ACTIVE_STAGES = new Set(['provoking', 'falling', 'grounded', 'recovering', 'approaching', 'fighting', 'slamming', 'returning']);
const ATTACK_STAGES = new Set(['nearby', 'provoking', 'falling', 'grounded', 'recovering', 'approaching', 'fighting']);
const SLAM_STAGES = new Set(['approaching', 'fighting']);
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
  const slam = element('button', 'recruiter-controls-attack recruiter-controls-slam', 'Choke slam · L');
  slam.type = 'button';
  slam.setAttribute('aria-keyshortcuts', 'L');
  const leave = element('button', 'recruiter-controls-leave', 'Step away · Esc');
  leave.type = 'button';
  leave.setAttribute('aria-keyshortcuts', 'Escape');
  actions.append(punch, kick, slam, leave);
  const special = element('p', 'recruiter-controls-special');
  const hint = element('p', 'recruiter-controls-hint', 'WASD or arrow keys to move. Step away to end the fight.');
  card.append(close, eyebrow, heading, status, health, actions, special, hint);
  container.append(card);

  let state = { stage: 'idle', localPlayer: false, slamReady: false };
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
  const canAttack = (type = 'punch') => available() && state.localPlayer === true
    && ATTACK_STAGES.has(state.stage) && !ending
    && (type !== 'slam' || (SLAM_STAGES.has(state.stage) && state.slamReady === true));
  const canLeave = () => available() && ownsEncounter() && state.stage !== 'returning' && !ending;

  function description() {
    if (state.message) return String(state.message);
    if (!state.localPlayer) return 'Another visitor has challenged the Product Manager. Give them a little room.';
    return ({
      nearby: 'Within reach. Press J to punch or K to kick the Product Manager recruiter.',
      provoking: 'Your move. Press J to punch or K to kick when you are close.',
      falling: 'The recruiter is taking a tumble. Your attacks still work at close range.',
      grounded: 'The recruiter is down. J punches and K kicks at close range.',
      recovering: 'The recruiter is getting up. J punches and K kicks still work.',
      approaching: 'The recruiter is coming over. Keep moving and face them to land a hit.',
      fighting: 'J to punch · K to kick. Your hits connect when you are close.',
      slamming: 'Choke slam in motion. Let the move finish, or press Esc to step away safely.',
      returning: 'That is enough for now. The recruiter is heading back.',
    })[state.stage] || '';
  }
  function slamDescription() {
    if (state.slamReady === true && SLAM_STAGES.has(state.stage)) return 'Choke slam ready · L';
    const now = Number.isFinite(state.now) ? state.now : Date.now();
    const cooldown = Number.isFinite(state.slamReadyAt) ? Math.max(0, Math.ceil((state.slamReadyAt - now) / 1000)) : 0;
    const hits = Number.isFinite(state.slamHits) ? bounded(state.slamHits, 0, 3) : null;
    if (cooldown > 0) return hits === null
      ? `Choke slam recharges in ${cooldown}s.`
      : `Choke slam: ${cooldown}s cooldown · ${hits}/3 hits.`;
    if (hits === 3 || state.slamReady === true) return SLAM_STAGES.has(state.stage)
      ? 'Three hits landed. Make a little room for the choke slam.'
      : 'Three hits landed. Wait until the recruiter stands for a choke slam.';
    return hits === null || hits === 0
      ? 'Land three hits to ready a choke slam · L.'
      : `Choke slam: ${hits}/3 hits. Keep landing punches or kicks.`;
  }
  function putText(node, text) {
    // In particular, do not repeatedly announce an unchanged status at 60 fps.
    if (node.textContent !== text) node.textContent = text;
  }
  function render() {
    const relevant = state.stage === 'nearby' || ACTIVE_STAGES.has(state.stage);
    card.hidden = !relevant || dismissed || !available();
    card.setAttribute('data-local', state.localPlayer ? 'true' : 'false');
    card.setAttribute('data-stage', state.stage);
    putText(heading, state.stage === 'nearby' ? 'Product Manager recruiter' : 'Product Manager showdown');
    putText(status, description());
    const showHealth = state.localPlayer && ACTIVE_STAGES.has(state.stage)
      && (Number.isFinite(state.playerHealth) || Number.isFinite(state.recruiterHealth));
    health.hidden = !showHealth;
    if (showHealth) putText(health, `You ${bounded(state.playerHealth, 100)} · Recruiter ${bounded(state.recruiterHealth, 100)}`);
    actions.hidden = !state.localPlayer || !ATTACK_STAGES.has(state.stage);
    special.hidden = actions.hidden;
    if (!special.hidden) putText(special, slamDescription());
    special.setAttribute('data-ready', state.slamReady === true && SLAM_STAGES.has(state.stage) ? 'true' : 'false');
    hint.hidden = actions.hidden;
    putText(hint, state.stage === 'nearby'
      ? 'Walk close and use the keys. No bumping or clicking needed.'
      : 'WASD or arrow keys to move. Step away to end the fight.');
    punch.disabled = kick.disabled = !canAttack();
    slam.disabled = !canAttack('slam');
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
    if (!canAttack(type) || (event && (isEditable(event.target) || event.defaultPrevented))) return false;
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
  const slamClick = event => attack('slam', event);
  function keyDown(event) {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229
      || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isEditable(event.target)
      || blockedAncestry(event.target) || !available()) return;
    const key = String(event.key || '').toLowerCase();
    const code = String(event.code || '');
    const action = key === 'j' || code === 'KeyJ' ? 'punch' : key === 'k' || code === 'KeyK' ? 'kick'
      : key === 'l' || code === 'KeyL' ? 'slam' : null;
    const control = action || (key === 'escape' ? 'leave' : null);
    if (!control || held.has(control)) return;
    // Existing document-level Escape handlers close the current help/sidebar
    // before another press can disengage. Other combat keys remain available.
    if (control === 'leave' && explorationPopupOpen()) return;
    if (control === 'leave' ? !canLeave() : !canAttack(control)) return;
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
    if (key === 'l' || code === 'KeyL') held.delete('slam');
    if (key === 'escape') held.delete('leave');
  }
  const releaseHeld = () => held.clear();
  const environmentChanged = () => { releaseHeld(); render(); };
  close.addEventListener('click', dismiss);
  punch.addEventListener('click', punchClick);
  kick.addEventListener('click', kickClick);
  slam.addEventListener('click', slamClick);
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
      const nextGroup = state.stage === 'nearby' ? 'nearby' : 'combat';
      const oldGroup = previous.stage === 'nearby' ? 'nearby' : 'combat';
      const newEncounter = state.encounterId && state.encounterId !== previous.encounterId;
      if (newEncounter || nextGroup !== oldGroup || state.localPlayer !== previous.localPlayer
        || ['idle', 'seated'].includes(previous.stage)) { dismissed = false; ending = false; }
      if (newEncounter || state.localPlayer !== previous.localPlayer) {
        if (!Object.hasOwn(next, 'slamReady')) state.slamReady = false;
        if (!Object.hasOwn(next, 'slamHits')) state.slamHits = 0;
        if (!Object.hasOwn(next, 'slamReadyAt')) state.slamReadyAt = null;
      }
      if (!ownsEncounter()) {
        if (state.stage !== 'nearby' || state.localPlayer !== true) held.clear();
        ending = false;
      }
      render();
    },
    reset() {
      if (disposed) return;
      state = { stage: 'idle', localPlayer: false, slamReady: false };
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
      slam.removeEventListener('click', slamClick);
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
