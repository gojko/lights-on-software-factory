import { describe, test, expect } from '@jest/globals';
import { regexDenyRule } from '../../src/regulator/regex-deny-rule.js';

describe('regexDenyRule', () => {
	test('returns a rule with id, decision deny, and the supplied reason', () => {
		const rule = regexDenyRule({
			id: 'npm-prefix',
			regex: /\bnpm\b.*--prefix(\s|=|$)/,
			reason: 'Do not invoke npm with --prefix.'
		});
		expect(rule.id).toBe('npm-prefix');
		expect(rule.decision).toBe('deny');
		expect(rule.reason).toBe('Do not invoke npm with --prefix.');
	});

	test('matchSegment returns true when the joined-token string matches the regex', () => {
		const rule = regexDenyRule({
			id: 'npm-prefix',
			regex: /\bnpm\b.*--prefix(\s|=|$)/,
			reason: 'Do not invoke npm with --prefix.'
		});
		expect(rule.matchSegment(['npm', '--prefix', 'config', 'test'])).toBe(true);
	});

	test('matchSegment returns false when the joined-token string does not match', () => {
		const rule = regexDenyRule({
			id: 'npm-prefix',
			regex: /\bnpm\b.*--prefix(\s|=|$)/,
			reason: 'Do not invoke npm with --prefix.'
		});
		expect(rule.matchSegment(['npm', 'test'])).toBe(false);
	});

	test('matchSegment returns boolean', () => {
		const rule = regexDenyRule({ id: 'foo', regex: /^foo/, reason: 'no foo' });
		expect(typeof rule.matchSegment(['foo'])).toBe('boolean');
		expect(typeof rule.matchSegment(['bar'])).toBe('boolean');
	});

	test('throws when id is missing', () => {
		expect(() => regexDenyRule({ regex: /^foo/, reason: 'no foo' })).toThrow();
	});

	test('throws when regex is missing', () => {
		expect(() => regexDenyRule({ id: 'foo', reason: 'no foo' })).toThrow();
	});

	test('throws when reason is missing', () => {
		expect(() => regexDenyRule({ id: 'foo', regex: /^foo/ })).toThrow();
	});

	test('throws when reason is an empty string', () => {
		expect(() => regexDenyRule({ id: 'foo', regex: /^foo/, reason: '' })).toThrow();
	});
});
