import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { afterAll, describe, expect, test } from '@jest/globals';

const ENTRY = join(import.meta.dirname, '..', '..', 'bin', 'generate-workflow.js'),
	RECORD_ENTRY = join(import.meta.dirname, '..', '..', 'bin', 'record-progress.js'),
	DEFAULT_TRANSIENT = join('/tmp', 'claude-transient'),
	TRANSIENT = join(mkdtempSync(join(tmpdir(), 'generate-workflow-transient-')), 'nested'),
	ENV = { ...process.env, CLAUDE_TRANSIENT_DIR: TRANSIENT },
	AT = '2026-09-03T10:09:41.000Z',
	DIRECTORY = mkdtempSync(join(tmpdir(), 'generate-workflow-bin-')),
	stepTextFor = ({ step, path }) => [
		`#### Step ${step}: a step of the plan`,
		'',
		'**Files to create**: `none`',
		'',
		'**Files to modify**:',
		'',
		`1. \`${path}\``,
		'',
		'**Files to delete**: `none`',
		''
	].join('\n'),
	stepTextOf = (step) => stepTextFor({ step, path: `src/step-${step}.js` }),
	sidecarPathOf = (planPath) => `${planPath.slice(0, -'.md'.length)}.plan.json`,
	artefactPathOf = (planPath) => `${planPath.slice(0, -'.md'.length)}.progress.jsonl`,
	scriptPathOf = (planPath) => join(DIRECTORY, `${basename(planPath, '.md')}.workflow.mjs`),
	groupsPathOf = (planPath) => join(DIRECTORY, `${basename(planPath, '.md')}.groups.json`),
	groupsOf = (planPath) => JSON.parse(readFileSync(groupsPathOf(planPath), 'utf8')),
	artefactOf = ({ run, group, done }) => [
		{ at: AT, run, agentType: 'orchestrator', event: { kind: 'runStarted', plan: 'a-plan.md', groups: [group] } },
		...done.map((step) => ({
			at: AT, run, key: `worker-${step}`, agent: `w${step}`, agentType: 'workflow-worker', step,
			event: { kind: 'step', status: 'done', summary: 'It landed.', filesWritten: [] }
		})),
		{
			at: AT, run, key: `gate-${group.name}`, agent: 'g1', agentType: 'workflow-gate', group: group.name,
			event: { kind: 'gate', green: true, needsRework: [], blocked: '', summary: 'The tree is green.' }
		}
	].map((line) => `${JSON.stringify(line)}\n`).join(''),
	writtenAt = ({ name, text }) => {
		const path = join(DIRECTORY, `${name}.md`);

		writeFileSync(path, text);
		return path;
	},
	planAt = ({ name, steps, held, tail = '', artefact }) => {
		const path = writtenAt({ name, text: ['## Implementation Plan', '', ...steps.map(stepTextOf), tail].join('\n') });

		writeFileSync(sidecarPathOf(path), JSON.stringify({ groups: [{ name: 'A', steps: held ?? steps }], dependencies: {} }, null, 2));
		if (artefact !== undefined) {
			writeFileSync(artefactPathOf(path), artefact);
		}
		return path;
	},
	runOf = (given) => spawnSync(process.execPath, [ENTRY, ...given], { encoding: 'utf8', env: ENV }),
	writtenPathOf = (given) => runOf(given).stdout.trim(),
	scriptTextOf = (planPath) => readFileSync(writtenPathOf([planPath]), 'utf8'),
	generatedNamesOf = (planName) => readdirSync(DIRECTORY)
		.filter((one) => one === `${planName}.workflow.mjs` || one === `${planName}.groups.json`),
	polledAt = ({ planPath, directory }) => {
		mkdirSync(directory, { recursive: true });
		writeFileSync(join(directory, 'journal.jsonl'), '');
		return spawnSync(process.execPath, [RECORD_ENTRY, planPath, directory], { encoding: 'utf8', env: ENV });
	},
	firstEventOf = (planPath) => {
		const first = readFileSync(artefactPathOf(planPath), 'utf8').split('\n').find((one) => one !== '') ?? '{}';

		return (JSON.parse(first)).event ?? {};
	},
	GREEN_NAME = `green-${randomUUID()}`,
	GREEN = planAt({ name: GREEN_NAME, steps: ['1.1', '1.2'] }),
	RECORDED_NAME = `recorded-${randomUUID()}`,
	RECORDED = planAt({
		name: RECORDED_NAME,
		steps: ['1.1', '1.2'],
		artefact: artefactOf({ run: 'wf_first', group: { name: 'A', steps: ['1.1', '1.2'] }, done: ['1.1'] })
	}),
	AGREED_NAME = `agreed-${randomUUID()}`,
	AGREED = planAt({ name: AGREED_NAME, steps: ['1.1', '1.2'] }),
	FAULT_NAME = `fault-${randomUUID()}`,
	FAULT = planAt({ name: FAULT_NAME, steps: ['1.1'], held: ['1.1', '1.2'] }),
	NO_SIDECAR_NAME = `no-sidecar-${randomUUID()}`,
	NO_SIDECAR = writtenAt({ name: NO_SIDECAR_NAME, text: ['## Implementation Plan', '', stepTextOf('1.1')].join('\n') }),
	ABSENT = join(DIRECTORY, 'absent.md');

afterAll(() => {
	rmSync(DIRECTORY, { recursive: true, force: true });
	rmSync(join(TRANSIENT, '..'), { recursive: true, force: true });
});

describe('node .claude/workflow/bin/generate-workflow.js, run directly with the plan path', () => {
	describe('a plan that states no fault', () => {
		test('exits zero', () => {
			expect(runOf([GREEN]).status).toEqual(0);
		});

		test('prints the path of the script beside the plan and writes nothing to the error stream', () => {
			const answer = runOf([GREEN]);

			expect(answer.stdout).toEqual(`${scriptPathOf(GREEN)}\n`);
			expect(answer.stderr).toEqual('');
		});

		test('writes the script and the groups file beside the plan, under the base name of the plan', () => {
			writtenPathOf([GREEN]);

			expect(generatedNamesOf(GREEN_NAME).toSorted())
				.toEqual([`${GREEN_NAME}.groups.json`, `${GREEN_NAME}.workflow.mjs`]);
		});

		test('creates nothing in the directory CLAUDE_TRANSIENT_DIR names', () => {
			writtenPathOf([GREEN]);

			expect(existsSync(TRANSIENT)).toEqual(false);
		});

		test('writes nothing into the default transient directory', () => {
			writtenPathOf([GREEN]);

			expect(existsSync(join(DEFAULT_TRANSIENT, `${GREEN_NAME}.mjs`))).toEqual(false);
			expect(existsSync(join(DEFAULT_TRANSIENT, `${GREEN_NAME}.workflow.mjs`))).toEqual(false);
			expect(existsSync(join(DEFAULT_TRANSIENT, `${GREEN_NAME}.groups.json`))).toEqual(false);
		});

		test('names a script file that holds the meta literal of the plan', () => {
			const path = writtenPathOf([GREEN]);

			expect(readFileSync(path, 'utf8').startsWith('export const meta = {')).toEqual(true);
		});

		test('answers the same bytes when it reads one plan twice', () => {
			const first = readFileSync(writtenPathOf([GREEN]), 'utf8');

			expect(readFileSync(writtenPathOf([GREEN]), 'utf8')).toEqual(first);
		});

		test('names every step of the plan in the script it wrote', () => {
			const text = readFileSync(writtenPathOf([GREEN]), 'utf8');

			expect(text).toContain('"step": "1.1"');
			expect(text).toContain('"step": "1.2"');
		});
	});

	describe('a plan with no progress artefact', () => {
		test('answers a fresh run, which states no restart', () => {
			expect(scriptTextOf(GREEN)).toContain('const RESTART = false;');
		});

		test('answers a run with no leading gate', () => {
			expect(scriptTextOf(GREEN)).not.toContain('"title": "Leading gate"');
		});

		test('leaves out no step', () => {
			expect(scriptTextOf(GREEN)).toContain('const LEFT_OUT = [];');
		});

		test('writes the groups file beside the script, with each group of the run and the steps of it', () => {
			writtenPathOf([GREEN]);

			expect(groupsOf(GREEN)).toEqual([{ name: 'A', steps: ['1.1', '1.2'] }]);
		});
	});

	describe('a plan whose artefact records one step complete', () => {
		test('answers a restart', () => {
			expect(scriptTextOf(RECORDED)).toContain('const RESTART = true;');
		});

		test('answers a run with a leading gate', () => {
			expect(scriptTextOf(RECORDED)).toContain('"title": "Leading gate"');
		});

		test('names the step it left out, with the reason the record gives', () => {
			expect(scriptTextOf(RECORDED)).toContain('"reason": "recordedDone"');
		});

		test('carries the body of no step the artefact records complete', () => {
			expect(scriptTextOf(RECORDED)).not.toContain('src/step-1.1.js');
		});

		test('carries the body of the step the artefact does not record complete', () => {
			expect(scriptTextOf(RECORDED)).toContain('src/step-1.2.js');
		});

		test('writes the groups file with the steps the run sends alone', () => {
			writtenPathOf([RECORDED]);

			expect(groupsOf(RECORDED)).toEqual([{ name: 'A', steps: ['1.2'] }]);
		});
	});

	describe('the groups file the generator writes, given to bin/record-progress.js', () => {
		test('states the shape that entry reads, so the runStarted line holds the groups the generator computed', () => {
			writtenPathOf([AGREED]);

			const answer = polledAt({ planPath: AGREED, directory: join(DIRECTORY, `wf_${randomUUID()}`) });

			expect(answer.stderr).toEqual('');
			expect(firstEventOf(AGREED).groups).toEqual(groupsOf(AGREED));
		});
	});

	describe('a plan that states one fault', () => {
		test('exits non-zero', () => {
			expect(runOf([FAULT]).status).toEqual(1);
		});

		test('names the plan path, the step and the fault on the error stream', () => {
			expect(runOf([FAULT]).stderr).toEqual(
				`${FAULT} step 1.2: a group of the execution block holds this step, and the prose states no step heading for it\n`
			);
		});

		test('writes no script and no path to the output stream', () => {
			const answer = runOf([FAULT]);

			expect(answer.stdout).toEqual('');
			expect(generatedNamesOf(FAULT_NAME)).toEqual([]);
		});
	});

	describe('a plan whose sidecar is absent', () => {
		test('names the plan path and the sidecar path it looked for, as text and no stack trace', () => {
			const answer = runOf([NO_SIDECAR]);

			expect(answer.stderr).toEqual(`${NO_SIDECAR}: ${sidecarPathOf(NO_SIDECAR)} is absent, and a run has no shape\n`);
			expect(answer.stderr).not.toContain('at ');
		});

		test('exits non-zero', () => {
			expect(runOf([NO_SIDECAR]).status).toEqual(1);
		});

		test('writes no script and no path to the output stream', () => {
			const answer = runOf([NO_SIDECAR]);

			expect(answer.stdout).toEqual('');
			expect(generatedNamesOf(NO_SIDECAR_NAME)).toEqual([]);
		});
	});

	describe('a plan the reader refuses', () => {
		test('names the plan path as text and no stack trace when the file is absent', () => {
			const answer = runOf([ABSENT]);

			expect(answer.stderr).toContain(ABSENT);
			expect(answer.stderr).not.toContain('at ');
		});

		test('exits non-zero when the file is absent', () => {
			expect(runOf([ABSENT]).status).toEqual(1);
		});
	});

	describe('a run that names no plan', () => {
		test('exits non-zero', () => {
			expect(runOf([]).status).toEqual(1);
		});

		test('asks for the plan path on the error stream', () => {
			expect(runOf([]).stderr).toContain('name the plan to convert');
		});

		test('names the entry and a plan under plans/ as the example', () => {
			expect(runOf([]).stderr).toContain('node .claude/workflow/bin/generate-workflow.js plans/');
		});

		test('writes no script', () => {
			runOf([]);

			expect(readdirSync(DIRECTORY).filter((one) => one.endsWith('.workflow.mjs') && one.startsWith('undefined'))).toEqual([]);
			expect(existsSync(TRANSIENT)).toEqual(false);
		});
	});
});
