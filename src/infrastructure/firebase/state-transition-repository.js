import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { getDb } from '../../lib/firebase.js';

/**
 * Firebase implementation of StateTransitionRepository port.
 * Uses Firestore subcollection: projects/{projectId}/cards/{cardId}/transitions
 * @implements {import('@pgv2/domain/ports').StateTransitionRepository}
 */
export class FirebaseStateTransitionRepository {
  /**
   * @param {string} projectId
   * @param {string} cardId
   * @param {import('@pgv2/domain/ports').StateTransition} transition
   * @returns {Promise<void>}
   */
  async recordTransition(projectId, cardId, transition) {
    const ref = collection(getDb(), 'projects', projectId, 'cards', cardId, 'transitions');
    await addDoc(ref, transition);
  }

  /**
   * @param {string} projectId
   * @param {string} cardId
   * @returns {Promise<import('@pgv2/domain/ports').StateTransition[]>}
   */
  async getTransitions(projectId, cardId) {
    const ref = collection(getDb(), 'projects', projectId, 'cards', cardId, 'transitions');
    const q = query(ref, orderBy('changedAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  /**
   * @param {string} projectId
   * @param {import('@pgv2/domain/ports').MetricFilters} [filters]
   * @returns {Promise<import('@pgv2/domain/ports').TransitionMetrics>}
   */
  async getMetrics(projectId, filters) {
    // Query all cards' transitions for the project, then compute metrics
    const cardsRef = collection(getDb(), 'projects', projectId, 'cards');
    let cardsQuery = query(cardsRef);

    if (filters?.type) {
      cardsQuery = query(cardsRef, where('type', '==', filters.type));
    }

    const cardsSnap = await getDocs(cardsQuery);
    const allTransitions = [];

    for (const cardDoc of cardsSnap.docs) {
      const card = cardDoc.data();
      // Apply additional filters at card level
      if (filters?.year && card.year !== filters.year) continue;
      if (filters?.sprint && card.sprint !== filters.sprint) continue;
      if (filters?.developer && card.developer !== filters.developer) continue;

      const transRef = collection(
        getDb(),
        'projects',
        projectId,
        'cards',
        cardDoc.id,
        'transitions'
      );
      const transSnap = await getDocs(transRef);
      allTransitions.push(...transSnap.docs.map((d) => d.data()));
    }

    return this._computeMetrics(allTransitions);
  }

  /**
   * @param {Array<import('@pgv2/domain/ports').StateTransition>} transitions
   * @returns {import('@pgv2/domain/ports').TransitionMetrics}
   */
  _computeMetrics(transitions) {
    /** @type {Record<string, number[]>} */
    const durations = {};
    /** @type {Record<string, number>} */
    const transitionCounts = {};

    for (const t of transitions) {
      const key = `${t.fromStatus}->${t.toStatus}`;
      transitionCounts[key] = (transitionCounts[key] || 0) + 1;

      if (t.durationInPreviousStatus != null) {
        if (!durations[t.fromStatus]) durations[t.fromStatus] = [];
        durations[t.fromStatus].push(t.durationInPreviousStatus);
      }
    }

    /** @type {Record<string, number>} */
    const avgCycleTime = {};
    for (const [status, durs] of Object.entries(durations)) {
      avgCycleTime[status] = durs.reduce((a, b) => a + b, 0) / durs.length;
    }

    const bottlenecks = Object.entries(avgCycleTime)
      .map(([status, avgDuration]) => ({ status, avgDuration }))
      .sort((a, b) => b.avgDuration - a.avgDuration);

    return { avgCycleTime, transitionCounts, bottlenecks };
  }
}
