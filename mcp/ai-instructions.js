/**
 * AI Instructions for Planning Game MCP
 *
 * These instructions are sent automatically to AI clients during the MCP
 * initialization handshake (via ServerOptions.instructions). This eliminates
 * wasted tokens from trial-and-error: the AI knows required fields, validation
 * rules, and state machine constraints BEFORE making any tool call.
 *
 * Design principles:
 * - Compact: every token counts, avoid redundancy
 * - Actionable: focus on what causes errors, not general descriptions
 * - Structured: easy for AI to parse and reference
 */

import {
  VALID_BUG_STATUSES,
  VALID_BUG_PRIORITIES,
  VALID_TASK_STATUSES,
  VALID_ID_PREFIXES,
  REQUIRED_FIELDS_TO_LEAVE_TODO,
  REQUIRED_FIELDS_FOR_TO_VALIDATE,
  REQUIRED_FIELDS_TO_CLOSE_BUG,
  MCP_RESTRICTED_STATUSES,
  TASK_TRANSITION_RULES,
  BLOCKED_REQUIRED_FIELDS,
  VALID_RELATION_TYPES,
  VALID_STEP_STATUSES,
  VALID_PLAN_STATUSES
} from '../shared/constants.js';

/**
 * Generate the AI instructions string.
 * Built dynamically from shared constants to stay in sync with validation logic.
 */
export function generateAiInstructions() {
  const requiredToLeaveTodo = REQUIRED_FIELDS_TO_LEAVE_TODO.join(', ');
  const requiredForToValidate = REQUIRED_FIELDS_FOR_TO_VALIDATE.join(', ');
  const requiredToCloseBug = REQUIRED_FIELDS_TO_CLOSE_BUG.join(', ');
  const bugStatuses = VALID_BUG_STATUSES.join(', ');
  const bugPriorities = VALID_BUG_PRIORITIES.join(' | ');
  const taskStatuses = VALID_TASK_STATUSES.join(', ');
  const restrictedStatuses = MCP_RESTRICTED_STATUSES.join(', ');
  const relationTypes = VALID_RELATION_TYPES.join(', ');
  const planStatuses = VALID_PLAN_STATUSES.join(', ');
  const stepStatuses = VALID_STEP_STATUSES.join(', ');

  // Build transition rules summary
  const transitionLines = Object.entries(TASK_TRANSITION_RULES)
    .filter(([, rule]) => rule.allowedTransitions.length > 0)
    .map(([from, rule]) => {
      const targets = rule.allowedTransitions.join(', ');
      const reqParts = [];
      if (rule.requirements) {
        for (const [target, fields] of Object.entries(rule.requirements)) {
          if (fields.length > 0) {
            reqParts.push(`  ${from} -> ${target}: needs [${fields.join(', ')}]`);
          }
        }
      }
      if (rule.mcpRestrictions) {
        reqParts.push(`  MCP CANNOT set: ${rule.mcpRestrictions.join(', ')}`);
      }
      return `- ${from} -> [${targets}]${reqParts.length ? '\n' + reqParts.join('\n') : ''}`;
    })
    .join('\n');

  // Build blocked fields
  const blockedFields = Object.entries(BLOCKED_REQUIRED_FIELDS)
    .map(([flag, fields]) => `  ${flag}=true requires: ${fields.join(', ')}`)
    .join('\n');

  return `# Planning Game MCP - AI Operational Guide

IMPORTANT: Read this BEFORE making any tool call. Following these rules avoids validation errors and wasted retries.

## Entity ID Formats (STRICT)
${Object.entries(VALID_ID_PREFIXES).map(([field, prefix]) => `- ${field}: must start with "${prefix}" (e.g., "${prefix}001")`).join('\n')}
- Use list_developers / list_stakeholders to get valid IDs

## create_card Required Fields by Type

### Task (type="task")
REQUIRED: title, descriptionStructured, acceptanceCriteria OR acceptanceCriteriaStructured, epic
- descriptionStructured: [{role: "Como...", goal: "Quiero...", benefit: "Para..."}]
- acceptanceCriteriaStructured: [{given: "...", when: "...", then: "..."}]
- epic: must be existing epic ID (e.g., "PRJ-EPC-0001"). Use list_cards type=epic first
- DO NOT set priority for tasks (auto-calculated from devPoints/businessPoints)
- sprint: must be existing sprint ID (e.g., "PRJ-SPR-0001"). Use list_sprints first
- validator: auto-assigned if not provided (from mcp-user config or defaults)

### Bug (type="bug")
REQUIRED: title
- priority: ${bugPriorities}
- Valid statuses: ${bugStatuses}
- Default status: "Created", default priority: "User Experience Issue"

### Epic (type="epic")
REQUIRED: title

### Proposal (type="proposal")
REQUIRED: title

## update_card: Task Status Transitions

Valid task statuses: ${taskStatuses}
MCP CANNOT set: ${restrictedStatuses} (only validators can)

### Transition Rules
${transitionLines}

### Key Required Fields per Transition

To leave "To Do" (any transition): ${requiredToLeaveTodo}
Additional for "To Validate": ${requiredForToValidate}, pipelineStatus.prCreated (with prUrl and prNumber)
For "Blocked":
${blockedFields}

### "To Validate" Checklist (ALL required)
1. All REQUIRED_FIELDS_TO_LEAVE_TODO must be set
2. startDate (ISO format, when work started)
3. endDate (ISO format, when work finished)
4. commits: [{hash, message, date, author}] (at least one)
5. pipelineStatus: {prCreated: {date, prUrl, prNumber}} - CREATE PR FIRST
6. If developer is BecarIA (dev_016): aiUsage array is REQUIRED

## update_card: Bug Status Transitions

Valid bug statuses: ${bugStatuses}

### Bug -> "Fixed" requires:
- commits: [{hash, message, date, author}]
- pipelineStatus.prCreated: {prUrl, prNumber}

### Bug -> "Closed" requires: ${requiredToCloseBug}
- commits: [{hash, message, date, author}]
- rootCause: string (why the bug occurred)
- resolution: string (how it was fixed)

## Sprint Rules
- sprint field MUST be an existing sprint ID (e.g., "PRJ-SPR-0001")
- NEVER use free text like "Sprint 1"
- Use list_sprints to get available sprints
- Use create_sprint if none exists

## Task Priority
- DO NOT set priority directly for tasks
- Auto-calculated: (businessPoints / devPoints) * 100
- Always provide devPoints AND businessPoints (both > 0)

## Implementation Plan
Required when devPoints >= 3 or complex tasks.
- approach: string (REQUIRED)
- steps: [{description, files?, status?}] - status values: ${stepStatuses}
- planStatus values: ${planStatuses}

## Card Relations
- relate_cards: relationType values: ${relationTypes}

## commits Field Format
Each commit object MUST have: hash, message, date, author (all strings, all required)

## AI Developer Rules (BecarIA = dev_016)
When AI executes a task:
- developer: ALWAYS set to dev_016 (BecarIA)
- codeveloper: set to requesting user's dev_ID
- aiUsage: REQUIRED when developer is dev_016

## Workflow: Recommended Order
1. get_project (read agentsGuidelines)
2. list_cards type=epic (get available epics)
3. list_sprints (get available sprints)
4. list_developers / list_stakeholders (get valid IDs)
5. create_card with ALL required fields
6. update_card for status transitions (check transition rules first)

## Common Mistakes to Avoid
- Creating tasks without epic -> ERROR
- Creating tasks without descriptionStructured -> ERROR
- Creating tasks without acceptanceCriteria -> ERROR
- Setting priority on tasks -> IGNORED/ERROR (use devPoints + businessPoints)
- Using free-text sprint names -> ERROR (use sprint IDs)
- Moving to "To Validate" without commits -> ERROR
- Moving to "To Validate" without pipelineStatus.prCreated -> ERROR
- Setting status to "Done&Validated" -> ERROR (validator only)
- Using developer names instead of dev_XXX IDs -> ERROR
- Using stakeholder names instead of stk_XXX IDs -> ERROR

## Multi-Instance Awareness
Multiple MCP instances may be connected (different Firebase projects). Every response includes _instance metadata. Use get_mcp_status to identify the correct instance.`;
}
