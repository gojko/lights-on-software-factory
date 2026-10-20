import { describe, test, expect } from '@jest/globals';
import { workerFileScopedVerificationRule } from '../../../src/regulator/rules/worker-file-scoped-verification.js';

describe('workerFileScopedVerificationRule', () => {
	test('denies, so a form it does not match falls through to the common allow list', () => {
		expect(workerFileScopedVerificationRule.decision).toBe('deny');
	});

	test('applies to a worker', () => {
		expect(workerFileScopedVerificationRule.appliesTo({ agentType: 'workflow-worker' })).toBe(true);
	});

	test.each([['workflow-gate'], ['workflow-check'], ['general-purpose'], [undefined]])(
		'does not apply to %s, which keeps every form of both',
		(agentType) => {
			expect(workerFileScopedVerificationRule.appliesTo({ agentType })).toBe(false);
		}
	);

	test('names the bare form of both commands in its reason', () => {
		expect(workerFileScopedVerificationRule.reason).toMatch(/jest <your own test file>/);
		expect(workerFileScopedVerificationRule.reason).toMatch(/eslint <your own files>/);
	});

	test.each([
		[['jest', 'tests/a-module/thing.test.js']],
		[['jest', '.claude/workflow/tests/regulator/rules/a.test.js', '.claude/workflow/tests/regulator/b.test.js']],
		[['eslint', 'src/a-module/thing.js']],
		[['eslint', 'a/b.js', 'c/d.js', 'e/f.js', 'g/h.js']],
		[['eslint', 'eslint.config.mjs']],
		[['jest', '/tmp/claude-transient/a.test.js']]
	])('does not match %s, because every argument names a file', (tokens) => {
		expect(workerFileScopedVerificationRule.matchSegment(tokens)).toBe(false);
	});

	test.each([
		[['jest', 'tests/a-module/thing.test.js', '-t', 'returns a thing']],
		[['jest', '-t', 'returns a thing', 'tests/a-module/thing.test.js']],
		[['jest', 'tests/a-module/thing.test.js', '--testNamePattern', 'returns a thing']],
		[['jest', 'tests/a-module/thing.test.js', '--testNamePattern=returns a thing']],
		[['jest', 'a/b.test.js', 'c/d.test.js', '-t', 'returns a thing']]
	])('does not match %s, because a name pattern narrows the run of a named file', (tokens) => {
		expect(workerFileScopedVerificationRule.matchSegment(tokens)).toBe(false);
	});

	test.each([
		[['eslint', '--print-config', 'docs/legal/privacy.md']],
		[['eslint', 'a/b.js', '-f', 'json']],
		[['eslint', 'a/b.js', '--format', 'json']],
		[['eslint', 'a/b.js', '--format=json']],
		[['eslint', '-f', 'json', 'a/b.js']],
		[['eslint', '-f', 'json', 'a/b.js', 'c/d.js']]
	])('does not match %s, because a read-only flag reports on a named file and writes nothing', (tokens) => {
		expect(workerFileScopedVerificationRule.matchSegment(tokens)).toBe(false);
	});

	test.each([
		[['eslint', '--print-config']],
		[['eslint', '-f', 'json']],
		[['eslint', '--format', 'json']],
		[['eslint', 'a/b.js', '-f', 'json', '--fix']],
		[['eslint', '--print-config', 'docs/legal/privacy.md', '--fix']],
		[['eslint', 'a/b.js', '-o', 'out.json']],
		[['jest', 'a/b.test.js', '--print-config']],
		[['jest', 'a/b.test.js', '-f', 'json']]
	])('matches %s, because a read-only flag does not carry a run that writes or names no file', (tokens) => {
		expect(workerFileScopedVerificationRule.matchSegment(tokens)).toBe(true);
	});

	test.each([
		[['jest']],
		[['jest', '--selectProjects', 'lib']],
		[['jest', '--testNamePattern', 'returns a thing']],
		[['jest', '-t', 'returns a thing']],
		[['jest', '--testNamePattern=returns a thing']],
		[['jest', '--selectProjects', 'lib', '--testNamePattern', 'returns a thing']],
		[['jest', '-t', 'returns a thing', 'lib']],
		[['eslint', 'a/b.js', '-t', 'returns a thing']],
		[['jest', 'lib']],
		[['jest', '.']],
		[['jest', 'tests/a-module/thing.test.js', '--silent']],
		[['eslint']],
		[['eslint', '.']],
		[['eslint', '--fix']],
		[['eslint', '..']]
	])('matches %s, because an argument that names no file widens the run', (tokens) => {
		expect(workerFileScopedVerificationRule.matchSegment(tokens)).toBe(true);
	});

	test.each([
		[['npm', 'test', '--', 'tests/a-module/thing.test.js']],
		[['npm', 't', '--', 'tests/a.test.js', 'tests/b.test.js']],
		[['npm', 'test', '--', 'tests/a.test.js', '-t', 'returns a thing']]
	])('does not match %s, because every test argument names a file', (tokens) => {
		expect(workerFileScopedVerificationRule.matchSegment(tokens)).toBe(false);
	});

	test.each([
		[['npm', 'test']],
		[['npm', 't']],
		[['npm', 'test', '--']],
		[['npm', 'test', '--', 'lib']],
		[['npm', 'test', '--', '-t', 'returns a thing']],
		[['npm', 'test', '--', 'tests/a.test.js', '--silent']]
	])('matches %s, because a test run that names no file reads every sibling worker', (tokens) => {
		expect(workerFileScopedVerificationRule.matchSegment(tokens)).toBe(true);
	});

	test('names the file-scoped jest and eslint forms in its reason', () => {
		expect(workerFileScopedVerificationRule.reason).toMatch(/`jest <your own test file>`.*`eslint <your own files>`/);
	});

	test('does not send the worker to an npm script in its reason, because the project has none', () => {
		expect(workerFileScopedVerificationRule.reason).not.toMatch(/npm/);
	});

	test.each([[['make', 'test']], [['tsc', '--noEmit']], [['cat', 'jest']], [['npx', 'jest']], [['npm', 'install']], [['npm', 'run', 'build']], [[]]])(
		'does not match %s, which is not one of the two commands',
		(tokens) => {
			expect(workerFileScopedVerificationRule.matchSegment(tokens)).toBe(false);
		}
	);
});
