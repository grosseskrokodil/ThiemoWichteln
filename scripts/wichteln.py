"""Einmalige Jahresauslosung und Ausgabe für die statische Webseite."""
import argparse
from collections import Counter
from datetime import datetime, timezone
from itertools import combinations
import json
from pathlib import Path
import random

ROOT = Path(__file__).resolve().parents[1]


def validate_config(config):
    people = config.get('people', [])
    year = config.get('year')
    if type(year) is not int or not 2000 <= year <= 9999:
        raise ValueError('Der Jahrgang muss eine vierstellige Jahreszahl sein.')
    if not isinstance(people, list) or len(people) < 3 or any(not isinstance(p, str) or not p.strip() or p != p.strip() for p in people):
        raise ValueError('Mindestens drei eindeutige, nicht leere Namen sind erforderlich.')
    if len(set(people)) != len(people):
        raise ValueError('Teilnehmernamen dürfen nicht doppelt vorkommen.')
    exclusions = config.get('exclusions', {})
    if not isinstance(exclusions, dict):
        raise ValueError('Ausschlüsse müssen nach Namen gegliedert sein.')
    for person, blocked in exclusions.items():
        if person not in people or not isinstance(blocked, list) or any(p not in people for p in blocked):
            raise ValueError('Ausschlüsse enthalten unbekannte Namen oder ungültige Listen.')


def validate_allocation(config, allocation, previous):
    validate_config(config)
    people = config['people']
    if set(allocation) != set(people):
        raise ValueError('Die Auslosung stimmt nicht mit der Teilnehmerliste überein.')
    counts = Counter()
    for giver, receivers in allocation.items():
        if not isinstance(receivers, list) or len(receivers) != 2 or len(set(receivers)) != 2:
            raise ValueError('Jede Person benötigt zwei unterschiedliche Empfänger.')
        if any(p not in people or p == giver or p in config.get('exclusions', {}).get(giver, []) for p in receivers):
            raise ValueError('Die Auslosung verletzt einen Ausschluss.')
        if giver in previous and set(receivers) == set(previous[giver]):
            raise ValueError('Eine Zweierkombination wiederholt das Vorjahr.')
        counts.update(receivers)
    if any(counts[p] != 2 for p in people):
        raise ValueError('Jede Person muss genau zwei Geschenke erhalten.')


def draw(config, previous, rng=None, limit=500000):
    validate_config(config)
    rng = rng or random.SystemRandom()
    people = config['people']
    choices = {}
    for giver in people:
        eligible = [p for p in people if p != giver and p not in config.get('exclusions', {}).get(giver, [])]
        choices[giver] = [pair for pair in combinations(eligible, 2) if set(pair) != set(previous.get(giver, []))]
        rng.shuffle(choices[giver])
        if not choices[giver]:
            raise ValueError(f'Für {giver} gibt es keine erlaubte Zweierkombination. Bitte Regeln prüfen.')
    allocation, counts = {}, Counter()
    visited = 0

    def search():
        nonlocal visited
        visited += 1
        if visited > limit:
            raise ValueError('Suchgrenze erreicht. Die Regeln könnten zu eng sein; es wurde nichts gespeichert.')
        if len(allocation) == len(people):
            return all(counts[p] == 2 for p in people)
        available = {p: [pair for pair in choices[p] if all(counts[r] < 2 for r in pair)] for p in people if p not in allocation}
        if any(not pairs for pairs in available.values()):
            return False
        for receiver in people:
            possible_givers = sum(any(receiver in pair for pair in pairs) for pairs in available.values())
            if counts[receiver] + possible_givers < 2:
                return False
        giver = min(available, key=lambda p: len(available[p]))
        for pair in available[giver]:
            allocation[giver] = list(pair)
            counts.update(pair)
            if search():
                return True
            counts.subtract(pair)
            del allocation[giver]
        return False

    if not search():
        raise ValueError('Unter diesen Regeln ist keine gültige Auslosung möglich. Es wurde nichts gespeichert.')
    validate_allocation(config, allocation, previous)
    return {p: allocation[p] for p in people}


def load_previous(root, year):
    path = root / 'data' / 'years' / f'{year - 1}.json'
    if not path.exists():
        raise ValueError(f'Vorjahr {year - 1} fehlt. Bitte dessen Ergebnis hinterlegen; für eine erste Runde explizit --first-year verwenden.')
    data = json.loads(path.read_text(encoding='utf-8'))
    if data.get('year') != year - 1 or not isinstance(data.get('allocations'), dict):
        raise ValueError('Die Vorjahresdatei ist ungültig.')
    for receivers in data['allocations'].values():
        if not isinstance(receivers, list) or len(receivers) != 2 or any(not isinstance(p, str) for p in receivers) or len(set(receivers)) != 2:
            raise ValueError('Die Vorjahresdatei enthält ungültige Zweierkombinationen.')
    return data


def run(command, root=ROOT, first_year=False):
    config = json.loads((root / 'data/config.json').read_text(encoding='utf-8-sig'))
    validate_config(config)
    year = config['year']
    path = root / 'data/years' / f'{year}.json'
    if command == 'draw' and path.exists():
        raise ValueError(f'{year} ist bereits ausgelost. Die gespeicherte Zuordnung bleibt bestehen.')
    if command == 'draw':
        previous_data = {'allocations': {}} if first_year else load_previous(root, year)
        if not config.get('demo', False) and previous_data.get('demo', False):
            raise ValueError('Für eine echte Auslosung muss das echte Vorjahr eingetragen sein.')
        record = {**config, 'created_at': datetime.now(timezone.utc).isoformat(), 'previous_year_checked': not first_year,
                  'allocations': draw(config, previous_data['allocations'])}
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('x', encoding='utf-8') as handle:
            json.dump(record, handle, ensure_ascii=False, indent=2)
            handle.write('\n')
    else:
        if not path.exists():
            raise ValueError(f'Jahrgang {year} wurde noch nicht ausgelost.')
        record = json.loads(path.read_text(encoding='utf-8'))
        if record.get('year') != year:
            raise ValueError('Jahrgang der Ergebnisdatei stimmt nicht überein.')
        previous = load_previous(root, year)['allocations'] if record.get('previous_year_checked', True) else {}
        validate_allocation(record, record['allocations'], previous)
        if record['people'] != config['people'] or record.get('exclusions', {}) != config.get('exclusions', {}) or record.get('demo', False) != config.get('demo', False):
            raise ValueError('Konfiguration wurde nach der Auslosung geändert. Bitte gespeicherte Einstellungen wiederherstellen.')
    public = {key: record[key] for key in ('year', 'people', 'allocations')}
    public['demo'] = record.get('demo', False)
    (root / 'site/data.js').write_text('window.WICHTEL_DATA = ' + json.dumps(public, ensure_ascii=True, indent=2) + ';\n', encoding='utf-8')
    print(f'Jahrgang {year}: gespeichert und für die Webseite vorbereitet.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['draw', 'build'])
    parser.add_argument('--first-year', action='store_true', help='Nur für die erste Runde ohne Vorjahr.')
    args = parser.parse_args()
    try:
        run(args.command, first_year=args.first_year)
    except (ValueError, OSError, KeyError, TypeError) as error:
        parser.exit(1, f'Fehler: {error}\n')
