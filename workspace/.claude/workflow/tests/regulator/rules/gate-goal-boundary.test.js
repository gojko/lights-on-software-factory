import { describe, test, expect } from '@jest/globals';
import { gateGoalBoundaryRule } from '../../../src/regulator/rules/gate-goal-boundary.js';

describe('gateGoalBoundaryRule', () => {
	test('denies', () => {
		expect(gateGoalBoundaryRule.decision).toBe('deny');
	});

	test('applies to a gate', () => {
		expect(gateGoalBoundaryRule.appliesTo({ agentType: 'workflow-gate' })).toBe(true);
	});

	test.each([['workflow-worker'], ['workflow-check'], ['general-purpose']])('does not apply to %s', (agentType) => {
		expect(gateGoalBoundaryRule.appliesTo({ agentType })).toBe(false);
	});

	test('does not apply to a caller that states no agent type', () => {
		expect(gateGoalBoundaryRule.appliesTo({})).toBe(false);
	});

	describe('a goal with the workflow- prefix', () => {
		test.each([
			[['make', 'workflow-serial-gate']],
			[['make', 'workflow-final-gate', 'TARGET=myenv']],
			[['make', 'TARGET=myenv', 'workflow-final-gate']],
			[['make', '-j2', 'workflow-serial-gate']],
			[['make', 'workflow-a-goal-the-tree-does-not-hold-yet']],
			[['make', 'workflow-serial-gate', 'workflow-final-gate']]
		])('does not match %s', (tokens) => {
			expect(gateGoalBoundaryRule.matchSegment(tokens)).toBe(false);
		});
	});

	describe('a goal outside the workflow- prefix', () => {
		test.each([
			[['make', 'test']],
			[['make', 'lint']],
			[['make', 'typecheck']],
			[['make', 'jest']],
			[['make', 'clean']],
			[['make', 'init']],
			[['make', 'deploy-myenv']],
			[['make', 'deploy-all-myenv']],
			[['make', 'smoke-test']],
			[['make', 'browser-test']],
			[['make', 'build-docs']],
			[['make', 'check-workflow-environment']],
			[['make', '-C', 'docs', 'build']],
			[['make', 'workflow-serial-gate', 'test']]
		])('matches %s', (tokens) => {
			expect(gateGoalBoundaryRule.matchSegment(tokens)).toBe(true);
		});
	});

	test('matches the build tool with no goal, which reaches the default goal', () => {
		expect(gateGoalBoundaryRule.matchSegment(['make'])).toBe(true);
	});

	test.each([[['git', 'status']], [['jest', 'a/test.js']], [['eslint', 'a/file.js']], [['node', '/tmp/a.js']]])(
		'does not match %s, which is not the build tool',
		(tokens) => {
			expect(gateGoalBoundaryRule.matchSegment(tokens)).toBe(false);
		}
	);

	describe('the refusal message', () => {
		test('names the goal it refused', () => {
			expect(gateGoalBoundaryRule.reason('make smoke-test')).toContain('smoke-test');
		});

		test('names every refused goal of a command that states more than one', () => {
			expect(gateGoalBoundaryRule.reason('make lint test')).toMatch(/lint.*test/);
		});

		test('names no goal that carries the workflow- prefix', () => {
			expect(gateGoalBoundaryRule.reason('make workflow-serial-gate test')).not.toContain('workflow-serial-gate');
		});

		test('names the default goal when the command states no goal', () => {
			expect(gateGoalBoundaryRule.reason('make')).toContain('the default goal');
		});

		test('names the goal of a command that holds the build tool after another command', () => {
			expect(gateGoalBoundaryRule.reason('cd /a/b && make clean')).toContain('clean');
		});

		test('states that a gate reaches a workflow- goal alone', () => {
			expect(gateGoalBoundaryRule.reason('make test')).toMatch(/a gate reaches a `workflow-` goal alone/);
		});

		test('states that a variable argument does not change the answer', () => {
			expect(gateGoalBoundaryRule.reason('make deploy TARGET=myenv')).toMatch(/A `NAME=value` argument does not change the answer/);
		});

		test('names the narrow verification a gate may run instead', () => {
			expect(gateGoalBoundaryRule.reason('make jest')).toMatch(/`jest <file>`/);
		});

		test('opens with an imperative verb', () => {
			expect(gateGoalBoundaryRule.reason('make test')).toMatch(/^(Run|Read|Only|Do not) /);
		});

		test('says what to run in 300 characters or fewer', () => {
			expect(gateGoalBoundaryRule.reason('make test').length).toBeLessThanOrEqual(300);
		});
	});
});
