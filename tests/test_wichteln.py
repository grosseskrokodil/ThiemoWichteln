import copy
import importlib.util
import json
from pathlib import Path
import random
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('wichteln', Path(__file__).resolve().parents[1] / 'scripts/wichteln.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)


class AllocationTests(unittest.TestCase):
    def setUp(self):
        self.people = ['A', 'B', 'C', 'D', 'E', 'F']
        self.config = {'year': 2026, 'people': self.people, 'exclusions': {'A': ['B']}}
        self.previous = {p: [self.people[(i + 1) % 6], self.people[(i + 2) % 6]] for i, p in enumerate(self.people)}

    def test_draw_respects_counts_and_rules_across_seeds(self):
        for seed in range(40):
            with self.subTest(seed=seed):
                result = w.draw(self.config, self.previous, random.Random(seed))
                w.validate_allocation(self.config, result, self.previous)

    def test_single_previous_recipient_is_allowed(self):
        people = ['A', 'B', 'C', 'D']
        config = {'year': 2026, 'people': people, 'exclusions': {}}
        previous = {p: [people[(i + 1) % 4], people[(i + 2) % 4]] for i, p in enumerate(people)}
        result = w.draw(config, previous, random.Random(1))
        w.validate_allocation(config, result, previous)
        self.assertTrue(all(len(set(result[p]) & set(previous[p])) == 1 for p in people))

    def test_previous_pair_is_unordered(self):
        config = {'year': 2026, 'people': self.people, 'exclusions': {}}
        with self.assertRaisesRegex(ValueError, 'Vorjahr'):
            w.validate_allocation(config, {p: list(reversed(v)) for p, v in self.previous.items()}, self.previous)

    def test_impossible_rules_fail(self):
        config = copy.deepcopy(self.config)
        config['exclusions']['A'] = ['B', 'C', 'D', 'E']
        with self.assertRaisesRegex(ValueError, 'keine erlaubte'):
            w.draw(config, self.previous)

    def test_duplicate_names_fail(self):
        with self.assertRaisesRegex(ValueError, 'doppelt'):
            w.draw({**self.config, 'people': ['A', 'A', 'B']}, {})

    def test_frozen_year_and_build_are_stable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'data/years').mkdir(parents=True)
            (root / 'site').mkdir()
            (root / 'data/config.json').write_text(json.dumps(self.config), encoding='utf-8')
            previous = {'year': 2025, 'allocations': self.previous}
            (root / 'data/years/2025.json').write_text(json.dumps(previous), encoding='utf-8')
            w.run('draw', root)
            before = (root / 'data/years/2026.json').read_bytes()
            public_before = (root / 'site/data.js').read_bytes()
            with self.assertRaisesRegex(ValueError, 'bereits ausgelost'):
                w.run('draw', root)
            w.run('build', root)
            self.assertEqual(before, (root / 'data/years/2026.json').read_bytes())
            self.assertEqual(public_before, (root / 'site/data.js').read_bytes())
            changed = {**self.config, 'people': list(reversed(self.people))}
            (root / 'data/config.json').write_text(json.dumps(changed), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'Konfiguration'):
                w.run('build', root)

    def test_missing_previous_year_never_silently_ignored(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, 'Vorjahr'):
                w.load_previous(Path(directory), 2026)

    def test_joining_and_leaving_people(self):
        for people in [self.people + ['New'], self.people[:-1], self.people[:-2] + ['New', 'Other', 'Third']]:
            config = {'year': 2026, 'people': people, 'exclusions': {}}
            for seed in range(10):
                result = w.draw(config, self.previous, random.Random(seed))
                w.validate_allocation(config, result, self.previous)
                self.assertEqual(set(result), set(people))
                self.assertTrue(all(r in people for pair in result.values() for r in pair))
