import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock firebase/database before importing the service
vi.mock('firebase/database', () => ({
  getDatabase: vi.fn(() => ({})),
  ref: vi.fn(),
  get: vi.fn(),
  onValue: vi.fn(() => vi.fn()),
  query: vi.fn(),
  orderByChild: vi.fn(),
  equalTo: vi.fn(),
}));

// We need to test the class directly since it's a singleton
const { AiExecutionService } = await import('../../public/js/services/ai-execution-service.js').then(m => {
  // The module exports the singleton instance; we need the class
  // Re-create class for testing
  return { AiExecutionService: m.aiExecutionService.constructor };
});

describe('AiExecutionService', () => {
  let service;
  let originalFetch;

  beforeEach(() => {
    service = new AiExecutionService();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('isAvailable()', () => {
    it('should return false when not initialized', () => {
      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('getBridgeUrl()', () => {
    it('should return null when not initialized', () => {
      expect(service.getBridgeUrl()).toBeNull();
    });
  });

  describe('execute()', () => {
    it('should throw when bridge is not available', async () => {
      await expect(service.execute({
        projectId: 'PG',
        cardId: 'PLN-TSK-001',
        cardType: 'task',
        firebaseCardId: '-Nxyz',
        requestedBy: 'dev_010',
        context: {},
      })).rejects.toThrow('not available');
    });

    it('should call bridge API when available', async () => {
      service._available = true;
      service._bridgeUrl = 'http://localhost:3100';
      service._apiKey = 'test-key';

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          executionId: 'exec_001',
          wsUrl: 'ws://localhost:3100/ws/exec_001',
          status: 'queued',
        }),
      };

      globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

      const result = await service.execute({
        projectId: 'PG',
        cardId: 'PLN-TSK-001',
        cardType: 'task',
        firebaseCardId: '-Nxyz',
        requestedBy: 'dev_010',
        context: { title: 'Test task' },
      });

      expect(result.executionId).toBe('exec_001');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3100/execute',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-key',
          }),
        })
      );
    });

    it('should throw on bridge error', async () => {
      service._available = true;
      service._bridgeUrl = 'http://localhost:3100';
      service._apiKey = 'test-key';

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ error: 'Missing required fields' }),
      });

      await expect(service.execute({
        projectId: 'PG',
        cardId: 'PLN-TSK-001',
        cardType: 'task',
        firebaseCardId: '-Nxyz',
        requestedBy: 'dev_010',
        context: {},
      })).rejects.toThrow('Missing required fields');
    });
  });

  describe('cancel()', () => {
    it('should throw when bridge is not available', async () => {
      await expect(service.cancel('exec_001')).rejects.toThrow('not available');
    });

    it('should call cancel endpoint', async () => {
      service._available = true;
      service._bridgeUrl = 'http://localhost:3100';
      service._apiKey = 'test-key';

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          executionId: 'exec_001',
          status: 'cancelled',
        }),
      });

      const result = await service.cancel('exec_001');

      expect(result.status).toBe('cancelled');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3100/cancel/exec_001',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('disconnectWebSocket()', () => {
    it('should close and remove connection', () => {
      const mockWs = { close: vi.fn() };
      service._wsConnections.set('exec_001', mockWs);

      service.disconnectWebSocket('exec_001');

      expect(mockWs.close).toHaveBeenCalled();
      expect(service._wsConnections.has('exec_001')).toBe(false);
    });

    it('should not throw for non-existent connection', () => {
      expect(() => service.disconnectWebSocket('nonexistent')).not.toThrow();
    });
  });

  describe('unsubscribeFromExecution()', () => {
    it('should call unsubscribe function', () => {
      const mockUnsub = vi.fn();
      service._rtdbUnsubscribes.set('exec_001', mockUnsub);

      service.unsubscribeFromExecution('exec_001');

      expect(mockUnsub).toHaveBeenCalled();
      expect(service._rtdbUnsubscribes.has('exec_001')).toBe(false);
    });

    it('should not throw for non-existent subscription', () => {
      expect(() => service.unsubscribeFromExecution('nonexistent')).not.toThrow();
    });
  });
});
