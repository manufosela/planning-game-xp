import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RULES_PATH = resolve(import.meta.dirname, '../../firestore.rules');

describe('Firestore Security Rules', () => {
  let rulesContent;

  beforeAll(() => {
    rulesContent = readFileSync(RULES_PATH, 'utf-8');
  });

  describe('rules file validity', () => {
    it('should exist and be non-empty', () => {
      expect(rulesContent).toBeTruthy();
      expect(rulesContent.length).toBeGreaterThan(0);
    });

    it('should start with rules_version declaration', () => {
      expect(rulesContent).toMatch(/^rules_version\s*=\s*'2'/);
    });

    it('should have service cloud.firestore block', () => {
      expect(rulesContent).toContain('service cloud.firestore');
    });

    it('should have balanced braces', () => {
      const open = (rulesContent.match(/{/g) || []).length;
      const close = (rulesContent.match(/}/g) || []).length;
      expect(open).toBe(close);
    });
  });

  describe('helper functions', () => {
    it('should define isSignedIn()', () => {
      expect(rulesContent).toContain('function isSignedIn()');
      expect(rulesContent).toContain('request.auth != null');
    });

    it('should define isSelf(uid)', () => {
      expect(rulesContent).toContain('function isSelf(uid)');
      expect(rulesContent).toContain('request.auth.uid == uid');
    });

    it('should define isProjectMember(projectId)', () => {
      expect(rulesContent).toContain('function isProjectMember(projectId)');
      expect(rulesContent).toContain('projectId in get(');
    });

    it('should define isAdmin()', () => {
      expect(rulesContent).toContain('function isAdmin()');
      expect(rulesContent).toMatch(/role\s+in\s+\['superadmin',\s*'admin'\]/);
    });
  });

  describe('user document rules', () => {
    it('should allow self read/write on /users/{uid}', () => {
      expect(rulesContent).toMatch(/match\s+\/users\/\{uid\}/);
      expect(rulesContent).toContain('if isSelf(uid)');
    });

    it('should have notifications subcollection rule', () => {
      expect(rulesContent).toMatch(/match\s+\/notifications\/\{notifId\}/);
    });

    it('should have backlog subcollection rule', () => {
      expect(rulesContent).toMatch(/match\s+\/backlog\/\{itemId\}/);
    });
  });

  describe('project document rules', () => {
    it('should protect projects with isProjectMember', () => {
      expect(rulesContent).toMatch(/match\s+\/projects\/\{projectId\}/);
      expect(rulesContent).toContain('isProjectMember(projectId)');
    });

    it('should have cards subcollection rule', () => {
      expect(rulesContent).toMatch(/match\s+\/cards\/\{cardId\}/);
    });

    it('should have stateTransitions subcollection rule', () => {
      expect(rulesContent).toMatch(/match\s+\/stateTransitions\/\{id\}/);
    });

    it('should have history subcollection rule', () => {
      expect(rulesContent).toMatch(/match\s+\/history\/\{historyId\}/);
    });

    it('should have team subcollection rule', () => {
      expect(rulesContent).toMatch(/match\s+\/team\/\{memberId\}/);
    });

    it('should have trash subcollection rule', () => {
      expect(rulesContent).toMatch(/match\s+\/trash\/\{cardId\}/);
    });

    it('should have plans subcollection rule', () => {
      expect(rulesContent).toMatch(/match\s+\/plans\/\{planId\}/);
    });

    it('should have adrs subcollection rule', () => {
      expect(rulesContent).toMatch(/match\s+\/adrs\/\{adrId\}/);
    });

    it('should have settings subcollection rule', () => {
      expect(rulesContent).toMatch(/match\s+\/settings\/\{settingId\}/);
    });
  });

  describe('globalConfig rules', () => {
    it('should allow read for signed-in users', () => {
      expect(rulesContent).toMatch(/match\s+\/globalConfig\/\{configId\}/);
      expect(rulesContent).toMatch(/allow read:\s*if isSignedIn\(\)/);
    });

    it('should restrict write to admins only', () => {
      expect(rulesContent).toMatch(/allow write:\s*if isAdmin\(\)/);
    });

    it('should have versions subcollection rule', () => {
      expect(rulesContent).toMatch(/match\s+\/versions\/\{versionId\}/);
    });
  });

  describe('counters rules', () => {
    it('should allow read/write for signed-in users', () => {
      expect(rulesContent).toMatch(/match\s+\/counters\/\{counterId\}/);
    });
  });
});
