import { firebaseConfig, emulators } from './firebase-config.js';
import { usableConfig, hashAccessCode, validateWish } from './wishes-model.js';

// Keine öffentliche Zuordnung und kein festes Jahr: Firebase bestimmt die aktive Runde.
export async function connectStore() {
  if (!usableConfig(firebaseConfig)) throw new Error('Firebase ist noch nicht eingerichtet. Die Organisation muss die Web-App-Konfiguration und die Datenbank verbinden.');
  const sdk = 'https://www.gstatic.com/firebasejs/13.1.0/';
  const [appSDK, authSDK, dbSDK] = await Promise.all([
    import(sdk + 'firebase-app.js'), import(sdk + 'firebase-auth.js'), import(sdk + 'firebase-firestore.js'),
  ]);
  const app = appSDK.initializeApp(firebaseConfig, 'personal-wichteln');
  const auth = authSDK.getAuth(app);
  const localTest = emulators && ['localhost', '127.0.0.1'].includes(location.hostname) && firebaseConfig.projectId.startsWith('demo-');
  if (emulators && !localTest) throw new Error('Lokale Testverbindungen sind nur auf localhost erlaubt.');
  if (localTest) authSDK.connectAuthEmulator(auth, `http://127.0.0.1:${emulators.authPort}`, { disableWarnings: true });
  await authSDK.setPersistence(auth, authSDK.inMemoryPersistence);
  await authSDK.signInAnonymously(auth);
  const db = dbSDK.getFirestore(app);
  if (localTest) dbSDK.connectFirestoreEmulator(db, '127.0.0.1', emulators.firestorePort);
  const { doc, collection, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, runTransaction, serverTimestamp } = dbSDK;
  let actor, keyHash, active = null, confirmedRevision = null;
  const sessionRef = doc(db, 'wishSessions', auth.currentUser.uid);
  const currentRef = doc(db, 'settings', 'current');
  const assignmentRef = () => doc(db, 'rounds', active.year, 'revisions', active.revision, 'assignments', actor);
  const personRef = id => doc(db, 'rounds', active.year, 'people', id);
  const wishRef = (person, id) => doc(db, 'rounds', active.year, 'people', person, 'wishes', id);
  const reservationRef = (person, id) => doc(db, 'rounds', active.year, 'revisions', active.revision, 'reservations', person, 'items', id);
  function ready() {
    if (!active || confirmedRevision !== active.revision) throw new Error('Die Runde wurde aktualisiert. Bitte bestätige deinen Namen erneut.');
  }
  async function login(code) {
    keyHash = await hashAccessCode(code);
    const key = await getDoc(doc(db, 'accessKeys', keyHash));
    if (!key.exists() || !key.data().enabled) throw new Error('Dieser persönliche Link ist ungültig oder gesperrt.');
    actor = key.data().personId;
    // Vor der Bestätigung enthält die Sitzung ausdrücklich keine freigegebene Revision.
    await setDoc(sessionRef, { keyHash, confirmedRevision: '' });
    return { id: actor, name: key.data().name };
  }
  function watchRound(onChange, onError) {
    return onSnapshot(currentRef, snapshot => {
      const data = snapshot.exists() ? snapshot.data() : null;
      if (!data || !data.enabled) { active = null; confirmedRevision = null; onError(new Error('Aktuell ist keine Wichtelrunde freigeschaltet.')); return; }
      const changed = !active || active.revision !== data.revision || active.year !== data.year;
      active = { year: data.year, revision: data.revision };
      if (changed) { confirmedRevision = null; onChange({ ...active }); }
    }, error => { confirmedRevision = null; onError(error); });
  }
  async function confirmIdentity() {
    if (!active) throw new Error('Die aktuelle Runde ist noch nicht verfügbar.');
    const expected = { ...active };
    await setDoc(sessionRef, { keyHash, confirmedRevision: expected.revision });
    if (!active || expected.revision !== active.revision) throw new Error('Die Runde hat sich geändert. Bitte erneut bestätigen.');
    const allocation = await getDoc(assignmentRef());
    if (!allocation.exists()) throw new Error('Du bist in der aktuellen Runde nicht eingetragen. Bitte frage die Organisation.');
    const recipients = await Promise.all(allocation.data().recipients.map(async id => {
      const person = await getDoc(personRef(id));
      if (!person.exists()) throw new Error('Die Zuordnung ist unvollständig.');
      return { id, name: person.data().name };
    }));
    if (!active || active.revision !== expected.revision) throw new Error('Die Runde wurde während des Öffnens aktualisiert. Bitte erneut bestätigen.');
    confirmedRevision = expected.revision;
    return { id: actor, recipients, year: expected.year };
  }
  function watch(person, onData, onError) {
    ready();
    const revision = active.revision;
    let wishes = null, reservations = {}, reservationsLoaded = person === actor;
    const emit = () => { if (active?.revision === revision && wishes && reservationsLoaded) onData(wishes.map(wish => ({ ...wish, reservation: reservations[wish.id] || null }))); };
    const unsub = [onSnapshot(collection(db, 'rounds', active.year, 'people', person, 'wishes'), snap => {
      wishes = snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)); emit();
    }, onError)];
    if (person !== actor) unsub.push(onSnapshot(collection(db, 'rounds', active.year, 'revisions', active.revision, 'reservations', person, 'items'), snap => {
      reservations = Object.fromEntries(snap.docs.map(item => [item.id, item.data()])); reservationsLoaded = true; emit();
    }, onError));
    return () => unsub.forEach(stop => stop());
  }
  async function saveWish(person, id, text, link) {
    ready();
    if (person !== actor) throw new Error('Bitte nur eigene Wünsche bearbeiten.');
    const fields = { ...validateWish(text, link), updatedAt: serverTimestamp() };
    if (id) return updateDoc(wishRef(person, id), fields);
    return addDoc(collection(db, 'rounds', active.year, 'people', person, 'wishes'), { ...fields, createdAt: serverTimestamp() });
  }
  async function removeWish(person, id) {
    ready();
    if (person !== actor) throw new Error('Bitte nur eigene Wünsche bearbeiten.');
    return deleteDoc(wishRef(person, id));
  }
  async function reserve(person, id) {
    ready();
    if (person === actor) throw new Error('Eigene Wünsche können nicht reserviert werden.');
    // Pfade vor der Transaktion einfrieren; ein Rundenwechsel führt serverseitig zum Abbruch.
    const wish = wishRef(person, id), reservation = reservationRef(person, id);
    await runTransaction(db, async transaction => {
      if (!(await transaction.get(wish)).exists()) throw new Error('Dieser Wunsch wurde inzwischen entfernt.');
      if ((await transaction.get(reservation)).exists()) throw new Error('Dieser Wunsch wurde inzwischen bereits reserviert.');
      transaction.set(reservation, { giverId: actor, createdAt: serverTimestamp() });
    });
  }
  async function release(person, id) {
    ready();
    const ref = reservationRef(person, id);
    await runTransaction(db, async transaction => {
      const existing = await transaction.get(ref);
      if (!existing.exists()) return;
      if (existing.data().giverId !== actor) throw new Error('Diese Reservierung gehört jemand anderem.');
      transaction.delete(ref);
    });
  }
  return { login, watchRound, confirmIdentity, watch, saveWish, removeWish, reserve, release };
}
