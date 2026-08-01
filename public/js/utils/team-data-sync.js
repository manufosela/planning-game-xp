/**
 * Upsert every developer/stakeholder from a project team into the global
 * /data/developers/{id} and /data/stakeholders/{id} collections.
 *
 * Fixes PLN-BUG-0112: adding a new stakeholder / developer via the project
 * form only wrote it under /projects/{projectId}/... — the entity was
 * orphaned globally, so entityDirectoryService.resolve*Id returned null and
 * the member never showed up in validator/coValidator/developer selects.
 *
 * Behaviour:
 * - Skips entries without a valid dev_XXX / stk_XXX id.
 * - Skips entries that already exist in /data (does not overwrite).
 * - Uses `active: true` as default for new records.
 *
 * @param {Object} params
 * @param {Array} params.developers - project.developers array (objects with id/name/email or plain strings)
 * @param {Array} params.stakeholders - project.stakeholders array (same shape)
 * @param {Object} params.deps - { database, ref, get, set }
 * @returns {Promise<{createdDevs: string[], createdStks: string[]}>}
 */
export async function syncTeamToDataCollections({ developers = [], stakeholders = [], deps }) {
  const { database, ref, get, set } = deps;
  const createdDevs = [];
  const createdStks = [];

  const devIds = collectIds(developers, 'dev_');
  const stkIds = collectIds(stakeholders, 'stk_');

  for (const [id, entry] of devIds) {
    const path = `/data/developers/${id}`;
    const snap = await get(ref(database, path));
    if (snap.exists()) continue;
    await set(ref(database, path), {
      name: entry.name || '',
      email: entry.email || '',
      active: true
    });
    createdDevs.push(id);
  }

  for (const [id, entry] of stkIds) {
    const path = `/data/stakeholders/${id}`;
    const snap = await get(ref(database, path));
    if (snap.exists()) continue;
    await set(ref(database, path), {
      name: entry.name || '',
      email: entry.email || '',
      active: true
    });
    createdStks.push(id);
  }

  return { createdDevs, createdStks };
}

/**
 * Normalize a raw team array (mix of objects and strings) into a Map of
 * id → { name, email }. Ids without the required prefix are dropped.
 * Exported for testability.
 */
export function collectIds(rawList, requiredPrefix) {
  const out = new Map();
  if (!Array.isArray(rawList)) return out;
  for (const entry of rawList) {
    if (!entry) continue;
    const obj = typeof entry === 'object' ? entry : {};
    const id = typeof entry === 'string' ? entry : obj.id;
    if (typeof id !== 'string' || !id.startsWith(requiredPrefix)) continue;
    if (!out.has(id)) {
      out.set(id, { name: obj.name || '', email: obj.email || '' });
    }
  }
  return out;
}
