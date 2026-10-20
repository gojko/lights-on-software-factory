import { describe, expect, test } from '@jest/globals';

import { labelOfAgent } from '../../src/generator/label-of-agent.js';

const headOf = (lines) => lines.join('\n');

describe('what one agent of a run is doing', () => {
	test('names the step a worker was lifted from', () => {
		expect(labelOfAgent(headOf([
			'Carry out this task.',
			'',
			'Source: 1.5 of plans/a-plan.md, at lines 120 to 148.'
		]))).toEqual('step 1.5');
	});

	test('keeps a step number as text, so 1.10 stays apart from 1.1', () => {
		expect(labelOfAgent('Source: 1.10 of plans/a-plan.md, at lines 1 to 9.')).toEqual('step 1.10');
	});

	test('names the goal a gate runs', () => {
		expect(labelOfAgent(headOf([
			'Prove the merged tree and answer a verdict on it.',
			'',
			'The name of the goal to run: workflow-serial-gate',
			'Plan file: plans/a-plan.md'
		]))).toEqual('gate workflow-serial-gate');
	});

	test('tells the barrier apart from a serial gate, because the two run different goals', () => {
		expect(labelOfAgent('The name of the goal to run: workflow-final-gate')).toEqual('gate workflow-final-gate');
	});

	test('names the check agent', () => {
		expect(labelOfAgent(headOf([
			'Answer for the claim of each step this run sent.',
			'',
			'Plan file: plans/a-plan.md'
		]))).toEqual('check');
	});

	test('reads a goal out of a transcript line that escapes its own newlines, and takes no word after it', () => {
		expect(labelOfAgent(String.raw`{"text":"The name of the goal to run: workflow-serial-gate\nPlan file: a.md"}`))
			.toEqual('gate workflow-serial-gate');
	});

	test('answers an empty label for a head that names no role', () => {
		expect(labelOfAgent('a prompt of no role this run knows')).toEqual('');
	});

	test('answers an empty label for a transcript that holds nothing yet', () => {
		expect(labelOfAgent('')).toEqual('');
	});
});
