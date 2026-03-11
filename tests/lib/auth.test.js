import { describe, expect, it } from 'vitest';
import { applyAuthUser, authGuard, authState } from '@lib/auth.js';
import { resolveHomeRoute } from '@lib/page-guards.js';

describe('auth helpers', () => {
  it('blocks anonymous users', () => {
    expect(authGuard(null)).toEqual({
      allowed: false,
      reason: 'Authentication required',
      redirectTo: '/login',
    });
  });

  it('allows authenticated users', () => {
    const user = /** @type {import('../../src/lib/types.d.ts').User} */ ({
      name: 'Manu',
      email: 'manu@example.com',
      role: 'user',
      projects: { PG2: 'admin' },
      preferences: {
        theme: 'system',
        defaultYear: 2026,
        locale: 'en',
      },
      createdAt: /** @type {any} */ (new Date()),
      lastLoginAt: /** @type {any} */ (new Date()),
    });

    applyAuthUser(user);

    expect(authGuard(authState.get().user)).toEqual({ allowed: true });
    expect(resolveHomeRoute(authState.get().user)).toBe('/projects');
  });

  it('rejects invalid redirect targets', () => {
    expect(() => authGuard(null, 'login')).toThrowError(/absolute path/);
  });
});
