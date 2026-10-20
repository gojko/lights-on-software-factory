import { describe, test, expect } from '@jest/globals';
import { npmInstallRule } from '../../../src/regulator/rules/npm-install.js';

describe('npmInstallRule', () => {
	test('matches bare npm install', () => {
		expect(npmInstallRule.matchSegment(['npm', 'install'])).toBe(true);
	});

	test('matches bare npm i', () => {
		expect(npmInstallRule.matchSegment(['npm', 'i'])).toBe(true);
	});

	test('matches npm install <pkg>', () => {
		expect(npmInstallRule.matchSegment(['npm', 'install', 'jest'])).toBe(true);
	});

	test('matches npm i <pkg>', () => {
		expect(npmInstallRule.matchSegment(['npm', 'i', 'lodash'])).toBe(true);
	});

	test('matches npm install with flags', () => {
		expect(npmInstallRule.matchSegment(['npm', 'install', '--no-audit'])).toBe(true);
	});

	test('matches npm install --save-dev <pkg>', () => {
		expect(npmInstallRule.matchSegment(['npm', 'install', '--save-dev', 'prettier'])).toBe(true);
	});

	test('does not match npm test', () => {
		expect(npmInstallRule.matchSegment(['npm', 'test'])).toBe(false);
	});

	test('does not match npm run something', () => {
		expect(npmInstallRule.matchSegment(['npm', 'run', 'build'])).toBe(false);
	});

	test('does not match a non-npm first token', () => {
		expect(npmInstallRule.matchSegment(['yarn', 'install'])).toBe(false);
	});

	test('decision is ask, has a reason', () => {
		expect(npmInstallRule.decision).toBe('ask');
		expect(typeof npmInstallRule.reason).toBe('string');
	});

	test('names no version-pin guard in its reason, because the project has none', () => {
		expect(npmInstallRule.reason).not.toMatch(/version-pin/);
	});
});
