import { describe, test, expect } from '@jest/globals';
import { workerMutatingGitRule } from '../../../src/regulator/rules/worker-mutating-git.js';

describe('workerMutatingGitRule', () => {
	test('denies with a reason that names the two git commands a worker reads', () => {
		expect(workerMutatingGitRule.decision).toBe('deny');
		expect(workerMutatingGitRule.reason).toMatch(/git status/);
		expect(workerMutatingGitRule.reason).toMatch(/git diff/);
	});

	test('names the two commands that move a file in the index, which stay allowed', () => {
		expect(workerMutatingGitRule.reason).toMatch(/git rm/);
		expect(workerMutatingGitRule.reason).toMatch(/git mv/);
	});

	test('applies to a worker', () => {
		expect(workerMutatingGitRule.appliesTo({ agentType: 'workflow-worker' })).toBe(true);
	});

	test.each([['workflow-gate'], ['workflow-check'], ['general-purpose'], [undefined]])(
		'does not apply to %s, which keeps the answer it gets today',
		(agentType) => {
			expect(workerMutatingGitRule.appliesTo({ agentType })).toBe(false);
		}
	);

	test.each([
		['git', 'add', '.'],
		['git', 'commit', '-m', 'a message'],
		['git', 'stash'],
		['git', 'stash', 'pop'],
		['git', 'checkout', 'master'],
		['git', 'reset', '--hard'],
		['git', 'clean', '-fd'],
		['git', 'branch', 'a-branch'],
		['git', 'merge', 'master'],
		['git', 'rebase', 'master'],
		['git', 'cherry-pick', 'abc1234'],
		['git', 'revert', 'abc1234'],
		['git', 'restore', 'a-file.js'],
		['git', 'switch', 'master'],
		['git', 'apply', 'a.patch'],
		['git', 'worktree', 'add', '/tmp/probe'],
		['git', 'submodule', 'update'],
		['git', 'tag', 'a-tag'],
		['git', 'gc'],
		['git', 'prune'],
		['git', 'reflog'],
		['git', 'am', 'a.patch'],
		['git', '-C', '/tmp/probe', 'commit', '-m', 'a message'],
		['git', '--no-pager', 'add', '.']
	])('matches %s %s', (...tokens) => {
		expect(workerMutatingGitRule.matchSegment(tokens)).toBe(true);
	});

	test.each([
		['git', 'status'],
		['git', 'status', '--short'],
		['git', 'diff'],
		['git', 'diff', '--stat'],
		['git', 'log', '--oneline'],
		['git', 'show', 'HEAD'],
		['git', 'blame', 'a-file.js'],
		['git', 'grep', 'a-pattern'],
		['git', 'stash', 'list'],
		['git', 'stash', 'show'],
		['git', '--no-pager', 'diff', '--stat'],
		['git', 'rm', 'a-file.js'],
		['git', 'mv', 'a.js', 'b.js'],
		['jest', 'tests/a-module/thing.test.js']
	])('does not match %s %s', (...tokens) => {
		expect(workerMutatingGitRule.matchSegment(tokens)).toBe(false);
	});
});
