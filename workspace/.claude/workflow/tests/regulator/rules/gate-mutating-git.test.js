import { describe, test, expect } from '@jest/globals';
import { gateMutatingGitRule } from '../../../src/regulator/rules/gate-mutating-git.js';

describe('gateMutatingGitRule', () => {
	test('denies with a reason that states a gate proves a tree and never moves one', () => {
		expect(gateMutatingGitRule.decision).toBe('deny');
		expect(gateMutatingGitRule.reason).toMatch(/proves a tree and never moves one/);
	});

	test('says what to run in 300 characters or fewer, opens with an imperative verb and names no make goal', () => {
		expect(gateMutatingGitRule.reason.length).toBeLessThanOrEqual(300);
		expect(gateMutatingGitRule.reason).toMatch(/^(Run|Read|Only|Do not) /);
		expect(gateMutatingGitRule.reason).not.toMatch(/make\s+[a-z]/);
	});

	test('applies to a gate', () => {
		expect(gateMutatingGitRule.appliesTo({ agentType: 'workflow-gate' })).toBe(true);
	});

	test.each([['workflow-worker'], ['workflow-check'], ['general-purpose']])('does not apply to %s', (agentType) => {
		expect(gateMutatingGitRule.appliesTo({ agentType })).toBe(false);
	});

	test('does not apply to a caller that states no agent type', () => {
		expect(gateMutatingGitRule.appliesTo({})).toBe(false);
	});

	test.each([
		['git', 'stash'],
		['git', 'stash', 'pop'],
		['git', 'commit', '-m', 'a message'],
		['git', 'checkout', 'master'],
		['git', 'reset', '--hard'],
		['git', 'clean', '-fd'],
		['git', 'branch', 'a-branch'],
		['git', 'push'],
		['git', 'push', 'origin', 'master'],
		['git', 'add', '.'],
		['git', 'revert', 'abc1234'],
		['git', '-C', '/tmp/probe', 'commit', '-m', 'a message'],
		['git', '--no-pager', 'add', '.']
	])('matches %s %s', (...tokens) => {
		expect(gateMutatingGitRule.matchSegment(tokens)).toBe(true);
	});

	test.each([
		['git', 'status'],
		['git', 'status', '--short'],
		['git', 'diff'],
		['git', 'diff', '--stat'],
		['git', 'log', '--oneline'],
		['git', 'show', 'HEAD'],
		['git', 'stash', 'list'],
		['git', 'stash', 'show'],
		['git', '--no-pager', 'diff', '--stat'],
		['make', 'workflow-serial-gate']
	])('does not match %s %s', (...tokens) => {
		expect(gateMutatingGitRule.matchSegment(tokens)).toBe(false);
	});
});
