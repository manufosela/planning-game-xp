// Safe accessor for window globals (this file is also imported during SSR/build)
const _win = typeof window !== 'undefined' ? window : {};
const parseAllowedEmailDomains = (value) => {
  if (Array.isArray(value)) {
    return value.map((d) => String(d).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(',').map((d) => d.trim()).filter(Boolean);
  }
  return [];
};

export const APP_CONSTANTS = {
  // Production app URL - used for notification links, shared URLs, etc.
  // NEVER use window.location.origin for URLs stored in Firebase
  // Configured via PUBLIC_APP_URL env var → window.appUrl
  APP_URL: _win.appUrl || '',

  CARD_TYPES: ['sprints', 'epics', 'tasks', 'bugs', 'proposals', 'qa'],

  // Unassigned developer constants - use these for consistency across the app
  DEVELOPER_UNASSIGNED: {
    STORAGE_VALUE: '',  // Empty string stored in Firebase
    DISPLAY_ES: 'Sin asignar',  // Spanish display value
    DISPLAY_EN: 'No developer assigned',  // English display (for backwards compat)
    // All values that should be treated as "unassigned"
    ALIASES: ['', 'Sin asignar', 'No developer assigned', 'sin asignar', 'no developer assigned']
  },
  SECTIONS: ['Sprints', 'Epics', 'Tasks', 'Bugs', 'Proposals', 'QA'],
  DEFAULT_USER_PROJECTS: [],

  // Tabs visible in each view mode
  MANAGEMENT_TABS: ['sprints', 'epics', 'tasks', 'bugs', 'proposals', 'qa', 'adrs', 'app'],
  CONSULTATION_TABS: ['sprints', 'epics', 'proposals', 'app'],
  
  WELCOME_MESSAGES: {
    TITLE: _win.appName || 'Planning GameXP',
    SUBTITLE: 'Sign in with your account'
  },
  ORG_NAME: typeof _win.orgName === 'string' ? _win.orgName.trim() : '',
  // Configured via PUBLIC_ALLOWED_EMAIL_DOMAINS env var → window.allowedEmailDomains
  // Comma-separated list of domains (e.g. "example.com,corp.example.com")
  AUTH_ALLOWED_EMAIL_DOMAINS: parseAllowedEmailDomains(_win.allowedEmailDomains),
  
  PROJECT_CARD_ELEMENT: {
    'sprints': 'sprint-card',
    'epics': 'epic-card',
    'tasks': 'task-card',
    'bugs': 'bug-card',

    'proposals': 'proposal-card',
    'qa': 'qa-card',
    'logs': 'log-card',
    'app': 'app-manager'
  },
  
  // Task Status Order (logical workflow order)
  // Reopened is a special status for tasks that were validated but need rework
  TASK_STATUS_ORDER: ['To Do', 'In Progress', 'Pausado', 'To Validate', 'Done&Validated', 'Blocked', 'Reopened'],

  // Bug Status Order (logical workflow order — aligned with shared/constants.js)
  BUG_STATUS_ORDER: ['Created', 'Assigned', 'Fixed', 'Verified', 'Closed'],

  // Bug Priority Order (severity order)
  BUG_PRIORITY_ORDER: ['Application Blocker', 'Department Blocker', 'Individual Blocker', 'User Experience Issue', 'Workflow Improvement', 'Workaround Available Issue'],

  // Completed statuses - used to exclude cards from year migration
  // Tasks/bugs with these statuses are considered "finished" and won't be migrated to the next year
  TASK_COMPLETED_STATUSES: ['done', 'done&validated'],
  BUG_COMPLETED_STATUSES: ['fixed', 'verified', 'closed'],
  PROPOSAL_COMPLETED_STATUSES: ['approved', 'rejected', 'converted'],
  KANBAN_COLORS: {
    'TO DO': 'linear-gradient(135deg, #6c757d, #495057)',
    'IN PROGRESS': 'linear-gradient(135deg, #ffc107, #fd7e14)',
    'PAUSADO': 'linear-gradient(135deg, #ff9800, #f57c00)',
    'TO VALIDATE': 'linear-gradient(135deg, #17a2b8, #20c997)',
    'DONE&VALIDATED': 'linear-gradient(135deg, #28a745, #20c997)',
    'BLOCKED': 'linear-gradient(135deg, #dc3545, #c82333)',
    'REOPENED': 'linear-gradient(135deg, #9c27b0, #7b1fa2)',
    'HIGH': 'linear-gradient(135deg, #dc3545, #c82333)',
    'MEDIUM': 'linear-gradient(135deg, #ffc107, #fd7e14)',
    'LOW': 'linear-gradient(135deg, #28a745, #20c997)',
    'DEFAULT': 'linear-gradient(135deg, #6c757d, #495057)',
    
    // Bug Status Colors (aligned with shared/constants.js — 5 statuses)
    'Created': 'linear-gradient(135deg, #6c757d, #495057)',
    'Assigned': 'linear-gradient(135deg, #4a9eff, #007bff)',
    'Fixed': 'linear-gradient(135deg, #28a745, #218838)',
    'Verified': 'linear-gradient(135deg, #20c997, #198754)',
    'Closed': 'linear-gradient(135deg, #14532d, #276749)',
    
    // Bug Priority Colors
    'Application Blocker': 'linear-gradient(135deg, #dc3545, #c82333)',
    'Department Blocker': 'linear-gradient(135deg, #fd7e14, #e36209)',
    'Individual Blocker': 'linear-gradient(135deg, #ffc107, #e0a800)',
    'User Experience Issue': 'linear-gradient(135deg, #28a745, #218838)',
    'Workflow Improvement': 'linear-gradient(135deg, #17a2b8, #138496)',
    'Workaround Available Issue': 'linear-gradient(135deg, #6c757d, #495057)'
  },
  VIEWS: {
    LIST: 'list',
    KANBAN: 'kanban',
    SPRINT: 'sprint',
    GANTT: 'gantt'
  },

  // Table column definitions - SINGLE SOURCE OF TRUTH for column order
  // Both table-renderer.js and dom-update-functions.js must use these indices
  TABLE_COLUMNS: {
    TASKS: {
      ID: 0,
      TITLE: 1,
      STATUS: 2,
      PRIORITY: 3,
      SPRINT: 4,
      DEVELOPER: 5,
      VALIDATOR: 6,
      EPIC: 7,
      START_DATE: 8,
      END_DATE: 9,
      ACTIONS: 10,
      TOTAL: 11
    },
    BUGS: {
      ID: 0,
      TITLE: 1,
      STATUS: 2,
      PRIORITY: 3,
      SPRINT: 4,
      DEVELOPER: 5,
      EPIC: 6,
      REGISTER_DATE: 7,
      START_DATE: 8,
      END_DATE: 9,
      ACTIONS: 10,
      TOTAL: 11
    }
  }
};
