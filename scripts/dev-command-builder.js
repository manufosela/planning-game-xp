export function buildDevInnerCommand({
  envFile = '.env.dev',
  seedFile = 'emulator-data/minimal-rtdb-seed.json'
} = {}) {
  return [
    `node scripts/emulation/load-emulator-data.js --seed ${seedFile}`,
    `dotenv -e ${envFile} -- npm run generate-sw`,
    `APP_RUNTIME_ENV=dev dotenv -e ${envFile} -- astro dev --mode dev`
  ].join(' && ');
}

export function buildEmulatorsExecCommand(innerCommand, options = {}) {
  const configPath = String(options.configPath || '').trim();
  const configPart = configPath ? ` --config "${configPath}"` : '';
  return `firebase emulators:exec${configPart} --only firestore,database,storage,ui "${innerCommand}"`;
}

export function shouldUseEmulatorsByDefault(runtimeEnv, allowEmulators, emulatorsQueryParam) {
  const env = (runtimeEnv || '').toString().toLowerCase();
  const allow = Boolean(allowEmulators);

  if (!allow || env !== 'dev') {
    return false;
  }

  if (emulatorsQueryParam === 'false') {
    return false;
  }

  return true;
}
