/**
 * Tests for pg-chart data processing functions.
 * Tests pure logic helpers without DOM rendering.
 */
import { describe, it, expect } from 'vitest';
import { computeSlices, niceMax, normalizeValues } from '../../src/components/pg-chart.js';

describe('computeSlices', () => {
  it('should compute correct percentages for simple values', () => {
    const slices = computeSlices([50, 30, 20]);
    expect(slices).toHaveLength(3);
    expect(slices[0].pct).toBeCloseTo(0.5);
    expect(slices[1].pct).toBeCloseTo(0.3);
    expect(slices[2].pct).toBeCloseTo(0.2);
  });

  it('should compute correct angles summing to 2*PI', () => {
    const slices = computeSlices([10, 20, 30]);
    const lastSlice = slices[slices.length - 1];
    const totalAngle = lastSlice.endAngle - slices[0].startAngle;
    expect(totalAngle).toBeCloseTo(Math.PI * 2);
  });

  it('should handle all zeros', () => {
    const slices = computeSlices([0, 0, 0]);
    expect(slices.every((s) => s.pct === 0)).toBe(true);
  });

  it('should handle empty array', () => {
    const slices = computeSlices([]);
    expect(slices).toHaveLength(0);
  });

  it('should handle single value', () => {
    const slices = computeSlices([100]);
    expect(slices[0].pct).toBeCloseTo(1);
    const sweep = slices[0].endAngle - slices[0].startAngle;
    expect(sweep).toBeCloseTo(Math.PI * 2);
  });

  it('should have consecutive angles', () => {
    const slices = computeSlices([25, 25, 25, 25]);
    for (let i = 1; i < slices.length; i++) {
      expect(slices[i].startAngle).toBeCloseTo(slices[i - 1].endAngle);
    }
  });

  it('should start from -PI/2 (top of circle)', () => {
    const slices = computeSlices([10]);
    expect(slices[0].startAngle).toBeCloseTo(-Math.PI / 2);
  });
});

describe('niceMax', () => {
  it('should return 10 for zero or negative', () => {
    expect(niceMax(0)).toBe(10);
    expect(niceMax(-5)).toBe(10);
  });

  it('should round up to nice numbers', () => {
    expect(niceMax(7)).toBe(10);
    expect(niceMax(12)).toBe(20);
    expect(niceMax(45)).toBe(50);
    expect(niceMax(85)).toBe(100);
  });

  it('should handle exact powers of 10', () => {
    expect(niceMax(10)).toBe(10);
    expect(niceMax(100)).toBe(100);
    expect(niceMax(1000)).toBe(1000);
  });

  it('should handle small values', () => {
    expect(niceMax(1)).toBe(1);
    expect(niceMax(2)).toBe(2);
    expect(niceMax(3)).toBe(5);
  });

  it('should handle large values', () => {
    expect(niceMax(350)).toBe(500);
    expect(niceMax(8500)).toBe(10000);
  });
});

describe('normalizeValues', () => {
  it('should normalize values to 0..1 range', () => {
    const result = normalizeValues([5, 10, 15], 20);
    expect(result[0]).toBeCloseTo(0.25);
    expect(result[1]).toBeCloseTo(0.5);
    expect(result[2]).toBeCloseTo(0.75);
  });

  it('should handle max of zero', () => {
    const result = normalizeValues([5, 10], 0);
    expect(result.every((v) => v === 0)).toBe(true);
  });

  it('should handle empty array', () => {
    const result = normalizeValues([], 10);
    expect(result).toHaveLength(0);
  });

  it('should return 1 when value equals max', () => {
    const result = normalizeValues([10], 10);
    expect(result[0]).toBeCloseTo(1);
  });

  it('should handle all zeros', () => {
    const result = normalizeValues([0, 0, 0], 10);
    expect(result.every((v) => v === 0)).toBe(true);
  });
});
