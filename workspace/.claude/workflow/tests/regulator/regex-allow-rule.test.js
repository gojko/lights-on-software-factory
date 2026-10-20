import { describe, test, expect } from '@jest/globals';
import { regexAllowRule } from '../../src/regulator/regex-allow-rule.js';

describe('regexAllowRule', () => {
	test('returns a rule with id and decision allow', () => {
		const rule = regexAllowRule({ id: 'cat', regex: /^cat(\s|$)/ });
		expect(rule.id).toBe('cat');
		expect(rule.decision).toBe('allow');
	});

	test('does not carry a reason — allow decisions need no explanation', () => {
		const rule = regexAllowRule({ id: 'cat', regex: /^cat(\s|$)/ });
		expect(rule.reason).toBeUndefined();
	});

	test('ignores a reason argument if one is passed (allow rules are reason-less)', () => {
		const rule = regexAllowRule({ id: 'cat', regex: /^cat(\s|$)/, reason: 'ignored' });
		expect(rule.reason).toBeUndefined();
	});

	test('matchSegment returns true when the joined-token string matches the regex', () => {
		const rule = regexAllowRule({ id: 'cat', regex: /^cat(\s|$)/ });
		expect(rule.matchSegment(['cat', '/etc/hosts'])).toBe(true);
	});

	test('matchSegment returns false when the joined-token string does not match', () => {
		const rule = regexAllowRule({ id: 'cat', regex: /^cat(\s|$)/ });
		expect(rule.matchSegment(['catfish'])).toBe(false);
	});

	test('matchSegment returns boolean (not truthy/falsy)', () => {
		const rule = regexAllowRule({ id: 'ls', regex: /^ls(\s|$)/ });
		expect(typeof rule.matchSegment(['ls'])).toBe('boolean');
		expect(typeof rule.matchSegment(['cd'])).toBe('boolean');
	});

	test('throws when id is missing', () => {
		expect(() => regexAllowRule({ regex: /^cat/ })).toThrow();
	});

	test('throws when regex is missing', () => {
		expect(() => regexAllowRule({ id: 'cat' })).toThrow();
	});

	test('joined-token string preserves single spaces between tokens', () => {
		const rule = regexAllowRule({ id: 'docker-compose', regex: /^docker compose(\s|$)/ });
		expect(rule.matchSegment(['docker', 'compose', 'config'])).toBe(true);
		expect(rule.matchSegment(['docker', 'image'])).toBe(false);
	});
});
