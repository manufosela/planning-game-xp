# Task categories (`taskCategory`)

Introduced by PLN-TSK-0354.

Tasks can carry an optional `taskCategory` field:

| Value | Meaning | Fields required to reach "To Validate" |
|---|---|---|
| `code` (default) | Regular development task. Legacy behaviour. | `startDate`, `commits[]`, `pipelineStatus.prCreated` |
| `nocode` | Task that produces no commits in this repo — data cleanup, ops, docs written elsewhere, external data ingestion, manual configuration. | `startDate`, `endDate`, `completionNote` (min 20 chars) |

A task with no `taskCategory` set is treated as `code` for full backwards compatibility with the ~2000 existing tasks. **No migration is required.**

## When to use `nocode`

Pick `nocode` when the outcome cannot be represented as commits to this repo. Examples:

- Populating a database or a Firebase path from an external source.
- Manual configuration in third-party services (Firebase Console, GCP IAM, Grafana, etc.).
- Documentation delivered in a Google Doc, wiki or PDF outside the repo.
- Coordination / meetings that produce a decision but not code.

The audit trail is the `completionNote` field — a short description of what was done. Since there are no commits to point to, this note is what future readers will use to verify the work.

Don't use `nocode` to skip PR review on real code changes. If code changes happened, the task is `code`.

## Field mechanics

- `taskCategory` is validated as an enum by MCP, Firebase Rules, and the frontend form.
- `completionNote` must be a string of at least 20 non-whitespace characters when the task is `nocode` and transitions to "To Validate". At other times it is optional.
- Flipping `code` → `nocode` does not clear existing `commits`. Flipping `nocode` → `code` does not clear `completionNote`. Both fields are kept for history.

## MCP behaviour

```
get_transition_rules → requiredFieldsForToValidateByCategory: {
  code:   [...leave-todo, "startDate", "commits", "pipelineStatus.prCreated"],
  nocode: [...leave-todo, "startDate", "endDate", "completionNote"]
}
```

`create_card` and `update_card` accept both fields; enum values other than `code`/`nocode` are rejected with `INVALID_TASK_CATEGORY`.

## UI

- Compact and expanded cards show a "sin código" badge next to the title when `taskCategory === 'nocode'`.
- The task form has a "Categoría" select in the same row as Spike / Expedited.
- The "Commits" tab is repurposed as "Completion note" when the task is `nocode`, showing a textarea instead of the commit table.
- A new filter option ("Categoría" — Todas / Solo con código / Solo sin código) is available in the task table via `unified-filter-service`.

## Extending the enum in the future

`docs`, `ops`, `research`, `data` are potential next values. Any new value must:

1. Be added to `TASK_CATEGORY_VALUES` in `shared/task-category.js` (and its mirror in `public/js/utils/task-category.js`).
2. Have its "To Validate" required fields declared in `resolveToValidateRequirements` and `toValidateRequirementsByCategory`.
3. Have its Firebase Rules enum expanded in `database.rules.json`.
4. Have a UI option added to the form select and the filter.

Adding a new value must never break existing tasks. The default is always `code`.
