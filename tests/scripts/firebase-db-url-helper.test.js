import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const {
  resolveDatabaseUrl,
  loadDatabaseUrlFromEnvFiles,
} = await import('../../scripts/firebase-db-url-helper.cjs');

describe('firebase-db-url-helper', () => {
  it('should prioritize explicit cli arg', () => {
    const url = resolveDatabaseUrl({
      cliArg: 'https://cli-db.europe-west1.firebasedatabase.app',
      env: {
        FIREBASE_DATABASE_URL: 'https://env-db.europe-west1.firebasedatabase.app',
      },
    });
    expect(url).toBe('https://cli-db.europe-west1.firebasedatabase.app');
  });

  it('should fallback to FIREBASE_DATABASE_URL/PUBLIC_FIREBASE_DATABASE_URL', () => {
    const url = resolveDatabaseUrl({
      env: {
        PUBLIC_FIREBASE_DATABASE_URL: 'https://public-db.europe-west1.firebasedatabase.app',
      },
    });
    expect(url).toBe('https://public-db.europe-west1.firebasedatabase.app');
  });

  it('should read database url from env files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dburl-'));
    fs.writeFileSync(path.join(root, '.env.prod'), 'PUBLIC_FIREBASE_DATABASE_URL=https://file-db.europe-west1.firebasedatabase.app\n');
    const url = loadDatabaseUrlFromEnvFiles(root, ['.env.prod']);
    expect(url).toBe('https://file-db.europe-west1.firebasedatabase.app');
  });
});
