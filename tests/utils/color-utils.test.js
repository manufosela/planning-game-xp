// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  hexToRgb,
  rgbToHex,
  relativeLuminance,
  getContrastColor,
  darkenColor,
  statusGradient,
  resolveStatusColor,
  getStatusColorPair,
} from '@/utils/color-utils.js';

describe('color-utils', () => {
  describe('hexToRgb', () => {
    it('should parse valid hex colors', () => {
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
      expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(hexToRgb('#4a9eff')).toEqual({ r: 74, g: 158, b: 255 });
      expect(hexToRgb('#FF0000')).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('should return null for invalid hex', () => {
      expect(hexToRgb('invalid')).toBeNull();
      expect(hexToRgb('#fff')).toBeNull();
      expect(hexToRgb('')).toBeNull();
      expect(hexToRgb('#gggggg')).toBeNull();
    });
  });

  describe('rgbToHex', () => {
    it('should convert RGB to hex', () => {
      expect(rgbToHex(0, 0, 0)).toBe('#000000');
      expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
      expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
      expect(rgbToHex(74, 158, 255)).toBe('#4a9eff');
    });

    it('should clamp values to 0-255', () => {
      expect(rgbToHex(-10, 300, 128)).toBe('#00ff80');
    });
  });

  describe('relativeLuminance', () => {
    it('should return 0 for black', () => {
      expect(relativeLuminance('#000000')).toBeCloseTo(0, 4);
    });

    it('should return 1 for white', () => {
      expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 4);
    });

    it('should return correct luminance for mid-tones', () => {
      const lum = relativeLuminance('#808080');
      expect(lum).toBeGreaterThan(0.1);
      expect(lum).toBeLessThan(0.5);
    });

    it('should return 0 for invalid hex', () => {
      expect(relativeLuminance('invalid')).toBe(0);
    });
  });

  describe('getContrastColor', () => {
    it('should return white text for dark backgrounds', () => {
      expect(getContrastColor('#000000')).toBe('#ffffff');
      expect(getContrastColor('#1a1a2e')).toBe('#ffffff');
      expect(getContrastColor('#14532d')).toBe('#ffffff');
      expect(getContrastColor('#0d47a1')).toBe('#ffffff');
    });

    it('should return black text for light backgrounds', () => {
      expect(getContrastColor('#ffffff')).toBe('#000000');
      expect(getContrastColor('#cce500')).toBe('#000000');
      expect(getContrastColor('#d4edda')).toBe('#000000');
      expect(getContrastColor('#f8d7da')).toBe('#000000');
      expect(getContrastColor('#ffc107')).toBe('#000000');
      expect(getContrastColor('#4a9eff')).toBe('#000000');
    });
  });

  describe('darkenColor', () => {
    it('should darken a color by default 20%', () => {
      const darker = darkenColor('#ffffff');
      expect(darker).toBe('#cccccc');
    });

    it('should darken by specified amount', () => {
      const darker = darkenColor('#ffffff', 0.5);
      expect(darker).toBe('#808080');
    });

    it('should return original for invalid hex', () => {
      expect(darkenColor('invalid')).toBe('invalid');
    });

    it('should not go below 0', () => {
      const darker = darkenColor('#0a0a0a', 0.9);
      const rgb = hexToRgb(darker);
      expect(rgb.r).toBeGreaterThanOrEqual(0);
      expect(rgb.g).toBeGreaterThanOrEqual(0);
      expect(rgb.b).toBeGreaterThanOrEqual(0);
    });
  });

  describe('statusGradient', () => {
    it('should return a linear-gradient string', () => {
      const gradient = statusGradient('#4a9eff');
      expect(gradient).toContain('linear-gradient(135deg,');
      expect(gradient).toContain('#4a9eff');
    });

    it('should include a darker stop', () => {
      const gradient = statusGradient('#ffffff');
      expect(gradient).toContain('#cccccc');
    });
  });

  describe('resolveStatusColor', () => {
    beforeEach(() => {
      // Clear any inline styles from :root
      document.documentElement.style.cssText = '';
    });

    it('should return fallback color when no CSS variable is set', () => {
      const color = resolveStatusColor('TO DO');
      expect(color).toBe('#449bd3');
    });

    it('should read from CSS variable when set', () => {
      document.documentElement.style.setProperty('--status-todo', '#ff0000');
      const color = resolveStatusColor('TO DO');
      expect(color).toBe('#ff0000');
    });

    it('should handle case-insensitive status names', () => {
      const color1 = resolveStatusColor('In Progress');
      const color2 = resolveStatusColor('IN PROGRESS');
      expect(color1).toBe(color2);
    });

    it('should return default gray for unknown statuses', () => {
      expect(resolveStatusColor('UNKNOWN_STATUS')).toBe('#6c757d');
    });

    it('should handle bug statuses', () => {
      expect(resolveStatusColor('Created')).toBe('#6c757d');
      expect(resolveStatusColor('Assigned')).toBe('#4a9eff');
      expect(resolveStatusColor('Fixed')).toBe('#28a745');
    });

    it('should handle bug priorities', () => {
      expect(resolveStatusColor('Application Blocker')).toBe('#dc3545');
      expect(resolveStatusColor('Workflow Improvement')).toBe('#17a2b8');
    });
  });

  describe('getStatusColorPair', () => {
    beforeEach(() => {
      document.documentElement.style.cssText = '';
    });

    it('should return bg gradient and fg contrast color', () => {
      const pair = getStatusColorPair('TO DO');
      expect(pair.bg).toContain('linear-gradient');
      expect(pair.fg).toMatch(/^#(000000|ffffff)$/);
    });

    it('should use black text for medium-bright status colors', () => {
      const pair = getStatusColorPair('TO DO'); // #449bd3 - medium blue
      expect(pair.fg).toBe('#000000');
    });

    it('should use black text for light status colors', () => {
      const pair = getStatusColorPair('IN PROGRESS'); // #cce500 - bright yellow-green
      expect(pair.fg).toBe('#000000');
    });

    it('should respect CSS variable overrides', () => {
      document.documentElement.style.setProperty('--status-todo', '#ffffff');
      const pair = getStatusColorPair('TO DO');
      expect(pair.fg).toBe('#000000'); // white bg → black text
    });
  });
});
