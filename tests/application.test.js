import assert from 'node:assert/strict';
import test from 'node:test';
class Node {
  constructor(tag) { this.tag=tag; this.children=[]; this.listeners={}; this.className=''; this.style={}; this.classList={add: (...names)=>{this.className += ' '+names.join(' ');}}; this.value=''; }
  append(...nodes){this.children.push(...nodes)}
  replaceChildren(...nodes){this.children=nodes}
  setAttribute(){}
  addEventListener(type, fn){this.listeners[type]=fn}
  querySelector(selector){return this.all().find(n=>n.className.split(' ').includes(selector.slice(1)))}
  all(){return this.children.flatMap(n=>[n,...n.all()])}
  focus(){this.focused=true}
}
globalThis.document={createElement: tag=>new Node(tag)};
const saved={}; globalThis.localStorage={getItem:k=>saved[k],setItem:(k,v)=>saved[k]=v};
globalThis.requestAnimationFrame=fn=>fn();
const {jobs,createApplication}=await import('../src/application.js');

test('manual conversation exits forward their original click for dismissal feedback', async t => {
  const previous = saved['meetspace-applications-v1'];
  t.after(() => {
    if (previous === undefined) delete saved['meetspace-applications-v1'];
    else saved['meetspace-applications-v1'] = previous;
  });
  for (const text of ['Leave table & explore', 'Your conversations', 'Chats ·']) {
    saved['meetspace-applications-v1'] = '{}';
    const root = new Node('aside'), exits = [];
    const app = createApplication({ root, onApply: () => true, onLeave: event => exits.push(event) });
    app.markSeated(jobs[0].id);
    app.showJob(jobs[0]);
    await root.querySelector('.app-apply').listeners.click();
    const control = root.all().find(node => node.tag === 'button' && node.textContent?.includes(text));
    assert.ok(control, `the ${text} exit is rendered`);
    const event = { type: 'click', target: control };
    control.listeners.click(event);
    assert.equal(exits.length, 1, 'the manual exit is reported once');
    assert.equal(exits[0], event, 'the caller can distinguish the real dismissal from automatic cleanup');
  }
});

test('application seat lifecycle, questions, persistence, and storage validation', async () => {
const root=new Node('aside');let applied=0,left=0;const navigated=[];
const app=createApplication({root,onApply:()=>applied++,onLeave:()=>left++,onNavigate:id=>navigated.push(id)});
const clickText=text=>{const node=root.all().find(n=>n.tag==='button' && n.textContent?.includes(text));assert.ok(node,`button ${text}`);return node.listeners.click();};
app.showJob(jobs[0]);await clickText('Apply ·');assert.equal(applied,1);assert.ok(root.querySelector('.app-answer').focused);
for(let i=0;i<4;i++){const input=root.querySelector('.app-answer');input.value=`Answer ${i}`;root.querySelector('.app-chat-form').listeners.submit({preventDefault(){}});}
assert.equal(app.getSessions()[jobs[0].id].answers.length,4);assert.ok(root.querySelector('.app-complete').textContent.includes('No application was submitted'));
clickText('Leave table & explore');assert.equal(left,1);assert.ok(root.querySelector('.app-search'));
assert.equal(await app.showChat(jobs[0].id),false);
assert.deepEqual(navigated,[jobs[0].id]);assert.equal(applied,1);
assert.ok(root.querySelector('.app-search'),'resuming while standing does not render the job description');
assert.equal(root.querySelector('.app-apply'),undefined);
app.markSeated(jobs[0].id);app.showJob(jobs[0]);
await app.showChat(jobs[0].id);assert.equal(applied,2);clickText('Chats ·');assert.equal(left,2);
const root2=new Node('aside');const restored=createApplication({root:root2});assert.equal(restored.getSessions()[jobs[0].id].answers.length,4);
saved['meetspace-applications-v1']=JSON.stringify({[jobs[0].id]:{answers:[7]},[jobs[1].id]:{answers:['valid'],updated:1}});
const validated=createApplication({root:new Node('aside')});assert.equal(Object.keys(validated.getSessions()).length,1);

saved['meetspace-applications-v1']='invalid JSON';
assert.deepEqual(createApplication({root:new Node('aside')}).getSessions(),{});
});

test('selecting a roster role requests its chair without rendering a job description', () => {
  const root=new Node('aside'),navigated=[];
  const app=createApplication({root,onNavigate:id=>navigated.push(id)});
  root.querySelector('.app-role-card').listeners.click();
  assert.deepEqual(navigated,[jobs[0].id]);
  assert.ok(root.querySelector('.app-search'),'the roster stays available until the world confirms seating');
  assert.equal(root.querySelector('.app-requirements'),undefined);
  assert.equal(root.querySelector('.app-apply'),undefined);
  app.markSeated(jobs[0].id);app.showJob(jobs[0]);
  assert.ok(root.querySelector('.app-requirements'));
  assert.ok(root.querySelector('.app-apply'));
});

test('All opportunities keeps the current chair until another role is selected', () => {
  const root = new Node('aside');
  const navigated = [];
  let left = 0;
  let app;
  app = createApplication({
    root,
    onLeave: () => left++,
    onNavigate: id => {
      navigated.push(id);
      // Re-selecting the current chair reopens its description, just as the
      // world coordinator does without asking the character to stand.
      if (id === jobs[0].id) app.showJob(jobs[0]);
    },
  });
  app.markSeated(jobs[0].id);
  app.showJob(jobs[0]);
  root.querySelector('.app-back').listeners.click();
  assert.ok(root.querySelector('.app-search'));
  assert.equal(left, 0, 'opening All opportunities is browse-only');

  root.querySelector('.app-role-card').listeners.click();
  assert.deepEqual(navigated, [jobs[0].id]);
  assert.ok(root.querySelector('.app-requirements'));
  assert.equal(left, 0, 'the current chair stays reserved when reselected');

  root.querySelector('.app-back').listeners.click();
  const nextRole = root.all().filter(node => node.className === 'app-role-card')[1];
  nextRole.listeners.click();
  assert.deepEqual(navigated, [jobs[0].id, jobs[1].id]);
  assert.equal(left, 0, 'the world coordinates the smooth exit and walk');
  assert.ok(root.querySelector('.app-search'), 'new details wait for confirmed seating');
  assert.equal(root.querySelector('.app-apply'), undefined);

  app.markStanding();
  app.markSeated(jobs[1].id);
  app.showJob(jobs[1]);
  assert.equal(root.querySelector('.app-title').textContent, jobs[1].title);
});

test('browsing opportunities preserves a seated conversation and its saved answers', async () => {
  saved['meetspace-applications-v1'] = '{}';
  const root = new Node('aside');
  let left = 0;
  const navigated = [];
  const app = createApplication({ root, onApply: () => true, onLeave: () => left++, onNavigate: id => navigated.push(id) });
  app.markSeated(jobs[3].id);
  app.showJob(jobs[3]);
  await root.querySelector('.app-apply').listeners.click();
  root.querySelector('.app-answer').value = 'I enjoy helping small teams build useful tools.';
  root.querySelector('.app-chat-form').listeners.submit({ preventDefault() {} });
  const exploreTab = root.all().find(node => node.tag === 'button' && node.textContent === 'Explore');
  exploreTab.listeners.click();
  assert.equal(left, 0);
  assert.ok(root.querySelector('.app-search'));
  assert.equal(await app.showChat(jobs[3].id), true);
  assert.deepEqual(navigated, [], 'resuming the same seated chat does not start another walk');
  assert.deepEqual(app.getSessions()[jobs[3].id].answers, ['I enjoy helping small teams build useful tools.']);
  assert.match(root.querySelector('.app-chat-header').all().find(node => node.className === 'app-role-meta').textContent, /Question 2/);
  assert.equal(left, 0);
  root.querySelector('.app-leave').listeners.click();
  assert.equal(left, 1, 'the explicit Leave table action still releases the chair');
  assert.ok(root.querySelector('.app-search'));
});

test('canceling pending chat startup from a confirmed chair keeps that chair', async () => {
  saved['meetspace-applications-v1'] = '{}';
  const root = new Node('aside');
  let finish;
  let left = 0;
  let cancellations = 0;
  const app = createApplication({
    root,
    onApply: () => new Promise(resolve => { finish = resolve; }),
    onLeave: () => left++,
    onCancelApply: () => cancellations++,
  });
  app.markSeated(jobs[6].id);
  app.showJob(jobs[6]);
  const pending = root.querySelector('.app-apply').listeners.click();
  root.querySelector('.app-back').listeners.click();
  assert.equal(cancellations, 1);
  assert.equal(left, 0);
  finish(true);
  assert.equal(await pending, false);
  assert.equal(left, 0, 'a late confirmation must not release an existing seat');
  assert.ok(root.querySelector('.app-search'));
  assert.equal(app.getSessions()[jobs[6].id], undefined);
});


test('async claims guard sessions, reject unavailable seats, and preserve chat input on occupancy updates', async () => {
  let resolveClaim;
  let calls = 0;
  const root = new Node('aside');
  const app = createApplication({root, onApply: () => { calls++; return new Promise(resolve => { resolveClaim = resolve; }); }});
  app.showJob(jobs[2]);
  const pending = root.querySelector('.app-apply').listeners.click();
  assert.equal(root.querySelector('.app-apply').disabled, true);
  assert.deepEqual(app.getSessions(), {});
  await root.querySelector('.app-apply').listeners.click();
  assert.equal(calls, 1);
  resolveClaim(false); await pending;
  assert.deepEqual(app.getSessions(), {});
  assert.match(root.querySelector('.app-availability').textContent, /unavailable/);
  app.setOccupancy({[jobs[2].id]: 'bot:host'});
  assert.equal(root.querySelector('.app-apply').disabled, true);
  app.setOccupancy({});
  assert.equal(root.querySelector('.app-apply').disabled, false);
  const successful = root.querySelector('.app-apply').listeners.click();
  resolveClaim(true); await successful;
  const answer = root.querySelector('.app-answer'); answer.value = 'An unfinished answer';
  app.setOccupancy({[jobs[3].id]: 'another-user'});
  assert.equal(root.querySelector('.app-answer'), answer);
  assert.equal(answer.value, 'An unfinished answer');
  app.showExplore();
  const rejectedRoot = new Node('aside');
  const throwing = createApplication({root:rejectedRoot,onApply:async()=>{throw new Error('offline')}});
  throwing.showJob(jobs[4]);
  await rejectedRoot.querySelector('.app-apply').listeners.click();
  assert.match(rejectedRoot.querySelector('.app-availability').textContent, /try again/);
  assert.equal(throwing.getSessions()[jobs[4].id], undefined);
});


test('navigating away while claim is pending never opens chat or creates a session', async () => {
  let resolveClaim; let left = 0;
  const root = new Node('aside');
  const app = createApplication({root, onApply: () => new Promise(resolve => { resolveClaim = resolve; }), onLeave: () => left++});
  app.showJob(jobs[6]);
  const pending = root.querySelector('.app-apply').listeners.click();
  app.showExplore();
  resolveClaim(true); await pending;
  assert.ok(root.querySelector('.app-search'));
  assert.equal(app.getSessions()[jobs[6].id], undefined);
  assert.equal(left, 1);
  app.markSeated(jobs[6].id);
  app.showJob(jobs[6]);
  assert.equal(left, 1);
  app.showExplore();
  assert.equal(left, 1, 'browsing from the confirmed chair does not release it');
});

test('leaving pending Apply immediately cancels the external claim before late seating callbacks', async () => {
  let finish; let cancellations = 0; let generation = 0;
  const root = new Node('aside');
  const app = createApplication({root,
    onCancelApply: () => { cancellations++; generation++; },
    onApply: async job => {
      const captured = generation;
      await new Promise(resolve => { finish = resolve; });
      if (captured !== generation) return false;
      app.markSeated(job.id); app.showJob(job);
      return true;
    },
  });
  app.showJob(jobs[8]);
  const pending = root.querySelector('.app-apply').listeners.click();
  app.showExplore();
  assert.equal(cancellations, 1);
  app.showExplore();
  assert.equal(cancellations, 1);
  finish(); await pending;
  assert.ok(root.querySelector('.app-search'));
  assert.equal(app.getSessions()[jobs[8].id], undefined);
});

test('bot challenges do not start an application and a won seat returns to Apply', async () => {
  saved['meetspace-applications-v1'] = '{}';
  const root = new Node('aside');
  const job = jobs[2];
  let botPresent = true;
  let challenges = 0;
  let applications = 0;
  const app = createApplication({
    root,
    canChallenge: candidate => candidate.id === job.id && botPresent,
    onChallenge: candidate => { assert.equal(candidate.id, job.id); challenges++; },
    onApply: () => { applications++; return true; },
  });
  app.setOccupancy({ [job.id]: 'bot:seated' });
  app.showJob(job);
  assert.equal(root.querySelector('.app-apply').disabled, false);
  assert.equal(root.querySelector('.app-apply').textContent, 'Push the bot · Take this seat');
  assert.match(root.querySelector('.app-availability').textContent, /playful push/);
  await root.querySelector('.app-apply').listeners.click();
  assert.equal(challenges, 1);
  assert.equal(applications, 0);
  assert.deepEqual(app.getSessions(), {});
  assert.equal(root.querySelector('.app-answer'), undefined);
  assert.equal(saved['meetspace-applications-v1'], '{}');

  botPresent = false;
  app.setOccupancy({});
  assert.equal(root.querySelector('.app-apply').disabled, false);
  assert.match(root.querySelector('.app-apply').textContent, /^Apply/);
  await root.querySelector('.app-apply').listeners.click();
  assert.equal(challenges, 1);
  assert.equal(applications, 1);
  assert.ok(root.querySelector('.app-answer'));
  assert.deepEqual(app.getSessions()[job.id].answers, []);
});

test('a real visitor seat remains unavailable and cannot be challenged', async () => {
  saved['meetspace-applications-v1'] = '{}';
  const root = new Node('aside');
  let challenges = 0;
  let applications = 0;
  const app = createApplication({ root, canChallenge: () => false, onChallenge: () => challenges++, onApply: () => applications++ });
  app.setOccupancy({ [jobs[5].id]: 'visitor:other' });
  app.showJob(jobs[5]);
  assert.equal(root.querySelector('.app-apply').disabled, true);
  assert.match(root.querySelector('.app-availability').textContent, /occupied/);
  // Even a stale/programmatic click must re-check availability.
  await root.querySelector('.app-apply').listeners.click();
  assert.equal(challenges, 0);
  assert.equal(applications, 0);
  assert.deepEqual(app.getSessions(), {});
});
