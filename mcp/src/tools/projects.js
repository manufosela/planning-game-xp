/**
 * MCP tool definitions for project operations.
 * @module mcp/tools/projects
 */

import { z } from 'zod';
import * as db from '../services/firestore-service.js';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const listProjectsSchema = z.object({});

export const getProjectSchema = z.object({
  projectId: z.string().describe('Project ID'),
});

export const createProjectSchema = z.object({
  projectId: z.string().describe('Project ID (used as document ID)'),
  name: z.string().describe('Display name of the project'),
  abbreviation: z.string().describe('Short abbreviation for card IDs (e.g., "PLN")'),
  description: z.string().optional().describe('Project description'),
  repoUrl: z.string().optional().describe('Repository URL'),
  scoringSystem: z.enum(['1-5', 'fibonacci']).optional().describe('Scoring system (default: "1-5")'),
  createdBy: z.string().optional().describe('User ID who creates the project'),
});

export const updateProjectSchema = z.object({
  projectId: z.string().describe('Project ID to update'),
  updates: z.record(z.unknown()).describe('Fields to update'),
});

export const discoverProjectSchema = z.object({
  repoUrl: z.string().describe('Repository URL (HTTPS, SSH, with/without .git)'),
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * List all projects.
 * @returns {Promise<{ content: Array<{ type: string; text: string }> }>}
 */
export async function listProjects() {
  const projects = await db.getProjects();

  if (projects.length === 0) {
    return { content: [{ type: 'text', text: JSON.stringify({ message: 'No projects found.', projects: [] }, null, 2) }] };
  }

  const result = projects.map((p) => ({
    id: p.id,
    name: p.name,
    abbreviation: p.abbreviation,
    scoringSystem: p.scoringSystem,
    developerCount: p.developerCount,
    stakeholderCount: p.stakeholderCount,
    createdAt: p.createdAt,
  }));

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

/**
 * Get a single project.
 * @param {{ projectId: string }} params
 */
export async function getProject({ projectId }) {
  const project = await db.getProject(projectId);

  if (!project) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: `Project "${projectId}" not found.` }, null, 2) }] };
  }

  // Also fetch team
  const team = await db.getTeam(projectId);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ ...project, team }, null, 2),
    }],
  };
}

/**
 * Create a new project.
 * @param {{ projectId: string; name: string; abbreviation: string; [key: string]: * }} params
 */
export async function createProject(params) {
  const { projectId, name, abbreviation, description, repoUrl, scoringSystem, createdBy } = params;

  // Check if project already exists
  const existing = await db.getProject(projectId);
  if (existing) {
    throw new Error(`Project "${projectId}" already exists.`);
  }

  await db.createProject(projectId, {
    name,
    abbreviation,
    description: description || '',
    repoUrl: repoUrl || '',
    scoringSystem: scoringSystem || '1-5',
    createdBy: createdBy || 'mcp-v2',
  });

  // Create default maintenance epic
  await db.createCard(projectId, {
    type: 'epic',
    title: '[MANTENIMIENTO]',
    description: 'Default epic for maintenance tasks.',
    status: 'Active',
    year: new Date().getFullYear(),
    createdBy: createdBy || 'mcp-v2',
    updatedBy: createdBy || 'mcp-v2',
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: 'Project created successfully',
        projectId,
        name,
        abbreviation,
      }, null, 2),
    }],
  };
}

/**
 * Update a project.
 * @param {{ projectId: string; updates: Record<string, *> }} params
 */
export async function updateProject({ projectId, updates }) {
  const existing = await db.getProject(projectId);
  if (!existing) {
    throw new Error(`Project "${projectId}" not found.`);
  }

  const protectedFields = ['createdAt', 'createdBy'];
  for (const field of protectedFields) {
    if (field in updates) {
      throw new Error(`Cannot update protected field: "${field}"`);
    }
  }

  await db.updateProject(projectId, updates);
  const updated = await db.getProject(projectId);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ message: 'Project updated successfully', project: updated }, null, 2),
    }],
  };
}

/**
 * Discover a project by repository URL.
 * @param {{ repoUrl: string }} params
 */
export async function discoverProject({ repoUrl }) {
  const project = await db.discoverProjectByRepo(repoUrl);

  if (!project) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ error: `No project found matching repository URL "${repoUrl}".` }, null, 2),
      }],
    };
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        projectId: project.id,
        name: project.name,
        abbreviation: project.abbreviation,
        repoUrl: project.repoUrl,
        message: `Project found: "${project.id}" matches repository URL "${repoUrl}".`,
      }, null, 2),
    }],
  };
}
