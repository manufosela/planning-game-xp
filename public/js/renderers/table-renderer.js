import { UIUtils } from '../utils/ui-utils.js';
import { developerDirectory } from '../config/developer-directory.js';
import { APP_CONSTANTS } from '../constants/app-constants.js';
import { decodeEmailFromFirebase } from '../utils/email-sanitizer.js';
import { userDirectoryService } from '../services/user-directory-service.js';
import { entityDirectoryService } from '../services/entity-directory-service.js';
import { getPriorityDisplay } from '../utils/priority-utils.js';

/**
 * Renderer para la vista tipo tabla de tareas.
 * Muestra las tareas en una tabla, solo lectura, con botón de editar.
 */
export class TableRenderer {
  constructor() {
    this.filters = {};
    this.sortField = 'Prioridad';
    this.sortDirection = 'asc';
    this.isLoading = true; // Estado de carga inicial
  }

  /**
   * Verifica si el año seleccionado es de solo lectura (año pasado y no es superadmin)
   * @returns {boolean}
   */
  _isYearReadOnly() {
    try {
      const savedYear = localStorage.getItem('selectedYear');
      const selectedYear = savedYear ? Number(savedYear) : new Date().getFullYear();
      const currentYear = new Date().getFullYear();
      const isPastYear = selectedYear < currentYear;

      if (!isPastYear) {
        return false; // El año actual siempre es editable
      }

      // Verificar si es superadmin
      const superAdminEmail = (window.superAdminEmail || '').toString().trim().toLowerCase();
      const currentUserEmail = (document.body?.dataset?.userEmail || '').toString().trim().toLowerCase();
      const isSuperAdmin = superAdminEmail && currentUserEmail === superAdminEmail;

      // Año pasado + no superadmin = solo lectura
      return !isSuperAdmin;
    } catch (error) {
      return false;
    }
  }

  /**
   * Marca que los datos han terminado de cargar
   */
  setLoaded() {
    this.isLoading = false;
  }

  /**
   * Marca que se está cargando
   */
  setLoading() {
    this.isLoading = true;
  }

  /**
   * Renderiza el skeleton de carga de la tabla
   */
  renderLoadingSkeleton(container) {
    container.innerHTML = '';
    container.classList.remove('cards-container');
    container.classList.add('table-view');

    const skeletonWrapper = UIUtils.createElement('div', {
      className: 'table-skeleton'
    });

    // Header skeleton
    const headerSkeleton = UIUtils.createElement('div', {
      className: 'skeleton-header',
      style: {
        display: 'flex',
        gap: '1rem',
        padding: '1rem',
        background: 'var(--bg-secondary, #f8f9fa)',
        borderRadius: '8px 8px 0 0',
        marginTop: '1rem'
      }
    });

    // 12 columnas: ID, Notas, Título, Estado, Prioridad, Sprint, Developer, Validator, Épica, Fecha inicio, Fecha fin, Acciones
    const headerWidths = ['60px', '40px', '200px', '100px', '80px', '100px', '120px', '120px', '100px', '90px', '90px', '80px'];
    headerWidths.forEach(width => {
      const cell = UIUtils.createElement('div', {
        className: 'skeleton-cell',
        style: {
          width,
          height: '20px',
          background: 'linear-gradient(90deg, var(--border-default, #e0e0e0) 25%, var(--bg-secondary, #f0f0f0) 50%, var(--border-default, #e0e0e0) 75%)',
          backgroundSize: '200% 100%',
          animation: 'skeleton-loading 1.5s infinite',
          borderRadius: '4px'
        }
      });
      headerSkeleton.appendChild(cell);
    });
    skeletonWrapper.appendChild(headerSkeleton);

    // Rows skeleton (5 filas)
    for (let i = 0; i < 5; i++) {
      const rowSkeleton = UIUtils.createElement('div', {
        className: 'skeleton-row',
        style: {
          display: 'flex',
          gap: '1rem',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--border-subtle, #eee)'
        }
      });

      headerWidths.forEach(width => {
        const cell = UIUtils.createElement('div', {
          className: 'skeleton-cell',
          style: {
            width,
            height: '16px',
            background: 'linear-gradient(90deg, var(--border-default, #e8e8e8) 25%, var(--bg-secondary, #f5f5f5) 50%, var(--border-default, #e8e8e8) 75%)',
            backgroundSize: '200% 100%',
            animation: 'skeleton-loading 1.5s infinite',
            animationDelay: `${i * 0.1}s`,
            borderRadius: '4px'
          }
        });
        rowSkeleton.appendChild(cell);
      });
      skeletonWrapper.appendChild(rowSkeleton);
    }

    // Añadir estilos de animación si no existen
    if (!document.getElementById('skeleton-styles')) {
      const style = document.createElement('style');
      style.id = 'skeleton-styles';
      style.textContent = `
        @keyframes skeleton-loading {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .table-skeleton {
          border: 1px solid #dee2e6;
          border-radius: 8px;
          overflow: hidden;
        }
      `;
      document.head.appendChild(style);
    }

    container.appendChild(skeletonWrapper);
  }

  /**
   * Permite establecer los filtros activos.
   * @param {Object} filters - Filtros a aplicar
   */
  setFilters(filters) {
    this.filters = filters || {};
  }

  /**
   * Limpia todos los filtros activos
   */
  clearFilters() {
    this.filters = {};
  }

  setSort(field) {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }
  }

  getSortIcon(field) {
    if (this.sortField !== field) return '';
    return this.sortDirection === 'asc' ? ' ▲' : ' ▼';
  }

  getSortableIcon(field) {
    // Devuelve el icono ⇅ si la columna es ordenable
    if (["ID", "Título", "Fecha registro", "Fecha inicio", "Fecha fin"].includes(field)) {
      return ' ⇅';
    }
    return '';
  }

  sortRows(rows) {
    const field = this.sortField;
    const dir = this.sortDirection === 'asc' ? 1 : -1;
    const getValue = (card, field) => {
      switch (field) {
        case 'ID': return card.cardId || card.id || '';
        case 'Proyecto': return card.projectId || '';
        case 'Título': return card.title || '';
        case 'Estado': return card.status || '';
        case 'Prioridad':
          // Usar valor calculado si es posible
          if (!card.businessPoints || !card.devPoints || card.businessPoints === 0 || card.devPoints === 0) return 0;
          return (card.businessPoints / card.devPoints) * 100;
        case 'Sprint':
          if (card.sprint && globalThis.globalSprintList?.[card.sprint]) {
            return globalThis.globalSprintList[card.sprint].title || '';
          }
          return '';
        case 'Developer': return this.getDeveloperDisplay(card.developer);
        case 'Validator': return this.getValidatorDisplay(card.validator);
        case 'Épica':
          if (card.epic) {
            const epicList = globalThis.globalEpicList || [];
            const epic = epicList.find(e => e.id === card.epic || e.name === card.epic);
            return epic ? epic.name : card.epic;
          }
          return '';
        case 'Fecha registro': return UIUtils.formatDate(card.registerDate);
        case 'Fecha inicio': return card.startDate || '';
        case 'Fecha fin': return card.endDate || '';
        case 'BP': return card.businessPoints || 0;
        default: return '';
      }
    };
    return rows.sort((a, b) => {
      const va = getValue(a[1], field);
      const vb = getValue(b[1], field);
      if (field.startsWith('Fecha')) {
        // Soporte para fechas en formato dd/mm/yyyy
        function parseEuropeanDate(str) {
          if (!str) return NaN;
          // Si ya es yyyy-mm-dd, parsea normal
          if (/^\d{4}-\d{2}-\d{2}/.test(str)) return new Date(str).getTime();
          // Si es dd/mm/yyyy
          const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
          if (match) {
            return new Date(`${match[3]}-${match[2]}-${match[1]}`).getTime();
          }
          // Fallback
          return new Date(str).getTime();
        }
        const da = parseEuropeanDate(va);
        const db = parseEuropeanDate(vb);
        if (this.sortDirection === 'asc') {
          return da - db;
        } else {
          return db - da;
        }
      }
      if (!isNaN(va) && !isNaN(vb)) {
        return (Number(va) - Number(vb)) * dir;
      }
      return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });
  }

  /**
   * Aplica los filtros a las tareas (igual que ListRenderer)
   * @param {Object} cards
   * @returns {Object}
   */
  applyFilters(cards) {
    if (!this.filters || Object.keys(this.filters).length === 0) {
return cards;
    }

    const filtered = {};
    Object.entries(cards).forEach(([id, card]) => {
      let include = true;
      Object.entries(this.filters).forEach(([field, value]) => {
        if (value === null) return;

        // Convertir valor a array si no lo es (para compatibilidad)
        const filterValues = Array.isArray(value) ? value : [value];
if (field === 'status') {
          if (!filterValues.includes(card.status)) {
include = false;
          }
        } else if (field === 'developer') {
          const developerDisplay = this.getDeveloperDisplay(card.developer);
          if (!filterValues.includes(card.developer) && !filterValues.includes(developerDisplay)) {
include = false;
          }
        } else if (field === 'createdBy') {
          const createdByName = this.getCreatedByDisplay(card.createdBy);
          let createdByMatch = false;
          if (filterValues.includes('no-creator')) {
            createdByMatch = !createdByName || createdByName === '' || createdByName === 'Sin creador';
          } else {
            createdByMatch = filterValues.includes(createdByName) || filterValues.includes(card.createdBy);
          }

          if (!createdByMatch) {
include = false;
          }
        } else if (field === 'sprint') {
          const hasNoSprint = filterValues.includes('no-sprint');
          const otherSprints = filterValues.filter(v => v !== 'no-sprint');
          // Check if card has a valid sprint ID
          const isValidSprintId = card.sprint && globalThis.globalSprintList && globalThis.globalSprintList[card.sprint];
          const cardHasNoSprint = !isValidSprintId;

          let sprintMatch = false;
          if (hasNoSprint && otherSprints.length === 0) {
            // Only "no-sprint" selected - show only cards without sprint
            sprintMatch = cardHasNoSprint;
          } else if (hasNoSprint && otherSprints.length > 0) {
            // "no-sprint" + specific sprints - show cards without sprint OR matching selected sprints
            sprintMatch = cardHasNoSprint || otherSprints.includes(card.sprint);
          } else {
            // Only specific sprints - show only matching sprints
            sprintMatch = filterValues.includes(card.sprint);
          }
          if (!sprintMatch) {
            include = false;
          }
        } else if (field === 'priority') {
          let priorityMatch = false;
          if (filterValues.includes('Not evaluated')) {
            priorityMatch = !card.businessPoints || !card.devPoints || card.businessPoints === 0 || card.devPoints === 0;
          } else {
            const priority = this.calculatePriority(card);
            priorityMatch = filterValues.some(filterValue => {
              switch (filterValue) {
                case 'High': return priority >= 200;
                case 'Medium': return priority >= 100 && priority < 200;
                case 'Low': return priority > 0 && priority < 100;
                default: return false;
              }
            });
          }
          if (!priorityMatch) {
include = false;
          }
        } else if (field === 'epic') {
          const hasNoEpic = filterValues.includes('no-epic');
          const otherEpics = filterValues.filter(v => v !== 'no-epic');
          const cardHasNoEpic = !card.epic || card.epic === '';

          let epicMatch = false;
          if (hasNoEpic && otherEpics.length === 0) {
            // Only "no-epic" selected
            epicMatch = cardHasNoEpic;
          } else if (hasNoEpic && otherEpics.length > 0) {
            // "no-epic" + specific epics
            epicMatch = cardHasNoEpic || otherEpics.includes(card.epic);
          } else {
            // Only specific epics
            epicMatch = filterValues.includes(card.epic);
          }
          if (!epicMatch) {
            include = false;
          }
        }
      });
      if (include) {
        filtered[id] = card;
}
    });

    return filtered;
  }

  calculatePriority(card) {
    if (!card.devPoints || card.devPoints === 0) return 0;
    return (card.businessPoints / card.devPoints) * 100;
  }

  matchesPriorityFilter(priority, filterValue) {
    switch (filterValue) {
      case 'High': return priority >= 200;
      case 'Medium': return priority >= 100 && priority < 200;
      case 'Low': return priority < 100;
      default: return true;
    }
  }

  /**
   * Resolve developer entity ID (dev_XXX) to display name
   */
  _resolveDeveloperEntityId(value) {
    if (entityDirectoryService.isInitialized()) {
      const name = entityDirectoryService.getDeveloperDisplayName(value);
      if (name && name !== value && !name.startsWith('dev_')) return name;
    }
    const globalDevList = globalThis.globalDeveloperList || [];
    const found = globalDevList.find(dev => typeof dev === 'object' && dev.id === value);
    return found ? (found.name || found.email || value) : null;
  }

  /**
   * Resolve stakeholder entity ID (stk_XXX) to display name
   */
  _resolveStakeholderEntityId(value) {
    if (entityDirectoryService.isInitialized()) {
      const name = entityDirectoryService.getStakeholderDisplayName(value);
      if (name && name !== value && !name.startsWith('stk_')) return name;
    }
    const globalStkList = globalThis.globalStakeholderList || [];
    const found = globalStkList.find(stk => typeof stk === 'object' && stk.id === value);
    return found ? (found.name || found.email || value) : null;
  }

  /**
   * Final fallback resolution for display values
   */
  _resolveFinalDisplay(value) {
    const resolved = userDirectoryService?.resolveDisplayName?.(value);
    return resolved || this._formatEmailLikeValue(value);
  }

  /**
   * Convert notes field to array format
   * Handles both legacy string format and structured array format
   * @param {string|Array|Object} notes - Notes data
   * @returns {Array} Array of note objects
   */
  _getNotesArray(notes) {
    if (!notes) return [];
    if (Array.isArray(notes)) return notes;
    if (typeof notes === 'object') {
      // Object with keys (Firebase format)
      return Object.values(notes);
    }
    if (typeof notes === 'string' && notes.trim()) {
      // Legacy string format - convert to single note
      return [{ content: notes, author: 'legacy', timestamp: '' }];
    }
    return [];
  }

  getDeveloperDisplay(value) {
    // Return consistent display for unassigned/empty values
    if (!value || value === '' ||
        APP_CONSTANTS.DEVELOPER_UNASSIGNED.ALIASES.includes(value)) {
      return APP_CONSTANTS.DEVELOPER_UNASSIGNED.DISPLAY_ES;
    }

    if (typeof value === 'string' && value.startsWith('dev_')) {
      const resolved = this._resolveDeveloperEntityId(value);
      if (resolved) return resolved;
    }

    return this._resolveFinalDisplay(value);
  }

  getCreatedByDisplay(value) {
    if (!value) return '';

    if (typeof value === 'string') {
      if (value.startsWith('dev_')) {
        const resolved = this._resolveDeveloperEntityId(value);
        if (resolved) return resolved;
      }
      if (value.startsWith('stk_')) {
        const resolved = this._resolveStakeholderEntityId(value);
        if (resolved) return resolved;
      }
    }

    return this._resolveFinalDisplay(value);
  }

  getValidatorDisplay(value) {
    if (!value) return '';

    if (typeof value === 'string' && value.startsWith('stk_')) {
      const resolved = this._resolveStakeholderEntityId(value);
      if (resolved) return resolved;
    }

    return this._resolveFinalDisplay(value);
  }

  _formatEmailLikeValue(value) {
    if (!value) {
      return '';
    }

    // Prioridad: usersDirectory (email o alias decodificado)
    const directoryName = this._resolveFromUserDirectory(value);
    if (directoryName) {
      return directoryName;
    }

    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      // Check for unassigned developer values and return consistent Spanish display
      if (APP_CONSTANTS.DEVELOPER_UNASSIGNED.ALIASES.includes(lower) ||
          APP_CONSTANTS.DEVELOPER_UNASSIGNED.ALIASES.includes(value)) {
        return APP_CONSTANTS.DEVELOPER_UNASSIGNED.DISPLAY_ES;
      }
      if (lower === 'sin creador') {
        return 'Sin creador';
      }
    }

    const relMap = globalThis.globalRelEmailUser || {};
    const normalized = this._normalize(value);

    if (relMap[value]) {
      return relMap[value];
    }
    if (relMap[normalized]) {
      return relMap[normalized];
    }

    const devList = globalThis.globalDeveloperList || [];
    const resolved = this._matchInList(devList, normalized, value);
    if (resolved) {
      return resolved;
    }

    const directoryMatch = this._matchDeveloperDirectory(normalized, value);
    if (directoryMatch) {
      return directoryMatch;
    }

    if (typeof value === 'string' && value.includes('@')) {
      return this._nameFromEmail(value);
    }

    return value;
  }

  /**
   * Resuelve display name usando /data/usersDirectory (email o alias, incluso codificado)
   */
  _resolveFromUserDirectory(rawValue) {
    const identifier = (rawValue || '').toString().trim();
    if (!identifier) return '';

    // Lanzar carga en background si no está listo
    if (userDirectoryService && typeof userDirectoryService.load === 'function' && !userDirectoryService._loaded) {
      userDirectoryService.load().catch(() => { });
    }

    // Servicio centralizado
    if (userDirectoryService && typeof userDirectoryService.getDisplay === 'function') {
      const display = userDirectoryService.getDisplay(identifier);
      if (display?.name) {
        return display.name;
      }
    }

    // Fallback directo al objeto global
    const directory = globalThis.usersDirectory || {};
    const normalized = identifier.toLowerCase();
    const decoded = this._safeDecode(identifier).toLowerCase();

    const matchesEntry = (entry) => {
      const email = (entry.email || '').toLowerCase();
      const aliases = Array.isArray(entry.aliases) ? entry.aliases.map(a => (a || '').toLowerCase()) : [];
      return email === normalized || email === decoded || aliases.includes(normalized) || aliases.includes(decoded);
    };

    for (const entry of Object.values(directory)) {
      if (matchesEntry(entry)) {
        return entry.name || entry.email || identifier;
      }
    }

    return '';
  }

  _safeDecode(value) {
    try {
      return decodeEmailFromFirebase(value);
    } catch {
      return value;
    }
  }

  _matchDeveloperDirectory(normalized, raw) {
    if (!Array.isArray(developerDirectory)) return null;

    for (const entry of developerDirectory) {
      const primaryEmail = (entry.primaryEmail || '').toLowerCase();
      const emails = new Set((entry.emails || []).map(e => (e || '').toLowerCase()));
      const aliases = new Set((entry.aliases || []).map(a => (a || '').toLowerCase()));
      const name = entry.name || '';

      if (
        (primaryEmail && (primaryEmail === raw || primaryEmail === normalized)) ||
        emails.has(raw?.toLowerCase?.()) || emails.has(normalized) ||
        aliases.has(normalized) ||
        (name && name.toLowerCase() === normalized)
      ) {
        return name || primaryEmail || raw;
      }
    }

    return null;
  }

  _matchInList(list, normalizedValue, originalValue) {
    if (!list) return null;

    const equals = (candidate) => this._normalize(candidate) === normalizedValue;

    if (Array.isArray(list)) {
      for (const entry of list) {
        if (!entry) continue;
        if (typeof entry === 'string') {
          if (equals(entry)) return entry;
        } else if (typeof entry === 'object') {
          const email = entry.email || entry.value || entry.mail;
          if (email && equals(email)) {
            return entry.name || entry.display || entry.label || email;
          }
          const name = entry.name || entry.display || entry.label;
          if (name && equals(name)) {
            return name;
          }
        }
      }
    } else if (typeof list === 'object') {
      for (const [key, entry] of Object.entries(list)) {
        if (!entry) continue;
        if (typeof entry === 'string') {
          if (equals(entry)) return entry;
          if (equals(key)) return key;
        } else if (typeof entry === 'object') {
          const email = entry.email || entry.value || entry.mail || key;
          if (email && equals(email)) {
            return entry.name || entry.display || entry.label || key;
          }
          const name = entry.name || entry.display || entry.label;
          if (name && equals(name)) {
            return name;
          }
        }
      }
    }

    return null;
  }

  _nameFromEmail(email) {
    const local = email.split('@')[0] || email;
    let cleaned = local.replace(/#ext#/gi, '');
    cleaned = cleaned.replace(/[._-]+/g, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    if (!cleaned) return email;
    return cleaned.split(' ').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  }

  _normalize(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : value;
  }

  /**
   * Genera un color basado en el hash de un string (para badges de repo)
   */
  _getRepoColor(label) {
    if (!label) return 'hsl(0, 0%, 60%)';
    let hash = 0;
    for (let i = 0; i < label.length; i++) {
      hash = label.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 65%, 45%)`;
  }

  /**
   * Crea un badge de repositorio para la tabla
   */
  /**
   * Makes an ID cell clickable to copy the cardId to clipboard
   * @param {HTMLElement} cell - The TD element
   * @param {string} cardId - The card ID to copy
   */
  _makeIdCellCopyable(cell, cardId) {
    cell.style.cursor = 'pointer';
    cell.title = 'Click para copiar ID';
    cell.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!navigator.clipboard) return;
      try {
        await navigator.clipboard.writeText(cardId);
        document.dispatchEvent(new CustomEvent('show-slide-notification', {
          detail: { options: { message: `ID ${cardId} copiado`, type: 'success' } }
        }));
      } catch {
        document.dispatchEvent(new CustomEvent('show-slide-notification', {
          detail: { options: { message: 'Error al copiar ID', type: 'error' } }
        }));
      }
    });
  }

  _createRepoBadge(card, projectId) {
    const project = globalThis.projects?.[projectId];
    if (!project?.repoUrl || typeof project.repoUrl === 'string') return null;
    if (!Array.isArray(project.repoUrl) || project.repoUrl.length < 2) return null;

    const label = card.repositoryLabel || project.repoUrl[0]?.label || '';
    if (!label) return null;

    const color = this._getRepoColor(label);
    return UIUtils.createElement('span', {
      style: {
        display: 'inline-block',
        fontSize: '0.7em',
        fontWeight: '600',
        color: 'white',
        backgroundColor: color,
        padding: '0.1em 0.4em',
        borderRadius: '3px',
        marginLeft: '0.4em',
        verticalAlign: 'middle',
        textTransform: 'uppercase'
      },
      title: `Repositorio: ${label}`
    }, label);
  }

  /**
   * Creates relation badges (blockedBy, blocks, related) with hover popover
   * @param {Array|undefined} relatedTasks - Array of related task objects
   * @param {Object} cardIdMap - Map of cardId -> card data for status lookup
   * @returns {HTMLElement|null} Wrapper element with badges and popover, or null
   */
  _createRelationBadges(relatedTasks, cardIdMap) {
    if (!Array.isArray(relatedTasks) || relatedTasks.length === 0) return null;

    // Group by type
    const groups = {};
    relatedTasks.forEach(rt => {
      const type = rt.type || 'related';
      if (!groups[type]) groups[type] = [];
      groups[type].push(rt);
    });

    const typeConfig = {
      blockedBy: { color: '#e53935', icon: '\u23F8', label: 'Bloqueada por' },
      blocks: { color: '#1976d2', icon: '\u2192', label: 'Bloquea a' },
      related: { color: '#78909c', icon: '\uD83D\uDD17', label: 'Relacionadas' }
    };

    const wrapper = UIUtils.createElement('div', {
      style: {
        position: 'relative',
        display: 'inline-block',
        verticalAlign: 'middle'
      }
    });

    // Create badges for each type present
    const typeOrder = ['blockedBy', 'blocks', 'related'];
    typeOrder.forEach(type => {
      if (!groups[type]) return;
      const cfg = typeConfig[type];
      const badge = UIUtils.createElement('span', {
        style: {
          display: 'inline-block',
          fontSize: '0.65em',
          fontWeight: '600',
          color: '#fff',
          backgroundColor: cfg.color,
          padding: '0.1em 0.35em',
          borderRadius: '3px',
          marginLeft: '0.3em',
          cursor: 'help',
          verticalAlign: 'middle'
        }
      }, `${cfg.icon}${groups[type].length}`);
      wrapper.appendChild(badge);
    });

    // Create popover
    const popover = UIUtils.createElement('div', {
      className: 'relation-popover',
      style: {
        display: 'none',
        position: 'absolute',
        left: '0',
        top: '100%',
        marginTop: '6px',
        background: 'var(--bg-primary, #fff)',
        border: '1px solid var(--border-default, #ddd)',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        padding: '10px',
        minWidth: '260px',
        maxWidth: '380px',
        maxHeight: '300px',
        overflowY: 'auto',
        zIndex: '1000',
        textAlign: 'left',
        whiteSpace: 'normal'
      }
    });

    // Populate popover grouped by type
    typeOrder.forEach(type => {
      if (!groups[type]) return;
      const cfg = typeConfig[type];

      const header = UIUtils.createElement('div', {
        style: {
          fontWeight: 'bold',
          fontSize: '0.8rem',
          color: cfg.color,
          marginBottom: '4px',
          marginTop: popover.children.length > 0 ? '8px' : '0'
        }
      }, `${cfg.icon} ${cfg.label} (${groups[type].length})`);
      popover.appendChild(header);

      groups[type].forEach(rt => {
        const item = UIUtils.createElement('div', {
          style: {
            padding: '3px 0',
            fontSize: '0.8rem',
            color: 'var(--text-primary, #333)',
            borderBottom: '1px solid var(--border-subtle, #f0f0f0)'
          }
        });

        let text = `${rt.id} - ${rt.title || rt.id}`;

        // For blockedBy, show resolution status
        if (type === 'blockedBy' && cardIdMap) {
          const related = cardIdMap[rt.id];
          if (related) {
            const status = related.status || '';
            if (status === 'Done' || status === 'Done&Validated') {
              text += ' ';
              const resolved = UIUtils.createElement('span', {
                style: { color: '#2e7d32', fontWeight: '600', fontSize: '0.75rem' }
              }, '(Resuelta)');
              item.textContent = text;
              item.appendChild(resolved);
              popover.appendChild(item);
              return;
            } else {
              text += ' ';
              const pending = UIUtils.createElement('span', {
                style: { color: '#e65100', fontWeight: '600', fontSize: '0.75rem' }
              }, '(Pendiente)');
              item.textContent = text;
              item.appendChild(pending);
              popover.appendChild(item);
              return;
            }
          } else {
            text += ' ';
            const unknown = UIUtils.createElement('span', {
              style: { color: '#9e9e9e', fontWeight: '600', fontSize: '0.75rem' }
            }, '(estado desconocido)');
            item.textContent = text;
            item.appendChild(unknown);
            popover.appendChild(item);
            return;
          }
        }

        item.textContent = text;
        popover.appendChild(item);
      });
    });

    wrapper.appendChild(popover);

    // Show/hide popover on hover
    let hideTimeout;
    wrapper.addEventListener('mouseenter', () => {
      clearTimeout(hideTimeout);
      popover.style.display = 'block';
    });
    wrapper.addEventListener('mouseleave', () => {
      hideTimeout = setTimeout(() => {
        popover.style.display = 'none';
      }, 200);
    });

    return wrapper;
  }

  /**
   * Creates a cell content with a name and optional co-badge positioned top-right
   * @param {string} mainName - Main name to display
   * @param {string|null} coName - Co-person name (coDeveloper or coValidator)
   * @param {string} badgeLabel - Label for the badge (e.g., 'Co-Dev', 'Co-Val')
   * @returns {HTMLElement} Wrapper element with name and optional badge
   */
  _createCellWithCoBadge(mainName, coName, badgeLabel) {
    const wrapper = UIUtils.createElement('div', {
      style: {
        position: 'relative',
        display: 'inline-block',
        maxWidth: '100%'
      }
    });

    // Main name text
    const nameSpan = UIUtils.createElement('span', {
      style: {
        display: 'block',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        paddingRight: coName ? '2.5rem' : '0'
      }
    }, mainName || '');
    nameSpan.title = mainName || '';
    wrapper.appendChild(nameSpan);

    // Co-badge if coName exists
    if (coName) {
      const badge = UIUtils.createElement('span', {
        style: {
          position: 'absolute',
          top: '-0.6rem',
          right: '0',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.15rem',
          background: '#6f42c1',
          color: '#fff',
          padding: '0.1rem 0.35rem',
          borderRadius: '4px',
          fontSize: '0.65rem',
          fontWeight: '600',
          whiteSpace: 'nowrap',
          cursor: 'help',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
        }
      });
      badge.textContent = badgeLabel;
      badge.title = `${badgeLabel === 'Co-Dev' ? 'CoDeveloper' : 'CoValidator'}: ${coName}`;
      wrapper.appendChild(badge);
    }

    return wrapper;
  }

  _createStatusTag(status, type = 'task') {
    // Default status based on card type
    let text = status;
    if (!text || text.trim() === '') {
      text = type === 'bug' ? 'Created' : 'To Do';
    }
    const color = this._statusColor(text, type);
const style = {
      display: 'inline-block',
      padding: '0.15rem 0.5rem',
      borderRadius: '999px',
      fontSize: '0.85rem',
      fontWeight: '600',
      background: color.bg,
      color: color.fg,
      textTransform: 'capitalize',
      whiteSpace: 'nowrap',
      border: '1px solid rgba(0,0,0,0.05)'
    };
    return UIUtils.createElement('span', { style }, text);
  }

  _appendStatusCell(row, status, type) {
    const cell = UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem' } });
    const tag = this._createStatusTag(status, type);
    cell.appendChild(tag);
    row.appendChild(cell);
  }

  _appendPriorityCell(row, priority) {
    const cell = UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem' } });
    const tag = this._createPriorityTag(priority);
    cell.appendChild(tag);
    row.appendChild(cell);
  }

  _statusColor(status, type) {
    const value = (status || '').toString();
    const lower = value.toLowerCase();
    const upper = value.toUpperCase();

    if (type === 'bug') {
      const palette = {
        'created': '#6c757d',
        'open': '#0d6efd',
        'triaged': '#6c757d',
        'assigned': '#0d6efd',
        'in progress': '#0d6efd',
        'blocked': '#d63384',
        'fixed': '#2ab27b',
        'in testing': '#6f42c1',
        'verified': '#198754',
        'cerrado': '#6c757d',
        'closed': '#6c757d',
        'rechazado': '#343a40',
        'rejected': '#343a40',
        'reopened': '#fd7e14'
      };
      const bg = palette[lower] || '#adb5bd';
      return { bg, fg: '#fff' };
    }

    if (type === 'proposal') {
      const palette = {
        'propuesta': '#6c757d',
        'en revisión': '#0d6efd',
        'en revision': '#0d6efd',
        'aprobada': '#198754',
        'rechazada': '#dc3545',
        'en desarrollo': '#fd7e14',
        'implementada': '#2ab27b',
        'descartada': '#343a40'
      };
      const bg = palette[lower] || '#adb5bd';
      return { bg, fg: '#fff' };
    }

    // Task status: try kanban colors first
    const kanbanColors = APP_CONSTANTS?.KANBAN_COLORS || {};
    const kanbanBg = kanbanColors[upper];
    if (kanbanBg) {
      return { bg: kanbanBg, fg: '#fff' };
    }

    const palette = {
      'backlog': '#6c757d',
      'todo': '#6c757d',
      'to do': '#6c757d',
      'ready': '#20c997',
      'in progress': '#0d6efd',
      'doing': '#0d6efd',
      'blocked': '#d63384',
      'qa': '#6f42c1',
      'review': '#6f42c1',
      'to validate': '#17a2b8',
      'tovalidate': '#17a2b8',
      'done': '#2ab27b',
      'completed': '#2ab27b',
      'closed': '#2ab27b',
      'archived': '#adb5bd',
      'on hold': '#fd7e14'
    };

    const bg = palette[lower] || '#adb5bd';
    return { bg, fg: '#fff' };
  }

  _createPriorityTag(priority = 'Sin prioridad') {
    const text = priority;
    const color = this._priorityColor(text);
    const style = {
      display: 'inline-block',
      padding: '0.15rem 0.5rem',
      borderRadius: '999px',
      fontSize: '0.85rem',
      fontWeight: '600',
      background: color.bg,
      color: color.fg,
      textTransform: 'capitalize',
      whiteSpace: 'nowrap',
      border: '1px solid rgba(0,0,0,0.05)'
    };
    return UIUtils.createElement('span', { style }, text);
  }

  _priorityColor(priority) {
    const value = (priority || '').toString().toLowerCase();
    const palette = {
      'application blocker': '#dc3545',
      'department blocker': '#fd7e14',
      'individual blocker': '#ffc107',
      'user experience issue': '#28a745',
      'workflow improvement': '#17a2b8',
      'workflow improvment': '#17a2b8',
      'workaround available issue': '#6c757d',
      'not evaluated': '#6c757d',
      'no evaluado': '#6c757d'
    };
    const bg = palette[value] || '#adb5bd';
    const fg = '#fff';
    return { bg, fg };
  }

  /**
   * Renderiza la vista de tabla de tareas.
   * @param {HTMLElement} container - Contenedor donde se renderiza la tabla
   * @param {Object} cards - Diccionario de tareas (id -> datos)
   * @param {Object} config - Configuración de la vista
   */
  renderTableView(container, cards, config) {
    container.innerHTML = '';
    container.classList.remove('cards-container');
    container.classList.add('table-view');
    // Skip renderer filters if already filtered (e.g., by search)
    const filteredCards = config.skipRendererFilters ? cards : this.applyFilters(cards);

    if (!filteredCards || Object.keys(filteredCards).length === 0) {
      const emptyMessage = UIUtils.createElement('p', {
        style: { textAlign: 'center', padding: '2rem', color: 'var(--text-muted, #666)' }
      }, 'No hay tareas');
      container.appendChild(emptyMessage);
      return;
    }

    // Build cardId -> card lookup for relation status resolution
    const cardIdMap = {};
    Object.values(filteredCards).forEach(c => { if (c.cardId) cardIdMap[c.cardId] = c; });

    // Crear tabla
    const table = UIUtils.createElement('table', { className: 'tasks-table', style: { width: '100%', borderCollapse: 'collapse', marginTop: '1rem' } });
    const thead = UIUtils.createElement('thead');
    const headerRow = UIUtils.createElement('tr');
    const headers = [
      { key: 'ID', label: 'ID' },
      { key: 'Título', label: 'Título' },
      { key: 'Estado', label: 'Estado' },
      { key: 'Prioridad', label: 'Prioridad' },
      { key: 'Sprint', label: 'Sprint' },
      { key: 'Developer', label: 'Developer' },
      { key: 'Validator', label: 'Validator' },
      { key: 'Épica', label: 'Épica' },
      { key: 'Fecha inicio', label: 'Fecha inicio' },
      { key: 'Fecha fin', label: 'Fecha fin' },
      { key: 'Acciones', label: 'Acciones' }
    ];
    const sortableColumns = new Set(["ID", "Título", "Estado", "Prioridad", "Sprint", "Developer", "Validator", "Épica", "Fecha inicio", "Fecha fin"]);
    headers.forEach(h => {
      // Iconos: ⇅ si es ordenable, ▲▼ si está ordenada
      let icon = '';
      let iconColor = 'var(--brand-primary, #4a9eff)';
      let iconHtml = '';
      if (sortableColumns.has(h.key)) {
        icon = this.getSortIcon(h.key) || ' ⇅';
        if (icon) {
          iconHtml = `<span style="color:${iconColor};font-weight:bold;margin-left:2px;">${icon.trim()}</span>`;
        }
      }
      const th = UIUtils.createElement('th', {
        style: {
          border: '1px solid var(--border-default, #ddd)',
          padding: '0.5rem',
          background: 'var(--bg-secondary, #f8f9fa)',
          cursor: sortableColumns.has(h.key) ? 'pointer' : 'default',
          userSelect: 'none',
          minWidth: '80px'
        }
      });
      th.innerHTML = h.label + (iconHtml ? `&nbsp;${iconHtml}` : '');
      if (sortableColumns.has(h.key)) {
        th.addEventListener('click', () => {
          this.setSort(h.key);
          this.renderTableView(container, cards, config);
        });
      }
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = UIUtils.createElement('tbody');
    // Ordenar filas según el estado de ordenación
    let rows = Object.entries(filteredCards);
    rows = this.sortRows(rows);
    rows.forEach(([id, card]) => {
      if (card.deletedAt) return;
      const row = UIUtils.createElement('tr');
      row.setAttribute('data-task-id', id);
      row.dataset.cardId = card.cardId || '';
      row.dataset.firebaseId = id;

      // Añadir estilo destacado para tareas spike
      if (card.spike) {
        row.style.backgroundColor = 'rgba(156, 39, 176, 0.1)';
        row.style.border = '2px solid #9c27b0';
      }
      // Añadir estilo destacado para tareas expedit (sobreescribe spike si ambas)
      if (card.expedited) {
        row.style.backgroundColor = 'rgba(255, 193, 7, 0.15)';
        row.style.border = '2px solid #ffc107';
        row.style.fontWeight = 'bold';
      }

      // ID + repo badge + relation badges + click-to-copy
      const idCell = UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem', whiteSpace: 'nowrap' } }, card.cardId || id);
      const repoBadge = this._createRepoBadge(card, config.projectId);
      if (repoBadge) idCell.appendChild(repoBadge);
      const relationBadges = this._createRelationBadges(card.relatedTasks, cardIdMap);
      if (relationBadges) idCell.appendChild(relationBadges);
      if (card.cardId) this._makeIdCellCopyable(idCell, card.cardId);
      row.appendChild(idCell);
      // Título + notes badge + badges de bloqueo
      const titleCell = UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem', maxWidth: '250px' } });
      const titleWrapper = UIUtils.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '0.35rem', overflow: 'hidden' } });
      const titleText = UIUtils.createElement('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1', minWidth: '0' } }, card.title || '');
      titleText.title = card.title || '';
      titleWrapper.appendChild(titleText);

      // Notes badge next to title
      const notes = this._getNotesArray(card.notes);
      const notesCount = notes.length > 0 ? notes.length : (card.notesCount || 0);
      if (notesCount > 0) {
        const notesBadge = UIUtils.createElement('span', {
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '2px',
            background: '#6f42c1',
            color: '#fff',
            padding: '0 5px',
            borderRadius: '10px',
            fontSize: '0.7rem',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            flexShrink: '0',
            lineHeight: '1.4'
          }
        }, `📝${notesCount}`);
        notesBadge.title = `${notesCount} nota${notesCount > 1 ? 's' : ''}`;
        titleWrapper.appendChild(notesBadge);
      }

      // Badges de bloqueo (business/dev) - only show if status is "Blocked"
      const isBlockedStatus = (card.status || '').toLowerCase() === 'blocked';
      if (isBlockedStatus && card.blockedByBusiness) {
        const badge = UIUtils.createElement('span', {
          style: {
            background: '#e74c3c',
            color: '#fff',
            padding: '0 6px',
            borderRadius: '10px',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            flexShrink: '0'
          }
        }, 'BUS');
        badge.title = 'Bloqueada por negocio';
        titleWrapper.appendChild(badge);
      }
      if (isBlockedStatus && card.blockedByDevelopment) {
        const badge = UIUtils.createElement('span', {
          style: {
            background: '#f39c12',
            color: '#fff',
            padding: '0 6px',
            borderRadius: '10px',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            flexShrink: '0'
          }
        }, 'DEV');
        badge.title = 'Bloqueada por desarrollo';
        titleWrapper.appendChild(badge);
      }
      // Badge de SPIKE
      if (card.spike) {
        const badge = UIUtils.createElement('span', {
          style: {
            background: '#9c27b0',
            color: '#fff',
            padding: '0 6px',
            borderRadius: '10px',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            flexShrink: '0'
          }
        }, 'SPIKE');
        badge.title = 'Spike - Investigación técnica';
        titleWrapper.appendChild(badge);
      }
      // Badge de EXPEDIT
      if (card.expedited) {
        const badge = UIUtils.createElement('span', {
          style: {
            background: '#ffc107',
            color: '#000',
            padding: '0 6px',
            borderRadius: '10px',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            flexShrink: '0'
          }
        }, 'EXPEDIT');
        badge.title = 'Tarea urgente';
        titleWrapper.appendChild(badge);
      }
      // Badge de PLAN
      if (card.planStatus) {
        const planConfig = {
          pending:     { label: 'Plan',       bg: '#6b7280', color: '#fff' },
          proposed:    { label: 'Plan: Prop', bg: '#3b82f6', color: '#fff' },
          validated:   { label: 'Plan: Val',  bg: '#8b5cf6', color: '#fff' },
          in_progress: { label: 'Plan: WIP',  bg: '#f59e0b', color: '#000' },
          completed:   { label: 'Plan: OK',   bg: '#10b981', color: '#fff' }
        };
        const cfg = planConfig[card.planStatus] || planConfig.pending;
        const planBadge = UIUtils.createElement('span', {
          style: {
            background: cfg.bg,
            color: cfg.color,
            padding: '0 6px',
            borderRadius: '10px',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            flexShrink: '0'
          }
        }, cfg.label);
        planBadge.title = `Plan de implementación: ${card.planStatus}`;
        titleWrapper.appendChild(planBadge);
      }

      titleCell.appendChild(titleWrapper);
      row.appendChild(titleCell);
      // Estado
      this._appendStatusCell(row, card.status, 'task');
      // Prioridad (mostrar "Prioridad X" con color en escala)
      const priorityCell = UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem' } });
      if (card.spike) {
        priorityCell.textContent = '';
      } else {
        const priorityInfo = getPriorityDisplay(card.businessPoints, card.devPoints);
        if (priorityInfo.hasPriority) {
          const priorityTag = UIUtils.createElement('span', {
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: '0.15rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.85rem',
              fontWeight: '600',
              background: priorityInfo.backgroundColor,
              color: priorityInfo.color,
              whiteSpace: 'nowrap'
            }
          }, priorityInfo.label);
          priorityTag.title = `${card.businessPoints}/${card.devPoints} = ${priorityInfo.value}`;
          // Badge with calculated value
          const badge = UIUtils.createElement('span', {
            style: {
              fontSize: '0.7rem',
              background: 'rgba(0,0,0,0.3)',
              padding: '0 4px',
              borderRadius: '4px',
              marginLeft: '4px'
            }
          }, priorityInfo.badge);
          priorityTag.appendChild(badge);
          priorityCell.appendChild(priorityTag);
        } else {
          priorityCell.textContent = 'No evaluado';
          priorityCell.style.color = 'var(--text-muted, #6c757d)';
          priorityCell.style.fontStyle = 'italic';
        }
      }
      row.appendChild(priorityCell);
      // Sprint
      let sprintTitle = '';
      if (card.sprint && globalThis.globalSprintList?.[card.sprint]) {
        sprintTitle = globalThis.globalSprintList[card.sprint].title;
      }
      row.dataset.sprintValue = card.sprint || '';
      row.appendChild(UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem' } }, sprintTitle));
      // Developer + CoDeveloper badge
      const developerDisplay = this.getDeveloperDisplay(card.developer);
      const developerCell = UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem' } });
      const developerWrapper = this._createCellWithCoBadge(
        developerDisplay,
        card.coDeveloper ? this.getDeveloperDisplay(card.coDeveloper) : null,
        'Co-Dev'
      );
      developerCell.appendChild(developerWrapper);

      row.dataset.developerValue = card.developer || '';
      row.dataset.developerDisplay = developerDisplay;
      row.dataset.coDeveloperValue = card.coDeveloper || '';
      row.appendChild(developerCell);

      // Validator + CoValidator badge
      const validatorDisplay = this.getValidatorDisplay(card.validator);
      const validatorCell = UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem' } });
      const validatorWrapper = this._createCellWithCoBadge(
        validatorDisplay,
        card.coValidator ? this.getValidatorDisplay(card.coValidator) : null,
        'Co-Val'
      );
      validatorCell.appendChild(validatorWrapper);

      row.dataset.validatorValue = card.validator || '';
      row.dataset.validatorDisplay = validatorDisplay;
      row.dataset.coValidatorValue = card.coValidator || '';
      row.appendChild(validatorCell);
      // Épica
      let epicName = '';
      if (card.epic) {
        // Buscar la épica en la lista global o en globalThis.globalEpicList
        const epicList = globalThis.globalEpicList || [];
        const epic = epicList.find(e => e.id === card.epic || e.name === card.epic);
        epicName = epic ? epic.name : card.epic;
      }
      row.appendChild(UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem' } }, epicName));
      // Fecha inicio
      row.appendChild(UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem' } }, card.startDate || ''));
      // Fecha fin
      row.appendChild(UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem' } }, card.endDate || ''));
      // Acciones: editar, eliminar, copiar, IA
      const actionsTd = UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem', textAlign: 'left', whiteSpace: 'nowrap' } });
      const firebaseId = card.id || id;

      const iconBtn = (label, title, onClick) => {
        const btn = UIUtils.createElement('button', {
          type: 'button',
          title,
          style: {
            padding: '0.35rem',
            marginRight: '0.35rem',
            borderRadius: '4px',
            border: '1px solid var(--border-default, #cbd5e1)',
            background: 'var(--bg-secondary, #f8fafc)',
            cursor: 'pointer',
            fontSize: '1rem'
          }
        }, label);
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          onClick();
        });
        return btn;
      };

      const isYearReadOnly = this._isYearReadOnly();

      // Botón editar: solo si el año NO es de solo lectura
      if (!isYearReadOnly) {
        actionsTd.appendChild(iconBtn('✏️', 'Editar', () => {
          container.dispatchEvent(new CustomEvent('edit-task', { detail: { id: firebaseId, cardId: card.cardId || '' }, bubbles: true, composed: true }));
        }));
      }

      actionsTd.appendChild(iconBtn('🔗', 'Copiar enlace', async () => {
        const url = `${globalThis.location.origin}/adminproject/?projectId=${encodeURIComponent(config.projectId)}&cardId=${card.cardId || firebaseId}#tasks`;
        try {
          await navigator.clipboard.writeText(url);
          document.dispatchEvent(new CustomEvent('show-slide-notification', {
            detail: { options: { message: 'Enlace copiado al portapapeles', type: 'success' } }
          }));
        } catch (error) {
          document.dispatchEvent(new CustomEvent('show-slide-notification', {
            detail: { options: { message: 'Error al copiar enlace', type: 'error' } }
          }));
        }
      }));

      // Botón eliminar: solo si el año NO es de solo lectura
      if (!isYearReadOnly) {
        actionsTd.appendChild(iconBtn('🗑️', 'Eliminar', () => {
          container.dispatchEvent(new CustomEvent('delete-card', {
            detail: {
              cardData: {
                ...card,
                id: firebaseId,
                cardId: card.cardId || '',
                projectId: card.projectId || config.projectId,
                group: card.group || 'tasks',
                cardType: card.cardType || 'task-card'
              }
            },
            bubbles: true,
            composed: true
          }));
        }));
      }

      // Show IA button only if project has IA enabled and task is not done
      const project = globalThis.projects?.[config.projectId];
      const projectHasIa = project?.useIa === true || project?.iaEnabled === true;
      if (projectHasIa && (card.status || '').toLowerCase() !== 'done') {
        actionsTd.appendChild(iconBtn('🤖', 'Generar enlace IA', () => {
          container.dispatchEvent(new CustomEvent('generate-ia-link', {
            detail: {
              cardId: card.cardId || '',
              firebaseId,
              projectId: config.projectId,
              card
            },
            bubbles: true,
            composed: true
          }));
        }));
      }

      row.appendChild(actionsTd);

      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    // Wrap table in scrollable container for narrow screens
    const tableWrapper = UIUtils.createElement('div', {
      style: { overflowX: 'auto', width: '100%' }
    });
    tableWrapper.appendChild(table);
    container.appendChild(tableWrapper);
  }

  /**
   * Renderiza la vista de tabla de bugs.
   * @param {HTMLElement} container - Contenedor donde se renderiza la tabla
   * @param {Object} cards - Diccionario de bugs (id -> datos)
   * @param {Object} config - Configuración de la vista
   */
  renderBugsTableView(container, cards, config) {
    container.innerHTML = '';
    container.classList.remove('cards-container');
    container.classList.add('table-view');
    // Skip renderer filters if already filtered (e.g., by search)
    const filteredCards = config.skipRendererFilters ? cards : this.applyFilters(cards);

    if (!filteredCards || Object.keys(filteredCards).length === 0) {
      const emptyMessage = UIUtils.createElement('p', {
        style: { textAlign: 'center', padding: '2rem', color: 'var(--text-muted, #666)' }
      }, 'No hay bugs');
      container.appendChild(emptyMessage);
      return;
    }

    // Crear tabla
    const table = UIUtils.createElement('table', { className: 'bugs-table', style: { width: '100%', borderCollapse: 'collapse', marginTop: '1rem' } });
    const thead = UIUtils.createElement('thead');
    const headerRow = UIUtils.createElement('tr');
    const headers = [
      { key: 'ID', label: 'ID' },
      { key: 'Título', label: 'Título' },
      { key: 'Estado', label: 'Estado' },
      { key: 'Prioridad', label: 'Prioridad' },
      { key: 'Developer', label: 'Developer' },
      { key: 'Creado por', label: 'Creado por' },
      { key: 'Fecha registro', label: 'Fecha registro' },
      { key: 'Fecha inicio', label: 'Fecha inicio' },
      { key: 'Fecha fin', label: 'Fecha fin' },
      { key: 'Acciones', label: 'Acciones' }
    ];
    headers.forEach(h => {
      // Iconos: ⇅ si es ordenable, ▲▼ si está ordenada
      let icon = '';
      let iconColor = 'var(--brand-primary, #4a9eff)';
      let iconHtml = '';
      if (["ID", "Título", "Fecha registro", "Fecha inicio", "Fecha fin"].includes(h.key)) {
        icon = this.getSortIcon(h.key) || ' ⇅';
        if (icon) {
          iconHtml = `<span style="color:${iconColor};font-weight:bold;margin-left:2px;">${icon.trim()}</span>`;
        }
      }
      const th = UIUtils.createElement('th', {
        style: {
          border: '1px solid var(--border-default, #ddd)',
          padding: '0.5rem',
          background: 'var(--bg-secondary, #f8f9fa)',
          cursor: ["ID", "Título", "Fecha registro", "Fecha inicio", "Fecha fin"].includes(h.key) ? 'pointer' : 'default',
          userSelect: 'none',
          minWidth: '80px'
        }
      });
      th.innerHTML = h.label + (iconHtml ? `&nbsp;${iconHtml}` : '');
      if (["ID", "Título", "Fecha registro", "Fecha inicio", "Fecha fin"].includes(h.key)) {
        th.addEventListener('click', () => {
          this.setSort(h.key);
          this.renderBugsTableView(container, cards, config);
        });
      }
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = UIUtils.createElement('tbody');
    // Ordenar filas según el estado de ordenación
    let rows = Object.entries(filteredCards);
    rows = this.sortRows(rows);
    rows.forEach(([id, card]) => {
      if (card.deletedAt) return;
      const row = UIUtils.createElement('tr');
      row.setAttribute('data-bug-id', id);
      row.dataset.cardId = card.cardId || '';
      row.dataset.firebaseId = id;
      // ID + repo badge + click-to-copy
      const bugIdCell = UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem', whiteSpace: 'nowrap' } }, card.cardId || id);
      const bugRepoBadge = this._createRepoBadge(card, config.projectId);
      if (bugRepoBadge) bugIdCell.appendChild(bugRepoBadge);
      if (card.cardId) this._makeIdCellCopyable(bugIdCell, card.cardId);
      row.appendChild(bugIdCell);
      // Título
      const titleCellBug = UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, card.title || '');
      titleCellBug.title = card.title || '';
      row.appendChild(titleCellBug);
      // Estado
      this._appendStatusCell(row, card.status, 'bug');
      // Prioridad
      this._appendPriorityCell(row, card.priority);
      // Developer + CoDeveloper badge
      const bugDeveloperDisplay = this.getDeveloperDisplay(card.developer);
      const bugDevCell = UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem' } });
      const bugDevWrapper = this._createCellWithCoBadge(
        bugDeveloperDisplay,
        card.coDeveloper ? this.getDeveloperDisplay(card.coDeveloper) : null,
        'Co-Dev'
      );
      bugDevCell.appendChild(bugDevWrapper);
      row.dataset.developerValue = card.developer || '';
      row.dataset.developerDisplay = bugDeveloperDisplay;
      row.dataset.coDeveloperValue = card.coDeveloper || '';
      row.appendChild(bugDevCell);
      // Creado por - para bugs siempre mostrar el email directamente
      const bugCreatedByDisplay = card.createdBy || '';
      const bugCreatedByCell = UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem' } }, bugCreatedByDisplay);
      row.dataset.createdbyValue = card.createdBy || '';
      row.dataset.createdbyDisplay = bugCreatedByDisplay;
      row.appendChild(bugCreatedByCell);
      // Fecha registro
      row.appendChild(UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem' } }, UIUtils.formatDate(card.registerDate)));
      // Fecha inicio
      row.appendChild(UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem' } }, card.startDate || ''));
      // Fecha fin
      row.appendChild(UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem' } }, card.endDate || ''));
      // Columna Acciones - iconos ver y borrar
      const actionsTd = UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem', textAlign: 'center', whiteSpace: 'nowrap' } });

      // Botón editar (lápiz)
      const viewBtn = UIUtils.createElement('button', {
        className: 'view-bug-btn',
        type: 'button',
        title: 'Editar bug',
        style: {
          padding: '0.4rem',
          borderRadius: '4px',
          border: '1px solid var(--brand-primary, #4a9eff)',
          background: 'var(--bg-primary, #fff)',
          color: 'var(--brand-primary, #4a9eff)',
          cursor: 'pointer',
          marginRight: '0.5rem',
          fontSize: '1rem'
        }
      });
      viewBtn.innerHTML = '✏️';
      viewBtn.addEventListener('click', () => {
        container.dispatchEvent(new CustomEvent('view-bug', { detail: { id, cardId: card.cardId || card.id || id }, bubbles: true, composed: true }));
      });
      actionsTd.appendChild(viewBtn);

      // Botón borrar (papelera) - solo si el año NO es de solo lectura
      if (!this._isYearReadOnly()) {
        const deleteBtn = UIUtils.createElement('button', {
          className: 'delete-bug-btn',
          type: 'button',
          title: 'Eliminar bug',
          style: {
            padding: '0.4rem',
            borderRadius: '4px',
            border: '1px solid #dc3545',
            background: 'var(--bg-primary, #fff)',
            color: '#dc3545',
            cursor: 'pointer',
            fontSize: '1rem'
          }
        });
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.addEventListener('click', () => {
          this._showDeleteConfirmation(container, id, card, config.projectId);
        });
        actionsTd.appendChild(deleteBtn);
      }

      row.appendChild(actionsTd);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    // Wrap table in scrollable container for narrow screens
    const tableWrapper = UIUtils.createElement('div', {
      style: { overflowX: 'auto', width: '100%' }
    });
    tableWrapper.appendChild(table);
    container.appendChild(tableWrapper);
  }

  /**
   * Renderiza la vista de tabla de proposals.
   * @param {HTMLElement} container - Contenedor donde se renderiza la tabla
   * @param {Object} cards - Diccionario de proposals (id -> datos)
   * @param {Object} config - Configuración de la vista
   */
  renderProposalsTableView(container, cards, config) {
    container.innerHTML = '';
    container.classList.remove('cards-container');
    container.classList.add('table-view');
    // Skip renderer filters if already filtered (e.g., by search)
    const filteredCards = config.skipRendererFilters ? cards : this.applyFilters(cards);

    if (!filteredCards || Object.keys(filteredCards).length === 0) {
      const emptyMessage = UIUtils.createElement('p', {
        style: { textAlign: 'center', padding: '2rem', color: 'var(--text-muted, #666)' }
      }, 'No hay proposals');
      container.appendChild(emptyMessage);
      return;
    }

    // Crear tabla
    const table = UIUtils.createElement('table', { className: 'proposals-table', style: { width: '100%', borderCollapse: 'collapse', marginTop: '1rem' } });
    const thead = UIUtils.createElement('thead');
    const headerRow = UIUtils.createElement('tr');
    const headers = [
      { key: 'ID', label: 'ID' },
      { key: 'Título', label: 'Título' },
      { key: 'Estado', label: 'Estado' },
      { key: 'BP', label: 'BP' },
      { key: 'Creado por', label: 'Creado por' },
      { key: 'Stakeholder', label: 'Stakeholder' },
      { key: 'Fecha registro', label: 'Fecha registro' },
      { key: 'Acciones', label: 'Acciones' }
    ];
    const sortableColumns = new Set(["ID", "Título", "BP", "Fecha registro"]);
    headers.forEach(h => {
      let icon = '';
      let iconColor = 'var(--brand-primary, #4a9eff)';
      let iconHtml = '';
      if (sortableColumns.has(h.key)) {
        icon = this.getSortIcon(h.key) || ' ⇅';
        if (icon) {
          iconHtml = `<span style="color:${iconColor};font-weight:bold;margin-left:2px;">${icon.trim()}</span>`;
        }
      }
      const th = UIUtils.createElement('th', {
        style: {
          border: '1px solid var(--border-default, #ddd)',
          padding: '0.5rem',
          background: 'var(--bg-secondary, #f8f9fa)',
          cursor: sortableColumns.has(h.key) ? 'pointer' : 'default',
          userSelect: 'none',
          minWidth: '80px'
        }
      });
      th.innerHTML = h.label + (iconHtml ? `&nbsp;${iconHtml}` : '');
      if (sortableColumns.has(h.key)) {
        th.addEventListener('click', () => {
          this.setSort(h.key);
          this.renderProposalsTableView(container, cards, config);
        });
      }
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = UIUtils.createElement('tbody');
    // Ordenar filas según el estado de ordenación
    let rows = Object.entries(filteredCards);
    rows = this.sortRows(rows);
    rows.forEach(([id, card]) => {
      if (card.deletedAt) return;
      const row = UIUtils.createElement('tr');
      row.dataset.proposalId = id;
      row.dataset.cardId = card.cardId || '';
      row.dataset.firebaseId = id;
      // ID
      row.appendChild(UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem' } }, card.cardId || id));
      // Título
      const titleCell = UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem', maxWidth: '350px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, card.title || '');
      titleCell.title = card.title || '';
      row.appendChild(titleCell);
      // Estado
      this._appendStatusCell(row, card.status, 'proposal');
      // Business Points
      const bpCell = UIUtils.createElement('td', {
        style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem', textAlign: 'center' }
      }, String(card.businessPoints || 0));
      row.dataset.bpValue = card.businessPoints || 0;
      row.appendChild(bpCell);
      // Creado por - mostrar email directamente (cualquier usuario logado puede crear proposals)
      const createdByEmail = card.createdBy || '';
      const createdByCell = UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem' } }, createdByEmail);
      row.dataset.createdbyValue = createdByEmail;
      row.dataset.createdbyDisplay = createdByEmail;
      row.appendChild(createdByCell);
      // Stakeholder
      const stakeholderValue = card.stakeholder || card.validator || '';
      const stakeholderDisplay = stakeholderValue ? this._resolveStakeholderEntityId(stakeholderValue) : '';
      const stakeholderCell = UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem' } }, stakeholderDisplay);
      row.dataset.stakeholderValue = stakeholderValue;
      row.appendChild(stakeholderCell);
      // Fecha registro
      row.appendChild(UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem' } }, UIUtils.formatDate(card.registerDate)));
      // Columna Acciones - iconos ver y borrar
      const actionsTd = UIUtils.createElement('td', { style: { border: '1px solid var(--border-default, #ddd)', padding: '0.5rem', textAlign: 'center', whiteSpace: 'nowrap' } });

      // Botón editar (lápiz)
      const viewBtn = UIUtils.createElement('button', {
        className: 'view-proposal-btn',
        type: 'button',
        title: 'Editar proposal',
        style: {
          padding: '0.4rem',
          borderRadius: '4px',
          border: '1px solid var(--brand-primary, #4a9eff)',
          background: 'var(--bg-primary, #fff)',
          color: 'var(--brand-primary, #4a9eff)',
          cursor: 'pointer',
          marginRight: '0.5rem',
          fontSize: '1rem'
        }
      });
      viewBtn.innerHTML = '✏️';
      viewBtn.addEventListener('click', () => {
        container.dispatchEvent(new CustomEvent('view-proposal', { detail: { id, cardId: card.cardId || card.id || id }, bubbles: true, composed: true }));
      });
      actionsTd.appendChild(viewBtn);

      // Botón borrar (papelera) - solo si el año NO es de solo lectura
      if (!this._isYearReadOnly()) {
        const deleteBtn = UIUtils.createElement('button', {
          className: 'delete-proposal-btn',
          type: 'button',
          title: 'Eliminar proposal',
          style: {
            padding: '0.4rem',
            borderRadius: '4px',
            border: '1px solid #dc3545',
            background: 'var(--bg-primary, #fff)',
            color: '#dc3545',
            cursor: 'pointer',
            fontSize: '1rem'
          }
        });
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.addEventListener('click', () => {
          this._showDeleteProposalConfirmation(container, id, card, config.projectId);
        });
        actionsTd.appendChild(deleteBtn);
      }

      row.appendChild(actionsTd);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    // Wrap table in scrollable container for narrow screens
    const tableWrapper = UIUtils.createElement('div', {
      style: { overflowX: 'auto', width: '100%' }
    });
    tableWrapper.appendChild(table);
    container.appendChild(tableWrapper);
  }

  /**
   * Muestra modal de confirmación para eliminar un proposal
   * @param {HTMLElement} container - Contenedor de la tabla
   * @param {string} id - Firebase ID del proposal
   * @param {Object} card - Datos del proposal
   */
  _showDeleteProposalConfirmation(container, id, card, projectId) {
    const cardId = card.cardId || card.id || id;
    const title = card.title || 'Sin título';

    // Crear modal usando las propiedades correctas de app-modal
    const modal = document.createElement('app-modal');
    modal._programmaticMode = true;
    modal.title = '⚠️ ¿Eliminar proposal?';
    modal.message = `<strong>${cardId}</strong><br><span style="color:var(--text-muted, #666)">${title}</span>`;
    modal.maxWidth = '400px';
    modal.showHeader = true;
    modal.showFooter = true;
    modal.button1Text = 'Eliminar';
    modal.button2Text = 'Cancelar';
    modal.button1Css = 'background: #dc3545; color: #fff; border: none;';
    modal.button2Css = 'background: var(--bg-primary, #fff); color: var(--text-muted, #6c757d); border: 1px solid var(--border-default, #6c757d);';

    modal.button1Action = () => {
      container.dispatchEvent(new CustomEvent('delete-card', {
        detail: {
          cardData: {
            ...card,
            id,
            cardId,
            projectId: card.projectId || projectId,
            group: card.group || 'proposals',
            cardType: card.cardType || 'proposal-card'
          }
        },
        bubbles: true,
        composed: true
      }));
      return true;
    };

    modal.button2Action = () => true;

    document.body.appendChild(modal);
  }

  /**
   * Muestra modal de confirmación para eliminar un bug
   * @param {HTMLElement} container - Contenedor de la tabla
   * @param {string} id - Firebase ID del bug
   * @param {Object} card - Datos del bug
   */
  _showDeleteConfirmation(container, id, card, projectId) {
    const cardId = card.cardId || card.id || id;
    const title = card.title || 'Sin título';

    // Crear modal usando las propiedades correctas de app-modal
    const modal = document.createElement('app-modal');
    modal._programmaticMode = true;
    modal.title = '⚠️ ¿Eliminar bug?';
    modal.message = `<strong>${cardId}</strong><br><span style="color:var(--text-muted, #666)">${title}</span>`;
    modal.maxWidth = '400px';
    modal.showHeader = true;
    modal.showFooter = true;
    modal.button1Text = 'Eliminar';
    modal.button2Text = 'Cancelar';
    modal.button1Css = 'background: #dc3545; color: #fff; border: none;';
    modal.button2Css = 'background: var(--bg-primary, #fff); color: var(--text-muted, #6c757d); border: 1px solid var(--border-default, #6c757d);';

    modal.button1Action = () => {
      container.dispatchEvent(new CustomEvent('delete-card', {
        detail: {
          cardData: {
            ...card,
            id,
            cardId,
            projectId: card.projectId || projectId,
            group: card.group || 'bugs',
            cardType: card.cardType || 'bug-card'
          }
        },
        bubbles: true,
        composed: true
      }));
      return true;
    };

    modal.button2Action = () => true;

    document.body.appendChild(modal);
  }
} 
