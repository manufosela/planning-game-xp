/**
 * MCP tool for provisioning new users.
 * @module mcp/tools/provision-user
 */

import { z } from 'zod';
import * as db from '../services/firestore-service.js';

export const provisionUserSchema = z.object({
  email: z.string().describe('User email address'),
  name: z.string().describe('Full name'),
  role: z.enum(['superadmin', 'user']).optional().describe('User role (default: "user")'),
  projects: z.record(z.enum(['admin', 'developer', 'stakeholder', 'consultant'])).optional()
    .describe('Project assignments: { projectId: role }'),
});

/**
 * Provision a new user in Firestore /users/ collection.
 */
export async function provisionUser({ email, name, role, projects }) {
  const userId = await db.provisionUser({
    email: email.trim().toLowerCase(),
    name: name.trim(),
    role: role || 'user',
    projects: projects || {},
  });

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: `User "${name}" (${email}) provisioned successfully.`,
        userId,
        email: email.trim().toLowerCase(),
        name: name.trim(),
        role: role || 'user',
        projects: projects || {},
      }, null, 2),
    }],
  };
}
