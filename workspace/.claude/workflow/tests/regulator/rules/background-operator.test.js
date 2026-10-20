import { describe, test, expect } from '@jest/globals';
import { backgroundOperatorRule } from '../../../src/regulator/rules/background-operator.js';

describe('backgroundOperatorRule', () => {
	test('allows and carries no reason', () => {
		expect(backgroundOperatorRule.decision).toBe('allow');
		expect(backgroundOperatorRule.reason).toBeUndefined();
	});

	test('applies to every caller, because the operator starts nothing of its own', () => {
		expect(backgroundOperatorRule.appliesTo).toBeUndefined();
	});

	test('matches the orphan ampersand a backgrounded subshell leaves behind', () => {
		expect(backgroundOperatorRule.matchSegment(['&'])).toBe(true);
	});

	test.each([[['&', 'npx', 'jest']], [['&&']], [['echo', '&']], [['make', 'test', '&']], [[]]])(
		'does not match %s, so what follows the operator is still read',
		(tokens) => {
			expect(backgroundOperatorRule.matchSegment(tokens)).toBe(false);
		}
	);
});
