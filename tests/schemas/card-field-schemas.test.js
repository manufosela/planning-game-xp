/**
 * Tests for centralized card field schemas
 */
import { describe, it, expect } from 'vitest';
import {
  BASE_PERSISTENT_FIELDS,
  TASK_SCHEMA,
  BUG_SCHEMA,
  PROPOSAL_SCHEMA,
  EPIC_SCHEMA,
  QA_SCHEMA,
  SPRINT_SCHEMA,
  CARD_SCHEMAS
} from '@/schemas/card-field-schemas.js';

describe('Card Field Schemas', () => {

  describe('BASE_PERSISTENT_FIELDS', () => {
    it('should include core fields shared by all cards', () => {
      expect(BASE_PERSISTENT_FIELDS).toContain('firebaseId');
      expect(BASE_PERSISTENT_FIELDS).toContain('cardId');
      expect(BASE_PERSISTENT_FIELDS).toContain('title');
      expect(BASE_PERSISTENT_FIELDS).toContain('description');
      expect(BASE_PERSISTENT_FIELDS).toContain('notes');
      expect(BASE_PERSISTENT_FIELDS).toContain('projectId');
      expect(BASE_PERSISTENT_FIELDS).toContain('cardType');
      expect(BASE_PERSISTENT_FIELDS).toContain('createdBy');
    });

    it('should have no duplicates', () => {
      const unique = new Set(BASE_PERSISTENT_FIELDS);
      expect(unique.size).toBe(BASE_PERSISTENT_FIELDS.length);
    });
  });

  describe('TASK_SCHEMA', () => {
    it('should have PERSISTENT_FIELDS and VIEW_FIELDS', () => {
      expect(TASK_SCHEMA.PERSISTENT_FIELDS).toBeDefined();
      expect(TASK_SCHEMA.VIEW_FIELDS).toBeDefined();
      expect(Array.isArray(TASK_SCHEMA.PERSISTENT_FIELDS)).toBe(true);
      expect(Array.isArray(TASK_SCHEMA.VIEW_FIELDS)).toBe(true);
    });

    it('should have no duplicates in PERSISTENT_FIELDS', () => {
      const unique = new Set(TASK_SCHEMA.PERSISTENT_FIELDS);
      expect(unique.size).toBe(TASK_SCHEMA.PERSISTENT_FIELDS.length);
    });

    it('should have no duplicates in VIEW_FIELDS', () => {
      const unique = new Set(TASK_SCHEMA.VIEW_FIELDS);
      expect(unique.size).toBe(TASK_SCHEMA.VIEW_FIELDS.length);
    });

    it('VIEW_FIELDS should be subset of PERSISTENT_FIELDS (except computed fields)', () => {
      const persistent = new Set(TASK_SCHEMA.PERSISTENT_FIELDS);
      const computedViewFields = new Set(['notesCount', 'planStatus', 'commitsCount']);
      for (const field of TASK_SCHEMA.VIEW_FIELDS) {
        if (!computedViewFields.has(field)) {
          expect(persistent.has(field)).toBe(true);
        }
      }
    });

    it('should include all base fields', () => {
      for (const field of BASE_PERSISTENT_FIELDS) {
        expect(TASK_SCHEMA.PERSISTENT_FIELDS).toContain(field);
      }
    });

    // Regression: ensure all 43 fields from TaskCard.getWCProps() are present
    it('should include all fields from TaskCard.getWCProps()', () => {
      const taskCardFields = [
        'firebaseId', 'cardId', 'title', 'description', 'notes',
        'acceptanceCriteria', 'descriptionStructured', 'acceptanceCriteriaStructured',
        'businessPoints', 'devPoints', 'startDate', 'endDate', 'sprint',
        'spike', 'expedited', 'status', 'developer', 'coDeveloper',
        'developerName', 'epic', 'validator', 'coValidator',
        'blockedByBusiness', 'blockedByDevelopment', 'bbbWhy', 'bbbWho',
        'bbdWhy', 'bbdWho', 'group', 'projectId', 'cardType',
        'developerHistory', 'blockedHistory', 'attachment', 'relatedTasks',
        'repositoryLabel', 'year', 'commits', 'validatedAt',
        'reopenCycles', 'reopenCount', 'implementationPlan', 'implementationNotes'
      ];
      const persistent = new Set(TASK_SCHEMA.PERSISTENT_FIELDS);
      for (const field of taskCardFields) {
        expect(persistent.has(field)).toBe(true);
      }
    });

    it('should include coDeveloper in VIEW_FIELDS', () => {
      expect(TASK_SCHEMA.VIEW_FIELDS).toContain('coDeveloper');
    });

    it('should include aiUsage in PERSISTENT_FIELDS', () => {
      expect(TASK_SCHEMA.PERSISTENT_FIELDS).toContain('aiUsage');
    });

    it('should NOT include UI-only fields', () => {
      const uiFields = ['statusList', 'activeTab', 'expanded', 'isEditable',
        'isSaving', 'invalidFields', 'canEditPermission'];
      for (const field of uiFields) {
        expect(TASK_SCHEMA.PERSISTENT_FIELDS).not.toContain(field);
      }
    });
  });

  describe('BUG_SCHEMA', () => {
    it('should have PERSISTENT_FIELDS and VIEW_FIELDS', () => {
      expect(BUG_SCHEMA.PERSISTENT_FIELDS).toBeDefined();
      expect(BUG_SCHEMA.VIEW_FIELDS).toBeDefined();
    });

    it('should have no duplicates in PERSISTENT_FIELDS', () => {
      const unique = new Set(BUG_SCHEMA.PERSISTENT_FIELDS);
      expect(unique.size).toBe(BUG_SCHEMA.PERSISTENT_FIELDS.length);
    });

    it('should have no duplicates in VIEW_FIELDS', () => {
      const unique = new Set(BUG_SCHEMA.VIEW_FIELDS);
      expect(unique.size).toBe(BUG_SCHEMA.VIEW_FIELDS.length);
    });

    it('VIEW_FIELDS should be subset of PERSISTENT_FIELDS (except computed fields)', () => {
      const persistent = new Set(BUG_SCHEMA.PERSISTENT_FIELDS);
      const computedViewFields = new Set(['commitsCount']);
      for (const field of BUG_SCHEMA.VIEW_FIELDS) {
        if (!computedViewFields.has(field)) {
          expect(persistent.has(field)).toBe(true);
        }
      }
    });

    it('should include coDeveloper in both PERSISTENT and VIEW fields', () => {
      expect(BUG_SCHEMA.PERSISTENT_FIELDS).toContain('coDeveloper');
      expect(BUG_SCHEMA.VIEW_FIELDS).toContain('coDeveloper');
    });

    it('should NOT include UI-only fields', () => {
      const uiFields = ['statusList', 'priorityList', 'bugTypeList', 'developerList',
        'activeTab', 'expanded', 'isEditable', 'originalStatus', 'originalFiles',
        'acceptanceCriteriaColor', 'descriptionColor', 'notesColor'];
      for (const field of uiFields) {
        expect(BUG_SCHEMA.PERSISTENT_FIELDS).not.toContain(field);
      }
    });

    it('should include aiUsage in PERSISTENT_FIELDS', () => {
      expect(BUG_SCHEMA.PERSISTENT_FIELDS).toContain('aiUsage');
    });

    it('should include Cinema4D-specific fields', () => {
      expect(BUG_SCHEMA.PERSISTENT_FIELDS).toContain('cinemaFile');
      expect(BUG_SCHEMA.PERSISTENT_FIELDS).toContain('exportedFile');
      expect(BUG_SCHEMA.PERSISTENT_FIELDS).toContain('importedFile');
      expect(BUG_SCHEMA.PERSISTENT_FIELDS).toContain('plugin');
      expect(BUG_SCHEMA.PERSISTENT_FIELDS).toContain('pluginVersion');
      expect(BUG_SCHEMA.PERSISTENT_FIELDS).toContain('treatmentType');
    });
  });

  describe('PROPOSAL_SCHEMA', () => {
    it('should have PERSISTENT_FIELDS and VIEW_FIELDS', () => {
      expect(PROPOSAL_SCHEMA.PERSISTENT_FIELDS).toBeDefined();
      expect(PROPOSAL_SCHEMA.VIEW_FIELDS).toBeDefined();
    });

    it('should have no duplicates in PERSISTENT_FIELDS', () => {
      const unique = new Set(PROPOSAL_SCHEMA.PERSISTENT_FIELDS);
      expect(unique.size).toBe(PROPOSAL_SCHEMA.PERSISTENT_FIELDS.length);
    });

    it('VIEW_FIELDS should be subset of PERSISTENT_FIELDS', () => {
      const persistent = new Set(PROPOSAL_SCHEMA.PERSISTENT_FIELDS);
      for (const field of PROPOSAL_SCHEMA.VIEW_FIELDS) {
        expect(persistent.has(field)).toBe(true);
      }
    });

    it('should NOT include epicList, developers, stakeholders (UI lists)', () => {
      expect(PROPOSAL_SCHEMA.PERSISTENT_FIELDS).not.toContain('epicList');
      expect(PROPOSAL_SCHEMA.PERSISTENT_FIELDS).not.toContain('developers');
      expect(PROPOSAL_SCHEMA.PERSISTENT_FIELDS).not.toContain('stakeholders');
    });
  });

  describe('EPIC_SCHEMA', () => {
    it('should have PERSISTENT_FIELDS', () => {
      expect(EPIC_SCHEMA.PERSISTENT_FIELDS).toBeDefined();
    });

    it('should have no duplicates in PERSISTENT_FIELDS', () => {
      const unique = new Set(EPIC_SCHEMA.PERSISTENT_FIELDS);
      expect(unique.size).toBe(EPIC_SCHEMA.PERSISTENT_FIELDS.length);
    });

    it('should have empty VIEW_FIELDS (no optimized views)', () => {
      expect(EPIC_SCHEMA.VIEW_FIELDS).toEqual([]);
    });
  });

  describe('QA_SCHEMA', () => {
    it('should have PERSISTENT_FIELDS', () => {
      expect(QA_SCHEMA.PERSISTENT_FIELDS).toBeDefined();
    });

    it('should have no duplicates in PERSISTENT_FIELDS', () => {
      const unique = new Set(QA_SCHEMA.PERSISTENT_FIELDS);
      expect(unique.size).toBe(QA_SCHEMA.PERSISTENT_FIELDS.length);
    });

    it('should have empty VIEW_FIELDS (no optimized views)', () => {
      expect(QA_SCHEMA.VIEW_FIELDS).toEqual([]);
    });

    it('should include QA-specific fields', () => {
      expect(QA_SCHEMA.PERSISTENT_FIELDS).toContain('associatedTaskId');
      expect(QA_SCHEMA.PERSISTENT_FIELDS).toContain('steps');
      expect(QA_SCHEMA.PERSISTENT_FIELDS).toContain('actualResult');
      expect(QA_SCHEMA.PERSISTENT_FIELDS).toContain('expectedResult');
      expect(QA_SCHEMA.PERSISTENT_FIELDS).toContain('defectType');
    });
  });

  describe('CARD_SCHEMAS', () => {
    it('should have all card types mapped', () => {
      expect(CARD_SCHEMAS['task-card']).toBe(TASK_SCHEMA);
      expect(CARD_SCHEMAS['bug-card']).toBe(BUG_SCHEMA);
      expect(CARD_SCHEMAS['proposal-card']).toBe(PROPOSAL_SCHEMA);
      expect(CARD_SCHEMAS['epic-card']).toBe(EPIC_SCHEMA);
      expect(CARD_SCHEMAS['qa-card']).toBe(QA_SCHEMA);
      expect(CARD_SCHEMAS['sprint-card']).toBe(SPRINT_SCHEMA);
    });

    it('should have 6 card types', () => {
      expect(Object.keys(CARD_SCHEMAS).length).toBe(6);
    });
  });
});
