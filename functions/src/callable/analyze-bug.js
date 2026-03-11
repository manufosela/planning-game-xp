/**
 * Callable function to analyze a bug report.
 * Returns probable root cause, suggested fix, and severity assessment.
 * Uses placeholder data if no API key is configured.
 *
 * Input: { title: string, description: string, context?: string }
 * Output: { rootCause: string, suggestedFix: string, severity: string }
 *
 * @module functions/callable/analyze-bug
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';

/**
 * Build the prompt for bug analysis.
 * @param {string} title
 * @param {string} description
 * @param {string} [context]
 * @returns {string}
 */
export function buildBugAnalysisPrompt(title, description, context) {
  return `Analyze this bug report:

Title: ${title}
Description: ${description}
${context ? `Related code context:\n${context}` : ''}

Provide your analysis as a JSON object with exactly these fields:
- "rootCause": A concise explanation of the probable root cause
- "suggestedFix": A brief description of the recommended fix approach
- "severity": One of "critical", "high", "medium", "low"

Return ONLY the JSON object, no markdown or explanation.`;
}

/**
 * Generate placeholder analysis when no API key is configured.
 * @param {string} title
 * @returns {{ rootCause: string, suggestedFix: string, severity: string }}
 */
export function generatePlaceholderAnalysis(title) {
  return {
    rootCause: `Analysis pending for: ${title}. Manual investigation required to determine root cause.`,
    suggestedFix: 'Review the affected code path, add logging to trace the issue, and write a regression test before applying the fix.',
    severity: 'medium',
  };
}

export const analyzeBug = onCall(
  { cors: true, maxInstances: 10 },
  async (request) => {
    const { title, description, context } = request.data;

    if (!title) {
      throw new HttpsError('invalid-argument', 'Title is required.');
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return generatePlaceholderAnalysis(title);
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
            content: buildBugAnalysisPrompt(title, description ?? '', context),
          }],
        }),
      });

      if (!response.ok) {
        throw new HttpsError('internal', `API request failed: ${response.status}`);
      }

      const data = await response.json();
      const text = data.content?.[0]?.text ?? '{}';
      return JSON.parse(text);
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error('analyzeBug error:', err);
      return generatePlaceholderAnalysis(title);
    }
  }
);
