import { z } from 'zod';
import { getDatabase } from '../firebase-adapter.js';
import { getMcpUserId } from '../user.js';

export const VALID_ADR_STATUSES = ['proposed', 'accepted', 'deprecated', 'superseded'];

export const listAdrsSchema = z.object({
  projectId: z.string().describe('Project ID (e.g., "Cinema4D", "Intranet")'),
  status: z.string().optional().describe('Filter by status (proposed, accepted, deprecated, superseded)')
});

export const getAdrSchema = z.object({
  projectId: z.string().describe('Project ID'),
  adrId: z.string().describe('ADR ID (the Firebase key)')
});

export const createAdrSchema = z.object({
  projectId: z.string().describe('Project ID'),
  title: z.string().describe('ADR title'),
  context: z.string().optional().describe('Context and background for the decision'),
  decision: z.string().optional().describe('The decision that was made'),
  consequences: z.string().optional().describe('Consequences of this decision'),
  status: z.string().optional().describe('Status (default: "proposed")')
});

export const updateAdrSchema = z.object({
  projectId: z.string().describe('Project ID'),
  adrId: z.string().describe('ADR ID (the Firebase key)'),
  updates: z.record(z.unknown()).describe('Fields to update')
});

export const deleteAdrSchema = z.object({
  projectId: z.string().describe('Project ID'),
  adrId: z.string().describe('ADR ID (the Firebase key)')
});

export async function listAdrs({ projectId, status }) {
  const db = getDatabase();
  const adrsRef = db.ref(`adrs/${projectId}`);
  const snapshot = await adrsRef.once('value');
  const adrsData = snapshot.val();

  if (!adrsData) {
    return { content: [{ type: 'text', text: `No ADRs found for project "${projectId}".` }] };
  }

  let adrs = Object.entries(adrsData).map(([adrId, adr]) => ({
    adrId,
    ...adr
  }));

  if (status) {
    adrs = adrs.filter(a => a.status === status);
  }

  adrs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const summary = adrs.map(a => ({
    adrId: a.adrId,
    title: a.title,
    status: a.status,
    supersededBy: a.supersededBy || null,
    createdAt: a.createdAt,
    createdBy: a.createdBy
  }));

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(summary, null, 2)
    }]
  };
}

export async function getAdr({ projectId, adrId }) {
  const db = getDatabase();
  const adrRef = db.ref(`adrs/${projectId}/${adrId}`);
  const snapshot = await adrRef.once('value');

  if (!snapshot.exists()) {
    return { content: [{ type: 'text', text: `ADR "${adrId}" not found in project "${projectId}".` }] };
  }

  const adr = {
    adrId,
    projectId,
    ...snapshot.val()
  };

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(adr, null, 2)
    }]
  };
}

export async function createAdr({ projectId, title, context, decision, consequences, status }) {
  const db = getDatabase();

  const adrStatus = status || 'proposed';
  if (!VALID_ADR_STATUSES.includes(adrStatus)) {
    throw new Error(`Invalid ADR status "${adrStatus}". Valid statuses are: ${VALID_ADR_STATUSES.join(', ')}`);
  }

  const adrsRef = db.ref(`adrs/${projectId}`);
  const newAdrRef = adrsRef.push();
  const adrId = newAdrRef.key;
  const now = new Date().toISOString();

  const adrData = {
    title,
    context: context || '',
    decision: decision || '',
    consequences: consequences || '',
    status: adrStatus,
    supersededBy: null,
    createdAt: now,
    createdBy: getMcpUserId(),
    updatedAt: now,
    updatedBy: getMcpUserId()
  };

  await newAdrRef.set(adrData);

  await saveAdrHistory(db, projectId, adrId, adrData, 'create');

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: 'ADR created successfully',
        adrId,
        projectId,
        title,
        status: adrStatus
      }, null, 2)
    }]
  };
}

export async function updateAdr({ projectId, adrId, updates }) {
  const db = getDatabase();
  const adrRef = db.ref(`adrs/${projectId}/${adrId}`);

  const snapshot = await adrRef.once('value');
  if (!snapshot.exists()) {
    throw new Error(`ADR "${adrId}" not found in project "${projectId}".`);
  }

  if (updates.status !== undefined && !VALID_ADR_STATUSES.includes(updates.status)) {
    throw new Error(`Invalid ADR status "${updates.status}". Valid statuses are: ${VALID_ADR_STATUSES.join(', ')}`);
  }

  const protectedFields = ['adrId', 'projectId', 'createdAt', 'createdBy'];
  const protectedFieldsInUpdate = protectedFields.filter(field => field in updates);
  for (const field of protectedFieldsInUpdate) {
    throw new Error(`Cannot update protected field: "${field}"`);
  }

  updates.updatedAt = new Date().toISOString();
  updates.updatedBy = getMcpUserId();

  await adrRef.update(updates);

  const updatedSnapshot = await adrRef.once('value');
  const updatedAdr = updatedSnapshot.val();

  await saveAdrHistory(db, projectId, adrId, updatedAdr, 'update');

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: 'ADR updated successfully',
        adr: { adrId, ...updatedAdr }
      }, null, 2)
    }]
  };
}

export async function deleteAdr({ projectId, adrId }) {
  const db = getDatabase();
  const adrRef = db.ref(`adrs/${projectId}/${adrId}`);

  const snapshot = await adrRef.once('value');
  if (!snapshot.exists()) {
    throw new Error(`ADR "${adrId}" not found in project "${projectId}".`);
  }

  const adrData = snapshot.val();

  const trashRef = db.ref(`adrs-trash/${projectId}/${adrId}`);
  await trashRef.set({
    ...adrData,
    deletedAt: new Date().toISOString(),
    deletedBy: getMcpUserId()
  });

  await saveAdrHistory(db, projectId, adrId, adrData, 'delete');

  await adrRef.remove();

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: 'ADR deleted successfully',
        adrId,
        projectId
      }, null, 2)
    }]
  };
}

async function saveAdrHistory(db, projectId, adrId, adrData, action) {
  try {
    const historyRef = db.ref(`adr-history/${projectId}/${adrId}`);
    const newHistoryRef = historyRef.push();

    await newHistoryRef.set({
      title: adrData.title,
      context: adrData.context,
      decision: adrData.decision,
      consequences: adrData.consequences,
      status: adrData.status,
      timestamp: new Date().toISOString(),
      changedBy: getMcpUserId(),
      action: action
    });
  } catch (error) {
    console.error('Error saving ADR history:', error);
  }
}
