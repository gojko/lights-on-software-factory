import { describe, test, expect } from '@jest/globals';
import { workerGitFileMoveRule } from '../../../src/regulator/rules/worker-git-file-move.js';

describe('workerGitFileMoveRule', () => {
	test('allows, so a deletion of a step reaches the index and needs no gate to stage it', () => {
		expect(workerGitFileMoveRule.decision).toEqual('allow');
	});

	test('carries no reason, as every allow rule does', () => {
		expect(workerGitFileMoveRule.reason).toBeUndefined();
	});

	test('applies to a worker alone', () => {
		expect(workerGitFileMoveRule.appliesTo({ agentType: 'workflow-worker' })).toBe(true);
		expect(workerGitFileMoveRule.appliesTo({ agentType: 'workflow-gate' })).toBe(false);
		expect(workerGitFileMoveRule.appliesTo({})).toBe(false);
	});

	test.each([
		['git', 'rm', 'src/widgets/a-widget.js'],
		['git', 'rm', '-r', 'tests/widgets'],
		['git', 'mv', 'a.js', 'b.js'],
		['git', '--no-pager', 'rm', 'a.js'],
		['git', '-C', '/tmp/probe', 'mv', 'a.js', 'b.js']
	])('matches %s %s %s', (...tokens) => {
		expect(workerGitFileMoveRule.matchSegment(tokens)).toBe(true);
	});

	test.each([
		['git', 'add', '.'],
		['git', 'commit', '-m', 'a message'],
		['git', 'reset', '--hard'],
		['git', 'status'],
		['rm', 'a-file.js'],
		['mv', 'a.js', 'b.js']
	])('does not match %s %s', (...tokens) => {
		expect(workerGitFileMoveRule.matchSegment(tokens)).toBe(false);
	});
});
