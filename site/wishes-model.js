export function validateWish(text, link = '') {
  text = text.trim();
  link = link.trim();
  if (!text || text.length > 1000) throw new Error('Bitte einen Wunsch mit höchstens 1.000 Zeichen eingeben.');
  if (link) {
    let url;
    try { url = new URL(link); } catch { throw new Error('Bitte einen vollständigen Link mit https:// eingeben.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || link.length > 2000) {
      throw new Error('Bitte einen gültigen http://- oder https://-Link ohne Zugangsdaten verwenden.');
    }
  }
  return { text, link };
}

export function usableConfig(config) {
  return ['apiKey', 'projectId', 'appId', 'authDomain'].every(key => typeof config[key] === 'string' && config[key].trim());
}

export async function hashAccessCode(code) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw new Error('Dieser persönliche Link ist unvollständig oder ungültig.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
