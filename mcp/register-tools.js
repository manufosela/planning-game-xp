import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { listProjectsSchema, listProjects, getProjectSchema, getProject, updateProjectSchema, updateProject, createProjectSchema, createProject, discoverProjectSchema, discoverProject } from './tools/projects.js';
import { resolveProjectId } from './services/project-resolver.js';
import { listCardsSchema, getCardSchema, createCardSchema, updateCardSchema, relateCardsSchema, getTransitionRulesSchema, listCards, getCard, createCard, updateCard, relateCards, getTransitionRules } from './tools/cards.js';
import { listSprintsSchema, listSprints, createSprintSchema, createSprint, updateSprintSchema, updateSprint, getSprintSchema, getSprint } from './tools/sprints.js';
import { listDevelopersSchema, listDevelopers } from './tools/developers.js';
import { listStakeholdersSchema, listStakeholders } from './tools/stakeholders.js';
import { listAdrsSchema, listAdrs, getAdrSchema, getAdr, createAdrSchema, createAdr, updateAdrSchema, updateAdr, deleteAdrSchema, deleteAdr } from './tools/adrs.js';
import { listPlansSchema, listPlans, getPlanSchema, getPlan, createPlanSchema, createPlan, updatePlanSchema, updatePlan, deletePlanSchema, deletePlan } from './tools/plans.js';
import { listPlanProposalsSchema, listPlanProposals, getPlanProposalSchema, getPlanProposal, createPlanProposalSchema, createPlanProposal, updatePlanProposalSchema, updatePlanProposal, deletePlanProposalSchema, deletePlanProposal } from './tools/plan-proposals.js';
import { listGlobalConfigSchema, listGlobalConfig, getGlobalConfigSchema, getGlobalConfig, createGlobalConfigSchema, createGlobalConfig, updateGlobalConfigSchema, updateGlobalConfig, deleteGlobalConfigSchema, deleteGlobalConfig, getGuidelineHistorySchema, getGuidelineHistory, restoreGuidelineVersionSchema, restoreGuidelineVersion } from './tools/global-config.js';
import { setupMcpUserSchema, setupMcpUser } from './tools/setup-user.js';
import { provisionUserSchema, provisionUser } from './tools/provision-user.js';
import { deleteUserSchema, deleteUser } from './tools/delete-user.js';
import { checkForUpdates, getUpdateNoticeOnce, getMcpStatus, getLocalVersion, updateMcp, resetNotificationFlag, setLatestVersionInFirebase } from './version-check.js';
import { USAGE_RULES_CONTENT } from './usage-rules.js';
import { generateAiInstructions } from './ai-instructions.js';
import { isMcpUserConfigured } from './user.js';
import { pgDoctorSchema, pgDoctor } from './tools/doctor.js';
import { pgConfigSchema, pgConfig } from './tools/config.js';
import { getInstanceMetadata } from './instance-metadata.js';
import { syncGuidelinesSchema, syncGuidelines } from './tools/sync-guidelines.js';
import { compressResponse, compactStringify } from './response-compressor.js';

// Track calls for periodic update checks
let callCount = 0;
let lastCheckTime = Date.now();
const CHECK_INTERVAL_CALLS = 20;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * Extend a Zod schema shape with _hasContext.
 * LLMs send _hasContext:true after receiving context to skip re-injection.
 */
function withContext(shape) {
  return {
    ...shape,
    _hasContext: z.boolean().optional().describe('Set to true after receiving _context block. Omit on first call or after context loss.')
  };
}

/**
 * Build compact project context: developers, stakeholders, epics, sprints, rules.
 * Injected once on first call (or after context loss) to prevent trial-and-error.
 */
async function buildProjectContext(projectId) {
  try {
    const { getDatabase } = await import('firebase-admin/database');
    const db = getDatabase();

    const [devsSnap, stksSnap, cardsSnap, projectSnap] = await Promise.all([
      db.ref('/data/developers').once('value'),
      db.ref('/data/stakeholders').once('value'),
      db.ref(`/cards/${projectId}`).once('value'),
      db.ref(`/projects/${projectId}`).once('value')
    ]);

    const project = projectSnap.val() || {};
    const projectDevIds = project.developers || [];
    const projectStkIds = project.stakeholders || [];

    const allDevs = devsSnap.val() || {};
    const developers = [];
    for (const [id, dev] of Object.entries(allDevs)) {
      if (!id.startsWith('dev_') || typeof dev !== 'object' || dev.active === false) continue;
      if (Array.isArray(projectDevIds) && projectDevIds.includes(id)) {
        developers.push({ id, name: dev.name || '' });
      }
    }

    const allStks = stksSnap.val() || {};
    const stakeholders = [];
    for (const [id, stk] of Object.entries(allStks)) {
      if (!id.startsWith('stk_') || typeof stk !== 'object' || stk.active === false) continue;
      if (Array.isArray(projectStkIds) && projectStkIds.includes(id)) {
        stakeholders.push({ id, name: stk.name || '' });
      }
    }

    const allCards = cardsSnap.val() || {};
    const epics = [];
    const sprints = [];
    const currentYear = new Date().getFullYear();
    for (const [key, cards] of Object.entries(allCards)) {
      if (!cards || typeof cards !== 'object') continue;
      if (key.startsWith('EPICS_')) {
        for (const card of Object.values(cards)) {
          if (card?.cardId) epics.push({ id: card.cardId, title: card.title || '' });
        }
      } else if (key.startsWith('SPRINTS_')) {
        for (const card of Object.values(cards)) {
          if (card?.cardId && (!card.year || card.year >= currentYear)) {
            sprints.push({ id: card.cardId, title: card.title || '' });
          }
        }
      }
    }

    return {
      _context: {
        projectId,
        developers,
        stakeholders,
        epics: epics.slice(0, 30),
        sprints: sprints.slice(0, 10),
        rules: {
          createTask: 'REQUIRED: title, descriptionStructured, acceptanceCriteria/acceptanceCriteriaStructured, epic, validator (stk_XXX). FORBIDDEN: sprint, priority.',
          toInProgress: 'REQUIRED in updates: developer, validator, epic, sprint, devPoints, businessPoints, acceptanceCriteria, startDate.',
          toValidate: 'REQUIRED in updates: endDate, commits [{hash,message,date,author}], pipelineStatus.prCreated.',
          bugAssigned: 'REQUIRED: developer, startDate.',
          bugFixed: 'REQUIRED: endDate, commits, pipelineStatus.prCreated.'
        },
        _note: 'Include _hasContext:true in ALL future calls to skip this block.'
      }
    };
  } catch { return null; }
}

/**
 * Wrap tool handler to include update notice and user configuration warnings.
 */
function wrapWithUpdateNotice(handler) {
  return async (params) => {
    callCount++;

    const now = Date.now();
    const shouldCheck = (callCount % CHECK_INTERVAL_CALLS === 0) ||
                        (now - lastCheckTime > CHECK_INTERVAL_MS);

    if (shouldCheck) {
      lastCheckTime = now;
      resetNotificationFlag();
      await checkForUpdates(true);
    }

    const result = await handler(params);
    const updateNotice = getUpdateNoticeOnce();

    if (updateNotice && result.content && result.content.length > 0) {
      const firstContent = result.content[0];
      if (firstContent.type === 'text') {
        result.content[0] = {
          type: 'text',
          text: `${updateNotice}\n\n---\n\n${firstContent.text}`
        };
      }
    }

    // Add USER_NOT_CONFIGURED warning if mcp.user.json is missing
    if (!isMcpUserConfigured() && result.content && result.content.length > 0) {
      const parsed = safeJsonParse(result.content[0].text);
      if (parsed) {
        if (!parsed.warnings) parsed.warnings = [];
        parsed.warnings.push({
          code: 'USER_NOT_CONFIGURED',
          message: 'MCP user is not configured. Run setup_mcp_user to configure your identity. This enables auto-assignment of validator, correct createdBy/updatedBy tracking, and more.'
        });
        result.content[0] = { type: 'text', text: JSON.stringify(parsed, null, 2) };
      }
    }

    // Inject _instance metadata, project context (if needed), and compress
    if (result.content && result.content.length > 0) {
      const parsed = safeJsonParse(result.content[0].text);
      if (parsed) {
        parsed._instance = getInstanceMetadata();

        // Inject project context on first call or after context loss
        if (!params._hasContext && params.projectId) {
          const ctx = await buildProjectContext(params.projectId);
          if (ctx) Object.assign(parsed, ctx);
        }

        const toolHint = parsed.card && parsed.availableTransitions ? 'get_card' : '';
        const compressed = compressResponse(parsed, toolHint);
        result.content[0] = { type: 'text', text: compactStringify(compressed) };
      }
    }

    return result;
  };
}

/**
 * Wrap tool handler to resolve projectId via fuzzy matching before calling the handler.
 * If the projectId was fuzzy-resolved, adds a _projectResolution note to the response.
 */
function wrapWithProjectResolution(handler) {
  return async (params) => {
    if (params.projectId) {
      const resolution = await resolveProjectId(params.projectId);
      params.projectId = resolution.resolvedId;

      const result = await handler(params);

      if (resolution.wasResolved && result.content && result.content.length > 0) {
        const firstContent = result.content[0];
        if (firstContent.type === 'text') {
          const parsed = safeJsonParse(firstContent.text);
          if (parsed) {
            parsed._projectResolution = {
              input: resolution.input,
              resolvedTo: resolution.resolvedId,
              note: `projectId "${resolution.input}" was automatically resolved to "${resolution.resolvedId}". Use the exact ID in future calls for best performance.`
            };
            result.content[0] = { type: 'text', text: JSON.stringify(parsed, null, 2) };
          }
        }
      }

      return result;
    }

    return handler(params);
  };
}

/**
 * Compose two wrappers: first resolves projectId, then adds update notice.
 */
function wrapWithProjectAndNotice(handler) {
  return wrapWithUpdateNotice(wrapWithProjectResolution(handler));
}

/**
 * Create and configure a McpServer with all tools and resources registered.
 * @param {string} serverName - Name for the MCP server instance
 * @returns {McpServer}
 */
export function createMcpServer(serverName) {
  const server = new McpServer(
    {
      name: serverName || 'planning-gamexp',
      version: getLocalVersion()
    },
    {
      instructions: generateAiInstructions()
    }
  );

  // ── Project tools ──
  server.tool('list_projects', 'List all projects with name, abbreviation, and developers', listProjectsSchema.shape, wrapWithUpdateNotice(async () => {
    return await listProjects();
  }));

  server.tool('get_project', 'Get full details of a project including description, repos, languages, frameworks, and team', withContext(getProjectSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await getProject(params);
  }));

  server.tool('update_project', 'Update fields of an existing project (description, repoUrl, languages, frameworks, agentsGuidelines, etc.)', withContext(updateProjectSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await updateProject(params);
  }));

  server.tool('create_project', 'Create a new project. REQUIRED: name, abbreviation (3-4 uppercase letters). Optional: description, repoUrl, languages, frameworks. Auto-generates publicToken and default epic.', createProjectSchema.shape, wrapWithUpdateNotice(async (params) => {
    return await createProject(params);
  }));

  server.tool('discover_project', 'Discover a project by its repository URL (supports HTTPS, SSH, with/without .git)', discoverProjectSchema.shape, wrapWithUpdateNotice(async (params) => {
    return await discoverProject(params);
  }));

  // ── Card tools ──
  server.tool('list_cards', 'List cards of a project filtered by type, status, sprint, developer, or year', withContext(listCardsSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await listCards(params);
  }));

  server.tool('get_card', 'Get full details of a card by its cardId', withContext(getCardSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await getCard(params);
  }));

  server.tool('create_card', [
    'Create a new card (task, bug, epic, or proposal) with auto-generated ID.',
    '',
    'REQUIRED fields by type (will ERROR if missing):',
    '• task: title, descriptionStructured, acceptanceCriteria OR acceptanceCriteriaStructured, epic (existing epic ID), validator (stk_XXX — use list_stakeholders to get valid IDs)',
    '• bug: title, description',
    '• epic: title',
    '• proposal: title',
    '',
    'FORBIDDEN on create:',
    '• task: sprint (set later via update_card on "In Progress"), priority (auto-calculated from devPoints/businessPoints)',
    '',
    'BEFORE creating tasks: call list_stakeholders to get valid validator IDs. If no stakeholders exist, add them to the project first.'
  ].join('\n'), withContext(createCardSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await createCard(params);
  }));

  server.tool('update_card', [
    'Update fields of an existing card.',
    '',
    'REQUIRED fields by transition (call get_transition_rules first):',
    '• task To Do→In Progress: developer, validator, epic, sprint, devPoints, businessPoints, acceptanceCriteria, startDate',
    '• task In Progress→To Validate: startDate, endDate, commits[], pipelineStatus.prCreated',
    '• bug Created→Assigned: developer, startDate',
    '• bug Assigned→Fixed: startDate, endDate, commits[], pipelineStatus.prCreated',
    '',
    'Always call get_transition_rules before changing status to verify current requirements.'
  ].join('\n'), withContext(updateCardSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await updateCard(params);
  }));

  server.tool('relate_cards', 'Create or remove relations between cards. REQUIRED: projectId, sourceCardId, targetCardId, relationType ("related" or "blocks"). Optional: action ("add" default, or "remove").', withContext(relateCardsSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await relateCards(params);
  }));

  server.tool('get_transition_rules', 'Get status transition rules for cards. Call this BEFORE attempting status updates to understand requirements.', withContext(getTransitionRulesSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await getTransitionRules(params);
  }));

  // ── Sprint tools ──
  server.tool('list_sprints', 'List sprints of a project with dates and points', withContext(listSprintsSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await listSprints(params);
  }));

  server.tool('get_sprint', 'Get full details of a sprint by its cardId', withContext(getSprintSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await getSprint(params);
  }));

  server.tool('create_sprint', 'Create a new sprint. REQUIRED: projectId, title, startDate (YYYY-MM-DD), endDate (YYYY-MM-DD). Optional: devPoints, businessPoints, year.', withContext(createSprintSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await createSprint(params);
  }));

  server.tool('update_sprint', 'Update fields of an existing sprint', withContext(updateSprintSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await updateSprint(params);
  }));

  // ── Team tools ──
  server.tool('list_developers', 'List all developers (dev_XXX IDs). Call this BEFORE assigning developers to cards. Optional: projectId to filter by project team.', listDevelopersSchema.shape, wrapWithUpdateNotice(async (params) => {
    return await listDevelopers(params);
  }));

  server.tool('list_stakeholders', 'List all stakeholders (stk_XXX IDs). Call this BEFORE creating tasks — validator is REQUIRED and must be a valid stk_XXX ID from this list. Optional: projectId to filter by project team.', listStakeholdersSchema.shape, wrapWithUpdateNotice(async (params) => {
    return await listStakeholders(params);
  }));

  // ── ADR tools ──
  server.tool('list_adrs', 'List all ADRs for a project', withContext(listAdrsSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await listAdrs(params);
  }));

  server.tool('get_adr', 'Get full details of an ADR', withContext(getAdrSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await getAdr(params);
  }));

  server.tool('create_adr', 'Create a new ADR (Architecture Decision Record)', withContext(createAdrSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await createAdr(params);
  }));

  server.tool('update_adr', 'Update an existing ADR', withContext(updateAdrSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await updateAdr(params);
  }));

  server.tool('delete_adr', 'Delete an ADR (moves to trash)', withContext(deleteAdrSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await deleteAdr(params);
  }));

  // ── Development Plans tools ──
  server.tool('list_plans', 'List development plans for a project, optionally filtered by status (draft, accepted, rejected)', withContext(listPlansSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await listPlans(params);
  }));

  server.tool('get_plan', 'Get full details of a development plan including phases and proposed tasks', withContext(getPlanSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await getPlan(params);
  }));

  server.tool('create_plan', 'Create a new development plan with phases and proposed tasks', withContext(createPlanSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await createPlan(params);
  }));

  server.tool('update_plan', 'Update a development plan (title, objective, status, phases)', withContext(updatePlanSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await updatePlan(params);
  }));

  server.tool('delete_plan', 'Delete a development plan (moves to trash)', withContext(deletePlanSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await deletePlan(params);
  }));

  // ── Plan Proposal tools ──
  server.tool('list_plan_proposals', 'List plan proposals for a project, optionally filtered by status (pending, planned, rejected)', withContext(listPlanProposalsSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await listPlanProposals(params);
  }));

  server.tool('get_plan_proposal', 'Get full details of a plan proposal including linked plan IDs', withContext(getPlanProposalSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await getPlanProposal(params);
  }));

  server.tool('create_plan_proposal', 'Create a new plan proposal (feature request that can later generate technical plans)', withContext(createPlanProposalSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await createPlanProposal(params);
  }));

  server.tool('update_plan_proposal', 'Update a plan proposal (title, description, status, tags, planIds)', withContext(updatePlanProposalSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await updatePlanProposal(params);
  }));

  server.tool('delete_plan_proposal', 'Delete a plan proposal (moves to trash)', withContext(deletePlanProposalSchema.shape), wrapWithProjectAndNotice(async (params) => {
    return await deletePlanProposal(params);
  }));

  // ── Global Config tools ──
  server.tool('list_global_config', 'List all global configs of a type (agents, prompts, instructions, guidelines)', listGlobalConfigSchema.shape, wrapWithUpdateNotice(async (params) => {
    return await listGlobalConfig(params);
  }));

  server.tool('get_global_config', 'Get full details of a global config', getGlobalConfigSchema.shape, wrapWithUpdateNotice(async (params) => {
    return await getGlobalConfig(params);
  }));

  server.tool('create_global_config', 'Create a new global config (agent, prompt, instruction, or guideline). Guidelines require content and support auto-versioning.', createGlobalConfigSchema.shape, wrapWithUpdateNotice(async (params) => {
    return await createGlobalConfig(params);
  }));

  server.tool('update_global_config', 'Update an existing global config. For guidelines: auto-increments version and saves previous content in history when content changes.', updateGlobalConfigSchema.shape, wrapWithUpdateNotice(async (params) => {
    return await updateGlobalConfig(params);
  }));

  server.tool('delete_global_config', 'Delete a global config (moves to trash)', deleteGlobalConfigSchema.shape, wrapWithUpdateNotice(async (params) => {
    return await deleteGlobalConfig(params);
  }));

  // ── Guideline Versioning tools ──
  server.tool('get_guideline_history', 'Get version history of a guideline including current version and all previous versions with timestamps', getGuidelineHistorySchema.shape, wrapWithUpdateNotice(async (params) => {
    return await getGuidelineHistory(params);
  }));

  server.tool('restore_guideline_version', 'Restore a guideline to a previous version. Creates a new version with the content from the specified historical version, preserving full history', restoreGuidelineVersionSchema.shape, wrapWithUpdateNotice(async (params) => {
    return await restoreGuidelineVersion(params);
  }));

  // ── MCP Status & Update tools ──
  const getMcpStatusSchema = z.object({});
  server.tool('get_mcp_status', 'Get MCP server status including version and update availability', getMcpStatusSchema.shape, async () => {
    const status = await getMcpStatus();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(status, null, 2)
      }]
    };
  });

  const updateMcpSchema = z.object({});
  server.tool('update_mcp', 'Update MCP server to latest version (git pull). Requires session restart after update.', updateMcpSchema.shape, async () => {
    const result = await updateMcp();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  });

  const publishMcpVersionSchema = z.object({
    version: z.string().optional().describe('Version to publish. If not provided, uses current local version from package.json')
  });
  server.tool('publish_mcp_version', 'Publish MCP version to Firebase so other users get update notifications. Call after pushing changes.', publishMcpVersionSchema.shape, async (params) => {
    const version = params.version || getLocalVersion();
    const success = await setLatestVersionInFirebase(version);

    if (success) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Versión v${version} publicada en Firebase. Los usuarios serán notificados de la actualización.`,
            version
          }, null, 2)
        }]
      };
    } else {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'Error al publicar la versión en Firebase. Verifica la conexión.'
          }, null, 2)
        }]
      };
    }
  });

  // ── User Setup tool ──
  server.tool('setup_mcp_user', 'Configure MCP user identity. Accepts name, email, or developerId to auto-match. Without params: lists developers and asks the user to identify themselves. Auto-matches stakeholder by email.', setupMcpUserSchema.shape, wrapWithUpdateNotice(async (params) => {
    return await setupMcpUser(params);
  }));

  // ── User Provisioning tool ──
  server.tool('provision_user', 'Provision a new user or update an existing one in /users/. Creates user record, auto-generates developer/stakeholder IDs, and assigns projects. Idempotent: safe to re-run.', provisionUserSchema.shape, wrapWithUpdateNotice(async (params) => {
    return await provisionUser(params);
  }));

  // ── User Deletion tool ──
  server.tool('delete_user', 'Delete a user from /users/ and clean up legacy permission paths (/data/appAdmins, appUploaders, betaUsers). Does NOT delete Firebase Auth account.', deleteUserSchema.shape, wrapWithUpdateNotice(async (params) => {
    return await deleteUser(params);
  }));

  // ── Diagnostic tools ──
  server.tool('pg_doctor', 'Run comprehensive diagnostics on the MCP server: checks Node.js, Firebase credentials, connectivity, dependencies, user config, version, and git. Use this to troubleshoot issues.', pgDoctorSchema.shape, async () => {
    return await pgDoctor();
  });

  server.tool('pg_config', 'View MCP server configuration: instance name, Firebase project, credentials path, user config, environment variables. Use action "get" with a key for specific values.', pgConfigSchema.shape, async (params) => {
    return await pgConfig(params);
  });

  // ── Sync Guidelines tool ──
  server.tool('sync_guidelines', 'Download guidelines from Firebase and write them as local files. Compares versions to only update changed guidelines.', syncGuidelinesSchema.shape, wrapWithUpdateNotice(async (params) => {
    return await syncGuidelines(params);
  }));

  // ── Usage Rules resource ──
  server.resource(
    'usage-rules',
    'mcp://planning-game/usage-rules',
    {
      name: 'Planning Game Usage Rules',
      description: 'Rules and guidelines for using Planning Game MCP correctly',
      mimeType: 'text/markdown'
    },
    async () => ({
      contents: [{
        uri: 'mcp://planning-game/usage-rules',
        mimeType: 'text/markdown',
        text: USAGE_RULES_CONTENT
      }]
    })
  );

  return server;
}
