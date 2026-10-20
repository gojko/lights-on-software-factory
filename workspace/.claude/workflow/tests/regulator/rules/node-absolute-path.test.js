import { afterEach, beforeEach, describe, test, expect } from '@jest/globals';
import { nodeAbsolutePathRule } from '../../../src/regulator/rules/node-absolute-path.js';

describe('nodeAbsolutePathRule', () => {
	let savedTransientDir;

	beforeEach(() => {
		savedTransientDir = process.env.CLAUDE_TRANSIENT_DIR;
		delete process.env.CLAUDE_TRANSIENT_DIR;
	});

	afterEach(() => {
		if (savedTransientDir === undefined) {
			delete process.env.CLAUDE_TRANSIENT_DIR;
		} else {
			process.env.CLAUDE_TRANSIENT_DIR = savedTransientDir;
		}
	});

	test('matches node with an absolute path script', () => {
		expect(nodeAbsolutePathRule.matchSegment(['node', '/tmp/x.js'])).toBe(true);
	});

	test('exempts scripts under /tmp/claude-transient/', () => {
		expect(nodeAbsolutePathRule.matchSegment(['node', '/tmp/claude-transient/probe.js'])).toBe(false);
	});

	test('exempts /tmp/claude-transient/ with extra arguments', () => {
		expect(nodeAbsolutePathRule.matchSegment(['node', '/tmp/claude-transient/foo.js', 'arg1'])).toBe(false);
	});

	test('allows node with a relative path', () => {
		expect(nodeAbsolutePathRule.matchSegment(['node', '.claude/scripts/foo.js'])).toBe(false);
	});

	test('does not match a binary whose name contains "node"', () => {
		expect(nodeAbsolutePathRule.matchSegment(['mynode', '/tmp/x.js'])).toBe(false);
	});

	test('does not match bare node (no script argument)', () => {
		expect(nodeAbsolutePathRule.matchSegment(['node'])).toBe(false);
	});

	test('decision is deny and id is node-absolute-path', () => {
		expect(nodeAbsolutePathRule.decision).toBe('deny');
		expect(nodeAbsolutePathRule.id).toBe('node-absolute-path');
	});

	test('reason mentions /tmp/claude-transient/ exemption', () => {
		expect(nodeAbsolutePathRule.reason('node /tmp/x.js')).toMatch(/\/tmp\/claude-transient\//);
	});

	describe('with a configured transient directory', () => {
		beforeEach(() => {
			process.env.CLAUDE_TRANSIENT_DIR = '/var/tmp/ct';
		});

		test('matches a script under the default directory, which is no longer exempt', () => {
			expect(nodeAbsolutePathRule.matchSegment(['node', '/tmp/claude-transient/x.js'])).toBe(true);
		});

		test('exempts a script under the configured directory', () => {
			expect(nodeAbsolutePathRule.matchSegment(['node', '/var/tmp/ct/x.js'])).toBe(false);
		});

		test('matches a script in a sibling directory that only shares the name prefix', () => {
			expect(nodeAbsolutePathRule.matchSegment(['node', '/var/tmp/ct-other/x.js'])).toBe(true);
		});

		test('reason names the configured directory', () => {
			expect(nodeAbsolutePathRule.reason('node /tmp/x.js')).toMatch(/\/var\/tmp\/ct\//);
		});
	});
});
