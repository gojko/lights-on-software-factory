import { describe, test, expect } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BIN = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'regulate.js');
const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const runBin = (stdinPayload, args = []) => {
	const result = spawnSync('node', [BIN, ...args], { input: stdinPayload, encoding: 'utf8' });
	return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
};

const bashEvent = (command, permissionMode = 'default') =>
	JSON.stringify({ tool_name: 'Bash', permission_mode: permissionMode, tool_input: { command } });

describe('regulate.js bin entry', () => {
	test('writes the decision as hook JSON on stdout and exits 0', () => {
		const result = runBin(bashEvent('sudo rm -rf /'));
		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.stdout).hookSpecificOutput).toEqual(
			expect.objectContaining({ hookEventName: 'PreToolUse', permissionDecision: 'deny' })
		);
	});

	test('exits 0 with empty stdout when no rule matches', () => {
		const result = runBin(bashEvent('totally-unknown-binary --arg'));
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe('');
	});

	test('exits with code 2 and writes stderr when permission_mode is bypassPermissions', () => {
		const result = runBin(bashEvent('ls', 'bypassPermissions'));
		expect(result.exitCode).toBe(2);
		expect(result.stderr).toMatch(/bypassPermissions mode is not allowed/);
		expect(result.stdout).toBe('');
	});

	test('exits non-zero (not 2) with stderr message when stdin is not valid JSON', () => {
		const result = runBin('not-json');
		expect(result.exitCode).not.toBe(0);
		expect(result.exitCode).not.toBe(2);
		expect(result.stderr).toMatch(/invalid JSON on stdin/);
		expect(result.stdout).toBe('');
	});

	test('exits non-zero (not 2) with stderr message when an internal error is thrown', () => {
		const result = runBin(JSON.stringify({ tool_name: 'Bash', permission_mode: 'default', tool_input: {} }));
		expect(result.exitCode).not.toBe(0);
		expect(result.exitCode).not.toBe(2);
		expect(result.stderr).toMatch(/^claude-bash-regulator: /);
		expect(result.stdout).toBe('');
	});

	test('decides with the rules of the entry point given as the first argument', () => {
		const result = runBin(bashEvent('hello world'), [resolve(FIXTURES, 'custom-rules.js')]);
		expect(result.exitCode).toBe(0);
		expect(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision).toBe('allow');
	});

	test('does not apply the default rules when an entry point is given', () => {
		const result = runBin(bashEvent('sudo rm -rf /'), [resolve(FIXTURES, 'custom-rules.js')]);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe('');
	});

	test('exits non-zero (not 2) with stderr message when the entry point cannot be loaded', () => {
		const result = runBin(bashEvent('ls'), [resolve(FIXTURES, 'no-rules-export.js')]);
		expect(result.exitCode).not.toBe(0);
		expect(result.exitCode).not.toBe(2);
		expect(result.stderr).toMatch(/^claude-bash-regulator: .*does not export an array as default/);
		expect(result.stdout).toBe('');
	});
});
