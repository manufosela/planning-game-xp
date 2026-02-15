const REQUIRED_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
];

function extractObjectLiteral(rawInput) {
  const input = String(rawInput || '').trim();
  if (!input) {
    throw new Error('Config vacía. Pega el JSON o bloque firebaseConfig.');
  }

  const firstBrace = input.indexOf('{');
  const lastBrace = input.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('No se encontró un objeto JSON válido en la entrada.');
  }

  return input.slice(firstBrace, lastBrace + 1);
}

function normalizeObjectLiteralToJson(objectLiteral) {
  return objectLiteral
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, (_, value) => `"${value.replace(/"/g, '\\"')}"`)
    .replace(/,\s*([}\]])/g, '$1');
}

function parseObject(rawInput) {
  const objectLiteral = extractObjectLiteral(rawInput);

  try {
    return JSON.parse(objectLiteral);
  } catch {
    const normalized = normalizeObjectLiteralToJson(objectLiteral);
    return JSON.parse(normalized);
  }
}

function extractKnownPairs(rawInput) {
  const text = String(rawInput || '');
  const keys = [
    'apiKey',
    'authDomain',
    'databaseURL',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId',
    'measurementId',
  ];
  const extracted = {};

  for (const key of keys) {
    const quotedKeyRegex = new RegExp(`["']${key}["']\\s*:\\s*["']([^"']+)["']`);
    const bareKeyRegex = new RegExp(`${key}\\s*:\\s*["']([^"']+)["']`);
    const match = text.match(quotedKeyRegex) || text.match(bareKeyRegex);
    if (match?.[1]) {
      extracted[key] = match[1];
    }
  }

  return extracted;
}

function ensureRequiredKeys(config) {
  const missing = REQUIRED_KEYS.filter((key) => !String(config?.[key] || '').trim());
  if (missing.length > 0) {
    throw new Error(`Faltan claves requeridas: ${missing.join(', ')}`);
  }
}

function parseFirebaseWebConfigInput(rawInput) {
  let parsedConfig = {};
  try {
    parsedConfig = parseObject(rawInput);
  } catch {
    // Ignore and try best-effort extraction below
  }
  const config = {
    ...parsedConfig,
    ...extractKnownPairs(rawInput),
  };
  ensureRequiredKeys(config);

  return {
    PUBLIC_FIREBASE_API_KEY: String(config.apiKey || ''),
    PUBLIC_FIREBASE_AUTH_DOMAIN: String(config.authDomain || ''),
    PUBLIC_FIREBASE_DATABASE_URL: String(config.databaseURL || ''),
    PUBLIC_FIREBASE_PROJECT_ID: String(config.projectId || ''),
    PUBLIC_FIREBASE_STORAGE_BUCKET: String(config.storageBucket || ''),
    PUBLIC_FIREBASE_MESSAGING_SENDER_ID: String(config.messagingSenderId || ''),
    PUBLIC_FIREBASE_APP_ID: String(config.appId || ''),
    PUBLIC_FIREBASE_MEASUREMENT_ID: String(config.measurementId || ''),
  };
}

module.exports = {
  parseFirebaseWebConfigInput,
};
