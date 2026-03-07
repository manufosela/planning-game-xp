import { LitElement, html, nothing } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';
import { HoursReportTabStyles } from './hours-report-tab-styles.js';
import { reportHoursService } from '../services/report-hours-service.js';

class HoursReportTab extends LitElement {
  static get properties() {
    return {
      _selectedMonth: { type: Number, state: true },
      _selectedYear: { type: Number, state: true },
      _loading: { type: Boolean, state: true },
      _report: { type: Object, state: true },
      _expandedDev: { type: String, state: true },
    };
  }

  static get styles() {
    return [HoursReportTabStyles];
  }

  constructor() {
    super();
    const now = new Date();
    this._selectedMonth = now.getMonth() + 1;
    this._selectedYear = now.getFullYear();
    this._loading = false;
    this._report = null;
    this._expandedDev = null;
  }

  render() {
    return html`
      <div class="hours-report-container">
        ${this._renderFilters()}
        ${this._loading ? this._renderLoading() : nothing}
        ${this._report && !this._loading ? this._renderTable() : nothing}
        ${!this._report && !this._loading ? this._renderEmpty() : nothing}
      </div>
    `;
  }

  _renderFilters() {
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

    return html`
      <div class="filters-row">
        <div class="filter-group">
          <label>Mes</label>
          <select class="filter-input" .value=${String(this._selectedMonth)} @change=${this._onMonthChange}>
            ${months.map((name, i) => html`
              <option value=${i + 1} ?selected=${i + 1 === this._selectedMonth}>${name}</option>
            `)}
          </select>
        </div>
        <div class="filter-group">
          <label>Año</label>
          <select class="filter-input" .value=${String(this._selectedYear)} @change=${this._onYearChange}>
            ${years.map(y => html`
              <option value=${y} ?selected=${y === this._selectedYear}>${y}</option>
            `)}
          </select>
        </div>
        <button class="btn-generate" @click=${this._generateReport} ?disabled=${this._loading}>
          Generar Informe
        </button>
        ${this._report && !this._loading ? html`
          <button class="btn-export" @click=${this._exportPDF}>
            Exportar PDF
          </button>
        ` : nothing}
      </div>
    `;
  }

  _renderLoading() {
    return html`
      <div class="loading-container">
        <div class="spinner"></div>
        <span>Generando informe...</span>
      </div>
    `;
  }

  _renderEmpty() {
    return html`
      <div class="empty-state">
        <p>Selecciona un mes y pulsa "Generar Informe" para ver el desglose de horas.</p>
      </div>
    `;
  }

  _renderTable() {
    const { weeks, groups, grandTotals } = this._report;

    return html`
      <div style="overflow-x: auto;">
        <table class="report-table">
          <thead>
            <tr>
              <th>Developer</th>
              <th>Tipo</th>
              ${weeks.map(w => html`<th>${w}</th>`)}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${this._renderGroups(groups, weeks)}
            ${this._renderGrandTotals(grandTotals, weeks)}
          </tbody>
        </table>
      </div>
    `;
  }

  _renderGroups(groups, weeks) {
    const groupOrder = ['internal', 'external', 'manager', 'unclassified'];
    const rendered = [];

    for (const groupKey of groupOrder) {
      const group = groups[groupKey];
      if (!group) continue;

      const devEntries = Object.entries(group.developers);
      if (devEntries.length === 0 && groupKey !== 'unclassified') {
        // Show group even if empty (except unclassified)
      }

      // Group header
      rendered.push(html`
        <tr class="group-header">
          <td colspan=${weeks.length + 3}>${group.label}</td>
        </tr>
      `);

      // Developer rows
      for (const [devId, dev] of devEntries) {
        rendered.push(this._renderDevRow(dev, devId, weeks, 'development', 'Desarrollo SW'));
        rendered.push(this._renderDevRow(dev, devId, weeks, 'maintenance', 'Mantenimiento'));
        if (this._expandedDev === devId && dev.cardDetails?.length > 0) {
          rendered.push(this._renderDetailRows(dev, weeks));
        }
      }

      if (devEntries.length === 0) {
        rendered.push(html`
          <tr>
            <td colspan=${weeks.length + 3} style="text-align:center; color: var(--text-muted, #999); font-style: italic;">
              Sin datos
            </td>
          </tr>
        `);
      }

      // Subtotals
      rendered.push(this._renderSubtotalRow(group, weeks, 'Subtotal'));
    }

    return rendered;
  }

  _renderDevRow(dev, devId, weeks, category, categoryLabel) {
    const isFirst = category === 'development';
    const rowClass = category === 'development' ? 'row-development' : 'row-maintenance';
    const isExpanded = this._expandedDev === devId;
    const hasDetails = dev.cardDetails?.length > 0;

    return html`
      <tr class=${rowClass}>
        <td>${isFirst
          ? html`<span class="dev-name ${hasDetails ? 'dev-name--clickable' : ''}"
                       @click=${hasDetails ? () => this._toggleDetail(devId) : null}>
                  ${hasDetails ? html`<span class="expand-icon">${isExpanded ? '▼' : '▶'}</span>` : nothing}
                  ${dev.name}
                </span>`
          : ''}</td>
        <td>${categoryLabel}</td>
        ${weeks.map(w => {
          const val = dev.weeks[w]?.[category] || 0;
          return html`<td class=${val === 0 ? 'zero-value' : ''}>${this._formatHours(val)}</td>`;
        })}
        <td class=${dev.totals[category] === 0 ? 'zero-value' : ''}>${this._formatHours(dev.totals[category])}</td>
      </tr>
    `;
  }

  _renderSubtotalRow(group, weeks, label) {
    // Calculate weekly subtotals for this group
    const weeklySubtotals = {};
    for (const w of weeks) {
      weeklySubtotals[w] = 0;
    }
    for (const dev of Object.values(group.developers)) {
      for (const w of weeks) {
        weeklySubtotals[w] += (dev.weeks[w]?.development || 0) + (dev.weeks[w]?.maintenance || 0);
      }
    }
    const totalSubtotal = group.subtotals.development + group.subtotals.maintenance;

    return html`
      <tr class="subtotal-row">
        <td>${label}</td>
        <td></td>
        ${weeks.map(w => html`<td>${this._formatHours(weeklySubtotals[w])}</td>`)}
        <td>${this._formatHours(totalSubtotal)}</td>
      </tr>
    `;
  }

  _renderGrandTotals(grandTotals, weeks) {
    return html`
      <tr class="grand-total-row">
        <td>TOTAL HORAS DESARROLLO</td>
        <td></td>
        ${weeks.map(() => html`<td></td>`)}
        <td>${this._formatHours(grandTotals.development)}</td>
      </tr>
      <tr class="grand-total-row">
        <td>TOTAL HORAS MANTENIMIENTO</td>
        <td></td>
        ${weeks.map(() => html`<td></td>`)}
        <td>${this._formatHours(grandTotals.maintenance)}</td>
      </tr>
      <tr class="grand-total-row">
        <td>TOTAL HORAS</td>
        <td></td>
        ${weeks.map(() => html`<td></td>`)}
        <td>${this._formatHours(grandTotals.development + grandTotals.maintenance)}</td>
      </tr>
    `;
  }

  _renderDetailRows(dev, weeks) {
    const colSpan = weeks.length + 3;
    return html`
      <tr class="detail-row">
        <td colspan=${colSpan}>
          <div class="detail-container">
            <table class="detail-table">
              <thead>
                <tr>
                  <th>Card ID</th>
                  <th>Titulo</th>
                  <th>Proyecto</th>
                  <th>Tipo</th>
                  <th>Categoria</th>
                  <th>Horas</th>
                  <th>Fin</th>
                </tr>
              </thead>
              <tbody>
                ${dev.cardDetails.map(card => html`
                  <tr class="detail-item detail-item--${card.category}">
                    <td class="detail-card-id">${card.cardId}</td>
                    <td class="detail-title">${card.title}</td>
                    <td>${card.projectId}</td>
                    <td>${card.cardType === 'bug' ? 'Bug' : 'Task'}</td>
                    <td>${card.category === 'development' ? 'Desarrollo' : 'Mantenimiento'}</td>
                    <td>${this._formatHours(card.hours)}</td>
                    <td>${card.endDate ? card.endDate.substring(0, 10) : ''}</td>
                  </tr>
                `)}
              </tbody>
            </table>
          </div>
        </td>
      </tr>
    `;
  }

  async _exportPDF() {
    const { weeks, groups, grandTotals } = this._report;
    const months = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    const monthName = months[this._selectedMonth - 1];
    const title = `Informe de Horas - ${monthName} ${this._selectedYear}`;

    const { jsPDF } = await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm');
    const autoTableModule = await import('https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/+esm');
    if (autoTableModule.default) autoTableModule.default(jsPDF);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(9);
    doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, 14, 21);

    const head = [['Developer', 'Tipo', ...weeks, 'Total']];
    const body = this._buildPdfTableBody(groups, weeks, grandTotals);

    doc.autoTable({
      head,
      body,
      startY: 26,
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [74, 144, 217], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 28 },
      },
      didParseCell: (data) => {
        if (data.row.raw && data.row.raw._rowType === 'group-header') {
          data.cell.styles.fillColor = [74, 144, 217];
          data.cell.styles.textColor = 255;
          data.cell.styles.fontStyle = 'bold';
        } else if (data.row.raw && data.row.raw._rowType === 'subtotal') {
          data.cell.styles.fillColor = [230, 230, 230];
          data.cell.styles.fontStyle = 'bold';
        } else if (data.row.raw && data.row.raw._rowType === 'grand-total') {
          data.cell.styles.fillColor = [200, 200, 200];
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = 8;
        }
      },
    });

    doc.save(`informe-horas-${this._selectedYear}-${String(this._selectedMonth).padStart(2, '0')}.pdf`);
  }

  _buildPdfTableBody(groups, weeks, grandTotals) {
    const groupOrder = ['internal', 'external', 'manager', 'unclassified'];
    const body = [];

    for (const groupKey of groupOrder) {
      const group = groups[groupKey];
      if (!group) continue;

      const headerRow = { _rowType: 'group-header' };
      const headerCells = [{ content: group.label, colSpan: weeks.length + 3, styles: { halign: 'left' } }];
      Object.assign(headerRow, ...headerCells.map((c, i) => ({ [i]: c })));
      body.push(headerRow);

      const devEntries = Object.entries(group.developers);
      for (const [, dev] of devEntries) {
        // Development row
        const devRow = [dev.name, 'Desarrollo SW'];
        for (const w of weeks) devRow.push(this._formatHours(dev.weeks[w]?.development || 0));
        devRow.push(this._formatHours(dev.totals.development));
        body.push(devRow);

        // Maintenance row
        const maintRow = ['', 'Mantenimiento'];
        for (const w of weeks) maintRow.push(this._formatHours(dev.weeks[w]?.maintenance || 0));
        maintRow.push(this._formatHours(dev.totals.maintenance));
        body.push(maintRow);
      }

      if (devEntries.length === 0) {
        body.push([{ content: 'Sin datos', colSpan: weeks.length + 3, styles: { halign: 'center', fontStyle: 'italic' } }]);
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
      const subtotalRow = Object.assign(['Subtotal', '', ...weeks.map(w => this._formatHours(weeklySubtotals[w])), this._formatHours(totalSubtotal)], { _rowType: 'subtotal' });
      body.push(subtotalRow);
    }

    // Grand totals
    const emptyWeeks = weeks.map(() => '');
    body.push(Object.assign(['TOTAL HORAS DESARROLLO', '', ...emptyWeeks, this._formatHours(grandTotals.development)], { _rowType: 'grand-total' }));
    body.push(Object.assign(['TOTAL HORAS MANTENIMIENTO', '', ...emptyWeeks, this._formatHours(grandTotals.maintenance)], { _rowType: 'grand-total' }));
    body.push(Object.assign(['TOTAL HORAS', '', ...emptyWeeks, this._formatHours(grandTotals.development + grandTotals.maintenance)], { _rowType: 'grand-total' }));

    return body;
  }

  _toggleDetail(devId) {
    this._expandedDev = this._expandedDev === devId ? null : devId;
  }

  _formatHours(val) {
    if (val === 0) return '0';
    return Number.isInteger(val) ? String(val) : val.toFixed(1);
  }

  _onMonthChange(e) {
    this._selectedMonth = Number(e.target.value);
  }

  _onYearChange(e) {
    this._selectedYear = Number(e.target.value);
  }

  async _generateReport() {
    this._loading = true;
    this._report = null;
    try {
      this._report = await reportHoursService.calculateMonthlyReport(this._selectedYear, this._selectedMonth);
    } catch (err) {
      console.error('Error generating hours report:', err);
      this._report = null;
    } finally {
      this._loading = false;
    }
  }
}

customElements.define('hours-report-tab', HoursReportTab);
