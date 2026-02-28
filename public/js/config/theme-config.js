// Status color classes using CSS variables from the theme system.
// Colors are set via ThemeLoaderService from /config/theme in RTDB.
// Fallback values match the defaults in semantic tokens.
export const KANBAN_STATUS_COLORS_CSS = `
.todo { background: var(--status-todo, #449bd3); color: var(--status-todo-text, #fff); }
.inprogress { background: var(--status-in-progress, #cce500); color: var(--status-in-progress-text, #000); }
.pausado { background: var(--status-in-progress, #cce500); color: var(--status-in-progress-text, #000); }
.tovalidate { background: var(--status-to-validate, #ff6600); color: var(--status-to-validate-text, #fff); }
.donevalidated { background: var(--status-done, #d4edda); color: var(--status-done-text, #000); }
.blocked { background: var(--status-blocked, #f8d7da); color: var(--status-blocked-text, #000); }
.reopened { background: var(--status-blocked, #f8d7da); color: var(--status-blocked-text, #000); }
.high { background: #dc3545; color: #fff; }
.medium { background: #ffc107; color: #000; }
.low { background: #28a745; color: #fff; }
.default { background: #6c757d; color: #fff; }
.created { background: #6c757d; color: #fff; }
.assigned { background: var(--brand-primary, #4a9eff); color: #fff; }
.fixed { background: #28a745; color: #fff; }
.verified { background: #20c997; color: #000; }
.closed { background: #14532d; color: #fff; }
.applicationblocker { background: #dc3545; color: #fff; }
.departmentblocker { background: #fd7e14; color: #fff; }
.individualblocker { background: #ffc107; color: #000; }
.userexperienceissue { background: #28a745; color: #fff; }
.workflowimprovement { background: #17a2b8; color: #fff; }
.workaroundavailableissue { background: #6c757d; color: #fff; }
`