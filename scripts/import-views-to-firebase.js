#!/usr/bin/env node
/**
 * Script para importar solo /views a Firebase usando Admin SDK
 *
 * El Admin SDK escribe directamente sin disparar Cloud Functions triggers,
 * evitando el problema de miles de triggers simultáneos.
 *
 * Uso:
 *   node scripts/import-views-to-firebase.js <input_with_views.json>
 *
 * Requisitos:
 *   - Archivo de credenciales de servicio en GOOGLE_APPLICATION_CREDENTIALS
 *   - O ejecutar desde un entorno con permisos de Firebase Admin
 */

import fs from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node import-views-to-firebase.js <input_with_views.json>');
    console.log('');
    console.log('Imports only the /views section to Firebase using Admin SDK.');
    console.log('This avoids triggering Cloud Functions on /cards.');
    console.log('');
    console.log('Environment variables:');
    console.log('  GOOGLE_APPLICATION_CREDENTIALS - Path to service account JSON');
    console.log('  PUBLIC_FIREBASE_DATABASE_URL / FIREBASE_DATABASE_URL - Database URL');
    console.log('  Or pass --db-url=<databaseURL>');
    process.exit(1);
  }

  const inputFile = args[0];
  const dbUrlArg = args.find((arg) => arg.startsWith('--db-url='))?.split('=')[1];
  const firebaseDatabaseUrl = dbUrlArg
    || process.env.PUBLIC_FIREBASE_DATABASE_URL
    || process.env.FIREBASE_DATABASE_URL
    || process.env.DATABASE_URL;
  const dryRun = args.includes('--dry-run');

  // Check input file exists
  if (!fs.existsSync(inputFile)) {
    console.error(`Error: Input file not found: ${inputFile}`);
    process.exit(1);
  }

  // Check credentials
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Error: GOOGLE_APPLICATION_CREDENTIALS environment variable not set.');
    console.error('');
    console.error('To set it:');
    console.error('  1. Go to Firebase Console > Project Settings > Service Accounts');
    console.error('  2. Click "Generate new private key"');
    console.error('  3. Save the JSON file');
    console.error('  4. Run: export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"');
    process.exit(1);
  }

  if (!firebaseDatabaseUrl) {
    console.error('Error: Firebase Database URL not set.');
    console.error('Set PUBLIC_FIREBASE_DATABASE_URL/FIREBASE_DATABASE_URL or pass --db-url=<URL>.');
    process.exit(1);
  }

  console.log(`Reading: ${inputFile}`);
  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

  if (!data.views) {
    console.error('Error: No /views section found in input file.');
    console.error('Run migrate-generate-card-views.js first to generate views.');
    process.exit(1);
  }

  // Count items
  let taskCount = 0;
  let bugCount = 0;
  let proposalCount = 0;

  for (const projectId of Object.keys(data.views['task-list'] || {})) {
    taskCount += Object.keys(data.views['task-list'][projectId]).length;
  }
  for (const projectId of Object.keys(data.views['bug-list'] || {})) {
    bugCount += Object.keys(data.views['bug-list'][projectId]).length;
  }
  for (const projectId of Object.keys(data.views['proposal-list'] || {})) {
    proposalCount += Object.keys(data.views['proposal-list'][projectId]).length;
  }

  console.log('');
  console.log('=== Views to import ===');
  console.log(`Tasks: ${taskCount}`);
  console.log(`Bugs: ${bugCount}`);
  console.log(`Proposals: ${proposalCount}`);
  console.log(`Total: ${taskCount + bugCount + proposalCount}`);
  console.log('');

  if (dryRun) {
    console.log('[DRY RUN] Would write to Firebase but --dry-run specified.');
    console.log('Remove --dry-run to actually import.');
    process.exit(0);
  }

  // Initialize Firebase Admin
  console.log('Initializing Firebase Admin...');
  console.log(`Database URL: ${firebaseDatabaseUrl}`);

  try {
    initializeApp({
      credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
      databaseURL: firebaseDatabaseUrl
    });
  } catch (error) {
    console.error('Error initializing Firebase:', error.message);
    process.exit(1);
  }

  const db = getDatabase();

  // Write views to Firebase
  console.log('');
  console.log('Writing /views to Firebase...');

  try {
    // Write each view type separately for better error handling
    console.log('  Writing /views/task-list...');
    await db.ref('/views/task-list').set(data.views['task-list']);

    console.log('  Writing /views/bug-list...');
    await db.ref('/views/bug-list').set(data.views['bug-list']);

    console.log('  Writing /views/proposal-list...');
    await db.ref('/views/proposal-list').set(data.views['proposal-list']);

    console.log('');
    console.log('✅ Import complete!');
    console.log('');
    console.log('Views are now available at:');
    console.log('  /views/task-list/{projectId}/{firebaseId}');
    console.log('  /views/bug-list/{projectId}/{firebaseId}');
    console.log('  /views/proposal-list/{projectId}/{firebaseId}');

  } catch (error) {
    console.error('Error writing to Firebase:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

main();
