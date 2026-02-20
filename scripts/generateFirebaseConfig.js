import fs from 'fs';

/**
 * Genera los archivos de configuración de Firebase en la carpeta public.
 * @param {object} env - Variables de entorno necesarias para la configuración.
 * @returns {void}
 */
export function generateFirebaseConfig(env) {
  const firebaseConfig = {
    apiKey: env.PUBLIC_FIREBASE_API_KEY,
    authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.PUBLIC_FIREBASE_DATABASE_URL,
    projectId: env.PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.PUBLIC_FIREBASE_APP_ID
  };

  // Contenido de firebase-config.js
  const configContent = `
// This file is generated automatically by astro.config.mjs

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getDatabase, ref, onValue, push, set, get, update, connectDatabaseEmulator, query, orderByChild, limitToLast, runTransaction as runDbTransaction } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { getAuth, OAuthProvider, GoogleAuthProvider, signOut, signInWithPopup, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore, doc, runTransaction, setDoc, getDoc, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { getMessaging } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js';
import { getStorage, connectStorageEmulator } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';

const vapidKey = "${env.PUBLIC_FIREBASE_VAPID_KEY}";
const functionsRegion = "${env.PUBLIC_FIREBASE_FUNCTIONS_REGION || 'europe-west1'}";
export const superAdminEmail = "${env.PUBLIC_SUPER_ADMIN_EMAIL || ''}";
// Expose app config globally for components
window.superAdminEmail = superAdminEmail;
window.appName = "${env.PUBLIC_APP_NAME || 'Planning Game XP'}";
window.orgName = ${JSON.stringify(env.PUBLIC_ORG_NAME || '')};
window.appUrl = "${env.PUBLIC_APP_URL || ''}";
window.allowedEmailDomains = "${env.PUBLIC_ALLOWED_EMAIL_DOMAINS || ''}"
  .split(',')
  .map(d => d.trim())
  .filter(Boolean);
window.authProviderName = '${env.PUBLIC_AUTH_PROVIDER || 'google'}';
const runtimeEnv = "${env.APP_RUNTIME_ENV || env.ASTRO_MODE || env.MODE || ''}";
const isPreEnv = runtimeEnv === 'pre';
const allowEmulators = ${env.USE_FIREBASE_EMULATOR === 'true' ? 'true' : 'false'} && !isPreEnv;

export const firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};
export const app = initializeApp(firebaseConfig);

// Configuración de entorno
const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const urlParams = new URLSearchParams(window.location.search);
const useEmulators = urlParams.get('emulators') === 'true';

// Emuladores: solo si se pasa ?emulators=true en la URL
if (isDevelopment && allowEmulators && useEmulators && !window._emulatorsPreConnected) {
  connectFirestoreEmulator(getFirestore(app), 'localhost', 8080);
  connectDatabaseEmulator(getDatabase(app), 'localhost', 9000);
  connectStorageEmulator(getStorage(app), 'localhost', 9199);
  window._emulatorsPreConnected = true;
  window._connectedEmulators = ['Firestore', 'Realtime Database', 'Storage'];
  showEmulatorBar();
  console.log('🔧 Connected to Firebase Emulators: Firestore, Realtime Database, Storage');
} else if (isDevelopment) {
  // Desarrollo normal: usar BBDD de tests, mostrar barra informativa
  showTestEnvironmentBar();
}
// En producción: no mostrar ninguna barra

export const database = getDatabase(app);
export const auth = getAuth(app);
function _createAuthProvider() {
  const p = '${env.PUBLIC_AUTH_PROVIDER || 'google'}';
  if (p === 'microsoft') return new OAuthProvider('microsoft.com');
  if (p === 'github') return new OAuthProvider('github.com');
  if (p === 'gitlab') return new OAuthProvider('${env.PUBLIC_GITLAB_ISSUER_URL || 'gitlab.com'}');
  return new GoogleAuthProvider();
}
export const authProvider = _createAuthProvider();
export const authProviderName = '${env.PUBLIC_AUTH_PROVIDER || 'google'}';
export const databaseFirestore = getFirestore(app);
export const messaging = getMessaging(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, functionsRegion);

const isProduction = !isDevelopment;

// Función para mostrar barra de emuladores (verde)
function showEmulatorBar() {
  const existingBar = document.getElementById('env-status-bar');
  if (existingBar) existingBar.remove();

  const bar = document.createElement('div');
  bar.id = 'env-status-bar';
  bar.style.cssText = \`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 32px;
    background-color: #28a745;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: Arial, sans-serif;
    font-size: 14px;
    font-weight: bold;
    z-index: 99999;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  \`;
  bar.innerHTML = \`
    <span style="margin-right: 10px;">🔧 EMULADOR LOCAL</span>
    <span style="opacity: 0.8; font-size: 12px;" title="Firestore: 8080 | Database: 9000 | Storage: 9199">
      (\${window._connectedEmulators ? window._connectedEmulators.join(', ') : 'Conectando...'})
    </span>
  \`;
  document.body.appendChild(bar);
  document.body.style.paddingTop = '32px';
}

// Función para mostrar barra de entorno de PRUEBAS (rojo informativo)
function showTestEnvironmentBar() {
  const existingBar = document.getElementById('env-status-bar');
  if (existingBar) existingBar.remove();

  const bar = document.createElement('div');
  bar.id = 'env-status-bar';
  bar.style.cssText = \`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 32px;
    background-color: #dc3545;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: Arial, sans-serif;
    font-size: 14px;
    font-weight: bold;
    z-index: 99999;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  \`;
  bar.innerHTML = \`<span>🔧 ENTORNO DE PRUEBAS - Los cambios NO afectan a producción</span>\`;
  document.body.appendChild(bar);
  document.body.style.paddingTop = '32px';
}

// En producción, no mostrar logs sobre emuladores ni intentar conectarlos
// No usar console.log en producción

onAuthStateChanged(auth, (user) => {
  if (user) {
    document.dispatchEvent(new CustomEvent('user-logged-in', { bubbles: true, composed: true, detail: { user } }));
  } else {
    document.dispatchEvent(new CustomEvent('user-logged-out', { bubbles: true, composed: true }));
  }
});

export { ref, push, set, update, onValue, signOut, signInWithPopup, signInWithEmailAndPassword, onAuthStateChanged, get, doc, runTransaction, runDbTransaction, setDoc, getDoc, vapidKey, connectDatabaseEmulator, connectStorageEmulator, query, orderByChild, limitToLast, httpsCallable, OAuthProvider, GoogleAuthProvider };
`;

  // Escribir los archivos
  fs.writeFileSync('./public/firebase-config.js', configContent);
  console.log('✅ Firebase config generated successfully!');
} 
