/**
 * PMC-TSK-0073 — the texts the MCP hands to AI agents must explain what a
 * proposal IS and its two outcomes (task or plan). Before this, they only
 * said "Proposal: REQUIRED title", which is why agents created plan-sized
 * proposals with no idea how to approve them.
 */
import { describe, it, expect } from 'vitest';
import { generateAiInstructions } from '../ai-instructions.js';
import { USAGE_RULES_CONTENT } from '../usage-rules.js';
import { createCardSchema, listCardsSchema } from '../tools/cards.js';

/**
 * Slice a markdown section by heading, up to the next heading of the same level.
 * @param {string} text - Full document
 * @param {string} heading - Heading line to look for
 * @returns {string} Section body ('' when the heading is absent)
 */
function sectionOf(text, heading) {
  const start = text.indexOf(heading);
  if (start === -1) return '';
  const level = heading.match(/^#+|^\*\*/)?.[0] ?? '###';
  const rest = text.slice(start + heading.length);
  const next = rest.indexOf(`\n${level}`);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('Proposal concept in the AI instructions (PMC-TSK-0073)', () => {
  const instructions = generateAiInstructions();
  const proposalSection = sectionOf(instructions, '### Proposal (type="proposal")');

  it('should describe a proposal as an idea pending approval', () => {
    expect(proposalSection).toMatch(/pending approval/i);
  });

  it('should spell out both outcomes: task and plan', () => {
    expect(proposalSection).toMatch(/task/i);
    expect(proposalSection).toMatch(/plan/i);
  });

  it('should name the tool that links a proposal to a plan', () => {
    expect(proposalSection).toMatch(/create_plan.*proposalCardId/s);
  });

  it('should name the fields that mark an approved proposal', () => {
    expect(proposalSection).toMatch(/convertedToPlan/);
    expect(proposalSection).toMatch(/convertedToTask/);
  });

  it('should recommend a description so the plan generator has context', () => {
    expect(proposalSection).toMatch(/description/i);
  });
});

describe('Proposal concept in the usage rules (PMC-TSK-0073)', () => {
  const proposalSection = sectionOf(USAGE_RULES_CONTENT, '**Proposal** (create_card type=proposal):');

  it('should go beyond "title is required"', () => {
    expect(proposalSection).toMatch(/description/i);
    expect(proposalSection).toMatch(/create_plan/);
  });

  it('should explain when to approve as a plan instead of a task', () => {
    expect(proposalSection).toMatch(/plan/i);
    expect(proposalSection).toMatch(/task/i);
  });
});

describe('Proposal guidance in the tool schemas (PMC-TSK-0073)', () => {
  it('should explain the proposal type in create_card', () => {
    const description = createCardSchema.shape.type.description;
    expect(description).toMatch(/proposal/i);
    expect(description).toMatch(/create_plan/);
  });

  it('should tell list_cards users how to spot proposals still pending', () => {
    const description = listCardsSchema.shape.type.description;
    expect(description).toMatch(/convertedToPlan|convertedToTask/);
  });
});
