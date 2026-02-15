export function resolveFirebaseProjectId(firebaseConfig) {
  const projectId = String(firebaseConfig?.projectId || '').trim();
  if (!projectId) {
    throw new Error('Missing Firebase projectId in firebase-config.js');
  }
  return projectId;
}

export function buildIaContextUrl(token, firebaseConfig, region = 'europe-west1') {
  const projectId = resolveFirebaseProjectId(firebaseConfig);
  return `https://${region}-${projectId}.cloudfunctions.net/getIaContext/${token}`;
}
