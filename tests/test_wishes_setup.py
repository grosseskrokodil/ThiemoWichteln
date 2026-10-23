import sys
from pathlib import Path
import copy
import hashlib
import json
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from setup_wishes import initialize, ensure_people, lookup, make_plan, new_draw, read, save, private_dir

class WishesSetupTests(unittest.TestCase):
    def setUp(self):
        self.record = {'year': 2026, 'demo': False, 'people': ['A', 'B', 'C', 'D'], 'exclusions': {},
                       'previous_year_checked': False,
                       'allocations': {'A': ['B', 'C'], 'B': ['C', 'D'], 'C': ['D', 'A'], 'D': ['A', 'B']}}
        self.registry = {'people': {}}
        ensure_people(self.registry, self.record['people'])

    def test_links_and_identities_remain_stable_across_years(self):
        original = copy.deepcopy(self.registry)
        ensure_people(self.registry, ['A', 'B', 'C', 'D', 'E'])
        for identifier, person in original['people'].items():
            self.assertEqual(person, self.registry['people'][identifier])
        following = {**self.record, 'year': 2027}
        _, first = make_plan(self.record, self.registry)
        _, later = make_plan(following, self.registry)
        first_keys = {p:v for p,v in first.items() if p.startswith('accessKeys/')}
        later_keys = {p:v for p,v in later.items() if p.startswith('accessKeys/')}
        self.assertEqual(first_keys, later_keys)

    def test_preconfirmation_keys_contain_no_allocations(self):
        _, docs = make_plan(self.record, self.registry)
        for path, fields in docs.items():
            if path.startswith('accessKeys/'):
                self.assertEqual(set(fields), {'personId', 'name', 'enabled'})
                self.assertNotIn('recipients', fields)
        self.assertEqual(len([path for path in docs if '/assignments/' in path]), 4)

    def test_removed_person_disabled_and_returning_person_reuses_link(self):
        identifier = lookup(self.registry, 'D')
        code = self.registry['people'][identifier]['code']
        current = {**self.record, 'people': ['A', 'B', 'C'], 'allocations': {'A':['B','C'],'B':['A','C'],'C':['A','B']}}
        _, docs = make_plan(current, self.registry)
        path = 'accessKeys/' + hashlib.sha256(code.encode()).hexdigest()
        self.assertFalse(docs[path]['enabled'])
        ensure_people(self.registry, ['D'])
        self.assertEqual(code, self.registry['people'][identifier]['code'])
        _, restored = make_plan(self.record, self.registry)
        self.assertTrue(restored[path]['enabled'])

    def test_rename_preserves_identity(self):
        identifier = lookup(self.registry, 'A')
        person = self.registry['people'][identifier]
        person['aliases'].append('A'); person['name'] = 'Alex'
        self.assertEqual(lookup(self.registry, 'Alex'), identifier)
        self.assertEqual(lookup(self.registry, 'A'), identifier)

    def test_initialization_is_idempotent_and_never_changes_public_data(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            save(root / 'data/config.json', {k:v for k,v in self.record.items() if k not in ['allocations','previous_year_checked']})
            save(root / 'data/years/2026.json', self.record)
            initialize(root)
            registry = read(private_dir(root) / 'participants.json')
            initialize(root)
            self.assertEqual(registry, read(private_dir(root) / 'participants.json'))
            before = (root / 'data/years/2026.json').read_bytes()
            new_draw(root, replace=True, first_year=True)
            self.assertEqual(before, (root / 'data/years/2026.json').read_bytes())
            self.assertFalse((root / 'site/data.js').exists())
            self.assertEqual(registry, read(private_dir(root) / 'participants.json'))
            with self.assertRaisesRegex(ValueError, 'existiert'):
                new_draw(root)

    def test_revision_is_deterministic_and_changes_on_new_allocation(self):
        first, _ = make_plan(self.record, self.registry)
        again, _ = make_plan(self.record, self.registry)
        self.assertEqual(first, again)
        other = copy.deepcopy(self.record)
        other['allocations']['A'] = ['B', 'D']
        newer, _ = make_plan(other, self.registry)
        self.assertNotEqual(first['revision'], newer['revision'])

    def test_exactly_four_html_versions_and_private_pages_never_load_public_data(self):
        site = Path(__file__).resolve().parents[1] / 'site'
        self.assertEqual({p.name for p in site.glob('*.html')}, {'index.html','version-2.html','firebase.html','firebase-kurz.html'})
        for filename in ['firebase.html','firebase-kurz.html']:
            html = (site / filename).read_text(encoding='utf-8')
            self.assertNotIn('src="data.js"', html)
            self.assertNotIn('src="app.js"', html)
            self.assertIn('id="identity-dialog"', html)
