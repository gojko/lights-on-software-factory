import { describe, test, expect } from '@jest/globals';
import { workflowAgentCatchAllRule } from '../../../src/regulator/rules/workflow-agent-catch-all.js';

describe('workflowAgentCatchAllRule', () => {
	test('denies, so a workflow agent meets a refusal and never a prompt', () => {
		expect(workflowAgentCatchAllRule.decision).toBe('deny');
	});

	test.each([['workflow-worker'], ['workflow-gate'], ['workflow-check'], ['workflow-reviewer']])(
		'applies to %s, because every role of the workflow prefix is governed',
		(agentType) => {
			expect(workflowAgentCatchAllRule.appliesTo({ agentType })).toBe(true);
		}
	);

	test.each([['general-purpose'], ['workflow'], ['workflowish'], [undefined]])('does not apply to %s, which keeps the prompt', (agentType) => {
		expect(workflowAgentCatchAllRule.appliesTo({ agentType })).toBe(false);
	});

	test.each([[['htop']], [['rain', 'ls']], [['make', 'test']], [['grep', 'foo', 'bar.txt']], [['./node_modules/.bin/tsc']]])(
		'matches %s, because a rule above it answers first where the command is allowed',
		(tokens) => {
			expect(workflowAgentCatchAllRule.matchSegment(tokens)).toBe(true);
		}
	);

	test.each([[['/usr/bin/grep', '-rn', 'foo', '.']], [['/bin/ls', '-la']], [['/usr/bin/htop']]])(
		'does not match %s, so the attempt that strips the system-bin prefix reaches the rules',
		(tokens) => {
			expect(workflowAgentCatchAllRule.matchSegment(tokens)).toBe(false);
		}
	);

	test('matches a path outside the system bin directories, which no second attempt rewrites', () => {
		expect(workflowAgentCatchAllRule.matchSegment(['/usr/local/bin/htop'])).toBe(true);
	});

	test('does not match an empty segment', () => {
		expect(workflowAgentCatchAllRule.matchSegment([])).toBe(false);
	});

	test('names the command it refused', () => {
		expect(workflowAgentCatchAllRule.reason('htop --sort-key PERCENT_CPU')).toMatch(/htop --sort-key PERCENT_CPU/);
	});

	test('tells the agent not to try another shape of the same command', () => {
		expect(workflowAgentCatchAllRule.reason('htop')).toMatch(/another shape of the same command/);
	});

	test('tells the agent to report blocked and to name the command', () => {
		expect(workflowAgentCatchAllRule.reason('htop')).toMatch(/blocked/);
		expect(workflowAgentCatchAllRule.reason('htop')).toMatch(/name the command/);
	});

	test('states no attempt count, because the agent already has one limit and two would disagree', () => {
		expect(workflowAgentCatchAllRule.reason('htop')).not.toMatch(/three attempts/);
	});
});
