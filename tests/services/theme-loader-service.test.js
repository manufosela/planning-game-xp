import { describe, it, expect, beforeEach } from 'vitest';
import { ThemeLoaderService } from '../../public/js/services/theme-loader-service.js';

describe('ThemeLoaderService branding', () => {
  beforeEach(() => {
    document.body.innerHTML = '<span id="org-name"></span>';
    window.orgName = '';
  });

  it('should apply orgName from branding config when available', () => {
    ThemeLoaderService.applyBranding({
      appName: 'Planning Game XP',
      orgName: 'GENIOVA'
    });
    expect(document.getElementById('org-name').textContent).toBe('GENIOVA');
  });

  it('should prioritize runtime orgName when provided', () => {
    window.orgName = 'RUNTIME_ORG';
    ThemeLoaderService.applyBranding({
      orgName: 'THEME_ORG'
    });
    expect(document.getElementById('org-name').textContent).toBe('RUNTIME_ORG');
  });
});
