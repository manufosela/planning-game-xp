/**
 * Tests for custom claims signals and getDb() dynamic routing.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  currentInstance,
  instanceRole,
  platformAdmin,
  setInstanceClaims,
  clearInstanceClaims,
} from '../../src/lib/store.js';

describe('custom claims signals', () => {
  beforeEach(() => {
    clearInstanceClaims();
  });

  describe('initial values', () => {
    it('currentInstance should be null', () => {
      expect(currentInstance.value).toBeNull();
    });

    it('instanceRole should be null', () => {
      expect(instanceRole.value).toBeNull();
    });

    it('platformAdmin should be false', () => {
      expect(platformAdmin.value).toBe(false);
    });
  });

  describe('setInstanceClaims', () => {
    it('sets all claims from token result', () => {
      setInstanceClaims({
        instance: 'geniova',
        instanceRole: 'admin',
        platformAdmin: true,
      });

      expect(currentInstance.value).toBe('geniova');
      expect(instanceRole.value).toBe('admin');
      expect(platformAdmin.value).toBe(true);
    });

    it('handles partial claims (no instance)', () => {
      setInstanceClaims({});

      expect(currentInstance.value).toBeNull();
      expect(instanceRole.value).toBeNull();
      expect(platformAdmin.value).toBe(false);
    });

    it('handles only instance claim', () => {
      setInstanceClaims({ instance: 'acme' });

      expect(currentInstance.value).toBe('acme');
      expect(instanceRole.value).toBeNull();
      expect(platformAdmin.value).toBe(false);
    });
  });

  describe('clearInstanceClaims', () => {
    it('resets all claims to defaults', () => {
      setInstanceClaims({
        instance: 'geniova',
        instanceRole: 'admin',
        platformAdmin: true,
      });

      clearInstanceClaims();

      expect(currentInstance.value).toBeNull();
      expect(instanceRole.value).toBeNull();
      expect(platformAdmin.value).toBe(false);
    });
  });
});
