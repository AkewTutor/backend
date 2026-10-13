// src/utils/contact.ts
// Canonical form for contact identifiers so "0911000004" and "+251911000004"
// (and "S1@Test.local" and "s1@test.local") are treated as the same account.

/** Ethiopian mobile numbers -> +2519XXXXXXXX / +2517XXXXXXXX. Unrecognised formats are returned cleaned but unchanged. */
export function normalizePhone(raw: string): string {
  let p = raw.trim().replace(/[\s\-().]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2); // 00251... -> +251...
  if (/^\+?251[79]\d{8}$/.test(p)) return '+' + p.replace(/^\+/, ''); // 251911000004 or +251911000004
  if (/^0[79]\d{8}$/.test(p)) return '+251' + p.slice(1); // 0911000004
  if (/^[79]\d{8}$/.test(p)) return '+251' + p; // 911000004
  return p;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** For fields that may hold either an email or a phone (login identifier, invite contact). */
export function normalizeContact(raw: string): string {
  return raw.includes('@') ? normalizeEmail(raw) : normalizePhone(raw);
}
