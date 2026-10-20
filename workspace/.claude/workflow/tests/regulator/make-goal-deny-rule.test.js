import { describe, test, expect, beforeEach } from '@jest/globals';
import { makeGoalDenyRule } from '../../src/regulator/make-goal-deny-rule.js';

describe('makeGoalDenyRule', () => {
	let underTest;

	beforeEach(() => {
		underTest = makeGoalDenyRule({ id: 'probe', regex: /^(test|deploy)$/, reason: 'a probe reason' });
	});

	test('answers a rule that carries the id, the deny decision and the reason', () => {
		expect(underTest).toEqual(expect.objectContaining({ id: 'probe', decision: 'deny', reason: 'a probe reason' }));
	});

	test('matches when the only goal matches the regex', () => {
		expect(underTest.matchSegment(['make', 'test'])).toBe(true);
	});

	test('matches when the second goal matches the regex', () => {
		expect(underTest.matchSegment(['make', 'clean', 'deploy'])).toBe(true);
	});

	test('matches when a flag precedes the goal', () => {
		expect(underTest.matchSegment(['make', '-C', 'infra', 'deploy'])).toBe(true);
	});

	test('does not match when no goal matches the regex', () => {
		expect(underTest.matchSegment(['make', 'build-demo-pages'])).toBe(false);
	});

	test('does not match when make names no goal', () => {
		expect(underTest.matchSegment(['make'])).toBe(false);
	});

	test('does not match a command that is not make', () => {
		expect(underTest.matchSegment(['jest', 'test'])).toBe(false);
	});

	test('carries no appliesTo when the caller states none', () => {
		expect(underTest.appliesTo).toBeUndefined();
	});

	test('carries the appliesTo the caller states', () => {
		const appliesTo = (context) => context.agentType === 'workflow-worker';

		expect(makeGoalDenyRule({ id: 'probe', regex: /^test$/, reason: 'a reason', appliesTo }).appliesTo).toBe(appliesTo);
	});

	test('throws error when id is absent', () => {
		expect(() => makeGoalDenyRule({ regex: /^test$/, reason: 'a reason' })).toThrow('makeGoalDenyRule: id is required');
	});

	test('throws error when regex is absent', () => {
		expect(() => makeGoalDenyRule({ id: 'probe', reason: 'a reason' })).toThrow('makeGoalDenyRule: regex is required');
	});

	test('throws error when reason is absent', () => {
		expect(() => makeGoalDenyRule({ id: 'probe', regex: /^test$/ })).toThrow('makeGoalDenyRule: reason is required');
	});
});
