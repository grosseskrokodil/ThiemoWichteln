"""Nur lokale Browserprüfung der echten Firebase-Anbindung, nie Produktivdaten."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys

if __name__ == '__main__':
    if os.environ.get('FIRESTORE_EMULATOR_HOST') != '127.0.0.1:8080':
        raise SystemExit('Nur mit lokalem Emulator ausführen.')
    from google.cloud.firestore import Client
    from google.auth.credentials import AnonymousCredentials
    root = Path(__file__).resolve().parents[1]
    client = Client(project='demo-wichteln', credentials=AnonymousCredentials())
    if len(sys.argv) > 1 and sys.argv[1] == 'switch':
        client.document('rounds/2027/people/A').set({'name':'Prüfperson'})
        client.document('rounds/2027/people/B').set({'name':'Empfänger B'})
        client.document('rounds/2027/people/C').set({'name':'Empfänger C'})
        client.document('rounds/2027/revisions/r2/assignments/A').set({'recipients':['B','C']})
        client.document('settings/current').set({'year':'2027','revision':'r2','enabled':True})
        print('Lokale Prüfrunde gewechselt.')
    else:
        qa = root / '.private/browser-test'
        qa.mkdir(parents=True, exist_ok=True)
        for source in (root / 'site').iterdir():
            if source.is_file(): shutil.copy2(source, qa / source.name)
        configuration = "export const firebaseConfig = {apiKey:'local-test-key',authDomain:'localhost',projectId:'demo-wichteln',appId:'local-test'};\nexport const emulators = {authPort:9099,firestorePort:8080};\n"
        (qa / 'firebase-config.js').write_text(configuration, encoding='utf-8')
        client.document('settings/current').set({'year':'2026','revision':'r1','enabled':True})
        for identifier, name, recipients in [('A','Prüfperson',['B','C']),('B','Empfänger B',['A','C']),('C','Empfänger C',['A','B'])]:
            client.document(f'rounds/2026/people/{identifier}').set({'name':name})
            client.document(f'rounds/2026/revisions/r1/assignments/{identifier}').set({'recipients':recipients})
        key = hashlib.sha256(('a'*43).encode()).hexdigest()
        client.document(f'accessKeys/{key}').set({'personId':'A','name':'Prüfperson','enabled':True})
        print('Lokale Browserprüfung vorbereitet. Ausschließlich isolierte Emulator-Daten.')
    client.close()
