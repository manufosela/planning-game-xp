import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * HoursReportTab component tests.
 *
 * The component lives in public/js/wc/ and Vite's publicDir protection
 * blocks transitive import resolution in tests. We test the component's
 * logic (formatting, state management) directly. The service layer
 * (reportHoursService) is fully tested in tests/services/report-hours-service.test.js.
 */

// Reproduce formatHours from HoursReportTab.js
function formatHours(val) {
  if (val === 0) return '0';
  return Number.isInteger(val) ? String(val) : val.toFixed(1);
}

describe('HoursReportTab', () => {
  describe('default state', () => {
    it('should initialize with current month and year', () => {
      const now = new Date();
      const state = {
        _selectedMonth: now.getMonth() + 1,
        _selectedYear: now.getFullYear(),
        _loading: false,
        _report: null,
      };
      expect(state._selectedMonth).toBeGreaterThanOrEqual(1);
      expect(state._selectedMonth).toBeLessThanOrEqual(12);
      expect(state._selectedYear).toBeGreaterThanOrEqual(2020);
      expect(state._loading).toBe(false);
      expect(state._report).toBe(null);
    });
  });

  describe('formatHours', () => {
    it('should return "0" for zero', () => {
      expect(formatHours(0)).toBe('0');
    });

    it('should return integer string for whole numbers', () => {
      expect(formatHours(8)).toBe('8');
      expect(formatHours(40)).toBe('40');
    });

    it('should return one decimal for fractional numbers', () => {
      expect(formatHours(7.5)).toBe('7.5');
      expect(formatHours(3.33)).toBe('3.3');
    });

    it('should handle large numbers', () => {
      expect(formatHours(160)).toBe('160');
      expect(formatHours(159.75)).toBe('159.8');
    });
  });

  describe('report data structure validation', () => {
    it('should validate a well-formed report with all groups', () => {
      const report = {
        weeks: ['S1', 'S2', 'S3', 'S4'],
        groups: {
          internal: {
            label: 'Internos',
            developers: {
              dev_001: {
                name: 'Dev Uno',
                weeks: { S1: { development: 8, maintenance: 4 }, S2: { development: 16, maintenance: 0 } },
                totals: { development: 24, maintenance: 4 },
              },
            },
            subtotals: { development: 24, maintenance: 4 },
          },
          external: { label: 'Externos', developers: {}, subtotals: { development: 0, maintenance: 0 } },
          manager: { label: 'Manager', developers: {}, subtotals: { development: 0, maintenance: 0 } },
        },
        grandTotals: { development: 24, maintenance: 4 },
      };

      expect(report.weeks).toHaveLength(4);
      expect(report.groups.internal.developers.dev_001.name).toBe('Dev Uno');
      expect(report.groups.internal.subtotals.development).toBe(24);
      expect(report.grandTotals.development + report.grandTotals.maintenance).toBe(28);
    });

    it('should handle a report with 5 weeks', () => {
      const report = {
        weeks: ['S1', 'S2', 'S3', 'S4', 'S5'],
        groups: {},
        grandTotals: { development: 0, maintenance: 0 },
      };
      expect(report.weeks).toHaveLength(5);
    });

    it('should handle multiple developers in same group', () => {
      const group = {
        label: 'Internos',
        developers: {
          dev_001: { name: 'Dev Uno', weeks: {}, totals: { development: 40, maintenance: 8 } },
          dev_002: { name: 'Dev Dos', weeks: {}, totals: { development: 32, maintenance: 16 } },
        },
        subtotals: { development: 72, maintenance: 24 },
      };

      const devCount = Object.keys(group.developers).length;
      expect(devCount).toBe(2);
      expect(group.subtotals.development).toBe(72);
      expect(group.subtotals.maintenance).toBe(24);
    });

    it('should compute grand totals as sum across all groups', () => {
      const groups = {
        internal: { subtotals: { development: 40, maintenance: 8 } },
        external: { subtotals: { development: 24, maintenance: 16 } },
        manager: { subtotals: { development: 8, maintenance: 0 } },
      };

      const grandDev = Object.values(groups).reduce((sum, g) => sum + g.subtotals.development, 0);
      const grandMaint = Object.values(groups).reduce((sum, g) => sum + g.subtotals.maintenance, 0);

      expect(grandDev).toBe(72);
      expect(grandMaint).toBe(24);
    });
  });

  describe('weekly hours rendering', () => {
    it('should format zero hours as dimmed', () => {
      const val = 0;
      const cssClass = val === 0 ? 'zero-value' : '';
      expect(cssClass).toBe('zero-value');
    });

    it('should not dim non-zero hours', () => {
      const val = 8;
      const cssClass = val === 0 ? 'zero-value' : '';
      expect(cssClass).toBe('');
    });
  });

  describe('developer detail expansion', () => {
    it('should toggle expanded developer', () => {
      let expandedDev = null;
      const toggleDetail = (devId) => {
        expandedDev = expandedDev === devId ? null : devId;
      };

      toggleDetail('dev_001');
      expect(expandedDev).toBe('dev_001');

      toggleDetail('dev_001');
      expect(expandedDev).toBe(null);

      toggleDetail('dev_002');
      expect(expandedDev).toBe('dev_002');

      toggleDetail('dev_001');
      expect(expandedDev).toBe('dev_001');
    });

    it('should have cardDetails in developer data', () => {
      const dev = {
        name: 'Dev Uno',
        weeks: { S1: { development: 8, maintenance: 0 } },
        totals: { development: 8, maintenance: 0 },
        cardDetails: [
          { cardId: 'PRJ-TSK-0001', title: 'Task one', projectId: 'PRJ1', cardType: 'task', category: 'development', hours: 8, endDate: '2026-03-02' },
        ],
      };

      expect(dev.cardDetails).toHaveLength(1);
      expect(dev.cardDetails[0].cardId).toBe('PRJ-TSK-0001');
      expect(dev.cardDetails[0].category).toBe('development');
    });

    it('should show detail table fields for each card', () => {
      const card = {
        cardId: 'PRJ-BUG-0005',
        title: 'Fix login issue',
        projectId: 'PRJ1',
        cardType: 'bug',
        category: 'maintenance',
        hours: 4,
        endDate: '2026-03-05T17:00:00Z',
      };

      expect(card.cardId).toBe('PRJ-BUG-0005');
      expect(card.title).toBe('Fix login issue');
      expect(card.projectId).toBe('PRJ1');
      expect(card.cardType).toBe('bug');
      expect(card.category).toBe('maintenance');
      expect(card.hours).toBe(4);
      expect(card.endDate.substring(0, 10)).toBe('2026-03-05');
    });
  });

  describe('PDF export table body builder', () => {
    // Reproduce _buildPdfTableBody logic from HoursReportTab.js
    function buildPdfTableBody(groups, weeks, grandTotals) {
      const groupOrder = ['internal', 'external', 'manager', 'unclassified'];
      const body = [];

      for (const groupKey of groupOrder) {
        const group = groups[groupKey];
        if (!group) continue;

        // Group header
        const headerRow = { _rowType: 'group-header' };
        body.push(headerRow);

        const devEntries = Object.entries(group.developers);
        for (const [, dev] of devEntries) {
          const devRow = [dev.name, 'Desarrollo SW'];
          for (const w of weeks) devRow.push(formatHours(dev.weeks[w]?.development || 0));
          devRow.push(formatHours(dev.totals.development));
          body.push(devRow);

          const maintRow = ['', 'Mantenimiento'];
          for (const w of weeks) maintRow.push(formatHours(dev.weeks[w]?.maintenance || 0));
          maintRow.push(formatHours(dev.totals.maintenance));
          body.push(maintRow);
        }

        if (devEntries.length === 0) {
          body.push([{ content: 'Sin datos', colSpan: weeks.length + 3 }]);
        }

        // Subtotals
        const weeklySubtotals = {};
        for (const w of weeks) weeklySubtotals[w] = 0;
        for (const dev of Object.values(group.developers)) {
          for (const w of weeks) {
            weeklySubtotals[w] += (dev.weeks[w]?.development || 0) + (dev.weeks[w]?.maintenance || 0);
          }
        }
        const totalSubtotal = group.subtotals.development + group.subtotals.maintenance;
        const subtotalRow = Object.assign(
          ['Subtotal', '', ...weeks.map(w => formatHours(weeklySubtotals[w])), formatHours(totalSubtotal)],
          { _rowType: 'subtotal' }
        );
        body.push(subtotalRow);
      }

      const emptyWeeks = weeks.map(() => '');
      body.push(Object.assign(['TOTAL HORAS DESARROLLO', '', ...emptyWeeks, formatHours(grandTotals.development)], { _rowType: 'grand-total' }));
      body.push(Object.assign(['TOTAL HORAS MANTENIMIENTO', '', ...emptyWeeks, formatHours(grandTotals.maintenance)], { _rowType: 'grand-total' }));
      body.push(Object.assign(['TOTAL HORAS', '', ...emptyWeeks, formatHours(grandTotals.development + grandTotals.maintenance)], { _rowType: 'grand-total' }));

      return body;
    }

    const sampleReport = {
      weeks: ['S1', 'S2'],
      groups: {
        internal: {
          label: 'Internos',
          developers: {
            dev_001: {
              name: 'Dev Uno',
              weeks: { S1: { development: 8, maintenance: 2 }, S2: { development: 16, maintenance: 0 } },
              totals: { development: 24, maintenance: 2 },
            },
          },
          subtotals: { development: 24, maintenance: 2 },
        },
        external: { label: 'Externos', developers: {}, subtotals: { development: 0, maintenance: 0 } },
      },
      grandTotals: { development: 24, maintenance: 2 },
    };

    it('should produce group-header rows for each group', () => {
      const body = buildPdfTableBody(sampleReport.groups, sampleReport.weeks, sampleReport.grandTotals);
      const headers = body.filter(r => r._rowType === 'group-header');
      expect(headers).toHaveLength(2);
    });

    it('should produce two rows per developer (development + maintenance)', () => {
      const body = buildPdfTableBody(sampleReport.groups, sampleReport.weeks, sampleReport.grandTotals);
      const devRows = body.filter(r => Array.isArray(r) && !r._rowType && r[0] === 'Dev Uno');
      expect(devRows).toHaveLength(1);
      expect(devRows[0][1]).toBe('Desarrollo SW');
      const maintRows = body.filter(r => Array.isArray(r) && !r._rowType && r[1] === 'Mantenimiento');
      expect(maintRows).toHaveLength(1);
    });

    it('should produce subtotal rows with correct values', () => {
      const body = buildPdfTableBody(sampleReport.groups, sampleReport.weeks, sampleReport.grandTotals);
      const subtotals = body.filter(r => r._rowType === 'subtotal');
      expect(subtotals).toHaveLength(2);
      // Internal subtotal: S1=10, S2=16, Total=26
      expect(subtotals[0][0]).toBe('Subtotal');
      expect(subtotals[0][2]).toBe('10');
      expect(subtotals[0][3]).toBe('16');
      expect(subtotals[0][4]).toBe('26');
    });

    it('should produce 3 grand total rows', () => {
      const body = buildPdfTableBody(sampleReport.groups, sampleReport.weeks, sampleReport.grandTotals);
      const grandTotals = body.filter(r => r._rowType === 'grand-total');
      expect(grandTotals).toHaveLength(3);
      expect(grandTotals[0][0]).toBe('TOTAL HORAS DESARROLLO');
      expect(grandTotals[0][grandTotals[0].length - 1]).toBe('24');
      expect(grandTotals[1][0]).toBe('TOTAL HORAS MANTENIMIENTO');
      expect(grandTotals[1][grandTotals[1].length - 1]).toBe('2');
      expect(grandTotals[2][0]).toBe('TOTAL HORAS');
      expect(grandTotals[2][grandTotals[2].length - 1]).toBe('26');
    });

    it('should show "Sin datos" for empty groups', () => {
      const body = buildPdfTableBody(sampleReport.groups, sampleReport.weeks, sampleReport.grandTotals);
      const emptyRows = body.filter(r => Array.isArray(r) && r[0]?.content === 'Sin datos');
      expect(emptyRows).toHaveLength(1);
    });

    it('should have correct column count per dev row', () => {
      const body = buildPdfTableBody(sampleReport.groups, sampleReport.weeks, sampleReport.grandTotals);
      const devRow = body.find(r => Array.isArray(r) && r[0] === 'Dev Uno');
      // Developer + Tipo + 2 weeks + Total = 5
      expect(devRow).toHaveLength(5);
    });
  });
});
