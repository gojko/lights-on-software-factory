import { describe, expect, test } from '@jest/globals';

import { completedStepsOf } from '../../src/generator/completed-steps-of.js';

const FIRST = 'wf_3881f3a4-c03',
	SECOND = 'wf_9c40b7e2-118',
	AT = '2026-09-03T13:04:11Z',
	runStartedOf = ({ run, groups }) => ({
		at: AT,
		run,
		agentType: 'orchestrator',
		event: { kind: 'runStarted', plan: 'plans/a-plan.md', groups }
	}),
	workerOf = ({ run, step, status = 'done' }) => ({
		at: AT,
		run,
		key: `v2:${run}-${step}-${status}`,
		agent: `a-${step}`,
		agentType: 'workflow-worker',
		step,
		event: { kind: 'step', status, summary: 'It landed.', filesWritten: [] }
	}),
	gateOf = ({ run, group, green = true, kind = 'gate' }) => ({
		at: AT,
		run,
		key: `v2:${run}-${group}-${String(green)}`,
		agent: `a-${group}`,
		agentType: 'workflow-gate',
		group,
		event: kind === 'barrier'
			? { kind, green, needsRework: [], blocked: 'none', summary: 'Green.', statusAnswer: 'Tests: 4 passed, 4 total' }
			: { kind, green, needsRework: [], blocked: 'none', summary: 'Green.' }
	}),
	claimOf = ({ run, step, answer }) => ({
		at: AT,
		run,
		key: `v2:${run}-check`,
		agent: 'a-check',
		agentType: 'workflow-check',
		step,
		event: { kind: 'claim', claim: 'The port answers one count.', answer, evidence: '`a.js:18` writes it.' }
	}),
	GROUPS = [{ name: 'A', steps: ['1.1', '1.2'] }, { name: 'B', steps: ['2.1', '2.2'] }],
	landedRun = [
		runStartedOf({ run: FIRST, groups: GROUPS }),
		workerOf({ run: FIRST, step: '1.1' }),
		workerOf({ run: FIRST, step: '1.2', status: 'doneWithDeviation' }),
		gateOf({ run: FIRST, group: 'A' })
	];

describe('the steps the artefact states as complete', () => {
	test('answers a step of a green gate whose last worker line says done or doneWithDeviation, in file order', () => {
		expect(completedStepsOf(landedRun)).toEqual(['1.1', '1.2']);
	});

	test('answers nothing for a step whose last worker line says notDone', () => {
		expect(completedStepsOf([
			runStartedOf({ run: FIRST, groups: GROUPS }),
			workerOf({ run: FIRST, step: '2.1', status: 'notDone' }),
			gateOf({ run: FIRST, group: 'B' })
		])).toEqual([]);
	});

	test('answers nothing for a step whose gate of that run and that group is red', () => {
		expect(completedStepsOf([
			runStartedOf({ run: FIRST, groups: GROUPS }),
			workerOf({ run: FIRST, step: '1.1' }),
			gateOf({ run: FIRST, group: 'A', green: false })
		])).toEqual([]);
	});

	test('answers nothing for a step whose run holds no gate line for its group', () => {
		expect(completedStepsOf([
			runStartedOf({ run: FIRST, groups: GROUPS }),
			workerOf({ run: FIRST, step: '1.1' }),
			gateOf({ run: FIRST, group: 'B' })
		])).toEqual([]);
	});

	test('answers a step of a group a barrier line proved, because the barrier names the group', () => {
		expect(completedStepsOf([
			runStartedOf({ run: FIRST, groups: GROUPS }),
			workerOf({ run: FIRST, step: '2.1' }),
			gateOf({ run: FIRST, group: 'B', kind: 'barrier' })
		])).toEqual(['2.1']);
	});

	test('answers nothing when the one green gate of the run names the group leading', () => {
		expect(completedStepsOf([
			runStartedOf({ run: SECOND, groups: GROUPS }),
			gateOf({ run: SECOND, group: 'leading' }),
			workerOf({ run: SECOND, step: '2.1' })
		])).toEqual([]);
	});

	test('answers nothing for a step whose worker line names a run with no runStarted line', () => {
		expect(completedStepsOf([
			workerOf({ run: FIRST, step: '1.1' }),
			gateOf({ run: FIRST, group: 'A' })
		])).toEqual([]);
	});

	test('answers nothing for a step no group of its run holds', () => {
		expect(completedStepsOf([
			runStartedOf({ run: FIRST, groups: [{ name: 'A', steps: ['1.1'] }] }),
			workerOf({ run: FIRST, step: '9.9' }),
			gateOf({ run: FIRST, group: 'A' })
		])).toEqual([]);
	});

	test('reads the group of a step from the run its last worker line names, and not from the run of today', () => {
		expect(completedStepsOf([
			runStartedOf({ run: FIRST, groups: GROUPS }),
			workerOf({ run: FIRST, step: '2.1' }),
			gateOf({ run: FIRST, group: 'B', kind: 'barrier' }),
			runStartedOf({ run: SECOND, groups: [{ name: 'C', steps: ['2.1', '3.1'] }] })
		])).toEqual(['2.1']);
	});

	test('answers a step whose later worker line says done after an earlier line said notDone', () => {
		expect(completedStepsOf([
			runStartedOf({ run: FIRST, groups: GROUPS }),
			workerOf({ run: FIRST, step: '2.1', status: 'notDone' }),
			runStartedOf({ run: SECOND, groups: [{ name: 'B', steps: ['2.1', '2.2'] }] }),
			workerOf({ run: SECOND, step: '2.1' }),
			gateOf({ run: SECOND, group: 'B' })
		])).toEqual(['2.1']);
	});

	test('answers nothing for a step a later check claim says notHeld about', () => {
		expect(completedStepsOf([...landedRun, claimOf({ run: SECOND, step: '1.2', answer: 'notHeld' })]))
			.toEqual(['1.1']);
	});

	test('answers a step a later check claim says notProvable about, because notProvable never un-marks', () => {
		expect(completedStepsOf([...landedRun, claimOf({ run: SECOND, step: '1.2', answer: 'notProvable' })]))
			.toEqual(['1.1', '1.2']);
	});

	test('answers a step a check claim of notHeld stands before its last worker line for', () => {
		expect(completedStepsOf([
			runStartedOf({ run: FIRST, groups: GROUPS }),
			workerOf({ run: FIRST, step: '1.1' }),
			gateOf({ run: FIRST, group: 'A' }),
			claimOf({ run: FIRST, step: '1.1', answer: 'notHeld' }),
			runStartedOf({ run: SECOND, groups: [{ name: 'A', steps: ['1.1'] }] }),
			workerOf({ run: SECOND, step: '1.1' }),
			gateOf({ run: SECOND, group: 'A' })
		])).toEqual(['1.1']);
	});

	test('answers nothing for a step the run sent and no worker line answered', () => {
		expect(completedStepsOf([
			runStartedOf({ run: FIRST, groups: GROUPS }),
			gateOf({ run: FIRST, group: 'A' })
		])).toEqual([]);
	});

	test('answers an empty array when the artefact holds no line', () => {
		expect(completedStepsOf([])).toEqual([]);
	});
});
