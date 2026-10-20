import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from '@jest/globals';

const ENTRY = join(import.meta.dirname, '..', '..', 'bin', 'record-progress.js'),
	ROOT = mkdtempSync(join(tmpdir(), 'record-progress-bin-')),
	TRANSIENT_DIRECTORY = join(ROOT, 'transient'),
	ENV = { ...process.env, CLAUDE_TRANSIENT_DIR: TRANSIENT_DIRECTORY },
	runOf = (given) => spawnSync(process.execPath, [ENTRY, ...given], { encoding: 'utf8', env: ENV }),
	runAt = (name) => {
		const directory = join(ROOT, `wf_${name}`);

		mkdirSync(directory, { recursive: true });
		writeFileSync(join(directory, 'journal.jsonl'), '');
		return { planPath: join(ROOT, `${name}.md`), directory };
	};

afterAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
});

describe('node .claude/workflow/bin/record-progress.js, run as a process', () => {
	test('writes the status to the output stream and exits zero for a run with nothing live', () => {
		const { planPath, directory } = runAt('quiet');

		writeFileSync(join(ROOT, 'quiet.groups.json'), JSON.stringify([{ name: 'A', steps: ['1.1'] }]));
		const answer = runOf([planPath, directory]);

		expect(answer.status).toEqual(0);
		expect(answer.stdout).toContain('no agent is live');
		expect(answer.stderr).toEqual('');
	});

	test('does not read the groups file from the directory CLAUDE_TRANSIENT_DIR names', () => {
		const { planPath, directory } = runAt('transient-only');

		mkdirSync(TRANSIENT_DIRECTORY, { recursive: true });
		writeFileSync(join(TRANSIENT_DIRECTORY, 'transient-only.groups.json'), JSON.stringify([{ name: 'Z', steps: ['9.1'] }]));
		const answer = runOf([planPath, directory]);

		expect(answer.status).toEqual(1);
		expect(answer.stderr).toContain(`${join(ROOT, 'transient-only.groups.json')} is absent`);
	});

	test('writes the usage line to the error stream and exits one when it is given too little', () => {
		const answer = runOf([]);

		expect(answer.status).toEqual(1);
		expect(answer.stdout).toEqual('');
		expect(answer.stderr).toContain('node .claude/workflow/bin/record-progress.js plans/');
	});
});
