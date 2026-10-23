// Hier später die Web-App-Konfiguration aus der Firebase-Konsole einsetzen.
// Diese Web-Konfiguration ist öffentlich. Niemals einen Admin-Schlüssel hier ablegen.
export const firebaseConfig = {
  apiKey: 'AIzaSyDla49MjnVRqnPabEgYFC5ebW0H2V7c0eU',
  authDomain: 'thiemowichteln.firebaseapp.com',
  projectId: 'thiemowichteln',
  storageBucket: 'thiemowichteln.firebasestorage.app',
  messagingSenderId: '978447246937',
  appId: '1:978447246937:web:781b5079ff6ef67ba77348',
};

// Den aktiven Jahrgang liefert Firebase; persönliche Links bleiben unverändert.
// Ausschließlich für lokale automatisierte Prüfungen; im Betrieb immer null lassen.
export const emulators = null;
