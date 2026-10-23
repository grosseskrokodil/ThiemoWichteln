import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, updateDoc, deleteDoc, serverTimestamp, runTransaction } from 'firebase/firestore';

let env;
const hashA = 'a'.repeat(64), hashB = 'b'.repeat(64), hashC = 'c'.repeat(64);
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-wichteln', firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') } });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'settings/current'), { year: '2026', revision: 'r1', enabled: true });
    for (const [id, recipients, hash] of [['A', ['B', 'C'], hashA], ['B', ['A', 'C'], hashB], ['C', ['A', 'B'], hashC], ['D', ['B', 'C'], 'd'.repeat(64)]]) {
      await setDoc(doc(db, `rounds/2026/people/${id}`), { name: id });
      await setDoc(doc(db, `rounds/2026/revisions/r1/assignments/${id}`), { recipients });
      await setDoc(doc(db, `accessKeys/${hash}`), { personId: id, name: id, enabled: true });
      await setDoc(doc(db, `rounds/2026/people/${id}/wishes/wish1`), { text: 'Buch', link: '', createdAt: new Date(), updatedAt: new Date() });
    }
  });
});
async function session(uid, hash = hashA, person = 'A') {
  const db = env.authenticatedContext(uid).firestore();
  await setDoc(doc(db, `wishSessions/${uid}`), { keyHash: hash, confirmedRevision: 'r1' });
  return db;
}
const wish = () => ({ text: 'Ein Buch', link: 'https://example.com', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
test('Ohne Zugang keine privaten Listen, keine Schlüsselauflistung', async () => {
  const db = env.authenticatedContext('stranger').firestore();
  await assertFails(getDocs(collection(db, 'accessKeys')));
  await assertFails(getDoc(doc(db, 'rounds/2026/people/A')));
  await assertFails(setDoc(doc(db, 'wishSessions/stranger'), { keyHash: hashA, confirmedRevision: 'r1', personId: 'B' }));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `accessKeys/${hashA}`)));
});
test('Eigene Wünsche bearbeiten, fremde nur zugeteilt lesen', async () => {
  const db = await session('userA');
  await assertSucceeds(setDoc(doc(db, 'rounds/2026/people/A/wishes/new'), wish()));
  await assertSucceeds(getDocs(collection(db, 'rounds/2026/people/B/wishes')));
  await assertFails(setDoc(doc(db, 'rounds/2026/people/B/wishes/new'), wish()));
  await assertFails(getDoc(doc(db, 'rounds/2026/people/D')));
  await assertFails(getDocs(collection(db, 'privateRounds/2026/people')));
  await assertFails(updateDoc(doc(db, 'rounds/2026/people/A'), { recipients: ['D'] }));
});
test('Empfänger darf eigene Reservierungen nicht lesen oder schreiben', async () => {
  const db = await session('userA');
  await assertFails(getDocs(collection(db, 'rounds/2026/revisions/r1/reservations/A/items')));
  await assertFails(setDoc(doc(db, 'rounds/2026/revisions/r1/reservations/A/items/wish1'), { giverId: 'A', createdAt: serverTimestamp() }));
  await assertSucceeds(setDoc(doc(db, 'rounds/2026/revisions/r1/reservations/B/items/wish1'), { giverId: 'A', createdAt: serverTimestamp() }));
  const receiver = await session('userB', hashB, 'B');
  await assertFails(getDoc(doc(receiver, 'rounds/2026/revisions/r1/reservations/B/items/wish1')));
});
test('Reservierungen sind nicht überschreibbar und nur selbst aufhebbar', async () => {
  const db = await session('userA');
  const other = await session('userC', hashC, 'C');
  const path = 'rounds/2026/revisions/r1/reservations/B/items/wish1';
  await assertSucceeds(setDoc(doc(db, path), { giverId: 'A', createdAt: serverTimestamp() }));
  await assertFails(setDoc(doc(other, path), { giverId: 'C', createdAt: serverTimestamp() }));
  await assertFails(deleteDoc(doc(other, path)));
  await assertSucceeds(deleteDoc(doc(db, path)));
  await assertFails(setDoc(doc(db, 'rounds/2026/revisions/r1/reservations/B/items/missing'), { giverId: 'A', createdAt: serverTimestamp() }));
});
test('Parallele Transaktionen reservieren denselben Wunsch nur einmal', async () => {
  const a = await session('userA');
  const c = await session('userC', hashC, 'C');
  const reserve = (db, giverId) => runTransaction(db, async transaction => {
    const ref = doc(db, 'rounds/2026/revisions/r1/reservations/B/items/wish1');
    const existing = await transaction.get(ref);
    if (existing.exists()) throw new Error('Bereits reserviert');
    transaction.set(ref, { giverId, createdAt: serverTimestamp() });
  });
  const results = await Promise.allSettled([reserve(a, 'A'), reserve(c, 'C')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
});
test('Gesperrter Schlüssel sperrt auch bestehende Sitzungen', async () => {
  const db = await session('userA');
  await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), `accessKeys/${hashA}`), { enabled: false }));
  await assertFails(getDoc(doc(db, 'rounds/2026/people/A')));
});
test('Vor Bestätigung sind keinerlei Zuordnungen lesbar', async () => {
  const db = env.authenticatedContext('unconfirmed').firestore();
  await setDoc(doc(db, 'wishSessions/unconfirmed'), { keyHash: hashA, confirmedRevision: '' });
  const key = await assertSucceeds(getDoc(doc(db, `accessKeys/${hashA}`)));
  assert.equal(key.data().name, 'A');
  assert.equal(key.data().recipients, undefined);
  await assertSucceeds(getDoc(doc(db, 'settings/current')));
  await assertFails(getDoc(doc(db, 'rounds/2026/revisions/r1/assignments/A')));
  await assertFails(getDoc(doc(db, 'rounds/2026/people/B')));
  await setDoc(doc(db, 'wishSessions/unconfirmed'), { keyHash: hashA, confirmedRevision: 'r1' });
  await assertSucceeds(getDoc(doc(db, 'rounds/2026/revisions/r1/assignments/A')));
  await assertFails(getDoc(doc(db, 'rounds/2026/revisions/r1/assignments/B')));
  await assertFails(getDocs(collection(db, 'rounds/2026/revisions/r1/assignments')));
});
test('Neue Revision sperrt alte Sitzung bis zur erneuten Bestätigung', async () => {
  const db = await session('userA');
  await env.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    await setDoc(doc(admin, 'rounds/2026/revisions/r2/assignments/A'), { recipients: ['C', 'D'] });
    await updateDoc(doc(admin, 'settings/current'), { revision: 'r2' });
  });
  await assertFails(getDoc(doc(db, 'rounds/2026/revisions/r1/assignments/A')));
  await assertFails(getDoc(doc(db, 'rounds/2026/revisions/r2/assignments/A')));
  await setDoc(doc(db, 'wishSessions/userA'), { keyHash: hashA, confirmedRevision: 'r2' });
  const result = await assertSucceeds(getDoc(doc(db, 'rounds/2026/revisions/r2/assignments/A')));
  assert.deepEqual(result.data().recipients, ['C', 'D']);
  await assertFails(getDoc(doc(db, 'rounds/2026/people/B')));
  await assertSucceeds(getDoc(doc(db, 'rounds/2026/people/D')));
});
test('Derselbe Schlüssel funktioniert im Folgejahr nach Bestätigung', async () => {
  const db = await session('userA');
  await env.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    await setDoc(doc(admin, 'rounds/2027/revisions/next/assignments/A'), { recipients: ['B', 'C'] });
    await setDoc(doc(admin, 'settings/current'), { year: '2027', revision: 'next', enabled: true });
  });
  await assertFails(getDoc(doc(db, 'rounds/2027/revisions/next/assignments/A')));
  await setDoc(doc(db, 'wishSessions/userA'), { keyHash: hashA, confirmedRevision: 'next' });
  await assertSucceeds(getDoc(doc(db, 'rounds/2027/revisions/next/assignments/A')));
  await assertFails(getDoc(doc(db, 'rounds/2026/revisions/r1/assignments/A')));
});
test('Alte offene Prototyp-Daten sind nicht mehr erreichbar', async () => {
  const db = env.authenticatedContext('stranger').firestore();
  await assertFails(getDocs(collection(db, 'openRounds/2026/people')));
  await assertFails(setDoc(doc(db, 'openRounds/2026/people/A/wishes/new'), wish()));
});
test('Validierung und Jahrgangssperre werden serverseitig erzwungen', async () => {
  const db = await session('userA');
  await assertFails(setDoc(doc(db, 'rounds/2026/people/A/wishes/bad'), { ...wish(), text: '' }));
  await assertFails(setDoc(doc(db, 'rounds/2026/people/A/wishes/bad'), { ...wish(), link: 'javascript:alert(1)' }));
  await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'settings/current'), { enabled: false }));
  await assertFails(getDoc(doc(db, 'rounds/2026/people/A')));
});
