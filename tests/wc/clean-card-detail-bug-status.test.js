// @vitest-environment jsdom
/**
 * PLN-BUG-0124: validating or requesting changes on a bug from the clean
 * view wrote task-only statuses ("Done&Validated", "Reopened"), which do
 * not exist in the bug workflow (Created → Assigned → Fixed → Verified → Closed).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const updateCard = vi.fn().mockResolvedValue(undefined);
vi.mock('../../public/js/services/firebase-service.js', () => ({
  FirebaseService: { updateCard }
}));

const { CleanCardDetail } = await import('../../public/js/wc/CleanCardDetail.js');

function createCard(cardType, status) {
  const el = new CleanCardDetail();
  el.cardId = 'PLN-XXX-0001';
  el.firebaseId = '-abc123';
  el.projectId = 'PlanningGame';
  el.cardType = cardType;
  el.status = status;
  el.userEmail = 'validator@example.com';
  return el;
}

describe('CleanCardDetail target statuses per card type (PLN-BUG-0124)', () => {
  beforeEach(() => updateCard.mockClear());

  it('should set bugs to "Verified" when validating', async () => {
    const el = createCard('bugs', 'Fixed');
    await el._handleValidate();
    expect(updateCard).toHaveBeenCalledWith('PlanningGame', 'BUGS', '-abc123',
      expect.objectContaining({ status: 'Verified' }));
  });

  it('should keep setting tasks to "Done&Validated" when validating', async () => {
    const el = createCard('tasks', 'To Validate');
    await el._handleValidate();
    expect(updateCard).toHaveBeenCalledWith('PlanningGame', 'TASKS', '-abc123',
      expect.objectContaining({ status: 'Done&Validated' }));
  });

  it('should send bugs back to "Assigned" when requesting changes', async () => {
    const el = createCard('bugs', 'Fixed');
    el._reopenReason = 'Still failing';
    await el._handleRequestChanges();
    expect(updateCard).toHaveBeenCalledWith('PlanningGame', 'BUGS', '-abc123',
      expect.objectContaining({ status: 'Assigned' }));
  });

  it('should keep sending tasks to "Reopened" when requesting changes', async () => {
    const el = createCard('tasks', 'To Validate');
    el._reopenReason = 'Missing tests';
    await el._handleRequestChanges();
    expect(updateCard).toHaveBeenCalledWith('PlanningGame', 'TASKS', '-abc123',
      expect.objectContaining({ status: 'Reopened' }));
  });
});
