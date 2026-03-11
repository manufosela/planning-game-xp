/**
 * MCP tool for deleting users.
 * @module mcp/tools/delete-user
 */

import { z } from 'zod';
import * as db from '../services/firestore-service.js';

export const deleteUserSchema = z.object({
  userId: z.string().describe('User document ID to delete'),
});

/**
 * Delete a user from Firestore /users/ collection.
 */
export async function deleteUser({ userId }) {
  await db.deleteUser(userId);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        message: `User "${userId}" deleted from Firestore. Note: Firebase Auth account is NOT deleted.`,
        userId,
      }, null, 2),
    }],
  };
}
