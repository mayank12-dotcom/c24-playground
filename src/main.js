import { createIcons, Armchair, ArrowUpRight, Keyboard, LocateFixed, Minus, Plus, X, Move, ZoomIn, Shuffle } from 'lucide';
import { createWorld } from './world.js';
import { jobs, createApplication } from './application.js';
import { createPresence } from './presence.js';
import { getBotOccupiedJobs } from './crowd.js';
import { createFloatingPanel } from './panels.js';
import { createBotChallenge } from './bot-challenge.js';
import { createRecruiterControls } from './recruiter-controls.js';
import { renderInfoSidebar } from './info-sidebar.js';
import { createBackgroundMusic } from './background-music.js';
import { createFootstepAudio } from './footstep-audio.js';
import { createSampleAudio } from './sample-audio.js';
import { createButtonAudio } from './button-audio.js';
import { createFightAudio } from './fight-audio.js';
import { createNamePrompt } from './name-prompt.js';
import './style.css';
import './application.css';
import './name-prompt.css';

createIcons({ icons: { Armchair, ArrowUpRight, Keyboard, LocateFixed, Minus, Plus, X, Move, ZoomIn, Shuffle }, attrs: { 'stroke-width': 1.7 } });
const $ = id => document.getElementById(id);
const desktopViewport = window.matchMedia('(min-width: 1280px)');
let visitorName = null;
const namePrompt = createNamePrompt({
  document, window, mediaQuery: desktopViewport,
  onComplete(name) {
    visitorName = name;
    startWorld();
  }
});
visitorName = namePrompt.getName();
const footstepAudio = createFootstepAudio({
  document, window, mediaQuery: desktopViewport, button: $('music-toggle'), enabled: false,
  sources: ['/audio/step-1.wav', '/audio/step-2.wav', '/audio/step-3.wav', '/audio/step-4.wav'],
  volume: 0.4
});
const dismissAudio = createSampleAudio({
  document, window, mediaQuery: desktopViewport, button: $('music-toggle'), enabled: false,
  sources: ['/audio/dismiss.wav'], volume: 0.4, maxVoices: 1
});
const buttonAudio = createButtonAudio({
  root: $('app'), document, window, mediaQuery: desktopViewport, button: $('music-toggle'), enabled: false,
  src: '/audio/click.wav', volume: 0.4
});
const fightAudio = createFightAudio({
  document, window, mediaQuery: desktopViewport, button: $('music-toggle'), enabled: false,
  sources: ['/audio/fight-1.wav', '/audio/fight-2.wav', '/audio/fight-3.wav', '/audio/click.wav'],
  volume: 0.45, innerRadius: 3, outerRadius: 10
});
const recruiterFightAudio = createFightAudio({
  document, window, mediaQuery: desktopViewport, button: $('music-toggle'), enabled: false,
  sources: ['/audio/fight-1.wav', '/audio/fight-2.wav', '/audio/fight-3.wav', '/audio/click.wav'],
  volume: 0.45, innerRadius: 3, outerRadius: 10
});
const dismissedEvents = new WeakSet();
function playDismiss(event) {
  // One Escape can close more than one window. Keep its feedback to one whoosh.
  if (event && typeof event === 'object') {
    if (dismissedEvents.has(event)) return;
    dismissedEvents.add(event);
  }
  dismissAudio.unlock(event);
  dismissAudio.play();
}
createBackgroundMusic({
  button: $('music-toggle'), document, window, mediaQuery: desktopViewport,
  src: '/audio/background.mp3', volume: 0.06,
  onChange({ enabled }) {
    footstepAudio.setEnabled(enabled);
    dismissAudio.setEnabled(enabled);
    buttonAudio.setEnabled(enabled);
    fightAudio.setEnabled(enabled);
    recruiterFightAudio.setEnabled(enabled);
    $('music-icon-on').hidden = !enabled;
    $('music-icon-off').hidden = enabled;
    $('music-label').textContent = enabled ? 'Sound on' : 'Sound off';
    $('music-toggle').setAttribute('aria-label', enabled ? 'Mute all sounds' : 'Play all sounds');
    $('music-toggle').setAttribute('title', enabled ? 'Mute all sounds' : 'Play all sounds');
  }
});
$('music-toggle').addEventListener('click', event => {
  footstepAudio.unlock(event);
  dismissAudio.unlock(event);
  buttonAudio.playClick(event);
  fightAudio.unlock(event);
  recruiterFightAudio.unlock(event);
});
let world, presence;
let worldGeneration = 0;
let seatedJobId = null, toastTimer;
let seatOwners = {}, lastSnapshot = null;
let claimInFlight = null, claimGeneration = 0, releasePending = Promise.resolve();
let networkReleasePending = Promise.resolve(), seatReleaseTask = null, gettingUp = false;
let botDefeats = {}, challengeBusy = false, recruiterCombatActive = false;
$('seats-toggle').addEventListener('click', () => setPanelMode('jobs'));
const opportunityPanel = createFloatingPanel({ panel: $('opportunity-panel'), toggle: $('seats-toggle'), close: $('panel-close'), onChange: syncSeatedNudge, onDismiss: playDismiss });

function setPanelMode(mode) {
  $('sidebar').hidden = mode !== 'jobs';
  $('info-sidebar').hidden = mode !== 'info';
  $('opportunity-title').textContent = mode === 'info' ? 'CARS24' : 'Your Current Next Chapter';
  $('panel-close').setAttribute('aria-label', mode === 'info' ? 'Close CARS24 information' : 'Close Your Current Next Chapter');
}

function syncSeatedNudge(panelOpen = opportunityPanel.isOpen()) {
  const job = jobs.find(item => item.id === seatedJobId);
  const show = desktopViewport.matches && !panelOpen && !gettingUp && !recruiterCombatActive && job && world?.isSeatReady(job.id);
  $('seated-nudge').hidden = !show;
  if (show) $('seated-nudge-label').textContent = `You’re seated at ${job.title}.`;
}

const botChallenge = createBotChallenge({
  container: $('world').parentElement,
  onHit: hitBot,
  onStrike() { world?.bumpBot(botChallenge.getJobId()); },
  onDismiss: playDismiss,
  onCancel() { claimGeneration++; world?.cancelBotChallenge(); }
});

const recruiterControls = createRecruiterControls({
  container: $('world').parentElement, window, document,
  onAttack(type) { return world?.attackRecruiter?.(type) ?? false; },
  onDisengage() { return world?.endRecruiterFight?.() ?? false; },
  onDismiss: playDismiss,
});

function notify(message) {
  $('world-notice').textContent = message;
  $('world-notice').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('world-notice').classList.remove('visible'), 4000);
}
function canApply(job) {
  return !getBotOccupiedJobs(Date.now(), jobs, botDefeats).includes(job.id) && (!seatOwners[job.id] || seatOwners[job.id] === presence?.id);
}
function canChallenge(job) {
  return getBotOccupiedJobs(Date.now(), jobs, botDefeats).includes(job.id) && (!seatOwners[job.id] || seatOwners[job.id] === 'bot');
}
async function hitBot(job) {
  if (!world || !presence || challengeBusy || claimInFlight || !world.isNearBotSeat(job.id)) return { jobId:job.id,hits:0,required:1,won:false,reason:'too-far' };
  if (world.canPushBot && !world.canPushBot(job.id)) return { jobId:job.id,hits:0,required:1,won:false,reason:'space-needed' };
  const activeWorld = world, activePresence = presence;
  challengeBusy = true;
  const generation = claimGeneration;
  try {
    activePresence.update(activeWorld.getPlayerState());
    const result = await activePresence.challengeBot(job.id);
    if (generation !== claimGeneration || world !== activeWorld || presence !== activePresence || botChallenge.getJobId() !== job.id || !activeWorld.isNearBotSeat(job.id)) {
      if (result.won) await activePresence.releaseSeat();
      return { ...result, won:false, reason:'cancelled' };
    }
    if (result.won) {
      activeWorld.pushBot?.(job.id);
      if (activeWorld.sitAt(job.id)) {
        botChallenge.close();
        notify('A playful push. Your seat is on its way.');
      } else {
        await activePresence.releaseSeat();
        return { ...result, won:false, reason:'occupied' };
      }
    }
    return result;
  } finally { challengeBusy = false; }
}
function refreshOccupancy(snapshot = lastSnapshot) {
  const realSeats = snapshot?.seats || {};
  if (snapshot) botDefeats = { ...(snapshot.botDefeats || {}) };
  seatOwners = { ...Object.fromEntries(getBotOccupiedJobs(Date.now(), jobs, botDefeats).map(id => [id, 'bot'])), ...realSeats };
  application.setOccupancy(seatOwners);
  world?.setBotDefeats(botDefeats);
  const foreignSeats = Object.fromEntries(Object.entries(realSeats).filter(([, owner]) => owner !== presence?.id));
  world?.setSeatOccupancy(foreignSeats);
  world?.setVisitors((snapshot?.visitors || []).filter(visitor => visitor.id !== presence?.id));
  if (snapshot?.serverTime) world?.setServerTime?.(snapshot.serverTime);
  world?.setRecruiterEncounter?.(snapshot?.recruiterEncounter ?? null, presence?.id);
  const challengedJob=botChallenge.getJobId();
  if(challengedJob&&realSeats[challengedJob]&&realSeats[challengedJob]!==presence?.id){
    if(challengeBusy)claimGeneration++;
    botChallenge.close();world?.cancelBotChallenge();
  }
  const available = jobs.filter(canApply).length;
  $('world-count').textContent = `${available} available ${available === 1 ? 'seat' : 'seats'}`;
  $('seats-toggle').setAttribute('aria-label', `Your Current Next Chapter: ${available} available ${available === 1 ? 'seat' : 'seats'}`);

}
function releaseServerSeat(activePresence = presence) {
  networkReleasePending = networkReleasePending.catch(() => {}).then(() => activePresence?.releaseSeat());
  return networkReleasePending;
}
function releaseSeat() {
  if (seatReleaseTask) return seatReleaseTask;
  claimGeneration++;
  const activeWorld = world, activePresence = presence, hadSeat = Boolean(seatedJobId);
  // Publish this task before standUp: even a synchronous completion callback
  // must see the same exit rather than starting a second release.
  let finish, fail;
  const task = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
  seatReleaseTask = task;
  releasePending = task;
  (async () => {
    await activeWorld?.standUp();
    if (world !== activeWorld || presence !== activePresence) return;
    if (!hadSeat) releaseServerSeat(activePresence);
    await networkReleasePending;
  })().then(finish, fail).finally(() => { if (seatReleaseTask === task) seatReleaseTask = null; });
  return task;
}
async function ensureSeat(job) {
  const activeWorld = world, activePresence = presence;
  const isCurrent = () => world === activeWorld && presence === activePresence;
  if (!activeWorld || !canApply(job)) { activeWorld?.clearSeatRequest(); notify('That seat is occupied. Try another place to sit.'); return false; }
  if (seatedJobId === job.id) return !gettingUp && activeWorld.isSeatReady(job.id);
  if (claimInFlight) {
    if (claimInFlight.id === job.id) return claimInFlight.promise;
    activeWorld.clearSeatRequest();
    return false;
  }
  if (seatedJobId) releaseSeat();
  const generation = ++claimGeneration;
  const pending = (async () => {
    await releasePending;
    if (generation !== claimGeneration || !isCurrent()) return false;
    const claimed = activePresence ? await activePresence.claimSeat(job.id) : true;
    if (generation !== claimGeneration || !isCurrent()) {
      if (claimed) await activePresence?.releaseSeat();
      activeWorld.clearSeatRequest();
      return false;
    }
    if (!claimed || !activeWorld.sitAt(job.id)) {
      if (claimed) await activePresence?.releaseSeat();
      activeWorld.clearSeatRequest();
      if (isCurrent()) notify('Someone reached that seat first. Try another place to sit.');
      return false;
    }
    return true;
  })();
  claimInFlight = { id: job.id, generation, promise: pending };
  try { return await pending; }
  finally { if (claimInFlight?.promise === pending) claimInFlight = null; }
}
function prepareJobNavigation(id) {
  if (seatedJobId === id) {
    const job = jobs.find(item => item.id === id);
    if (job&&world?.isSeatReady(id)) { setPanelMode('jobs'); application.showJob(job); opportunityPanel.open(); }
    return false;
  }
  if (seatedJobId) releaseSeat();
  else claimGeneration++;
  world?.clearSeatRequest();
  // Keep the roster available through the FAB, but discard any prior role
  // description while walking. Only a confirmed seat opens the new details.
  if (!seatedJobId) { setPanelMode('jobs'); application.showExplore(); }
  opportunityPanel.close();
  $('near-prompt').hidden = true;
  return true;
}
const application = createApplication({
  root: $('sidebar'), canApply, canChallenge,
  onChallenge(job) { if (prepareJobNavigation(job.id)) world?.goToJob(job.id);if(world?.isNearBotSeat(job.id))botChallenge.open(job); },
  onCancelApply() { claimGeneration++; world?.clearSeatRequest(); },
  async onApply(job) {
    const accepted = await ensureSeat(job);
    if (accepted) notify('Your conversation has started.');
    return accepted;
  },
  onLeave(event) {
    if (event) opportunityPanel.close({ dismissEvent: event });
    releaseSeat();
  },
  onNavigate(id) {
    if (prepareJobNavigation(id)) world?.goToJob(id);
  },
  onMessage(text) {
    world?.setTalking(true);
    world?.say(text, 'recruiter');
    setTimeout(() => world?.setTalking(false), 2200);
  }
});
function startWorld() {
  if (!desktopViewport.matches || world) return;
  if (!visitorName) { namePrompt.open(); return; }
  const generation = ++worldGeneration;
  const isCurrent = () => generation === worldGeneration;
  try {
    world = createWorld({
      container: $('world'), jobs, playerName: visitorName,
      onFootstep(event) {
        if (isCurrent()) footstepAudio.playStep(event);
      },
      onFightFrame(frame) {
        if (isCurrent()) fightAudio.update(frame);
      },
      onRecruiterFightFrame(frame) {
        if (isCurrent()) recruiterFightAudio.update(frame);
      },
      async onRecruiterAttack({ type } = {}) {
        if (!isCurrent() || !presence?.startRecruiterAttack || !world) return null;
        const activeWorld = world, activePresence = presence;
        activePresence.update(activeWorld.getPlayerState());
        const result = await activePresence.startRecruiterAttack(type);
        if (!isCurrent() || world !== activeWorld || presence !== activePresence) return null;
        activeWorld.setRecruiterEncounter?.(result?.recruiterEncounter ?? null, activePresence.id);
        return result;
      },
      onRecruiterFightChange(state) {
        if (!isCurrent()) return;
        const active = Boolean(state?.localPlayer && ['provoking', 'falling', 'grounded', 'recovering', 'approaching', 'fighting', 'slamming', 'returning'].includes(state.stage));
        if (active && !recruiterCombatActive) {
          claimGeneration++;
          application.cancelPending();
          botChallenge.close();
          world?.cancelBotChallenge();
          opportunityPanel.close();
          $('near-prompt').hidden = true;
        }
        recruiterCombatActive = active;
        recruiterControls.update(state);
        syncSeatedNudge();
      },
      onNear() {
        if (!isCurrent()) return;
        // Passing a desk must not reveal a role popup or replace sidebar content.
        $('near-prompt').hidden = true;
      },
      onBotNear(job) {
        if (!isCurrent()) return;
        if(job&&!seatedJobId&&canChallenge(job))botChallenge.open(job);
        else botChallenge.close();
      },
      onSelect(job) {
        if (!isCurrent()) return;
        // The world label's own handler starts the walk after this callback.
        prepareJobNavigation(job.id);
      },
      onInfoSelect(object) {
        if (!isCurrent()) return;
        renderInfoSidebar($('info-sidebar'), object);
        setPanelMode('info');
        opportunityPanel.open({ focus: true });
      },
      onNavigateIntent(id) {
        if (!isCurrent()) return;
        if(botChallenge.isOpen()&&id!==botChallenge.getJobId()){claimGeneration++;botChallenge.close();world?.cancelBotChallenge();}
        if (claimInFlight && claimInFlight.id !== id) {
          claimGeneration++; world?.clearSeatRequest();
          if (id === null && !seatedJobId) {
            setPanelMode('jobs'); application.showExplore(); opportunityPanel.close(); $('near-prompt').hidden = true;
          }
        }
      },
      onSeatRequest(job) {
        if (!isCurrent()) return;
        const requestingWorld = world;
        ensureSeat(job).catch(() => {
          if (!isCurrent() || world !== requestingWorld) return;
          requestingWorld.clearSeatRequest(); notify('We couldn’t reserve that chair. Please try again.');
        });
      },
      onSeat(job) {
        if (!isCurrent()) return;
        botChallenge.close();
        seatedJobId = job.id;
        gettingUp = false;
        opportunityPanel.close();
        $('near-prompt').hidden = true;
        presence?.update(world.getPlayerState());
      },
      onSeatReady(job) {
        if (!isCurrent()) return;
        if(seatedJobId!==job.id||gettingUp)return;
        if (job.kind === 'lounge') {
          opportunityPanel.close();
          notify('Take a moment. You’re settled in.');
          return;
        }
        setPanelMode('jobs');
        application.markSeated(job.id);
        application.showJob(job);
        opportunityPanel.open();
        $('near-prompt').hidden = true;
      },
      onStandUpStart(previousSeat, reason) {
        if (!isCurrent()) return;
        gettingUp = true;
        $('seats-toggle').disabled = true;
        claimGeneration++;
        application.cancelPending();
        botChallenge.close(); world?.cancelBotChallenge();
        opportunityPanel.close();
        $('near-prompt').hidden = true;
        syncSeatedNudge();
      },
      onStandUp(previousSeat, reason) {
        if (!isCurrent()) return;
        seatedJobId = null;
        gettingUp = false;
        $('seats-toggle').disabled = false;
        application.markStanding();
        const released = releaseServerSeat();
        if (!seatReleaseTask) releasePending = released;
        application.showExplore();
        setPanelMode('jobs');
        opportunityPanel.close(); $('near-prompt').hidden = true;
        syncSeatedNudge();
      },
      onMove(state) { if (isCurrent()) presence?.update(state); }
    });
    presence = createPresence({
      name: visitorName,
      onVisitors(snapshot) { if (isCurrent()) { lastSnapshot = snapshot; refreshOccupancy(snapshot); } },
      onStatus({ mode, message }) {
        if (!isCurrent()) return;
        $('presence-status').textContent = mode === 'shared' ? 'Live visitors connected' : mode === 'local' ? 'Live visitors unavailable' : 'Joining the world…';
        $('presence-status').title = mode === 'shared' ? message : mode === 'local' ? 'Other candidates cannot see you while the live connection is unavailable. Retrying automatically.' : 'Joining the shared office…';
        $('presence-status').parentElement.dataset.connection = mode;
      },
      onSeatLost() {
        if (!isCurrent()) return;
        if (seatedJobId) {
          releaseSeat();
          notify('Your seat was released after losing the live connection.');
        }
      }
    });
    presence.update(world.getPlayerState());
    refreshOccupancy();
    $('loading')?.remove();
  } catch (error) {
    console.error('Unable to start 3D world:', error);
    const loading = $('loading');
    if (loading) loading.innerHTML = '<strong>The 3D world couldn’t start.</strong><p>Try a browser with WebGL enabled. You can still explore roles in the sidebar.</p>';
  }
}
startWorld();
function stopWorld() {
  worldGeneration++;
  fightAudio.reset();
  recruiterFightAudio.reset();
  recruiterCombatActive = false;
  recruiterControls.reset();
  claimGeneration++;
  const previousWorld = world, previousPresence = presence;
  // Detach the old lifecycle before destroying it: its pending requests may
  // settle while a fresh desktop world is already claiming its own chair.
  world = undefined; presence = undefined;
  claimInFlight = null; seatReleaseTask = null;
  releasePending = Promise.resolve(); networkReleasePending = Promise.resolve();
  botChallenge.close();
  seatedJobId = null; gettingUp = false;
  $('seats-toggle').disabled = false;
  application.markStanding();
  previousPresence?.destroy(); previousWorld?.destroy();
  lastSnapshot = null; seatOwners = {}; botDefeats = {};
  $('near-prompt').hidden = true;
  opportunityPanel.close();
  syncSeatedNudge();
  application.showExplore();
  setPanelMode('jobs');
}
desktopViewport.addEventListener('change', () => {
  if (desktopViewport.matches) startWorld();
  else stopWorld();
});
$('zoom-in').addEventListener('click', () => world?.zoom(-2));
$('zoom-out').addEventListener('click', () => world?.zoom(2));
$('recenter').addEventListener('click', () => world?.recenter());
$('info-room-toggle').addEventListener('click', event => { opportunityPanel.close({ dismissEvent: event }); world?.goToInfoRoom(); });
$('reopen-job').addEventListener('click', () => {
  if (!seatedJobId || gettingUp || !world?.isSeatReady(seatedJobId)) { syncSeatedNudge(); return; }
  // The panel keeps its live description/chat DOM while hidden. Reopening it
  // preserves answers, draft text, and the already-owned chair.
  setPanelMode('jobs');
  opportunityPanel.open({ focus: true });
});
function setHelp(open, { dismissEvent } = {}) {
  const wasOpen = !$('controls-help').hidden;
  $('controls-help').hidden = !open;
  $('help-toggle').setAttribute('aria-expanded', String(open));
  if (!open && wasOpen && dismissEvent) playDismiss(dismissEvent);
}
$('help-toggle').addEventListener('click', event => setHelp($('controls-help').hidden, { dismissEvent: event }));
$('help-close').addEventListener('click', event => setHelp(false, { dismissEvent: event }));
$('shuffle-look').addEventListener('click', () => { world?.randomizeHair(); notify('A fresh look. Make yourself at home.'); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') setHelp(false, { dismissEvent: event }); });
window.addEventListener('pagehide', () => { stopWorld(); namePrompt.destroy(); opportunityPanel.destroy(); botChallenge.destroy(); recruiterControls.dispose(); }, { once: true });
