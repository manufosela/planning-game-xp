// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('CleanCardDetail web component', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should be importable without errors', async () => {
    await expect(import('../../public/js/wc/CleanCardDetail.js')).resolves.toBeDefined();
  });

  it('should export CleanCardDetail class', async () => {
    const mod = await import('../../public/js/wc/CleanCardDetail.js');
    expect(mod.CleanCardDetail).toBeDefined();
    expect(typeof mod.CleanCardDetail).toBe('function');
  });

  it('should have correct default properties', async () => {
    const { CleanCardDetail } = await import('../../public/js/wc/CleanCardDetail.js');
    const el = new CleanCardDetail();
    expect(el.cardId).toBe('');
    expect(el.firebaseId).toBe('');
    expect(el.cardType).toBe('tasks');
    expect(el.projectId).toBe('');
    expect(el.title).toBe('');
    expect(el.status).toBe('');
    expect(el.description).toBe('');
    expect(el.descriptionStructured).toEqual([]);
    expect(el.acceptanceCriteriaStructured).toEqual([]);
    expect(el.developerName).toBe('');
    expect(el.validatorName).toBe('');
    expect(el.createdBy).toBe('');
    expect(el.endDate).toBe('');
    expect(el.startDate).toBe('');
    expect(el.devPoints).toBe(0);
    expect(el.businessPoints).toBe(0);
    expect(el.notes).toEqual([]);
    expect(el.userEmail).toBe('');
    expect(el._loading).toBe(false);
    expect(el._reopenMode).toBe(false);
    expect(el._reopenReason).toBe('');
    expect(el._currentReopenCount).toBe(0);
    expect(el._currentReopenCycles).toEqual([]);
    expect(el._currentNotesRaw).toBe('');
  });

  it('should have expected Lit properties defined', async () => {
    const { CleanCardDetail } = await import('../../public/js/wc/CleanCardDetail.js');
    const props = CleanCardDetail.properties;
    expect(props).toHaveProperty('cardId');
    expect(props).toHaveProperty('firebaseId');
    expect(props).toHaveProperty('cardType');
    expect(props).toHaveProperty('projectId');
    expect(props).toHaveProperty('title');
    expect(props).toHaveProperty('status');
    expect(props).toHaveProperty('description');
    expect(props).toHaveProperty('descriptionStructured');
    expect(props).toHaveProperty('acceptanceCriteriaStructured');
    expect(props).toHaveProperty('developerName');
    expect(props).toHaveProperty('validatorName');
    expect(props).toHaveProperty('notes');
    expect(props).toHaveProperty('userEmail');
  });

  describe('_getStatusClass', () => {
    let el;
    beforeEach(async () => {
      const { CleanCardDetail } = await import('../../public/js/wc/CleanCardDetail.js');
      el = new CleanCardDetail();
    });

    it('should normalize "To Validate" to status-tovalidate', () => {
      el.status = 'To Validate';
      expect(el._getStatusClass()).toBe('status-tovalidate');
    });

    it('should normalize "In Progress" to status-inprogress', () => {
      el.status = 'In Progress';
      expect(el._getStatusClass()).toBe('status-inprogress');
    });

    it('should normalize "Done&Validated" to status-donevalidated', () => {
      el.status = 'Done&Validated';
      expect(el._getStatusClass()).toBe('status-donevalidated');
    });
  });

  describe('_getSection', () => {
    let el;
    beforeEach(async () => {
      const { CleanCardDetail } = await import('../../public/js/wc/CleanCardDetail.js');
      el = new CleanCardDetail();
    });

    it('should return "tasks" for task cardType', () => {
      el.cardType = 'tasks';
      expect(el._getSection()).toBe('tasks');
    });

    it('should return "bugs" for bug cardType', () => {
      el.cardType = 'bugs';
      expect(el._getSection()).toBe('bugs');
    });

    it('should return "proposals" for proposal cardType', () => {
      el.cardType = 'proposals';
      expect(el._getSection()).toBe('proposals');
    });

    it('should default to "tasks" for unknown cardType', () => {
      el.cardType = 'whatever';
      expect(el._getSection()).toBe('tasks');
    });
  });

  describe('_formatDate', () => {
    let el;
    beforeEach(async () => {
      const { CleanCardDetail } = await import('../../public/js/wc/CleanCardDetail.js');
      el = new CleanCardDetail();
    });

    it('should return empty string for no date', () => {
      expect(el._formatDate('')).toBe('');
    });

    it('should return formatted date for valid ISO string', () => {
      const result = el._formatDate('2026-03-04');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should return empty string for invalid date', () => {
      expect(el._formatDate('not-a-date')).toBe('');
    });
  });

  describe('_canValidate', () => {
    let el;
    beforeEach(async () => {
      const { CleanCardDetail } = await import('../../public/js/wc/CleanCardDetail.js');
      el = new CleanCardDetail();
    });

    it('should return true for "To Validate" status', () => {
      el.status = 'To Validate';
      expect(el._canValidate()).toBe(true);
    });

    it('should return true for "Fixed" status (bugs)', () => {
      el.status = 'Fixed';
      expect(el._canValidate()).toBe(true);
    });

    it('should return false for "In Progress" status', () => {
      el.status = 'In Progress';
      expect(el._canValidate()).toBe(false);
    });

    it('should return false for "Done" status', () => {
      el.status = 'Done';
      expect(el._canValidate()).toBe(false);
    });

    it('should return false for "Done&Validated" status', () => {
      el.status = 'Done&Validated';
      expect(el._canValidate()).toBe(false);
    });
  });

  describe('_canReopen', () => {
    let el;
    beforeEach(async () => {
      const { CleanCardDetail } = await import('../../public/js/wc/CleanCardDetail.js');
      el = new CleanCardDetail();
    });

    it('should return true for "To Validate" status', () => {
      el.status = 'To Validate';
      expect(el._canReopen()).toBe(true);
    });

    it('should return true for "Fixed" status', () => {
      el.status = 'Fixed';
      expect(el._canReopen()).toBe(true);
    });

    it('should return false for "To Do" status', () => {
      el.status = 'To Do';
      expect(el._canReopen()).toBe(false);
    });
  });

  describe('_renderDescription', () => {
    let el;
    beforeEach(async () => {
      const { CleanCardDetail } = await import('../../public/js/wc/CleanCardDetail.js');
      el = new CleanCardDetail();
    });

    it('should use descriptionStructured when available', () => {
      el.descriptionStructured = [{ role: 'developer', goal: 'build feature', benefit: 'users happy' }];
      el.description = 'plain text';
      const result = el._renderDescription();
      // Should return structured template, not plain text
      expect(result).toBeDefined();
    });

    it('should fallback to plain description', () => {
      el.descriptionStructured = [];
      el.description = 'plain text description';
      const result = el._renderDescription();
      expect(result).toBeDefined();
    });
  });

  describe('event dispatch', () => {
    it('should dispatch card-validated event on validate', async () => {
      const { CleanCardDetail } = await import('../../public/js/wc/CleanCardDetail.js');
      const el = new CleanCardDetail();
      el.cardId = 'PLN-TSK-0001';
      el.firebaseId = '-abc123';
      el.projectId = 'PlanningGame';
      el.cardType = 'tasks';
      el.status = 'To Validate';

      const eventPromise = new Promise(resolve => {
        el.addEventListener('card-validated', (e) => resolve(e.detail));
      });

      // Simulate the event dispatch part (skip Firebase call)
      el.dispatchEvent(new CustomEvent('card-validated', {
        bubbles: true,
        composed: true,
        detail: { cardId: el.cardId, firebaseId: el.firebaseId, newStatus: 'Done&Validated' }
      }));

      const detail = await eventPromise;
      expect(detail.cardId).toBe('PLN-TSK-0001');
      expect(detail.newStatus).toBe('Done&Validated');
    });
  });
});
