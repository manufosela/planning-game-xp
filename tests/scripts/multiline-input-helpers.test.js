import { describe, it, expect, vi } from 'vitest';

const {
  shouldFinalizeMultilineInput,
} = await import('../../scripts/multiline-input-helpers.cjs');

describe('shouldFinalizeMultilineInput', () => {
  it('should finalize when explicit END token is provided', () => {
    const result = shouldFinalizeMultilineInput({
      line: 'END',
      lines: ['{', '"apiKey":"x"', '}'],
      endToken: 'END',
      validator: vi.fn(),
    });

    expect(result).toBe(true);
  });

  it('should finalize on empty line when validator accepts accumulated content', () => {
    const validator = vi.fn();
    const result = shouldFinalizeMultilineInput({
      line: '',
      lines: ['{ "apiKey": "x" }'],
      endToken: 'END',
      validator,
    });

    expect(result).toBe(true);
    expect(validator).toHaveBeenCalled();
  });

  it('should continue on empty line when validator rejects content', () => {
    const validator = vi.fn(() => {
      throw new Error('invalid');
    });
    const result = shouldFinalizeMultilineInput({
      line: '',
      lines: ['{ invalid'],
      endToken: 'END',
      validator,
    });

    expect(result).toBe(false);
  });
});
