import { describe, test, expect } from '@jest/globals';
import { workerMakeAnyGoalRule } from '../../../src/regulator/rules/worker-make-any-goal.js';

describe('workerMakeAnyGoalRule', () => {
	test('denies with a reason that names the bare commands a worker runs instead', () => {
		expect(workerMakeAnyGoalRule.decision).toBe('deny');
		expect(workerMakeAnyGoalRule.reason).toMatch(/jest <your own test file>/);
		expect(workerMakeAnyGoalRule.reason).toMatch(/eslint <your own files>/);
	});

	test('names the project root as the place to run them', () => {
		expect(workerMakeAnyGoalRule.reason).toMatch(/bare, from the project root\./);
	});

	test('sends the worker at its report where the task needs a build', () => {
		expect(workerMakeAnyGoalRule.reason).toMatch(/report it as a blocker/);
	});

	test('names no make goal in its reason, so it cannot send a worker at one', () => {
		expect(workerMakeAnyGoalRule.reason).not.toMatch(/make\s+[a-z]/);
	});

	test('applies to a worker', () => {
		expect(workerMakeAnyGoalRule.appliesTo({ agentType: 'workflow-worker' })).toBe(true);
	});

	test.each([['workflow-gate'], ['workflow-check'], ['general-purpose'], [undefined]])(
		'does not apply to %s, which keeps every goal of the build tool',
		(agentType) => {
			expect(workerMakeAnyGoalRule.appliesTo({ agentType })).toBe(false);
		}
	);

	test('matches the build tool with no goal, which reaches the default goal of this tree', () => {
		expect(workerMakeAnyGoalRule.matchSegment(['make'])).toBe(true);
	});

	test('matches the build tool with no goal but an assignment, which still reaches the default goal', () => {
		expect(workerMakeAnyGoalRule.matchSegment(['make', 'INCREMENTAL=1'])).toBe(true);
	});

	test('matches the build tool with no goal but a flag, which still reaches the default goal', () => {
		expect(workerMakeAnyGoalRule.matchSegment(['make', '-C', 'docs'])).toBe(true);
	});

	test.each([
		['make', 'clean'],
		['make', 'init'],
		['make', 'help'],
		['make', 'build-docs'],
		['make', 'serve'],
		['make', 'test'],
		['make', 'workflow-serial-gate'],
		['make', 'deploy-myenv'],
		['make', 'change-set'],
		['make', '-C', 'docs', 'build']
	])('matches %s %s, because every goal of this tree writes something shared', (...tokens) => {
		expect(workerMakeAnyGoalRule.matchSegment(tokens)).toBe(true);
	});

	test.each([
		['jest', 'tests/a-module/thing.test.js'],
		['eslint', 'src/a-module/thing.js'],
		['git', 'status'],
		['cat', 'makefile'],
		['grep', '-rn', 'make', '.'],
		[]
	])('does not match %s %s, which is not the build tool', (...tokens) => {
		expect(workerMakeAnyGoalRule.matchSegment(tokens)).toBe(false);
	});
});
