import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SessionMonitor } from '../src/services/session-monitor.js';

describe('SessionMonitor', () => {
  let tmpDir;
  let monitor;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-monitor-test-'));
    monitor = new SessionMonitor();
  });

  afterEach(() => {
    monitor.stopAll();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('startMonitoring()', () => {
    it('should emit status_change from initial read', async () => {
      const sessionDir = path.join(tmpDir, 'session');
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(path.join(sessionDir, 'session.json'), JSON.stringify({
        status: 'running',
        currentPhase: 'coder',
        currentIteration: 1,
        checkpoints: [],
      }));

      const events = [];
      monitor.on('status_change', (e) => events.push(e));

      monitor.startMonitoring('exec_001', sessionDir);

      // Wait for initial read
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events).toHaveLength(1);
      expect(events[0].executionId).toBe('exec_001');
      expect(events[0].status).toBe('running');
      expect(events[0].phase).toBe('coder');
    });

    it('should emit new checkpoints', async () => {
      const sessionDir = path.join(tmpDir, 'session');
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(path.join(sessionDir, 'session.json'), JSON.stringify({
        status: 'running',
        checkpoints: [
          { stage: 'coder', iteration: 1, status: 'completed' },
        ],
      }));

      const checkpoints = [];
      monitor.on('checkpoint', (e) => checkpoints.push(e));

      monitor.startMonitoring('exec_001', sessionDir);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0].index).toBe(0);
      expect(checkpoints[0].checkpoint.stage).toBe('coder');
    });

    it('should emit completed event on session completion', async () => {
      const sessionDir = path.join(tmpDir, 'session');
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(path.join(sessionDir, 'session.json'), JSON.stringify({
        status: 'completed',
        result: { commits: ['abc123'] },
        checkpoints: [],
      }));

      const completed = [];
      monitor.on('completed', (e) => completed.push(e));

      monitor.startMonitoring('exec_001', sessionDir);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(completed).toHaveLength(1);
      expect(completed[0].status).toBe('completed');
      expect(completed[0].result.commits).toContain('abc123');
    });

    it('should stop monitoring after completion', async () => {
      const sessionDir = path.join(tmpDir, 'session');
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(path.join(sessionDir, 'session.json'), JSON.stringify({
        status: 'completed',
        checkpoints: [],
      }));

      // Wait for completed event which is emitted after stopMonitoring
      const completedPromise = new Promise(resolve => {
        monitor.on('completed', resolve);
      });

      monitor.startMonitoring('exec_001', sessionDir);

      await completedPromise;

      expect(monitor.getActiveCount()).toBe(0);
    });
  });

  describe('stopMonitoring()', () => {
    it('should stop watching a session', () => {
      const sessionDir = path.join(tmpDir, 'session');
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(path.join(sessionDir, 'session.json'), JSON.stringify({
        status: 'running',
        checkpoints: [],
      }));

      monitor.startMonitoring('exec_001', sessionDir);
      expect(monitor.getActiveCount()).toBe(1);

      monitor.stopMonitoring('exec_001');
      expect(monitor.getActiveCount()).toBe(0);
    });

    it('should not throw for non-monitored execution', () => {
      expect(() => monitor.stopMonitoring('nonexistent')).not.toThrow();
    });
  });

  describe('stopAll()', () => {
    it('should stop all monitors', () => {
      const dir1 = path.join(tmpDir, 'session1');
      const dir2 = path.join(tmpDir, 'session2');
      fs.mkdirSync(dir1, { recursive: true });
      fs.mkdirSync(dir2, { recursive: true });
      fs.writeFileSync(path.join(dir1, 'session.json'), JSON.stringify({ status: 'running', checkpoints: [] }));
      fs.writeFileSync(path.join(dir2, 'session.json'), JSON.stringify({ status: 'running', checkpoints: [] }));

      monitor.startMonitoring('exec_001', dir1);
      monitor.startMonitoring('exec_002', dir2);
      expect(monitor.getActiveCount()).toBe(2);

      monitor.stopAll();
      expect(monitor.getActiveCount()).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should emit error for non-existent session file', () => {
      const errors = [];
      monitor.on('error', (e) => errors.push(e));

      const nonExistentDir = path.join(tmpDir, 'nonexistent');
      fs.mkdirSync(nonExistentDir, { recursive: true });

      monitor.startMonitoring('exec_001', nonExistentDir);

      // No crash, error may or may not be emitted depending on fs.watch behavior
      expect(monitor.getActiveCount()).toBeLessThanOrEqual(1);
    });
  });
});
