/**
 * MCP tool definitions for listing developers.
 *
 * In V2, developers are team members with role 'developer' or 'both'.
 *
 * @module mcp/tools/developers
 */

import { z } from 'zod';
import * as db from '../services/firestore-service.js';

export const listDevelopersSchema = z.object({
  projectId: z.string().optional().describe('Filter developers by project ID'),
});

/**
 * List developers. If projectId is given, list team members with developer role.
 * Otherwise, aggregate across all projects.
 */
export async function listDevelopers({ projectId } = {}) {
  if (projectId) {
    const team = await db.getTeam(projectId, { role: 'developer' });

    if (team.length === 0) {
      return { content: [{ type: 'text', text: JSON.stringify({ message: 'No developers found.', developers: [] }, null, 2) }] };
    }

    const developers = team.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
    }));

    return { content: [{ type: 'text', text: JSON.stringify(developers, null, 2) }] };
  }

  // Aggregate across all projects
  const projects = await db.getProjects();
  const devMap = new Map();

  for (const project of projects) {
    const team = await db.getTeam(project.id, { role: 'developer' });
    for (const member of team) {
      if (!devMap.has(member.email)) {
        devMap.set(member.email, {
          id: member.id,
          name: member.name,
          email: member.email,
          projects: [],
        });
      }
      devMap.get(member.email).projects.push(project.id);
    }
  }

  const developers = Array.from(devMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  if (developers.length === 0) {
    return { content: [{ type: 'text', text: JSON.stringify({ message: 'No developers found.', developers: [] }, null, 2) }] };
  }

  return { content: [{ type: 'text', text: JSON.stringify(developers, null, 2) }] };
}
