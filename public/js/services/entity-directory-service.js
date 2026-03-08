/**
 * Entity Directory Service
 *
 * Servicio central para gestionar developers, stakeholders y teams con IDs estables.
 * Proporciona resolucion bidireccional: ID ↔ email ↔ name
 *
 * Firebase Structure (centralized user model):
 * /users/{encodedEmail} = { name, email, developerId, stakeholderId, active, createdAt, createdBy,
 *                           projects: { projectId: { developer: bool, stakeholder: bool, addedAt } } }
 * /data/teams/{teamId} = { name }
 */

import { dalService } from './dal-service.js';
import { developerDirectory } from '../config/developer-directory.js';
import { decodeEmailFromFirebase } from '../utils/email-sanitizer.js';

const normalizeEmail = (email) => (email || '').toString().trim().toLowerCase();
const normalizeName = (name) => (name || '').toString().trim();
const legacyDeveloperDirectory = new Map(
  (developerDirectory || []).map(entry => [entry.id, entry.name || entry.primaryEmail || ''])
);

/**
 * Encodes email for Firebase RTDB keys: @ → |, . → !, # → -
 */
function encodeEmailForFirebase(email) {
  if (!email) return '';
  return email.replace(/@/g, '|').replace(/\./g, '!').replace(/#/g, '-');
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
    // Cache de entidades (derived from /users/)
    this._developers = new Map(); // devId -> { id, email, name, active, emails }
    this._stakeholders = new Map(); // stkId -> { id, email, name, active, teamId }
    this._teams = new Map(); // teamId -> { name }
    this._users = new Map(); // encodedEmail -> full user object from /users/

    // Indices inversos para busqueda rapida
    this._developersByEmail = new Map(); // email -> devId
    this._developersByName = new Map(); // normalizedName -> devId
    this._stakeholdersByEmail = new Map(); // email -> stkId
    this._stakeholdersByName = new Map(); // normalizedName -> stkId

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
  async init({ refreshIfEmpty = false } = {}) {
    if (this._initialized) {
      if (refreshIfEmpty && this._users.size === 0 && this._developers.size === 0 && this._stakeholders.size === 0) {
        await this._loadFromFirebase();
      }
      return;
    }
    if (this._initPromise) return this._initPromise;

    this._initPromise = this._loadFromFirebase();
    await this._initPromise;
    this._initialized = true;
    this._setupRealtimeListeners();
}

  async _loadFromFirebase() {
    try {
      const [usersData, teamsData, trashData] = await Promise.all([
        dalService.entities.getAllUsers(),
        dalService.entities.getAllTeams(),
        dalService.entities.getTrashUsers().catch(() => null)
      ]);

      // Teams must be processed first so stakeholders can reference them
      if (teamsData) {
        this._processTeams(teamsData);
      }

      if (usersData) {
        this._processUsers(usersData);
      }

      this._mergeTrashUsers(trashData);
    } catch (error) {
      // Silently ignore initialization errors
    }
  }

  _decodeTrashEmail(value) {
    if (!value) return '';
    if (value.includes('|') || value.includes('!') || value.includes('-')) {
      try {
        return decodeEmailFromFirebase(value);
      } catch {
        return value;
      }
    }
    return value;
  }

  _mergeTrashUsers(data) {
    if (!data || typeof data !== 'object') return;

    Object.entries(data).forEach(([key, raw]) => {
      if (!raw) return;
      const candidate = raw.data || raw.user || raw.original || raw;
      if (!candidate || typeof candidate !== 'object') return;

      const email = normalizeEmail(candidate.email || this._decodeTrashEmail(key));
      const name = normalizeName(candidate.name || raw.name || '');
      const active = candidate.active !== false;
      const developerId = candidate.developerId || candidate.devId || '';
      const stakeholderId = candidate.stakeholderId || candidate.stkId || '';

      if (developerId && developerId.startsWith('dev_')) {
        const existing = this._developers.get(developerId);
        if (existing) {
          if (!existing.name && name) existing.name = name;
          if (!existing.email && email) existing.email = email;
          if (!existing.emails?.length && email) existing.emails = [email];
          if (existing.active === undefined) existing.active = active;
        } else {
          this._developers.set(developerId, {
            id: developerId,
            name,
            email,
            emails: email ? [email] : [],
            active
          });
        }

        if (email) this._developersByEmail.set(email, developerId);
        if (name) this._developersByName.set(name.toLowerCase(), developerId);
        this._nextDeveloperId = updateNextIdCounter(developerId, 'dev_', this._nextDeveloperId);
      }

      if (stakeholderId && stakeholderId.startsWith('stk_')) {
        const existing = this._stakeholders.get(stakeholderId);
        if (existing) {
          if (!existing.name && name) existing.name = name;
          if (!existing.email && email) existing.email = email;
          if (existing.active === undefined) existing.active = active;
        } else {
          this._stakeholders.set(stakeholderId, {
            id: stakeholderId,
            name,
            email,
            active,
            teamId: candidate.teamId || null
          });
        }

        if (email) this._stakeholdersByEmail.set(email, stakeholderId);
        if (name) this._stakeholdersByName.set(name.toLowerCase(), stakeholderId);
        this._nextStakeholderId = updateNextIdCounter(stakeholderId, 'stk_', this._nextStakeholderId);
      }
    });
  }

  _coerceLegacyEntries(data) {
    if (!data) return [];
    if (Array.isArray(data)) {
      return data.map(entry => ({ id: entry?.id || entry?.devId || entry?.stakeholderId || '', info: entry }));
    }
    if (typeof data === 'object') {
      return Object.entries(data).map(([id, info]) => ({ id, info }));
    }
    return [];
  }

  _mergeLegacyDevelopers(data) {
    const entries = this._coerceLegacyEntries(data);
    entries.forEach(({ id, info }) => {
      const resolvedId = id || info?.id || '';
      if (!resolvedId || !resolvedId.startsWith('dev_')) return;

      const name = typeof info === 'string' ? info : (info?.name || info?.displayName || '');
      const email = typeof info === 'string' ? '' : (info?.email || info?.mail || '');
      const active = typeof info === 'object' ? info?.active !== false : true;
      const normalizedEmail = normalizeEmail(email);
      const normalizedName = normalizeName(name);

      const existing = this._developers.get(resolvedId);
      if (existing) {
        if (!existing.name && name) existing.name = name;
        if (!existing.email && normalizedEmail) existing.email = normalizedEmail;
        if (!existing.emails?.length && normalizedEmail) existing.emails = [normalizedEmail];
        if (existing.active === undefined) existing.active = active;
      } else {
        this._developers.set(resolvedId, {
          id: resolvedId,
          name,
          email: normalizedEmail,
          emails: normalizedEmail ? [normalizedEmail] : [],
          active
        });
      }

      if (normalizedEmail) this._developersByEmail.set(normalizedEmail, resolvedId);
      if (normalizedName) this._developersByName.set(normalizedName.toLowerCase(), resolvedId);
      this._nextDeveloperId = updateNextIdCounter(resolvedId, 'dev_', this._nextDeveloperId);
    });
  }

  _mergeLegacyStakeholders(data) {
    const entries = this._coerceLegacyEntries(data);
    entries.forEach(({ id, info }) => {
      const resolvedId = id || info?.id || '';
      if (!resolvedId || !resolvedId.startsWith('stk_')) return;

      const name = typeof info === 'string' ? info : (info?.name || info?.displayName || '');
      const email = typeof info === 'string' ? '' : (info?.email || info?.mail || '');
      const active = typeof info === 'object' ? info?.active !== false : true;
      const teamId = typeof info === 'object' ? info?.teamId || null : null;
      const normalizedEmail = normalizeEmail(email);
      const normalizedName = normalizeName(name);

      const existing = this._stakeholders.get(resolvedId);
      if (existing) {
        if (!existing.name && name) existing.name = name;
        if (!existing.email && normalizedEmail) existing.email = normalizedEmail;
        if (existing.active === undefined) existing.active = active;
        if (!existing.teamId && teamId) existing.teamId = teamId;
      } else {
        this._stakeholders.set(resolvedId, {
          id: resolvedId,
          name,
          email: normalizedEmail,
          active,
          teamId
        });
      }

      if (normalizedEmail) this._stakeholdersByEmail.set(normalizedEmail, resolvedId);
      if (normalizedName) this._stakeholdersByName.set(normalizedName.toLowerCase(), resolvedId);
      this._nextStakeholderId = updateNextIdCounter(resolvedId, 'stk_', this._nextStakeholderId);
    });
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

  /**
   * Processes the centralized /users/ data and builds developer/stakeholder caches
   */
  _processUsers(data) {
    this._users.clear();
    this._developers.clear();
    this._developersByEmail.clear();
    this._developersByName.clear();
    this._stakeholders.clear();
    this._stakeholdersByEmail.clear();
    this._stakeholdersByName.clear();
    this._nextDeveloperId = 1;
    this._nextStakeholderId = 1;

    if (!data) return;

    for (const [encodedEmail, userInfo] of Object.entries(data)) {
      if (!userInfo || typeof userInfo !== 'object') continue;

      const email = normalizeEmail(userInfo.email);
      const name = normalizeName(userInfo.name);
      const active = userInfo.active !== false;

      this._users.set(encodedEmail, { ...userInfo, _encodedEmail: encodedEmail });

      // Build developer entry if user has a developerId
      if (userInfo.developerId) {
        const devId = userInfo.developerId;
        const entity = {
          id: devId,
          email,
          emails: [email],
          name,
          active
        };
        this._developers.set(devId, entity);
        if (email) this._developersByEmail.set(email, devId);
        if (name) this._developersByName.set(name.toLowerCase(), devId);
        this._nextDeveloperId = updateNextIdCounter(devId, 'dev_', this._nextDeveloperId);
      }

      // Build stakeholder entry if user has a stakeholderId
      if (userInfo.stakeholderId) {
        const stkId = userInfo.stakeholderId;
        const entity = {
          id: stkId,
          email,
          name,
          active,
          teamId: userInfo.teamId || null
        };
        this._stakeholders.set(stkId, entity);
        if (email) this._stakeholdersByEmail.set(email, stkId);
        if (name) this._stakeholdersByName.set(name.toLowerCase(), stkId);
        this._nextStakeholderId = updateNextIdCounter(stkId, 'stk_', this._nextStakeholderId);
      }
    }
  }

  _setupRealtimeListeners() {
    // Listener para teams
    dalService.entities.subscribeToTeams((teamsData) => {
      if (teamsData) {
        this._processTeams(teamsData);
        this._notifyListeners('teams');
      }
    });

    // Listener para /users/ (centralized model — replaces /data/developers + /data/stakeholders + /projects listeners)
    dalService.entities.subscribeToUsers((usersData) => {
      if (usersData) {
        this._processUsers(usersData);
        this._notifyListeners('developers');
        this._notifyListeners('stakeholders');
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

    if (reference?.startsWith?.('dev_')) {
      const fallbackName = legacyDeveloperDirectory.get(reference);
      if (fallbackName) return fallbackName;
    }

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
   * Finds the /users/ entry for a developer by their devId
   * @returns {string|null} encodedEmail key or null
   */
  _findUserByDevId(devId) {
    for (const [encodedEmail, user] of this._users) {
      if (user.developerId === devId) return encodedEmail;
    }
    return null;
  }

  /**
   * Finds the /users/ entry for a stakeholder by their stkId
   * @returns {string|null} encodedEmail key or null
   */
  _findUserByStkId(stkId) {
    for (const [encodedEmail, user] of this._users) {
      if (user.stakeholderId === stkId) return encodedEmail;
    }
    return null;
  }

  /**
   * Crea o actualiza un developer en /users/
   */
  async saveDeveloper(id, data) {
    const email = normalizeEmail(data.email);
    const name = normalizeName(data.name);
    const active = data.active !== false;

    // Find existing user by devId or by email
    let encodedEmail = this._findUserByDevId(id);
    if (!encodedEmail && email) {
      encodedEmail = encodeEmailForFirebase(email);
    }
    if (!encodedEmail) throw new Error('Cannot save developer without email');

    const existing = await dalService.entities.getUser(encodedEmail) || {};

    const updated = {
      ...existing,
      name,
      email,
      active,
      developerId: id
    };

    await dalService.entities.setUser(encodedEmail, updated);

    // Update local cache
    const entity = { id, email, emails: [email], name, active };
    this._developers.set(id, entity);
    if (email) this._developersByEmail.set(email, id);
    if (name) this._developersByName.set(name.toLowerCase(), id);

    this._users.set(encodedEmail, { ...updated, _encodedEmail: encodedEmail });

    return id;
  }

  /**
   * Deletes a developer by ID (removes developerId from /users/ entry)
   * @param {string} id - Developer ID (e.g., 'dev_001')
   */
  async deleteDeveloper(id) {
    const developer = this._developers.get(id);
    if (!developer) return;

    const encodedEmail = this._findUserByDevId(id);
    if (encodedEmail) {
      await dalService.entities.updateUser(encodedEmail, { developerId: null });

      // Update cached user
      const user = this._users.get(encodedEmail);
      if (user) delete user.developerId;
    }

    // Clean up inverse indices
    if (developer.email) {
      this._developersByEmail.delete(developer.email);
    }
    if (developer.emails) {
      for (const altEmail of developer.emails) {
        if (this._developersByEmail.get(altEmail) === id) {
          this._developersByEmail.delete(altEmail);
        }
      }
    }
    if (developer.name) {
      const normalizedName = developer.name.toLowerCase();
      if (this._developersByName.get(normalizedName) === id) {
        this._developersByName.delete(normalizedName);
      }
    }

    this._developers.delete(id);
    this._notifyListeners('developers');
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
   * Crea o actualiza un stakeholder en /users/
   */
  async saveStakeholder(id, data) {
    const email = normalizeEmail(data.email);
    const name = normalizeName(data.name);
    const active = data.active !== false;

    // Find existing user by stkId or by email
    let encodedEmail = this._findUserByStkId(id);
    if (!encodedEmail && email) {
      encodedEmail = encodeEmailForFirebase(email);
    }
    if (!encodedEmail) throw new Error('Cannot save stakeholder without email');

    const existing = await dalService.entities.getUser(encodedEmail) || {};

    const updated = {
      ...existing,
      name,
      email,
      active,
      stakeholderId: id
    };

    if (data.teamId !== undefined) {
      updated.teamId = data.teamId;
    }

    await dalService.entities.setUser(encodedEmail, updated);

    // Update local cache
    const entity = { id, email, name, active, teamId: data.teamId || null };
    this._stakeholders.set(id, entity);
    if (email) this._stakeholdersByEmail.set(email, id);
    if (name) this._stakeholdersByName.set(name.toLowerCase(), id);

    this._users.set(encodedEmail, { ...updated, _encodedEmail: encodedEmail });

    return id;
  }

  /**
   * Deletes a stakeholder by ID (removes stakeholderId from /users/ entry)
   * @param {string} id - Stakeholder ID (e.g., 'stk_001')
   */
  async deleteStakeholder(id) {
    const stakeholder = this._stakeholders.get(id);
    if (!stakeholder) return;

    const encodedEmail = this._findUserByStkId(id);
    if (encodedEmail) {
      await dalService.entities.updateUser(encodedEmail, { stakeholderId: null });

      // Update cached user
      const user = this._users.get(encodedEmail);
      if (user) delete user.stakeholderId;
    }

    // Clean up inverse indices
    if (stakeholder.email) {
      if (this._stakeholdersByEmail.get(stakeholder.email) === id) {
        this._stakeholdersByEmail.delete(stakeholder.email);
      }
    }
    if (stakeholder.name) {
      const normalizedName = stakeholder.name.toLowerCase();
      if (this._stakeholdersByName.get(normalizedName) === id) {
        this._stakeholdersByName.delete(normalizedName);
      }
    }

    this._stakeholders.delete(id);
    this._notifyListeners('stakeholders');
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

  // ==================== PROJECT TEAMS (derived from /users/) ====================

  /**
   * Obtiene los IDs de developers de un proyecto (from /users/ projects assignments)
   * Falls back to /projects/{projectId}/developers when /users/ has no project assignments
   */
  async getProjectDeveloperIds(projectId) {
    if (!projectId) return [];

    const ids = [];
    for (const user of this._users.values()) {
      if (user.developerId && user.projects?.[projectId]?.developer === true) {
        ids.push(user.developerId);
      }
    }

    if (ids.length > 0) return ids;

    // Fallback: read from project data
    try {
      const project = await dalService.projects.get(projectId);
      if (project?.developers) {
        const data = project.developers;
        const projectIds = Array.isArray(data) ? data : Object.keys(data);
        console.warn(`[EntityDirectoryService] No /users/ project assignments found for "${projectId}" developers. Using project data as source.`);
        return projectIds.filter(id => typeof id === 'string' && id.startsWith('dev_'));
      }
    } catch (error) {
      console.warn(`[EntityDirectoryService] Failed to read project "${projectId}" developers:`, error.message);
    }

    return [];
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
   * Obtiene los IDs de stakeholders de un proyecto (from /users/ projects assignments)
   * Falls back to /projects/{projectId}/stakeholders when /users/ has no project assignments
   */
  async getProjectStakeholderIds(projectId) {
    if (!projectId) return [];

    const ids = [];
    for (const user of this._users.values()) {
      if (user.stakeholderId && user.projects?.[projectId]?.stakeholder === true) {
        ids.push(user.stakeholderId);
      }
    }

    if (ids.length > 0) return ids;

    // Fallback: read from project data
    try {
      const project = await dalService.projects.get(projectId);
      if (project?.stakeholders) {
        const data = project.stakeholders;
        const projectIds = Array.isArray(data) ? data : Object.keys(data);
        console.warn(`[EntityDirectoryService] No /users/ project assignments found for "${projectId}" stakeholders. Using project data as source.`);
        return projectIds.filter(id => typeof id === 'string' && id.startsWith('stk_'));
      }
    } catch (error) {
      console.warn(`[EntityDirectoryService] Failed to read project "${projectId}" stakeholders:`, error.message);
    }

    return [];
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
   * Assigns a user to a project with a role (writes to /users/{encodedEmail}/projects/{projectId})
   */
  async setUserProjectRole(email, projectId, role, value) {
    const encodedEmail = encodeEmailForFirebase(normalizeEmail(email));
    await dalService.entities.updateUser(encodedEmail, { [`projects/${projectId}/${role}`]: value });
  }

  /**
   * Gets all users with their centralized data
   * @returns {Array} Array of user objects from /users/
   */
  getAllUsers() {
    return Array.from(this._users.values());
  }

  /**
   * Gets a user by encoded email
   * @param {string} encodedEmail - The encoded email key
   * @returns {Object|null} User data or null
   */
  getUser(encodedEmail) {
    return this._users.get(encodedEmail) || null;
  }

  /**
   * Gets a user by raw email
   * @param {string} email - Raw email address
   * @returns {Object|null} User data or null
   */
  getUserByEmail(email) {
    const encodedEmail = encodeEmailForFirebase(normalizeEmail(email));
    return this._users.get(encodedEmail) || null;
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
