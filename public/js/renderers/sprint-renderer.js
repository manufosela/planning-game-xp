import { UIUtils } from '../utils/ui-utils.js';
import { showExpandedCardInModal } from '../utils/common-functions.js';
import { hydrateTaskCard } from '../utils/task-card-hydrate.js';

export class SprintRenderer {
  constructor() {
    this.draggedElement = null;
    this.dropZoneHandler = null;
  }

  renderSprintColumns(container, sprintList) {
    container.innerHTML = '';

    // Paleta de gradientes únicos para cada sprint
    const sprintGradients = [
      'linear-gradient(135deg, #6366f1, #818cf8)',  // Indigo
      'linear-gradient(135deg, #3b82f6, #2563eb)',  // Blue
      'linear-gradient(135deg, #10b981, #059669)',  // Emerald
      'linear-gradient(135deg, #f59e0b, #d97706)',  // Amber
      'linear-gradient(135deg, #8b5cf6, #7c3aed)',  // Violet
      'linear-gradient(135deg, #f43f5e, #e11d48)',  // Rose
      'linear-gradient(135deg, #06b6d4, #0891b2)',  // Cyan
      'linear-gradient(135deg, #ec4899, #db2777)',  // Pink
      'linear-gradient(135deg, #14b8a6, #0d9488)',  // Teal
      'linear-gradient(135deg, #f97316, #ea580c)'   // Orange
    ];

    // Ordenar sprints de mayor a menor (por título)
    const sortedSprints = Object.entries(sprintList).sort(([, a], [, b]) => {
      // Extraer número del título si existe (ej: "Sprint 3" -> 3)
      const getSprintNumber = (title) => {
        const match = title.match(/sprint\s*(\d+)/i);
        return match ? parseInt(match[1]) : 0;
      };

      const numA = getSprintNumber(a.title || '');
      const numB = getSprintNumber(b.title || '');

      // Ordenar de mayor a menor (descending)
      return numB - numA;
    });

    // Add sprint columns only
    sortedSprints.forEach(([sprintId, sprint], index) => {
      const column = UIUtils.createElement('div', {
        className: 'sprint-column',
        'data-sprint-id': sprintId,
        style: {
          width: '250px',
          minWidth: '250px',
          maxWidth: '250px',
          flexShrink: '0',
          display: 'flex',
          flexDirection: 'column'
        }
      });

      const header = UIUtils.createElement('h4', {}, sprint.title || `Sprint ${sprintId}`);

      // Aplicar gradiente único para cada sprint usando el índice
      const gradientIndex = index % sprintGradients.length;
      const headerGradient = sprintGradients[gradientIndex];

      // Apply compact styles matching kanban view
      Object.assign(header.style, {
        background: headerGradient,
        margin: '0',
        padding: '0.5rem',
        color: 'white',
        borderRadius: '6px',
        textAlign: 'center',
        fontSize: '0.9rem',
        fontWeight: '600',
        letterSpacing: '0.5px',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        textShadow: '1px 1px 2px rgba(0, 0, 0, 0.2)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        marginBottom: '0.5rem',
        minHeight: '2rem',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: '1.2'
      });

      const tasksContainer = UIUtils.createElement('div', {
        className: 'sprint-tasks',
        'data-sprint-id': sprintId
      });

      const pointsInfo = UIUtils.createElement('div', {
        className: 'sprint-points',
        style: { fontSize: '0.9em', color: '#64748b', marginTop: '0.5rem' }
      }, `B: ${sprint.businessPoints || 0} | D: ${sprint.devPoints || 0}`);

      column.appendChild(header);
      column.appendChild(tasksContainer);
      column.appendChild(pointsInfo);
      container.appendChild(column);
    });
  }

  renderTasksInSprints(tasks, config) {
    // Clear all sprint columns and backlog
    document.querySelectorAll('.sprint-tasks').forEach(container => {
      container.innerHTML = '';
    });

    const backlogContainer = document.getElementById('backlog-cards');
    if (backlogContainer) {
      backlogContainer.innerHTML = '';
    }

    tasks.forEach(taskData => {
      const sprintId = taskData.sprint;

      if (!sprintId || sprintId === 'backlog' || sprintId === '') {
        // Task goes to backlog
        if (backlogContainer) {
          const task = this.createSprintTask(taskData, config);
          backlogContainer.appendChild(task);
        }
      } else {
        // Task goes to specific sprint column
        const column = document.querySelector(`[data-sprint-id="${sprintId}"] .sprint-tasks`);
        if (column) {
          const task = this.createSprintTask(taskData, config);
          column.appendChild(task);
        }
      }
    });
  }

  createSprintTask(taskData, config) {
    const task = document.createElement(taskData.cardType);

    // Hydrate through the shared allowlist helper — a blind spread here
    // used to throw when the snapshot carried derived getters like
    // `priority` (PLN-BUG-0115, same root cause as PLN-BUG-0105 in PgBoard).
    hydrateTaskCard(task, taskData);

    // Ensure firebaseId is set (id from Firebase)
    task.firebaseId = taskData.id;

    // Set id attribute explicitly for drag/drop
    task.setAttribute('id', taskData.id);

    task.projectId = config.projectId;
    task.userEmail = config.userEmail;
    task.draggable = true;

    // Use ultra-compact view for sprint
    task.viewMode = 'ultra-compact';

    // Add event listeners
    this.addTaskEventListeners(task);

    return task;
  }

  addTaskEventListeners(task) {
    task.addEventListener('click', (e) => {
      e.stopPropagation();
      showExpandedCardInModal(task);
    });

    task.addEventListener('dragstart', (e) => {
      this.draggedElement = task;
      task.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', task.outerHTML);
    });

    task.addEventListener('dragend', () => {
      task.classList.remove('dragging');
      this.draggedElement = null;
    });
  }

  setupDragAndDrop(onTaskDrop) {
    this.dropZoneHandler = onTaskDrop;

    // Setup drag and drop for sprint columns
    document.querySelectorAll('.sprint-tasks').forEach(dropZone => {
      dropZone.addEventListener('dragover', this.handleDragOver.bind(this));
      dropZone.addEventListener('drop', this.handleDrop.bind(this));
      dropZone.addEventListener('dragenter', this.handleDragEnter.bind(this));
      dropZone.addEventListener('dragleave', this.handleDragLeave.bind(this));
    });

    // Setup drag and drop for backlog
    const backlogContainer = document.getElementById('backlog-cards');
    if (backlogContainer) {
      backlogContainer.addEventListener('dragover', this.handleDragOver.bind(this));
      backlogContainer.addEventListener('drop', this.handleBacklogDrop.bind(this));
      backlogContainer.addEventListener('dragenter', this.handleDragEnter.bind(this));
      backlogContainer.addEventListener('dragleave', this.handleDragLeave.bind(this));
    }
  }

  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  handleDragEnter(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  }

  handleDragLeave(e) {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget)) {
      e.currentTarget.classList.remove('drag-over');
    }
  }

  handleDrop(e) {
    e.preventDefault();
    const dropZone = e.currentTarget;
    dropZone.classList.remove('drag-over');

    if (this.draggedElement && this.dropZoneHandler) {
      const newSprintId = dropZone.dataset.sprintId;
      const taskId = this.draggedElement.id;

      // Check if dropping in the same column - skip if no change
      const currentColumn = this.draggedElement.closest('.sprint-tasks');
      if (currentColumn && currentColumn.dataset.sprintId === newSprintId) {
        return; // No change needed
      }

      // Don't manually move the element - let Firebase re-render handle it
      // This prevents duplication when Firebase updates

      // Notify about the change
      this.dropZoneHandler(taskId, newSprintId === 'backlog' ? '' : newSprintId);
    }
  }

  handleBacklogDrop(e) {
    e.preventDefault();
    const dropZone = e.currentTarget;
    dropZone.classList.remove('drag-over');

    if (this.draggedElement && this.dropZoneHandler) {
      const taskId = this.draggedElement.id;

      // Check if already in backlog - skip if no change
      const currentBacklog = this.draggedElement.closest('#backlog-cards');
      if (currentBacklog) {
        return; // Already in backlog, no change needed
      }

      // Don't manually move the element - let Firebase re-render handle it
      // This prevents duplication when Firebase updates

      // Notify about the change - pass empty string for backlog
      this.dropZoneHandler(taskId, '');
    }
  }

  cleanup() {
    this.draggedElement = null;
    this.dropZoneHandler = null;
  }
}