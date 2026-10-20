import { describe, test, expect } from '@jest/globals';
import { gitRemoteRule } from '../../../src/regulator/rules/git-remote.js';

describe('gitRemoteRule', () => {
	test('matches git push', () => {
		expect(gitRemoteRule.matchSegment(['git', 'push'])).toBe(true);
	});

	test('matches git push with args', () => {
		expect(gitRemoteRule.matchSegment(['git', 'push', 'origin', 'master', '--force'])).toBe(true);
	});

	test('matches git pull', () => {
		expect(gitRemoteRule.matchSegment(['git', 'pull'])).toBe(true);
	});

	test('matches git fetch', () => {
		expect(gitRemoteRule.matchSegment(['git', 'fetch', '--all', '--tags'])).toBe(true);
	});

	test('matches git clone', () => {
		expect(gitRemoteRule.matchSegment(['git', 'clone', 'https://github.com/foo/bar'])).toBe(true);
	});

	test('does not match git diff (even with a remote ref)', () => {
		expect(gitRemoteRule.matchSegment(['git', 'diff', 'origin/main..HEAD'])).toBe(false);
	});

	test('does not match git remote -v', () => {
		expect(gitRemoteRule.matchSegment(['git', 'remote', '-v'])).toBe(false);
	});

	test('does not match git status', () => {
		expect(gitRemoteRule.matchSegment(['git', 'status'])).toBe(false);
	});

	test('matches git -C <path> push (skips global option before subcommand)', () => {
		expect(gitRemoteRule.matchSegment(['git', '-C', '/path', 'push', 'origin', 'master'])).toBe(true);
	});

	test('matches git -c key=value pull', () => {
		expect(gitRemoteRule.matchSegment(['git', '-c', 'user.email=foo@bar.com', 'pull'])).toBe(true);
	});

	test('matches git -C <path> -c key=value fetch', () => {
		expect(gitRemoteRule.matchSegment(['git', '-C', '/path', '-c', 'k=v', 'fetch', '--all'])).toBe(true);
	});

	test('does not match git -C <path> status (status is not a remote op)', () => {
		expect(gitRemoteRule.matchSegment(['git', '-C', '/path', 'status'])).toBe(false);
	});

	test('does not match git -C <path> diff (diff is not a remote op even with remote refspec)', () => {
		expect(gitRemoteRule.matchSegment(['git', '-C', '/path', 'diff', 'origin/main..HEAD'])).toBe(false);
	});

	test('matches git --no-pager push (skips --no-pager before subcommand)', () => {
		expect(gitRemoteRule.matchSegment(['git', '--no-pager', 'push', 'origin', 'master'])).toBe(true);
	});

	test('matches git --no-pager -C <path> push (mixes --no-pager with -C)', () => {
		expect(gitRemoteRule.matchSegment(['git', '--no-pager', '-C', '/path', 'push'])).toBe(true);
	});

	test('does not match git --no-pager status (status is not a remote op)', () => {
		expect(gitRemoteRule.matchSegment(['git', '--no-pager', 'status'])).toBe(false);
	});

	test('reason is a function that interpolates the original command', () => {
		expect(typeof gitRemoteRule.reason).toBe('function');
		expect(gitRemoteRule.reason('git push --dry-run')).toBe(
			'Git operations involving the remote are not allowed inside a Claude Code session. Ask the user to run `git push --dry-run` directly.'
		);
	});

	test('decision is deny', () => {
		expect(gitRemoteRule.decision).toBe('deny');
	});
});
