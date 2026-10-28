// Runs firestore.rules in the Firestore emulator: `npm run test:rules` (needs Java 21+).
// Documents are built with the app's own model code, so a schema change that the rules would reject fails here.
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { newCharacter } from '../src/model/character';
import { freshLive } from '../src/model/live';

let env: RulesTestEnvironment;
const db = () => env.unauthenticatedContext().firestore();
const G = 'games/g1';

const agent = (over: Record<string, unknown> = {}) => {
  const c = newCharacter();
  return { name: 'Ada', codename: 'LAMP', profession: 'Physician', character: c, live: freshLive(c), createdAt: 1, updatedAt: 1, ...over };
};
const roll = (over: Record<string, unknown> = {}) => ({
  agentId: 'a1', agentName: 'Ada', label: 'Medicine', chance: 60, penalty: 0, roll: 42, outcome: 'success', createdAt: 1, ...over,
});

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-codename', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  // Seed with rules off.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await setDoc(doc(d, G), { createdAt: 1, schemaVersion: 1 });
    await setDoc(doc(d, `${G}/agents/a1`), agent());
    await setDoc(doc(d, `${G}/rolls/r1`), roll());
  });
});

describe('server-only collections', () => {
  for (const path of ['gameSecrets/g1', 'discordPending/a1', 'discordGuilds/x', 'discordClaims/x']) {
    it(`${path} cannot be read or written`, async () => {
      await assertFails(getDoc(doc(db(), path)));
      await assertFails(setDoc(doc(db(), path), { url: 'https://evil.example' }));
    });
  }
});

describe('games', () => {
  it('can be read by ID but not listed', async () => {
    await assertSucceeds(getDoc(doc(db(), G)));
    await assertFails(getDocs(collection(db(), 'games')));
  });
  it('can be created with only createdAt and schemaVersion', async () => {
    await assertSucceeds(setDoc(doc(db(), 'games/g2'), { createdAt: 1, schemaVersion: 1 }));
    await assertFails(setDoc(doc(db(), 'games/g3'), { createdAt: 1, schemaVersion: 1, admin: true }));
    await assertFails(setDoc(doc(db(), 'games/g4'), { createdAt: '1', schemaVersion: 1 }));
  });
  it('are immutable', async () => {
    await assertFails(updateDoc(doc(db(), G), { schemaVersion: 2 }));
    await assertFails(deleteDoc(doc(db(), G)));
  });
});

describe('agents', () => {
  const ref = (id = 'a2') => doc(db(), `${G}/agents/${id}`);
  it('a new agent from the app is accepted, with and without a live sheet', async () => {
    await assertSucceeds(setDoc(ref(), agent()));
    await assertSucceeds(setDoc(ref('a3'), agent({ live: null })));
  });
  it('can be read, listed within a game, and deleted', async () => {
    await assertSucceeds(getDoc(ref('a1')));
    await assertSucceeds(getDocs(collection(db(), `${G}/agents`)));
    await assertSucceeds(deleteDoc(ref('a1')));
  });
  it('an update like the sheet autosave is accepted', async () => {
    await assertSucceeds(updateDoc(ref('a1'), { 'live.hp': 3, updatedAt: 2 }));
  });
  it('rejects unknown fields and wrong types', async () => {
    await assertFails(setDoc(ref(), agent({ isAdmin: true })));
    await assertFails(setDoc(ref(), agent({ name: 5 })));
    const { createdAt: _, ...noCreatedAt } = agent();
    await assertFails(setDoc(ref(), noCreatedAt));
    await assertFails(setDoc(ref(), agent({ updatedAt: 'now' })));
    await assertFails(setDoc(ref(), agent({ character: 'x' })));
  });
  it('rejects oversized strings', async () => {
    await assertFails(setDoc(ref(), agent({ name: 'x'.repeat(101) })));
    await assertFails(setDoc(ref(), agent({ codename: 'x'.repeat(101) })));
    await assertFails(updateDoc(ref('a1'), { 'live.notes': 'x'.repeat(4001) }));
  });
  it('accepts strings at the limit', async () => {
    await assertSucceeds(setDoc(ref(), agent({ name: 'x'.repeat(100) })));
    await assertSucceeds(updateDoc(ref('a1'), { 'live.notes': 'x'.repeat(4000) }));
  });
  it('rejects out-of-range vitals', async () => {
    for (const k of ['hp', 'wp', 'san', 'bp']) {
      await assertFails(updateDoc(ref('a1'), { [`live.${k}`]: -1 }));
      await assertFails(updateDoc(ref('a1'), { [`live.${k}`]: 1000 }));
    }
  });
  it('rejects stuffed maps', async () => {
    const stuffed = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`k${i}`, i]));
    await assertFails(setDoc(ref(), agent({ character: { ...stuffed, version: 1, bonds: [] } })));
    await assertFails(updateDoc(ref('a1'), { 'character.bonds': Array(21).fill({ name: 'x', score: 1 }) }));
    await assertFails(updateDoc(ref('a1'), { 'live.bonds': Array(21).fill(1) }));
  });
});

describe('rolls', () => {
  const add = (over: Record<string, unknown> = {}) => addDoc(collection(db(), `${G}/rolls`), roll(over));
  it('a valid roll is accepted and readable', async () => {
    await assertSucceeds(add());
    await assertSucceeds(getDocs(collection(db(), `${G}/rolls`)));
  });
  it('are append-only', async () => {
    await assertFails(updateDoc(doc(db(), `${G}/rolls/r1`), { roll: 1 }));
    await assertFails(deleteDoc(doc(db(), `${G}/rolls/r1`)));
  });
  it('rejects impossible or malformed results', async () => {
    await assertFails(add({ roll: 0 }));
    await assertFails(add({ roll: 101 }));
    await assertFails(add({ chance: 101 }));
    await assertFails(add({ penalty: 201 }));
    await assertFails(add({ outcome: 'great success' }));
    await assertFails(add({ agentId: '' }));
    await assertFails(add({ label: '' }));
    await assertFails(add({ extra: 1 }));
  });
  it('accepts every outcome and the range edges', async () => {
    for (const outcome of ['critical success', 'success', 'failure', 'fumble']) await assertSucceeds(add({ outcome }));
    await assertSucceeds(add({ roll: 1, chance: 0, penalty: 200 }));
    await assertSucceeds(add({ roll: 100, chance: 100 }));
  });
});
