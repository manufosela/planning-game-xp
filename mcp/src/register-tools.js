/**
 * Register all MCP tools on a McpServer instance.
 *
 * Imports every tool module, wires schemas + handlers, and adds
 * metadata injection (instance info, user warnings).
 *
 * @module mcp/register-tools
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// Tool imports
import { listProjectsSchema, listProjects, getProjectSchema, getProject, createProjectSchema, createProject, updateProjectSchema, updateProject, discoverProjectSchema, discoverProject } from './tools/projects.js';
import { listCardsSchema, listCards, getCardSchema, getCard, createCardSchema, createCard, updateCardSchema, updateCard, relateCardsSchema, relateCards, getTransitionRulesSchema, getTransitionRules } from './tools/cards.js';
import { listSprintsSchema, listSprints, getSprintSchema, getSprint, createSprintSchema, createSprint, updateSprintSchema, updateSprint } from './tools/sprints.js';
import { listDevelopersSchema, listDevelopers } from './tools/developers.js';
import { listStakeholdersSchema, listStakeholders } from './tools/stakeholders.js';
import { listAdrsSchema, listAdrs, getAdrSchema, getAdr, createAdrSchema, createAdr, updateAdrSchema, updateAdr, deleteAdrSchema, deleteAdr } from './tools/adrs.js';
import { listPlansSchema, listPlans, getPlanSchema, getPlan, createPlanSchema, createPlan, updatePlanSchema, updatePlan, deletePlanSchema, deletePlan } from './tools/plans.js';
import { listPlanProposalsSchema, listPlanProposals, getPlanProposalSchema, getPlanProposal, createPlanProposalSchema, createPlanProposal, updatePlanProposalSchema, updatePlanProposal, deletePlanProposalSchema, deletePlanProposal } from './tools/plan-proposals.js';
import { listGlobalConfigSchema, listGlobalConfig, getGlobalConfigSchema, getGlobalConfig, createGlobalConfigSchema, createGlobalConfig, updateGlobalConfigSchema, updateGlobalConfig, deleteGlobalConfigSchema, deleteGlobalConfig } from './tools/global-config.js';
import { setupMcpUserSchema, setupMcpUser } from './tools/setup-user.js';
import { provisionUserSchema, provisionUser } from './tools/provision-user.js';
import { deleteUserSchema, deleteUser } from './tools/delete-user.js';
import { pgConfigSchema, pgConfig, pgDoctorSchema, pgDoctor, getMcpStatusSchema, getMcpStatus, updateMcpSchema, updateMcp } from './tools/config.js';
import { syncGuidelinesSchema, syncGuidelines } from './tools/sync-guidelines.js';

import { isMcpUserConfigured } from './user.js';
import { getFirebaseProjectId } from './firebase-adapter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse JSON text safely.
 * @param {string} text
 * @returns {Record<string, *> | null}
 */
function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * Wrap a handler to inject metadata into responses.
 * @param {Function} handler
 * @returns {Function}
 */
function wrapHandler(handler) {
  return async (params) => {
    const result = await handler(params);

    if (result.content && result.content.length > 0) {
      const parsed = safeJsonParse(result.content[0].text);
      if (parsed) {
        // Inject instance metadata
        parsed._instance = {
          firebaseProjectId: getFirebaseProjectId(),
          backend: 'Firestore',
          version: '2.0.0',
        };

        // Warn if user not configured
        if (!isMcpUserConfigured()) {
          if (!parsed.warnings) parsed.warnings = [];
          parsed.warnings.push({
            code: 'USER_NOT_CONFIGURED',
            message: 'MCP user is not configured. Run setup_mcp_user to configure your identity.',
          });
        }

        result.content[0] = { type: 'text', text: JSON.stringify(parsed, null, 2) };
      }
    }

    return result;
  };
}

// ---------------------------------------------------------------------------
// Server creation
// ---------------------------------------------------------------------------

/**
 * Create and configure a McpServer with all tools registered.
 * @param {string} serverName
 * @returns {McpServer}
 */
export function createMcpServer(serverName) {
  const server = new McpServer({
    name: serverName || 'planning-game-v2',
    version: '2.0.0',
  });

  // ── Project tools ──
  server.tool('list_projects', 'List all projects', listProjectsSchema.shape, wrapHandler(listProjects));
  server.tool('get_project', 'Get full project details including team', getProjectSchema.shape, wrapHandler(getProject));
  server.tool('create_project', 'Create a new project', createProjectSchema.shape, wrapHandler(createProject));
  server.tool('update_project', 'Update project fields', updateProjectSchema.shape, wrapHandler(updateProject));
  server.tool('discover_project', 'Find project by repository URL', discoverProjectSchema.shape, wrapHandler(discoverProject));

  // ── Card tools ──
  server.tool('list_cards', 'List cards with filters (type, status, year, sprint, epic, developer)', listCardsSchema.shape, wrapHandler(listCards));
  server.tool('get_card', 'Get full card details by cardId', getCardSchema.shape, wrapHandler(getCard));
  server.tool('create_card', 'Create a new card with auto-generated ID', createCardSchema.shape, wrapHandler(createCard));
  server.tool('update_card', 'Update card fields with transition validation', updateCardSchema.shape, wrapHandler(updateCard));
  server.tool('relate_cards', 'Create/remove relations between cards', relateCardsSchema.shape, wrapHandler(relateCards));
  server.tool('get_transition_rules', 'Get status transition rules for cards', getTransitionRulesSchema.shape, wrapHandler(getTransitionRules));

  // ── Sprint tools ──
  server.tool('list_sprints', 'List sprints with optional year filter', listSprintsSchema.shape, wrapHandler(listSprints));
  server.tool('get_sprint', 'Get sprint details by cardId', getSprintSchema.shape, wrapHandler(getSprint));
  server.tool('create_sprint', 'Create a new sprint', createSprintSchema.shape, wrapHandler(createSprint));
  server.tool('update_sprint', 'Update sprint fields', updateSprintSchema.shape, wrapHandler(updateSprint));

  // ── Team tools ──
  server.tool('list_developers', 'List developers', listDevelopersSchema.shape, wrapHandler(listDevelopers));
  server.tool('list_stakeholders', 'List stakeholders', listStakeholdersSchema.shape, wrapHandler(listStakeholders));

  // ── ADR tools ──
  server.tool('list_adrs', 'List ADRs for a project', listAdrsSchema.shape, wrapHandler(listAdrs));
  server.tool('get_adr', 'Get ADR details', getAdrSchema.shape, wrapHandler(getAdr));
  server.tool('create_adr', 'Create a new ADR', createAdrSchema.shape, wrapHandler(createAdr));
  server.tool('update_adr', 'Update an ADR', updateAdrSchema.shape, wrapHandler(updateAdr));
  server.tool('delete_adr', 'Delete an ADR', deleteAdrSchema.shape, wrapHandler(deleteAdr));

  // ── Plan tools ──
  server.tool('list_plans', 'List development plans', listPlansSchema.shape, wrapHandler(listPlans));
  server.tool('get_plan', 'Get plan details', getPlanSchema.shape, wrapHandler(getPlan));
  server.tool('create_plan', 'Create a development plan', createPlanSchema.shape, wrapHandler(createPlan));
  server.tool('update_plan', 'Update a development plan', updatePlanSchema.shape, wrapHandler(updatePlan));
  server.tool('delete_plan', 'Delete a development plan', deletePlanSchema.shape, wrapHandler(deletePlan));

  // ── Plan Proposal tools ──
  server.tool('list_plan_proposals', 'List plan proposals', listPlanProposalsSchema.shape, wrapHandler(listPlanProposals));
  server.tool('get_plan_proposal', 'Get plan proposal details', getPlanProposalSchema.shape, wrapHandler(getPlanProposal));
  server.tool('create_plan_proposal', 'Create a plan proposal', createPlanProposalSchema.shape, wrapHandler(createPlanProposal));
  server.tool('update_plan_proposal', 'Update a plan proposal', updatePlanProposalSchema.shape, wrapHandler(updatePlanProposal));
  server.tool('delete_plan_proposal', 'Delete a plan proposal', deletePlanProposalSchema.shape, wrapHandler(deletePlanProposal));

  // ── Global Config tools ──
  server.tool('list_global_config', 'List global configs by type', listGlobalConfigSchema.shape, wrapHandler(listGlobalConfig));
  server.tool('get_global_config', 'Get global config details', getGlobalConfigSchema.shape, wrapHandler(getGlobalConfig));
  server.tool('create_global_config', 'Create a global config', createGlobalConfigSchema.shape, wrapHandler(createGlobalConfig));
  server.tool('update_global_config', 'Update a global config', updateGlobalConfigSchema.shape, wrapHandler(updateGlobalConfig));
  server.tool('delete_global_config', 'Delete a global config', deleteGlobalConfigSchema.shape, wrapHandler(deleteGlobalConfig));

  // ── User tools ──
  server.tool('setup_mcp_user', 'Configure MCP user identity', setupMcpUserSchema.shape, wrapHandler(setupMcpUser));
  server.tool('provision_user', 'Provision a new user', provisionUserSchema.shape, wrapHandler(provisionUser));
  server.tool('delete_user', 'Delete a user', deleteUserSchema.shape, wrapHandler(deleteUser));

  // ── Config & Diagnostics tools ──
  server.tool('pg_config', 'View MCP configuration', pgConfigSchema.shape, pgConfig);
  server.tool('pg_doctor', 'Run diagnostics', pgDoctorSchema.shape, pgDoctor);
  server.tool('get_mcp_status', 'Get MCP server status', getMcpStatusSchema.shape, getMcpStatus);
  server.tool('update_mcp', 'Update MCP server (git pull)', updateMcpSchema.shape, updateMcp);

  // ── Sync Guidelines tool ──
  server.tool('sync_guidelines', 'Sync guidelines from Firestore to local files', syncGuidelinesSchema.shape, wrapHandler(syncGuidelines));

  return server;
}
