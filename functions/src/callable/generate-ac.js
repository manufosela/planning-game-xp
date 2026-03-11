/**
 * Callable function to generate acceptance criteria from a user story.
 * Uses Anthropic Claude API if available, otherwise returns placeholder data.
 *
 * Input: { title: string, description: string }
 * Output: { criteria: Array<{ given: string, when: string, then: string }> }
 *
 * @module functions/callable/generate-ac
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';

/**
 * Build the prompt for generating acceptance criteria.
 * @param {string} title
 * @param {string} description
 * @returns {string}
 */
export function buildACPrompt(title, description) {
  return `Given this user story:

Title: ${title}
Description: ${description}

Generate 3-5 acceptance criteria in Gherkin format (Given/When/Then).
Each criterion should be specific, testable, and cover a different aspect of the story.

Return ONLY a JSON array where each element has: {"given": "...", "when": "...", "then": "..."}
No markdown, no explanation, just the JSON array.`;
}

/**
 * Generate placeholder acceptance criteria when no API key is configured.
 * @param {string} title
 * @returns {Array<{given: string, when: string, then: string}>}
 */
export function generatePlaceholderAC(title) {
  return [
    {
      given: `the user is on the ${title} feature`,
      when: 'they perform the main action',
      then: 'the expected result is achieved',
    },
    {
      given: 'the system is in a valid state',
      when: `the ${title} operation completes`,
      then: 'the data is saved correctly',
    },
    {
      given: 'an error occurs during the operation',
      when: 'the system encounters the error',
      then: 'an appropriate error message is displayed',
    },
  ];
}

export const generateAC = onCall(
  { cors: true, maxInstances: 10 },
  async (request) => {
    const { title, description } = request.data;

    if (!title) {
      throw new HttpsError('invalid-argument', 'Title is required.');
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      // Return placeholder data when no API key is configured
      return { criteria: generatePlaceholderAC(title) };
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: buildACPrompt(title, description ?? ''),
          }],
        }),
      });

      if (!response.ok) {
        throw new HttpsError('internal', `API request failed: ${response.status}`);
      }

      const data = await response.json();
      const text = data.content?.[0]?.text ?? '[]';
      const criteria = JSON.parse(text);

      return { criteria };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('generateAC error:', err);
      // Fallback to placeholder on any error
      return { criteria: generatePlaceholderAC(title) };
    }
  }
);
