import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KjExecutor } from '../src/services/kj-executor.js';
import { EventEmitter } from 'events';

function createMockProcess() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  return proc;
}

describe('KjExecutor', () => {
  let mockSpawn;
  let executor;

  beforeEach(() => {
    mockSpawn = vi.fn();
    executor = new KjExecutor({ spawn: mockSpawn });
  });

  describe('execute()', () => {
    it('should spawn kj with correct arguments', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const promise = executor.execute('exec_001', {
        description: 'Fix the bug',
        cwd: '/project',
        maxIterations: 5,
        sonarEnabled: true,
        kjHome: '/home/user/.karajan',
      });

      // Simulate process exit
      process.nextTick(() => {
        mockProc.stdout.emit('data', Buffer.from('session_id: s_001\n'));
        mockProc.emit('close', 0);
      });

      const result = await promise;

      expect(result.exitCode).toBe(0);
      expect(mockSpawn).toHaveBeenCalledWith(
        'kj',
        expect.arrayContaining(['run', 'Fix the bug', '--non-interactive', '--max-iterations', '5', '--sonar']),
        expect.objectContaining({ cwd: '/project' })
      );
    });

    it('should track running processes', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      executor.execute('exec_001', { description: 'test', cwd: '/project' });

      expect(executor.isRunning('exec_001')).toBe(true);
      expect(executor.getRunningCount()).toBe(1);
    });

    it('should throw if execution already running', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      executor.execute('exec_001', { description: 'test', cwd: '/project' });

      expect(() => executor.execute('exec_001', { description: 'test2', cwd: '/project' })).toThrow('already running');
    });

    it('should clean up after process exit', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const promise = executor.execute('exec_001', { description: 'test', cwd: '/project' });

      process.nextTick(() => mockProc.emit('close', 0));

      await promise;

      expect(executor.isRunning('exec_001')).toBe(false);
      expect(executor.getRunningCount()).toBe(0);
    });

    it('should emit output events', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      const outputs = [];
      executor.on('output', (e) => outputs.push(e));

      const promise = executor.execute('exec_001', { description: 'test', cwd: '/project' });

      process.nextTick(() => {
        mockProc.stdout.emit('data', Buffer.from('line 1\n'));
        mockProc.stderr.emit('data', Buffer.from('warning\n'));
        mockProc.emit('close', 0);
      });

      await promise;

      expect(outputs).toHaveLength(2);
      expect(outputs[0].stream).toBe('stdout');
      expect(outputs[1].stream).toBe('stderr');
    });

    it('should reject on spawn error', async () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      // Add error listener to prevent unhandled error from EventEmitter
      executor.on('error', () => {});

      const promise = executor.execute('exec_001', { description: 'test', cwd: '/project' });

      process.nextTick(() => mockProc.emit('error', new Error('ENOENT')));

      await expect(promise).rejects.toThrow('ENOENT');
      expect(executor.isRunning('exec_001')).toBe(false);
    });
  });

  describe('cancel()', () => {
    it('should kill running process', () => {
      const mockProc = createMockProcess();
      mockSpawn.mockReturnValue(mockProc);

      executor.execute('exec_001', { description: 'test', cwd: '/project' });

      const killed = executor.cancel('exec_001');

      expect(killed).toBe(true);
      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should return false for non-running execution', () => {
      expect(executor.cancel('nonexistent')).toBe(false);
    });
  });

  describe('cancelAll()', () => {
    it('should cancel all running processes', () => {
      const proc1 = createMockProcess();
      const proc2 = createMockProcess();
      mockSpawn.mockReturnValueOnce(proc1).mockReturnValueOnce(proc2);

      executor.execute('exec_001', { description: 'test1', cwd: '/p1' });
      executor.execute('exec_002', { description: 'test2', cwd: '/p2' });

      executor.cancelAll();

      expect(proc1.kill).toHaveBeenCalled();
      expect(proc2.kill).toHaveBeenCalled();
    });
  });
});
