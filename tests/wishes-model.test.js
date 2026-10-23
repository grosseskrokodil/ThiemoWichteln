import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWish, usableConfig, hashAccessCode } from '../site/wishes-model.js';

test('Wünsche und optionale Links werden validiert und getrimmt', () => {
  assert.deepEqual(validateWish('  Ein Buch  ', ' https://example.com/buch '), { text: 'Ein Buch', link: 'https://example.com/buch' });
  assert.deepEqual(validateWish('Wunsch'), { text: 'Wunsch', link: '' });
  assert.throws(() => validateWish('   '));
  assert.throws(() => validateWish('a'.repeat(1001)));
});
test('Ausführbare Links und eingebettete Zugangsdaten werden abgelehnt', () => {
  for (const link of ['javascript:alert(1)', 'data:text/html,test', 'file:///secret', 'https://user:secret@example.com/', 'example.com']) {
    assert.throws(() => validateWish('Buch', link));
  }
});
test('Fehlende Firebase-Einrichtung wird erkannt', () => {
  assert.equal(Boolean(usableConfig({})), false);
  assert.equal(Boolean(usableConfig({ apiKey: '', projectId: '', appId: '', authDomain: '' })), false);
  assert.equal(Boolean(usableConfig({ apiKey: 'public', projectId: 'project', appId: 'app', authDomain: 'example.com' })), true);
});
test('Persönlicher Code wird identisch zu Python mit SHA-256 gehasht', async () => {
  const { createHash } = await import('node:crypto');
  const code = 'a'.repeat(43);
  assert.equal(await hashAccessCode(code), createHash('sha256').update(code).digest('hex'));
  await assert.rejects(hashAccessCode('kurz'));
  await assert.rejects(hashAccessCode('/'.repeat(43)));
});
