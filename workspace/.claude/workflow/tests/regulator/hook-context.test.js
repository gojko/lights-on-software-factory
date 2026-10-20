import { describe, test, expect } from '@jest/globals';

import { hookContext } from '../../src/regulator/hook-context.js';

describe('hookContext', () => {
	test('carries the agent type of the event', () => {
		expect(hookContext({ agent_type: 'workflow-worker' }).agentType).toBe('workflow-worker');
	});

	test('carries no agent type when the event states none', () => {
		expect(hookContext({}).agentType).toBeUndefined();
	});

	test('carries the agent type whatever it names, so a role added later needs no edit here', () => {
		expect(hookContext({ agent_type: 'general-purpose' }).agentType).toBe('general-purpose');
	});

	test('answers a context holding the agent type and nothing else', () => {
		expect(hookContext({ agent_type: 'workflow-gate', agent_id: 'aaa', transcript_path: '/tmp/t.jsonl' })).toEqual({
			agentType: 'workflow-gate'
		});
	});
});
