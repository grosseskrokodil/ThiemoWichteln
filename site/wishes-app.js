import { connectStore } from './wishes-store.js';

const $ = id => document.getElementById(id);
let identity, stopRound = () => {}, current = null;
let retainedDraft = null;
let store, me, target, editing = null, stopWatch = () => {}, generation = 0;
let busy = false;
const message = (text, error = false) => { $('message').textContent = text; $('message').classList.toggle('error', error); };
const setBusy = value => {
  busy = value;
  document.querySelectorAll('[data-write]').forEach(button => button.disabled = value);
  $('wish-form').setAttribute('aria-busy', String(value));
};
function readableError(error) {
  const code = error?.code || '';
  if (code.includes('permission-denied')) return 'Kein Zugriff. Der Zugang wurde möglicherweise gesperrt oder die Firebase-Regeln sind noch nicht eingerichtet.';
  if (code.includes('unavailable') || code.includes('network')) return 'Keine Verbindung. Bitte prüfe deine Internetverbindung und kontrolliere danach den aktuellen Speicherstand.';
  if (code.includes('quota-exceeded') || code.includes('resource-exhausted')) return 'Das Nutzungslimit ist erreicht. Bitte versuche es später erneut.';
  return error?.message || 'Die Änderung konnte nicht gespeichert werden.';
}
async function write(action, success) {
  if (busy) return;
  setBusy(true); message('Wird gespeichert …');
  try { await action(); message(success); } catch (error) { message(readableError(error), true); }
  finally { setBusy(false); }
}
function clearEditor() {
  editing = null; $('wish-form').reset(); $('save-wish').textContent = 'Wunsch hinzufügen'; $('cancel-edit').hidden = true;
}
function cardButton(label, action, primary = false) {
  const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
  button.className = primary ? 'wish-primary' : 'secondary'; button.dataset.write = '';
  button.disabled = busy; button.addEventListener('click', action); return button;
}
function renderWishes(wishes) {
  const list = $('wish-list'); list.replaceChildren();
  $('empty-list').hidden = wishes.length !== 0;
  for (const wish of wishes) {
    const article = document.createElement('article'); article.className = 'wish-card';
    const text = document.createElement('p'); text.className = 'wish-text'; text.textContent = wish.text; article.append(text);
    const actions = document.createElement('div'); actions.className = 'wish-actions';
    if (target.id === me.id) {
      actions.append(cardButton('Bearbeiten', () => {
        editing = wish.id; $('wish-text').value = wish.text;
        $('save-wish').textContent = 'Änderungen speichern'; $('cancel-edit').hidden = false; $('wish-text').focus();
      }));
      actions.append(cardButton('Löschen', () => {
        $('delete-description').textContent = `Diesen Wunsch wirklich löschen? „${wish.text}“`;
        $('delete-dialog').showModal();
        $('delete-dialog').onclose = () => {
          if ($('delete-dialog').returnValue === 'delete') write(async () => {
            await store.removeWish(me.id, wish.id); if (editing === wish.id) clearEditor();
          }, 'Wunsch gelöscht.');
        };
      }));
    } else if (!wish.reservation) {
      actions.append(cardButton('Das übernehme ich', () => write(() => store.reserve(target.id, wish.id), 'Für dich reserviert.'), true));
    } else if (wish.reservation.giverId === me.id) {
      const note = document.createElement('span'); note.className = 'reservation-state'; note.textContent = 'Von dir reserviert'; article.append(note);
      actions.append(cardButton('Reservierung aufheben', () => write(() => store.release(target.id, wish.id), 'Reservierung aufgehoben.')));
    } else {
      const note = document.createElement('span'); note.className = 'reservation-state'; note.textContent = 'Bereits reserviert'; article.append(note);
    }
    article.append(actions); list.append(article);
  }
}
function showList(person, restoring = false) {
  if (busy) return;
  if (!restoring && $('wish-text').value.trim() && !window.confirm('Ungespeicherte Änderungen verwerfen?')) return;
  const current = ++generation; stopWatch(); clearEditor(); target = person;
  $('list-title').textContent = person.id === me.id ? 'Meine Wunschliste' : `Wünsche von ${person.name}`;
  $('list-hint').textContent = person.id === me.id ? 'Hier trägst du deine Wünsche ein. Reservierungen siehst du in deiner eigenen Liste nicht.' : 'Stimmt euch über die Reservierungen ab. Die beschenkte Person sieht sie in ihrer eigenen Ansicht nicht.';
  $('editor').hidden = person.id !== me.id;
  if (restoring && retainedDraft) {
    $('wish-text').value = retainedDraft.text;
    // Als neuer Entwurf, weil das alte Wunsch-Dokument zu einem anderen Jahr gehören kann.
    editing = null; retainedDraft = null;
  }
  $('empty-list').hidden = true; $('wish-list').replaceChildren(); message('Wünsche werden geladen …');
  document.querySelectorAll('.list-tab').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.person === person.id)));
  stopWatch = store.watch(person.id, wishes => {
    if (generation !== current) return;
    renderWishes(wishes); message('');
  }, error => { if (generation === current) message(readableError(error), true); });
}
function dashboard(profile) {
  me = profile; $('choose-person').hidden = true; $('dashboard').hidden = false;
  $('welcome').textContent = `Hallo ${me.name}`;
  const navigation = $('list-navigation'); navigation.replaceChildren();
  [{ id: me.id, name: 'Meine Wünsche' }, ...me.recipients].forEach(person => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'list-tab';
    button.dataset.person = person.id; button.textContent = person.name;
    button.setAttribute('aria-pressed', 'false'); button.addEventListener('click', () => showList(person)); navigation.append(button);
  });
  $('assignment-names').textContent = me.recipients.map(person => person.name).join(' und ');
  showList(me, true);
}

$('wish-form').addEventListener('submit', event => {
  event.preventDefault();
  write(async () => { await store.saveWish(me.id, editing, $('wish-text').value); clearEditor(); }, 'Wunsch gespeichert.');
});
$('cancel-edit').addEventListener('click', clearEditor);
$('identity-form').addEventListener('submit', event => {
  event.preventDefault();
  $('confirm-person-title').textContent = `Bist du wirklich ${identity.name}?`;
  $('identity-dialog').showModal();
});
$('identity-dialog').addEventListener('close', async () => {
  if ($('identity-dialog').returnValue !== 'confirm') return;
  $('identity-submit').disabled = true; message('Deine Wunschlisten werden geöffnet …');
  try {
    const profile = await store.confirmIdentity();
    dashboard({ ...identity, ...profile });
  }
  catch (error) { message(readableError(error), true); }
  finally { $('identity-submit').disabled = false; }
});
window.addEventListener('beforeunload', event => { if (editing || $('wish-text').value.trim() || busy) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', () => { stopWatch(); stopRound(); });
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });

function lockRound(error) {
  if ($('wish-text').value.trim()) retainedDraft = { text: $('wish-text').value };
  ++generation; stopWatch();
  $('dashboard').hidden = true;
  $('wish-list').replaceChildren();
  $('list-navigation').replaceChildren();
  $('assignment-names').textContent = '';
  if ($('identity-dialog').open) $('identity-dialog').close('cancel');
  $('choose-person').hidden = false;
  $('identity-submit').disabled = true;
  if (error) message(readableError(error), true);
}
async function start() {
  try {
    const params = new URLSearchParams(location.hash.slice(1));
    const code = params.get('key');
    if (!code) throw new Error('Bitte öffne den vollständigen persönlichen Link, den du von der Organisation erhalten hast.');
    message('Dein persönlicher Zugang wird geprüft …');
    store = await connectStore();
    identity = await store.login(code);
    $('identity-name').textContent = `Dein Brief für ${identity.name}`;
    stopRound = store.watchRound(round => {
      const changed = current !== null;
      lockRound(); current = round;
      $('edition').textContent = round.year;
      const yearLabel = $('year'); if (yearLabel) yearLabel.textContent = `Weihnachten ${round.year}`;
      document.title = `Wichteln ${round.year}`;
      $('identity-submit').disabled = false;
      message(changed ? 'Die Wichtelrunde wurde aktualisiert. Bitte bestätige deinen Namen erneut. Ungespeicherte Eingaben im Formular bleiben erhalten.' : '');
    }, lockRound);
  } catch (error) { lockRound(error); }
}
start();
