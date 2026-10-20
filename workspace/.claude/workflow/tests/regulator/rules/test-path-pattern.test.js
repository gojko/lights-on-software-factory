import { describe, test, expect } from '@jest/globals';
import { testPathPatternRule } from '../../../src/regulator/rules/test-path-pattern.js';

describe('testPathPatternRule', () => {
	test('matches --testPathPattern flag', () => {
		expect(testPathPatternRule.matchSegment(['npm', 'test', '--', '--testPathPattern', 'foo'])).toBe(true);
	});

	test('matches --testPathPattern=value form', () => {
		expect(testPathPatternRule.matchSegment(['jest', '--testPathPattern=foo'])).toBe(true);
	});

	test('does not match --testNamePattern', () => {
		expect(testPathPatternRule.matchSegment(['npm', 'test', '--', '--testNamePattern=foo'])).toBe(false);
	});

	test('does not match a segment without the flag', () => {
		expect(testPathPatternRule.matchSegment(['jest', 'tests/foo.test.js'])).toBe(false);
	});
});
