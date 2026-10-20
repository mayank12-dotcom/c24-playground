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
let temporary, html, css, tree, script, exported;

before(async () => {
  temporary = await mkdtemp(path.join(os.tmpdir(), 'common-ground-export-'));
  exported = await exportStandalone(path.join(temporary, 'prototype.html'));
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

test('the real standalone stylesheet embeds the original local variable fonts byte for byte', async () => {
  const original = postcss.parse(await readFile(path.join(root, 'src/style.css'), 'utf8'));
  const faces = stylesheet => {
    const found = [];
    stylesheet.walkAtRules('font-face', face => found.push(Object.fromEntries(face.nodes
      .filter(node => node.type === 'decl').map(node => [node.prop, node.value]))));
    return found;
  };
  const sourceFaces = faces(original), embeddedFaces = faces(tree);
  assert.equal(sourceFaces.length, 4, 'Both original families retain their Latin and extended Latin subsets');
  assert.equal(embeddedFaces.length, sourceFaces.length);
  assert.equal(exported.fontAssets, 4);
  const unquote = value => value.replace(/^["']|["']$/g, '');
  const ranges = value => value.toUpperCase().replace(/\s/g, '').split(',').map(range => {
    const [start, end = start] = range.replace(/^U\+/, '').split('-');
    return [parseInt(start.replace(/\?/g, '0'), 16), parseInt(end.replace(/\?/g, 'F'), 16)];
  });
  const families = new Set();
  for (const [index, source] of sourceFaces.entries()) {
    const embedded = embeddedFaces[index];
    families.add(unquote(embedded['font-family']));
    assert.equal(unquote(embedded['font-family']), unquote(source['font-family']));
    assert.equal(embedded['font-style'], 'normal');
    assert.equal(embedded['font-weight'], source['font-weight']);
    assert.equal(embedded['font-display'], 'swap');
    assert.deepEqual(ranges(embedded['unicode-range']), ranges(source['unicode-range']), 'Unicode subset coverage survives CSS minification');
    const local = source.src.match(/url\(\s*["']?(\/fonts\/[A-Za-z0-9._-]+\.woff2)["']?\s*\)/)?.[1];
    assert.ok(local, 'The source stylesheet must reference a local WOFF2 file');
    const data = embedded.src.match(/url\(["']?data:font\/woff2;base64,([A-Za-z0-9+/=]+)["']?\)/)?.[1];
    assert.ok(data, 'The exported face must contain its font bytes');
    const bytes = Buffer.from(data, 'base64');
    assert.ok(bytes.length > 1024, 'A real font subset is embedded rather than a placeholder');
    assert.equal(bytes.subarray(0, 4).toString(), 'wOF2');
    assert.deepEqual(bytes, await readFile(path.join(root, 'public', local.slice(1))), local);
  }
  assert.deepEqual([...families].sort(), ['DM Sans', 'Space Grotesk']);
  let imports = 0;
  tree.walkAtRules('import', () => imports++);
  assert.equal(imports, 0, 'An external font stylesheet must never block the application bootstrap');
  assert(!/fonts\.(?:googleapis|gstatic)\.com/i.test(css));
  assert(!/\/fonts\//.test(css), 'A portable document needs no separate font requests');
  assert(!/<link\b[^>]*rel=["']stylesheet["']/i.test(html), 'The complete styling is embedded');
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
