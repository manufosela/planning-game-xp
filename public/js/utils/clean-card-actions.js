/**
 * Validate / request-changes actions of the clean view, shared by the
 * detail modal and the bulk action (PLN-TSK-0366).
 */

// Bugs (Created → In Progress → Fixed → Done&Validated) have no "Reopened":
// a rejected fix goes back to "In Progress".
export const VALIDATED_STATUS = 'Done&Validated';
const REOPEN_STATUS = { bugs: 'In Progress', tasks: 'Reopened', proposals: 'Reopened' };
const AWAITING_VALIDATION_STATUSES = ['To Validate', 'Fixed'];

export function getCardSection(cardType) {
  const ct = (cardType || '').toLowerCase();
  if (ct.includes('bug')) return 'bugs';
  if (ct.includes('proposal')) return 'proposals';
  return 'tasks';
}

export function isAwaitingValidation(status) {
  return AWAITING_VALIDATION_STATUSES.includes(status);
}

export function buildValidateUpdate({ userEmail, now = new Date() }) {
  return {
    status: VALIDATED_STATUS,
    validatedAt: now.toISOString(),
    updatedBy: userEmail
  };
}

export function buildRequestChangesUpdate({
  section, status, reason, userEmail, reopenCount = 0, reopenCycles = [], notesRaw = '', now = new Date()
}) {
  const trimmedReason = (reason || '').trim();
  if (!trimmedReason) throw new Error('reason is required');

  const newReopenCount = reopenCount + 1;
  const cycles = [...(Array.isArray(reopenCycles) ? reopenCycles : []), {
    cycle: newReopenCount,
    reopenedAt: now.toISOString(),
    reopenedBy: userEmail,
    previousStatus: status,
    reason: trimmedReason
  }];

  const dateStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const reopenNote = `[REOPEN #${newReopenCount}] Solicitud de cambios (${dateStr}): ${trimmedReason}`;

  return {
    status: REOPEN_STATUS[section],
    reopenCount: newReopenCount,
    reopenCycles: cycles,
    notes: notesRaw ? `${reopenNote}\n\n${notesRaw}` : reopenNote,
    endDate: '',
    validatedAt: '',
    updatedBy: userEmail
  };
}

async function writeCard(projectId, section, firebaseId, updateData) {
  if (!firebaseId) throw new Error('firebaseId is required');
  const { FirebaseService } = await import('../services/firebase-service.js');
  await FirebaseService.updateCard(projectId, section.toUpperCase(), firebaseId, updateData);
  return updateData.status;
}

export function validateCard({ projectId, cardType, firebaseId, userEmail }) {
  return writeCard(projectId, getCardSection(cardType), firebaseId, buildValidateUpdate({ userEmail }));
}

export function requestCardChanges({ projectId, cardType, firebaseId, ...changes }) {
  const section = getCardSection(cardType);
  return writeCard(projectId, section, firebaseId, buildRequestChangesUpdate({ section, ...changes }));
}
