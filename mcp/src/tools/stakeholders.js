/**
 * MCP tool definitions for listing stakeholders.
 *
 * In V2, stakeholders are team members with role 'stakeholder' or 'both'.
 *
 * @module mcp/tools/stakeholders
 */

import { z } from 'zod';
import * as db from '../services/firestore-service.js';

export const listStakeholdersSchema = z.object({
  projectId: z.string().optional().describe('Filter stakeholders by project ID'),
});

/**
 * List stakeholders.
 */
export async function listStakeholders({ projectId } = {}) {
  if (projectId) {
    const team = await db.getTeam(projectId, { role: 'stakeholder' });

    if (team.length === 0) {
      return { content: [{ type: 'text', text: JSON.stringify({ message: 'No stakeholders found.', stakeholders: [] }, null, 2) }] };
    }

    const stakeholders = team.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
    }));

    return { content: [{ type: 'text', text: JSON.stringify(stakeholders, null, 2) }] };
  }

  // Aggregate across all projects
  const projects = await db.getProjects();
  const stkMap = new Map();

  for (const project of projects) {
    const team = await db.getTeam(project.id, { role: 'stakeholder' });
    for (const member of team) {
      if (!stkMap.has(member.email)) {
        stkMap.set(member.email, {
          id: member.id,
          name: member.name,
          email: member.email,
          projects: [],
        });
      }
      stkMap.get(member.email).projects.push(project.id);
    }
  }

  const stakeholders = Array.from(stkMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  if (stakeholders.length === 0) {
    return { content: [{ type: 'text', text: JSON.stringify({ message: 'No stakeholders found.', stakeholders: [] }, null, 2) }] };
  }

  return { content: [{ type: 'text', text: JSON.stringify(stakeholders, null, 2) }] };
}
