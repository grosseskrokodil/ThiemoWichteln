import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from setup_wishes import ensure_people, save, publish, make_plan


@unittest.skipUnless(os.environ.get('FIRESTORE_EMULATOR_HOST'), 'Nur gegen den lokalen Firestore-Emulator ausführen')
class FirebasePublishTests(unittest.TestCase):
    def setUp(self):
        from google.cloud.firestore import Client
        from google.auth.credentials import AnonymousCredentials
        self.db = Client(project='demo-wichteln', credentials=AnonymousCredentials())
        self.db.document('settings/current').delete()
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.directory = self.root / '.private/firebase'
        self.record = {'year': 2026, 'people': ['A','B','C','D'], 'demo': False, 'exclusions': {},
                       'previous_year_checked': False,
                       'allocations': {'A':['B','C'],'B':['C','D'],'C':['D','A'],'D':['A','B']}}
        self.registry = {'people': {}}
        ensure_people(self.registry, self.record['people'])
        save(self.directory / 'participants.json', self.registry)
        self.write_record()

    def tearDown(self):
        self.db.document('settings/current').delete()
        self.db.close()
        self.temp.cleanup()

    def write_record(self):
        save(self.directory / 'config.json', {k:v for k,v in self.record.items() if k not in ['allocations','previous_year_checked']})
        save(self.directory / f'years/{self.record["year"]}.json', self.record)

    def test_atomic_publish_idempotency_and_explicit_replace(self):
        publish(self.root, self.db)
        pointer, docs = make_plan(self.record, self.registry)
        self.assertEqual(pointer, self.db.document('settings/current').get().to_dict())
        for path, fields in docs.items():
            self.assertEqual(fields, self.db.document(path).get().to_dict())
        publish(self.root, self.db)  # Kein Reset bei identischer Wiederholung.
        old = dict(pointer)
        self.record['allocations'] = {'A':['B','D'],'B':['C','A'],'C':['D','B'],'D':['A','C']}
        self.write_record()
        with self.assertRaisesRegex(ValueError, 'replace'):
            publish(self.root, self.db)
        self.assertEqual(old, self.db.document('settings/current').get().to_dict())
        publish(self.root, self.db, replace=True)
        fresh, _ = make_plan(self.record, self.registry)
        self.assertEqual(fresh, self.db.document('settings/current').get().to_dict())

    def test_new_year_keeps_keys_and_existing_wishes(self):
        publish(self.root, self.db)
        _, old_docs = make_plan(self.record, self.registry)
        person_id = next(iter(self.registry['people']))
        wish_path = f'rounds/2026/people/{person_id}/wishes/keep'
        self.db.document(wish_path).set({'text': 'Nicht löschen'})
        self.record['year'] = 2027
        self.write_record()
        publish(self.root, self.db, replace=True)
        for path in old_docs:
            if path.startswith('accessKeys/'):
                self.assertEqual(old_docs[path], self.db.document(path).get().to_dict())
        self.assertEqual({'text':'Nicht löschen'}, self.db.document(wish_path).get().to_dict())
