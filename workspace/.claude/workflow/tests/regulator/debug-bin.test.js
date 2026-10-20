import { describe, test, expect } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BIN = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'debug.js');

const runWithArg = (command) => {
	const result = spawnSync('node', [BIN, command], { encoding: 'utf8' });
	return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
};

const runWithStdin = (command) => {
	const result = spawnSync('node', [BIN], { input: command, encoding: 'utf8' });
	return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
};

describe('debug.js bin entry', () => {
	test('exits non-zero and prints usage when neither argv nor stdin supplies a command', () => {
		const result = spawnSync('node', [BIN], { encoding: 'utf8', input: '' });
		expect(result.status).not.toBe(0);
		expect(result.stderr).toMatch(/usage:/i);
	});

	test('prints parsed segments, per-rule resolution, and merged decision for an allowed command', () => {
		const { exitCode, stdout } = runWithArg('ls /tmp');
		expect(exitCode).toBe(0);
		expect(stdout).toMatch(/command:.*ls \/tmp/);
		expect(stdout).toMatch(/segment 0/);
		expect(stdout).toMatch(/tokens:.*ls.*\/tmp/);
		expect(stdout).toMatch(/resolved by rule:.*common-allowed-commands/);
		expect(stdout).toMatch(/merged decision: allow/);
	});

	test('prints deny resolution with the rule id and reason', () => {
		const { exitCode, stdout } = runWithArg('sudo make deploy');
		expect(exitCode).toBe(0);
		expect(stdout).toMatch(/resolved by rule:.*sudo/);
		expect(stdout).toMatch(/decision:.*deny/);
		expect(stdout).toMatch(/reason:.*sudo is not allowed/);
		expect(stdout).toMatch(/merged decision: deny/);
	});

	test('prints no-match clearly when no rule resolves the segment', () => {
		const { stdout } = runWithArg('totally-unknown-binary --arg');
		expect(stdout).toMatch(/no rule matched/i);
		expect(stdout).toMatch(/merged decision: no-match/);
	});

	test('prints tooComplex when parser rejects the input', () => {
		const { stdout } = runWithArg('cat <<EOF');
		expect(stdout).toMatch(/tooComplex/i);
		expect(stdout).toMatch(/merged decision: deny/);
	});

	test('names the debug entry by a relative path in the tooComplex reason, so the reason agrees with the hook', () => {
		const { stdout } = runWithArg('cat <<EOF');
		expect(stdout).toMatch(/`node \.claude\/workflow\/bin\/debug\.js`/);
		expect(stdout).not.toMatch(/node \//);
	});

	test('names process substitution in the trace, so the reason agrees with the one the hook answers', () => {
		const { stdout } = runWithArg('comm -3 <(sort a.txt) <(sort b.txt)');
		expect(stdout).toMatch(/merged decision: deny/);
		expect(stdout).toMatch(/process substitution/);
	});

	test('breaks down compound commands into separate segments', () => {
		const { stdout } = runWithArg('cd /tmp && ls');
		expect(stdout).toMatch(/segment 0/);
		expect(stdout).toMatch(/segment 1/);
		expect(stdout).toMatch(/merged decision: allow/);
	});

	test('reads command from stdin when no argv is provided', () => {
		const { exitCode, stdout } = runWithStdin('ls /tmp');
		expect(exitCode).toBe(0);
		expect(stdout).toMatch(/merged decision: allow/);
	});

	test('shows unwrapped tokens distinct from raw tokens for wrapped commands', () => {
		const { stdout } = runWithArg('time npx jest');
		expect(stdout).toMatch(/tokens:.*time.*npx.*jest/);
		expect(stdout).toMatch(/unwrapped:.*npx.*jest/);
		expect(stdout).toMatch(/merged decision: deny/);
	});

	test('shows the retried tokens and names the rule that resolved them for a /usr/bin command', () => {
		const { stdout } = runWithArg('/usr/bin/time make test');
		expect(stdout).toMatch(/system-bin:.*make.*test/);
		expect(stdout).toMatch(/resolved by rule:.*common-allowed-commands/);
		expect(stdout).toMatch(/merged decision: allow/);
	});

	test('does not report a retry when the first attempt resolves', () => {
		const { stdout } = runWithArg('/usr/bin/eslint --fix src');
		expect(stdout).not.toMatch(/system-bin:/);
		expect(stdout).toMatch(/resolved by rule:.*require-from-path/);
		expect(stdout).toMatch(/merged decision: deny/);
	});
});

const runAs = (role, command) => {
	const result = spawnSync('node', [BIN, ...role, ...command.split(' ')], { encoding: 'utf8' });
	return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
};

describe('debug.js states which role it traced', () => {
	test('names the session when no agent is given', () => {
		expect(runAs([], 'make test').stdout).toMatch(/role: the session, with no agent type/);
	});

	test('names the agent type it was given', () => {
		expect(runAs(['--agent', 'workflow-worker'], 'make test').stdout).toMatch(/role: workflow-worker/);
	});

	test('states the rule count of the role it traced', () => {
		expect(runAs(['--agent', 'workflow-worker'], 'make test').stdout).toMatch(/\(\d+ rules\)/);
	});

	test('states the role on the second line, before the parse', () => {
		expect(runAs(['--agent', 'workflow-gate'], 'ls').stdout.split('\n')[1]).toMatch(/^role: workflow-gate \(\d+ rules\)$/);
	});

	test('traces the command and not the flag that named the role', () => {
		const { stdout } = runAs(['--agent', 'workflow-worker'], 'ls /tmp');
		expect(stdout).toMatch(/command: ls \/tmp/);
		expect(stdout).toMatch(/merged decision: allow/);
	});

	test('answers a role differently from the session, which is why the flag exists', () => {
		expect(runAs(['--agent', 'workflow-worker'], 'make test').stdout).toMatch(/merged decision: deny/);
		expect(runAs([], 'make test').stdout).toMatch(/merged decision: allow/);
	});

	test('names the rule of the role that refused the command', () => {
		expect(runAs(['--agent', 'workflow-worker'], 'make test').stdout).toMatch(/resolved by rule: worker-make-verification/);
		expect(runAs(['--agent', 'workflow-gate'], 'make test').stdout).toMatch(/resolved by rule: gate-goal-boundary/);
	});

	test('answers the same decision for every role where no rule states a caller', () => {
		expect(runAs(['--agent', 'workflow-worker'], 'cat package.json').stdout).toMatch(/merged decision: allow/);
		expect(runAs([], 'cat package.json').stdout).toMatch(/merged decision: allow/);
	});

	test('names the agent flag in its usage line', () => {
		const result = spawnSync('node', [BIN], { encoding: 'utf8', input: '' });
		expect(result.stderr).toMatch(/--agent <agent-type>/);
	});

	test('names no sibling flag, which this tree does not carry', () => {
		const result = spawnSync('node', [BIN], { encoding: 'utf8', input: '' });
		expect(result.stderr).not.toMatch(/--sibling/);
	});
});
