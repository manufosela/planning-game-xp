/**
 * Task Filter Configuration
 * Declarative configuration for task filtering
 */

import { statusMatcher } from '../matchers/status-matcher.js';
import { developerMatcher, validatorMatcher } from '../matchers/developer-matcher.js';
import { sprintMatcher } from '../matchers/sprint-matcher.js';
import { epicMatcher } from '../matchers/epic-matcher.js';
import { repositoryLabelMatcher } from '../matchers/repository-matcher.js';

/**
 * Get status options for tasks
 * @returns {Promise<Array>}
 */
async function getStatusOptions() {
  const statusList = window.statusLists?.['task-card'] || {};
  return Object.keys(statusList).map(key => ({
    value: key,
    label: statusList[key]?.label || key
  }));
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
 * Get validator options (same as developers)
 * @returns {Promise<Array>}
 */
async function getValidatorOptions() {
  const developerList = globalThis.globalDeveloperList || {};
  const options = Object.keys(developerList).map(key => ({
    value: key,
    label: developerList[key]?.displayName || developerList[key]?.name || key
  }));
  // Add no-validator option
  options.unshift({ value: 'no-validator', label: 'Sin validator' });
  return options;
}

/**
 * Get sprint options filtered by year
 * @param {number} year - Year to filter by
 * @returns {Promise<Array>}
 */
async function getSprintOptions(year) {
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
  options.unshift({ value: 'no-sprint', label: 'Sin sprint (Backlog)' });

  return options;
}

/**
 * Get epic options
 * @returns {Promise<Array>}
 */
async function getEpicOptions() {
  const epicList = globalThis.globalEpicList || {};
  const options = Object.keys(epicList).map(key => ({
    value: key,
    label: epicList[key]?.title || epicList[key]?.name || key
  }));

  // Add no-epic option at the beginning
  options.unshift({ value: 'no-epic', label: 'Sin épica' });

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
 * Task filter configuration
 */
export const taskFilterConfig = {
  cardType: 'task',

  filters: {
    status: {
      id: 'status',
      label: 'Estado',
      placeholder: 'Filtrar por estado',
      matcher: statusMatcher,
      optionsProvider: getStatusOptions,
      multiSelect: true
    },
    sprint: {
      id: 'sprint',
      label: 'Sprint',
      placeholder: 'Filtrar por sprint',
      matcher: sprintMatcher,
      optionsProvider: getSprintOptions,
      multiSelect: true,
      yearDependent: true
    },
    epic: {
      id: 'epic',
      label: 'Épica',
      placeholder: 'Filtrar por épica',
      matcher: epicMatcher,
      optionsProvider: getEpicOptions,
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
    validator: {
      id: 'validator',
      label: 'Validator',
      placeholder: 'Filtrar por validator',
      matcher: validatorMatcher,
      optionsProvider: getValidatorOptions,
      multiSelect: true
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
  displayOrder: ['status', 'sprint', 'epic', 'developer', 'validator'],

  // Default filter values (applied on first load)
  defaultValues: {
    // No default values for tasks - user selects what they want
  }
};
