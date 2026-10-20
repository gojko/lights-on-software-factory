import { describe, test, expect } from '@jest/globals';
import { workerMakeVerificationRule } from '../../../src/regulator/rules/worker-make-verification.js';

describe('workerMakeVerificationRule', () => {
	test('denies with a reason that names the bare commands a worker runs instead', () => {
		expect(workerMakeVerificationRule.decision).toBe('deny');
		expect(workerMakeVerificationRule.reason).toMatch(/jest <your own test file>/);
		expect(workerMakeVerificationRule.reason).toMatch(/eslint <your own files>/);
	});

	test('names the project root as the place to run them', () => {
		expect(workerMakeVerificationRule.reason).toMatch(/bare, from the project root\./);
	});

	test('names the agent that proves the merged tree, and says it is not the worker', () => {
		expect(workerMakeVerificationRule.reason).toMatch(/gate agent/);
		expect(workerMakeVerificationRule.reason).toMatch(/not you/);
	});

	test('applies to a worker', () => {
		expect(workerMakeVerificationRule.appliesTo({ agentType: 'workflow-worker' })).toBe(true);
	});

	test.each([['workflow-gate'], ['workflow-check'], ['general-purpose'], [undefined]])(
		'does not apply to %s, which keeps every verification goal',
		(agentType) => {
			expect(workerMakeVerificationRule.appliesTo({ agentType })).toBe(false);
		}
	);

	test.each([
		['make', 'test'],
		['make', 'jest'],
		['make', 'lint'],
		['make', 'typecheck'],
		['make', 'smoke-test'],
		['make', 'browser-test'],
		['make', 'deploy-test-stacks'],
		['make', 'lint-rules-test'],
		['make', '-C', 'infra', 'lint-templates'],
		['make', 'test', 'INCREMENTAL=1']
	])('matches %s %s', (...tokens) => {
		expect(workerMakeVerificationRule.matchSegment(tokens)).toBe(true);
	});

	test.each([
		['make', 'clean'],
		['make', 'init'],
		['make', 'help'],
		['make', 'build-docs'],
		['make', 'deploy-all-myenv'],
		['make', 'workflow-serial-gate'],
		['make'],
		['jest', 'tests/a-module/thing.test.js'],
		['eslint', 'src/a-module/thing.js']
	])('does not match %s %s', (...tokens) => {
		expect(workerMakeVerificationRule.matchSegment(tokens)).toBe(false);
	});
});
