// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock de dependencias externas
vi.mock('https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm', () => ({
  LitElement: class MockLitElement {
    static get properties() { return {}; }
    constructor() {
      this.tagName = 'MOCK-ELEMENT';
    }
    requestUpdate() {}
    updated() {}
    connectedCallback() {}
    disconnectedCallback() {}
    dispatchEvent() { return true; }
    getAttribute() { return null; }
    setAttribute() {}
  },
  html: (strings, ...values) => {
    const serialize = (val) => {
      if (val == null || val === false) return '';
      if (typeof val === 'string' || typeof val === 'number') return String(val);
      if (val && typeof val === 'object' && val.strings) {
        let nested = '';
        val.strings.forEach((s, j) => {
          nested += s;
          if (j < val.values.length) nested += serialize(val.values[j]);
        });
        return nested;
      }
      return '';
    };
    let result = '';
    strings.forEach((str, i) => {
      result += str;
      if (i < values.length) result += serialize(values[i]);
    });
    return { strings, values, __html: result };
  },
  css: (strings, ...values) => ({ strings, values })
}));

vi.mock('https://cdn.jsdelivr.net/npm/date-fns@3.6.0/+esm', () => ({
  format: vi.fn(() => ''),
  parse: vi.fn(() => new Date(NaN)),
  isValid: vi.fn(() => false)
}));

vi.mock('../../public/js/utils/service-communicator.js', () => ({
  ServiceCommunicator: { emit: vi.fn(), on: vi.fn(), off: vi.fn() }
}));

vi.mock('../../public/js/services/entity-directory-service.js', () => ({
  entityDirectoryService: {
    getDeveloper: vi.fn(() => null),
    getStakeholder: vi.fn(() => null),
    getAllDevelopers: vi.fn(() => []),
    getAllStakeholders: vi.fn(() => [])
  }
}));

vi.mock('../../public/js/services/demo-mode-service.js', () => ({
  demoModeService: {
    isDemo: vi.fn(() => false),
    showFeatureDisabled: vi.fn(),
    showLimitReached: vi.fn()
  }
}));

import { BaseCard } from '../../public/js/wc/base-card.js';

describe('Pipeline Badges (_renderPipelineBadges)', () => {
  let card;

  beforeEach(() => {
    card = new BaseCard();
    card.commits = [];
    card.pipelineStatus = null;
  });

  describe('No badges shown', () => {
    it('should return empty string when no pipeline data exists', () => {
      const result = card._renderPipelineBadges();
      expect(result).toBe('');
    });

    it('should return empty string when commits is empty and pipelineStatus is null', () => {
      card.commits = [];
      card.pipelineStatus = null;
      const result = card._renderPipelineBadges();
      expect(result).toBe('');
    });

    it('should return empty string when pipelineStatus exists but has no events', () => {
      card.pipelineStatus = {};
      const result = card._renderPipelineBadges();
      expect(result).toBe('');
    });
  });

  describe('Commit badge (C)', () => {
    it('should show C badge when commits array has items', () => {
      card.commits = [{ hash: 'abc123', message: 'feat: something', date: '2026-02-22', author: 'test' }];
      const result = card._renderPipelineBadges();
      expect(result).not.toBe('');
      expect(result.__html).toContain('pipeline-badge commit');
      expect(result.__html).toContain('>C<');
    });

    it('should include commits count in title', () => {
      card.commits = [
        { hash: 'abc123', message: 'feat: a' },
        { hash: 'def456', message: 'feat: b' }
      ];
      const result = card._renderPipelineBadges();
      expect(result.__html).toContain('Commits: 2');
    });

    it('should not show C badge when commits is not an array', () => {
      card.commits = 'not-an-array';
      const result = card._renderPipelineBadges();
      expect(result).toBe('');
    });

    it('should show C badge when commitsCount > 0 (view mode)', () => {
      card.commits = [];
      card.commitsCount = 3;
      const result = card._renderPipelineBadges();
      expect(result).not.toBe('');
      expect(result.__html).toContain('pipeline-badge commit');
      expect(result.__html).toContain('Commits: 3');
    });

    it('should prefer commits array length over commitsCount', () => {
      card.commits = [{ hash: 'abc123', message: 'feat: a' }];
      card.commitsCount = 5;
      const result = card._renderPipelineBadges();
      expect(result.__html).toContain('Commits: 1');
    });
  });

  describe('PR badge', () => {
    it('should show PR badge when pipelineStatus.prCreated exists', () => {
      card.pipelineStatus = {
        prCreated: { date: '2026-02-22', prUrl: 'https://github.com/org/repo/pull/42', prNumber: 42 }
      };
      const result = card._renderPipelineBadges();
      expect(result).not.toBe('');
      expect(result.__html).toContain('pipeline-badge pr');
      expect(result.__html).toContain('>PR<');
    });

    it('should include PR number in title', () => {
      card.pipelineStatus = {
        prCreated: { prNumber: 42 }
      };
      const result = card._renderPipelineBadges();
      expect(result.__html).toContain('PR #42');
    });

    it('should render as a link with prUrl', () => {
      card.pipelineStatus = {
        prCreated: { prUrl: 'https://github.com/org/repo/pull/42', prNumber: 42 }
      };
      const result = card._renderPipelineBadges();
      // The <a> tag is rendered by Lit template, check for href in values
      const flatValues = result.values.flat(Infinity);
      const hasLink = flatValues.some(v => {
        if (v && typeof v === 'object' && v.strings) {
          return v.strings.some(s => s.includes('pipeline-badge pr'));
        }
        return false;
      });
      expect(hasLink || result.__html.includes('pipeline-badge pr')).toBe(true);
    });
  });

  describe('Merged badge (M)', () => {
    it('should show M badge when pipelineStatus.merged exists', () => {
      card.pipelineStatus = {
        merged: { date: '2026-02-22', mergedBy: 'dev_010' }
      };
      const result = card._renderPipelineBadges();
      expect(result).not.toBe('');
      expect(result.__html).toContain('pipeline-badge merge');
      expect(result.__html).toContain('>M<');
    });

    it('should include merge date in title', () => {
      card.pipelineStatus = {
        merged: { date: '2026-02-22' }
      };
      const result = card._renderPipelineBadges();
      expect(result.__html).toContain('Merged: 2026-02-22');
    });
  });

  describe('Deployed badge (D)', () => {
    it('should show D badge when pipelineStatus.deployed exists', () => {
      card.pipelineStatus = {
        deployed: { date: '2026-02-22', environment: 'production', version: '1.130.0' }
      };
      const result = card._renderPipelineBadges();
      expect(result).not.toBe('');
      expect(result.__html).toContain('pipeline-badge deploy');
      expect(result.__html).toContain('>D<');
    });

    it('should include environment and version in title', () => {
      card.pipelineStatus = {
        deployed: { environment: 'production', version: '1.130.0' }
      };
      const result = card._renderPipelineBadges();
      expect(result.__html).toContain('production');
      expect(result.__html).toContain('1.130.0');
    });
  });

  describe('Multiple badges', () => {
    it('should show all badges when full pipeline is complete', () => {
      card.commits = [{ hash: 'abc123', message: 'feat: something' }];
      card.pipelineStatus = {
        prCreated: { date: '2026-02-22', prUrl: 'https://github.com/org/repo/pull/42', prNumber: 42 },
        merged: { date: '2026-02-22', mergedBy: 'dev_010' },
        deployed: { date: '2026-02-22', environment: 'production' }
      };
      const result = card._renderPipelineBadges();
      expect(result.__html).toContain('pipeline-badge commit');
      expect(result.__html).toContain('pipeline-badge pr');
      expect(result.__html).toContain('pipeline-badge merge');
      expect(result.__html).toContain('pipeline-badge deploy');
    });

    it('should show only C and PR badges for partial pipeline', () => {
      card.commits = [{ hash: 'abc123' }];
      card.pipelineStatus = {
        prCreated: { prNumber: 10 }
      };
      const result = card._renderPipelineBadges();
      expect(result.__html).toContain('pipeline-badge commit');
      expect(result.__html).toContain('pipeline-badge pr');
      expect(result.__html).not.toContain('pipeline-badge merge');
      expect(result.__html).not.toContain('pipeline-badge deploy');
    });
  });
});

describe('Pipeline field schemas', () => {
  it('should include pipelineStatus in TASK_SCHEMA.PERSISTENT_FIELDS', async () => {
    const { TASK_SCHEMA } = await import('../../public/js/schemas/card-field-schemas.js');
    expect(TASK_SCHEMA.PERSISTENT_FIELDS).toContain('pipelineStatus');
  });

  it('should include pipelineStatus in BUG_SCHEMA.PERSISTENT_FIELDS', async () => {
    const { BUG_SCHEMA } = await import('../../public/js/schemas/card-field-schemas.js');
    expect(BUG_SCHEMA.PERSISTENT_FIELDS).toContain('pipelineStatus');
  });
});

describe('BaseCard pipelineStatus property', () => {
  it('should have pipelineStatus in static properties', () => {
    const props = BaseCard.properties;
    expect(props.pipelineStatus).toBeDefined();
    expect(props.pipelineStatus.type).toBe(Object);
  });

  it('should initialize pipelineStatus as null', () => {
    const card = new BaseCard();
    expect(card.pipelineStatus).toBeNull();
  });
});
