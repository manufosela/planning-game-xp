import { describe, it, expect } from 'vitest';

const { formatStepHeader } = await import('../../scripts/setup-ui-formatters.cjs');

describe('formatStepHeader', () => {
  it('should include step number and description in a highlighted block', () => {
    const lines = formatStepHeader(4, 10, 'Configuración de Firebase');

    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('PASO 4/10');
    expect(lines[1]).toContain('Configuración de Firebase');
  });

  it('should render all lines with same width', () => {
    const lines = formatStepHeader(1, 10, 'Verificando prerequisitos...');
    const lengths = new Set(lines.map((line) => line.length));

    expect(lengths.size).toBe(1);
  });
});
