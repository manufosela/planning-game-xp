/**
 * Entity Directory Service
 *
 * Servicio central para gestionar developers, stakeholders y teams con IDs estables.
 * Proporciona resolucion bidireccional: ID ↔ email ↔ name
 *
 * Firebase Structure:
 * /data/developers/{developerId} = { email, name, active }
 * /data/stakeholders/{stakeholderId} = { email, name, active, teamId }
 * /data/teams/{teamId} = { name }
 * /projects/{projectId}/developers = [developerId, ...]
 * /projects/{projectId}/stakeholders = [stakeholderId, ...]
 */

import { database, ref, get, set, onValue } from '../../firebase-config.js';
import { normalizeProjectPeople } from '../utils/project-people-utils.js';

const normalizeEmail = (email) => (email || '').toString().trim().toLowerCase();
const normalizeName = (name) => (name || '').toString().trim();

/**
 * Normalizes email arrays for an entity
 * @param {Object} info - Raw entity info from Firebase
 * @returns {{primaryEmail: string, emailsArray: string[]}}
 */
function normalizeEntityEmails(info) {
  const primaryEmail = normalizeEmail(info.email);
  const emailsArray = Array.isArray(info.emails)
    ? info.emails.map(e => normalizeEmail(e)).filter(Boolean)
    : [];
  return { primaryEmail, emailsArray };
}

/**
 * Extracts numeric part from entity ID and updates counter if needed
 * @param {string} id - Entity ID (e.g., 'dev_001', 'stk_002')
 * @param {string} prefix - ID prefix (e.g., 'dev_', 'stk_')
 * @param {number} currentNext - Current next ID counter
 * @returns {number} Updated next ID counter
 */
function updateNextIdCounter(id, prefix, currentNext) {
  const numericPart = parseInt(id.replace(prefix, ''), 10);
  if (!isNaN(numericPart) && numericPart >= currentNext) {
    return numericPart + 1;
  }
  return currentNext;
}

class EntityDirectoryService {
  constructor() {
    // Cache de entidades
    this._developers = new Map(); // id -> { email, name, active }
    this._stakeholders = new Map(); // id -> { email, name, active, teamId }
    this._teams = new Map(); // teamId -> { name }
    this._projects = new Map(); // projectId -> { developers: [id], stakeholders: [id] }

    // Indices inversos para busqueda rapida
    this._developersByEmail = new Map(); // email -> id
    this._developersByName = new Map(); // normalizedName -> id
    this._stakeholdersByEmail = new Map(); // email -> id
    this._stakeholdersByName = new Map(); // normalizedName -> id

    // Estado de carga
    this._initialized = false;
    this._initPromise = null;
    this._listeners = [];

    // Contadores para generacion de IDs
    this._nextDeveloperId = 1;
    this._nextStakeholderId = 1;
  }

  /**
   * Inicializa el servicio cargando datos de Firebase
   */
  async init() {
    if (this._initialized) return;
    if (this._initPromise) return this._initPromise;

    this._initPromise = this._loadFromFirebase();
    await this._initPromise;
    this._initialized = true;
    this._setupRealtimeListeners();
}

  async _loadFromFirebase() {
    try {
      const [developersSnap, stakeholdersSnap, teamsSnap, projectsSnap] = await Promise.all([
        get(ref(database, '/data/developers')),
        get(ref(database, '/data/stakeholders')),
        get(ref(database, '/data/teams')),
        get(ref(database, '/projects'))
      ]);

      // Teams must be processed first so stakeholders can reference them
      if (teamsSnap.exists()) {
        this._processTeams(teamsSnap.val());
      }

      if (developersSnap.exists()) {
        this._processDevelopers(developersSnap.val());
      }

      if (stakeholdersSnap.exists()) {
        this._processStakeholders(stakeholdersSnap.val());
      }

      if (projectsSnap.exists()) {
        this._processProjects(projectsSnap.val());
      }
    } catch (error) {
      // Silently ignore initialization errors
    }
  }

  _processTeams(data) {
    this._teams.clear();

    if (!data) return;

    for (const [id, info] of Object.entries(data)) {
      if (!info) continue;

      // Support both { name: "..." } and simple string format
      const teamData = typeof info === 'string'
        ? { id, name: info }
        : { id, name: info.name || id };

      this._teams.set(id, teamData);
    }
  }

  _processDevelopers(data) {
    this._developers.clear();
    this._developersByEmail.clear();
    this._developersByName.clear();
    this._nextDeveloperId = 1;

    if (!data) return;

    for (const [id, info] of Object.entries(data)) {
      if (!info || typeof info !== 'object') continue;

      const entity = this._createDeveloperEntity(id, info);
      this._developers.set(id, entity);
      this._indexDeveloperEmails(entity, id);
      this._indexEntityName(entity, id, this._developersByName);
      this._nextDeveloperId = updateNextIdCounter(id, 'dev_', this._nextDeveloperId);
    }
  }

  _createDeveloperEntity(id, info) {
    const { primaryEmail, emailsArray } = normalizeEntityEmails(info);
    return {
      id,
      email: primaryEmail,
      emails: emailsArray.length > 0 ? emailsArray : (primaryEmail ? [primaryEmail] : []),
      name: normalizeName(info.name),
      active: info.active !== false
    };
  }

  _indexDeveloperEmails(entity, id) {
    if (entity.email) {
      this._developersByEmail.set(entity.email, id);
    }
    for (const altEmail of entity.emails) {
      if (altEmail && !this._developersByEmail.has(altEmail)) {
        this._developersByEmail.set(altEmail, id);
      }
    }
  }

  _indexEntityName(entity, id, indexMap) {
    if (entity.name) {
      indexMap.set(entity.name.toLowerCase(), id);
    }
  }

  _processStakeholders(data) {
    this._stakeholders.clear();
    this._stakeholdersByEmail.clear();
    this._stakeholdersByName.clear();
    this._nextStakeholderId = 1;

    if (!data) return;

    for (const [id, info] of Object.entries(data)) {
      if (!info || typeof info !== 'object') continue;

      const entity = this._createStakeholderEntity(id, info);
      this._stakeholders.set(id, entity);
      this._indexStakeholderEmail(entity, id);
      this._indexEntityName(entity, id, this._stakeholdersByName);
      this._nextStakeholderId = updateNextIdCounter(id, 'stk_', this._nextStakeholderId);
    }
  }

  _createStakeholderEntity(id, info) {
    return {
      id,
      email: normalizeEmail(info.email),
      name: normalizeName(info.name),
      active: info.active !== false,
      teamId: info.teamId || null
    };
  }

  _indexStakeholderEmail(entity, id) {
    if (entity.email) {
      this._stakeholdersByEmail.set(entity.email, id);
    }
  }

  _processProjects(projectsData) {
    this._projects.clear();

    if (!projectsData) return;

    Object.entries(projectsData).forEach(([projectId, projectData]) => {
      const developers = this._extractProjectIds(projectData?.developers, {
        type: 'developer'
      });
      const stakeholders = this._extractProjectIds(projectData?.stakeholders, {
        type: 'stakeholder'
      });

      this._projects.set(projectId, { developers, stakeholders });
    });
  }

  _extractProjectIds(rawData, { type } = {}) {
    if (!rawData) return [];
    const prefix = type === 'developer' ? 'dev_' : 'stk_';
    const entries = normalizeProjectPeople(rawData, { type });
    const ids = [];

    const pushUnique = (value) => {
      if (!value) return;
      const key = value.toString().trim();
      if (!key) return;
      ids.push(key);
    };

    entries.forEach((entry) => {
      if (!entry) return;
      const candidate = (entry.id || entry.email || entry.name || '').toString().trim();
      if (!candidate) return;

      if (candidate.startsWith(prefix)) {
        pushUnique(candidate);
        return;
      }

      const resolved = type === 'developer'
        ? this.resolveDeveloperId(candidate)
        : this.resolveStakeholderId(candidate);

      if (resolved) {
        pushUnique(resolved);
        return;
      }

      pushUnique(candidate);
    });

    return Array.from(new Set(ids));
  }

  _setupRealtimeListeners() {
    // Listener para teams (must be first to resolve references)
    const teamsRef = ref(database, '/data/teams');
    onValue(teamsRef, (snapshot) => {
      if (snapshot.exists()) {
        this._processTeams(snapshot.val());
        this._notifyListeners('teams');
      }
    });

    // Listener para developers
    const developersRef = ref(database, '/data/developers');
    onValue(developersRef, (snapshot) => {
      if (snapshot.exists()) {
        this._processDevelopers(snapshot.val());
        this._notifyListeners('developers');
      }
    });

    // Listener para stakeholders
    const stakeholdersRef = ref(database, '/data/stakeholders');
    onValue(stakeholdersRef, (snapshot) => {
      if (snapshot.exists()) {
        this._processStakeholders(snapshot.val());
        this._notifyListeners('stakeholders');
      }
    });

    // Listener para proyectos (listas de IDs)
    const projectsRef = ref(database, '/projects');
    onValue(projectsRef, (snapshot) => {
      if (snapshot.exists()) {
        this._processProjects(snapshot.val());
        this._notifyListeners('projects');
      }
    });
  }

  _notifyListeners(type) {
    for (const listener of this._listeners) {
      try {
        listener(type);
      } catch (e) {
        // Silently ignore listener errors to prevent chain interruption
      }
    }
  }

  /**
   * Registra un listener para cambios en entidades
   */
  addChangeListener(callback) {
    this._listeners.push(callback);
    return () => {
      const idx = this._listeners.indexOf(callback);
      if (idx >= 0) this._listeners.splice(idx, 1);
    };
  }

  // ==================== DEVELOPERS ====================

  /**
   * Obtiene un developer por ID
   */
  getDeveloper(id) {
    return this._developers.get(id) || null;
  }

  /**
   * Obtiene todos los developers
   */
  getAllDevelopers() {
    return Array.from(this._developers.values());
  }

  /**
   * Obtiene developers activos
   */
  getActiveDevelopers() {
    return this.getAllDevelopers().filter(d => d.active);
  }

  /**
   * Resuelve cualquier referencia (id, email, name) a un ID de developer
   */
  resolveDeveloperId(reference) {
    if (!reference) return null;
    const ref = reference.toString().trim();

    // Ya es un ID valido
    if (ref.startsWith('dev_') && this._developers.has(ref)) {
      return ref;
    }

    // Buscar por email
    const normalizedEmail = normalizeEmail(ref);
    if (this._developersByEmail.has(normalizedEmail)) {
      return this._developersByEmail.get(normalizedEmail);
    }

    // Buscar por nombre
    const normalizedName = ref.toLowerCase();
    if (this._developersByName.has(normalizedName)) {
      return this._developersByName.get(normalizedName);
    }

    return null;
  }

  /**
   * Resuelve cualquier referencia a email de developer
   */
  resolveDeveloperEmail(reference) {
    const id = this.resolveDeveloperId(reference);
    if (!id) return null;
    const dev = this._developers.get(id);
    return dev?.email || null;
  }

  /**
   * Resuelve cualquier referencia a nombre de developer
   */
  resolveDeveloperName(reference) {
    const id = this.resolveDeveloperId(reference);
    if (!id) return null;
    const dev = this._developers.get(id);
    return dev?.name || null;
  }

  /**
   * Obtiene nombre para mostrar de un developer (resuelve cualquier referencia)
   */
  getDeveloperDisplayName(reference) {
    const name = this.resolveDeveloperName(reference);
    if (name) return name;

    // Fallback: derivar nombre del email si parece email
    if (reference?.includes('@')) {
      return this._formatNameFromEmail(reference);
    }

    return reference || '';
  }

  /**
   * Genera un nuevo ID de developer
   */
  generateDeveloperId() {
    const id = `dev_${String(this._nextDeveloperId).padStart(3, '0')}`;
    this._nextDeveloperId++;
    return id;
  }

  /**
   * Crea o actualiza un developer
   */
  async saveDeveloper(id, data) {
    const primaryEmail = normalizeEmail(data.email);
    const emailsArray = Array.isArray(data.emails)
      ? data.emails.map(e => normalizeEmail(e)).filter(Boolean)
      : [];

    const entity = {
      email: primaryEmail,
      name: normalizeName(data.name),
      active: data.active !== false
    };

    // Only include emails array if it has values beyond primary email
    if (emailsArray.length > 0) {
      entity.emails = emailsArray;
    }

    await set(ref(database, `/data/developers/${id}`), entity);

    // Actualizar cache local
    const cachedEntity = {
      id,
      ...entity,
      emails: emailsArray.length > 0 ? emailsArray : (primaryEmail ? [primaryEmail] : [])
    };
    this._developers.set(id, cachedEntity);

    // Index primary email
    if (primaryEmail) {
      this._developersByEmail.set(primaryEmail, id);
    }

    // Index all alternate emails
    for (const altEmail of cachedEntity.emails) {
      if (altEmail && !this._developersByEmail.has(altEmail)) {
        this._developersByEmail.set(altEmail, id);
      }
    }

    if (entity.name) {
      this._developersByName.set(entity.name.toLowerCase(), id);
    }

    return id;
  }

  /**
   * Adds an alternate email to an existing developer
   * @param {string} developerId - The developer ID (e.g., 'dev_002')
   * @param {string} alternateEmail - The alternate email to add
   * @returns {Promise<boolean>} - True if successful
   */
  async addDeveloperEmail(developerId, alternateEmail) {
    const developer = this._developers.get(developerId);
    if (!developer) {
      return false;
    }

    const normalizedAltEmail = normalizeEmail(alternateEmail);
    if (!normalizedAltEmail) {
      return false;
    }

    // Check if email already exists for another developer
    const existingId = this._developersByEmail.get(normalizedAltEmail);
    if (existingId && existingId !== developerId) {
      console.warn(`Email ${alternateEmail} already belongs to developer ${existingId}`);
      return false;
    }

    // Add to emails array
    const currentEmails = developer.emails || [developer.email].filter(Boolean);
    if (!currentEmails.includes(normalizedAltEmail)) {
      currentEmails.push(normalizedAltEmail);
    }

    // Save to Firebase
    await this.saveDeveloper(developerId, {
      email: developer.email,
      emails: currentEmails,
      name: developer.name,
      active: developer.active
    });

    return true;
  }

  /**
   * Removes an alternate email from an existing developer
   * @param {string} developerId - The developer ID
   * @param {string} emailToRemove - The email to remove
   * @returns {Promise<boolean>} - True if successful
   */
  async removeDeveloperEmail(developerId, emailToRemove) {
    const developer = this._developers.get(developerId);
    if (!developer) {
      return false;
    }

    const normalizedEmail = normalizeEmail(emailToRemove);

    // Cannot remove primary email
    if (normalizedEmail === developer.email) {
      console.warn('Cannot remove primary email');
      return false;
    }

    const currentEmails = developer.emails || [];
    const newEmails = currentEmails.filter(e => e !== normalizedEmail);

    // Remove from index
    this._developersByEmail.delete(normalizedEmail);

    // Save to Firebase
    await this.saveDeveloper(developerId, {
      email: developer.email,
      emails: newEmails,
      name: developer.name,
      active: developer.active
    });

    return true;
  }

  /**
   * Crea un nuevo developer con ID auto-generado
   */
  async createDeveloper(email, name) {
    const id = this.generateDeveloperId();
    await this.saveDeveloper(id, { email, name, active: true });
    return id;
  }

  /**
   * Busca o crea un developer por email
   */
  async findOrCreateDeveloper(email, name) {
    const normalizedEmail = normalizeEmail(email);

    // Buscar existente
    const existingId = this._developersByEmail.get(normalizedEmail);
    if (existingId) {
      return existingId;
    }

    // Crear nuevo
    const derivedName = name || this._formatNameFromEmail(email);
    return await this.createDeveloper(email, derivedName);
  }

  // ==================== STAKEHOLDERS ====================

  /**
   * Obtiene un stakeholder por ID
   */
  getStakeholder(id) {
    return this._stakeholders.get(id) || null;
  }

  /**
   * Obtiene todos los stakeholders
   */
  getAllStakeholders() {
    return Array.from(this._stakeholders.values());
  }

  /**
   * Obtiene stakeholders activos
   */
  getActiveStakeholders() {
    return this.getAllStakeholders().filter(s => s.active);
  }

  /**
   * Resuelve cualquier referencia (id, email, name) a un ID de stakeholder
   */
  resolveStakeholderId(reference) {
    if (!reference) return null;
    const ref = reference.toString().trim();

    // Ya es un ID valido
    if (ref.startsWith('stk_') && this._stakeholders.has(ref)) {
      return ref;
    }

    // Buscar por email
    const normalizedEmail = normalizeEmail(ref);
    if (this._stakeholdersByEmail.has(normalizedEmail)) {
      return this._stakeholdersByEmail.get(normalizedEmail);
    }

    // Buscar por nombre
    const normalizedName = ref.toLowerCase();
    if (this._stakeholdersByName.has(normalizedName)) {
      return this._stakeholdersByName.get(normalizedName);
    }

    return null;
  }

  /**
   * Resuelve cualquier referencia a email de stakeholder
   */
  resolveStakeholderEmail(reference) {
    const id = this.resolveStakeholderId(reference);
    if (!id) return null;
    const stk = this._stakeholders.get(id);
    return stk?.email || null;
  }

  /**
   * Resuelve cualquier referencia a nombre de stakeholder
   */
  resolveStakeholderName(reference) {
    const id = this.resolveStakeholderId(reference);
    if (!id) return null;
    const stk = this._stakeholders.get(id);
    return stk?.name || null;
  }

  /**
   * Obtiene nombre para mostrar de un stakeholder
   */
  getStakeholderDisplayName(reference) {
    const name = this.resolveStakeholderName(reference);
    if (name) return name;

    if (reference?.includes('@')) {
      return this._formatNameFromEmail(reference);
    }

    return reference || '';
  }

  /**
   * Obtiene el teamId de un stakeholder
   * @param {string} reference - ID, email o nombre del stakeholder
   * @returns {string|null} El teamId del stakeholder o null si no tiene
   */
  getStakeholderTeamId(reference) {
    const id = this.resolveStakeholderId(reference);
    if (!id) return null;
    const stk = this._stakeholders.get(id);
    return stk?.teamId || null;
  }

  /**
   * Obtiene el nombre del team de un stakeholder
   * @param {string} reference - ID, email o nombre del stakeholder
   * @returns {string|null} El nombre del team o null si no tiene
   */
  getStakeholderTeamName(reference) {
    const teamId = this.getStakeholderTeamId(reference);
    if (!teamId) return null;
    const team = this._teams.get(teamId);
    return team?.name || null;
  }

  /**
   * Obtiene información de un team por su ID
   * @param {string} teamId - ID del team
   * @returns {Object|null} { id, name } o null si no existe
   */
  getTeam(teamId) {
    return this._teams.get(teamId) || null;
  }

  /**
   * Obtiene todos los teams
   * @returns {Array} Array de { id, name }
   */
  getAllTeams() {
    return Array.from(this._teams.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Obtiene todos los teams que tienen stakeholders asignados
   * @returns {Array} Array de { id, name }
   */
  getTeamsWithStakeholders() {
    const teamIds = new Set();
    for (const stk of this._stakeholders.values()) {
      if (stk.teamId) {
        teamIds.add(stk.teamId);
      }
    }
    return Array.from(teamIds)
      .map(id => this._teams.get(id))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Genera un nuevo ID de stakeholder
   */
  generateStakeholderId() {
    const id = `stk_${String(this._nextStakeholderId).padStart(3, '0')}`;
    this._nextStakeholderId++;
    return id;
  }

  /**
   * Crea o actualiza un stakeholder
   */
  async saveStakeholder(id, data) {
    const entity = {
      email: normalizeEmail(data.email),
      name: normalizeName(data.name),
      active: data.active !== false,
      teamId: data.teamId || null
    };

    await set(ref(database, `/data/stakeholders/${id}`), entity);

    // Actualizar cache local
    this._stakeholders.set(id, { id, ...entity });
    if (entity.email) {
      this._stakeholdersByEmail.set(entity.email, id);
    }
    if (entity.name) {
      this._stakeholdersByName.set(entity.name.toLowerCase(), id);
    }

    return id;
  }

  /**
   * Crea un nuevo stakeholder con ID auto-generado
   */
  async createStakeholder(email, name) {
    const id = this.generateStakeholderId();
    await this.saveStakeholder(id, { email, name, active: true });
    return id;
  }

  /**
   * Busca o crea un stakeholder por email
   */
  async findOrCreateStakeholder(email, name) {
    const normalizedEmail = normalizeEmail(email);

    // Buscar existente
    const existingId = this._stakeholdersByEmail.get(normalizedEmail);
    if (existingId) {
      return existingId;
    }

    // Crear nuevo
    const derivedName = name || this._formatNameFromEmail(email);
    return await this.createStakeholder(email, derivedName);
  }

  // ==================== PROJECT TEAMS ====================

  /**
   * Obtiene los IDs de developers de un proyecto
   */
  async getProjectDeveloperIds(projectId) {
    try {
      const project = this._projects.get(projectId);
      if (!project) return [];
      return Array.isArray(project.developers) ? [...project.developers] : [];
    } catch (error) {
return [];
    }
  }

  /**
   * Obtiene los developers completos de un proyecto
   */
  async getProjectDevelopers(projectId) {
    const ids = await this.getProjectDeveloperIds(projectId);
    return ids.map((id) => this.getDeveloper(id) || {
      id,
      name: id,
      email: '',
      active: true
    });
  }

  /**
   * Obtiene los IDs de stakeholders de un proyecto
   */
  async getProjectStakeholderIds(projectId) {
    try {
      const project = this._projects.get(projectId);
      if (!project) return [];
      return Array.isArray(project.stakeholders) ? [...project.stakeholders] : [];
    } catch (error) {
return [];
    }
  }

  /**
   * Obtiene los stakeholders completos de un proyecto
   */
  async getProjectStakeholders(projectId) {
    const ids = await this.getProjectStakeholderIds(projectId);
    return ids.map((id) => this.getStakeholder(id) || {
      id,
      name: id,
      email: '',
      active: true
    });
  }

  /**
   * Actualiza los developers de un proyecto
   */
  async setProjectDevelopers(projectId, developerIds) {
    await set(ref(database, `/projects/${projectId}/developers`), developerIds);
  }

  /**
   * Actualiza los stakeholders de un proyecto
   */
  async setProjectStakeholders(projectId, stakeholderIds) {
    await set(ref(database, `/projects/${projectId}/stakeholders`), stakeholderIds);
  }

  // ==================== UTILITIES ====================

  /**
   * Deriva un nombre legible de un email
   */
  _formatNameFromEmail(email) {
    if (!email || typeof email !== 'string') return email || '';

    const localPart = email.split('@')[0] || email;
    let cleaned = localPart.replace(/#ext#/gi, '');
    cleaned = cleaned.replace(/[._-]+/g, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    if (!cleaned) return email;

    return cleaned.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Resuelve una referencia generica (developer o stakeholder)
   * Util para campos como createdBy que pueden ser cualquiera
   */
  resolveEntityId(reference) {
    // Intentar primero como developer
    const devId = this.resolveDeveloperId(reference);
    if (devId) return { type: 'developer', id: devId };

    // Intentar como stakeholder
    const stkId = this.resolveStakeholderId(reference);
    if (stkId) return { type: 'stakeholder', id: stkId };

    return null;
  }

  /**
   * Obtiene nombre para mostrar de cualquier entidad
   */
  getEntityDisplayName(reference) {
    // Intentar developer
    const devName = this.resolveDeveloperName(reference);
    if (devName) return devName;

    // Intentar stakeholder
    const stkName = this.resolveStakeholderName(reference);
    if (stkName) return stkName;

    // Fallback
    if (reference?.includes('@')) {
      return this._formatNameFromEmail(reference);
    }

    return reference || '';
  }

  /**
   * Checks if a developer is an AI agent (e.g., BecarIA).
   * AI agents are identified by having an @ia.local email domain.
   * Only AI developers are allowed to be both developer and co-developer on the same card.
   * @param {string} devIdOrRef - Developer ID, email, or name reference
   * @returns {boolean}
   */
  isAIDeveloper(devIdOrRef) {
    if (!devIdOrRef) return false;
    const email = this.resolveDeveloperEmail(devIdOrRef);
    if (!email) return false;
    return email.endsWith('@ia.local');
  }

  /**
   * Verifica si el servicio esta inicializado
   */
  isInitialized() {
    return this._initialized;
  }

  /**
   * Espera a que el servicio este inicializado
   */
  async waitForInit() {
    if (this._initialized) return;
    if (this._initPromise) {
      await this._initPromise;
      return;
    }
    await this.init();
  }
}

// Singleton
export const entityDirectoryService = new EntityDirectoryService();

// Register globally for access from non-module scripts (e.g., dom-update-functions)
if (typeof window !== 'undefined') {
  window.entityDirectoryService = entityDirectoryService;
}
