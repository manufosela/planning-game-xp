/**
 * Usage rules content for Planning Game MCP
 * Exposed as an MCP Resource so AI clients can read the rules when connecting
 */

export const USAGE_RULES_CONTENT = `
# Planning Game MCP - Usage Rules

## Mandatory Rules

### 1. Sprints
- The \`sprint\` field MUST be an existing sprint ID (e.g., "PRJ-SPR-0001")
- DO NOT use free text like "Sprint 1" or "February 2024"
- Use \`list_sprints\` to see available sprints
- Create a sprint with \`create_sprint\` if none exists

### 2. Task Priority
- DO NOT set \`priority\` directly for tasks
- Priority is calculated automatically: (businessPoints/devPoints)*100
- ALWAYS provide \`devPoints\` and \`businessPoints\` during Planning Game
- Scale: 1 (highest priority) to 25 (lowest) for 1-5 system, or 36 for fibonacci

### 3. Required Fields for Creating Cards

**BEFORE creating any task**: call \`list_stakeholders\` to get valid validator IDs for the project. If none exist, add stakeholders first.

**Task** (create_card type=task):
- \`title\`: Descriptive title (REQUIRED)
- \`descriptionStructured\`: Format [{role, goal, benefit}] (REQUIRED)
- \`acceptanceCriteria\` or \`acceptanceCriteriaStructured\` (REQUIRED — one of them)
- \`epic\`: Existing epic ID (REQUIRED — use list_cards type=epic to find one)
- \`validator\`: Stakeholder ID with "stk_" prefix (REQUIRED — use list_stakeholders)
- DO NOT send \`sprint\` — it is set later when moving to "In Progress"
- DO NOT send \`priority\` — it is auto-calculated from devPoints/businessPoints

**Bug** (create_card type=bug):
- \`title\`: Descriptive title (REQUIRED)
- \`description\`: Bug description (REQUIRED)

**Epic** (create_card type=epic):
- \`title\`: Epic title (REQUIRED)

**Proposal** (create_card type=proposal):
- \`title\`: Proposal title (REQUIRED)

### 3b. Required Fields for Status Transitions (update_card)

**ALWAYS call \`get_transition_rules\` before changing status** to verify current requirements.

**Task To Do → In Progress**:
- \`developer\`, \`validator\`, \`epic\`, \`sprint\`, \`devPoints\`, \`businessPoints\`, \`acceptanceCriteria\`, \`startDate\`

**Task In Progress → To Validate**:
- \`startDate\`, \`endDate\`, \`commits\` [{hash, message, date, author}], \`pipelineStatus.prCreated\`

**Bug Created → Assigned**:
- \`developer\`, \`startDate\`

**Bug Assigned → Fixed**:
- \`startDate\`, \`endDate\`, \`commits\`, \`pipelineStatus.prCreated\`

### 4. Entity IDs
- Developers: prefix "dev_" (e.g., "dev_001")
- Validators/Stakeholders: prefix "stk_" (e.g., "stk_001")
- Use \`list_developers\` and \`list_stakeholders\` to see available

### 5. Bugs
When closing a bug (status="Closed"):
- \`commits\`: Array of commits [{hash, message, date, author}]
- \`rootCause\`: Root cause of the bug
- \`resolution\`: How it was resolved

## Priority Calculation (Planning Game)

Formula: \`ratio = (businessPoints / devPoints) * 100\`

The mapping depends on the project's scoring system (\`scoringSystem\`):

### 1-5 System (25 combinations)
| businessPoints | devPoints | Ratio | Priority |
|---------------|-----------|-------|----------|
| 5 | 1 | 500 | 1 (highest) |
| 5 | 2 | 250 | ... |
| 1 | 5 | 20 | 25 (lowest) |

### Fibonacci System (36 combinations)
| businessPoints | devPoints | Ratio | Priority |
|---------------|-----------|-------|----------|
| 13 | 1 | 1300 | 1 (highest) |
| 8 | 1 | 800 | ... |
| 1 | 13 | ~8 | 36 (lowest) |

## Recommended Workflow

1. Query project: \`get_project\`
2. View available epics: \`list_cards type=epic\`
3. View available sprints: \`list_sprints\`
4. Create task with required fields
5. During Planning Game: update with developer, validator, points
6. When done: move to "To Validate" with commits

## Status Restrictions

- MCP CANNOT set tasks to "Done&Validated"
- Only validators can approve tasks
- Use "To Validate" to request validation

## Multi-Instance Awareness

Multiple instances of Planning Game MCP may be connected simultaneously, each pointing to a different Firebase project. Every tool response includes an \`_instance\` block with \`name\`, \`firebaseProjectId\`, and \`description\` so you can identify which instance responded.

### How to select the correct instance
1. Call \`get_mcp_status\` on each available instance to see its \`firebaseProjectId\` and \`description\`
2. Match the \`firebaseProjectId\` to the project you are working on
3. Use ONLY that instance for the rest of the session
4. If unsure which instance to use, ask the user

### Example
If you see instances \`planning-game-pro\` (firebaseProjectId: "planning-gamexp") and \`planning-game-personal\` (firebaseProjectId: "planning-game-xp"), use the one whose Firebase project matches your target project.

### Instance identification in responses
Every JSON response from any tool includes:
\`\`\`json
{
  "_instance": {
    "name": "personal",
    "firebaseProjectId": "planning-game-xp",
    "description": "Personal/manufosela projects"
  }
}
\`\`\`
Use this to confirm you are talking to the right instance.
`;
