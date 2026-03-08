/**
 * Report Hours Service
 *
 * Calculates development vs maintenance hours per developer,
 * grouped by week and developer group (internal/external/manager).
 *
 * Classification:
 * - Bugs → always Maintenance
 * - Tasks with epic containing "[MANTENIMIENTO]" → Maintenance
 * - All other tasks → Development
 */

import { dalService } from './dal-service.js';
import { isWorkday } from '../utils/workday-utils.js';

const HOURS_PER_DAY = 8;
const DONE_STATUSES = new Set(['Done', 'Done&Validated']);

export class ReportHoursService {
  /**
   * Calculate monthly report with hours per developer, per week.
   * @param {number} year - Report year (e.g. 2026)
   * @param {number} month - Report month (1-12)
   * @returns {Promise<Object>} Report with weeks, groups, grandTotals
   */
  async calculateMonthlyReport(year, month) {
    const [groups, developerNames, projects] = await Promise.all([
      this._loadDeveloperGroups(),
      this._loadDeveloperNames(),
      this._loadProjects(),
    ]);

    const weeks = this._getMonthWeeks(year, month);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59);

    const projectIds = projects ? Object.keys(projects) : [];

    const allCards = await this._loadCardsFromAllProjects(projectIds, year, month, monthStart, monthEnd);

    const epicCache = await this._loadEpicsFromProjects(projectIds);

    const devHours = {};

    for (const card of allCards) {
      const devId = card.developer;
      if (!devId) continue;

      const hours = this._getCardHours(card, monthStart, monthEnd);
      if (hours <= 0) continue;

      const category = this._classifyCard(card, epicCache);
      const weekDistribution = this._distributeHoursAcrossWeeks(card, weeks, hours, monthStart, monthEnd);

      if (!devHours[devId]) {
        devHours[devId] = { weeks: {}, totals: { development: 0, maintenance: 0 }, cardDetails: [] };
      }

      for (const [weekLabel, weekHours] of Object.entries(weekDistribution)) {
        if (!devHours[devId].weeks[weekLabel]) {
          devHours[devId].weeks[weekLabel] = { development: 0, maintenance: 0 };
        }
        devHours[devId].weeks[weekLabel][category] += weekHours;
      }
      devHours[devId].totals[category] += hours;

      devHours[devId].cardDetails.push({
        cardId: card.cardId || '',
        title: card.title || '',
        projectId: card.projectId || '',
        cardType: card.cardType === 'bug' ? 'bug' : 'task',
        category,
        hours,
        endDate: card.endDate || '',
        weekDistribution,
      });
    }

    return this._buildReport(weeks, groups, devHours, developerNames);
  }

  /**
   * Load developer groups from Firebase
   * @returns {Promise<Object|null>}
   */
  async _loadDeveloperGroups() {
    return dalService.config.getDeveloperGroups();
  }

  /**
   * Load developer names from Firebase
   * @returns {Promise<Object>}
   */
  async _loadDeveloperNames() {
    return (await dalService.config.getDevelopers()) || {};
  }

  /**
   * Load all projects
   * @returns {Promise<Object|null>}
   */
  async _loadProjects() {
    return dalService.projects.listProjects();
  }

  /**
   * Load tasks and bugs from all projects, filtered by status and date overlap
   */
  async _loadCardsFromAllProjects(projectIds, year, month, monthStart, monthEnd) {
    const allCards = [];

    const fetchPromises = projectIds.flatMap(projectId => [
      this._loadSection(projectId, 'TASKS').then(cards => ({ projectId, cards, type: 'task' })),
      this._loadSection(projectId, 'BUGS').then(cards => ({ projectId, cards, type: 'bug' })),
    ]);

    const results = await Promise.all(fetchPromises);

    for (const { cards } of results) {
      if (!cards) continue;
      for (const card of Object.values(cards)) {
        if (!DONE_STATUSES.has(card.status)) continue;
        if (!card.startDate || !card.endDate) continue;
        if (!this._overlapsMonth(card, monthStart, monthEnd)) continue;
        allCards.push(card);
      }
    }

    return allCards;
  }

  /**
   * Load a card section from Firebase
   */
  async _loadSection(projectId, section) {
    const type = section === 'TASKS' ? 'task' : section === 'BUGS' ? 'bug' : section.toLowerCase();
    return dalService.cards.listCards(projectId, type);
  }

  /**
   * Load epics from all projects (for classification)
   */
  async _loadEpicsFromProjects(projectIds) {
    const epicCache = {};
    const promises = projectIds.map(async (projectId) => {
      const epics = await dalService.cards.listCards(projectId, 'epic');
      if (epics) {
        for (const [epicId, epic] of Object.entries(epics)) {
          epicCache[epicId] = epic;
        }
      }
    });
    await Promise.all(promises);
    return epicCache;
  }

  /**
   * Check if a card's date range overlaps with the given month
   */
  _overlapsMonth(card, monthStart, monthEnd) {
    const cardStart = new Date(card.startDate);
    const cardEnd = new Date(card.endDate);
    return cardStart <= monthEnd && cardEnd >= monthStart;
  }

  /**
   * Get total hours for a card, clamped to the month boundaries
   */
  _getCardHours(card, monthStart, monthEnd) {
    if (card.totalEffectiveHours != null && card.totalEffectiveHours > 0) {
      return this._clampEffectiveHours(card, card.totalEffectiveHours, monthStart, monthEnd);
    }
    if (card.effectiveHours != null && card.effectiveHours > 0) {
      return this._clampEffectiveHours(card, card.effectiveHours, monthStart, monthEnd);
    }
    return this._calculateBusinessHours(card, monthStart, monthEnd);
  }

  /**
   * For cards with explicit hours, proportionally allocate to month if card spans months
   */
  _clampEffectiveHours(card, totalHours, monthStart, monthEnd) {
    const cardStart = new Date(card.startDate);
    const cardEnd = new Date(card.endDate);

    const totalBusinessDays = this._countBusinessDays(cardStart, cardEnd);
    if (totalBusinessDays === 0) return totalHours;

    const clampedStart = cardStart < monthStart ? monthStart : cardStart;
    const clampedEnd = cardEnd > monthEnd ? monthEnd : cardEnd;
    const monthBusinessDays = this._countBusinessDays(clampedStart, clampedEnd);

    return Math.round((totalHours * monthBusinessDays / totalBusinessDays) * 100) / 100;
  }

  /**
   * Calculate business hours from dates, clamped to month
   */
  _calculateBusinessHours(card, monthStart, monthEnd) {
    const cardStart = new Date(card.startDate);
    const cardEnd = new Date(card.endDate);

    const clampedStart = cardStart < monthStart ? monthStart : cardStart;
    const clampedEnd = cardEnd > monthEnd ? monthEnd : cardEnd;

    const businessDays = this._countBusinessDays(clampedStart, clampedEnd);
    return businessDays * HOURS_PER_DAY;
  }

  /**
   * Count business days between two dates (inclusive)
   */
  _countBusinessDays(start, end) {
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    let count = 0;
    const current = new Date(startDay);
    while (current <= endDay) {
      if (isWorkday(current)) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    return count;
  }

  /**
   * Classify a card as 'development' or 'maintenance'
   */
  _classifyCard(card, epicCache) {
    if (card.cardType === 'bug') return 'maintenance';

    if (card.epic && epicCache[card.epic]) {
      const epicTitle = epicCache[card.epic].title || '';
      if (epicTitle.includes('[MANTENIMIENTO]')) return 'maintenance';
    }

    return 'development';
  }

  /**
   * Distribute hours across ISO weeks of the month
   */
  _distributeHoursAcrossWeeks(card, weeks, totalHours, monthStart, monthEnd) {
    const cardStart = new Date(card.startDate);
    const cardEnd = new Date(card.endDate);

    const clampedStart = cardStart < monthStart ? monthStart : cardStart;
    const clampedEnd = cardEnd > monthEnd ? monthEnd : cardEnd;

    const totalBusinessDays = this._countBusinessDays(clampedStart, clampedEnd);
    if (totalBusinessDays === 0) return {};

    const hoursPerDay = totalHours / totalBusinessDays;
    const distribution = {};

    const current = new Date(clampedStart.getFullYear(), clampedStart.getMonth(), clampedStart.getDate());
    const clampedEndDay = new Date(clampedEnd.getFullYear(), clampedEnd.getMonth(), clampedEnd.getDate());

    while (current <= clampedEndDay) {
      if (isWorkday(current)) {
        const weekLabel = this._getWeekLabelForDate(current, weeks, monthStart);
        if (weekLabel) {
          distribution[weekLabel] = (distribution[weekLabel] || 0) + hoursPerDay;
        }
      }
      current.setDate(current.getDate() + 1);
    }

    // Round values
    for (const key of Object.keys(distribution)) {
      distribution[key] = Math.round(distribution[key] * 100) / 100;
    }

    return distribution;
  }

  /**
   * Get week label (S1, S2...) for a date within the month
   */
  _getWeekLabelForDate(date, weeks, monthStart) {
    const weekIndex = this._getISOWeekOfMonth(date, monthStart);
    return weeks[weekIndex] || weeks[weeks.length - 1];
  }

  /**
   * Get 0-based week index of a date within the month (ISO weeks: Mon-Sun)
   */
  _getISOWeekOfMonth(date, monthStart) {
    // Find the Monday of the first ISO week that includes the month
    const firstDay = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
    const firstMonday = new Date(firstDay);
    const dayOfWeek = firstDay.getDay();
    // If first day is not Monday, go back to the previous Monday
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    firstMonday.setDate(firstDay.getDate() + diff);

    const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const daysDiff = Math.floor((dateDay - firstMonday) / (1000 * 60 * 60 * 24));
    return Math.floor(daysDiff / 7);
  }

  /**
   * Get ISO week labels for a given month
   */
  _getMonthWeeks(year, month) {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    // Find first Monday on or before the 1st
    const firstMonday = new Date(firstDay);
    const dayOfWeek = firstDay.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    firstMonday.setDate(firstDay.getDate() + diff);

    const weeks = [];
    const current = new Date(firstMonday);
    let weekNum = 1;

    while (current <= lastDay) {
      weeks.push(`S${weekNum}`);
      weekNum++;
      current.setDate(current.getDate() + 7);
    }

    return weeks;
  }

  /**
   * Build the final report structure
   */
  _buildReport(weeks, groups, devHours, developerNames) {
    const groupIndex = this._buildGroupIndex(groups);

    const reportGroups = {
      internal: { label: 'Internos', developers: {}, subtotals: { development: 0, maintenance: 0 } },
      external: { label: 'Externos', developers: {}, subtotals: { development: 0, maintenance: 0 } },
      manager: { label: 'Manager', developers: {}, subtotals: { development: 0, maintenance: 0 } },
    };

    const grandTotals = { development: 0, maintenance: 0 };
    let hasUnclassified = false;

    for (const [devId, data] of Object.entries(devHours)) {
      const groupKey = groupIndex.get(devId) || 'unclassified';
      const devName = (developerNames[devId] && developerNames[devId].name) || devId;

      if (groupKey === 'unclassified' && !hasUnclassified) {
        reportGroups.unclassified = { label: 'Sin clasificar', developers: {}, subtotals: { development: 0, maintenance: 0 } };
        hasUnclassified = true;
      }

      const group = reportGroups[groupKey];
      const sortedDetails = (data.cardDetails || []).slice().sort((a, b) => {
        if (a.endDate < b.endDate) return -1;
        if (a.endDate > b.endDate) return 1;
        return 0;
      });

      group.developers[devId] = {
        name: devName,
        weeks: data.weeks,
        totals: data.totals,
        cardDetails: sortedDetails,
      };

      group.subtotals.development += data.totals.development;
      group.subtotals.maintenance += data.totals.maintenance;
      grandTotals.development += data.totals.development;
      grandTotals.maintenance += data.totals.maintenance;
    }

    return { weeks, groups: reportGroups, grandTotals };
  }

  /**
   * Build a Map of devId -> groupKey from groups data
   */
  _buildGroupIndex(groups) {
    const index = new Map();
    if (!groups) return index;

    for (const [groupKey, groupData] of Object.entries(groups)) {
      if (groupData && Array.isArray(groupData.developers)) {
        for (const devId of groupData.developers) {
          index.set(devId, groupKey);
        }
      }
    }
    return index;
  }
}

// Singleton
export const reportHoursService = new ReportHoursService();
