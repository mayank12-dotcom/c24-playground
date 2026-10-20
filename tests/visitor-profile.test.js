import assert from 'node:assert/strict';
import test from 'node:test';
import { createVisitorProfile, normalizeVisitorName, VISITOR_NAME_STORAGE_KEY } from '../src/visitor-profile.js';

function memoryStorage(initial = null) {
  const values = new Map(initial === null ? [] : [[VISITOR_NAME_STORAGE_KEY, initial]]);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}

test('display names preserve multilingual text while removing controls and collapsing whitespace', () => {
  assert.equal(normalizeVisitorName('  José\n  山田\t علي\u0000  '), 'José 山田 علي');
  assert.equal(normalizeVisitorName('A\u202eB\u2066C\u200b'), 'ABC');
  assert.equal(normalizeVisitorName('मोहित कुमार'), 'मोहित कुमार');
  assert.equal(normalizeVisitorName('A 👩‍💻'), 'A 👩‍💻');
  for (const value of [undefined, null, 42, {}, '  \n\t ', '\u0000\u0001', '\u200b\u200d']) assert.equal(normalizeVisitorName(value), '');
});

test('names are capped at 32 Unicode code points without splitting a surrogate pair', () => {
  const name = normalizeVisitorName('😀'.repeat(40));
  assert.equal(Array.from(name).length, 32);
  assert.equal(name, '😀'.repeat(32));
  assert.equal(normalizeVisitorName(` ${'A'.repeat(31)}  B `), 'A'.repeat(31));
});

test('valid names persist under a separate key and are restored on a later visit', () => {
  const storage = memoryStorage();
  const profile = createVisitorProfile({ storage });
  assert.equal(profile.getName(), null);
  assert.equal(profile.setName('  Mayank   Gupta  '), 'Mayank Gupta');
  assert.equal(storage.values.get(VISITOR_NAME_STORAGE_KEY), 'Mayank Gupta');
  assert.equal(createVisitorProfile({ storage }).getName(), 'Mayank Gupta');
  assert.equal(profile.setName(' \n '), null);
  assert.equal(profile.getName(), 'Mayank Gupta', 'an invalid update cannot erase a valid visitor name');
});

test('invalid cached values require a name, while a normalized valid cached value is accepted', () => {
  assert.equal(createVisitorProfile({ storage: memoryStorage(' \n ') }).getName(), null);
  assert.equal(createVisitorProfile({ storage: memoryStorage('  José\t  山田  ') }).getName(), 'José 山田');
});

test('denied localStorage access or operations keep a valid name in memory for the visit', () => {
  const unavailableWindow = {};
  Object.defineProperty(unavailableWindow, 'localStorage', { get() { throw new Error('SecurityError'); } });
  const deniedOperations = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
  for (const options of [{ window: unavailableWindow }, { storage: deniedOperations }, {}]) {
    const profile = createVisitorProfile(options);
    assert.equal(profile.getName(), null);
    assert.equal(profile.setName('Amina'), 'Amina');
    assert.equal(profile.getName(), 'Amina');
  }
});
