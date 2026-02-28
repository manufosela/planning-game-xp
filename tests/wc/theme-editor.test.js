// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// --- Hoisted mocks ---
const {
  mockLoadConfig, mockSaveConfig, mockApplyConfig, mockKebabCase
} = vi.hoisted(() => ({
  mockLoadConfig: vi.fn(),
  mockSaveConfig: vi.fn(),
  mockApplyConfig: vi.fn(),
  mockKebabCase: vi.fn((str) => str.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase())
}));

// Mock Lit
vi.mock('https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm', () => ({
  LitElement: class MockLitElement {
    static get properties() { return {}; }
    static get styles() { return []; }
    constructor() {
      this._requestedUpdates = [];
    }
    requestUpdate() {
      this._requestedUpdates.push(Date.now());
    }
    connectedCallback() {}
    disconnectedCallback() {}
    dispatchEvent() { return true; }
    getAttribute() { return null; }
    setAttribute() {}
  },
  html: (strings, ...values) => ({ strings, values }),
  css: (strings, ...values) => ({ strings, values })
}));

// Mock styles
vi.mock('@/wc/theme-editor-styles.js', () => ({
  ThemeEditorStyles: []
}));

// Mock ThemeLoaderService
vi.mock('@/services/theme-loader-service.js', () => ({
  ThemeLoaderService: {
    loadConfig: mockLoadConfig,
    saveConfig: mockSaveConfig,
    applyConfig: mockApplyConfig,
    kebabCase: mockKebabCase
  }
}));

const SAMPLE_CONFIG = {
  tokens: {
    brand: {
      primary: '#4a9eff',
      primaryHover: '#3a8eef',
      secondary: '#ec3e95',
      secondaryHover: '#d81b60'
    },
    text: {
      onPrimary: '#ffffff',
      onSecondary: '#ffffff'
    },
    status: {
      todo: '#449bd3',
      inProgress: '#cce500',
      toValidate: '#ff6600',
      done: '#d4edda',
      blocked: '#f8d7da',
      expedited: '#ec3e95'
    }
  },
  branding: {
    appName: 'Planning Game XP',
    logo: '/images/icono_PGame.png',
    primaryColor: '#4a9eff'
  },
  features: {
    darkMode: true
  }
};

describe('ThemeEditor', () => {
  let ThemeEditor;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLoadConfig.mockResolvedValue(structuredClone(SAMPLE_CONFIG));
    mockSaveConfig.mockResolvedValue(undefined);

    const module = await import('@/wc/ThemeEditor.js');
    ThemeEditor = module.ThemeEditor;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default state', () => {
      const editor = new ThemeEditor();
      expect(editor._config).toBeNull();
      expect(editor._originalConfig).toBeNull();
      expect(editor._isLoading).toBe(false);
      expect(editor._isSaving).toBe(false);
      expect(editor._isDirty).toBe(false);
      expect(editor._livePreview).toBe(true);
    });
  });

  describe('_loadConfig', () => {
    it('should load config from ThemeLoaderService', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();

      expect(mockLoadConfig).toHaveBeenCalled();
      expect(editor._config).toEqual(SAMPLE_CONFIG);
      expect(editor._originalConfig).toEqual(SAMPLE_CONFIG);
      expect(editor._isLoading).toBe(false);
    });

    it('should use defaults if loadConfig returns null', async () => {
      mockLoadConfig.mockResolvedValue(null);
      const editor = new ThemeEditor();
      await editor._loadConfig();

      expect(editor._config).not.toBeNull();
      expect(editor._config.tokens.brand.primary).toBe('#4a9eff');
      expect(editor._isLoading).toBe(false);
    });

    it('should use defaults on error', async () => {
      mockLoadConfig.mockRejectedValue(new Error('Network error'));
      const editor = new ThemeEditor();
      await editor._loadConfig();

      expect(editor._config).not.toBeNull();
      expect(editor._config.tokens.brand.primary).toBe('#4a9eff');
      expect(editor._isLoading).toBe(false);
    });

    it('should deep clone config to prevent shared references', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();

      editor._config.tokens.brand.primary = '#ffffff';
      expect(editor._originalConfig.tokens.brand.primary).toBe('#4a9eff');
    });
  });

  describe('_handleColorChange', () => {
    it('should update token color value', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();

      editor._handleColorChange('brand', 'primary', '#ff0000');

      expect(editor._config.tokens.brand.primary).toBe('#ff0000');
      expect(editor._isDirty).toBe(true);
    });

    it('should apply live preview via CSS variable', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();
      editor._livePreview = true;

      const setPropertySpy = vi.spyOn(document.documentElement.style, 'setProperty');
      editor._handleColorChange('brand', 'primary', '#ff0000');

      expect(setPropertySpy).toHaveBeenCalledWith('--brand-primary', '#ff0000');
      setPropertySpy.mockRestore();
    });

    it('should not apply live preview when disabled', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();
      editor._livePreview = false;

      const setPropertySpy = vi.spyOn(document.documentElement.style, 'setProperty');
      editor._handleColorChange('brand', 'primary', '#ff0000');

      expect(setPropertySpy).not.toHaveBeenCalled();
      setPropertySpy.mockRestore();
    });

    it('should not crash when config is null', () => {
      const editor = new ThemeEditor();
      editor._config = null;
      expect(() => editor._handleColorChange('brand', 'primary', '#ff0000')).not.toThrow();
    });

    it('should update status colors', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();

      editor._handleColorChange('status', 'todo', '#aabbcc');

      expect(editor._config.tokens.status.todo).toBe('#aabbcc');
      expect(editor._isDirty).toBe(true);
    });
  });

  describe('_handleBrandingChange', () => {
    it('should update branding field', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();

      editor._handleBrandingChange('appName', 'New Name');

      expect(editor._config.branding.appName).toBe('New Name');
      expect(editor._isDirty).toBe(true);
    });

    it('should not crash when config is null', () => {
      const editor = new ThemeEditor();
      editor._config = null;
      expect(() => editor._handleBrandingChange('appName', 'Test')).not.toThrow();
    });
  });

  describe('_handleFeatureChange', () => {
    it('should update feature flag', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();

      editor._handleFeatureChange('darkMode', false);

      expect(editor._config.features.darkMode).toBe(false);
      expect(editor._isDirty).toBe(true);
    });

    it('should not crash when config is null', () => {
      const editor = new ThemeEditor();
      editor._config = null;
      expect(() => editor._handleFeatureChange('darkMode', true)).not.toThrow();
    });
  });

  describe('_handleSave', () => {
    it('should save config via ThemeLoaderService', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();
      editor._isDirty = true;
      editor._handleColorChange('brand', 'primary', '#ff0000');

      await editor._handleSave();

      expect(mockSaveConfig).toHaveBeenCalledWith(editor._config);
      expect(editor._isDirty).toBe(false);
      expect(editor._isSaving).toBe(false);
    });

    it('should update originalConfig after successful save', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();
      editor._handleColorChange('brand', 'primary', '#ff0000');

      await editor._handleSave();

      expect(editor._originalConfig.tokens.brand.primary).toBe('#ff0000');
    });

    it('should apply config after successful save', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();
      editor._isDirty = true;
      editor._handleColorChange('brand', 'primary', '#ff0000');

      await editor._handleSave();

      expect(mockApplyConfig).toHaveBeenCalledWith(editor._config);
    });

    it('should show error notification on save failure', async () => {
      mockSaveConfig.mockRejectedValue(new Error('Save failed'));
      const editor = new ThemeEditor();
      await editor._loadConfig();
      editor._isDirty = true;
      editor._handleColorChange('brand', 'primary', '#ff0000');

      // Mock document.body.append
      const appendSpy = vi.spyOn(document.body, 'append').mockImplementation(() => {});

      await editor._handleSave();

      expect(editor._isDirty).toBe(true);
      expect(appendSpy).toHaveBeenCalled();
      appendSpy.mockRestore();
    });

    it('should not save if validation fails', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();
      editor._config.tokens.brand.primary = 'invalid';
      editor._isDirty = true;

      const appendSpy = vi.spyOn(document.body, 'append').mockImplementation(() => {});
      await editor._handleSave();

      expect(mockSaveConfig).not.toHaveBeenCalled();
      appendSpy.mockRestore();
    });

    it('should dispatch theme-saved event on success', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();
      editor._isDirty = true;
      editor._handleColorChange('brand', 'primary', '#ff0000');

      const dispatchSpy = vi.spyOn(editor, 'dispatchEvent');
      await editor._handleSave();

      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'theme-saved'
        })
      );
    });
  });

  describe('_handleDiscard', () => {
    it('should restore original config', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();
      editor._handleColorChange('brand', 'primary', '#ff0000');

      const appendSpy = vi.spyOn(document.body, 'append').mockImplementation(() => {});
      editor._handleDiscard();

      expect(editor._config.tokens.brand.primary).toBe('#4a9eff');
      expect(editor._isDirty).toBe(false);
      appendSpy.mockRestore();
    });

    it('should call applyConfig when live preview is enabled', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();
      editor._livePreview = true;
      editor._handleColorChange('brand', 'primary', '#ff0000');

      const appendSpy = vi.spyOn(document.body, 'append').mockImplementation(() => {});
      editor._handleDiscard();

      expect(mockApplyConfig).toHaveBeenCalledWith(editor._config);
      appendSpy.mockRestore();
    });
  });

  describe('_handleResetDefaults', () => {
    it('should load defaults from static JSON file', async () => {
      const defaults = structuredClone(SAMPLE_CONFIG);
      defaults.tokens.brand.primary = '#000000';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(defaults)
      });

      const editor = new ThemeEditor();
      await editor._loadConfig();

      const appendSpy = vi.spyOn(document.body, 'append').mockImplementation(() => {});
      await editor._handleResetDefaults();

      expect(editor._config.tokens.brand.primary).toBe('#000000');
      expect(editor._isDirty).toBe(true);
      appendSpy.mockRestore();
    });

    it('should show error when fetch fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

      const editor = new ThemeEditor();
      await editor._loadConfig();

      const appendSpy = vi.spyOn(document.body, 'append').mockImplementation(() => {});
      await editor._handleResetDefaults();

      // Config should remain unchanged
      expect(editor._config.tokens.brand.primary).toBe('#4a9eff');
      appendSpy.mockRestore();
    });
  });

  describe('_validateConfig', () => {
    it('should return true for valid config', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();

      expect(editor._validateConfig()).toBe(true);
    });

    it('should return false for invalid brand color', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();
      editor._config.tokens.brand.primary = 'invalid';

      expect(editor._validateConfig()).toBe(false);
    });

    it('should return false for invalid status color', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();
      editor._config.tokens.status.todo = 'xyz';

      expect(editor._validateConfig()).toBe(false);
    });

    it('should return false when config has no tokens', () => {
      const editor = new ThemeEditor();
      editor._config = { branding: {} };

      expect(editor._validateConfig()).toBe(false);
    });

    it('should accept uppercase hex colors', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();
      editor._config.tokens.brand.primary = '#AABBCC';

      expect(editor._validateConfig()).toBe(true);
    });
  });

  describe('_isValidHex', () => {
    it('should validate correct hex colors', () => {
      const editor = new ThemeEditor();
      expect(editor._isValidHex('#4a9eff')).toBe(true);
      expect(editor._isValidHex('#AABBCC')).toBe(true);
      expect(editor._isValidHex('#000000')).toBe(true);
      expect(editor._isValidHex('#ffffff')).toBe(true);
    });

    it('should reject invalid hex colors', () => {
      const editor = new ThemeEditor();
      expect(editor._isValidHex('invalid')).toBe(false);
      expect(editor._isValidHex('#fff')).toBe(false);
      expect(editor._isValidHex('#gggggg')).toBe(false);
      expect(editor._isValidHex('')).toBe(false);
      expect(editor._isValidHex('4a9eff')).toBe(false);
    });
  });

  describe('render', () => {
    it('should render loading state', () => {
      const editor = new ThemeEditor();
      editor._isLoading = true;

      const result = editor.render();
      expect(result.strings.join('')).toContain('Loading');
    });

    it('should render error when config is null', () => {
      const editor = new ThemeEditor();
      editor._config = null;
      editor._isLoading = false;

      const result = editor.render();
      expect(result.strings.join('')).toContain('Could not load');
    });

    it('should render editor when config is loaded', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();

      const result = editor.render();
      const joined = result.strings.join('');
      expect(joined).toContain('editor-header');
      expect(joined).toContain('color-tabs');
    });

    it('should render dirty badge when changes exist', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();
      editor._isDirty = true;

      const result = editor.render();
      // dirty-badge is inside a conditional interpolation, so check values
      const dirtyBadge = result.values.find(
        (v) => v && typeof v === 'object' && v.strings && v.strings.join('').includes('dirty-badge')
      );
      expect(dirtyBadge).toBeDefined();
    });
  });

  describe('_renderBrandColors', () => {
    it('should render all brand color pickers', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();

      const result = editor._renderBrandColors();
      const joined = result.strings.join('');
      expect(joined).toContain('Brand Colors');
      expect(joined).toContain('color-grid');
    });
  });

  describe('_renderStatusColors', () => {
    it('should render all status color pickers with preview', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();

      const result = editor._renderStatusColors();
      const joined = result.strings.join('');
      expect(joined).toContain('Status Colors');
      expect(joined).toContain('preview-section');
      expect(joined).toContain('preview-status-pills');
    });
  });

  describe('_renderBranding', () => {
    it('should render branding fields', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();

      const result = editor._renderBranding();
      const joined = result.strings.join('');
      expect(joined).toContain('App Branding');
      expect(joined).toContain('Application Name');
      expect(joined).toContain('Logo URL');
    });
  });

  describe('_renderFeatures', () => {
    it('should render feature toggles', async () => {
      const editor = new ThemeEditor();
      await editor._loadConfig();

      const result = editor._renderFeatures();
      const joined = result.strings.join('');
      expect(joined).toContain('Feature Flags');
      expect(joined).toContain('Dark Mode');
    });
  });
});
