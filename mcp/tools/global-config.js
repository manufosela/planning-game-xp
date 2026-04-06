import { z } from 'zod';
import { getDatabase } from '../firebase-adapter.js';
import { getMcpUserId } from '../user.js';

export const VALID_CONFIG_TYPES = ['agents', 'prompts', 'instructions', 'guidelines'];
export const VALID_CATEGORIES = ['development', 'planning', 'qa', 'documentation', 'architecture'];

export const listGlobalConfigSchema = z.object({
  type: z.enum(['agents', 'prompts', 'instructions', 'guidelines']).describe('Config type'),
  category: z.string().optional().describe('Filter by category')
});

export const getGlobalConfigSchema = z.object({
  type: z.enum(['agents', 'prompts', 'instructions', 'guidelines']).describe('Config type'),
  configId: z.string().describe('Config ID (the Firebase key)')
});

export const createGlobalConfigSchema = z.object({
  type: z.enum(['agents', 'prompts', 'instructions', 'guidelines']).describe('Config type'),
  name: z.string().describe('Config name'),
  description: z.string().optional().describe('Config description'),
  content: z.string().optional().describe('Config content'),
  category: z.string().optional().describe('Category (default: "development")'),
  targetFile: z.string().optional().describe('Target file path (guidelines only, must be relative path)')
});

export const updateGlobalConfigSchema = z.object({
  type: z.enum(['agents', 'prompts', 'instructions', 'guidelines']).describe('Config type'),
  configId: z.string().describe('Config ID'),
  updates: z.record(z.unknown()).describe('Fields to update')
});

export const deleteGlobalConfigSchema = z.object({
  type: z.enum(['agents', 'prompts', 'instructions', 'guidelines']).describe('Config type'),
  configId: z.string().describe('Config ID')
});

export const getGuidelineHistorySchema = z.object({
  configId: z.string().describe('Guideline config ID')
});

export const restoreGuidelineVersionSchema = z.object({
  configId: z.string().describe('Guideline config ID'),
  version: z.number().describe('Version number to restore')
});

function validateTargetFile(targetFile) {
  if (!targetFile || typeof targetFile !== 'string') {
    throw new Error('targetFile must be a non-empty string.');
  }
  if (targetFile.startsWith('/')) {
    throw new Error('targetFile must be a relative path (cannot start with "/").');
  }
  if (targetFile.includes('..')) {
    throw new Error('targetFile cannot contain ".." path traversal.');
  }
}

export async function listGlobalConfig({ type, category }) {
  const db = getDatabase();
  const configsRef = db.ref(`global/${type}`);
  const snapshot = await configsRef.once('value');
  const configsData = snapshot.val();

  if (!configsData) {
    return { content: [{ type: 'text', text: `No ${type} found.` }] };
  }

  let configs = Object.entries(configsData).map(([configId, config]) => ({
    configId,
    ...config
  }));

  if (category) {
    configs = configs.filter(c => c.category === category);
  }

  configs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const summary = configs.map(c => {
    const item = {
      configId: c.configId,
      name: c.name,
      description: c.description || '',
      category: c.category || 'development',
      createdAt: c.createdAt,
      createdBy: c.createdBy
    };
    if (type === 'guidelines') {
      item.version = c.version || 1;
      if (c.targetFile) item.targetFile = c.targetFile;
    }
    return item;
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(summary, null, 2)
    }]
  };
}

export async function getGlobalConfig({ type, configId }) {
  const db = getDatabase();
  const configRef = db.ref(`global/${type}/${configId}`);
  const snapshot = await configRef.once('value');

  if (!snapshot.exists()) {
    return { content: [{ type: 'text', text: `Config "${configId}" not found in ${type}.` }] };
  }

  const config = {
    configId,
    type,
    ...snapshot.val()
  };

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(config, null, 2)
    }]
  };
}

export async function createGlobalConfig({ type, name, description, content, category, targetFile }) {
  const db = getDatabase();

  const configCategory = category || 'development';
  if (!VALID_CATEGORIES.includes(configCategory)) {
    throw new Error(`Invalid category "${configCategory}". Valid categories: ${VALID_CATEGORIES.join(', ')}`);
  }

  if (type === 'guidelines') {
    if (!content) {
      throw new Error('Field "content" is required for guidelines.');
    }
    if (targetFile !== undefined) {
      validateTargetFile(targetFile);
    }
  }

  const configsRef = db.ref(`global/${type}`);
  const newConfigRef = configsRef.push();
  const configId = newConfigRef.key;
  const now = new Date().toISOString();

  const configData = {
    name,
    description: description || '',
    content: content || '',
    category: configCategory,
    createdAt: now,
    createdBy: getMcpUserId(),
    updatedAt: now,
    updatedBy: getMcpUserId()
  };

  if (type === 'guidelines') {
    configData.version = 1;
    if (targetFile !== undefined) {
      configData.targetFile = targetFile;
    }
  }

  await newConfigRef.set(configData);

  await saveConfigHistory(db, type, configId, configData, 'create');

  const response = {
    message: `${type.slice(0, -1)} created successfully`,
    configId,
    type,
    name,
    category: configCategory
  };

  if (type === 'guidelines') {
    response.version = 1;
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(response, null, 2)
    }]
  };
}

export async function updateGlobalConfig({ type, configId, updates }) {
  const db = getDatabase();
  const configRef = db.ref(`global/${type}/${configId}`);

  const snapshot = await configRef.once('value');
  if (!snapshot.exists()) {
    throw new Error(`Config "${configId}" not found in ${type}.`);
  }

  if (updates.category !== undefined && !VALID_CATEGORIES.includes(updates.category)) {
    throw new Error(`Invalid category "${updates.category}". Valid categories: ${VALID_CATEGORIES.join(', ')}`);
  }

  const protectedFields = ['configId', 'type', 'createdAt', 'createdBy'];
  if (type === 'guidelines') {
    protectedFields.push('version', 'history');
  }
  const protectedFieldsInUpdate = protectedFields.filter(field => field in updates);
  for (const field of protectedFieldsInUpdate) {
    throw new Error(`Cannot update protected field: "${field}"`);
  }

  if (type === 'guidelines' && updates.targetFile !== undefined) {
    validateTargetFile(updates.targetFile);
  }

  const now = new Date().toISOString();
  updates.updatedAt = now;
  updates.updatedBy = getMcpUserId();

  // Auto-version guidelines when content changes
  if (type === 'guidelines' && updates.content !== undefined) {
    const currentData = snapshot.val();
    const currentVersion = currentData.version || 1;

    // Save previous version to history subnode
    const historyRef = db.ref(`global/${type}/${configId}/history/${currentVersion}`);
    await historyRef.set({
      content: currentData.content || '',
      updatedAt: currentData.updatedAt || currentData.createdAt,
      updatedBy: currentData.updatedBy || currentData.createdBy
    });

    updates.version = currentVersion + 1;
  }

  await configRef.update(updates);

  const updatedSnapshot = await configRef.once('value');
  const updatedConfig = updatedSnapshot.val();

  await saveConfigHistory(db, type, configId, updatedConfig, 'update');

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: `${type.slice(0, -1)} updated successfully`,
        config: { configId, type, ...updatedConfig }
      }, null, 2)
    }]
  };
}

export async function deleteGlobalConfig({ type, configId }) {
  const db = getDatabase();
  const configRef = db.ref(`global/${type}/${configId}`);

  const snapshot = await configRef.once('value');
  if (!snapshot.exists()) {
    throw new Error(`Config "${configId}" not found in ${type}.`);
  }

  const configData = snapshot.val();

  const trashRef = db.ref(`global-trash/${type}/${configId}`);
  await trashRef.set({
    ...configData,
    deletedAt: new Date().toISOString(),
    deletedBy: getMcpUserId()
  });

  await saveConfigHistory(db, type, configId, configData, 'delete');

  await configRef.remove();

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: `${type.slice(0, -1)} deleted successfully`,
        configId,
        type
      }, null, 2)
    }]
  };
}

export async function getGuidelineHistory({ configId }) {
  const db = getDatabase();
  const configRef = db.ref(`global/guidelines/${configId}`);
  const snapshot = await configRef.once('value');

  if (!snapshot.exists()) {
    throw new Error(`Guideline "${configId}" not found.`);
  }

  const config = snapshot.val();
  const currentVersion = {
    version: config.version || 1,
    content: config.content || '',
    updatedAt: config.updatedAt || config.createdAt,
    updatedBy: config.updatedBy || config.createdBy
  };

  const history = config.history || {};
  const previousVersions = Object.entries(history)
    .map(([version, data]) => ({
      version: parseInt(version, 10),
      content: data.content,
      updatedAt: data.updatedAt,
      updatedBy: data.updatedBy
    }))
    .sort((a, b) => b.version - a.version);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        configId,
        name: config.name,
        current: currentVersion,
        previousVersions,
        totalVersions: previousVersions.length + 1
      }, null, 2)
    }]
  };
}

export async function restoreGuidelineVersion({ configId, version }) {
  const db = getDatabase();
  const configRef = db.ref(`global/guidelines/${configId}`);
  const snapshot = await configRef.once('value');

  if (!snapshot.exists()) {
    throw new Error(`Guideline "${configId}" not found.`);
  }

  const config = snapshot.val();
  const history = config.history || {};

  if (!history[version]) {
    throw new Error(`Version ${version} not found in history for guideline "${configId}". Available versions: ${Object.keys(history).join(', ') || 'none'}`);
  }

  const restoredContent = history[version].content;
  const currentVersion = config.version || 1;
  const now = new Date().toISOString();

  // Save current version to history before restoring
  const currentHistoryRef = db.ref(`global/guidelines/${configId}/history/${currentVersion}`);
  await currentHistoryRef.set({
    content: config.content || '',
    updatedAt: config.updatedAt || config.createdAt,
    updatedBy: config.updatedBy || config.createdBy
  });

  const newVersion = currentVersion + 1;

  await configRef.update({
    content: restoredContent,
    version: newVersion,
    updatedAt: now,
    updatedBy: getMcpUserId()
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: `Guideline restored successfully from version ${version}`,
        configId,
        restoredFromVersion: version,
        newVersion,
        content: restoredContent
      }, null, 2)
    }]
  };
}

async function saveConfigHistory(db, type, configId, configData, action) {
  try {
    const historyRef = db.ref(`global-history/${type}/${configId}`);
    const newHistoryRef = historyRef.push();

    await newHistoryRef.set({
      name: configData.name,
      description: configData.description,
      content: configData.content,
      category: configData.category,
      timestamp: new Date().toISOString(),
      changedBy: getMcpUserId(),
      action: action
    });
  } catch (error) {
    console.error('Error saving config history:', error);
  }
}
