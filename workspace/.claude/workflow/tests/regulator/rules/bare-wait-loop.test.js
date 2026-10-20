import { afterEach, beforeEach, describe, test, expect } from '@jest/globals';
import { bareWaitLoopRule } from '../../../src/regulator/rules/bare-wait-loop.js';

describe('bareWaitLoopRule', () => {
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

	test('denies, and reads the whole command rather than one segment of it', () => {
		expect(bareWaitLoopRule.decision).toBe('deny');
		expect(typeof bareWaitLoopRule.matchRaw).toBe('function');
		expect(bareWaitLoopRule.matchSegment).toBeUndefined();
	});

	test('applies to every caller, because a turn costs the same whoever holds it', () => {
		expect(bareWaitLoopRule.appliesTo).toBeUndefined();
	});

	test('names the loop skill in the reason, so a recurring check is scheduled and not counted out', () => {
		expect(bareWaitLoopRule.reason('while true; do sleep 5; done')).toMatch(/\/loop/);
	});

	test('says the loop can never end early, so the reader knows which property refused it', () => {
		expect(bareWaitLoopRule.reason('while true; do sleep 5; done')).toMatch(/end early/i);
	});

	test('names the foreground sentinel form, which is the answer where this call starts the work', () => {
		expect(bareWaitLoopRule.reason('while true; do sleep 5; done')).toMatch(/\) &/);
		expect(bareWaitLoopRule.reason('while true; do sleep 5; done')).toMatch(/echo \$\? > \S+\.rc/);
	});

	test('names the default transient directory in the sentinel form', () => {
		expect(bareWaitLoopRule.reason('while true; do sleep 5; done')).toMatch(/> \/tmp\/claude-transient\/x\.rc/);
	});

	test('names the configured transient directory in the sentinel form when the variable is set', () => {
		process.env.CLAUDE_TRANSIENT_DIR = '/var/tmp/ct';
		const reason = bareWaitLoopRule.reason('while true; do sleep 5; done');
		expect(reason).toMatch(/> \/var\/tmp\/ct\/x\.rc/);
		expect(reason).not.toMatch(/claude-transient/);
	});

	test.each([
		'for i in $(seq 1 600); do sleep 1; done',
		'for i in $(seq 1 60); do sleep 2; done',
		'for i in $(seq 600); do sleep 1; done',
		'for i in $(seq 1 40); do sleep 1; done',
		'for i in $(seq 1 60); do sleep 30; done'
	])('matches %s, which sleeps past the ceiling and can never end early', (command) => {
		expect(bareWaitLoopRule.matchRaw(command)).toBe(true);
	});

	test('matches a loop that counts nothing, because it waits without bound', () => {
		expect(bareWaitLoopRule.matchRaw('while true; do sleep 5; done')).toBe(true);
	});

	test('matches a bare wait loop that hides in front of the command that reads the answer', () => {
		expect(bareWaitLoopRule.matchRaw('for i in $(seq 1 600); do sleep 1; done; tail -5 /tmp/claude-transient/build.log')).toBe(true);
	});

	test('does not match the wait loop of the contributor guide, which breaks on a sentinel', () => {
		expect(bareWaitLoopRule.matchRaw('for i in $(seq 1 570); do [[ -f /tmp/claude-transient/deploy.rc ]] && break; sleep 1; done')).toBe(false);
	});

	test.each([
		'until [[ -f /tmp/claude-transient/deploy.rc ]]; do sleep 1; done',
		'while [[ ! -f /tmp/claude-transient/deploy.rc ]]; do sleep 1; done'
	])('does not match %s, which ends on what it tests and not on a count', (command) => {
		expect(bareWaitLoopRule.matchRaw(command)).toBe(false);
	});

	test('does not match a counted loop whose whole wait stays under the ceiling', () => {
		expect(bareWaitLoopRule.matchRaw('for i in $(seq 1 10); do sleep 1; done')).toBe(false);
	});

	test('does not match a counted loop that sleeps nowhere', () => {
		expect(bareWaitLoopRule.matchRaw('for i in $(seq 1 600); do stat /tmp/claude-transient/build.log; done')).toBe(false);
	});

	test('does not match a command that holds no loop at all', () => {
		expect(bareWaitLoopRule.matchRaw('sleep 1')).toBe(false);
	});

	test('does not match a counted loop whose iteration count no reader can state', () => {
		expect(bareWaitLoopRule.matchRaw('for f in one two three; do sleep 20; done')).toBe(false);
	});

	test('does not match a loop whose total wait is exactly the ceiling', () => {
		expect(bareWaitLoopRule.matchRaw('for i in $(seq 1 30); do sleep 1; done')).toBe(false);
	});
});
