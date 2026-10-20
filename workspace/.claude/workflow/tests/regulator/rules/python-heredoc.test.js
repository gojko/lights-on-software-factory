import { afterEach, beforeEach, describe, test, expect } from '@jest/globals';
import { pythonHeredocRule } from '../../../src/regulator/rules/python-heredoc.js';

describe('pythonHeredocRule', () => {
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

	test('denies, and reads the whole command, because the parser drops the heredoc body from the segment', () => {
		expect(pythonHeredocRule.decision).toBe('deny');
		expect(typeof pythonHeredocRule.matchRaw).toBe('function');
		expect(pythonHeredocRule.matchSegment).toBeUndefined();
	});

	test('names the Edit and Write tools, which are the way to edit a file', () => {
		expect(pythonHeredocRule.reason('python3 - <<EOF\nprint(1)\nEOF')).toMatch(/Edit or Write tool/);
	});

	test('names the default transient directory as the place for a real script', () => {
		expect(pythonHeredocRule.reason('python3 - <<EOF\nprint(1)\nEOF')).toMatch(/python3 \/tmp\/claude-transient\/<name>\.py/);
	});

	test('names the configured transient directory when the variable is set', () => {
		process.env.CLAUDE_TRANSIENT_DIR = '/var/tmp/ct';
		const reason = pythonHeredocRule.reason('python3 - <<EOF\nprint(1)\nEOF');
		expect(reason).toMatch(/python3 \/var\/tmp\/ct\/<name>\.py/);
		expect(reason).not.toMatch(/claude-transient/);
	});

	test.each([
		"python3 - <<'EOF'\nopen('a','w').write('x')\nEOF",
		'python <<EOF\nprint(1)\nEOF',
		'python3.12 - <<EOF\nprint(1)\nEOF',
		'/usr/bin/python3 - <<EOF\nprint(1)\nEOF',
		'FOO=1 python3 - <<EOF\nprint(1)\nEOF',
		'env python3 - <<EOF\nprint(1)\nEOF',
		'cat <<EOF | python3\nprint(1)\nEOF',
		'cd src && python3 - <<EOF\nprint(1)\nEOF',
		'ls; python3 - <<EOF\nprint(1)\nEOF'
	])('matches %s, which feeds python its script from a heredoc', (command) => {
		expect(pythonHeredocRule.matchRaw(command)).toBe(true);
	});

	test.each([
		'python3 script.py',
		'python3 /tmp/claude-transient/edit.py',
		'cat <<EOF > notes.md\nrun python3 here\nEOF',
		'grep python <<EOF\npython\nEOF',
		'echo python3',
		'mypython3 - <<EOF\nprint(1)\nEOF'
	])('does not match %s, which runs no python from a heredoc', (command) => {
		expect(pythonHeredocRule.matchRaw(command)).toBe(false);
	});
});
