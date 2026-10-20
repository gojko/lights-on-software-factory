import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from '@jest/globals';

const ENTRY = join(import.meta.dirname, '..', '..', 'bin', 'show-progress.js'),
	ROOT = mkdtempSync(join(tmpdir(), 'show-progress-bin-')),
	RUN = 'wf_a8009725-679',
	SIDECAR = {
		groups: [{ name: 'A', steps: ['1.1'] }, { name: 'B', steps: ['2.1'] }],
		dependencies: {}
	},
	PLAN_LINES = [
		'# A plan',
		'',
		'## Implementation Plan',
		'',
		'### Step 1.1: The region answers its item count',
		'',
		'**Goal**: the port answers one count for each region.',
		'',
		'---',
		'',
		'### Step 2.1: The reply carries the region count',
		'',
		'**Goal**: the reply states the count.',
		''
	],
	RECORD = [
		{
			at: '2026-09-03T10:02:04Z',
			run: RUN,
			agentType: 'orchestrator',
			event: { kind: 'runStarted', plan: 'a-plan.md', groups: SIDECAR.groups }
		},
		{
			at: '2026-09-03T10:09:41Z',
			run: RUN,
			key: 'v2:89a3',
			agent: 'ab46',
			agentType: 'workflow-worker',
			step: '1.1',
			event: {
				kind: 'step',
				status: 'done',
				summary: 'The port answers one count for each region.',
				filesWritten: ['src/model/region-counts.js']
			}
		},
		{
			at: '2026-09-03T10:16:52Z',
			run: RUN,
			key: 'v2:3519',
			agent: 'aeb0',
			agentType: 'workflow-gate',
			group: 'A',
			event: { kind: 'gate', green: true, needsRework: [], blocked: 'none', summary: 'The tree is green.' }
		}
	],
	placeOf = (name) => ({
		planPath: join(ROOT, name, 'a-plan.md'),
		sidecarPath: join(ROOT, name, 'a-plan.plan.json'),
		artefactPath: join(ROOT, name, 'a-plan.progress.jsonl'),
		outPath: join(ROOT, name, 'status.txt')
	}),
	placedAt = ({ name, plan = true, sidecar = true, artefact = true }) => {
		const place = placeOf(name);

		mkdirSync(join(ROOT, name), { recursive: true });
		if (plan) {
			writeFileSync(place.planPath, PLAN_LINES.join('\n'));
		}
		if (sidecar) {
			writeFileSync(place.sidecarPath, JSON.stringify(SIDECAR));
		}
		if (artefact) {
			writeFileSync(place.artefactPath, `${RECORD.map((line) => JSON.stringify(line)).join('\n')}\n`);
		}
		return place;
	},
	shownAt = ({ place, args = [] }) =>
		spawnSync(process.execPath, [ENTRY, place.planPath, ...args], { encoding: 'utf8' });

afterAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
});

describe('node .claude/workflow/bin/show-progress.js, run with the plan', () => {
	describe('a plan whose artefact records one landed step', () => {
		const shown = () => {
			const place = placedAt({ name: 'landed' });

			return { place, answer: shownAt({ place }) };
		};

		test('states the plan, the count of the complete steps and the count of every step', () => {
			expect(shown().answer.stdout.split('\n')[0]).toEqual(`${placeOf('landed').planPath} — 1 of 2 steps complete`);
		});

		test('names each step by the title the plan states for its number', () => {
			expect(shown().answer.stdout).toContain('### Step 1.1 — The region answers its item count (2026-09-03)');
		});

		test('groups the steps as the sidecar beside the plan states them', () => {
			const { stdout } = shown().answer;

			expect(stdout).toContain('Group A');
			expect(stdout).toContain('Group B');
		});

		test('names the steps the next run sends', () => {
			expect(shown().answer.stdout).toContain('The next run sends: 2.1');
		});

		test('exits zero', () => {
			expect(shown().answer.status).toEqual(0);
		});

		test('writes no file where no --out names one', () => {
			expect(existsSync(shown().place.outPath)).toEqual(false);
		});
	});

	describe('a report the caller asks for as a file', () => {
		const written = () => {
			const place = placedAt({ name: 'written' });

			return { place, answer: shownAt({ place, args: ['--out', place.outPath] }) };
		};

		test('writes the file the --out path names', () => {
			expect(existsSync(written().place.outPath)).toEqual(true);
		});

		test('writes the text it printed', () => {
			const answered = written();

			expect(readFileSync(answered.place.outPath, 'utf8')).toEqual(answered.answer.stdout);
		});

		test('exits zero', () => {
			expect(written().answer.status).toEqual(0);
		});

		test('refuses an --out that names no path', () => {
			const place = placedAt({ name: 'out-alone' }),
				answer = shownAt({ place, args: ['--out'] });

			expect(answer.stderr).toContain('--out');
			expect(answer.status).toEqual(1);
		});
	});

	describe('a plan that no run has recorded', () => {
		const fresh = () => shownAt({ place: placedAt({ name: 'fresh', artefact: false }) });

		test('counts no step as complete', () => {
			expect(fresh().stdout).toContain('— 0 of 2 steps complete');
		});

		test('sends every step to the next run', () => {
			expect(fresh().stdout).toContain('The next run sends: 1.1, 2.1');
		});

		test('exits zero, because a plan that has not run is no fault', () => {
			expect(fresh().status).toEqual(0);
		});
	});

	describe('a plan the entry cannot read', () => {
		test('names the plan as text and no stack trace, and exits non-zero', () => {
			const answer = shownAt({ place: placedAt({ name: 'no-plan', plan: false }) });

			expect(answer.stderr).toContain('a-plan.md');
			expect(answer.stderr).not.toContain('at ');
			expect(answer.status).toEqual(1);
		});
	});

	describe('a plan with no sidecar', () => {
		const absent = () => shownAt({ place: placedAt({ name: 'no-sidecar', sidecar: false }) });

		test('names the sidecar path it looked for', () => {
			expect(absent().stderr).toContain(placeOf('no-sidecar').sidecarPath);
		});

		test('states that a run has no shape, and exits non-zero', () => {
			expect(absent().stderr).toContain('a run has no shape');
			expect(absent().status).toEqual(1);
		});
	});

	describe('a call that names no plan', () => {
		test('names the entry and a plan under plans/ as the example', () => {
			expect(spawnSync(process.execPath, [ENTRY], { encoding: 'utf8' }).stderr).toContain('node .claude/workflow/bin/show-progress.js plans/');
		});

		test('asks for the plan on the error stream', () => {
			expect(spawnSync(process.execPath, [ENTRY], { encoding: 'utf8' }).stderr).toContain('name the plan');
		});

		test('exits non-zero', () => {
			expect(spawnSync(process.execPath, [ENTRY], { encoding: 'utf8' }).status).toEqual(1);
		});
	});
});
