import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { setVisitorNameLabel } from '../src/world.js';

function labelNode() {
  return {
    textContent: '',
    set innerHTML(_) { assert.fail('A visitor name must never be interpreted as HTML.'); },
    replaceWith() { assert.fail('Updating a name must keep its existing label.'); },
  };
}

test('unnamed visitors and unnamed local players keep their legacy labels', () => {
  const label = labelNode();
  for (const name of [undefined, null, '', '   ', 42, {}]) {
    setVisitorNameLabel(label, name);
    assert.equal(label.textContent, 'VISITOR');
    setVisitorNameLabel(label, name, { local: true });
    assert.equal(label.textContent, 'YOU');
  }
});

test('real visitor labels show their names and identify the local player', () => {
  const label = labelNode();
  setVisitorNameLabel(label, '  Ada  ');
  assert.equal(label.textContent, 'Ada');
  setVisitorNameLabel(label, 'Ada', { local: true });
  assert.equal(label.textContent, 'Ada · YOU');
});

test('HTML-looking names are displayed literally through textContent', () => {
  const label = labelNode();
  const name = '<img src=x onerror=alert(1)>';
  setVisitorNameLabel(label, name);
  assert.equal(label.textContent, name);
  setVisitorNameLabel(label, name, { local: true });
  assert.equal(label.textContent, `${name} · YOU`);
});

test('long Unicode names are limited without splitting an emoji', () => {
  const label = labelNode();
  setVisitorNameLabel(label, '😀'.repeat(40));
  assert.equal(label.textContent, '😀'.repeat(32));
  assert.equal([...label.textContent].length, 32);
});

test('visitor heartbeats update the actual existing actor label without recreating its character', async () => {
  // Exercise the production heartbeat handler without allocating office meshes.
  // Seating and appearance are unchanged in this name-only update.
  const source = await readFile(new URL('../src/world.js', import.meta.url), 'utf8');
  const start = source.indexOf('  function updateCrowdCharacter(actor, state) {');
  const end = source.indexOf('  function fightCanAdvance(', start);
  assert.ok(start >= 0 && end > start);
  const update = vm.runInNewContext(`(${source.slice(start, end).trim()})`, {
    setVisitorNameLabel,
    poseSeatId: state => state.seatedJobId ?? null,
    seatById: () => null,
    CHARACTER_RADIUS: .48,
    person: () => assert.fail('A name-only heartbeat must not recreate the character.'),
  });
  const label = labelNode();
  const character = { existing: true };
  const actor = { kind: 'visitor', label, character, state: { hair: 5 }, body: {} };
  setVisitorNameLabel(actor.label, 'First visitor');
  update(actor, { hair: 5, name: 'Renamed visitor' });
  assert.equal(actor.label, label);
  assert.equal(actor.label.textContent, 'Renamed visitor');
  assert.equal(actor.character, character);
  assert.equal(actor.desired.name, 'Renamed visitor');
  update(actor, { hair: 5 });
  assert.equal(actor.label.textContent, 'VISITOR');
});
