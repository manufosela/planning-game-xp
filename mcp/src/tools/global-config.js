/**
 * MCP tool definitions for global configuration operations.
 * @module mcp/tools/global-config
 */

import { z } from 'zod';
import * as db from '../services/firestore-service.js';
import { getMcpUserId } from '../user.js';

const VALID_CONFIG_TYPES = ['agent', 'prompt', 'instruction', 'guideline'];
const VALID_CATEGORIES = ['development', 'planning', 'qa', 'documentation', 'architecture'];

export const listGlobalConfigSchema = z.object({
  type: z.string().optional().describe('Config type filter (agent, prompt, instruction, guideline)'),
});

export const getGlobalConfigSchema = z.object({
  configId: z.string().describe('Config document ID'),
});

export const createGlobalConfigSchema = z.object({
  type: z.enum(VALID_CONFIG_TYPES).describe('Config type'),
  name: z.string().describe('Config name'),
  description: z.string().optional().describe('Config description'),
  content: z.string().optional().describe('Config content'),
  category: z.string().optional().describe('Category (default: "development")'),
  targetFile: z.string().optional().describe('Target file path (guidelines only)'),
});

export const updateGlobalConfigSchema = z.object({
  configId: z.string().describe('Config document ID'),
  updates: z.record(z.unknown()).describe('Fields to update'),
});

export const deleteGlobalConfigSchema = z.object({
  configId: z.string().describe('Config document ID'),
});

export async function listGlobalConfig({ type }) {
  const configs = await db.getGlobalConfigs(type ? { type } : {});

  if (configs.length === 0) {
    return { content: [{ type: 'text', text: JSON.stringify({ message: 'No configs found.', configs: [] }, null, 2) }] };
  }

  const summary = configs.map((c) => ({
    configId: c.id,
    type: c.type,
    name: c.name,
    description: c.description || '',
    category: c.category || 'development',
    version: c.version,
    createdAt: c.createdAt,
  }));

  return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
}

export async function getGlobalConfig({ configId }) {
  const config = await db.getGlobalConfig(configId);

  if (!config) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: `Config "${configId}" not found.` }, null, 2) }] };
  }

  return { content: [{ type: 'text', text: JSON.stringify(config, null, 2) }] };
}

export async function createGlobalConfig({ type, name, description, content, category, targetFile }) {
  const configCategory = category || 'development';
  if (!VALID_CATEGORIES.includes(configCategory)) {
    throw new Error(`Invalid category "${configCategory}". Valid: ${VALID_CATEGORIES.join(', ')}`);
  }

  if (type === 'guideline' && !content) {
    throw new Error('Field "content" is required for guidelines.');
  }

  const userId = getMcpUserId();
  const data = {
    type,
    name,
    description: description || '',
    content: content || '',
    category: configCategory,
    createdBy: userId,
  };

  if (targetFile) data.targetFile = targetFile;

  const configId = await db.createGlobalConfig(data);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ message: `${type} created successfully`, configId, type, name }, null, 2),
    }],
  };
}

export async function updateGlobalConfig({ configId, updates }) {
  const existing = await db.getGlobalConfig(configId);
  if (!existing) throw new Error(`Config "${configId}" not found.`);

  const protectedFields = ['type', 'createdAt', 'createdBy', 'version'];
  for (const field of protectedFields) {
    if (field in updates) throw new Error(`Cannot update protected field: "${field}"`);
  }

  const userId = getMcpUserId();
  await db.updateGlobalConfig(configId, updates, { uid: userId, name: userId });

  const updated = await db.getGlobalConfig(configId);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ message: 'Config updated successfully', config: updated }, null, 2),
    }],
  };
}

export async function deleteGlobalConfig({ configId }) {
  await db.deleteGlobalConfig(configId);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ message: 'Config deleted successfully', configId }, null, 2),
    }],
  };
}
