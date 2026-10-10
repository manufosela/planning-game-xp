/**
 * Bug Filter Configuration
 * Declarative configuration for bug filtering
 */

import { statusMatcher } from '../matchers/status-matcher.js';
import { developerMatcher } from '../matchers/developer-matcher.js';
import { priorityMatcher } from '../matchers/priority-matcher.js';
import { createdByMatcher } from '../matchers/created-by-matcher.js';
import { completedInSprintMatcher } from '../matchers/sprint-matcher.js';
import { repositoryLabelMatcher } from '../matchers/repository-matcher.js';
import { APP_CONSTANTS } from '../../constants/app-constants.js';

/**
 * Build select options from either an array of names (runtime shape of
 * statusBugList / globalBugPriorityList) or a `{ key: { label } }` map
 * (APP_CONSTANTS shape).
 * @param {Array<string>|Object} list
 * @returns {Array<{value: string, label: string}>}
 */
function toOptions(list) {
  if (Array.isArray(list)) {
    return list.map(name => ({ value: name, label: name }));
  }
  return Object.entries(list).map(([key, value]) => ({
    value: key,
    label: value?.label || key
  }));
}

/**
 * Get status options for bugs
 * @returns {Promise<Array>}
 */
async function getStatusOptions() {
  return toOptions(globalThis.statusBugList || APP_CONSTANTS.BUG_STATUS_LIST);
}

/**
 * Get priority options for bugs
 * @returns {Promise<Array>}
 */
async function getPriorityOptions() {
  return toOptions(globalThis.globalBugPriorityList || APP_CONSTANTS.BUG_PRIORITY_LIST);
}

/**
 * Get developer options
 * @returns {Promise<Array>}
 */
async function getDeveloperOptions() {
  const developerList = globalThis.globalDeveloperList || {};
  return Object.keys(developerList).map(key => ({
    value: key,
    label: developerList[key]?.displayName || developerList[key]?.name || key
  }));
}

/**
 * Get created by options
 * @returns {Promise<Array>}
 */
async function getCreatedByOptions() {
  const usersDirectory = globalThis.usersDirectory || {};
  const options = Object.keys(usersDirectory).map(key => ({
    value: key,
    label: usersDirectory[key]?.displayName || usersDirectory[key]?.name || key
  }));

  // Add no-creator option at the beginning
  options.unshift({ value: 'no-creator', label: 'Sin creador' });

  return options;
}

/**
 * Get completed in sprint options
 * @param {number} year - Year to filter by
 * @returns {Promise<Array>}
 */
async function getCompletedSprintOptions(year) {
  const sprintList = globalThis.globalSprintList || {};
  const currentYear = year || new Date().getFullYear();

  const options = Object.entries(sprintList)
    .filter(([, sprint]) => {
      if (!sprint.year && sprint.startDate) {
        const sprintYear = new Date(sprint.startDate).getFullYear();
        return sprintYear === currentYear;
      }
      return sprint.year === currentYear;
    })
    .map(([key, sprint]) => ({
      value: key,
      label: sprint.name || sprint.sprintName || key
    }));

  // Add no-sprint option at the beginning
  options.unshift({ value: 'no-sprint', label: 'Sin sprint' });

  return options;
}

/**
 * Get repository label options
 * @returns {Promise<Array>}
 */
async function getRepositoryOptions() {
  const currentProject = globalThis.currentProject;
  if (!currentProject?.repositoryLabels) {
    return [];
  }

  return Object.entries(currentProject.repositoryLabels).map(([key, label]) => ({
    value: key,
    label: label.name || key
  }));
}

/**
 * Bug filter configuration
 */
export const bugFilterConfig = {
  cardType: 'bug',

  filters: {
    status: {
      id: 'status',
      label: 'Estado',
      placeholder: 'Filtrar por estado',
      matcher: statusMatcher,
      optionsProvider: getStatusOptions,
      multiSelect: true
    },
    priority: {
      id: 'priority',
      label: 'Prioridad',
      placeholder: 'Filtrar por prioridad',
      matcher: priorityMatcher,
      optionsProvider: getPriorityOptions,
      multiSelect: true
    },
    developer: {
      id: 'developer',
      label: 'Desarrollador',
      placeholder: 'Filtrar por desarrollador',
      matcher: developerMatcher,
      optionsProvider: getDeveloperOptions,
      multiSelect: true
    },
    createdBy: {
      id: 'createdBy',
      label: 'Creado por',
      placeholder: 'Filtrar por creador',
      matcher: createdByMatcher,
      optionsProvider: getCreatedByOptions,
      multiSelect: true
    },
    completedInSprint: {
      id: 'completedInSprint',
      label: 'Completados en Sprint',
      placeholder: 'Filtrar por sprint completado',
      matcher: completedInSprintMatcher,
      optionsProvider: getCompletedSprintOptions,
      multiSelect: true,
      yearDependent: true
    },
    repositoryLabel: {
      id: 'repositoryLabel',
      label: 'Repo',
      placeholder: 'Filtrar por repositorio',
      matcher: repositoryLabelMatcher,
      optionsProvider: getRepositoryOptions,
      multiSelect: true
    }
  },

  // Default filters to display (order matters)
  displayOrder: ['status', 'priority', 'developer', 'createdBy', 'completedInSprint'],

  // Default filter values (applied on first load)
  defaultValues: {
    status: ['Created', 'Assigned']
  }
};
