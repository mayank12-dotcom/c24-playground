import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import postcss from 'postcss';
import { exportStandalone } from '../scripts/export-standalone.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let temporary, html, css, tree, script;

before(async () => {
  temporary = await mkdtemp(path.join(os.tmpdir(), 'common-ground-export-'));
  await exportStandalone(path.join(temporary, 'prototype.html'));
  html = await readFile(path.join(temporary, 'prototype.html'), 'utf8');
  css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  tree = postcss.parse(css);
});
after(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }); });

function rule(selector) {
  const rules = [];
  tree.walkRules(selector, item => rules.push(item));
  assert.equal(rules.length, 1, `One parsed ${selector} rule must survive export`);
  return Object.fromEntries(rules[0].nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
}

test('the real standalone stylesheet parses and retains the complete font import before viewport rules', async () => {
  const original = postcss.parse(await readFile(path.join(root, 'src/style.css'), 'utf8'));
  const sourceImports = [];
  original.walkAtRules('import', node => sourceImports.push(node.params.replace(/^url\((.*)\)$/, '$1').replace(/^['"]|['"]$/g, '')));
  const imports = tree.nodes.filter(node => node.type === 'atrule' && node.name === 'import');
  assert.equal(imports.length, 1);
  assert.equal(imports[0].params.replace(/^url\((.*)\)$/, '$1').replace(/^['"]|['"]$/g, ''), sourceImports[0]);
  assert.match(imports[0].params, /400;450;500;550;600;650;700/);
  assert.match(imports[0].params, /Space\+Grotesk:wght@400;500;600;700&display=swap/);
  assert.equal(tree.nodes.find(node => node.type !== 'comment'), imports[0]);
  assert(!/(?:^|\n)450;500;550;600;650;700/.test(css), 'The broken font-URL tail must never reappear');
});

test('the exported original cream navigation and colored buttons remain parsed CSS rules', () => {
  const header = rule('.masthead');
  assert.equal(header.position, 'fixed');
  assert.equal(header.top, '0');
  assert.equal(header.right, '0');
  assert.equal(header.left, '0');
  assert.equal(header.height, '72px');
  assert.equal(header.padding, '0 24px');
  assert.equal(header.display, 'flex');
  assert.equal(header.background, '#f9f4edf5');
  assert.equal(rule('.nav-actions').display, 'flex');
  assert.equal(rule('.nav-actions').gap, '10px');
  assert.equal(rule('.brand')['font-size'], '26px');
  assert.equal(rule('.help-button').background, '#e2eaf5');
  assert.equal(rule('#info-room-toggle').background, '#f2dfd4');
  assert.equal(rule('.appearance-button').background, '#e9e0f3');
  assert.equal(rule(':root')['--yellow'], '#efc866');
});

test('the desktop guard and unchanged small-screen message survive in CSS and executable boot code', async () => {
  const originalViewport = postcss.parse(await readFile(path.join(root, 'public/viewport.css'), 'utf8'));
  const expected = originalViewport.nodes.filter(node => node.type !== 'comment').map(node => node.toString());
  const actual = tree.nodes.filter(node => node.type !== 'comment' && !(node.type === 'atrule' && node.name === 'import'));
  assert.deepEqual(actual.slice(0, expected.length).map(node => node.toString()), expected);
  assert.match(html, /Please use desktop for a better experience\./);
  assert.match(script, /window\.matchMedia\('\(min-width: 1280px\)'\)/);
  assert.match(script, /if\(!desktop\.matches\|\|started\)return/);
  assert.match(script, /desktop\.addEventListener\('change',boot\)/);
  assert.match(script, /The experience couldn’t load\. Please refresh to try again\./);
});

test('the exported document contains one original header, original actions, and the shared sound control', () => {
  assert.equal((html.match(/<header\b/g) || []).length, 1);
  assert.equal((html.match(/<nav\b/g) || []).length, 1);
  const header = html.match(/<header class="masthead">([\s\S]*?)<\/header>/)[1];
  for (const id of ['info-room-toggle', 'help-toggle', 'shuffle-look', 'music-toggle']) {
    assert.equal((header.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  }
  assert.match(header, /class="brand" href="#"/);
  assert.match(header, /id="music-toggle"[^>]*aria-label="Mute all sounds"/);
});

test('the standalone contains the accessible first-visit dialog, its styles, and browser persistence', () => {
  assert.equal((html.match(/id="visitor-name-dialog"/g) || []).length, 1);
  assert.match(html, /<dialog[^>]*aria-labelledby="visitor-name-title"[^>]*aria-describedby="visitor-name-intro"/);
  assert.match(html, /<label for="visitor-name-input">Your name<\/label>/);
  assert.match(html, /id="visitor-name-submit"[^>]*type="submit"/);
  assert.match(script, /common-ground\.visitor-name\.v1/);
  const dialogRule = tree.nodes.find(node => node.type === 'rule' && node.selector === '.visitor-name-dialog');
  assert.equal(dialogRule?.nodes.find(node => node.prop === 'background')?.value, '#fffaf2');
  assert.equal(rule('.visitor-name-submit').background, '#e9e0f3');
  assert(!/href="\/src\/name-prompt\.css"/.test(html), 'The prompt must not need an external stylesheet');
});

test('all ten music and effect recordings are embedded byte for byte without external audio paths', async () => {
  const declarations = [...script.matchAll(/const __COMMON_GROUND_AUDIO_\d+__="data:audio\/(mpeg|wav);base64,([A-Za-z0-9+/=]+)";/g)];
  assert.equal(declarations.length, 10);
  const names = ['background.mp3', 'click.wav', 'dismiss.wav', 'fight-1.wav', 'fight-2.wav', 'fight-3.wav', 'step-1.wav', 'step-2.wav', 'step-3.wav', 'step-4.wav'];
  for (const [index, name] of names.entries()) {
    assert.equal(declarations[index][1], name.endsWith('.mp3') ? 'mpeg' : 'wav');
    assert.deepEqual(Buffer.from(declarations[index][2], 'base64'), await readFile(path.join(root, 'public/audio', name)), name);
    assert(!html.includes(`/audio/${name}`), `${name} must not need a server request`);
  }
});

test('the actual inline script is valid standalone JavaScript with no external or dynamic module loading', () => {
  assert.doesNotThrow(() => new Script(script));
  assert(!/<script\b[^>]*\bsrc\s*=/i.test(html));
  assert(!/\bimport\s*\(/.test(script));
  assert.equal((html.match(/<script>/g) || []).length, 1);
  assert(!html.includes('src="/src/bootstrap.js"'));
  assert(!html.includes('href="/viewport.css"'));
});
