import { describe, expect, test } from '@jest/globals';

import { isWorkflowAgent } from '../../src/regulator/is-workflow-agent.js';

describe('isWorkflowAgent', () => {
	test.each([['workflow-worker'], ['workflow-gate'], ['workflow-check']])('answers true for the declared agent type %s', (agentType) => {
		expect(isWorkflowAgent({ agentType })).toBe(true);
	});

	test.each([['workflow-reviewer'], ['workflow-serial-gate'], ['workflow-final-gate'], ['workflow-']])(
		'answers true for %s, so a role added later is governed with no edit of this file',
		(agentType) => {
			expect(isWorkflowAgent({ agentType })).toBe(true);
		}
	);

	test.each([['general-purpose'], ['workflow'], ['workflowish'], ['statito-workflow-worker'], ['Workflow-Worker'], ['']])(
		'answers false for the agent type %s, which is outside the workflow',
		(agentType) => {
			expect(isWorkflowAgent({ agentType })).toBe(false);
		}
	);

	test('answers false when the context states no agent type, so the main agent is not a workflow agent', () => {
		expect(isWorkflowAgent({})).toBe(false);
	});

	test('answers false and throws no error when the agent type is null', () => {
		expect(isWorkflowAgent({ agentType: null })).toBe(false);
	});
});
