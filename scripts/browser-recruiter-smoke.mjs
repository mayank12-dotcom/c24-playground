/**
 * Instrumented real-browser combat integration check. The temporary bundle
 * contains the actual main/world modules and uses the actual local visitor API.
 * Only fixture placement, the clock and GPU draw frequency are controlled here;
 * no debugging globals or fixture code are written into the production app.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createMemoryWorld, handleWorldRequest, RECRUITER_HOME } from '../api/world.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(process.argv[2] || '/tmp/common-ground-recruiter-browser-smoke');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
const epoch = Date.now();
let clockMs = epoch;
const store = createMemoryWorld({ now: () => clockMs });
const errors = [], externalRequests = [], api = [], checks = [], samples = [], placements = [];
const checked = label => { checks.push(label); console.log('PASS:', label); };
const scope = 'Instrumented temporary esbuild bundle of actual src/main.js and src/world.js; actual Chromium DOM/WebGL and real local /api/world with an isolated memory store. Test-only clear-position fixtures, synchronized 50ms clock/RAF and gated GPU draws. All 19 ambient bots remain. This does not verify public Vercel access, real-time wall-clock performance or production Redis.';

const fixtureSource = `
  globalThis.__recruiterSmoke.bind({
    snapshot(){return {player:getPlayerState(),ui:getRecruiterFightState(),combat:pmCombat?structuredClone(pmCombat):null,
      visual:{rightArmX:player.userData.rig.rightArm.rotation.x,rightForearmX:player.userData.rig.rightForearm.rotation.x,recruiterY:pmStation.recruiter.position.y},
      home:{...pmHome},landing:pmLanding?{...pmLanding}:null,bots:botCharacters.size,
      botIds:[...botCharacters.keys()],chairOffset:pmChairOffset,
      bodies:getCharacterObstacles().map(body=>({id:body.id,x:body.x,z:body.z,radius:body.radius}))};},
    canPlace(point){return !!findCharacterPlacement(point,routeBounds,getCharacterObstacles(),{radius:CHARACTER_RADIUS,maxDistance:0});},
    place(point){
      const clear=findCharacterPlacement(point,routeBounds,getCharacterObstacles(),{radius:CHARACTER_RADIUS,maxDistance:0});
      if(!clear||Math.hypot(clear.x-point.x,clear.z-point.z)>.00001)throw new Error('Fixture destination is occupied: '+JSON.stringify(point));
      if(seated||seatEntry||seatExit)throw new Error('Fixture placement requires a standing player.');
      keys.clear();stopKeyboardMovement();clearSeatRequest({allowContact:true});waypoints=[];intendedSeat=null;
      target.set(point.x,0,point.z);playerPosition.copy(target);player.position.copy(target);
      angle=point.rotation;player.rotation.y=point.rotation;follow.reset({position:player.position,yaw:point.rotation});
      destinationRing.visible=false;publishMovement();
    }
  });
`;

const bundle = await build({
  absWorkingDir: root, entryPoints: ['src/main.js'], outfile: 'recruiter-smoke.js',
  bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022',
  plugins: [{ name: 'recruiter-browser-fixtures', setup(plugin) {
    plugin.onLoad({ filter: /\/src\/world\.js$/ }, async args => {
      let source = await readFile(args.path, 'utf8');
      const exports = '  return {setRecruiterEncounter,';
      assert.equal(source.split(exports).length, 2, 'fixture observes the actual world coordinator export');
      source = source.replace(exports, fixtureSource + exports);
      const draw = 'renderer.render(scene,camera);';
      assert.equal(source.split(draw).length, 2, 'fixture gates the actual WebGL draw, leaving simulation intact');
      source = source.replace(draw, 'if(globalThis.__recruiterSmoke.drawRequested){globalThis.__recruiterSmoke.drawRequested=false;renderer.render(scene,camera);globalThis.__recruiterSmoke.draws++;}');
      const spawn = { x: RECRUITER_HOME.x + .91, z: RECRUITER_HOME.z - .10 };
      for (const name of ['target', 'playerPosition']) {
        const original = `const ${name} = new THREE.Vector3(0, 0, 4.8);`;
        assert.equal(source.split(original).length, 2, `fixture initializes ${name} only`);
        source = source.replace(original, `const ${name} = new THREE.Vector3(${spawn.x},0,${spawn.z});`);
      }
      source = source.replace('let span = 14, angle = Math.PI,', `let span = 14, angle = ${Math.atan2(-.91, .10)},`);
      return { contents: source, loader: 'js', resolveDir: path.dirname(args.path) };
    });
    // esbuild normally resolves these against public at deployment time. Keep
    // the original root-relative URLs in the temporary stylesheet as well.
    plugin.onResolve({ filter: /^\/fonts\// }, args => ({ path: args.path, external: true }));
  } }],
});
const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).contents;
const css = bundle.outputFiles.find(file => file.path.endsWith('.css')).contents;
let documentSource = await readFile(path.join(root, 'index.html'), 'utf8');
assert.match(documentSource, /<script type="module" src="\/src\/bootstrap\.js"><\/script>/);
documentSource = documentSource.replace(/<script type="module" src="\/src\/bootstrap\.js"><\/script>/,
  '<link rel="stylesheet" href="/__smoke/main.css"><script defer src="/__smoke/main.js"></script>');

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api/world') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    res.once('finish', () => {
      let command = {}; try { command = JSON.parse(body); } catch { /* GET poll */ }
      api.push({ action: command.action || req.method, type: command.type ?? null, status: res.statusCode,
        phase: command.state?.recruiterCombat?.phase ?? null, at: clockMs - epoch });
    });
    return handleWorldRequest(req, res, store);
  }
  if (pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }).end(documentSource); return; }
  if (pathname === '/__smoke/main.js') { res.writeHead(200, { 'Content-Type': 'application/javascript' }).end(js); return; }
  if (pathname === '/__smoke/main.css') { res.writeHead(200, { 'Content-Type': 'text/css' }).end(css); return; }
  const filename = path.resolve(root, 'public', '.' + pathname);
  if (!filename.startsWith(path.join(root, 'public') + path.sep)) { res.writeHead(404).end(); return; }
  try { const bytes = await readFile(filename); res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream' }).end(bytes); }
  catch { res.writeHead(404).end(); }
});

await mkdir(output, { recursive: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, page, latest = null, screenshot = null, failure = null, slamTransition = null;
let timeout;
const deadline = new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Recruiter browser smoke exceeded 240 seconds.')), 240_000); });
try {
  await Promise.race([deadline, (async () => {
    console.log('Launching Chromium for the instrumented recruiter integration bundle');
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    page = await context.newPage();page.setDefaultTimeout(90_000);
    page.on('pageerror', error => errors.push(error.stack || error.message));
    page.on('console', message => { if (message.type() === 'error' && /Unable to (?:load Common Ground|start 3D world)|THREE\.WebGLProgram|Error creating WebGL context|VALIDATE_STATUS/.test(message.text())) errors.push(message.text()); });
    await page.addInitScript(({ epoch }) => {
      const NativeDate = Date;
      const frames = new Map();let next = 0, world;
      const control = window.__recruiterSmoke = {
        time: 0, epoch, draws: 0, drawRequested: false,
        bind(value) { world = value; },
        snapshot() { return world?.snapshot() ?? null; },
        place(point) { return world.place(point); },
        canPlace(point) { return world.canPlace(point); },
        advance(milliseconds = 50) {
          control.time += milliseconds;
          const callbacks = [...frames.values()];frames.clear();
          for (const callback of callbacks) callback(control.time);
          return world?.snapshot() ?? null;
        }
      };
      window.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [epoch + control.time])); }
        static now() { return epoch + control.time; }
      };
      Object.defineProperty(performance, 'now', { value: () => control.time, configurable: true });
      window.requestAnimationFrame = callback => { frames.set(++next, callback); return next; };
      window.cancelAnimationFrame = id => frames.delete(id);
    }, { epoch });
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue();
      externalRequests.push(route.request().url().split('?')[0]);return route.abort('blockedbyclient');
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.locator('#visitor-name-input').fill('Recruiter Smoke');
    await page.locator('#visitor-name-submit').click({ force: true });
    await page.waitForFunction(() => !!window.__recruiterSmoke.snapshot(), null, { polling: 100 });
    await page.waitForFunction(() => document.getElementById('presence-status').textContent === 'Live visitors connected', null, { polling: 100 });

    const inspect = async () => latest = await page.evaluate(() => window.__recruiterSmoke.snapshot());
    const advance = async (count = 1) => {
      for (let index = 0; index < count; index++) {
        clockMs += 50;
        const previousState = latest;
        latest = await page.evaluate(() => window.__recruiterSmoke.advance(50));
        if (latest.ui.stage === 'slamming' && previousState?.ui.stage !== 'slamming') {
          slamTransition = { rightArmDelta: Math.abs(latest.visual.rightArmX - previousState.visual.rightArmX),
            rightForearmDelta: Math.abs(latest.visual.rightForearmX - previousState.visual.rightForearmX) };
        }
        const previous = samples.at(-1);
        const sample = { at: clockMs - epoch, stage: latest.ui.stage, health: latest.ui.recruiterHealth,
          slamHits: latest.ui.slamHits ?? latest.combat?.slamHits ?? 0,
          slamReady: latest.ui.slamReady ?? latest.combat?.slamReady ?? false };
        if (!previous || ['stage', 'health', 'slamHits', 'slamReady'].some(key => previous[key] !== sample[key])) samples.push(sample);
        if (errors.length) throw new Error(errors[0]);
      }
      return latest;
    };
    const until = async (predicate, label, maximum = 180) => {
      for (let index = 0; index < maximum; index++) { if (predicate(await inspect())) return latest;await advance(); }
      throw new Error(`${label}: ${JSON.stringify({ player: latest.player, ui: latest.ui, combat: latest.combat })}`);
    };
    const place = async point => {
      await page.evaluate(point => window.__recruiterSmoke.place(point), point);
      placements.push({ ...point, at: clockMs - epoch });await advance();
    };
    const placeNear = async (phase, preferred = []) => {
      const state = await inspect(), target = state.combat;
      assert.ok(target, `an encounter exists before ${phase} placement`);
      const offsets = [...preferred, { x: 0, z: -.92 }, { x: 0, z: .92 }, { x: -.92, z: 0 }, { x: .92, z: 0 },
        { x: -.95, z: -.65 }, { x: .95, z: -.65 }, { x: -.95, z: .65 }, { x: .95, z: .65 }];
      for (const offset of offsets) {
        const point = { x: target.x + offset.x, z: target.z + offset.z, rotation: Math.atan2(-offset.x, -offset.z) };
        if (await page.evaluate(point => window.__recruiterSmoke.canPlace(point), point)) { await place(point);return; }
      }
      throw new Error(`No physically clear ${phase} fixture position: ${JSON.stringify(state)}`);
    };

    await advance();
    assert.equal(latest.bots, 19, 'all ambient characters remain in the real scene');
    assert.equal(latest.ui.stage, 'nearby');
    assert.equal(await page.locator('.recruiter-controls').evaluate(el => el.hidden), false);
    checked('all 19 ambient bots remain and nearby controls appear without bumping');
    const attackResponse = page.waitForResponse(response => {
      if (new URL(response.url()).pathname !== '/api/world') return false;
      try { return response.request().postDataJSON().action === 'recruiter-attack'; } catch { return false; }
    });
    await page.locator('#world canvas').focus();await page.keyboard.press('j');
    const response = await attackResponse, payload = await response.json();
    assert.equal(response.status(), 200);assert.equal(payload.recruiterAttack?.started, true);
    assert.equal(payload.recruiterAttack.type, 'punch');
    await until(state => state.ui.stage === 'provoking', 'J starts the real API-authorized opening attack', 8);
    checked('J starts a punch through the actual recruiter-attack HTTP API');

    await until(state => state.ui.stage === 'falling', 'opening punch physically connects', 20);
    assert.ok(latest.combat.recruiterHealth < 100);
    // Setup clearance uses a destination check against every real furnishing
    // and character. This is a fixture move, not a claim about walked routing.
    await place({ x: RECRUITER_HOME.x + 2.2, z: RECRUITER_HOME.z - 1.6, rotation: Math.PI });
    await until(state => state.ui.stage === 'grounded', 'recruiter completes collision-safe fall', 50);
    checked('opening contact causes a real fall and grounded state');
    const beforeGroundKick = latest.combat.recruiterHealth;
    await placeNear('grounded kick');
    await page.keyboard.press('k');
    assert.equal((await inspect()).combat?.playerAttack?.type, 'kick', 'the real K handler accepts the grounded attack');
    await until(state => state.combat?.recruiterHealth < beforeGroundKick, 'K connects against the grounded/recovering recruiter', 22);
    checked('K delivers an actual damaging contact during the grounded recovery sequence');
    await until(state => ['approaching', 'fighting'].includes(state.ui.stage), 'recruiter recovers to standing combat', 50);
    await until(state => !state.combat?.playerAttack, 'prior player attack finishes', 25);
    await placeNear('standing punch');
    const beforePunch = latest.combat.recruiterHealth;
    await page.keyboard.press('j');
    await until(state => state.combat?.recruiterHealth < beforePunch, 'third normal contact connects', 18);
    checked('J delivers the third damaging contact after the recruiter stands up');
    await until(state => state.combat?.slamReady === true, 'three connected hits charge the slam', 10);
    if (!latest.ui.slamReady) {
      // A desk-side fight can lack a safe drop patch. Lead the real recruiter
      // into the open aisle with actual walking input, retaining all obstacles.
      const before = { x: latest.player.x, z: latest.player.z };
      await page.keyboard.down('s');await advance(18);await page.keyboard.up('s');await advance();
      const walked = Math.hypot(latest.player.x - before.x, latest.player.z - before.z);
      assert.ok(walked > .8, `real S input leads the recruiter into the open aisle (${walked})`);
      await until(state => state.ui.stage === 'fighting'
        && Math.hypot(state.player.x - state.combat.x, state.player.z - state.combat.z) <= 1.05,
      'the recruiter follows through actual navigation and collision', 90);
      await place({ x: latest.player.x, z: latest.player.z,
        rotation: Math.atan2(latest.combat.x - latest.player.x, latest.combat.z - latest.player.z) });
      checked('actual keyboard walking leads the recruiter into a clear shared aisle');
    }
    await until(state => state.ui.slamReady === true, 'three connected hits unlock a physically available slam', 20);
    checked('three connected normal hits unlock the standing slam');
    await until(state => !state.combat?.playerAttack, 'third attack finishes before slam', 25);
    await placeNear('slam');await page.keyboard.press('l');
    await until(state => state.ui.stage === 'slamming', 'L starts the lift and drop at contact', 30);
    assert.ok(slamTransition && slamTransition.rightArmDelta < .2 && slamTransition.rightForearmDelta < .2,
      `the grab remains continuous when contact starts the lift: ${JSON.stringify(slamTransition)}`);
    checked('L starts the real lift-and-drop slam after three connected hits');
    await until(state => state.ui.stage === 'slamming' && state.combat.elapsed >= 500, 'slam reaches the raised pose', 20);
    assert.ok(latest.visual.recruiterY > .35, 'the real recruiter rig rises above the ground during the held lift');

    await page.evaluate(() => { window.__recruiterSmoke.drawRequested = true; });
    await advance();
    assert.equal(await page.evaluate(() => window.__recruiterSmoke.draws), 1, 'the final scene executes a real WebGL render');
    const cdp = await context.newCDPSession(page);
    const capture = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    screenshot = path.join(output, 'combat.png');await writeFile(screenshot, Buffer.from(capture.data, 'base64'));
    checked('actual Chromium WebGL frame and combat controls are captured');
    await until(state => state.ui.stage === 'grounded', 'lift-and-drop finishes on the ground', 30);
    checked('the collision-checked slam finishes in a grounded pose');
    assert.equal(latest.bots, 19, 'combat does not remove any ambient characters');
    assert.deepEqual(errors, []);assert.deepEqual(externalRequests, []);
    assert.ok(api.some(call => call.action === 'recruiter-attack' && call.type === 'punch' && call.status === 200));
    assert.ok(api.filter(call => call.status >= 400).length === 0);
  })()]);
} catch (error) {
  failure = error.stack || String(error);console.error(failure);process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  const result = { ok: !failure, checks, failure, errors, externalRequests, api, samples, placements, slamTransition, latest, screenshot, scope };
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ ok: result.ok, checks: checks.length, samples, failure, output, scope }, null, 2));
  await browser?.close();server.closeAllConnections();await new Promise(resolve => server.close(resolve));
}
