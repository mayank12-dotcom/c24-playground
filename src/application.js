export const jobs = [
  { id: 'product-designer', title: 'Product Designer', company: 'Forma', category: 'Design', location: 'Remote · Europe', salary: '$90k–$130k', type: 'Full-time', description: 'Make thoughtful tools for people doing their best work. Shape Forma’s collaborative workspace, from early sketches to the smallest interaction.', requirements: ['A portfolio that tells the story behind your decisions', 'Experience designing clear, accessible digital products', 'Comfort working closely with engineers'], color: '#dacafa' },
  { id: 'frontend-engineer', title: 'Frontend Engineer', company: 'Orbit', category: 'Engineering', location: 'Remote · Worldwide', salary: '$110k–$160k', type: 'Full-time', description: 'Build a friendlier corner of the internet. Help our small team turn ambitious ideas into fast, delightful web experiences.', requirements: ['Strong JavaScript and browser fundamentals', 'Care for performance and accessibility', 'Experience shipping interactive web applications'], color: '#bddccb' },
  { id: 'brand-designer', title: 'Brand Designer', company: 'Goodkind', category: 'Design', location: 'London · Hybrid', salary: '£55k–£75k', type: 'Full-time', description: 'Give good ideas a distinctive voice. Create identities, campaigns, and playful visual systems for a new generation of independent businesses.', requirements: ['A distinctive visual portfolio', 'Strong typography and storytelling skills', 'Curiosity across illustration, motion, and digital design'], color: '#f1cbbf' },
  { id: 'product-manager', title: 'Product Manager', company: 'Sunday', category: 'Product', location: 'New York · Hybrid', salary: '$120k–$165k', type: 'Full-time', description: 'Help people make more space for life. Guide a small cross-functional team building simple financial tools for everyday decisions.', requirements: ['Experience taking a product from insight to launch', 'Clear communication and thoughtful prioritization', 'A habit of listening to customers'], color: '#f1df9e' },
  { id: 'creative-developer', title: 'Creative Developer', company: 'Playground', category: 'Engineering', location: 'Remote · Worldwide', salary: '$85k–$125k', type: 'Full-time', description: 'Bring unexpected ideas to the browser. Build expressive websites, small experiments, and interactive experiences with a team that loves to play.', requirements: ['A portfolio of interactive experiments', 'JavaScript, CSS, and a feel for motion', 'Interest in WebGL and creative coding'], color: '#c4d5ef' },
  { id: 'community-lead', title: 'Community Lead', company: 'Common Ground', category: 'Community', location: 'Remote · Americas', salary: '$70k–$95k', type: 'Full-time', description: 'Help independent makers find their people. Build welcoming rituals, thoughtful events, and meaningful connections across our growing community.', requirements: ['Experience bringing people together', 'Warm, clear written communication', 'Care for inclusive and welcoming spaces'], color: '#e8c7da' },
  { id: 'data-analyst', title: 'Data Analyst', company: 'Fieldwork', category: 'Data', location: 'Berlin · Hybrid', salary: '€65k–€90k', type: 'Full-time', description: 'Find the useful stories hiding in everyday data. Partner with our product team to turn questions into evidence and evidence into better decisions.', requirements: ['Confidence with SQL and practical analysis', 'Ability to explain findings simply', 'An inquisitive approach to product questions'], color: '#c7ddbc' },
  { id: 'content-strategist', title: 'Content Strategist', company: 'Little Things', category: 'Marketing', location: 'Remote · Europe', salary: '€55k–€80k', type: 'Full-time', description: 'Make complicated things feel human. Shape our editorial voice and help people discover products made with a little more care.', requirements: ['A portfolio of clear, compelling writing', 'Experience planning useful content', 'An eye for voice, structure, and detail'], color: '#eccba9' },
  { id: 'design-intern', title: 'Design Intern', company: 'Studio Elsewhere', category: 'Design', location: 'Remote · Worldwide', salary: '$25–$35 / hour', type: 'Paid internship', description: 'Start somewhere unexpected. Explore research, interface design, and visual storytelling alongside a small independent design studio.', requirements: ['A few projects you are excited to share', 'Curiosity and openness to feedback', 'Availability for a 12-week paid internship'], color: '#d4cee8' },
];

const STORAGE_KEY = 'meetspace-applications-v1';
const questions = job => [
  `Hi there! I’m the hiring host for ${job.company}. What should we call you, and what drew you to this ${job.title} role?`,
  'Tell us about a project or experience you’re proud of. What was your contribution?',
  'What would you like to learn or work on in your next role?',
  'Do you have a portfolio or profile link to share? You can also type “skip”.',
];
const el = (tag, className, value) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
};
const button = (label, className, action) => {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
};

export function createApplication({ root, onApply = () => {}, onLeave = () => {}, onNavigate = () => {}, onMessage = () => {}, canApply, canChallenge = () => false, onChallenge = () => {}, onCancelApply = () => {} }) {
  let sessions = {};
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    for (const job of jobs) {
      const entry = stored?.[job.id];
      if (entry && Array.isArray(entry.answers) && entry.answers.length <= 4 && entry.answers.every(a => typeof a === 'string' && a.length <= 3000)) {
        sessions[job.id] = { answers: entry.answers, updated: Number(entry.updated) || 0 };
      }
    }
  } catch { /* Storage may be unavailable in private browsing. */ }
  let view = 'explore';
  let activeId = null;
  let search = '';
  let seatedId = null;
  const leaveSeat = event => { if (seatedId) { seatedId = null; onLeave(event); } };
  let occupancy = {};
  let pendingJob = null;
  let pendingCancelled = false;
  function cancelPending() {
    if (pendingJob && !pendingCancelled) { pendingCancelled = true; onCancelApply(); }
  }
  let applyError = '';
  const available = job => typeof canApply === 'function' ? Boolean(canApply(job)) : !occupancy[job.id];
  function updateAvailability() {
    if (view !== 'job') return;
    const job = jobs.find(j => j.id === activeId);
    const apply = root.querySelector('.app-apply');
    const note = root.querySelector('.app-availability');
    if (!job || !apply || !note) return;
    const free = available(job);
    const challengeable = !free && Boolean(canChallenge(job));
    apply.disabled = Boolean(pendingJob) || (!free && !challengeable);
    apply.textContent = pendingJob === job.id ? 'Getting your seat…' : challengeable ? 'Push the bot · Take this seat' : sessions[job.id] ? 'Continue application ↗' : 'Apply · Start conversation ↗';
    note.textContent = applyError || (challengeable ? 'Give the bot a playful push. Once it tumbles clear, settle into the chair and start your application.' : !free ? 'This table is occupied. Explore another role or check back shortly.' : 'A short, conversational demo. No CV upload needed.');
  }
  function setOccupancy(seats) {
    occupancy = seats && typeof seats === 'object' ? { ...seats } : {};
    updateAvailability();
  }
  async function startChat(job) {
    if (pendingJob) return false;
    const alreadySeated = seatedId === job.id;
    activeId = job.id; view = 'job'; applyError = '';
    if (!available(job)) { render(); return false; }
    pendingCancelled = false; pendingJob = job.id; render();
    let claimed = false;
    try {
      claimed = (await onApply(job)) !== false;
      if (!claimed) applyError = 'That seat is unavailable. Please try another table.';
    } catch {
      applyError = 'We couldn’t start the conversation. Please try again.';
    } finally {
      pendingJob = null;
    }
    if (pendingCancelled || view !== 'job' || activeId !== job.id) {
      // Canceling a new seat claim must release it, but browsing the roster
      // while starting a conversation at an existing chair keeps that seat.
      if (claimed && !alreadySeated) { seatedId = null; onLeave(); }
      updateAvailability();
      return false;
    }
    if (!claimed) { render(); return false; }
    seatedId = job.id;
    if (!sessions[job.id]) { sessions[job.id] = { answers: [], updated: Date.now() }; save(); }
    view = 'chat'; render();
    onMessage(sessions[job.id].answers.length === 4 ? 'Welcome back! Your demo conversation is complete.' : questions(job)[sessions[job.id].answers.length]);
    return true;
  }
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)); } catch { /* Chat continues in memory. */ } };
  root.classList.add('app-sidebar');
  root.setAttribute('aria-label', 'Jobs and application conversations');
  // Keyboard movement handlers can also check defaultPrevented.
  root.addEventListener('keydown', event => event.stopPropagation());
  root.addEventListener('keyup', event => event.stopPropagation());

  function render() {
    root.replaceChildren();
    const head = el('div', 'app-sidebar-head');
    head.append(el('span', 'app-eyebrow', 'OPPORTUNITIES & CONVERSATIONS'));
    const tabs = el('div', 'app-tabs');
    const exploreTab = button('Explore', `app-tab ${view !== 'chats' && view !== 'chat' ? 'is-active' : ''}`, () => showExplore());
    const chatsTab = button(`Chats · ${Object.keys(sessions).length}`, `app-tab ${view === 'chats' || view === 'chat' ? 'is-active' : ''}`, event => { cancelPending(); leaveSeat(event); view = 'chats'; render(); });
    exploreTab.setAttribute('aria-pressed', String(view === 'explore' || view === 'job'));
    chatsTab.setAttribute('aria-pressed', String(view === 'chats' || view === 'chat'));
    tabs.append(exploreTab, chatsTab);
    head.append(tabs);
    root.append(head);
    const body = el('div', 'app-sidebar-body');
    root.append(body);
    if (view === 'explore') renderExplore(body);
    if (view === 'job') renderJob(body, jobs.find(j => j.id === activeId));
    if (view === 'chats') renderChats(body);
    if (view === 'chat') renderChat(body, jobs.find(j => j.id === activeId));
    if (view !== 'chat') root.append(el('p', 'app-demo-note', 'A little world of possibilities. Fictional roles, real curiosity.'));
  }

  function roleCard(job, action, subtitle) {
    const card = button('', 'app-role-card', action);
    const icon = el('span', 'app-company-icon', job.company.slice(0, 1));
    icon.style.backgroundColor = job.color;
    const info = el('span', 'app-role-info');
    info.append(el('span', 'app-role-company', job.company), el('span', 'app-role-title', job.title), el('span', 'app-role-meta', subtitle || job.location));
    card.append(icon, info, el('span', 'app-role-arrow', '↗'));
    return card;
  }

  function renderExplore(body) {
    body.append(el('h2', 'app-title', 'Find your people.'), el('p', 'app-description', 'Take a walk. Pull up a chair. Your next opportunity might be just over there.'));
    const searchLabel = el('label', 'app-search-label');
    searchLabel.append(el('span', 'app-sr-only', 'Search roles or companies'));
    const input = el('input', 'app-search');
    input.type = 'search'; input.placeholder = 'Search roles or companies…'; input.value = search;
    searchLabel.append(input); body.append(searchLabel);
    const count = el('p', 'app-list-label');
    const list = el('div', 'app-role-list');
    const update = () => {
      list.replaceChildren();
      const matches = jobs.filter(job => `${job.title} ${job.company} ${job.category} ${job.location}`.toLowerCase().includes(search.toLowerCase().trim()));
      count.textContent = `${matches.length} OPEN ${matches.length === 1 ? 'ROLE' : 'ROLES'} · DEMO`;
      for (const job of matches) list.append(roleCard(job, () => onNavigate(job.id)));
      if (!matches.length) list.append(el('p', 'app-empty', 'No roles found. Try “design” or “remote”.'));
    };
    input.addEventListener('input', () => { search = input.value; update(); });
    body.append(count, list); update();
  }

  function renderJob(body, job) {
    if (!job) return;
    body.append(button('← All opportunities', 'app-back', () => showExplore()));
    const identity = el('div', 'app-job-identity');
    const logo = el('span', 'app-company-icon app-company-icon-large', job.company.slice(0, 1)); logo.style.backgroundColor = job.color;
    identity.append(logo, el('span', 'app-role-company', job.company)); body.append(identity);
    body.append(el('h2', 'app-title', job.title));
    const tags = el('div', 'app-tags');
    [job.location, job.type, job.salary].forEach(value => tags.append(el('span', 'app-tag', value)));
    body.append(tags, el('h3', 'app-section-title', 'A little about the role'), el('p', 'app-description', job.description), el('h3', 'app-section-title', 'You might be a good fit if…'));
    const reqs = el('ul', 'app-requirements'); job.requirements.forEach(req => reqs.append(el('li', '', req))); body.append(reqs);
    const apply = button('Apply · Start conversation ↗', 'app-primary app-apply', () => {
      if (pendingJob) return false;
      if (!available(job) && canChallenge(job)) {
        applyError = '';
        return onChallenge(job);
      }
      return startChat(job);
    });
    const note = el('p', 'app-fine-print app-availability');
    note.setAttribute('role', 'status');
    body.append(apply, note);
    updateAvailability();
  }

  function renderChats(body) {
    body.append(el('h2', 'app-title', 'Conversations'), el('p', 'app-description', 'Pick up where you left off. Your answers are saved in this browser.'));
    const entries = jobs.filter(j => sessions[j.id]).sort((a, b) => sessions[b.id].updated - sessions[a.id].updated);
    if (!entries.length) body.append(el('div', 'app-empty', 'No conversations yet. Visit a table and click Apply to start a conversation.'));
    for (const job of entries) body.append(roleCard(job, () => showChat(job.id), sessions[job.id].answers.length === 4 ? 'Demo complete · View conversation' : `${sessions[job.id].answers.length} of 4 questions answered`));
  }

  function renderChat(body, job) {
    if (!job || !sessions[job.id]) return;
    const session = sessions[job.id];
    body.classList.add('app-chat-body');
    body.append(button('← Your conversations', 'app-back', event => { cancelPending(); leaveSeat(event); view = 'chats'; render(); }));
    const header = el('div', 'app-chat-header');
    header.append(el('span', 'app-eyebrow', job.company), el('h2', 'app-chat-title', job.title), el('p', 'app-role-meta', session.answers.length === 4 ? 'Demo conversation complete' : `Question ${session.answers.length + 1} of 4 · Take your time`));
    const progress = el('progress', 'app-progress'); progress.max = 4; progress.value = session.answers.length; progress.setAttribute('aria-label', 'Questions answered'); header.append(progress); body.append(header);
    const messages = el('div', 'app-messages'); messages.setAttribute('role', 'log'); messages.setAttribute('aria-label', 'Application conversation'); messages.setAttribute('aria-live', 'polite');
    const qs = questions(job);
    for (let i = 0; i <= session.answers.length && i < qs.length; i++) {
      messages.append(message(qs[i], false, job.company));
      if (session.answers[i]) messages.append(message(session.answers[i], true, 'You'));
    }
    if (session.answers.length === 4) messages.append(message('Thanks for sharing a little of your story! You’ve reached the end of this demo. Nothing has been submitted to an employer.', false, job.company));
    body.append(messages);
    if (session.answers.length < 4) {
      const form = el('form', 'app-chat-form');
      const label = el('label', 'app-sr-only', 'Your answer'); label.htmlFor = 'app-answer';
      const textarea = el('textarea', 'app-answer'); textarea.id = 'app-answer'; textarea.placeholder = 'A little about you…'; textarea.maxLength = 3000; textarea.rows = 3; textarea.required = true;
      const send = el('button', 'app-primary', 'Send answer ↑'); send.type = 'submit';
      form.append(label, textarea, send, el('p', 'app-fine-print', 'Enter to send · Shift + Enter for a new line'));
      textarea.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
      form.addEventListener('submit', e => {
        e.preventDefault(); const answer = textarea.value.trim(); if (!answer) { textarea.focus(); return; }
        session.answers.push(answer); session.updated = Date.now(); save();
        onMessage(session.answers.length < 4 ? qs[session.answers.length] : 'Thanks for sharing your story!'); render();
        root.querySelector('.app-answer')?.focus({ preventScroll: true });
      }); body.append(form);
    } else {
      body.append(el('div', 'app-complete', '✓ Demo complete. No application was submitted.'));
    }
    body.append(button('Leave table & explore ↗', 'app-leave', event => { leaveSeat(event); showExplore(); }), el('p', 'app-fine-print', 'Demo only · Answers stay in this browser. Avoid sensitive information.'));
    requestAnimationFrame(() => {
      messages.scrollTop = messages.scrollHeight;
      if (view === 'chat' && activeId === job.id) root.querySelector('.app-answer')?.focus({ preventScroll: true });
    });
  }
  function message(value, own, name) {
    const wrap = el('div', `app-message ${own ? 'app-message-own' : ''}`);
    wrap.append(el('span', 'app-message-author', name), el('p', 'app-message-text', value)); return wrap;
  }
  function showJob(job) {
    const known = jobs.find(j => j.id === job?.id); if (!known) return;
    if (pendingJob === known.id && pendingCancelled) return;
    if (pendingJob && pendingJob !== known.id) cancelPending();
    if (activeId === known.id && view === 'chat') return;
    if (seatedId && seatedId !== known.id) leaveSeat();
    activeId = known.id; view = 'job'; applyError = ''; render();
  }
  // Opening the roster is navigation within the sidebar. The world owns the
  // physical departure when a different chair is selected through onNavigate.
  function showExplore() { cancelPending(); view = 'explore'; render(); }
  async function showChat(id) {
    const job = jobs.find(j => j.id === id); if (!job || !sessions[id]) return false;
    // Saved conversations use the same chair-first flow as new roles. The
    // seated role offers Continue without exposing details during the walk.
    if (seatedId !== id) { onNavigate(id); return false; }
    return startChat(job);
  }
  render();
  return { showJob, showExplore, showChat, setOccupancy, cancelPending, markSeated: id => { seatedId = id; }, markStanding: () => { seatedId = null; }, getSessions: () => JSON.parse(JSON.stringify(sessions)) };
}
