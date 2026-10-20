import { describe, test, expect } from '@jest/globals';
import { workerMakeGateRule } from '../../../src/regulator/rules/worker-make-gate.js';

describe('workerMakeGateRule', () => {
	test('denies with a reason that names the bare commands a worker runs instead', () => {
		expect(workerMakeGateRule.decision).toBe('deny');
		expect(workerMakeGateRule.reason).toMatch(/jest <your own test file>/);
		expect(workerMakeGateRule.reason).toMatch(/eslint <your own files>/);
	});

	test('names the project root as the place to run them', () => {
		expect(workerMakeGateRule.reason).toMatch(/bare, from the project root\./);
	});

	test('shuts a retry down, because no form of a gate goal is the worker to run', () => {
		expect(workerMakeGateRule.reason).toMatch(/do not write this one again in another shape/);
	});

	test('names no make goal in its reason, so it cannot send a worker at one', () => {
		expect(workerMakeGateRule.reason).not.toMatch(/make\s+[a-z]/);
	});

	test('applies to a worker', () => {
		expect(workerMakeGateRule.appliesTo({ agentType: 'workflow-worker' })).toBe(true);
	});

	test.each([['workflow-gate'], ['workflow-check'], ['general-purpose'], [undefined]])(
		'does not apply to %s, which keeps every gate goal',
		(agentType) => {
			expect(workerMakeGateRule.appliesTo({ agentType })).toBe(false);
		}
	);

	test('matches a gate goal of any name, and not the two this tree holds alone', () => {
		expect(workerMakeGateRule.matchSegment(['make', 'some-other-gate'])).toBe(true);
	});

	test.each([
		['make', 'workflow-serial-gate'],
		['make', 'workflow-final-gate'],
		['make', 'workflow-final-gate', 'TARGET=myenv']
	])('matches %s %s', (...tokens) => {
		expect(workerMakeGateRule.matchSegment(tokens)).toBe(true);
	});

	test.each([
		['make', 'clean'],
		['make', 'test'],
		['make', 'build-docs'],
		['make', 'check-workflow-environment'],
		['make'],
		['jest', 'tests/a-module/thing.test.js']
	])('does not match %s %s', (...tokens) => {
		expect(workerMakeGateRule.matchSegment(tokens)).toBe(false);
	});
});
