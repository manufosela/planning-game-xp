/**
 * MCP tool for configuring user identity.
 * @module mcp/tools/setup-user
 */

import { z } from 'zod';
import * as db from '../services/firestore-service.js';
import { isMcpUserConfigured, writeMcpUser, getMcpUser } from '../user.js';

export const setupMcpUserSchema = z.object({
  memberId: z.string().optional().describe('Team member ID to identify as'),
  name: z.string().optional().describe('Name to search for (partial match)'),
  email: z.string().optional().describe('Email to search for'),
  projectId: z.string().optional().describe('Project to search team in'),
});

/**
 * Configure the MCP user identity.
 */
export async function setupMcpUser({ memberId, name, email, projectId } = {}) {
  // If a projectId is given, search within that project's team
  if (projectId) {
    const team = await db.getTeam(projectId);

    if (!memberId && (name || email)) {
      let matches = [];
      if (email) {
        matches = team.filter((m) => m.email.toLowerCase() === email.toLowerCase());
      } else if (name) {
        const nameLower = name.toLowerCase();
        matches = team.filter((m) => m.name.toLowerCase() === nameLower);
        if (matches.length === 0) {
          matches = team.filter((m) => m.name.toLowerCase().includes(nameLower));
        }
      }

      if (matches.length === 1) {
        memberId = matches[0].id;
      } else if (matches.length > 1) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              message: `Multiple team members match "${name || email}". Ask the user which one.`,
              matches: matches.map((m) => ({ id: m.id, name: m.name, email: m.email })),
            }, null, 2),
          }],
        };
      } else {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              message: `No team member found matching "${name || email}".`,
              team: team.map((m) => ({ id: m.id, name: m.name, email: m.email })),
            }, null, 2),
          }],
        };
      }
    }

    if (memberId) {
      const member = team.find((m) => m.id === memberId);
      if (!member) {
        throw new Error(`Team member "${memberId}" not found in project "${projectId}".`);
      }

      const userData = { developerId: member.id, name: member.name, email: member.email };
      writeMcpUser(userData);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: `MCP user configured as "${member.name}" (${member.id}).`,
            user: userData,
          }, null, 2),
        }],
      };
    }

    // No params - list team for user to pick
    const currentUser = getMcpUser();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          message: currentUser
            ? `MCP user is currently "${currentUser.name}" (${currentUser.developerId}). Provide name/email to reconfigure.`
            : 'MCP user is not configured. Provide name or email to auto-match.',
          currentUser: currentUser || null,
          team: team.map((m) => ({ id: m.id, name: m.name, email: m.email, role: m.role })),
        }, null, 2),
      }],
    };
  }

  // No projectId - search across all projects
  if (!memberId && !name && !email) {
    const currentUser = getMcpUser();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          message: currentUser
            ? `MCP user is currently "${currentUser.name}" (${currentUser.developerId}). Provide projectId + name/email to reconfigure.`
            : 'MCP user is not configured. Provide projectId and name/email to set up.',
          currentUser: currentUser || null,
        }, null, 2),
      }],
    };
  }

  // Search across all projects for matching member
  const projects = await db.getProjects();
  const allMembers = [];

  for (const project of projects) {
    const team = await db.getTeam(project.id);
    for (const member of team) {
      const exists = allMembers.some((m) => m.email === member.email);
      if (!exists) {
        allMembers.push(member);
      }
    }
  }

  let matches = [];
  if (email) {
    matches = allMembers.filter((m) => m.email.toLowerCase() === email.toLowerCase());
  } else if (name) {
    const nameLower = name.toLowerCase();
    matches = allMembers.filter((m) => m.name.toLowerCase().includes(nameLower));
  }

  if (matches.length === 1) {
    const member = matches[0];
    const userData = { developerId: member.id, name: member.name, email: member.email };
    writeMcpUser(userData);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          message: `MCP user configured as "${member.name}" (${member.id}).`,
          user: userData,
        }, null, 2),
      }],
    };
  }

  if (matches.length > 1) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          message: `Multiple members match. Ask the user which one.`,
          matches: matches.map((m) => ({ id: m.id, name: m.name, email: m.email })),
        }, null, 2),
      }],
    };
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: `No member found matching "${name || email}".`,
      }, null, 2),
    }],
  };
}
