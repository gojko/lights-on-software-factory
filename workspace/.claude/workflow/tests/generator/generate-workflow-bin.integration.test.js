import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from '@jest/globals';

const ENTRY = join(import.meta.dirname, '..', '..', 'bin', 'generate-workflow.js'),
	RECORD_ENTRY = join(import.meta.dirname, '..', '..', 'bin', 'record-progress.js'),
	TRANSIENT = join(mkdtempSync(join(tmpdir(), 'generate-workflow-transient-')), 'nested'),
	ENV = { ...process.env, CLAUDE_TRANSIENT_DIR: TRANSIENT },
	DIRECTORY = mkdtempSync(join(tmpdir(), 'generate-workflow-bin-')),
	PLAN = join(DIRECTORY, 'a-plan.md'),
	runOf = ({ entry, given }) => spawnSync(process.execPath, [entry, ...given], { encoding: 'utf8', env: ENV }),
	firstEventOf = (planPath) => {
		const first = readFileSync(planPath.replace(/\.md$/u, '.progress.jsonl'), 'utf8').split('\n').find((one) => one !== '') ?? '{}';

		return (JSON.parse(first)).event ?? {};
	};

writeFileSync(PLAN, [
	'## Implementation Plan',
	'',
	...['1.1', '1.2'].flatMap((step) => [
		`#### Step ${step}: a step of the plan`,
		'',
		'**Files to create**: `none`',
		'',
		'**Files to modify**:',
		'',
		`1. \`src/step-${step}.js\``,
		'',
		'**Files to delete**: `none`',
		''
	])
].join('\n'));
writeFileSync(join(DIRECTORY, 'a-plan.plan.json'), JSON.stringify({ groups: [{ name: 'A', steps: ['1.1', '1.2'] }], dependencies: {} }));

afterAll(() => {
	rmSync(DIRECTORY, { recursive: true, force: true });
	rmSync(join(TRANSIENT, '..'), { recursive: true, force: true });
});

describe('node .claude/workflow/bin/generate-workflow.js, run as a process', () => {
	test('writes the script path to the output stream, exits zero and creates nothing in the directory CLAUDE_TRANSIENT_DIR names', () => {
		const answer = runOf({ entry: ENTRY, given: [PLAN] });

		expect(answer).toEqual(expect.objectContaining({ status: 0, stdout: `${join(DIRECTORY, 'a-plan.workflow.mjs')}\n`, stderr: '' }));
		expect(existsSync(TRANSIENT)).toEqual(false);
	});

	test('writes the usage line to the error stream and exits one when it is given no plan', () => {
		const answer = runOf({ entry: ENTRY, given: [] });

		expect(answer.status).toEqual(1);
		expect(answer.stdout).toEqual('');
		expect(answer.stderr).toContain('node .claude/workflow/bin/generate-workflow.js plans/');
	});

	test('writes a groups file that bin/record-progress.js reads, so the runStarted line holds the groups the generator computed', () => {
		const directory = join(DIRECTORY, 'wf_agreed');

		runOf({ entry: ENTRY, given: [PLAN] });
		mkdirSync(directory, { recursive: true });
		writeFileSync(join(directory, 'journal.jsonl'), '');

		expect(runOf({ entry: RECORD_ENTRY, given: [PLAN, directory] }).stderr).toEqual('');
		expect(firstEventOf(PLAN).groups).toEqual(JSON.parse(readFileSync(join(DIRECTORY, 'a-plan.groups.json'), 'utf8')));
	});
});
