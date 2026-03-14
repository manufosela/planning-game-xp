import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PORTS_DIR = resolve(import.meta.dirname, '../../../packages/domain/ports');

const PORT_FILES = [
  'card-repository.d.ts',
  'project-repository.d.ts',
  'team-repository.d.ts',
  'user-repository.d.ts',
  'notification-repository.d.ts',
  'history-repository.d.ts',
  'state-transition-repository.d.ts',
  'backlog-repository.d.ts',
  'auth-port.d.ts',
  'realtime-port.d.ts',
  'plan-repository.d.ts',
  'adr-repository.d.ts',
  'global-config-repository.d.ts',
  'index.d.ts',
];

/** Read a port file and return its content */
function readPort(filename) {
  return readFileSync(resolve(PORTS_DIR, filename), 'utf-8');
}

describe('Domain Ports Structure', () => {
  describe('file existence', () => {
    it.each(PORT_FILES)('port file %s exists', (file) => {
      expect(existsSync(resolve(PORTS_DIR, file))).toBe(true);
    });
  });

  describe('all files are pure type definitions (no runtime code)', () => {
    const sourceFiles = PORT_FILES.filter((f) => f !== 'index.d.ts');

    it.each(sourceFiles)('%s contains no function bodies or assignments', (file) => {
      const content = readPort(file);
      // Should not contain = (assignments) except in type definitions like Record<string, ...>
      // Should not contain function keyword
      expect(content).not.toMatch(/\bfunction\b/);
      // Should not contain class keyword
      expect(content).not.toMatch(/\bclass\b/);
      // Should not contain const/let/var assignments (runtime code)
      expect(content).not.toMatch(/\b(const|let|var)\s+\w+\s*=/);
    });
  });

  describe('exports are correct', () => {
    it.each(PORT_FILES.filter((f) => f !== 'index.d.ts'))(
      '%s has at least one export',
      (file) => {
        const content = readPort(file);
        expect(content).toMatch(/\bexport\b/);
      }
    );
  });

  describe('CardRepository port', () => {
    it('exports QueryFilters and CardRepository', () => {
      const content = readPort('card-repository.d.ts');
      expect(content).toMatch(/export interface QueryFilters/);
      expect(content).toMatch(/export interface CardRepository/);
    });

    it('imports Card and CardType from entities', () => {
      const content = readPort('card-repository.d.ts');
      expect(content).toMatch(/import.*Card.*CardType.*from\s+['"]\.\.\/entities\/card['"]/);
    });

    it('has all required methods', () => {
      const content = readPort('card-repository.d.ts');
      const methods = ['getCards', 'getCard', 'saveCard', 'deleteCard', 'getNextCardNumber', 'moveToTrash', 'restoreFromTrash'];
      for (const method of methods) {
        expect(content).toContain(method);
      }
    });

    it('QueryFilters has correct optional fields', () => {
      const content = readPort('card-repository.d.ts');
      const fields = ['type?: CardType', 'status?: string', 'year?: number', 'developer?: string', 'sprint?: string', 'epic?: string'];
      for (const field of fields) {
        expect(content).toContain(field);
      }
    });
  });

  describe('ProjectRepository port', () => {
    it('exports ProjectRepository', () => {
      const content = readPort('project-repository.d.ts');
      expect(content).toMatch(/export interface ProjectRepository/);
    });

    it('imports Project from entities', () => {
      const content = readPort('project-repository.d.ts');
      expect(content).toMatch(/import.*Project.*from\s+['"]\.\.\/entities\/project['"]/);
    });

    it('has all required methods', () => {
      const content = readPort('project-repository.d.ts');
      const methods = ['getProjects', 'getProject', 'saveProject', 'archiveProject'];
      for (const method of methods) {
        expect(content).toContain(method);
      }
    });
  });

  describe('TeamRepository port', () => {
    it('exports TeamRepository', () => {
      const content = readPort('team-repository.d.ts');
      expect(content).toMatch(/export interface TeamRepository/);
    });

    it('imports TeamMember and TagRegistry from entities', () => {
      const content = readPort('team-repository.d.ts');
      expect(content).toMatch(/import.*TeamMember.*TagRegistry.*from\s+['"]\.\.\/entities\/card['"]/);
    });

    it('has all required methods', () => {
      const content = readPort('team-repository.d.ts');
      const methods = ['getTeam', 'addMember', 'removeMember', 'getTagRegistry', 'saveTagRegistry'];
      for (const method of methods) {
        expect(content).toContain(method);
      }
    });
  });

  describe('UserRepository port', () => {
    it('exports UserRepository', () => {
      const content = readPort('user-repository.d.ts');
      expect(content).toMatch(/export interface UserRepository/);
    });

    it('has all required methods', () => {
      const content = readPort('user-repository.d.ts');
      const methods = ['getUser', 'saveUser', 'getUsers', 'deleteUser'];
      for (const method of methods) {
        expect(content).toContain(method);
      }
    });
  });

  describe('NotificationRepository port', () => {
    it('exports Notification type and NotificationRepository', () => {
      const content = readPort('notification-repository.d.ts');
      expect(content).toMatch(/export interface Notification/);
      expect(content).toMatch(/export interface NotificationRepository/);
    });

    it('Notification has correct fields', () => {
      const content = readPort('notification-repository.d.ts');
      expect(content).toContain("type: 'info' | 'warning' | 'action'");
      expect(content).toContain('read: boolean');
      expect(content).toContain('cardRef?: string');
      expect(content).toContain('createdAt: Timestamp');
    });

    it('has all required methods', () => {
      const content = readPort('notification-repository.d.ts');
      const methods = ['getNotifications', 'markAsRead', 'markAllAsRead'];
      for (const method of methods) {
        expect(content).toContain(method);
      }
    });
  });

  describe('HistoryRepository port', () => {
    it('exports HistoryEntry and HistoryRepository', () => {
      const content = readPort('history-repository.d.ts');
      expect(content).toMatch(/export interface HistoryEntry/);
      expect(content).toMatch(/export interface HistoryRepository/);
    });

    it('HistoryEntry has correct fields', () => {
      const content = readPort('history-repository.d.ts');
      expect(content).toContain('timestamp: Timestamp');
      expect(content).toContain('changedBy: string');
      expect(content).toContain('changedByName: string');
    });

    it('has all required methods', () => {
      const content = readPort('history-repository.d.ts');
      expect(content).toContain('addEntry');
      expect(content).toContain('getHistory');
    });
  });

  describe('StateTransitionRepository port', () => {
    it('exports all types and interface', () => {
      const content = readPort('state-transition-repository.d.ts');
      expect(content).toMatch(/export interface StateTransition/);
      expect(content).toMatch(/export interface MetricFilters/);
      expect(content).toMatch(/export interface TransitionMetrics/);
      expect(content).toMatch(/export interface StateTransitionRepository/);
    });

    it('StateTransition has correct fields', () => {
      const content = readPort('state-transition-repository.d.ts');
      expect(content).toContain('fromStatus: string');
      expect(content).toContain('toStatus: string');
      expect(content).toContain('changedAt: Timestamp');
      expect(content).toContain('durationInPreviousStatus?: number');
    });

    it('TransitionMetrics has correct structure', () => {
      const content = readPort('state-transition-repository.d.ts');
      expect(content).toContain('avgCycleTime: Record<string, number>');
      expect(content).toContain('transitionCounts: Record<string, number>');
      expect(content).toMatch(/bottlenecks:\s*Array<\{\s*status:\s*string;\s*avgDuration:\s*number\s*\}>/);
    });

    it('has all required methods', () => {
      const content = readPort('state-transition-repository.d.ts');
      expect(content).toContain('recordTransition');
      expect(content).toContain('getTransitions');
      expect(content).toContain('getMetrics');
    });
  });

  describe('BacklogRepository port', () => {
    it('exports BacklogEntry and BacklogRepository', () => {
      const content = readPort('backlog-repository.d.ts');
      expect(content).toMatch(/export interface BacklogEntry/);
      expect(content).toMatch(/export interface BacklogRepository/);
    });

    it('has all required methods', () => {
      const content = readPort('backlog-repository.d.ts');
      const methods = ['getBacklog', 'reorderBacklog', 'addToBacklog', 'removeFromBacklog'];
      for (const method of methods) {
        expect(content).toContain(method);
      }
    });
  });

  describe('AuthPort', () => {
    it('exports AuthUser, Unsubscribe, and AuthPort', () => {
      const content = readPort('auth-port.d.ts');
      expect(content).toMatch(/export interface AuthUser/);
      expect(content).toMatch(/export type Unsubscribe/);
      expect(content).toMatch(/export interface AuthPort/);
    });

    it('AuthUser has correct fields', () => {
      const content = readPort('auth-port.d.ts');
      expect(content).toContain('uid: string');
      expect(content).toContain('email: string');
      expect(content).toContain('displayName: string');
      expect(content).toContain('photoURL?: string');
    });

    it('has all required methods', () => {
      const content = readPort('auth-port.d.ts');
      const methods = ['signInWithGoogle', 'signInWithMicrosoft', 'signOut', 'onAuthStateChanged', 'getCurrentUser'];
      for (const method of methods) {
        expect(content).toContain(method);
      }
    });
  });

  describe('RealtimePort', () => {
    it('exports Unsubscribe and RealtimePort', () => {
      const content = readPort('realtime-port.d.ts');
      expect(content).toMatch(/export type Unsubscribe/);
      expect(content).toMatch(/export interface RealtimePort/);
    });

    it('imports Card from entities and Notification from notification-repository', () => {
      const content = readPort('realtime-port.d.ts');
      expect(content).toMatch(/import.*Card.*from\s+['"]\.\.\/entities\/card['"]/);
      expect(content).toMatch(/import.*Notification.*from\s+['"]\.\/notification-repository['"]/);
    });

    it('has all required methods', () => {
      const content = readPort('realtime-port.d.ts');
      expect(content).toContain('subscribeToCards');
      expect(content).toContain('subscribeToCard');
      expect(content).toContain('subscribeToNotifications');
    });
  });

  describe('PlanRepository port', () => {
    it('exports PlanRepository', () => {
      const content = readPort('plan-repository.d.ts');
      expect(content).toMatch(/export interface PlanRepository/);
    });

    it('has all required methods', () => {
      const content = readPort('plan-repository.d.ts');
      const methods = ['getPlans', 'getPlan', 'savePlan', 'deletePlan'];
      for (const method of methods) {
        expect(content).toContain(method);
      }
    });
  });

  describe('AdrRepository port', () => {
    it('exports AdrRepository', () => {
      const content = readPort('adr-repository.d.ts');
      expect(content).toMatch(/export interface AdrRepository/);
    });

    it('has all required methods', () => {
      const content = readPort('adr-repository.d.ts');
      const methods = ['getAdrs', 'getAdr', 'saveAdr', 'deleteAdr'];
      for (const method of methods) {
        expect(content).toContain(method);
      }
    });
  });

  describe('GlobalConfigRepository port', () => {
    it('exports GlobalConfigRepository', () => {
      const content = readPort('global-config-repository.d.ts');
      expect(content).toMatch(/export interface GlobalConfigRepository/);
    });

    it('has all required methods', () => {
      const content = readPort('global-config-repository.d.ts');
      const methods = ['getConfigs', 'getConfig', 'saveConfig', 'deleteConfig'];
      for (const method of methods) {
        expect(content).toContain(method);
      }
    });
  });

  describe('Barrel export (index.d.ts)', () => {
    it('re-exports all port interfaces', () => {
      const content = readPort('index.d.ts');
      const expectedExports = [
        'CardRepository',
        'QueryFilters',
        'ProjectRepository',
        'TeamRepository',
        'UserRepository',
        'Notification',
        'NotificationRepository',
        'HistoryEntry',
        'HistoryRepository',
        'StateTransition',
        'MetricFilters',
        'TransitionMetrics',
        'StateTransitionRepository',
        'BacklogEntry',
        'BacklogRepository',
        'AuthUser',
        'Unsubscribe',
        'AuthPort',
        'RealtimePort',
        'PlanRepository',
        'AdrRepository',
        'GlobalConfigRepository',
      ];
      for (const exp of expectedExports) {
        expect(content).toContain(exp);
      }
    });

    it('re-exports from all 13 port files', () => {
      const content = readPort('index.d.ts');
      const portFiles = PORT_FILES.filter((f) => f !== 'index.d.ts').map((f) => `./${f.replace('.d.ts', '')}`);
      for (const portFile of portFiles) {
        expect(content).toContain(portFile);
      }
    });
  });

  describe('package.json', () => {
    it('has correct domain package configuration', () => {
      const pkg = JSON.parse(readFileSync(resolve(PORTS_DIR, '../package.json'), 'utf-8'));
      expect(pkg.name).toBe('@pgv2/domain');
      expect(pkg.version).toBe('0.1.0');
      expect(pkg.type).toBe('module');
      expect(pkg.exports['.']).toBe('./index.js');
      expect(pkg.exports['./ports']).toBe('./ports/index.d.ts');
    });
  });
});
