import { describe, test, expect } from '@jest/globals';
import { checkGoalBoundaryRule } from '../../../src/regulator/rules/check-goal-boundary.js';

describe('checkGoalBoundaryRule', () => {
	test('denies with a reason that says a check agent reads a finished run', () => {
		expect(checkGoalBoundaryRule.decision).toBe('deny');
		expect(checkGoalBoundaryRule.reason).toMatch(/report/);
	});

	test('names no make goal in its reason, so it cannot send a check agent at one', () => {
		expect(checkGoalBoundaryRule.reason).not.toMatch(/make\s+[a-z]/);
	});

	test('names no deploy in its reason, because the project has no deploy idea', () => {
		expect(checkGoalBoundaryRule.reason).not.toMatch(/deploy/);
	});

	test('applies to a check agent', () => {
		expect(checkGoalBoundaryRule.appliesTo({ agentType: 'workflow-check' })).toBe(true);
	});

	test.each([['workflow-worker'], ['workflow-gate'], ['general-purpose'], [undefined]])(
		'does not apply to %s, which answers by the rule of its own role',
		(agentType) => {
			expect(checkGoalBoundaryRule.appliesTo({ agentType })).toBe(false);
		}
	);

	test('matches the build tool with no goal, which reaches the default goal of this tree', () => {
		expect(checkGoalBoundaryRule.matchSegment(['make'])).toBe(true);
	});

	test.each([
		['make', 'test'],
		['make', 'clean'],
		['make', 'init'],
		['make', 'workflow-serial-gate'],
		['make', 'workflow-final-gate'],
		['make', 'deploy-myenv'],
		['make', 'INCREMENTAL=1'],
		['make', '-C', 'docs', 'build']
	])('matches %s %s, because a check agent runs no goal at all', (...tokens) => {
		expect(checkGoalBoundaryRule.matchSegment(tokens)).toBe(true);
	});

	test.each([
		['jest', 'tests/a-module/thing.test.js'],
		['eslint', 'src/a-module/thing.js'],
		['git', 'status'],
		['cat', 'makefile'],
		['grep', '-rn', 'make', '.'],
		[]
	])('does not match %s %s, which is not the build tool', (...tokens) => {
		expect(checkGoalBoundaryRule.matchSegment(tokens)).toBe(false);
	});
});
