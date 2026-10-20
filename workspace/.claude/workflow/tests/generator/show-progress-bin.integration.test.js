import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from '@jest/globals';

const ENTRY = join(import.meta.dirname, '..', '..', 'bin', 'show-progress.js'),
	DIRECTORY = mkdtempSync(join(tmpdir(), 'show-progress-bin-')),
	PLAN = join(DIRECTORY, 'a-plan.md'),
	runOf = (given) => spawnSync(process.execPath, [ENTRY, ...given], { encoding: 'utf8' });

writeFileSync(PLAN, ['## Implementation Plan', '', '### Step 1.1: The region answers its item count', ''].join('\n'));
writeFileSync(join(DIRECTORY, 'a-plan.plan.json'), JSON.stringify({ groups: [{ name: 'A', steps: ['1.1'] }], dependencies: {} }));

describe('node .claude/workflow/bin/show-progress.js, run as a process', () => {
	test('writes the report to the output stream and exits zero', () => {
		const answer = runOf([PLAN]);

		expect(answer.status).toEqual(0);
		expect(answer.stdout.split('\n')[0]).toEqual(`${PLAN} — 0 of 1 steps complete`);
		expect(answer.stderr).toEqual('');
	});

	test('writes the usage line to the error stream and exits one when it is given no plan', () => {
		const answer = runOf([]);

		expect(answer.status).toEqual(1);
		expect(answer.stdout).toEqual('');
		expect(answer.stderr).toContain('node .claude/workflow/bin/show-progress.js plans/');
	});
});
