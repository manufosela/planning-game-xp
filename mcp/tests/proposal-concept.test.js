/**
 * The MCP hands these texts to every AI agent, so they must make the TWO
 * kinds of proposal unmistakable (PLN-TSK-0359): a TASK proposal is a
 * Como/Quiero/Para user story for one unit of work, typically from someone
 * outside the team; a PLAN proposal is free text, typically written by an AI,
 * whose outcome is a development plan. One form cannot hold both.
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

describe('The two proposal kinds in the AI instructions (PLN-TSK-0359)', () => {
  const instructions = generateAiInstructions();
  const taskProposal = sectionOf(instructions, '### Proposal (type="proposal") — TASK proposal');
  const planProposal = sectionOf(instructions, '### Plan proposal — a DIFFERENT thing (create_plan_proposal)');

  it('should describe the TASK proposal as a user story for one unit of work', () => {
    expect(taskProposal).toMatch(/user story/i);
    expect(taskProposal).toMatch(/Como \/ Quiero \/ Para/);
    expect(taskProposal).toMatch(/outside\s+the team/i);
  });

  it('should describe the PLAN proposal as free text that becomes a plan', () => {
    expect(planProposal).toMatch(/free text|prose/i);
    expect(planProposal).toMatch(/create_plan_proposal|DEVELOPMENT PLAN/i);
  });

  it('should state they are different things, not one entity', () => {
    expect(instructions).toMatch(/Plan proposal — a DIFFERENT thing/);
    // And the reader is told how to pick between them.
    expect(instructions).toMatch(/Pick by shape/i);
  });

  it('should keep the plan outcome available for a task proposal', () => {
    expect(taskProposal).toMatch(/create_plan.*proposalCardId/s);
    expect(taskProposal).toMatch(/convertedToPlan/);
  });
});

describe('The two proposal kinds in the usage rules (PLN-TSK-0359)', () => {
  const taskProposal = sectionOf(USAGE_RULES_CONTENT, '**Proposal** (create_card type=proposal) — TASK proposal:');
  const planProposal = sectionOf(USAGE_RULES_CONTENT, '**Plan proposal** (create_plan_proposal) — a DIFFERENT entity:');

  it('should give each kind its own shape', () => {
    expect(taskProposal).toMatch(/Como \/ Quiero \/ Para/);
    expect(planProposal).toMatch(/FREE TEXT/i);
  });

  it('should warn against forcing free text into the user story form', () => {
    expect(planProposal).toMatch(/not a user story|Do NOT force/i);
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
