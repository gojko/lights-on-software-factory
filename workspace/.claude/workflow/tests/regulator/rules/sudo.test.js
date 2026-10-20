import { describe, test, expect } from '@jest/globals';
import { sudoRule } from '../../../src/regulator/rules/sudo.js';

describe('sudoRule', () => {
	test('matches sudo with arguments', () => {
		expect(sudoRule.matchSegment(['sudo', 'make', 'deploy'])).toBe(true);
	});

	test('matches sudo -u other make build', () => {
		expect(sudoRule.matchSegment(['sudo', '-u', 'other', 'make', 'build'])).toBe(true);
	});

	test('matches sudo -i', () => {
		expect(sudoRule.matchSegment(['sudo', '-i'])).toBe(true);
	});

	test('matches bare sudo', () => {
		expect(sudoRule.matchSegment(['sudo'])).toBe(true);
	});

	test('does not match which sudo (first token is which)', () => {
		expect(sudoRule.matchSegment(['which', 'sudo'])).toBe(false);
	});

	test('does not match echo sudo (first token is echo)', () => {
		expect(sudoRule.matchSegment(['echo', 'sudo'])).toBe(false);
	});

	test('does not match cat /usr/bin/sudo', () => {
		expect(sudoRule.matchSegment(['cat', '/usr/bin/sudo'])).toBe(false);
	});

	test('reason is a function that interpolates the original command', () => {
		expect(typeof sudoRule.reason).toBe('function');
		expect(sudoRule.reason('sudo make deploy')).toBe(
			'sudo is not allowed inside a Claude Code session. Ask the user to run `sudo make deploy` directly.'
		);
	});

	test('decision is deny', () => {
		expect(sudoRule.decision).toBe('deny');
	});
});
