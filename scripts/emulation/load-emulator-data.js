// Importa las librerías necesarias
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveRtdbEmulatorConfig } from './load-emulator-data-helper.js';

// Para obtener __dirname en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const emulatorConfig = resolveRtdbEmulatorConfig(process.env);
process.env.FIREBASE_DATABASE_EMULATOR_HOST = emulatorConfig.host;

admin.initializeApp({
  projectId: emulatorConfig.projectId,
  databaseURL: emulatorConfig.databaseURL
});

// Obtén una referencia a la Realtime Database
const db = admin.database();
const dbRef = db.ref('/'); // Referencia a la raíz de la base de datos

function getArgValue(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

// --- Carga y subida de datos ---
// Ruta al archivo JSON (por defecto, seed mínimo para desarrollo)
const seedArg = getArgValue('--seed');
const defaultSeed = path.join(__dirname, '../../emulator-data/minimal-rtdb-seed.json');
const jsonPath = seedArg
  ? path.resolve(process.cwd(), seedArg)
  : defaultSeed;

// Lee el archivo de forma síncrona
try {
  console.log('🌱 Leyendo el archivo JSON...');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  console.log('📝 Escribiendo datos en el emulador de Realtime Database...');

  // Usa el método set() para reemplazar todos los datos en la referencia raíz
  // Si quisieras añadir datos sin borrar los existentes, podrías usar update()
  dbRef.set(data)
    .then(() => {
      console.log('✅ Datos insertados correctamente.');
      process.exit(0); // Termina el script con éxito
    })
    .catch((error) => {
      console.error('❌ Error al insertar los datos:', error);
      process.exit(1); // Termina el script con error
    });

} catch (error) {
  console.error('❌ Error al leer o parsear el archivo JSON:', error);
  process.exit(1);
}
