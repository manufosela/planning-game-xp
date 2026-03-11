/**
 * MCP tool definitions for ADR (Architecture Decision Record) operations.
 * @module mcp/tools/adrs
 */

import { z } from 'zod';
import * as db from '../services/firestore-service.js';
import { getMcpUserId } from '../user.js';

const VALID_ADR_STATUSES = ['proposed', 'accepted', 'deprecated', 'superseded'];

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const listAdrsSchema = z.object({
  projectId: z.string().describe('Project ID'),
  status: z.string().optional().describe('Filter by status (proposed, accepted, deprecated, superseded)'),
});

export const getAdrSchema = z.object({
  projectId: z.string().describe('Project ID'),
  adrId: z.string().describe('ADR document ID'),
});

export const createAdrSchema = z.object({
  projectId: z.string().describe('Project ID'),
  title: z.string().describe('ADR title'),
  context: z.string().optional().describe('Context and background'),
  decision: z.string().optional().describe('The decision made'),
  consequences: z.string().optional().describe('Consequences of this decision'),
  status: z.string().optional().describe('Status (default: "proposed")'),
});

export const updateAdrSchema = z.object({
  projectId: z.string().describe('Project ID'),
  adrId: z.string().describe('ADR document ID'),
  updates: z.record(z.unknown()).describe('Fields to update'),
});

export const deleteAdrSchema = z.object({
  projectId: z.string().describe('Project ID'),
  adrId: z.string().describe('ADR document ID'),
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function listAdrs({ projectId, status }) {
  const adrs = await db.getAdrs(projectId, status ? { status } : {});

  if (adrs.length === 0) {
    return { content: [{ type: 'text', text: JSON.stringify({ message: `No ADRs found for project "${projectId}".`, adrs: [] }, null, 2) }] };
  }

  const summary = adrs.map((a) => ({
    adrId: a.id,
    title: a.title,
    status: a.status,
    createdAt: a.createdAt,
    createdBy: a.createdBy,
  }));

  return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
}

export async function getAdr({ projectId, adrId }) {
  const adr = await db.getAdr(projectId, adrId);

  if (!adr) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: `ADR "${adrId}" not found in project "${projectId}".` }, null, 2) }] };
  }

  return { content: [{ type: 'text', text: JSON.stringify(adr, null, 2) }] };
}

export async function createAdr({ projectId, title, context, decision, consequences, status }) {
  const adrStatus = status || 'proposed';
  if (!VALID_ADR_STATUSES.includes(adrStatus)) {
    throw new Error(`Invalid ADR status "${adrStatus}". Valid: ${VALID_ADR_STATUSES.join(', ')}`);
  }

  const userId = getMcpUserId();
  const adrId = await db.createAdr(projectId, {
    title,
    context: context || '',
    decision: decision || '',
    consequences: consequences || '',
    status: adrStatus,
    createdBy: userId,
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ message: 'ADR created successfully', adrId, projectId, title, status: adrStatus }, null, 2),
    }],
  };
}

export async function updateAdr({ projectId, adrId, updates }) {
  const existing = await db.getAdr(projectId, adrId);
  if (!existing) {
    throw new Error(`ADR "${adrId}" not found in project "${projectId}".`);
  }

  if (updates.status && !VALID_ADR_STATUSES.includes(updates.status)) {
    throw new Error(`Invalid ADR status "${updates.status}". Valid: ${VALID_ADR_STATUSES.join(', ')}`);
  }

  const protectedFields = ['createdAt', 'createdBy', 'projectId'];
  for (const field of protectedFields) {
    if (field in updates) throw new Error(`Cannot update protected field: "${field}"`);
  }

  await db.updateAdr(projectId, adrId, updates);
  const updated = await db.getAdr(projectId, adrId);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ message: 'ADR updated successfully', adr: updated }, null, 2),
    }],
  };
}

export async function deleteAdr({ projectId, adrId }) {
  await db.deleteAdr(projectId, adrId);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ message: 'ADR deleted successfully', adrId, projectId }, null, 2),
    }],
  };
}
