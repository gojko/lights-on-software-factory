import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from '@jest/globals';

const ENTRY = join(import.meta.dirname, '..', '..', 'bin', 'validate-plan.js'),
	DIRECTORY = mkdtempSync(join(tmpdir(), 'validate-plan-bin-')),
	stepTextOf = (step) => [
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
	].join('\n'),
	sidecarPathOf = (planPath) => `${planPath.slice(0, -'.md'.length)}.plan.json`,
	writtenAt = ({ name, text }) => {
		const path = join(DIRECTORY, `${name}.md`);

		writeFileSync(path, text);
		return path;
	},
	planAt = ({ name, steps, held, tail = '' }) => {
		const path = writtenAt({ name, text: ['## Implementation Plan', '', ...steps.map(stepTextOf), tail].join('\n') });

		writeFileSync(sidecarPathOf(path), JSON.stringify({ groups: [{ name: 'A', steps: held ?? steps }], dependencies: {} }, null, 2));
		return path;
	},
	runOf = (given) => spawnSync(process.execPath, [ENTRY, ...given], { encoding: 'utf8' }),
	GREEN = planAt({ name: 'green', steps: ['1.1', '1.2'] }),
	STEP_FAULT = planAt({ name: 'step-fault', steps: ['1.1'], held: ['1.1', '1.2'] }),
	PLAN_FAULT = planAt({ name: 'plan-fault', steps: ['1.1'], tail: '**Total: 2 steps**' }),
	NO_SIDECAR = writtenAt({ name: 'no-sidecar', text: ['## Implementation Plan', '', stepTextOf('1.1')].join('\n') }),
	ABSENT = join(DIRECTORY, 'absent.md');

describe('node .claude/workflow/bin/validate-plan.js, run directly with the plan path', () => {
	describe('a plan that states no fault', () => {
		test('exits zero', () => {
			expect(runOf([GREEN]).status).toEqual(0);
		});

		test('states the plan path and that there is no fault, and writes nothing to the error stream', () => {
			const answer = runOf([GREEN]);

			expect(answer.stdout).toEqual(`${GREEN}: no fault\n`);
			expect(answer.stderr).toEqual('');
		});
	});

	describe('a plan that states one fault at a step', () => {
		test('exits non-zero', () => {
			expect(runOf([STEP_FAULT]).status).toEqual(1);
		});

		test('names the plan path, the step and the fault on one line', () => {
			expect(runOf([STEP_FAULT]).stderr).toEqual(
				`${STEP_FAULT} step 1.2: a group of the execution block holds this step, and the prose states no step heading for it\n`
			);
		});

		test('writes no fault to the output stream', () => {
			expect(runOf([STEP_FAULT]).stdout).toEqual('');
		});
	});

	describe('a plan that states one fault of the whole plan', () => {
		test('names the plan path and the fault, and states no step number', () => {
			expect(runOf([PLAN_FAULT]).stderr).toEqual(
				`${PLAN_FAULT}: the plan states 2 steps, and the count of the step headings is 1\n`
			);
		});

		test('exits non-zero', () => {
			expect(runOf([PLAN_FAULT]).status).toEqual(1);
		});
	});

	describe('a plan whose sidecar is absent', () => {
		test('names the plan path and the sidecar path it looked for, on one line of the error stream', () => {
			expect(runOf([NO_SIDECAR]).stderr).toEqual(`${NO_SIDECAR}: ${sidecarPathOf(NO_SIDECAR)} is absent, and a run has no shape\n`);
		});

		test('exits non-zero', () => {
			expect(runOf([NO_SIDECAR]).status).toEqual(1);
		});

		test('writes nothing to the output stream', () => {
			expect(runOf([NO_SIDECAR]).stdout).toEqual('');
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
			expect(runOf([]).stderr).toContain('name the plan to check');
		});

		test('names the entry and a plan under plans/ as the example', () => {
			expect(runOf([]).stderr).toContain('node .claude/workflow/bin/validate-plan.js plans/');
		});
	});
});
