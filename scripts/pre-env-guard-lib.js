export function parseEnvContent(content) {
  const result = {};
  const lines = (content || '').split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    result[key] = value;
  }

  return result;
}

export function evaluatePreEnvSafety(preEnv, prodEnv) {
  const reasons = [];

  if (!preEnv.PUBLIC_FIREBASE_PROJECT_ID) {
    reasons.push('Missing PUBLIC_FIREBASE_PROJECT_ID in .env.pre');
  }

  if (!prodEnv.PUBLIC_FIREBASE_PROJECT_ID) {
    reasons.push('Missing PUBLIC_FIREBASE_PROJECT_ID in .env.prod');
  }

  if (
    preEnv.PUBLIC_FIREBASE_PROJECT_ID &&
    prodEnv.PUBLIC_FIREBASE_PROJECT_ID &&
    preEnv.PUBLIC_FIREBASE_PROJECT_ID === prodEnv.PUBLIC_FIREBASE_PROJECT_ID
  ) {
    reasons.push('PUBLIC_FIREBASE_PROJECT_ID in .env.pre matches .env.prod');
  }

  if (
    preEnv.PUBLIC_FIREBASE_DATABASE_URL &&
    prodEnv.PUBLIC_FIREBASE_DATABASE_URL &&
    preEnv.PUBLIC_FIREBASE_DATABASE_URL === prodEnv.PUBLIC_FIREBASE_DATABASE_URL
  ) {
    reasons.push('PUBLIC_FIREBASE_DATABASE_URL in .env.pre matches .env.prod');
  }

  if (
    preEnv.PUBLIC_FIREBASE_AUTH_DOMAIN &&
    prodEnv.PUBLIC_FIREBASE_AUTH_DOMAIN &&
    preEnv.PUBLIC_FIREBASE_AUTH_DOMAIN === prodEnv.PUBLIC_FIREBASE_AUTH_DOMAIN
  ) {
    reasons.push('PUBLIC_FIREBASE_AUTH_DOMAIN in .env.pre matches .env.prod');
  }

  return {
    ok: reasons.length === 0,
    reasons
  };
}

