import { describe, expect, test } from '@jest/globals';

import { progressReportOf } from '../../src/generator/progress-report-of.js';

const PLAN = 'plans/a-plan.md',
	FIRST = 'wf_a8009725-679',
	SECOND = 'wf_3881f3a4-c03',
	THIRD = 'wf_9c40b7e2-118',
	GROUPS = [{ name: 'A', steps: ['1.1', '1.2'] }, { name: 'B', steps: ['2.1', '2.2'] }],
	TITLES = {
		'1.1': 'The region answers its item count',
		'1.2': 'The model reads the region counts',
		'2.1': 'The reply carries the region count'
	},
	STEPS = Object.entries(TITLES).map(([step, title], at) =>
		({ step, title, body: '', from: at + 1, to: at + 2 })),
	startedAt = ({ at, run, groups }) =>
		({ at, run, agentType: 'orchestrator', event: { kind: 'runStarted', plan: PLAN, groups } }),
	endedAt = ({ at, run, outcome }) =>
		({ at, run, agentType: 'orchestrator', event: { kind: 'runEnded', outcome } }),
	workerAt = ({ at, run, step, status, summary, filesWritten = [] }) => ({
		at,
		run,
		key: `k${at}`,
		agent: `a${at}`,
		agentType: 'workflow-worker',
		step,
		event: { kind: 'step', status, summary, filesWritten }
	}),
	gateAt = ({ at, run, group, green }) => ({
		at,
		run,
		key: `k${at}`,
		agent: `a${at}`,
		agentType: 'workflow-gate',
		group,
		event: { kind: 'gate', green, needsRework: [], blocked: 'none', summary: 'The merged tree is green.' }
	}),
	claimAt = ({ at, run, step, answer, claim, evidence, repair, inspect }) => ({
		at,
		run,
		key: `k${at}`,
		agent: `a${at}`,
		agentType: 'workflow-check',
		step,
		event: {
			kind: 'claim',
			claim,
			answer,
			evidence,
			...repair === undefined ? {} : { repair },
			...inspect === undefined ? {} : { inspect }
		}
	}),
	faultsAt = ({ at, run, faults }) =>
		({ at, run, key: `k${at}`, agent: `a${at}`, agentType: 'workflow-check', event: { kind: 'planFaults', faults } }),
	FIRST_RUN = [
		startedAt({ at: '2026-09-03T10:02:04Z', run: FIRST, groups: [{ name: 'A', steps: ['1.1', '1.2'] }, { name: 'B', steps: ['2.1'] }] }),
		workerAt({
			at: '2026-09-03T10:09:41Z',
			run: FIRST,
			step: '1.1',
			status: 'done',
			summary: 'regionCounts answers one count for each region.',
			filesWritten: ['src/model/region-counts.js']
		}),
		workerAt({
			at: '2026-09-03T10:11:17Z',
			run: FIRST,
			step: '1.2',
			status: 'doneWithDeviation',
			summary: 'buildModel reads the counts.',
			filesWritten: ['src/model/build-model.js']
		}),
		gateAt({ at: '2026-09-03T10:16:52Z', run: FIRST, group: 'A', green: true }),
		workerAt({
			at: '2026-09-03T10:23:08Z',
			run: FIRST,
			step: '2.1',
			status: 'done',
			summary: 'The reply carries the region count.',
			filesWritten: ['src/api/region-reply.js']
		}),
		gateAt({ at: '2026-09-03T10:31:44Z', run: FIRST, group: 'B', green: true }),
		claimAt({
			at: '2026-09-03T10:38:12Z',
			run: FIRST,
			step: '1.1',
			answer: 'held',
			claim: 'regionCounts answers one count for each region.',
			evidence: '`region-counts.js:18` writes it.'
		}),
		claimAt({
			at: '2026-09-03T10:38:12Z',
			run: FIRST,
			step: '1.2',
			answer: 'held',
			claim: 'buildModel reads the counts.',
			evidence: '`build-model.js:96` calls it.'
		}),
		claimAt({
			at: '2026-09-03T10:38:12Z',
			run: FIRST,
			step: '2.1',
			answer: 'held',
			claim: 'The reply carries the region count.',
			evidence: '`region-reply.js:31` writes the field.'
		}),
		faultsAt({ at: '2026-09-03T10:38:12Z', run: FIRST, faults: [] }),
		endedAt({ at: '2026-09-03T10:38:31Z', run: FIRST, outcome: 'completed' })
	],
	SECOND_RUN = [
		startedAt({ at: '2026-09-03T13:04:11Z', run: SECOND, groups: GROUPS }),
		workerAt({
			at: '2026-09-03T13:12:39Z',
			run: SECOND,
			step: '1.1',
			status: 'done',
			summary: 'The port answers one count for each region.',
			filesWritten: ['src/model/region-counts.js']
		}),
		workerAt({
			at: '2026-09-03T13:14:02Z',
			run: SECOND,
			step: '1.2',
			status: 'done',
			summary: 'buildModel reads the counts.',
			filesWritten: ['src/model/build-model.js']
		}),
		gateAt({ at: '2026-09-03T13:19:55Z', run: SECOND, group: 'A', green: true }),
		workerAt({ at: '2026-09-03T13:27:20Z', run: SECOND, step: '2.1', status: 'notDone', summary: 'Nothing landed.' }),
		endedAt({ at: '2026-09-03T14:02:00Z', run: SECOND, outcome: 'stopped' })
	],
	THIRD_RUN = [
		startedAt({ at: '2026-09-04T08:40:02Z', run: THIRD, groups: [{ name: 'B', steps: ['2.1', '2.2'] }] }),
		gateAt({ at: '2026-09-04T08:41:19Z', run: THIRD, group: 'leading', green: true }),
		workerAt({
			at: '2026-09-04T08:52:36Z',
			run: THIRD,
			step: '2.1',
			status: 'done',
			summary: 'The shape was stated in the step this time. It landed.',
			filesWritten: ['src/api/region-reply.js']
		}),
		claimAt({
			at: '2026-09-04T09:20:41Z',
			run: THIRD,
			step: '1.2',
			answer: 'notHeld',
			repair: 'resendStep',
			claim: 'buildModel reads the counts.',
			evidence: '`build-model.js:96` calls the old port. Nothing calls regionCounts.',
			inspect: '`grep -n regionCounts src/model/build-model.js` answers nothing.'
		}),
		faultsAt({
			at: '2026-09-04T09:20:41Z',
			run: THIRD,
			faults: [
				{ fault: 'Group B holds a step the Implementation Plan states no heading for.', steps: ['2.3'] },
				{ fault: 'The plan states 14 steps and the headings count 15.' }
			]
		})
	],
	WHOLE_RECORD = [...FIRST_RUN, ...SECOND_RUN, ...THIRD_RUN],
	reportOf = (lines, groups = GROUPS) =>
		progressReportOf({ planPath: PLAN, lines, steps: STEPS, groups });

describe('the human-readable report of one progress artefact', () => {
	describe('the record of three runs of one plan', () => {
		test('answers the whole text of the record', () => {
			expect(reportOf(WHOLE_RECORD)).toEqual([
				'plans/a-plan.md — 1 of 4 steps complete',
				'',
				'Group A',
				'### Step 1.1 — The region answers its item count (2026-09-03)',
				'**Done** · gate A green · check held',
				'- The port answers one count for each region.',
				'**Files**: `src/model/region-counts.js`',
				'',
				'### Step 1.2 — The model reads the region counts (2026-09-04)',
				'**Not done** · gate A green · check notHeld (resendStep)',
				'- buildModel reads the counts.',
				'**Files**: `src/model/build-model.js`',
				'**Check**: `build-model.js:96` calls the old port. Nothing calls regionCounts.',
				'**See it**: `grep -n regionCounts src/model/build-model.js` answers nothing.',
				'',
				'Group B',
				'### Step 2.1 — The reply carries the region count (2026-09-04)',
				'**Not done** · gate B: no verdict yet · check held',
				'- The shape was stated in the step this time. It landed.',
				'**Files**: `src/api/region-reply.js`',
				'',
				'### Step 2.2 — (2026-09-04)',
				'**Not done** — sent in wf_9c40b7e2-118 and answered nothing.',
				'',
				'Claims: 2 held, 1 notHeld, 0 notProvable',
				'',
				'Plan faults, as the check of wf_9c40b7e2-118 found them:',
				'- Group B holds a step the Implementation Plan states no heading for. (2.3)',
				'- The plan states 14 steps and the headings count 15.',
				'',
				'The next run sends: 1.2, 2.1, 2.2'
			].join('\n'));
		});

		test('states the plan, the count of the complete steps and the count of every step it knows', () => {
			expect(reportOf(WHOLE_RECORD).split('\n')[0]).toEqual('plans/a-plan.md — 1 of 4 steps complete');
		});

		test('groups the steps as the sidecar states them, and keeps a group no run sent again', () => {
			expect(reportOf(WHOLE_RECORD)).toContain('Group A');
			expect(reportOf(WHOLE_RECORD).indexOf('Group A')).toBeLessThan(reportOf(WHOLE_RECORD).indexOf('Group B'));
		});

		test('names the steps the next run sends, in the order the sidecar states them', () => {
			expect(reportOf(WHOLE_RECORD)).toContain('The next run sends: 1.2, 2.1, 2.2');
		});

		test('counts the claim it shows for each step, and composes each figure', () => {
			expect(reportOf(WHOLE_RECORD)).toContain('Claims: 2 held, 1 notHeld, 0 notProvable');
		});

		test('states the plan faults of the last check, and names the run that found them', () => {
			expect(reportOf(WHOLE_RECORD)).toContain('Plan faults, as the check of wf_9c40b7e2-118 found them:');
		});
	});

	describe('one step of one run', () => {
		const oneRun = (lines) => reportOf(
			[startedAt({ at: '2026-09-03T10:02:04Z', run: FIRST, groups: [{ name: 'A', steps: ['1.1'] }] }), ...lines],
			[{ name: 'A', steps: ['1.1'] }]
		);

		test('names the step by the title the plan states for its number', () => {
			expect(oneRun([])).toContain('### Step 1.1 — The region answers its item count (2026-09-03)');
		});

		test('marks a step complete as done', () => {
			expect(oneRun([
				workerAt({ at: '2026-09-03T10:09:41Z', run: FIRST, step: '1.1', status: 'done', summary: 'It landed.' }),
				gateAt({ at: '2026-09-03T10:16:52Z', run: FIRST, group: 'A', green: true })
			])).toContain('**Done** · gate A green');
		});

		test('states a red gate of the group that proved the step', () => {
			expect(oneRun([
				workerAt({ at: '2026-09-03T10:09:41Z', run: FIRST, step: '1.1', status: 'done', summary: 'It landed.' }),
				gateAt({ at: '2026-09-03T10:16:52Z', run: FIRST, group: 'A', green: false })
			])).toContain('**Not done** · gate A red');
		});

		test('states the summary of the last worker line as the one line about the step', () => {
			expect(oneRun([
				workerAt({ at: '2026-09-03T10:09:41Z', run: FIRST, step: '1.1', status: 'done', summary: 'The first answer.' }),
				workerAt({ at: '2026-09-03T13:12:39Z', run: FIRST, step: '1.1', status: 'done', summary: 'The last answer.' })
			])).toContain('- The last answer.');
		});

		test('states no Files line for a worker line that names no file', () => {
			expect(oneRun([workerAt({ at: '2026-09-03T10:09:41Z', run: FIRST, step: '1.1', status: 'done', summary: 'It landed.' })]))
				.not.toContain('**Files**');
		});

		test('states the evidence and the way to see it for a claim that is not held', () => {
			const text = oneRun([
				workerAt({ at: '2026-09-03T10:09:41Z', run: FIRST, step: '1.1', status: 'done', summary: 'It landed.' }),
				claimAt({
					at: '2026-09-03T10:38:12Z',
					run: FIRST,
					step: '1.1',
					answer: 'notProvable',
					claim: 'The port answers one count.',
					evidence: 'No test names the port.',
					inspect: '`grep -n regionCounts .` answers nothing.'
				})
			]);

			expect(text).toContain('**Check**: No test names the port.');
			expect(text).toContain('**See it**: `grep -n regionCounts .` answers nothing.');
		});

		test('states no evidence for a claim that is held', () => {
			expect(oneRun([
				workerAt({ at: '2026-09-03T10:09:41Z', run: FIRST, step: '1.1', status: 'done', summary: 'It landed.' }),
				claimAt({ at: '2026-09-03T10:38:12Z', run: FIRST, step: '1.1', answer: 'held', claim: 'It works.', evidence: '`a.js:18` writes it.' })
			])).not.toContain('**Check**');
		});
	});

	describe('a step the record and the plan state little about', () => {
		test('shows a step the plan states no title for by its number alone', () => {
			expect(reportOf(WHOLE_RECORD)).toContain('### Step 2.2 — (2026-09-04)');
		});

		test('shows a step with no worker line as not done, and names the run that sent it', () => {
			expect(reportOf(WHOLE_RECORD)).toContain('**Not done** — sent in wf_9c40b7e2-118 and answered nothing.');
		});

		test('states that no run has sent a step of the sidecar that no runStarted line names', () => {
			expect(reportOf([startedAt({ at: '2026-09-03T10:02:04Z', run: FIRST, groups: [{ name: 'A', steps: ['1.1'] }] })]))
				.toContain('**Not done** — no run has sent it.');
		});
	});

	describe('an artefact that holds a runStarted line alone', () => {
		const started = () => reportOf([startedAt({ at: '2026-09-03T10:02:04Z', run: FIRST, groups: GROUPS })]);

		test('counts no step as complete', () => {
			expect(started().split('\n')[0]).toEqual('plans/a-plan.md — 0 of 4 steps complete');
		});

		test('sends every step to the next run', () => {
			expect(started()).toContain('The next run sends: 1.1, 1.2, 2.1, 2.2');
		});

		test('states no claim count and no plan fault, because the check has answered nothing', () => {
			expect(started()).not.toContain('Claims:');
			expect(started()).not.toContain('Plan faults');
		});
	});

	describe('a record that leaves the next run nothing', () => {
		test('states that the next run sends nothing', () => {
			expect(reportOf(
				[
					startedAt({ at: '2026-09-03T10:02:04Z', run: FIRST, groups: [{ name: 'A', steps: ['1.1'] }] }),
					workerAt({ at: '2026-09-03T10:09:41Z', run: FIRST, step: '1.1', status: 'done', summary: 'It landed.' }),
					gateAt({ at: '2026-09-03T10:16:52Z', run: FIRST, group: 'A', green: true })
				],
				[{ name: 'A', steps: ['1.1'] }]
			)).toContain('The next run sends: nothing');
		});
	});
});
