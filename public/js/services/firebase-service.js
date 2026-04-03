import { database, ref, push, set, get, onValue, update, databaseFirestore, getDoc, setDoc, doc, runTransaction, auth, firebaseConfig, superAdminEmail } from '../../firebase-config.js';
import { encodeEmailForFirebase, decodeEmailFromFirebase } from '../utils/email-sanitizer.js';
import { sanitizeEmailForFirebase } from '../utils/email-sanitizer.js';
import { permissionService } from './permission-service.js';
import { historyService } from './history-service.js';
import { userDirectoryService } from './user-directory-service.js';
import { entityDirectoryService } from './entity-directory-service.js';
import { developerBacklogService } from './developer-backlog-service.js';
import { normalizeDeveloperEntry } from '../utils/developer-normalizer.js';
import { normalizeProjectPeople } from '../utils/project-people-utils.js';
import { APP_CONSTANTS } from '../constants/app-constants.js';
import { CARD_SCHEMAS } from '../schemas/card-field-schemas.js';
import { demoModeService } from './demo-mode-service.js';

const normalizeEmail = (email) => (email || '').toString().trim().toLowerCase();
const legacyEncodeEmail = (email) => normalizeEmail(email).replace(/[@.#$\[\]\/]/g, '_');

export const FirebaseService = {
  /**
   * Inicializa los event listeners para comunicación via eventos
   */
  init() {
    if (!this._eventListenersSetup) {
      this.setupEventListeners();
      this._eventListenersSetup = true;
    }
  },

  /**
   * Configura los event listeners para card-action requests
   */
  setupEventListeners() {
    document.addEventListener('request-card-action', this.handleCardActionRequest.bind(this));
},

  /**
   * Maneja solicitudes de acciones de tarjetas via eventos
   * @param {CustomEvent} event - Evento de solicitud de acción
   */
  async handleCardActionRequest(event) {
    const { requestId, action, cardData, options = {}, ...additionalData } = event.detail;
    try {
      let result;

      switch (action) {
        case 'save':
          result = await this.saveCard(cardData, options);
          break;

        case 'delete':
          result = await this.deleteCard(cardData);
          break;

        case 'get':
          result = await this.getCards(additionalData.cardPath);
          break;

        case 'generateId':
          result = await this.generateProjectSectionId(additionalData.projectSectionAbbr);
          break;

        case 'addSuite':
          result = await this.addSuite(additionalData.projectId, additionalData.suiteName);
          break;

        case 'deleteSuite':
          result = await this.deleteSuite(additionalData.projectId, additionalData.suiteId);
          break;

        case 'getSuites':
          result = await this.getSuites(additionalData.projectId);
          break;

        case 'getQACards':
          result = await this.getQACards(additionalData.projectId);
          break;

        case 'initializeProjectCounters':
          result = await this.initializeProjectCounters(
            additionalData.projectId,
            additionalData.options || {}
          );
          break;

        case 'syncProjectCounters':
          result = await this.syncProjectCounters(
            additionalData.projectId,
            additionalData.options || {}
          );
          break;

        default:
          throw new Error(`Unknown card action: ${action}`);
      }

      // Responder con el resultado
      document.dispatchEvent(new CustomEvent('provide-card-action-result', {
        detail: {
          requestId,
          action,
          success: true,
          result
        },
        bubbles: true,
        composed: true
      }));
    } catch (error) {
      console.error(`[FirebaseService] handleCardActionRequest failed:`, {
        action,
        requestId,
        cardData: cardData ? { cardId: cardData.cardId, id: cardData.id, group: cardData.group } : null,
        error: error.message,
        stack: error.stack
      });
      // Responder con error
      document.dispatchEvent(new CustomEvent('provide-card-action-result', {
        detail: {
          requestId,
          action,
          success: false,
          error: error.message
        },
        bubbles: true,
        composed: true
      }));
    }
  },
  /**
   * Obtiene los permisos del usuario actual para una operación específica en una card
   * @param {Object} card - Los datos de la card
   * @param {string} action - La acción a verificar ('delete', 'edit', 'save', etc.)
   * @returns {boolean} - true si tiene permisos, false si no
   */
  async checkUserPermissions(card, action = 'delete') {
    if (!auth.currentUser) {
      return false;
    }

    // Obtener información del usuario actual
    const currentUserEmail = auth.currentUser.email;
    const userRole = window.currentUserRole || { isResponsable: false };
    const currentViewMode = window.currentViewMode || 'consultation';

    // Inicializar el permission service con los datos actuales
    permissionService.init(
      { email: currentUserEmail },
      userRole,
      currentViewMode
    );

    // Obtener permisos para la card
    const cardType = card.cardType?.replace('-card', '') || 'card';
    const permissions = permissionService.getCardPermissions(card, cardType);
// Devolver el permiso específico solicitado
    switch (action) {
      case 'delete': return permissions.canDelete;
      case 'edit': return permissions.canEdit;
      case 'save': return permissions.canSave;
      case 'view': return permissions.canView;
      case 'create': return permissions.canCreate;
      default: return false;
    }
  },
  /**
   * Check if current user is the SuperAdmin (only ONE, defined in .env)
   * NOTE: /data/superAdminEmails in database is DEPRECATED and no longer used
   */
  async _isCurrentUserSuperAdmin() {
    const email = normalizeEmail(auth.currentUser?.email || document.body.dataset.userEmail);
    if (!email) return false;

    // Only check against superAdminEmail from .env (via firebase-config.js)
    const envSuperAdmin = superAdminEmail ? normalizeEmail(superAdminEmail) : '';
    return envSuperAdmin && envSuperAdmin === email;
  },
  _deriveNameFromEmail(email) {
    if (!email || typeof email !== 'string') return '';
    const local = email.split('@')[0] || '';
    if (!local) return email;
    return local
      .replace(/#ext#/gi, '')
      .replace(/[._-]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  },
  async _applyWipLogic(card, previousState) {
    const operations = {
      openEntry: null,
      closeCurrent: null,
      closeOthers: [],
      closeSameTask: [],
      switchDeveloper: null,
      timelineUpdates: [],
      backlogRemovals: [],
      backlogUpdates: [],
      backlogAdds: []
    };

    const ensureDeveloperKey = async (value, createIfEmail = false) => {
      const candidate = entityDirectoryService.resolveDeveloperId(value);
      if (candidate?.startsWith('dev_') && entityDirectoryService.getDeveloper(candidate)) {
        return candidate;
      }

      const raw = (value || '').toString().trim();

      // Si el valor ya tiene formato dev_XXX, confiar en él aunque no esté en cache local
      // (el dropdown solo muestra IDs válidos, así que si llegamos aquí es porque el cache no está sincronizado)
      if (raw.startsWith('dev_')) {
        return raw;
      }

      const isEmail = raw.includes('@');

      if (createIfEmail && isEmail) {
        const createdId = await entityDirectoryService.findOrCreateDeveloper(raw, null);
        if (createdId) {
          return createdId;
        }
      }

      return null;
    };

    const group = (card.group || '').toString().trim().toLowerCase();
    if (group !== 'tasks' && group !== 'proposals') {
      return operations;
    }

    if (!card.projectId) {
      return operations;
    }

    if (group === 'proposals' && (!card.status || card.status.trim() === '')) {
      card.status = previousState?.status || 'To Do';
    }
    const newStatus = (card.status || '').toLowerCase();
    const previousStatus = (previousState?.status || '').toLowerCase();
    const currentUserEmail = normalizeEmail(auth.currentUser?.email || document.body.dataset.userEmail);
    const isSuperAdmin = await this._isCurrentUserSuperAdmin();
    if (!card.cardId) {
      throw new Error('card.cardId is required for backlog operations');
    }
    const cardKey = developerBacklogService.buildCardKey(card.projectId, card.cardType || 'task-card', card.cardId);

    // Asegurar que entityDirectoryService esté inicializado
    await entityDirectoryService.waitForInit();

    // Resolver developer a ID
    let developerId = await ensureDeveloperKey(card.developer, true);

    if (developerId) {
      card.developer = developerId;
      card.developerName = entityDirectoryService.getDeveloperDisplayName(developerId);
    }

    // Enforce developer assignment for In Progress
    if (newStatus === 'in progress') {
      // Si no hay developer ID, intentar resolver el usuario actual
      if (!developerId) {
        developerId = entityDirectoryService.resolveDeveloperId(currentUserEmail);
        // Si el usuario actual no está en el directorio, crear entrada
        if (!developerId && currentUserEmail) {
          developerId = await entityDirectoryService.findOrCreateDeveloper(currentUserEmail, null);
        }
      }

      // Solo forzar al usuario actual si NO es super admin y está intentando asignar a otro
      if (!isSuperAdmin && developerId) {
        const currentUserId = entityDirectoryService.resolveDeveloperId(currentUserEmail);
        if (currentUserId && developerId !== currentUserId) {
          developerId = currentUserId;
        }
      }

      // Actualizar card con el ID y nombre
      if (developerId) {
        card.developer = developerId;
        card.developerName = entityDirectoryService.getDeveloperDisplayName(developerId);
      }
    }

    // Obtener developer ID y del estado previo
    const developerKey = developerId || '';
    const previousDevId = await ensureDeveloperKey(previousState?.developer || previousState?.currentWip?.developer);
    const previousDevKey = previousDevId || '';

    const backlogMeta = {
      cardKey,
      cardData: {
        cardId: card.cardId,
        firebaseId: card.firebaseId,
        projectId: card.projectId,
        cardType: card.cardType || 'task-card',
        title: card.title || card.cardId,
        status: card.status
      }
    };

    const isTodoLike = ['to do', 'todo', 'pending'].includes(newStatus);

    // Cambio de developer manteniendo In Progress: cerrar la entrada anterior
    if (group === 'tasks' && newStatus === 'in progress' && previousStatus === 'in progress' && developerKey && previousDevKey && developerKey !== previousDevKey) {
      const prevStartedAt = previousState?.currentWip?.startedAt || previousState?.startDate || new Date().toISOString();
      const prevEntry = {
        taskId: card.firebaseId,
        cardId: card.cardId,
        taskTitle: card.title || card.cardId || '',
        startedAt: prevStartedAt,
        developer: previousDevKey,
        developerName: entityDirectoryService.getDeveloperDisplayName(previousDevKey),
        projectId: card.projectId
      };
      operations.switchDeveloper = {
        projectId: card.projectId,
        developerKey: previousDevKey,
        entry: prevEntry
      };

      operations.backlogRemovals.push({ developerKey: previousDevKey, cardKey });
    }

    // Entrando a In Progress
    if (group === 'tasks' && newStatus === 'in progress' && developerKey) {
      const startedAt = new Date().toISOString();
      const developerName = entityDirectoryService.getDeveloperDisplayName(developerKey);

      card.currentWip = {
        developer: developerKey,
        developerName,
        startedAt,
        taskId: card.firebaseId,
        cardId: card.cardId,
        projectId: card.projectId
      };

      operations.openEntry = {
        developerKey,
        entry: {
          taskId: card.firebaseId,
          cardId: card.cardId,
          taskTitle: card.title || card.cardId || '',
          startedAt,
          developer: developerKey,
          developerName,
          projectId: card.projectId
        }
      };

      // CoDeveloper WIP entry: create entry for pair developer if exists
      if (card.coDeveloper) {
        const coDeveloperId = await ensureDeveloperKey(card.coDeveloper, true);
        if (coDeveloperId && coDeveloperId !== developerKey) {
          const coDeveloperName = entityDirectoryService.getDeveloperDisplayName(coDeveloperId);
          operations.openCoDeveloperEntry = {
            developerKey: coDeveloperId,
            entry: {
              taskId: card.firebaseId,
              cardId: card.cardId,
              taskTitle: card.title || card.cardId || '',
              startedAt,
              developer: coDeveloperId,
              developerName: coDeveloperName,
              projectId: card.projectId,
              isCoDeveloper: true,
              mainDeveloper: developerKey,
              mainDeveloperName: developerName
            }
          };
        }
      }

      operations.backlogRemovals.push({ developerKey, cardKey });

      const existingEntries = await this._fetchExistingWipEntries(developerKey, card.projectId, card.firebaseId);
      operations.closeOthers = existingEntries.closeByDeveloper || [];
      operations.closeSameTask = existingEntries.closeByTask || [];

      operations.timelineUpdates.push({
        developerKey,
        newState: {
          status: 'active',
          startedAt,
          taskId: card.firebaseId,
          cardId: card.cardId,
          projectId: card.projectId,
          developer: developerKey
        }
      });
    }

    // Saliendo de In Progress
    if (group === 'tasks' && previousStatus === 'in progress' && newStatus !== 'in progress' && developerKey) {
      const startedAt = previousState?.currentWip?.startedAt || previousState?.startDate || new Date().toISOString();
      const endedAt = new Date().toISOString();
      const developerName = entityDirectoryService.getDeveloperDisplayName(developerKey);

      // Determinar razón del cierre
      const endReason = newStatus === 'done&validated' ? 'completed' :
        (!developerKey || developerKey === '') ? 'unassigned' : 'switched';

      // wipHistory is stored in /wipHistory, not in the task
      card.currentWip = null;

      operations.closeCurrent = {
        projectId: card.projectId,
        developerKey,
        entry: {
          taskId: card.firebaseId,
          cardId: card.cardId,
          taskTitle: card.title || card.cardId,
          projectId: card.projectId,
          developer: developerKey,
          developerName,
          startedAt
        },
        endReason,
        finalStatus: newStatus
      };

      operations.timelineUpdates.push({
        developerKey,
        newState: {
          status: 'idle',
          startedAt: endedAt,
          taskId: '',
          projectId: card.projectId,
          developer: developerKey
        },
        closePrevious: {
          status: 'active',
          startedAt,
          taskId: card.firebaseId,
          cardId: card.cardId,
          projectId: card.projectId,
          developer: developerKey
        }
      });

      // Close CoDeveloper WIP entry if exists
      if (card.coDeveloper) {
        const coDeveloperId = entityDirectoryService.resolveDeveloperId(card.coDeveloper);
        if (coDeveloperId && coDeveloperId !== developerKey) {
          operations.closeCoDeveloperEntry = {
            developerKey: coDeveloperId
          };
        }
      }
    }

    if (developerKey) {
      operations.backlogUpdates.push({ developerKey, cardKey, cardData: backlogMeta.cardData });
    }
    if (previousDevKey && previousDevKey !== developerKey) {
      operations.backlogUpdates.push({ developerKey: previousDevKey, cardKey, cardData: backlogMeta.cardData });
    }
    if (newStatus === 'done&validated' && developerKey) {
      operations.backlogRemovals.push({ developerKey, cardKey });
    }
    if (!developerKey && previousDevKey) {
      operations.backlogRemovals.push({ developerKey: previousDevKey, cardKey });
    }

    // Auto-backlog para tareas To Do/Pending asignadas
    if (isTodoLike) {
      if (card.developer && !developerKey) {
        console.error('[_prepareWipOperations] Failed to resolve developer for backlog:', card.developer);
        throw new Error('No se pudo resolver el developer asignado para backlog');
      }
      if (developerKey) {
        operations.backlogAdds.push({ developerKey, cardKey, cardData: backlogMeta.cardData });
      }
      if (previousDevKey && previousDevKey !== developerKey) {
        operations.backlogRemovals.push({ developerKey: previousDevKey, cardKey });
      }
    }

    return operations;
  },
  async _fetchExistingWipEntries(developerKey, currentProjectId, currentTaskId) {
    try {
      const snap = await get(ref(database, '/wip'));
      if (!snap.exists()) return { closeByDeveloper: [], closeByTask: [] };

      const closeByDeveloper = [];
      const closeByTask = [];

      Object.entries(snap.val() || {}).forEach(([storedKey, existingEntry]) => {
        if (!existingEntry || existingEntry.taskId === 'idle') return;

        // Con IDs estables (dev_XXX), la comparación es directa
        const isSameDeveloper = storedKey === developerKey ||
          existingEntry.developer === developerKey ||
          entityDirectoryService.resolveDeveloperId(storedKey) === developerKey ||
          entityDirectoryService.resolveDeveloperId(existingEntry.developer) === developerKey;

        // Cerrar otras tareas del mismo developer
        if (isSameDeveloper && existingEntry.taskId !== currentTaskId) {
          closeByDeveloper.push({
            projectId: existingEntry.projectId,
            developerKey: storedKey,
            entry: existingEntry
          });
        }

        // Cerrar entradas que referencian la misma tarea con otro developer
        if (existingEntry.taskId && existingEntry.taskId === currentTaskId && storedKey !== developerKey) {
          closeByTask.push({
            projectId: existingEntry.projectId,
            developerKey: storedKey,
            entry: existingEntry
          });
        }
      });

      return { closeByDeveloper, closeByTask };
    } catch (error) {
      console.error('[FirebaseService] _fetchExistingWipEntries failed:', error.message);
      return { closeByDeveloper: [], closeByTask: [] };
    }
  },
  async _closeWipEntry(projectId, developerKey, entry, { forceToDo = true, endReason = 'switched' } = {}) {
    try {
      const taskPath = `${this.getPathBySectionAndProjectId('tasks', entry.projectId || projectId)}/${entry.taskId}`;
      const taskRef = ref(database, taskPath);
      let taskData = null;
      try {
        const taskSnap = await get(taskRef);
        if (taskSnap.exists()) {
          taskData = taskSnap.val();
        }
      } catch (error) {
        console.warn('[FirebaseService] _closeWipEntry: Could not fetch task data:', error.message);
      }

      const endedAt = new Date().toISOString();
      const startedAt = entry.startedAt || taskData?.currentWip?.startedAt || endedAt;
      const durationMs = Math.max(0, new Date(endedAt) - new Date(startedAt));

      // Guardar en /wipHistory/{devKey}/{timestamp}
      const devId = entry.developer || taskData?.developer || developerKey;
      const historyEntry = {
        taskId: entry.taskId,
        taskTitle: entry.taskTitle || taskData?.title || entry.taskId,
        projectId: entry.projectId || projectId,
        developer: devId,
        developerName: entry.developerName || taskData?.developerName || entityDirectoryService.getDeveloperDisplayName(devId),
        startedAt,
        endedAt,
        durationMs,
        endReason, // 'completed' | 'switched' | 'unassigned'
        finalStatus: forceToDo ? 'To Do' : (taskData?.status || 'In Progress')
      };

      const historyId = Date.now().toString();
      await set(ref(database, `/wipHistory/${developerKey}/${historyId}`), historyEntry);

      // Update task to clear currentWip (wipHistory is stored separately in /wipHistory)
      if (taskData) {
        const updates = { currentWip: null };
        if (forceToDo) {
          updates.status = 'To Do';
        }
        // Only update specific fields, not the whole task
        const taskUpdatesRef = ref(database, taskPath);
        const currentData = await get(taskUpdatesRef);
        if (currentData.exists()) {
          const cleanedTask = this.cleanCardBeforeSave({ ...currentData.val(), ...updates });
          await set(taskRef, cleanedTask);
        }
      }

      // Limpiar entrada actual de /wip
      await set(ref(database, `/wip/${developerKey}`), null);
    } catch (error) {
      console.error('[FirebaseService] _closeWipEntry failed:', {
        projectId,
        developerKey,
        taskId: entry?.taskId,
        error: error.message
      });
    }
  },
  async _executeWipOperations(operations) {
    try {
      const backlogRemovals = (operations.backlogRemovals || []).filter(item => item?.developerKey && item?.cardKey);
      const backlogUpdates = (operations.backlogUpdates || []).filter(item => item?.developerKey && item?.cardKey);
      const backlogAdds = (operations.backlogAdds || []).filter(item => item?.developerKey && item?.cardKey);

      // Cerrar WIP activos de otras tareas del mismo developer
      for (const item of operations.closeOthers || []) {
        await this._closeWipEntry(item.projectId, item.developerKey, item.entry, { forceToDo: true, endReason: 'switched' });
      }

      // Cerrar WIP de la misma tarea asignada a otro developer
      for (const item of operations.closeSameTask || []) {
        await this._closeWipEntry(item.projectId, item.developerKey, item.entry, { forceToDo: true, endReason: 'switched' });
      }

      // Cerrar WIP actual al salir de In Progress (guardar en historial)
      if (operations.closeCurrent) {
        const { projectId, developerKey, entry, endReason, finalStatus } = operations.closeCurrent;
        if (entry) {
          // Guardar en /wipHistory antes de eliminar de /wip
          const endedAt = new Date().toISOString();
          const startedAt = entry.startedAt || endedAt;
          const durationMs = Math.max(0, new Date(endedAt) - new Date(startedAt));

          const historyEntry = {
            taskId: entry.taskId,
            taskTitle: entry.taskTitle,
            projectId: entry.projectId || projectId,
            developer: entry.developer,
            developerName: entry.developerName,
            startedAt,
            endedAt,
            durationMs,
            endReason: endReason || 'completed',
            finalStatus: finalStatus || 'Done&Validated'
          };

          const historyId = Date.now().toString();
          await set(ref(database, `/wipHistory/${developerKey}/${historyId}`), historyEntry);
        }
        await set(ref(database, `/wip/${developerKey}`), null);
      }

      // Abrir WIP actual
      if (operations.openEntry) {
        await set(ref(database, `/wip/${operations.openEntry.developerKey}`), operations.openEntry.entry);
      }

      // Abrir WIP para CoDeveloper si existe
      if (operations.openCoDeveloperEntry) {
        await set(ref(database, `/wip/${operations.openCoDeveloperEntry.developerKey}`), operations.openCoDeveloperEntry.entry);
      }

      // Cambiar developer manteniendo In Progress: cerrar entrada previa sin tocar estado
      if (operations.switchDeveloper) {
        await this._closeWipEntry(operations.switchDeveloper.projectId, operations.switchDeveloper.developerKey, operations.switchDeveloper.entry, { forceToDo: false, endReason: 'switched' });
      }

      // Cerrar WIP del CoDeveloper al salir de In Progress
      if (operations.closeCoDeveloperEntry) {
        await set(ref(database, `/wip/${operations.closeCoDeveloperEntry.developerKey}`), null);
      }

      // Backlog updates
      for (const item of backlogRemovals) {
        await developerBacklogService.removeItem(item.developerKey, item.cardKey);
      }
      for (const item of backlogUpdates) {
        await developerBacklogService.updateIfExists(item.developerKey, { ...item.cardData, cardKey: item.cardKey });
      }
      for (const item of backlogAdds) {
        await developerBacklogService.addItem(item.developerKey, { ...item.cardData, cardKey: item.cardKey });
      }
    } catch (error) {
      console.error('[FirebaseService] _executeWipOperations failed:', {
        error: error.message,
        stack: error.stack
      });
    }
  },
  /**
   * Limpia los campos innecesarios antes de guardar en Firebase
   * @param {Object} card - La tarjeta a limpiar
   * @returns {Object} - La tarjeta limpia
   */
  cleanCardBeforeSave(card) {
    const cardType = card.cardType;
    const schema = CARD_SCHEMAS[cardType];
    if (!schema) {
      console.warn(`[FirebaseService] Unknown card type for schema: ${cardType}, using legacy clean`);
      return this._legacyCleanCard(card);
    }

    // Fields where empty string '' means "not set" — skip to avoid overwriting real values
    const SKIP_IF_EMPTY = new Set([
      'startDate', 'endDate', 'developer', 'coDeveloper', 'validator', 'coValidator',
      'sprint', 'epic', 'firebaseId', 'cardId'
    ]);

    const persistentFields = new Set(schema.PERSISTENT_FIELDS);
    const cleanCard = {};
    for (const [key, value] of Object.entries(card)) {
      if (!persistentFields.has(key) || value === undefined) continue;
      // Skip empty strings for fields that should not overwrite real values
      if (SKIP_IF_EMPTY.has(key) && value === '') continue;
      try {
        cleanCard[key] = JSON.parse(JSON.stringify(value));
      } catch {
        // Skip non-serializable values
      }
    }
    return cleanCard;
  },

  _legacyCleanCard(card) {
    const fieldsToRemove = [
      'globalSprintList', 'statusList', 'projectsStakeHolders', 'stakeholders',
      'developerList', 'bugTypeList', 'epicTypeList', 'priorityList',
      'bugpriorityList', 'userAuthorizedEmails',
      'history', 'cardHistory', 'wipHistory', 'currentWip',
      'activeTab', 'expanded', 'isEditable', 'isSaving', 'newNoteText',
      'originalStatus', 'originalFiles',
      'acceptanceCriteriaColor', 'descriptionColor', 'notesColor', 'userEmail',
      'invalidFields', 'canEditPermission', '_cachedElements', '_previousState',
      'shadowRoot', 'renderRoot'
    ];

    let cleanCard;
    try {
      cleanCard = JSON.parse(JSON.stringify(card));
    } catch {
      cleanCard = {};
      for (const [key, value] of Object.entries(card)) {
        if (typeof value !== 'function') {
          try { cleanCard[key] = value; } catch { /* skip */ }
        }
      }
    }

    for (const field of fieldsToRemove) {
      delete cleanCard[field];
    }
    for (const key of Object.keys(cleanCard)) {
      if (key.endsWith('List') && !key.endsWith('elatedTasksList')) {
        delete cleanCard[key];
      }
    }

    return cleanCard;
  },

  async saveCard(card, options = {}) {
    // NUEVO: Eliminar ID temporal si existe (verificar tanto id como cardId)
    if (card.id && (card.id.startsWith('temp_') || card.id.includes('temp'))) {
      console.warn('[FirebaseService] Removing temporary id:', card.id);
      delete card.id;
      delete card.firebaseId; // También eliminar firebaseId si existe
    }

    // CRÍTICO: También verificar y limpiar card.cardId temporal
    if (card.cardId && (card.cardId.startsWith('temp_') || card.cardId.includes('temp'))) {
      console.warn('[FirebaseService] Removing temporary cardId:', card.cardId);
      delete card.cardId; // El cardId se regenerará más abajo en la línea 172
    }

    // BACKLOG FIX: Inferir group de cardType si no está establecido
    if (!card.group && card.cardType) {
      const cardTypeLower = (card.cardType || '').toLowerCase();
      if (cardTypeLower.includes('task')) {
        card.group = 'tasks';
      } else if (cardTypeLower.includes('bug')) {
        card.group = 'bugs';
      } else if (cardTypeLower.includes('proposal')) {
        card.group = 'proposals';
      } else if (cardTypeLower.includes('epic')) {
        card.group = 'epics';
      } else if (cardTypeLower.includes('sprint')) {
        card.group = 'sprints';
      }
    }

    if (!card.cardId) {
      const newCardId = await this.generateProjectSectionId(card.projectId, card.group);
      card.cardId = newCardId;
    }

    if (!auth.currentUser) {
      console.error('[FirebaseService] saveCard failed: User not authenticated');
      document.dispatchEvent(new CustomEvent('show-slide-notification', { detail: { options: { message: 'You must be logged in to save the card' } } }));
      return;
    }

    let cardRef;
    let cardPath;

    // Determinar si es una tarjeta nueva o existente basándose en si tiene Firebase ID
    const isNewCard = !card.firebaseId && !card.id;

    // Demo mode: enforce card count limit for new cards
    if (isNewCard && demoModeService.isDemo() && demoModeService.maxTasksPerProject > 0) {
      try {
        const sectionPath = this.getCardPath(card);
        const sectionRef = ref(database, sectionPath);
        const snapshot = await get(sectionRef);
        const currentCount = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
        if (currentCount >= demoModeService.maxTasksPerProject) {
          demoModeService.showLimitReached('tasks');
          return;
        }
      } catch (err) {
        console.warn('[FirebaseService] Demo limit check failed, allowing write:', err);
      }
    }

    if (isNewCard) {
      // Nueva tarjeta: generar ID único de Firebase
      cardPath = this.getCardPath(card);
      cardRef = push(ref(database, cardPath));
      card.id = cardRef.key;
      card.firebaseId = cardRef.key;
    } else {
      // Tarjeta existente: usar el Firebase ID existente
      // Intentar obtener projectId de fuentes alternativas si no está en la card
      if (!card.projectId) {
        card.projectId = window.currentProjectId || new URLSearchParams(window.location.search).get('projectId');
        console.warn('[FirebaseService] projectId not in card, resolved from window/URL:', card.projectId);
      }

      if (!card.group || !card.projectId) {
        console.error('[FirebaseService] saveCard failed: Missing group or projectId', {
          group: card.group,
          projectId: card.projectId,
          cardId: card.cardId
        });
        document.dispatchEvent(new CustomEvent('show-slide-notification', { detail: { options: { message: 'Group or project ID not defined' } } }));
        return;
      }

      // Migrate legacy 'id' field to 'firebaseId' if needed
      if (!card.firebaseId && card.id) {
        card.firebaseId = card.id;
        delete card.id;
      }

      if (!card.firebaseId) {
        console.error('[FirebaseService] saveCard failed: Existing card missing firebaseId', {
          cardId: card.cardId,
          group: card.group,
          projectId: card.projectId
        });
        throw new Error(`Card ${card.cardId} is missing firebaseId. Run migration script to fix data.`);
      }

      cardPath = `${this.getCardPath(card)}/${card.firebaseId}`;
      cardRef = ref(database, cardPath);
    }

    try {
      // Obtener estado anterior si existe (para el histórico)
      let previousState = null;
      if (!isNewCard) {
        try {
          const previousSnapshot = await get(cardRef);
          if (previousSnapshot.exists()) {
            previousState = previousSnapshot.val();
          }
        } catch (err) {
          // Silently ignore - previous state unavailable
        }
      }

      const wipOperations = await this._applyWipLogic(card, previousState);

      // Guardar histórico de cambios (antes de limpiar)
      if (!options.skipHistory) {
        const userEmail = auth.currentUser?.email || card.updatedBy || card.createdBy;
        await historyService.saveHistory(card, previousState, userEmail);
      }

      // Limpiar campos innecesarios antes de guardar
      const cardToSave = this.cleanCardBeforeSave(card);

      // Normalizar status - nunca debe ser vacío en nuevas cards
      if (isNewCard && (!cardToSave.status || cardToSave.status.trim() === '')) {
        const group = card.group || cardToSave.group;
        if (group === 'bugs') {
          cardToSave.status = 'Created';
        } else if (group === 'proposals') {
          cardToSave.status = 'Proposed';
        } else {
          cardToSave.status = 'To Do';
        }
      }
      // Normalizar priority para bugs - nunca debe ser vacío
      if ((card.group === 'bugs' || cardToSave.group === 'bugs') &&
          (!cardToSave.priority || cardToSave.priority.trim() === '')) {
        cardToSave.priority = 'Not Evaluated';
      }
      // Use update() for existing cards to preserve fields not loaded on the component
      // (e.g. startDate, endDate, commits when editing only notes).
      // Use set() for new cards to create the full entry.
      if (isNewCard) {
        await set(cardRef, cardToSave);
      } else {
        await update(cardRef, cardToSave);
      }

      await this._executeWipOperations(wipOperations);

      // Auto-agregar creador como stakeholder si es una nueva tarea y no está en la lista
      if (isNewCard && card.cardType === 'task-card' && card.createdBy && card.projectId) {
        try {
          await this.ensureUserInProjectStakeholders(card.createdBy, card.projectId);
        } catch (autoAddError) {
          console.warn('[FirebaseService] Failed to auto-add creator as stakeholder:', autoAddError.message);
        }
      }

      if (!options.silent) {
        document.dispatchEvent(new CustomEvent('show-slide-notification', { detail: { options: { message: 'Card saved successfully!' } } }));
      }
      document.dispatchEvent(new CustomEvent('card-saved', { bubbles: true, composed: true, detail: { id: card.id } }));
    } catch (error) {
      console.error('[FirebaseService] saveCard FAILED:', {
        cardId: card.cardId,
        id: card.id,
        group: card.group,
        projectId: card.projectId,
        cardPath,
        error: error.message,
        stack: error.stack
      });
      if (!options.silent) {
        document.dispatchEvent(new CustomEvent('show-slide-notification', { detail: { options: { message: 'Failed to save card' } } }));
      }
      throw error;
    }
  },
  async deleteCard(card) {
    if (!auth.currentUser) {
      document.dispatchEvent(new CustomEvent('show-slide-notification', { detail: { options: { message: 'You must be logged in to delete the card' } } }));
      return;
    }

    // Verificar permisos usando el sistema centralizado
    const canDelete = await this.checkUserPermissions(card, 'delete');
if (!canDelete) {
      const itemType = card.cardType === 'bug-card' ? 'bug' :
        card.cardType === 'task-card' ? 'tarea' :
          card.cardType === 'epic-card' ? 'épica' : 'elemento';
document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: { options: { message: `No tienes permisos para borrar este ${itemType}`, type: 'error' } }
      }));
      return;
    }
const userEmail = document.body.dataset.userEmail;
    const cardPath = this.getCardPath(card);
    const cardRef = ref(database, `${cardPath}/${card.id}`);
    const trashRef = ref(database, `/trash/${cardPath}/${card.id}`);
try {
      const cardData = (await get(cardRef)).val();
      const { id } = card;
      if (cardData) {
        await set(cardRef, null);
        await set(trashRef, { ...cardData, deletedBy: userEmail, deletedAt: new Date().toISOString() });

        // Remove from developer backlog if card had a developer assigned
        if (cardData.developer) {
          const cardKey = developerBacklogService.buildCardKey(
            cardData.projectId || card.projectId,
            cardData.cardType || card.cardType,
            cardData.cardId || card.cardId
          );
          await developerBacklogService.removeItem(cardData.developer, cardKey);
        }

        document.dispatchEvent(new CustomEvent('card-deleted', { bubbles: true, composed: true, detail: { id } }));
        document.dispatchEvent(new CustomEvent('show-slide-notification', { detail: { options: { message: 'Card deleted successfully!' } } }));
      } else {
        // Card doesn't exist in /cards/ - it's orphan data in optimized view
        // Clean up the orphan entry from /views/
        console.warn(`Card not found in /cards/, cleaning orphan from views: ${card.cardId || id}`);
        await this._cleanupOrphanFromView(card, id);
        document.dispatchEvent(new CustomEvent('card-deleted', { bubbles: true, composed: true, detail: { id } }));
        document.dispatchEvent(new CustomEvent('show-slide-notification', {
          detail: { options: { message: 'Dato huérfano eliminado de la vista', type: 'warning' } }
        }));
      }
    } catch (error) {
      console.error('💥 DELETE ERROR - Firebase operation failed:', error);
      document.dispatchEvent(new CustomEvent('show-slide-notification', { detail: { options: { message: 'Failed to delete card', type: 'warning' } } }));
      return;
    }
  },

  /**
   * Restore a card from trash back to the active cards collection.
   * Resets status to "To Do" and generates a new firebaseId via push().
   * @param {string} projectName - Project ID
   * @param {string} cardType - Section key in trash (e.g. "TASKS_ProjectName")
   * @param {string} firebaseId - Firebase key of the trashed card
   */
  async restoreCard(projectName, cardType, firebaseId) {
    if (!auth.currentUser) {
      document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: { options: { message: 'You must be logged in to restore a card', type: 'error' } }
      }));
      return;
    }

    const trashPath = `/trash/cards/${projectName}/${cardType}/${firebaseId}`;
    const trashRef = ref(database, trashPath);

    try {
      const snapshot = await get(trashRef);
      const cardData = snapshot.val();
      if (!cardData) {
        throw new Error('Card not found in trash');
      }

      // Clean trash metadata
      delete cardData.deletedBy;
      delete cardData.deletedAt;
      delete cardData.deleteReason;
      delete cardData.movedTo;

      // Reset status and progress fields
      cardData.status = 'To Do';
      delete cardData.startDate;
      delete cardData.endDate;

      // Add restore metadata
      const userEmail = document.body.dataset.userEmail;
      cardData.restoredBy = userEmail;
      cardData.restoredAt = new Date().toISOString();

      // Derive section from cardType key (e.g. "TASKS_ProjectName" → "TASKS")
      const section = cardType.replace(`_${projectName}`, '');
      const cardsBasePath = this.getPathBySectionAndProjectId(section, projectName);

      // Push with new firebaseId
      const newRef = push(ref(database, cardsBasePath));
      cardData.id = newRef.key;
      cardData.firebaseId = newRef.key;
      await set(newRef, cardData);

      // Remove from trash
      await set(trashRef, null);

      document.dispatchEvent(new CustomEvent('card-restored', { bubbles: true, composed: true, detail: { cardId: cardData.cardId } }));
      document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: { options: { message: `Card ${cardData.cardId || ''} restored successfully` } }
      }));
    } catch (error) {
      console.error('Restore card error:', error);
      document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: { options: { message: 'Failed to restore card', type: 'error' } }
      }));
      throw error;
    }
  },

  /**
   * Cleanup orphan entry from optimized view when card doesn't exist in /cards/
   * @param {Object} card - Card data with projectId and cardType
   * @param {string} firebaseId - Firebase key of the orphan entry
   */
  async _cleanupOrphanFromView(card, firebaseId) {
    const viewPaths = {
      'task-card': 'task-list',
      'bug-card': 'bug-list',
      'proposal-card': 'proposal-list'
    };

    const cardType = card.cardType || card.group;
    let viewPath = viewPaths[cardType];

    // Handle group names too
    if (!viewPath) {
      if (cardType === 'tasks') viewPath = 'task-list';
      else if (cardType === 'bugs') viewPath = 'bug-list';
      else if (cardType === 'proposals') viewPath = 'proposal-list';
    }

    if (!viewPath) {
      console.warn(`_cleanupOrphanFromView: Unknown card type: ${cardType}`);
      return;
    }

    const projectId = card.projectId;
    if (!projectId) {
      console.warn('_cleanupOrphanFromView: No project ID available');
      return;
    }

    try {
      const fullViewPath = `/views/${viewPath}/${projectId}/${firebaseId}`;
      console.log(`Removing orphan entry from Firebase view: ${fullViewPath}`);
      const viewRef = ref(database, fullViewPath);
      await set(viewRef, null);
      console.log(`Successfully cleaned up orphan from view: ${card.cardId || firebaseId}`);
    } catch (error) {
      console.error(`Failed to cleanup orphan from view:`, error);
    }
  },

  /**
   * Mueve una card de un proyecto a otro
   * - Genera nuevo cardId con prefijo del proyecto destino
   * - Copia la card al nuevo proyecto
   * - Elimina la card del proyecto origen (moviendo a trash)
   * - Registra el movimiento en el historial
   *
   * @param {Object} params
   * @param {Object} params.card - Datos de la card
   * @param {string} params.sourceProjectId - Proyecto origen
   * @param {string} params.targetProjectId - Proyecto destino
   * @param {string} params.firebaseId - Firebase ID de la card
   * @param {string} params.cardType - Tipo de card (task-card, bug-card, proposal-card)
   * @returns {Promise<Object>} Resultado de la operación
   */
  async moveCardToProject({ card, sourceProjectId, targetProjectId, firebaseId, cardType }) {
    if (!auth.currentUser) {
      throw new Error('Debes estar autenticado para mover cards');
    }

    // Verificar permisos - solo admins pueden mover
    const userRole = window.currentUserRole || { isResponsable: false };
    if (!userRole.isResponsable) {
      throw new Error('Solo los administradores pueden mover cards entre proyectos');
    }

    // Mapear cardType a section
    const sectionMap = {
      'task-card': 'TASKS',
      'bug-card': 'BUGS',
      'proposal-card': 'PROPOSALS'
    };

    const section = sectionMap[cardType];
    if (!section) {
      throw new Error(`Tipo de card no soportado para movimiento: ${cardType}`);
    }

    const userEmail = document.body.dataset.userEmail;
    const oldCardId = card.cardId;

    try {
      // 1. Generar nuevo cardId para el proyecto destino
      const groupForId = section.toLowerCase().slice(0, -1); // TASKS -> task, BUGS -> bug
      const newCardId = await this.generateProjectSectionId(targetProjectId, groupForId);

      // 2. Preparar datos de la nueva card
      const newCardData = {
        ...card,
        cardId: newCardId,
        projectId: targetProjectId,
        status: 'To Do', // Forzar status To Do al mover
        sprint: '', // Limpiar sprint al mover
        sprintId: '', // Limpiar sprintId
        epic: '', // Limpiar epic al mover (diferente entre proyectos)
        movedFrom: {
          projectId: sourceProjectId,
          cardId: oldCardId,
          movedAt: new Date().toISOString(),
          movedBy: userEmail
        }
      };

      // Eliminar campos que no deben copiarse
      delete newCardData.id;
      delete newCardData.firebaseId;
      delete newCardData.history; // No copiar histórico al mover

      // 3. Paths de Firebase
      const sourcePath = `${this.getPathBySectionAndProjectId(section, sourceProjectId)}/${firebaseId}`;
      const targetBasePath = this.getPathBySectionAndProjectId(section, targetProjectId);

      // 4. Crear nueva card en proyecto destino
      const targetRef = push(ref(database, targetBasePath));
      const newFirebaseId = targetRef.key;
      newCardData.id = newFirebaseId;
      newCardData.firebaseId = newFirebaseId;

      await set(targetRef, newCardData);

      // Nota: No se guarda histórico al mover - la card empieza "limpia" en el nuevo proyecto

      // 5. Mover card original a trash (no eliminar directamente)
      const sourceRef = ref(database, sourcePath);
      const sourceSnapshot = await get(sourceRef);

      if (sourceSnapshot.exists()) {
        const sourceData = sourceSnapshot.val();
        const trashPath = `/trash/cards/${sourceProjectId}/${section}_${sourceProjectId}/${firebaseId}`;
        const trashRef = ref(database, trashPath);

        await set(trashRef, {
          ...sourceData,
          movedTo: {
            projectId: targetProjectId,
            cardId: newCardId,
            newFirebaseId: newFirebaseId
          },
          deletedBy: userEmail,
          deletedAt: new Date().toISOString(),
          deleteReason: 'moved_to_project'
        });

        // 7. Eliminar del origen
        await set(sourceRef, null);
      }

      // 8. Emitir evento de actualización
      document.dispatchEvent(new CustomEvent('card-moved', {
        bubbles: true,
        composed: true,
        detail: {
          oldCardId,
          newCardId,
          sourceProjectId,
          targetProjectId,
          cardType
        }
      }));

      return {
        success: true,
        newCardId,
        newFirebaseId,
        targetProjectId,
        oldCardId,
        sourceProjectId
      };

    } catch (error) {
      console.error('[FirebaseService] moveCardToProject failed:', error);
      throw error;
    }
  },

  async getCards(cardPath) {
    if (!auth.currentUser) {
      document.dispatchEvent(new CustomEvent('show-slide-notification', { detail: { options: { message: 'You must be logged in to get data card' } } }));
      return;
    }
    const cardsRef = ref(database, cardPath);
    const cards = await get(cardsRef).then(this._processCardsSnapshot);
    return cards;
  },
  getCardPath(card) {
    const section = card.group.toUpperCase();
    return this.getPathBySectionAndProjectId(section, card.projectId);
  },
  getPathBySectionAndProjectId(section, projectId) {
    return `/cards/${projectId}/${section.toUpperCase()}_${projectId}`;
  },
  async updateSprintPoints(detail) {
    const { projectId } = detail;
    const pathSprints = FirebaseService.getPathBySectionAndProjectId('sprints', projectId);
    const sprints = await FirebaseService.getCards(pathSprints);

    // Validar que hay sprints
    if (!sprints || Object.keys(sprints).length === 0) {
return;
    }

    const sprintsKeys = Object.keys(sprints);
    const sprintPoints = {};
    sprintsKeys.forEach(this._createSprintPointsEntry.bind(this, sprints, sprintPoints));

    const pathTasks = FirebaseService.getPathBySectionAndProjectId('tasks', projectId);
    const tasks = await FirebaseService.getCards(pathTasks);

    // Validar que hay tareas
    if (!tasks || Object.keys(tasks).length === 0) {
} else {
      const tasksKeys = Object.keys(tasks);
      tasksKeys.forEach(this._calculateTaskPoints.bind(this, tasks, sprintPoints));
    }
    for (const sprintId of sprintsKeys) {
      const sprintCardId = sprints[sprintId].cardId;
      const newBusinessPoints = sprintPoints[sprintCardId].businessPoints;
      const newDevPoints = sprintPoints[sprintCardId].devPoints;
      // Solo guardar si hay cambios reales
      if (
        sprints[sprintId].businessPoints !== newBusinessPoints ||
        sprints[sprintId].devPoints !== newDevPoints
      ) {
const updatedSprint = {
          ...sprints[sprintId],
          id: sprintId,
          group: 'sprints',
          projectId: projectId,
          businessPoints: newBusinessPoints,
          devPoints: newDevPoints
        };
        await FirebaseService.saveCard(updatedSprint, { silent: true });
      }
    }
  },
  /**
   * Generates a 3-character abbreviation for a given word.
   *
   * Algorithm:
   * 1. If the word has 3 or fewer letters, return it as is (padded with `_` if needed).
   * 2. If the word contains a number at the end:
   *    - Take the first three consonants.
   *    - Take the number.
   *    - Replace the last consonant with the number.
   * 3. Extract consonants and vowels separately.
   * 4. If there are 3 or more consonants, take the first 3.
   * 5. If there are 2 consonants, append the first vowel.
   * 6. If there is 1 consonant, append the first and last vowel.
   * 7. Ensure that the resulting abbreviation is always 3 characters long.
   * 8. If the word is BUGS, return BUG (exception).
   *
   * Examples:
   * - "BUG" → "BUG" (Respects words with 3 or fewer letters)
   * - "BUGS" → "BUG" (Exception)
   * - "AEI" → "AEI" (Respects words with 3 or fewer letters)
   * - "AI" → "_AI" (Less than 3 letters, padded with `_`)
   * - "X" → "__X" (Less than 3 letters, padded with `_`)
   * - "AZEA" → "AZA"
   * - "AZURE" → "AZR"
   * - "CINEMA4D" → "C4D" (New exception: first consonant + number + last letter)
   * - "EXTRANET V1" → "XT1"
   *
   * @param {string} wordToAbbr - The word to abbreviate.
   * @returns {string} - The generated 3-character abbreviation.
   */
  getAbbrId(wordToAbbr) {
    const upperWord = wordToAbbr.toUpperCase().trim();

    if (upperWord === "BUGS") return 'BUG'; // Excepción para "BUGS"
    if (upperWord === "CINEMA4D") return 'C4D'; // Excepción para "CINEMA4D"
    if (upperWord === "EXTRANET V1") return 'EX1'; // Excepción para "EXTRANET V1"
    if (upperWord === "EXTRANET V2") return 'EX2'; // Excepción para "EXTRANET V2"

    // Regla 1: Si la palabra tiene 3 caracteres o menos, devolverla tal cual (con `_` si es necesario)
    if (upperWord.length <= 3) return upperWord.padStart(3, '_');

    // Extraer consonantes y vocales ignorando espacios y números
    const consonants = upperWord.replace(/[AEIOUÁÉÍÓÚÜ\s\d]/gi, '').split('');
    const vowels = upperWord.replace(/[^AEIOUÁÉÍÓÚÜ]/gi, '').split('');

    // Detectar si hay un número al final
    const matchNumber = upperWord.match(/\d+$/); // Busca número al final
    const lastNumber = matchNumber ? matchNumber[0] : null;

    // Regla 2: Si hay un número al final, tomar las 3 primeras consonantes y reemplazar la última por el número
    if (lastNumber && consonants.length >= 3) {
      return consonants.slice(0, 2).join('') + lastNumber;
    }

    // Regla 3: Si hay al menos 3 consonantes, tomar las primeras 3
    if (consonants.length >= 3) {
      return consonants.slice(0, 3).join('');
    }

    // Regla 4: Si hay 2 consonantes, añadir la primera vocal disponible
    if (consonants.length === 2) {
      return consonants.join('') + (vowels[0] || '_');
    }

    // Regla 5: Si hay 1 consonante, añadir la primera y última vocal disponibles
    if (consonants.length === 1) {
      return consonants[0] + (vowels[0] || '_') + (vowels[vowels.length - 1] || '_');
    }

    // Regla 6: Si no hay consonantes, tomar las 3 primeras letras
    return upperWord.slice(0, 3);
  },
  /**
   * Get the configured abbreviation for a project
   * @param {string} projectId - Project ID
   * @returns {Promise<string>} - Project abbreviation (3 chars)
   * @throws {Error} - If project has no abbreviation configured
   */
  async getProjectAbbreviation(projectId) {
    const projectRef = ref(database, `/projects/${projectId}/abbreviation`);
    const snapshot = await get(projectRef);
    if (snapshot.exists()) {
      return snapshot.val();
    }
    throw new Error(`El proyecto "${projectId}" no tiene abreviatura configurada. Un administrador debe añadir el campo 'abbreviation' en /projects/${projectId}`);
  },

  async generateProjectSectionId(projectId, section) {
    const projectAbbr = await this.getProjectAbbreviation(projectId);
    const sectionAbbr = this.getAbbrId(section);
    const projectSectionAbbr = `${projectAbbr}-${sectionAbbr}`;
    const projectRef = doc(databaseFirestore, 'projectCounters', projectSectionAbbr);

    try {
      // Verifica fuera de la transacción si el documento existe
      const docSnap = await getDoc(projectRef);
      if (!docSnap.exists()) {
        await setDoc(projectRef, { lastId: 0 }); // Inicializar documento si no existe
      }

      const result = await runTransaction(databaseFirestore, async (transaction) => {
        const docSnap = await transaction.get(projectRef);
        let lastId = docSnap.data().lastId || 0;
        const newId = lastId + 1;

        transaction.set(projectRef, { lastId: newId }, { merge: true });

        const newIdStr = newId.toString().padStart(4, '0');
        return `${projectSectionAbbr}-${newIdStr}`;
      });
return result;
    } catch (error) {
document.dispatchEvent(new CustomEvent('show-slide-notification', {
        detail: { options: { message: 'Failed to generate project-section ID', type: 'error' } }
      }));
      throw new Error('Failed to generate project-section ID');
    }
  },

  /**
   * Inicializa todos los contadores de Firestore para un nuevo proyecto
   * SEGURIDAD: NUNCA modifica contadores existentes, solo crea los faltantes
   * @param {string} projectId - ID del proyecto (ej: "Cinema4D", "TestProject")
   * @param {Object} options - Opciones: { dryRun: boolean, force: boolean }
   * @returns {Promise} - Promesa que se resuelve cuando todos los contadores están verificados/creados
   */
  async initializeProjectCounters(projectId, options = {}) {
    const { dryRun = false } = options;
if (!projectId || typeof projectId !== 'string') {
      throw new Error('ProjectId es requerido y debe ser un string válido');
    }

    // Definir todas las secciones estándar que maneja la aplicación
    const standardSections = [
      'tasks',      // TSK - Tasks/Historias
      'bugs',       // BUG - Bugs/Defectos  
      'epics',      // EPC - Epics
      'proposals',  // PRP - Propuestas
      'qa',         // _QA - Quality Assurance
      'sprints'     // SPR - Sprints
    ];

    const projectAbbr = await this.getProjectAbbreviation(projectId);
    const countersToCheck = [];

    // Generar lista de contadores a verificar
    for (const section of standardSections) {
      const sectionAbbr = this.getAbbrId(section);
      const counterKey = `${projectAbbr}-${sectionAbbr}`;
      countersToCheck.push({ counterKey, section, sectionAbbr });
    }
// PASO 1: Verificar estado actual de todos los contadores
    const existingCounters = [];
    const missingCounters = [];

    for (const counterInfo of countersToCheck) {
      const docRef = doc(databaseFirestore, 'projectCounters', counterInfo.counterKey);
      try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          existingCounters.push({
            ...counterInfo,
            currentValue: data.lastId,
            data: data
          });
} else {
          missingCounters.push(counterInfo);
}
      } catch (error) {
throw new Error(`Error verificando contador ${counterInfo.counterKey}: ${error.message}`);
      }
    }

    // PASO 2: Análisis de seguridad
if (existingCounters.length > 0) {
      existingCounters.forEach(counter => {
});
    }

    if (missingCounters.length === 0) {
return {
        projectId,
        projectAbbr,
        action: 'verification',
        existing: existingCounters.length,
        missing: 0,
        created: 0,
        success: true,
        message: 'Todos los contadores ya existen'
      };
    }

    // PASO 3: Modo dry-run
    if (dryRun) {
missingCounters.forEach(counter => {
});

      return {
        projectId,
        projectAbbr,
        action: 'dry-run',
        existing: existingCounters.length,
        missing: missingCounters.length,
        wouldCreate: missingCounters,
        success: true,
        message: 'Dry-run completado - no se creó nada'
      };
    }

    // PASO 4: Crear solo los contadores faltantes
    try {
const promises = missingCounters.map(async (counterInfo) => {
        const docRef = doc(databaseFirestore, 'projectCounters', counterInfo.counterKey);

        // DOBLE VERIFICACIÓN: Comprobar de nuevo que no existe (por si acaso)
        const doubleCheck = await getDoc(docRef);
        if (doubleCheck.exists()) {
return { counterKey: counterInfo.counterKey, created: false, reason: 'already_exists' };
        }

        // Crear el contador con valor inicial 0
        await setDoc(docRef, { lastId: 0 });
return { counterKey: counterInfo.counterKey, created: true, initialValue: 0 };
      });

      const results = await Promise.all(promises);
      const createdCount = results.filter(r => r.created).length;
return {
        projectId,
        projectAbbr,
        action: 'initialization',
        existing: existingCounters.length,
        missing: missingCounters.length,
        created: createdCount,
        results: results,
        success: true,
        message: `Inicialización exitosa: ${createdCount} contadores creados, ${existingCounters.length} ya existían`
      };

    } catch (error) {
throw new Error(`FALLO CRÍTICO: No se pudieron crear contadores para ${projectId}: ${error.message}`);
    }
  },

  /**
   * Sincroniza los contadores de Firestore con los cardIds reales existentes en el proyecto.
   * Útil cuando los contadores se desfasan por algún error o importación de datos.
   * @param {string} projectId - ID del proyecto
   * @param {Object} options - Opciones: { dryRun: boolean, sections: string[] }
   * @returns {Promise<Object>} - Resultado de la sincronización
   */
  async syncProjectCounters(projectId, options = {}) {
    const { dryRun = false, sections = ['tasks', 'bugs', 'epics', 'proposals', 'sprints'] } = options;

    if (!projectId || typeof projectId !== 'string') {
      throw new Error('ProjectId es requerido y debe ser un string válido');
    }

    const projectAbbr = await this.getProjectAbbreviation(projectId);
    const results = [];

    for (const section of sections) {
      const sectionAbbr = this.getAbbrId(section);
      const counterKey = `${projectAbbr}-${sectionAbbr}`;

      try {
        // 1. Obtener el contador actual de Firestore
        const counterRef = doc(databaseFirestore, 'projectCounters', counterKey);
        const counterSnap = await getDoc(counterRef);
        const currentCounterValue = counterSnap.exists() ? (counterSnap.data().lastId || 0) : 0;

        // 2. Obtener todas las tarjetas de la sección para encontrar el cardId más alto
        const sectionPath = this.getPathBySectionAndProjectId(section.toUpperCase(), projectId);
        const cardsRef = ref(database, sectionPath);
        const cardsSnap = await get(cardsRef);
        const cardsData = cardsSnap.val() || {};

        // 3. Extraer el número más alto de los cardIds existentes
        let maxIdFound = 0;
        const cardIdPattern = new RegExp(`^${projectAbbr}-${sectionAbbr}-(\\d+)$`);

        Object.values(cardsData).forEach(card => {
          if (card.cardId && !card.deletedAt) {
            const match = card.cardId.match(cardIdPattern);
            if (match) {
              const idNumber = parseInt(match[1], 10);
              if (idNumber > maxIdFound) {
                maxIdFound = idNumber;
              }
            }
          }
        });

        // 4. Comparar y decidir si hay que actualizar
        const needsSync = maxIdFound > currentCounterValue;
        const sectionResult = {
          section,
          counterKey,
          currentCounterValue,
          maxIdFound,
          needsSync,
          synced: false
        };

        if (needsSync && !dryRun) {
          // Actualizar el contador en Firestore
          await setDoc(counterRef, { lastId: maxIdFound }, { merge: true });
          sectionResult.synced = true;
          sectionResult.newValue = maxIdFound;
          console.log(`[FirebaseService] Contador ${counterKey} sincronizado: ${currentCounterValue} → ${maxIdFound}`);
        } else if (needsSync && dryRun) {
          sectionResult.wouldUpdateTo = maxIdFound;
        }

        results.push(sectionResult);
      } catch (error) {
        results.push({
          section,
          counterKey,
          error: error.message
        });
      }
    }

    const synced = results.filter(r => r.synced).length;
    const needsSync = results.filter(r => r.needsSync).length;

    return {
      projectId,
      projectAbbr,
      action: dryRun ? 'dry-run' : 'sync',
      results,
      synced,
      needsSync,
      success: true,
      message: dryRun
        ? `Dry-run: ${needsSync} contadores necesitan sincronización`
        : `Sincronización completada: ${synced} contadores actualizados`
    };
  },

  subscribeToCards(cardPath, callback) {
    const cardsRef = ref(database, cardPath);
    return onValue(cardsRef, this._handleCardsSnapshot.bind(this, callback));
  },
  /**
   * Obtiene las suites de QA para un proyecto.
   * @param {string} projectId - ID del proyecto.
   * @returns {Promise<Object>} - Objeto con las suites (clave: id, valor: {name}).
   */
  async getSuites(projectId) {
    if (!auth.currentUser) {
      document.dispatchEvent(new CustomEvent('show-slide-notification', { detail: { options: { message: 'Debes iniciar sesión para ver las suites' } } }));
      return {};
    }
    const suitesRef = ref(database, `/data/suites/${projectId}/SUITES_${projectId}`);
    const snapshot = await get(suitesRef);
    return snapshot.val() || {};
  },
  /**
   * Añade una nueva suite de QA para un proyecto.
   * @param {string} projectId - ID del proyecto.
   * @param {string} suiteName - Nombre de la suite.
   * @returns {Promise<string>} - ID de la suite creada.
   */
  async addSuite(projectId, suiteName) {
    if (!auth.currentUser) {
      document.dispatchEvent(new CustomEvent('show-slide-notification', { detail: { options: { message: 'Debes iniciar sesión para crear una suite' } } }));
      throw new Error('No autenticado');
    }
    const suitesRef = ref(database, `/data/suites/${projectId}/SUITES_${projectId}`);
    const newSuiteRef = push(suitesRef);
    const suiteData = { name: suiteName };
    await set(newSuiteRef, suiteData);
    document.dispatchEvent(new CustomEvent('show-slide-notification', { detail: { options: { message: 'Suite creada correctamente' } } }));
    return newSuiteRef.key;
  },
  /**
   * Elimina una suite de QA para un proyecto.
   * @param {string} projectId - ID del proyecto.
   * @param {string} suiteId - ID de la suite a eliminar.
   * @returns {Promise<void>}
   */
  async deleteSuite(projectId, suiteId) {
    if (!auth.currentUser) {
      document.dispatchEvent(new CustomEvent('show-slide-notification', { detail: { options: { message: 'Debes iniciar sesión para eliminar una suite' } } }));
      throw new Error('No autenticado');
    }
    const suiteRef = ref(database, `/data/suites/${projectId}/SUITES_${projectId}/${suiteId}`);
    try {
      await set(suiteRef, null);
      document.dispatchEvent(new CustomEvent('show-slide-notification', { detail: { options: { message: 'Suite eliminada correctamente' } } }));
      document.dispatchEvent(new CustomEvent('suite-deleted', { bubbles: true, composed: true, detail: { id: suiteId } }));
    } catch (error) {
document.dispatchEvent(new CustomEvent('show-slide-notification', { detail: { options: { message: 'Error al eliminar la suite', type: 'error' } } }));
      throw error;
    }
  },
  /**
   * Obtiene todas las tarjetas QA de un proyecto.
   * @param {string} projectId - ID del proyecto.
   * @returns {Promise<Object>} - Objeto con las tarjetas QA.
   */
  async getQACards(projectId) {
    if (!auth.currentUser) {
      document.dispatchEvent(new CustomEvent('show-slide-notification', { detail: { options: { message: 'Debes iniciar sesión para ver las tarjetas QA' } } }));
      return {};
    }
    const qaCardsRef = ref(database, `/cards/${projectId}/QA_${projectId}`);
    const snapshot = await get(qaCardsRef);
    return this._processCardsSnapshot(snapshot);
  },

  // === MÉTODOS MIGRADOS DESDE FirebaseDataService ===

  /**
   * Obtiene una referencia de Firebase Database
   * @param {string} path - Ruta de la base de datos
   * @returns {DatabaseReference} Referencia de Firebase
   */
  getRef(path) {
    return ref(database, path);
  },

  /**
   * Actualiza una card específica (método simple sin autenticación)
   * @param {string} projectId - ID del proyecto
   * @param {string} section - Sección de la card
   * @param {string} cardId - ID de la card
   * @param {Object} data - Datos a actualizar
   */
  async updateCard(projectId, section, cardId, data) {
    const cardPath = `/cards/${projectId}/${section.toUpperCase()}_${projectId}/${cardId}`;
    await update(ref(database, cardPath), data);
  },

  /**
   * Suscribe a una ruta específica (alias para subscribeToCards)
   * @param {string} path - Ruta a suscribirse
   * @param {Function} callback - Función callback
   * @returns {Function} Función para desuscribirse
   */
  subscribeToPath(path, callback) {
    const dataRef = ref(database, path);
    return onValue(dataRef, callback);
  },

  /**
   * Obtiene todas las listas del proyecto (status, developers, etc.)
   * @param {string} projectId - ID del proyecto
   * @returns {Promise<Object>} Objeto con todas las listas
   */
  async getProjectLists(projectId) {
    const promises = [
      this.getStatusList('task-card'),
      this.getStatusList('bug-card'),
      this.getDeveloperList(projectId),
      // bugPriorityList already loaded by loadGlobalData() — reuse instead of fetching again
      this.getStakeholders(projectId),
      (async () => {
        const refAdmin = ref(database, '/data/userAdminEmails');
        const snap = await get(refAdmin);
        const val = snap.exists() ? snap.val() : [];
        if (Array.isArray(val)) return val;
        if (val && typeof val === 'object') return Object.keys(val);
        return [];
      })()
    ];

    const [statusTasksList, statusBugList, developerList, stakeholders, userAdminEmails] = await Promise.all(promises);
    return {
      statusTasksList: this.sortStatusList(statusTasksList),
      statusBugList: this.sortStatusList(statusBugList),
      developerList,
      bugpriorityList: window.globalBugPriorityList || [],
      stakeholders,
      userAdminEmails
    };
  },

  /**
   * Obtiene la lista de estados para un tipo de card
   * @param {string} cardType - Tipo de card (task-card, bug-card, etc.)
   * @returns {Promise<Object>} Lista de estados
   */
  async getStatusList(cardType) {
    try {
      const statusRef = ref(database, `/data/statusList/${cardType}`);
      const snapshot = await get(statusRef);
      return snapshot.exists() ? snapshot.val() : {};
    } catch (error) {
return {};
    }
  },

  /**
   * Obtiene la lista de desarrolladores específicos del proyecto
   * @param {string} projectId - ID del proyecto
   * @returns {Promise<Object>} Lista de desarrolladores del proyecto
   */
  async getDeveloperList(projectId) {
    try {
      if (!projectId) {
return {};
      }

      const devRef = ref(database, `/projects/${projectId}/developers`);
      const snapshot = await get(devRef);
      return snapshot.exists() ? snapshot.val() : {};
    } catch (error) {
return {};
    }
  },

  /**
   * Obtiene la lista de prioridades de bugs
   * @returns {Promise<Object>} Lista de prioridades
   */
  async getBugPriorityList() {
    try {
      const priorityRef = ref(database, '/data/bugpriorityList');
      const snapshot = await get(priorityRef);
      return snapshot.exists() ? snapshot.val() : {};
    } catch (error) {
return {};
    }
  },

  /**
   * Obtiene la lista de stakeholders específicos del proyecto
   * @param {string} projectId - ID del proyecto
   * @returns {Promise<Object>} Lista de stakeholders del proyecto
   */
  async getStakeholders(projectId) {
    try {
      if (!projectId) {
return {};
      }

      const stakeholdersRef = ref(database, `/projects/${projectId}/stakeholders`);
      const snapshot = await get(stakeholdersRef);
      return snapshot.exists() ? snapshot.val() : {};
    } catch (error) {
return {};
    }
  },

  /**
   * Obtiene la lista de sprints para un proyecto
   * @param {string} projectId - ID del proyecto
   * @returns {Promise<Object>} Lista de sprints
   */
  async getSprintList(projectId) {
    try {
      const sprintRef = ref(database, `/cards/${projectId}/SPRINTS_${projectId}`);
      const snapshot = await get(sprintRef);
      const sprintData = snapshot.val() || {};

      const sprints = {};
      Object.values(sprintData).forEach(sprint => {
        if (sprint.cardId && !sprint.deletedAt) {
          sprints[sprint.cardId] = sprint;
        }
      });

      return sprints;
    } catch (error) {
return {};
    }
  },

  /**
   * Ordena una lista de estados por su valor numérico
   * @param {Object} statusObj - Objeto de estados
   * @returns {Array} Array ordenado de estados
   */
  sortStatusList(statusObj) {
    const sorted = Object.entries(statusObj || {})
      .sort((a, b) => a[1] - b[1])
      .map(entry => entry[0]);
    return this._ensureValidatedStatus(sorted);
  },

  /**
   * Ordena una lista de prioridades por su valor numérico
   * @param {Object} priorityObj - Objeto de prioridades
   * @returns {Array} Array ordenado de prioridades
   */
  sortBugPriorityList(priorityObj) {
    return Object.entries(priorityObj)
      .sort((a, b) => a[1] - b[1])
      .map(entry => entry[0]);
  },

  /**
   * Carga todas las listas de estados en variables globales
   */
  async loadAllStatusLists() {
    try {
      const statusRef = ref(database, '/data/statusList');
      const statusSnap = await get(statusRef);
      const statusLists = statusSnap.exists() ? statusSnap.val() : {};
      window.statusLists = statusLists;
      return statusLists;
    } catch (e) {
      window.statusLists = {};
return {};
    }
  },

  _ensureValidatedStatus(statusList) {
    if (!Array.isArray(statusList)) return [];
    const result = [...statusList];
    // Add Reopened for task status lists (identified by having Done&Validated)
    if (result.includes('Done&Validated') && !result.includes('Reopened')) {
      result.push('Reopened');
    }
    return result;
  },

  // =====================================================
  // User Management - Project Assignment
  // =====================================================

  /**
   * Registers user login. Creates entry with default projects if user doesn't exist.
   * @param {string} email - User email
   */
  async registerUserLogin(email) {
    if (!email) return;

    const encodedEmail = encodeEmailForFirebase(email);
    const userRef = ref(database, `/data/projectsByUser/${encodedEmail}`);

    try {
      const snapshot = await get(userRef);

      if (!snapshot.exists()) {
        // New user - assign default projects
        const defaultProjects = await this.getDefaultProjects();
        await set(userRef, defaultProjects);
      }
    } catch (error) {
      // Silent fail - don't block login if registration fails
    }
  },

  /**
   * Gets projects assigned to a user.
   * @param {string} email - User email
   * @returns {string[]|null} Array of project names, or null if user has access to all projects
   */
  async getUserProjects(email) {
    if (!email) return null;

    const encodedEmail = encodeEmailForFirebase(email);
    const userRef = ref(database, `/data/projectsByUser/${encodedEmail}`);

    try {
      const snapshot = await get(userRef);

      if (!snapshot.exists()) {
        // No entry - return default projects as array
        const defaults = await this.getDefaultProjects();
        return defaults.split(',').map(p => p.trim()).filter(p => p.length > 0);
      }

      const value = snapshot.val();
      if (value === 'All') return null; // null = access to all projects

      return value.split(',').map(p => p.trim()).filter(p => p.length > 0);
    } catch (error) {
      return null; // On error, allow access to all (fail open)
    }
  },

  /**
   * Gets default projects from config.
   * @returns {string} Comma-separated project names
   */
  async getDefaultProjects() {
    try {
      const configRef = ref(database, '/data/config/defaultProjects');
      const snapshot = await get(configRef);

      if (snapshot.exists()) {
        return snapshot.val();
      }
    } catch (error) {
      // Fall through to default
    }
    return APP_CONSTANTS.DEFAULT_USER_PROJECTS.join(', '); // Fallback from constants
  },

  /**
   * Loads projects list, filtered by user permissions.
   * @param {string} userEmail - Current user email (optional)
   */
  async loadProjects(userEmail = null) {
    const isSuperAdmin = superAdminEmail && normalizeEmail(userEmail) === normalizeEmail(superAdminEmail);

    // Admins need all projects
    if (!userEmail || window.isAppAdmin || isSuperAdmin) {
      const projectsSnap = await get(ref(database, '/projects'));
      window.projects = projectsSnap.exists() ? projectsSnap.val() : {};
      return;
    }

    // Get user project list first — avoids downloading all projects for non-admins
    const userProjects = await this.getUserProjects(userEmail);

    // null = access to all (value "All" in Firebase)
    if (userProjects === null) {
      const projectsSnap = await get(ref(database, '/projects'));
      window.projects = projectsSnap.exists() ? projectsSnap.val() : {};
      return;
    }

    // Load only the user's specific projects in parallel
    const entries = await Promise.all(
      userProjects.map(async (projectId) => {
        const snap = await get(ref(database, `/projects/${projectId}`));
        return snap.exists() ? [projectId, snap.val()] : null;
      })
    );
    window.projects = Object.fromEntries(entries.filter(Boolean));
  },

  /**
   * Carga todos los datos globales necesarios para la aplicación
   * OPTIMIZADO: Carga en paralelo para mejor rendimiento
   */
  async loadGlobalData() {
    window.globalDeveloperList = null;
    window.globalStakeholders = null;
    window.globalRelEmailUser = {};

    // Only bug priority list is needed on the critical path
    const prioResult = await get(ref(database, '/data/bugpriorityList')).catch(() => null);
    const bugPriorityObj = prioResult?.exists() ? prioResult.val() : {};
    window.globalBugPriorityList = Object.entries(bugPriorityObj)
      .sort((a, b) => a[1] - b[1])
      .map(entry => entry[0]);

    // User directory loaded in background — populates globalRelEmailUser when ready
    userDirectoryService.load().then(directoryResult => {
      window.usersDirectory = directoryResult || {};
      if (window.usersDirectory && Object.keys(window.usersDirectory).length > 0) {
        const relDecoded = {};
        Object.values(window.usersDirectory).forEach(entry => {
          if (entry.email && entry.name) {
            relDecoded[entry.email.toLowerCase()] = entry.name;
          }
          if (Array.isArray(entry.aliases)) {
            entry.aliases.forEach(alias => {
              if (alias) {
                const aliasKey = alias.toLowerCase();
                relDecoded[aliasKey] = entry.name || entry.email;
                try {
                  const decodedAlias = decodeEmailFromFirebase(alias);
                  relDecoded[decodedAlias.toLowerCase()] = entry.name || entry.email;
                } catch (err) {
                  // Ignore decoding errors
                }
              }
            });
          }
        });
        window.globalRelEmailUser = relDecoded;
      }
    }).catch(() => {});
  },

  /**
   * Accede a datos de usuario por email de forma segura
   * @param {string} basePath - Ruta base en Firebase (ej. '/data/projectsByUser')  
   * @param {string} userEmail - Email del usuario
   * @returns {Promise<Object>} - Datos del usuario o objeto vacío
   */
  async getUserDataByEmail(basePath, userEmail) {
    if (!userEmail || typeof userEmail !== 'string') {
return {};
    }

    try {
      // Use encoding for full email preservation when accessing user-specific data
      const encodedEmail = encodeEmailForFirebase(userEmail);
      const userRef = ref(database, `${basePath}/${encodedEmail}`);
      const snapshot = await get(userRef);
      return snapshot.exists() ? snapshot.val() : {};
    } catch (error) {
return {};
    }
  },

  /**
   * Guarda datos de usuario por email de forma segura
   * @param {string} basePath - Ruta base en Firebase (ej. '/data/projectsByUser')
   * @param {string} userEmail - Email del usuario  
   * @param {Object} userData - Datos a guardar
   * @returns {Promise<void>}
   */
  async setUserDataByEmail(basePath, userEmail, userData) {
    if (!userEmail || typeof userEmail !== 'string') {
throw new Error('Invalid user email');
    }

    try {
      // Use encoding for full email preservation when storing user-specific data
      const encodedEmail = encodeEmailForFirebase(userEmail);
      const userRef = ref(database, `${basePath}/${encodedEmail}`);
      await set(userRef, userData);
} catch (error) {
throw error;
    }
  },

  // === PROPIEDADES DE CONFIGURACIÓN ===
  get firebaseConfig() {
    return firebaseConfig;
  },

  get database() {
    return database;
  },

  // === HELPER METHODS FOR NAMED FUNCTIONS ===

  _processCardsSnapshot(snapshot) {
    const data = snapshot.val() || {};

    // Asegurarse de que cada tarjeta tenga su Firebase ID asignado
    Object.keys(data).forEach(firebaseKey => {
      if (data[firebaseKey] && typeof data[firebaseKey] === 'object') {
        data[firebaseKey].firebaseId = firebaseKey;
        // Mantener compatibilidad: si no tiene id, usar el Firebase ID
        if (!data[firebaseKey].id) {
          data[firebaseKey].id = firebaseKey;
        }
      }
    });

    return data;
  },

  _createSprintPointsEntry(sprints, sprintPoints, sprintId) {
    if (sprints[sprintId]?.cardId) {
      sprintPoints[sprints[sprintId].cardId] = {
        businessPoints: 0,
        devPoints: 0
      };
    }
  },

  _calculateTaskPoints(tasks, sprintPoints, task) {
    const sprintCardId = tasks[task].sprint || '';
    if (sprintCardId !== '' && sprintPoints[sprintCardId]) {
      // Asegurarse de que los puntos son números válidos
      const businessPoints = parseInt(tasks[task].businessPoints, 10) || 0;
      const devPoints = parseInt(tasks[task].devPoints, 10) || 0;

      sprintPoints[sprintCardId].businessPoints += businessPoints;
      sprintPoints[sprintCardId].devPoints += devPoints;
    }
  },

  _handleCardsSnapshot(callback, snapshot) {
    callback(snapshot.val() || {});
  },

  _addValidSprint(sprints, sprint) {
    if (sprint.cardId && !sprint.deletedAt) {
      sprints[sprint.cardId] = sprint;
    }
  },

  _sortBySecondElement(a, b) {
    return a[1] - b[1];
  },

  _getFirstElement(entry) {
    return entry[0];
  },

  _decodeEmailEntry(relDecoded, [key, value]) {
    const email = decodeEmailFromFirebase(key);
    relDecoded[email] = value;
  },

  _generateDeveloperKeyVariants(rawDeveloper) {
    const variants = new Set();
    const normalized = normalizeEmail(rawDeveloper || '');
    if (normalized) {
      variants.add(encodeEmailForFirebase(normalized));
      variants.add(sanitizeEmailForFirebase(normalized, false));
      variants.add(sanitizeEmailForFirebase(normalized, true));
      const local = normalized.split('@')[0] || normalized;
      variants.add(local);
      variants.add(local.replace(/[^a-z0-9]/gi, ''));
    }
    const normalizedDev = normalizeDeveloperEntry(rawDeveloper || '', { fallbackToEmailName: false });
    if (normalizedDev.email) {
      variants.add(encodeEmailForFirebase(normalizedDev.email));
      variants.add(sanitizeEmailForFirebase(normalizedDev.email, false));
      variants.add(sanitizeEmailForFirebase(normalizedDev.email, true));
    }
    return Array.from(variants).filter(Boolean);
  },

  _resolveDeveloperEmail(value) {
    const raw = (value || '').toString().trim();
    if (!raw) return '';
    if (raw.includes('@')) return normalizeEmail(raw);

    try {
      const fromDirectory = userDirectoryService.getUser(raw);
      if (fromDirectory?.email) return normalizeEmail(fromDirectory.email);
    } catch (e) {
      // ignore
    }

    const normalizedDev = normalizeDeveloperEntry(raw, { fallbackToEmailName: false });
    if (normalizedDev.email) return normalizeEmail(normalizedDev.email);

    return '';
  },

  /**
   * Asegura que un usuario esté en la lista de stakeholders del proyecto
   * Si no está, lo agrega automáticamente
   * @param {string} userEmail - Email del usuario a verificar/agregar
   * @param {string} projectId - ID del proyecto
   */
  async ensureUserInProjectStakeholders(userEmail, projectId) {
    if (!userEmail || !projectId) {
return;
    }

    try {
      await entityDirectoryService.waitForInit();
      const projectRef = ref(database, `/projects/${projectId}`);
      const projectSnapshot = await get(projectRef);
      const projectData = projectSnapshot.exists() ? projectSnapshot.val() || {} : {};
      const developers = normalizeProjectPeople(projectData.developers, { type: 'developer' })
        .map(entry => entry?.id || entry?.email || entry?.name || '')
        .filter(Boolean);
      const stakeholders = normalizeProjectPeople(projectData.stakeholders, { type: 'stakeholder' })
        .map(entry => entry?.id || entry?.email || entry?.name || '')
        .filter(Boolean);
      const normalizedEmail = normalizeEmail(userEmail);
      const developerId = entityDirectoryService.resolveDeveloperId(normalizedEmail);
      const stakeholderId = entityDirectoryService.resolveStakeholderId(normalizedEmail);

      const isInDevelopers = developers.some(entry => entry === developerId || entry === normalizedEmail);
      if (isInDevelopers) {
return;
      }

      const isInStakeholders = stakeholders.some(entry => entry === stakeholderId || entry === normalizedEmail);
      if (isInStakeholders) {
return;
      }

      let targetStakeholderId = stakeholderId;
      if (!targetStakeholderId && normalizedEmail) {
        targetStakeholderId = await entityDirectoryService.findOrCreateStakeholder(normalizedEmail, null);
      }
      if (!targetStakeholderId) {
return;
      }
      const rawStakeholders = projectData.stakeholders;

      if (Array.isArray(rawStakeholders)) {
        if (!rawStakeholders.includes(targetStakeholderId)) {
          await set(ref(database, `/projects/${projectId}/stakeholders`), [...rawStakeholders, targetStakeholderId]);
        }
      } else if (rawStakeholders && typeof rawStakeholders === 'object') {
        const updatedMap = { ...rawStakeholders };
        updatedMap[targetStakeholderId] = targetStakeholderId;
        await set(ref(database, `/projects/${projectId}/stakeholders`), updatedMap);
      } else {
        await set(ref(database, `/projects/${projectId}/stakeholders`), [targetStakeholderId]);
      }
// Emitir evento para actualizar la UI si es necesario
      document.dispatchEvent(new CustomEvent('stakeholder-added', {
        detail: {
          userEmail,
          projectId,
          autoAdded: true
        },
        bubbles: true,
        composed: true
      }));

    } catch (error) {
throw error;
    }
  }
};

// También exportamos una clase para compatibilidad con FirebaseDataService
export class FirebaseDataService {
  constructor() {
    this.database = database;
    this.firebaseConfig = firebaseConfig;
  }

  // Delegamos todos los métodos al servicio principal
  getRef(path) { return FirebaseService.getRef(path); }
  async getCards(projectId, section) { return await FirebaseService.getCards(FirebaseService.getPathBySectionAndProjectId(section, projectId)); }
  async updateCard(projectId, section, cardId, data) { return await FirebaseService.updateCard(projectId, section, cardId, data); }
  subscribeToPath(path, callback) { return FirebaseService.subscribeToPath(path, callback); }
  async getProjectLists(projectId) { return await FirebaseService.getProjectLists(projectId); }
  async getStatusList(cardType) { return await FirebaseService.getStatusList(cardType); }
  async getDeveloperList(projectId) { return await FirebaseService.getDeveloperList(projectId); }
  async getBugPriorityList() { return await FirebaseService.getBugPriorityList(); }
  async getStakeholders(projectId) { return await FirebaseService.getStakeholders(projectId); }
  async getSprintList(projectId) { return await FirebaseService.getSprintList(projectId); }
  sortStatusList(statusObj) { return FirebaseService.sortStatusList(statusObj); }
  sortBugPriorityList(priorityObj) { return FirebaseService.sortBugPriorityList(priorityObj); }
  async loadAllStatusLists() { return await FirebaseService.loadAllStatusLists(); }
  async loadProjects(userEmail = null) { return await FirebaseService.loadProjects(userEmail); }
  async registerUserLogin(email) { return await FirebaseService.registerUserLogin(email); }
  async getUserProjects(email) { return await FirebaseService.getUserProjects(email); }
  async getDefaultProjects() { return await FirebaseService.getDefaultProjects(); }
  async loadGlobalData() { return await FirebaseService.loadGlobalData(); }
}
