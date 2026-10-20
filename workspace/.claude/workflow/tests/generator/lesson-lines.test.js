import { randomUUID } from 'node:crypto';

import { describe, expect, test } from '@jest/globals';

import { lessonLines } from '../../src/generator/lesson-lines.js';

const HEAD = { at: '2026-09-03T20:00:00.000Z', run: 'wf_a', key: 'k', agent: 'a' },
	stepOf = ({ step, event }) => ({
		...HEAD,
		agentType: 'workflow-worker',
		step,
		event: { kind: 'step', status: 'done', summary: 'it did the thing', filesWritten: [], ...event }
	}),
	gateOf = (summary) => ({
		...HEAD,
		agentType: 'workflow-gate',
		group: 'A',
		event: { kind: 'gate', green: true, needsRework: [], blocked: 'none', summary }
	}),
	claimOf = (answer) => ({
		...HEAD,
		agentType: 'workflow-check',
		step: '1.3',
		event: { kind: 'claim', claim: 'the guard holds', answer, evidence: 'the suite passes either way' }
	}),
	faultsOf = (fault) => ({
		...HEAD,
		agentType: 'workflow-check',
		event: { kind: 'planFaults', faults: [{ fault, steps: ['4.2'] }] }
	}),
	endedOf = (said) => ({
		...HEAD,
		agentType: 'orchestrator',
		event: { kind: 'runEnded', outcome: 'stopped', said }
	}),
	textOf = (lines) => lessonLines(lines).join('\n');

describe('lessonLines', () => {
	test('names the blocker a worker reported, with the step that reported it', () => {
		const blocker = `the regulator refused it ${randomUUID()}`;

		expect(textOf([stepOf({ step: '2.1', event: { blocker } })])).toContain(`step 2.1`);
		expect(textOf([stepOf({ step: '2.1', event: { blocker } })])).toContain(blocker);
	});

	test('names the deviation a worker reported', () => {
		const deviation = `I wrote no file ${randomUUID()}`;

		expect(textOf([stepOf({ step: '1.1', event: { deviation } })])).toContain(deviation);
	});

	test('names the defect a worker carried forward', () => {
		const defect = `the fixture is stale ${randomUUID()}`;

		expect(textOf([stepOf({ step: '1.2', event: { carryForwardDefect: defect } })])).toContain(defect);
	});

	test('names the design a worker had to decide for a later step', () => {
		const decision = `the wiring variable is named this ${randomUUID()}`;

		expect(textOf([stepOf({ step: '3.1', event: { decisionForLaterSteps: decision } })])).toContain(decision);
	});

	test('says nothing about a field that states none', () => {
		expect(lessonLines([stepOf({ step: '1.1', event: { blocker: 'none' } })])).toEqual(['this run recorded no lesson']);
	});

	test('says nothing about a field that is empty', () => {
		expect(lessonLines([stepOf({ step: '1.1', event: { deviation: '' } })])).toEqual(['this run recorded no lesson']);
	});

	test('names the summary of a gate, because a gate reports a fault of the framework', () => {
		const summary = `the goal reaches no integration suite ${randomUUID()}`;

		expect(textOf([gateOf(summary)])).toContain(summary);
	});

	test('names a claim the check did not hold', () => {
		expect(textOf([claimOf('notProvable')])).toContain('the guard holds');
	});

	test('says nothing about a claim the check held', () => {
		expect(lessonLines([claimOf('held')])).toEqual(['this run recorded no lesson']);
	});

	test('names each fault of the plan the check found', () => {
		const fault = `the count is stated twice ${randomUUID()}`;

		expect(textOf([faultsOf(fault)])).toContain(fault);
	});

	test('names what a person said when they ended a run', () => {
		const said = `the schema refused a number ${randomUUID()}`;

		expect(textOf([endedOf(said)])).toContain(said);
	});

	test('says that a run recorded no lesson where it holds none', () => {
		expect(lessonLines([])).toEqual(['this run recorded no lesson']);
	});
});
