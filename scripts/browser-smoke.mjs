/** Real Chromium smoke check against dist and the actual local visitor API. */
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createMemoryWorld, handleWorldRequest } from '../api/world.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(process.argv[2] || '/tmp/common-ground-browser-smoke');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
const store = createMemoryWorld();
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api/world') return handleWorldRequest(req, res, store);
  const filename = path.resolve(root, 'dist', '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!filename.startsWith(path.join(root, 'dist') + path.sep)) { res.writeHead(404).end(); return; }
  try { const bytes = await readFile(filename); res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' }); res.end(bytes); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [], blockedExternal = [], fontResponses = [], checks = [];
const checked = label => { checks.push(label); console.log('PASS:', label); };
try {
  await mkdir(output, { recursive: true });
  console.log('Launching Chromium for the production build');
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(90_000);
  page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('console', message => { if (message.type() === 'error' && /Unable to (?:load Common Ground|start 3D world)/.test(message.text())) errors.push(message.text()); });
  page.on('response', response => { if (new URL(response.url()).pathname.startsWith('/fonts/')) fontResponses.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  // Bound frame bursts on the software GPU while retaining real WebGL draws.
  // This changes the test's clock only, never the shipped application.
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
    let budget = 3, id = -1;
    window.__smokeCompleted = 0;
    const held = new Map();
    window.requestAnimationFrame = callback => {
      if (!document.querySelector('#world canvas') || budget > 0) {
        if (document.querySelector('#world canvas')) budget--;
        return raf(time => { callback(time); window.__smokeCompleted++; });
      }
      held.set(--id, callback); return id;
    };
    window.cancelAnimationFrame = frame => frame < 0 ? held.delete(frame) : cancel(frame);
    window.__smokeFrames = count => {
      budget = count;
      const target = window.__smokeCompleted + count;
      const callbacks = [...held.values()]; held.clear();
      for (const callback of callbacks) window.requestAnimationFrame(callback);
      return target;
    };
  });
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    blockedExternal.push(route.request().url().split('?')[0]);
    return route.abort('blockedbyclient');
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  console.log('Production document loaded');
  await page.locator('#visitor-name-input').fill('Smoke Explorer');
  await page.locator('#visitor-name-submit').click({ force: true });
  console.log('Name submitted');
  await page.locator('#world canvas').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.getElementById('loading'), null, { polling: 100 });
  assert.equal(await page.locator('#visitor-name-dialog').evaluate(el => el.open), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('common-ground.visitor-name.v1')), 'Smoke Explorer');
  checked('first-visit name entry, cached name and real WebGL world startup');
  const fontState = await page.evaluate(async () => {
    await document.fonts.ready;
    return { body: document.fonts.check('400 16px "DM Sans"'), display: document.fonts.check('700 26px "Space Grotesk"'), faces: [...document.fonts].map(face => ({ family: face.family, status: face.status })) };
  });
  assert.equal(fontState.body, true); assert.equal(fontState.display, true);
  assert.equal(blockedExternal.length, 0, 'the entire startup must work without any external host');
  assert.ok(fontResponses.some(item => item.path.includes('dm-sans-latin-') && item.status === 200));
  assert.ok(fontResponses.some(item => item.path.includes('space-grotesk-latin-') && item.status === 200));
  checked('original fonts load locally with all external requests blocked');
  await page.waitForFunction(() => document.getElementById('presence-status').textContent === 'Live visitors connected', null, { polling: 100 });
  const before = (await store.dispatch()).visitors.find(visitor => visitor.name === 'Smoke Explorer');
  assert.ok(before);
  await page.locator('#world canvas').focus();
  await page.keyboard.down('w');
  const targetFrames = await page.evaluate(() => window.__smokeFrames(4));
  await page.waitForFunction(target => window.__smokeCompleted >= target, targetFrames, { polling: 100 });
  await page.keyboard.up('w');
  // Software shader warmup can outlast the normal visitor lease. Allow the
  // real client retry loop to reconnect before reading its updated position.
  let after, distance = 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    await page.waitForTimeout(250);
    after = (await store.dispatch()).visitors.find(visitor => visitor.name === 'Smoke Explorer');
    if (after) distance = Math.hypot(after.x - before.x, after.z - before.z);
    if (distance > .03) break;
  }
  assert.ok(distance > .03, `keyboard movement must reach the visitor API (distance ${distance})`);
  checked('keyboard walking updates actual shared visitor coordinates');
  await page.locator('#help-toggle').click({ force: true });
  assert.equal(await page.locator('#controls-help').evaluate(el => el.hidden), false);
  await page.locator('#help-close').click({ force: true });
  assert.equal(await page.locator('#controls-help').evaluate(el => el.hidden), true);
  await page.locator('#seats-toggle').click({ force: true });
  assert.equal(await page.locator('#opportunity-panel').evaluate(el => el.hidden), false);
  await page.locator('#panel-close').click({ force: true });
  assert.equal(await page.locator('#opportunity-panel').evaluate(el => el.hidden), true);
  const oldSound = await page.locator('#music-toggle').getAttribute('aria-pressed');
  await page.locator('#music-toggle').click({ force: true });
  assert.notEqual(await page.locator('#music-toggle').getAttribute('aria-pressed'), oldSound);
  checked('help, opportunities, close buttons and sound toggle respond');
  // Stop scheduling new scene frames only after exercising the real controls.
  // Chromium's software GPU otherwise keeps screenshot fences busy on CI.
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await page.waitForTimeout(300);
  const cdp = await context.newCDPSession(page);
  const capture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await writeFile(path.join(output, 'desktop.png'), Buffer.from(capture.data, 'base64'));
  await page.close();
  const small = await context.newPage();
  await small.setViewportSize({ width: 1279, height: 720 });
  await small.goto(origin, { waitUntil: 'domcontentloaded' });
  assert.match(await small.locator('body').innerText(), /Please use desktop for a better experience\./);
  assert.equal(await small.locator('canvas').count(), 0);
  checked('1279-pixel notice appears without creating the game');
  assert.deepEqual(errors, []);
  const result = { checks, errors, blockedExternal, fontResponses, fontState, movement: { from: { x: before.x, z: before.z }, to: { x: after.x, z: after.z }, distance }, scope: 'Actual production dist, Chromium/WebGL in bounded frame bursts for the software GPU, real local API with isolated memory store; not the live Vercel host or production Redis.' };
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
