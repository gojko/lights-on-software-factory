import { describe, test, expect } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BIN = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'debug.js');

describe('debug.js bin entry', () => {
	test('exits non-zero and prints a usage line that names the agent flag when neither argv nor stdin supplies a command', () => {
		const result = spawnSync('node', [BIN], { encoding: 'utf8', input: '' });
		expect(result.status).not.toBe(0);
		expect(result.stderr).toMatch(/usage:/i);
		expect(result.stderr).toMatch(/--agent <agent-type>/);
		expect(result.stderr).not.toMatch(/--sibling/);
	});

	test('reads command from stdin when no argv is provided', () => {
		const result = spawnSync('node', [BIN], { input: 'ls /tmp', encoding: 'utf8' });
		expect(result.status).toBe(0);
		expect(result.stdout).toMatch(/merged decision: allow/);
	});

	test('traces the command and not the flag that named the role', () => {
		const result = spawnSync('node', [BIN, '--agent', 'workflow-worker', 'ls', '/tmp'], { encoding: 'utf8' });
		expect(result.status).toBe(0);
		expect(result.stdout).toMatch(/command: ls \/tmp/);
		expect(result.stdout).toMatch(/role: workflow-worker/);
		expect(result.stdout).toMatch(/merged decision: allow/);
	});
});
