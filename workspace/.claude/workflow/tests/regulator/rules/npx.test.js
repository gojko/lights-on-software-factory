import { describe, test, expect } from '@jest/globals';
import { npxRule } from '../../../src/regulator/rules/npx.js';

describe('npxRule', () => {
	test('matches bare npx', () => {
		expect(npxRule.matchSegment(['npx'])).toBe(true);
	});

	test('matches npx with arguments', () => {
		expect(npxRule.matchSegment(['npx', 'prettier', '--write', '.'])).toBe(true);
	});

	test('matches npx with leading flags', () => {
		expect(npxRule.matchSegment(['npx', '-y', 'create-react-app', 'foo'])).toBe(true);
	});

	test('does not match a binary whose name contains "npx"', () => {
		expect(npxRule.matchSegment(['npx-helper'])).toBe(false);
	});

	test('does not match when first token is something else entirely', () => {
		expect(npxRule.matchSegment(['node', 'npx-helper.js'])).toBe(false);
	});

	test('decision is deny with the redirect reason', () => {
		expect(npxRule.decision).toBe('deny');
		expect(npxRule.reason).toMatch(/Project policy forbids `npx`/);
	});
});
