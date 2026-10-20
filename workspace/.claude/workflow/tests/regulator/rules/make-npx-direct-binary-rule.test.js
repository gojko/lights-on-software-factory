import { describe, test, expect } from '@jest/globals';
import { makeNpxDirectBinaryRule } from '../../../src/regulator/rules/make-npx-direct-binary-rule.js';

describe('makeNpxDirectBinaryRule', () => {
	const jestRule = makeNpxDirectBinaryRule('jest'),
		eslintRule = makeNpxDirectBinaryRule('eslint');

	test('matches npx jest', () => {
		expect(jestRule.matchSegment(['npx', 'jest'])).toBe(true);
	});

	test('matches npx jest with arguments', () => {
		expect(jestRule.matchSegment(['npx', 'jest', 'tests/foo.test.js', '--coverage'])).toBe(true);
	});

	test('matches npx -y jest', () => {
		expect(jestRule.matchSegment(['npx', '-y', 'jest', '--listTests'])).toBe(true);
	});

	test('matches npx -p some-pkg jest', () => {
		expect(jestRule.matchSegment(['npx', '-p', 'some-pkg', 'jest'])).toBe(true);
	});

	test('matches npx --package=foo jest', () => {
		expect(jestRule.matchSegment(['npx', '--package=foo', 'jest'])).toBe(true);
	});

	test('matches npx eslint', () => {
		expect(eslintRule.matchSegment(['npx', 'eslint', '.'])).toBe(true);
	});

	test('matches npx -y eslint', () => {
		expect(eslintRule.matchSegment(['npx', '-y', 'eslint', 'src'])).toBe(true);
	});

	test('matches npx --package=eslint eslint', () => {
		expect(eslintRule.matchSegment(['npx', '--package=eslint', 'eslint', '.'])).toBe(true);
	});

	test('the eslint rule does not match npx jest', () => {
		expect(eslintRule.matchSegment(['npx', 'jest'])).toBe(false);
	});

	test('the jest rule does not match npx eslint', () => {
		expect(jestRule.matchSegment(['npx', 'eslint'])).toBe(false);
	});

	test('matches npx --no-install jest, so a value-less flag does not lose the message', () => {
		expect(jestRule.matchSegment(['npx', '--no-install', 'jest'])).toBe(true);
	});

	test('matches npx --yes --silent eslint', () => {
		expect(eslintRule.matchSegment(['npx', '--yes', '--silent', 'eslint', '.'])).toBe(true);
	});

	test('matches npx --package foo jest, where the value is a separate token', () => {
		expect(jestRule.matchSegment(['npx', '--package', 'foo', 'jest'])).toBe(true);
	});

	test('does not match npx prettier (generic npx falls through to npxRule)', () => {
		expect(jestRule.matchSegment(['npx', 'prettier'])).toBe(false);
		expect(eslintRule.matchSegment(['npx', 'prettier'])).toBe(false);
	});

	test('does not match npx -y create-react-app foo', () => {
		expect(jestRule.matchSegment(['npx', '-y', 'create-react-app', 'foo'])).toBe(false);
	});

	test('does not match bare jest (no npx)', () => {
		expect(jestRule.matchSegment(['jest'])).toBe(false);
	});

	test('does not match bare eslint (no npx)', () => {
		expect(eslintRule.matchSegment(['eslint', '.'])).toBe(false);
	});

	test('gives each rule an id naming its binary', () => {
		expect(jestRule.id).toBe('npx-jest');
		expect(eslintRule.id).toBe('npx-eslint');
	});

	test('the jest reason names jest, $PATH and how to put the project tools on it', () => {
		expect(jestRule.decision).toBe('deny');
		expect(jestRule.reason).toBe("Use the `jest` binary from $PATH; jest is on $PATH from the project's `package.json`. If it is not on $PATH, add the project's `node_modules/.bin` to $PATH before you start Claude Code.");
	});

	test('the eslint reason names eslint and $PATH, so no second call is needed', () => {
		expect(eslintRule.decision).toBe('deny');
		expect(eslintRule.reason).toBe("Use the `eslint` binary from $PATH; eslint is on $PATH from the project's `package.json`. If it is not on $PATH, add the project's `node_modules/.bin` to $PATH before you start Claude Code.");
	});
});
