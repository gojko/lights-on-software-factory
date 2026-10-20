import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from '@jest/globals';

const ENTRY = join(import.meta.dirname, '..', '..', 'bin', 'measure-run.js'),
	runAt = (given) => spawnSync(process.execPath, [ENTRY, ...given], { encoding: 'utf8' });

describe('node .claude/workflow/bin/measure-run.js, run as a process', () => {
	test('writes the timing of each agent to the output stream and exits zero', () => {
		const root = mkdtempSync(join(tmpdir(), 'measure-run-bin-'));

		writeFileSync(join(root, 'agent-a1.jsonl'), `${JSON.stringify({ timestamp: '2026-09-03T20:00:00.000Z', type: 'assistant' })}\n`);
		const answer = runAt([root]);

		expect(answer.status).toEqual(0);
		expect(answer.stdout).toContain('a1');
		expect(answer.stderr).toEqual('');
	});

	test('writes the usage line to the error stream and exits one when it is given no directory', () => {
		const answer = runAt([]);

		expect(answer.status).toEqual(1);
		expect(answer.stdout).toEqual('');
		expect(answer.stderr).toContain('measure-run: name the transcript directory');
	});
});
