#!/usr/bin/env node
/**
 * Setup script for initializing the first App Admin
 *
 * Usage:
 *   node scripts/setup-app-admin.cjs <email>
 *
 * Example:
 *   node scripts/setup-app-admin.cjs admin@yourdomain.com
 *
 * This script:
 * 1. Adds the email to /data/appAdmins in Firebase
 * 2. Sets the isAppAdmin custom claim on the user's auth token
 *
 * Prerequisites:
 * - Firebase Admin SDK credentials (GOOGLE_APPLICATION_CREDENTIALS env var)
 * - Or run from a machine with gcloud configured
 */

const admin = require('firebase-admin');

// Encode email for Firebase key
function encodeEmailForFirebase(email) {
  if (!email) return '';
  return email
    .replace(/@/g, '|')
    .replace(/\./g, '!')
    .replace(/#/g, '-');
}

async function setupAppAdmin(email) {
  if (!email || !email.includes('@')) {
    console.error('❌ Error: Se requiere un email válido');
    console.log('\nUso: node scripts/setup-app-admin.cjs <email>');
    console.log('Ejemplo: node scripts/setup-app-admin.cjs admin@yourdomain.com');
    process.exit(1);
  }

  const normalizedEmail = email.toLowerCase().trim();
  console.log(`\n🔧 Configurando App Admin: ${normalizedEmail}\n`);

  // Initialize Firebase Admin
  try {
    admin.initializeApp({
      databaseURL: 'https://planning-gamexp-default-rtdb.europe-west1.firebasedatabase.app'
    });
    console.log('✅ Firebase Admin inicializado');
  } catch (error) {
    if (error.code !== 'app/duplicate-app') {
      console.error('❌ Error inicializando Firebase Admin:', error.message);
      console.log('\nAsegúrate de tener configurado GOOGLE_APPLICATION_CREDENTIALS');
      console.log('o de estar autenticado con: gcloud auth application-default login');
      process.exit(1);
    }
  }

  const db = admin.database();
  const auth = admin.auth();

  // Step 1: Add to /data/appAdmins
  const encodedEmail = encodeEmailForFirebase(normalizedEmail);
  try {
    await db.ref(`/data/appAdmins/${encodedEmail}`).set(true);
    console.log(`✅ Añadido a /data/appAdmins/${encodedEmail}`);
  } catch (error) {
    console.error('❌ Error añadiendo a appAdmins:', error.message);
    process.exit(1);
  }

  // Step 2: Set custom claim on user (if exists)
  try {
    const userRecord = await auth.getUserByEmail(normalizedEmail);
    const currentClaims = userRecord.customClaims || {};

    await auth.setCustomUserClaims(userRecord.uid, {
      ...currentClaims,
      isAppAdmin: true
    });

    console.log(`✅ Claim isAppAdmin=true asignado al usuario ${userRecord.uid}`);
    console.log('\n⚠️  El usuario debe cerrar sesión y volver a entrar para que el claim tenga efecto.');
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.log(`⚠️  Usuario no encontrado en Auth. El claim se asignará automáticamente`);
      console.log(`   cuando el usuario inicie sesión (via syncAppAdminClaim function).`);
    } else {
      console.error('❌ Error asignando claim:', error.message);
    }
  }

  console.log('\n✅ Setup completado!\n');
  console.log('El usuario ahora puede:');
  console.log('  - Aprobar, deprecar y eliminar apps');
  console.log('  - Añadir/eliminar otros App Admins');
  console.log('  - Añadir/eliminar App Uploaders por proyecto');

  process.exit(0);
}

// Get email from command line
const email = process.argv[2];
setupAppAdmin(email);
