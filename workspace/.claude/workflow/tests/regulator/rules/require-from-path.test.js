import { describe, test, expect } from '@jest/globals';
import { requireFromPath } from '../../../src/regulator/rules/require-from-path.js';

describe('requireFromPath', () => {
	const underTest = requireFromPath({
		id: 'require-from-path',
		commands: ['jest', 'eslint', 'prettier', 'sass', 'cfn-lint']
	});

	test('decision is deny', () => {
		expect(underTest.decision).toBe('deny');
	});

	test('matches a relative ./ path form', () => {
		expect(underTest.matchSegment(['./cfn-lint', 'app.yml'])).toBe(true);
	});

	test('matches a ../ path form', () => {
		expect(underTest.matchSegment(['../../node_modules/.bin/jest', 'tests/foo.test.js'])).toBe(true);
	});

	test('matches an absolute path form', () => {
		expect(underTest.matchSegment(['/usr/local/bin/eslint', '--fix', 'src'])).toBe(true);
	});

	test('matches an arbitrary relative path with a subdir', () => {
		expect(underTest.matchSegment(['tools/bin/prettier', '--write', '.'])).toBe(true);
	});

	test('matches the node_modules .bin form', () => {
		expect(underTest.matchSegment(['node_modules/.bin/sass', 'a.scss', 'b.css'])).toBe(true);
	});

	test('matches a direct-execution .js package script', () => {
		expect(underTest.matchSegment(['node_modules/jest/bin/jest.js', 'tests'])).toBe(true);
	});

	test('matches a direct-execution .cjs package script', () => {
		expect(underTest.matchSegment(['node_modules/prettier/bin/prettier.cjs', '.'])).toBe(true);
	});

	test('does not match a bare command name', () => {
		expect(underTest.matchSegment(['jest', 'tests/foo.test.js'])).toBe(false);
	});

	test('does not match a bare command with a path-form argument', () => {
		expect(underTest.matchSegment(['eslint', '/tmp/foo.js'])).toBe(false);
	});

	test('does not match an unrelated command with the tool name in an argument', () => {
		expect(underTest.matchSegment(['cat', '/tmp/eslint.log'])).toBe(false);
	});

	test('does not match a command whose basename merely ends with a tool name', () => {
		expect(underTest.matchSegment(['/usr/bin/myjest'])).toBe(false);
	});

	test('reason names the offending tool and points to $PATH', () => {
		expect(underTest.reason('/usr/local/bin/eslint --fix src')).toMatch(/Use `eslint` from \$PATH/);
	});

	test('reason names the project package.json as the source of the tool', () => {
		expect(underTest.reason('/usr/local/bin/eslint --fix src')).toMatch(/it is on \$PATH from the project's `package\.json`/);
	});

	test('reason resolves the tool from a .js direct-execution form', () => {
		expect(underTest.reason('node_modules/jest/bin/jest.js tests')).toMatch(/Use `jest` from \$PATH/);
	});
});
