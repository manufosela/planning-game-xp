/**
 * LoadProject use case — loads project data and subscribes to realtime updates.
 * @module application/use-cases/load-project
 */

/**
 * @typedef {Object} LoadProjectDeps
 * @property {{ get: (projectId: string) => Promise<any> }} projectRepository
 * @property {{ getAll: (projectId: string) => Promise<any[]> }} cardRepository
 * @property {{ getAll: (projectId: string) => Promise<any[]> }} teamRepository
 * @property {{ subscribeToCards: (projectId: string, cb: Function) => Function }} realtimePort
 */

export class LoadProject {
  /** @param {LoadProjectDeps} deps */
  constructor({ projectRepository, cardRepository, teamRepository, realtimePort }) {
    this._projectRepo = projectRepository;
    this._cardRepo = cardRepository;
    this._teamRepo = teamRepository;
    this._realtimePort = realtimePort;
  }

  /**
   * Load a project with its team and cards in parallel, then subscribe to realtime card updates.
   * @param {string} projectId
   * @param {{ onCardsUpdate?: (cards: any[]) => void }} [options]
   * @returns {Promise<{ project: any, team: any[], cards: any[], unsubscribe: Function }>}
   */
  async execute(projectId, options = {}) {
    const [project, team, cards] = await Promise.all([
      this._projectRepo.get(projectId),
      this._teamRepo.getAll(projectId),
      this._cardRepo.getAll(projectId),
    ]);

    if (!project) {
      throw new Error('Project not found');
    }

    const unsubscribe = this._realtimePort.subscribeToCards(projectId, (/** @type {any[]} */ updatedCards) => {
      options.onCardsUpdate?.(updatedCards);
    });

    return { project, team, cards, unsubscribe };
  }
}
