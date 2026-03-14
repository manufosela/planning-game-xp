/**
 * Tests for ManageAuth use case.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManageAuth } from '../../../src/application/use-cases/manage-auth.js';

describe('ManageAuth', () => {
  /** @type {any} */
  let authPort;
  /** @type {any} */
  let userRepo;
  /** @type {ManageAuth} */
  let useCase;

  beforeEach(() => {
    authPort = {
      login: vi.fn().mockResolvedValue({ uid: 'u1', email: 'test@test.com' }),
      logout: vi.fn().mockResolvedValue(undefined),
      onAuthStateChanged: vi.fn().mockReturnValue(vi.fn()),
    };
    userRepo = {
      get: vi.fn().mockResolvedValue({ uid: 'u1', email: 'test@test.com', role: 'developer' }),
    };
    useCase = new ManageAuth({ authPort, userRepository: userRepo });
  });

  it('should delegate login to authPort', async () => {
    const result = await useCase.login('google');

    expect(authPort.login).toHaveBeenCalledWith('google');
    expect(result).toEqual({ uid: 'u1', email: 'test@test.com' });
  });

  it('should delegate logout to authPort', async () => {
    await useCase.logout();
    expect(authPort.logout).toHaveBeenCalled();
  });

  it('should subscribe to auth changes and enrich with user profile', async () => {
    const callback = vi.fn();
    const unsubscribe = useCase.onAuthChange(callback);

    // Simulate the authPort calling the internal callback
    const internalCallback = authPort.onAuthStateChanged.mock.calls[0][0];
    await internalCallback({ uid: 'u1', email: 'test@test.com' });

    expect(userRepo.get).toHaveBeenCalledWith('u1');
    expect(callback).toHaveBeenCalledWith({
      uid: 'u1', email: 'test@test.com', role: 'developer',
    });
    expect(typeof unsubscribe).toBe('function');
  });

  it('should call callback with null when user logs out', async () => {
    const callback = vi.fn();
    useCase.onAuthChange(callback);

    const internalCallback = authPort.onAuthStateChanged.mock.calls[0][0];
    await internalCallback(null);

    expect(callback).toHaveBeenCalledWith(null);
    expect(userRepo.get).not.toHaveBeenCalled();
  });
});
