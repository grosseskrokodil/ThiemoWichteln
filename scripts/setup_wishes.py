"""Private Jahresauslosungen, dauerhafte persönliche Links und atomare Firebase-Veröffentlichung."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import secrets
import shutil
from urllib.parse import urlparse

from wichteln import ROOT, draw, validate_config, validate_allocation

DEFAULT_URL = 'https://grosseskrokodil.github.io/ThiemoWichteln/'


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def save(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def private_dir(root):
    return root / '.private/firebase'


def initialize(root=ROOT):
    destination = private_dir(root)
    config = read(root / 'data/config.json')
    validate_config(config)
    if config.get('demo') is not False:
        raise ValueError('Zuerst eine echte Jahreskonfiguration mit demo: false verwenden.')
    destination.mkdir(parents=True, exist_ok=True)
    if not (destination / 'config.json').exists():
        save(destination / 'config.json', config)
    for source in (root / 'data/years').glob('*.json'):
        target = destination / 'years' / source.name
        if not target.exists():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
    registry_path = destination / 'participants.json'
    registry = read(registry_path) if registry_path.exists() else {'people': {}}
    # Vorbereitete persönliche Links bleiben bei der Umstellung gültig.
    legacy = root / '.private' / f'links-{config["year"]}.txt'
    if legacy.exists() and not registry['people']:
        lines = legacy.read_text(encoding='utf-8').splitlines()
        for index, line in enumerate(lines):
            if '#key=' in line and index > 0:
                name = lines[index - 1].strip()
                code = line.split('#key=', 1)[1].strip()
                if name and len(code) == 43:
                    identifier = hashlib.sha256(name.encode()).hexdigest()[:24]
                    registry['people'][identifier] = {'name': name, 'aliases': [], 'code': code}
    ensure_people(registry, config['people'])
    for historical in (destination / 'years').glob('*.json'):
        old = read(historical)
        ensure_people(registry, old.get('people', list(old.get('allocations', {}))))
    save(registry_path, registry)
    export_links(registry, destination, DEFAULT_URL)
    print('Private Verwaltung vorbereitet. Bestehende Auslosung übernommen; nichts neu ausgelost und nichts hochgeladen.')


def lookup(registry, name):
    matches = [identifier for identifier, person in registry['people'].items() if name == person['name'] or name in person.get('aliases', [])]
    if len(matches) != 1:
        raise ValueError(f'Person nicht eindeutig im privaten Teilnehmerverzeichnis: {name}')
    return matches[0]


def ensure_people(registry, names):
    for name in names:
        if not any(name == person['name'] or name in person.get('aliases', []) for person in registry['people'].values()):
            registry['people'][secrets.token_hex(12)] = {'name': name, 'aliases': [], 'code': secrets.token_urlsafe(32)}


def export_links(registry, directory, base_url):
    parsed = urlparse(base_url)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.fragment or parsed.query:
        raise ValueError('Eine vollständige HTTPS-Webseitenadresse ohne Parameter verwenden.')
    lines = ['Persönliche Links – vertraulich. Beide Links einer Person verwenden denselben Schlüssel.', '']
    for person in registry['people'].values():
        lines += [person['name'], f'{base_url.rstrip("/")}/firebase.html#key={person["code"]}',
                  f'{base_url.rstrip("/")}/firebase-kurz.html#key={person["code"]}', '']
    (directory / 'links.txt').write_text('\n'.join(lines), encoding='utf-8')


def previous_names(previous, registry):
    # Historische Namen werden über feste IDs auf die heutigen Namen abgebildet.
    def current_name(name):
        return registry['people'][lookup(registry, name)]['name']
    return {current_name(giver): [current_name(receiver) for receiver in pair] for giver, pair in previous['allocations'].items()}


def load_round(root=ROOT):
    directory = private_dir(root)
    config = read(directory / 'config.json')
    validate_config(config)
    if config.get('demo') is not False:
        raise ValueError('Die private Runde muss demo: false verwenden.')
    registry = read(directory / 'participants.json')
    record = read(directory / 'years' / f'{config["year"]}.json')
    for field in ('year', 'people', 'exclusions', 'demo'):
        if record.get(field, {} if field == 'exclusions' else None) != config.get(field, {} if field == 'exclusions' else None):
            raise ValueError('Private Konfiguration und Auslosung stimmen nicht überein.')
    previous = {}
    if record.get('previous_year_checked', True):
        old = read(directory / 'years' / f'{config["year"] - 1}.json')
        if old.get('year') != config['year'] - 1 or old.get('demo') is not False:
            raise ValueError('Das echte Vorjahr fehlt oder hat eine falsche Jahreszahl.')
        previous = previous_names(old, registry)
    validate_allocation(config, record['allocations'], previous)
    return config, registry, record


def new_draw(root=ROOT, replace=False, first_year=False):
    directory = private_dir(root)
    config = read(directory / 'config.json')
    validate_config(config)
    if config.get('demo') is not False:
        raise ValueError('Nur echte private Jahresrunden verwenden.')
    registry = read(directory / 'participants.json')
    ensure_people(registry, config['people'])
    year = config['year']
    path = directory / 'years' / f'{year}.json'
    if path.exists() and not replace:
        raise ValueError('Für dieses Jahr existiert eine Auslosung. Nur bewusst mit --replace neu auslosen.')
    previous = {}
    if not first_year:
        old = read(directory / 'years' / f'{year - 1}.json')
        if old.get('year') != year - 1 or old.get('demo') is not False:
            raise ValueError('Das echte Vorjahr fehlt oder hat eine falsche Jahreszahl.')
        previous = previous_names(old, registry)
    record = {**config, 'created_at': datetime.now(timezone.utc).isoformat(), 'previous_year_checked': not first_year,
              'allocations': draw(config, previous)}
    if path.exists():
        archive = directory / 'archive' / f'{year}-{secrets.token_hex(6)}.json'
        save(archive, read(path))
    save(directory / 'participants.json', registry)
    save(path, record)
    export_links(registry, directory, DEFAULT_URL)
    print(f'{year} privat ausgelost. Firebase und die öffentlichen Vergleichsseiten wurden noch nicht verändert.')


def make_plan(record, registry):
    year = str(record['year'])
    canonical = {'year': year, 'allocations': record['allocations'], 'people': record['people']}
    revision = hashlib.sha256(json.dumps(canonical, sort_keys=True).encode()).hexdigest()[:32]
    active_ids = {lookup(registry, name) for name in record['people']}
    documents = {}
    for identifier, person in registry['people'].items():
        key_hash = hashlib.sha256(person['code'].encode()).hexdigest()
        documents[f'accessKeys/{key_hash}'] = {'personId': identifier, 'name': person['name'], 'enabled': identifier in active_ids}
    for name in record['people']:
        identifier = lookup(registry, name)
        documents[f'rounds/{year}/people/{identifier}'] = {'name': name}
        documents[f'rounds/{year}/revisions/{revision}/assignments/{identifier}'] = {
            'recipients': [lookup(registry, recipient) for recipient in record['allocations'][name]]}
    pointer = {'year': year, 'revision': revision, 'enabled': True}
    return pointer, documents


def publish(root, db, replace=False):
    _, registry, record = load_round(root)
    pointer, documents = make_plan(record, registry)
    current_ref = db.document('settings/current')
    previous = current_ref.get()
    if previous.exists:
        active = previous.to_dict()
        if active == pointer:
            print('Diese Auslosung ist bereits aktiv. Nichts verändert.')
            return
        if not replace:
            raise ValueError('Eine Runde ist bereits veröffentlicht. Zum bewussten Wechsel --replace verwenden. Reservierungen werden für die neue Revision zurückgesetzt.')
    if len(documents) + 1 > 450:
        raise ValueError('Zu viele Personen für eine atomare Veröffentlichung. Nichts verändert.')
    # Eine Transaktion schreibt alle Zuordnungen und den Aktivierungszeiger gemeinsam.
    # Die Vorbedingung verhindert, dass zwei Admins unbemerkt konkurrierend aktivieren.
    from google.cloud import firestore
    @firestore.transactional
    def activate(transaction):
        now = current_ref.get(transaction=transaction)
        expected = previous.to_dict() if previous.exists else None
        actual = now.to_dict() if now.exists else None
        if actual != expected:
            raise ValueError('Zwischenzeitlich wurde eine andere Runde veröffentlicht. Bitte erneut prüfen.')
        for path, fields in documents.items():
            transaction.set(db.document(path), fields)
        transaction.set(current_ref, pointer)
    activate(db.transaction())
    save(private_dir(root) / 'last-published.json', pointer)
    print(f'Jahrgang {pointer["year"]} veröffentlicht. Persönliche Links bleiben gleich; Teilnehmer bestätigen die aktualisierte Runde erneut.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('init')
    drawing = sub.add_parser('draw')
    drawing.add_argument('--replace', action='store_true')
    drawing.add_argument('--first-year', action='store_true')
    publication = sub.add_parser('publish')
    publication.add_argument('--project', required=True)
    publication.add_argument('--replace', action='store_true')
    links = sub.add_parser('links')
    links.add_argument('--base-url', default=DEFAULT_URL)
    rename = sub.add_parser('rename')
    rename.add_argument('old_name')
    rename.add_argument('new_name')
    args = parser.parse_args()
    try:
        if args.command == 'init': initialize()
        elif args.command == 'draw': new_draw(replace=args.replace, first_year=args.first_year)
        elif args.command == 'links':
            export_links(read(private_dir(ROOT) / 'participants.json'), private_dir(ROOT), args.base_url)
            print('Linkliste aktualisiert. Schlüssel unverändert.')
        elif args.command == 'rename':
            registry = read(private_dir(ROOT) / 'participants.json')
            identifier = lookup(registry, args.old_name)
            if any(args.new_name == person['name'] or args.new_name in person.get('aliases', []) for person in registry['people'].values()):
                raise ValueError('Der neue Name ist bereits vergeben.')
            if not args.new_name.strip() or args.new_name != args.new_name.strip():
                raise ValueError('Bitte einen nicht leeren Namen ohne äußere Leerzeichen verwenden.')
            person = registry['people'][identifier]
            person['aliases'].append(person['name']); person['name'] = args.new_name
            save(private_dir(ROOT) / 'participants.json', registry)
            export_links(registry, private_dir(ROOT), DEFAULT_URL)
            print('Name geändert; persönlicher Link unverändert. Den neuen Namen vor der nächsten Auslosung in der privaten Konfiguration verwenden.')
        else:
            try:
                import firebase_admin
                from firebase_admin import firestore
            except ImportError as error:
                raise ValueError('Zuerst python -m pip install -r requirements-firebase.txt ausführen.') from error
            app = firebase_admin.initialize_app(options={'projectId': args.project})
            publish(ROOT, firestore.client(app), replace=args.replace)
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, f'Fehler: {error}\n')


if __name__ == '__main__': main()
