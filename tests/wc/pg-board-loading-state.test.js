// @vitest-environment jsdom
/**
 * PLN-BUG-0122 — a board that is still loading must not claim the project has
 * no columns. render() used to fall straight through to the empty state
 * because the first paint always happens with columns = [], which made a
 * healthy project look broken on a cold URL load.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const litMock = {
  LitElement: class MockLitElement {
    static get properties() { return {}; }
    constructor() {
      this.updateComplete = Promise.resolve(true);
    }
    connectedCallback() {}
    disconnectedCallback() {}
    requestUpdate() {}
    updated() {}
    dispatchEvent() { return true; }
    addEventListener() {}
    removeEventListener() {}
  },
  html: (strings, ...values) => ({ strings, values }),
  css: (strings, ...values) => ({ strings, values }),
  unsafeCSS: (str) => str
};

vi.mock('https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm', () => litMock);
vi.mock('https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm', () => litMock);

vi.mock('../../public/js/wc/pg-board-styles.js', () => ({
  pgBoardStyles: { cssText: '' }
}));

vi.mock('../../public/firebase-config.js', () => ({
  database: {},
  ref: vi.fn(),
  onValue: vi.fn(() => vi.fn())
}));

vi.mock('../../public/js/services/board-config-service.js', () => ({
  loadColumnsForProject: vi.fn(async () => []),
  getEnforceWip: vi.fn(async () => false)
}));

vi.mock('../../public/js/services/board-move-service.js', () => ({
  assignRankAtIndex: vi.fn(),
  compareByRank: vi.fn(() => 0),
  persistCardMove: vi.fn(),
  persistColumnRespread: vi.fn(),
  writeBoardSnapshot: vi.fn(),
  RANK_STEP: 1000
}));

// PgBoard imports this one by absolute URL (/js/utils/...), which Vite cannot
// resolve from /public; mock it under the same specifier the module uses.
vi.mock('/js/utils/board-columns.js', () => ({
  computeWipStatus: vi.fn(() => 'ok'),
  shouldBlockDrop: vi.fn(() => false),
  isExpediteCard: vi.fn(() => false),
  normalizeColumns: vi.fn((cols) => cols || [])
}));

vi.mock('../../public/js/utils/task-card-hydrate.js', () => ({
  hydrateTaskCard: vi.fn((card) => card)
}));

vi.mock('../../public/js/services/firebase-service.js', () => ({
  FirebaseService: {
    getStatusList: vi.fn(async () => []),
    getSprintList: vi.fn(async () => ({}))
  }
}));

const { PgBoard } = await import('../../public/js/wc/PgBoard.js');

/**
 * Flatten a mocked lit template into plain text for assertions.
 * @param {{strings: string[], values: any[]}} template
 * @returns {string}
 */
function textOf(template) {
  return [...(template.strings || []), ...(template.values || []).map(String)].join(' ');
}

describe('PgBoard loading state (PLN-BUG-0122)', () => {
  let board;

  beforeEach(() => {
    board = new PgBoard();
    board.projectId = 'AOR';
    board.columns = [];
    board.cards = [];
    board.loadError = '';
    board.status = '';
  });

  it('should show the loading indicator instead of the empty state while loading', () => {
    board.status = 'Cargando tablero...';

    const rendered = textOf(board.render());

    expect(rendered).toContain('Cargando');
    expect(rendered).not.toContain('no tiene columnas configuradas');
  });

  it('should show the empty state once loading finished with no columns', () => {
    board.status = '';

    const rendered = textOf(board.render());

    expect(rendered).toContain('no tiene columnas configuradas');
  });

  it('should still surface a load error over both states', () => {
    board.status = 'Cargando tablero...';
    board.loadError = 'PERMISSION_DENIED';

    const rendered = textOf(board.render());

    expect(rendered).toContain('PERMISSION_DENIED');
    expect(rendered).not.toContain('no tiene columnas configuradas');
  });

  it('should keep the project picker when there is no project at all', () => {
    board.projectId = '';
    board.status = 'Cargando tablero...';

    const rendered = textOf(board.render());

    expect(rendered).toContain('Aún no hay proyecto seleccionado');
  });
});
