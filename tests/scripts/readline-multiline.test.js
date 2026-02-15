import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';

const { collectMultilineInput } = await import('../../scripts/readline-multiline.cjs');

function createMockReadline() {
  const emitter = new EventEmitter();
  emitter._promptCount = 0;
  emitter.setPrompt = () => {};
  emitter.prompt = () => {
    emitter._promptCount += 1;
  };
  emitter.removeListener = emitter.removeListener.bind(emitter);
  emitter.on = emitter.on.bind(emitter);
  return emitter;
}

describe('collectMultilineInput', () => {
  it('should collect burst pasted lines until END token', async () => {
    const rl = createMockReadline();
    const promise = collectMultilineInput(rl, {
      endToken: 'END',
      shouldFinalize: ({ line }) => line.trim() === 'END',
    });

    rl.emit('line', 'const firebaseConfig = {');
    rl.emit('line', 'apiKey: "x",');
    rl.emit('line', 'projectId: "p"');
    rl.emit('line', '};');
    rl.emit('line', 'END');

    const result = await promise;
    expect(result).toContain('apiKey: "x"');
    expect(result).toContain('projectId: "p"');
  });

  it('should stop on empty line when validator-like finalizer returns true', async () => {
    const rl = createMockReadline();
    const promise = collectMultilineInput(rl, {
      endToken: 'END',
      shouldFinalize: ({ line, lines }) => line.trim() === '' && lines.length >= 2,
    });

    rl.emit('line', 'line-1');
    rl.emit('line', 'line-2');
    rl.emit('line', '');

    const result = await promise;
    expect(result).toBe('line-1\nline-2');
  });
});
