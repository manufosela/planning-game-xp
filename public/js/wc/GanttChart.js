import { LitElement, html } from 'https://cdn.jsdelivr.net/npm/lit@3.1.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { GanttChartStyles } from './gantt-chart-styles.js';
import { entityDirectoryService } from '../services/entity-directory-service.js';

export class GanttChart extends LitElement {
  static get properties() {
    return {
      project: { type: String, reflect: true },
      colorBar: { type: Array },
      year: { type: Number, reflect: true },
    };
  }

  static get styles() {
    return GanttChartStyles;
  }

  constructor() {
    super();
    /**
     * Task data has the following structure:
      {
        "sprint": "sprint id",
        "name": "Task Description",
        "plannedEnd": "yyyy-mm-dd",
        "plannedStart": "yyyy-mm-dd",
        "dev": "developer id"
      }
     */
    this.tasks = [];
    this.colorBar = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#6366f1', '#8b5cf6', '#f59e0b'];
    this.year = null; // If set, fixes the time scale to January 1 - December 31 of this year
  }

  async connectedCallback() {
    super.connectedCallback();
    if (this.project) {
      await this.fetchData();
    }
  }

  async fetchData() {
    if (!this.project) {
      console.warn('No project specified for GanttChart');
      return;
    }

    try {
const { database, ref, onValue } = await import('../../firebase-config.js');

      // Get project data from Firebase
      const pathTaskCards = `/cards/${this.project}/TASKS_${this.project}`;
      const cardsRef = ref(database, pathTaskCards);
      
      onValue(cardsRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          const tasks = Object.entries(data).map(([id, task]) => ({
            id,
            name: task.title,
            plannedStart: task.startDate,
            plannedEnd: task.endDate,
            realStart: task.startDate,
            realEnd: task.endDate,
            dev: this._resolveDeveloperDisplay(task.developer) || 'Unassigned',
            isEpic: task.cardType === 'epic-card',
            ...task
          }));
this.setTaskData(tasks);
        } else {
          console.warn(`No task data found for project ${this.project}`);
          this.setTaskData([]);
        }
      });
      
    } catch (error) {
      console.error('Error fetching Gantt data:', error);
      this.setTaskData([]);
    }
  }

  setTaskData(data) {
    this.tasks = data;
    // Verificar que el componente esté listo antes de renderizar
    if (this.shadowRoot?.querySelector('.chart-container')) {
      this.renderChart();
    } else {
      // Si no está listo, esperar a que se conecte
      this.requestUpdate().then(() => {
        if (this.shadowRoot?.querySelector('.chart-container')) {
          this.renderChart();
        }
      });
    }
  }

  updated(changedProperties) {
    if (changedProperties.has('project')) {
      this.fetchData();
    }
    if (this.tasks.length > 0 && this.shadowRoot) {
      this.renderChart();
    }
  }

  _hexToRGBA(hex, alpha) {
    const bigint = parseInt(hex.replace('#', ''), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  renderChart() {
    // Verificar que el shadowRoot y el contenedor existan
    if (!this.shadowRoot) {
return;
    }

    const container = this.shadowRoot.querySelector('.chart-container');
    if (!container) {
return;
    }

    const margin = { top: 40, right: 40, bottom: 40, left: 180 };
    // 1. Función para validar si una tarea tiene fechas válidas
    const hasValidDates = (task) => {
      if (!task.plannedStart || !task.plannedEnd) {
        return false;
      }
      
      const startStr = task.plannedStart.trim();
      const endStr = task.plannedEnd.trim();
      
      // Verificar que las fechas no estén vacías o sean valores inválidos
      if (startStr === '' || endStr === '' || 
          startStr === '0000-00-00' || endStr === '0000-00-00' ||
          startStr === 'null' || endStr === 'null' ||
          startStr === 'undefined' || endStr === 'undefined') {
        return false;
      }
      
      // Verificar que las fechas sean válidas
      const startDate = new Date(startStr);
      const endDate = new Date(endStr);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return false;
      }
      
      // Verificar que la fecha de fin sea posterior a la de inicio
      if (endDate <= startDate) {
        return false;
      }
      
      // Filtrar tareas en estados que no deberían mostrarse en el Gantt
      const excludedStatuses = ['To Do', 'TODO', 'Backlog', 'New', 'Open'];
      if (task.status && excludedStatuses.includes(task.status)) {
        return false;
      }
      
      return true;
    };

    // 2. Expandir tasks y subtasks en una lista plana para el render, filtrando tareas sin fechas válidas
    const flatTasks = [];
    let totalTasks = 0;
    let filteredTasks = 0;
    
    this.tasks.forEach((epic, i) => {
      totalTasks++;
      // Solo agregar épicas que tengan fechas válidas
      if (hasValidDates(epic)) {
        flatTasks.push({ ...epic, isEpic: true, flatIndex: flatTasks.length });
      } else {
        filteredTasks++;
      }
      
      // Solo agregar subtareas que tengan fechas válidas
      if (Array.isArray(epic.subtasks)) {
        epic.subtasks.forEach((sub, j) => {
          totalTasks++;
          if (hasValidDates(sub)) {
            flatTasks.push({ ...sub, parentEpic: epic, isEpic: false, flatIndex: flatTasks.length });
          } else {
            filteredTasks++;
          }
        });
      }
    });
const width = 1000 - margin.left - margin.right;
    const height = flatTasks.length * 40;

    const todayStr = new Date().toISOString().split('T')[0];
    const showTooltip = (event, task, isEnCurso = false) => {
      tooltip.transition()
        .duration(200)
        .style('opacity', .9);
      let planificado = '';
      if (isEnCurso) {
        planificado = `Planificado: ${task.plannedStart}`;
      } else {
        planificado = `Planificado: ${task.plannedStart} - ${task.plannedEnd}`;
      }
      tooltip.html(`
        <strong>${task.name}</strong><br/>
        ${planificado}
        ${task.realStart ? `<br/>Real: ${task.realStart}${task.realEnd ? ` - ${task.realEnd}` : ''}` : ''}<br/>
        Team: ${this.project || 'Team'}
      `)
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 28) + 'px');
    };

    const closeTooltip = () => {
      tooltip.transition()
        .duration(500)
        .style('opacity', 0);
    }

    // Clear previous chart
    container.innerHTML = '';

    // Create SVG
    const svg = d3.select(container)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create tooltip
    const tooltip = d3.select(container)
      .append('div')
      .attr('class', 'tooltip')
      .style('opacity', 0);

    // Procesar fechas para el dominio del eje X
    let minDate, maxDate;

    if (this.year) {
      // If year is specified, use fixed range January 1 - December 31
      minDate = new Date(this.year, 0, 1); // January 1
      maxDate = new Date(this.year, 11, 31); // December 31
    } else {
      // Otherwise, calculate from task dates
      const dates = flatTasks.flatMap(task => [
        new Date(task.plannedStart),
        new Date(task.plannedEnd)
      ]).filter(d => d && !isNaN(d.getTime()));

      // Verificar que tengamos fechas válidas
      if (dates.length === 0) {
        console.warn('No hay fechas válidas para mostrar en el Gantt chart');
        container.innerHTML = '<p style="padding: 20px; text-align: center; color: #666;">No hay tareas con fechas válidas para mostrar en el gráfico Gantt.</p>';
        return;
      }

      minDate = d3.min(dates);
      maxDate = d3.max(dates);
    }

    // Show message if no tasks but year is set
    if (flatTasks.length === 0 && this.year) {
      container.innerHTML = `<p style="padding: 20px; text-align: center; color: #666;">No hay épicas con actividad en ${this.year}.</p>`;
      return;
    }

    const timeScale = d3.scaleTime()
      .domain([minDate, maxDate])
      .range([0, width]);

    // Eje X
    const xAxis = d3.axisTop(timeScale)
      .ticks(d3.timeMonth)
      .tickFormat(d3.timeFormat('%B %Y'));

    svg.append('g')
      .attr('class', 'x-axis')
      .call(xAxis);

    // Filter tasks that are within the visible year range
    const visibleTasks = flatTasks.filter(task => {
      let startDate = new Date(task.plannedStart);
      let endDate = new Date(task.plannedEnd);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return false;
      }

      if (this.year) {
        if (endDate < minDate) return false;
        if (startDate > maxDate) return false;
      }

      return true;
    });

    // Recalculate height based on visible tasks
    const actualHeight = visibleTasks.length * 22 + 20;

    // Update SVG height
    d3.select(container).select('svg')
      .attr('height', actualHeight + margin.top + margin.bottom);

    // Dibujar barras
    visibleTasks.forEach((task, i) => {
      let startDate = new Date(task.plannedStart);
      let endDate = new Date(task.plannedEnd);

      // Clamp dates to the visible year range if year is specified
      if (this.year) {
        if (startDate < minDate) startDate = minDate;
        if (endDate > maxDate) endDate = maxDate;
      }

      // Detectar si la tarea está en curso (sin fecha de fin real, solo asignada como hoy)
      const isEnCurso = !task.realEnd && task.plannedEnd === todayStr && !task.isEpic;
      const brandPrimary = getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim() || '#4a9eff';
      const brandSecondary = getComputedStyle(document.documentElement).getPropertyValue('--brand-secondary').trim() || '#ec3e95';
      const barColor = task.isEpic ? brandPrimary : (isEnCurso ? brandSecondary : '#8b5cf6');

      const barWidth = timeScale(endDate) - timeScale(startDate);

      // Solo dibujar si la barra tiene un ancho válido
      if (barWidth > 0) {
        svg.append('rect')
          .attr('class', task.isEpic ? 'task-bar epic' : 'task-bar subtask')
          .attr('x', timeScale(startDate))
          .attr('y', i * 22 + 10)
          .attr('width', barWidth)
          .attr('height', 16)
          .attr('fill', barColor)
          .attr('rx', 4)
          .on('mouseover', (event) => { showTooltip(event, task, isEnCurso); })
          .on('mouseout', closeTooltip);
      }

      // Mostrar etiqueta solo para épicas, truncando si es necesario
      if (task.isEpic) {
        const maxLen = 20;
        let label = task.name || '';
        if (label.length > maxLen) label = label.slice(0, maxLen - 3) + '...';
        svg.append('text')
          .attr('x', -10)
          .attr('y', i * 22 + 22)
          .attr('text-anchor', 'end')
          .attr('font-weight', 'bold')
          .attr('font-size', '13px')
          .text(label)
          .append('title').text(task.name || '');
      }
    });

    // Current date line - only show if today is within the visible range
    const today = new Date();
    if (today >= minDate && today <= maxDate) {
      svg.append('line')
        .attr('class', 'current-date-line')
        .attr('x1', timeScale(today))
        .attr('y1', 0)
        .attr('x2', timeScale(today))
        .attr('y2', actualHeight);
    }
  }

  render() {
    return html`
      <div class="chart-container"></div>
    `;
  }

  /**
   * Resuelve un ID de developer (dev_XXX) a nombre legible
   * @param {string} value - ID o email del developer
   * @returns {string} Nombre legible
   */
  _resolveDeveloperDisplay(value) {
    if (!value) return '';

    // Intentar resolver como entity ID (dev_XXX)
    if (typeof value === 'string' && value.startsWith('dev_')) {
      const name = entityDirectoryService.getDeveloperDisplayName(value);
      if (name) return name;
    }

    // Si es un email, extraer nombre
    if (typeof value === 'string' && value.includes('@')) {
      return value.split('@')[0];
    }

    return value;
  }
}

customElements.define('gantt-chart', GanttChart);
