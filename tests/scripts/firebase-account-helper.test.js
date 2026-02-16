import { describe, it, expect } from 'vitest';

const {
  parseFirebaseAccounts,
  parseActiveFirebaseAccount,
  appendFirebaseAccountFlag,
} = await import('../../scripts/firebase-account-helper.cjs');

describe('firebase-account-helper', () => {
  it('should parse unique emails from firebase login:list output', () => {
    const output = `
Logged in as user:
 - personal@example.com
 - pro@example.com
 - personal@example.com
`;
    const emails = parseFirebaseAccounts(output);
    expect(emails).toEqual(['personal@example.com', 'pro@example.com']);
  });

  it('should append --account when email is provided', () => {
    const cmd = appendFirebaseAccountFlag('firebase projects:list', 'pro@example.com');
    expect(cmd).toContain('--account pro@example.com');
  });

  it('should parse active account from firebase login:list output', () => {
    const output = `
Logged in as mfosela@geniova.com

Other available accounts (switch with "firebase login:use")
 - mjfosela@gmail.com
`;
    expect(parseActiveFirebaseAccount(output)).toBe('mfosela@geniova.com');
  });

  it('should keep command unchanged when account is empty', () => {
    const cmd = appendFirebaseAccountFlag('firebase projects:list', '');
    expect(cmd).toBe('firebase projects:list');
  });
});
