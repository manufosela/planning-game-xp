import { dalService } from './dal-service.js';
import { entityDirectoryService } from './entity-directory-service.js';

const SESSION_KEY = 'pgxp-data-cache';
const TTL_MS = 24 * 60 * 60 * 1000; // 1 día

class DataBus {
  constructor() {
    this._cache = {};
    this._listeners = [];
    this._initPromise = null;
    this._currentEmail = '';
    this._inflightProjects = new Map();
    this._bootstrapDone = false;
    this._ready = false;
    this._pendingRequests = [];

    document.addEventListener('request-global-data', (event) => {
      const { key, projectId, requestId } = event.detail || {};
      const id = requestId || this._generateRequestId();
      if (!this._ready) {
        this._pendingRequests.push({ key, projectId, requestId: id });
        return;
      }
      this._handleRequest({ key, projectId, requestId: id });
    });

    document.addEventListener('user-authenticated', (event) => {
      const email = event?.detail?.user?.email || document.body.dataset.userEmail || '';
      this._currentEmail = email;
      this.resetCache();
      this.init(email);
    });

    document.addEventListener('user-signed-out', () => {
      this.resetCache();
    });
  }

  resetCache() {
    this._cache = {};
    this._listeners.forEach(unsub => unsub());
    this._listeners = [];
    sessionStorage.removeItem(SESSION_KEY);
    this._initPromise = null;
    this._ready = false;
    this._pendingRequests = [];
  }

  async init(email) {
    this._currentEmail = email || this._currentEmail || '';
    if (this._initPromise && this._bootstrapDone) return this._initPromise;

    this._initPromise = (async () => {
      // intentar cargar de sessionStorage si es válido
      if (email) {
        const stored = sessionStorage.getItem(SESSION_KEY);
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed.email === email && parsed.ts && (Date.now() - parsed.ts) < TTL_MS) {
              this._cache = parsed.data || {};
            } else {
              sessionStorage.removeItem(SESSION_KEY);
            }
          } catch (error) {
sessionStorage.removeItem(SESSION_KEY);
          }
        }
      }

      await this._preload();
      this._attachRealtimeListeners();
      this._ready = true;
      this._bootstrapDone = true;
      this._processPendingRequests();
      document.dispatchEvent(new CustomEvent('global-data-bus-ready'));
    })();

    return this._initPromise;
  }

  async waitForReady() {
    if (this._initPromise) {
      await this._initPromise;
    }
  }

  async _preload() {
    try {
      const loaders = {
        projects: () => dalService.projects.listProjects(),
        projectsByUser: () => dalService.config.getAllProjectsByUser(),
        relEmailUser: () => dalService.config.getRelEmailUser(),
        statusList: () => dalService.config.getAllStatusLists(),
        suites: () => dalService.config.getAllSuites(),
        wipTimelineState: () => dalService.config.getWipTimelineState(),
      };

      const entries = Object.entries(loaders);
      const results = await Promise.all(entries.map(async ([key, loader]) => {
        try {
          const data = await loader();
          return [key, data];
        } catch {
          return [key, null];
        }
      }));

      for (const [key, value] of results) {
        this._cache[key] = value || {};
      }
      this._persist();
    } catch (error) {
      // Silently ignore initial data fetch errors
    }
  }

  _attachRealtimeListeners() {
    this._listeners.forEach(unsub => unsub());
    this._listeners = [];

    const subscribers = {
      projects: (cb) => dalService.config.subscribeToProjects(cb),
      projectsByUser: (cb) => dalService.config.subscribeToProjectsByUser(cb),
      relEmailUser: (cb) => dalService.config.subscribeToRelEmailUser(cb),
      statusList: (cb) => dalService.config.subscribeToStatusLists(cb),
      suites: (cb) => dalService.config.subscribeToAllSuites(cb),
      wipTimelineState: (cb) => dalService.config.subscribeToWipTimelineState(cb),
    };

    Object.entries(subscribers).forEach(([key, subscribeFn]) => {
      const unsub = subscribeFn((data) => {
        this._cache[key] = data || {};
        this._persist();
      });
      this._listeners.push(unsub);
    });
  }

  _persist() {
    if (!this._currentEmail) return;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      email: this._currentEmail,
      ts: Date.now(),
      data: this._cache
    }));
  }

  async get(key, { projectId } = {}) {
    await this.waitForReady();
    if (key === 'project' && projectId) {
      const project = await this._getProjectEntry(projectId);
      return project || null;
    }
    return this._cache[key] || null;
  }

  async getProjectDevelopers(projectId) {
    if (!projectId) return [];
    await this.waitForReady();
    const project = await this._getProjectEntry(projectId);
    if (!project?.developers) return [];

    await entityDirectoryService.waitForInit?.();

    let entries = [];
    if (Array.isArray(project.developers)) {
      entries = project.developers;
    } else if (typeof project.developers === 'string') {
      entries = project.developers.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
    } else if (typeof project.developers === 'object') {
      entries = Object.values(project.developers || {});
    }

    const ids = entries.map(entry => {
      if (entry && typeof entry === 'object') {
        const candidate = entry.id || entry.email || entry.name || '';
        return entityDirectoryService.resolveDeveloperId(candidate);
      }
      return entityDirectoryService.resolveDeveloperId(entry);
    }).filter(Boolean);
    const unique = Array.from(new Set(ids));
    return unique.map(id => entityDirectoryService.getDeveloper(id)).filter(Boolean);
  }

  async getProjectStakeholders(projectId) {
    if (!projectId) return [];
    await this.waitForReady();
    const project = await this._getProjectEntry(projectId);
    if (!project?.stakeholders) return [];

    await entityDirectoryService.waitForInit?.();

    let entries = [];
    if (Array.isArray(project.stakeholders)) {
      entries = project.stakeholders;
    } else if (typeof project.stakeholders === 'string') {
      entries = project.stakeholders.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
    } else if (typeof project.stakeholders === 'object') {
      entries = Object.values(project.stakeholders || {});
    }

    const ids = entries.map(entry => {
      if (entry && typeof entry === 'object') {
        const candidate = entry.id || entry.email || entry.name || '';
        return entityDirectoryService.resolveStakeholderId(candidate);
      }
      return entityDirectoryService.resolveStakeholderId(entry);
    }).filter(Boolean);
    const unique = Array.from(new Set(ids));
    return unique.map(id => entityDirectoryService.getStakeholder(id)).filter(Boolean);
  }

  async _fetchProject(projectId) {
    if (!projectId) return null;
    if (this._inflightProjects.has(projectId)) {
      return this._inflightProjects.get(projectId);
    }
    const promise = (async () => {
      try {
        const projectData = await dalService.projects.getProject(projectId);
        if (projectData) {
          this._cache.projects = this._cache.projects || {};
          this._cache.projects[projectId] = projectData;
          this._persist();
          return projectData;
        }
      } catch (error) {
        // Silently ignore project fetch errors
      } finally {
        this._inflightProjects.delete(projectId);
      }
      return null;
    })();
    this._inflightProjects.set(projectId, promise);
    return promise;
  }

  _normalizeKey(value) {
    return (value || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  async _getProjectEntry(projectId) {
    if (!this._cache.projects?.[projectId]) {
      await this._fetchProject(projectId);
    }
    if (this._cache.projects?.[projectId]) {
      return this._cache.projects[projectId];
    }

    // Intentar coincidencia por clave normalizada (ej: PlanningGame vs planning-game)
    const targetKey = this._normalizeKey(projectId);
    const projects = this._cache.projects || {};
    for (const [key, value] of Object.entries(projects)) {
      if (this._normalizeKey(key) === targetKey) {
        return value;
      }
    }
    return null;
  }

  _generateRequestId() {
    return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async _handleRequest({ key, projectId, requestId }) {
    try {
      let data = null;
      if (key === 'project-developers') {
        data = await this.getProjectDevelopers(projectId);
      } else if (key === 'project-stakeholders') {
        data = await this.getProjectStakeholders(projectId);
      } else if (key === 'project') {
        data = await this.get('project', { projectId });
      } else {
        data = await this.get(key, { projectId });
      }
      document.dispatchEvent(new CustomEvent('provide-global-data', {
        detail: { key, projectId, data, requestId }
      }));
    } catch (error) {
document.dispatchEvent(new CustomEvent('provide-global-data', {
        detail: { key, projectId, data: null, requestId, error: error?.message || 'error' }
      }));
    }
  }

  _processPendingRequests() {
    const pending = [...this._pendingRequests];
    this._pendingRequests = [];
    pending.forEach((req) => this._handleRequest(req));
  }
}

export const dataBus = new DataBus();
export default dataBus;
