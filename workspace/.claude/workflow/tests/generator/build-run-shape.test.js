import { beforeEach, describe, expect, test } from '@jest/globals';

import { buildRunShape } from '../../src/generator/build-run-shape.js';

const listOf = ({ name, files }) => files.length === 0
		? [`**${name}**: \`none\``]
		: [`**${name}**:`, '', ...files.map((file, index) => `${index + 1}. \`${file}\``)],
	bodyOf = ({ create = [], modify = [] }) => [
		'**Goal**: the step does one thing.',
		'',
		...listOf({ name: 'Files to create', files: create }),
		'',
		...listOf({ name: 'Files to modify', files: modify }),
		'',
		'**Files to delete**: `none`'
	].join('\n'),
	planTextOf = (steps) => [
		'# A plan',
		'',
		'## Implementation Plan',
		'',
		...steps.flatMap(({ step, title, body }) => [`#### Step ${step}: ${title}`, '', body, '', '---', '']),
		'## Execution plan',
		''
	].join('\n'),
	stepOf = ({ shape, step }) =>
		shape.groups.flatMap((group) => group.stages.flat()).find((one) => one.step === step),
	namesOf = (shape) => shape.groups.map((group) => ({
		name: group.name,
		stages: group.stages.map((stage) => stage.map((one) => one.step))
	})),
	steps = [
		{ step: '1.1', title: 'First', body: bodyOf({ create: ['a.js', 'b.js'] }) },
		{ step: '1.2', title: 'Second', body: bodyOf({ create: ['c.js'] }) },
		{ step: '1.3', title: 'Third', body: bodyOf({ modify: ['b.js'] }) },
		{ step: '2.1', title: 'Fourth', body: bodyOf({ modify: ['b.js'] }) },
		{ step: '2.2', title: 'Fifth', body: '**Goal**: this step states no file heading, and it names `b.js`.' }
	],
	block = {
		groups: [
			{ name: 'the first group', steps: ['1.1', '1.2', '1.3'] },
			{ name: 'the second group', steps: ['2.1', '2.2'] }
		],
		dependencies: { '1.3': ['1.1'], '2.1': ['1.3'] }
	},
	planText = planTextOf(steps);

describe('the run shape of a plan', () => {
	let underTest;

	beforeEach(() => {
		underTest = buildRunShape({ planText, block, completed: [] });
	});

	test('answers the groups of the block in block order, each with the stages of its steps', () => {
		expect(namesOf(underTest)).toEqual([
			{ name: 'the first group', stages: [['1.1', '1.2'], ['1.3']] },
			{ name: 'the second group', stages: [['2.1', '2.2']] }
		]);
	});

	test('states the body of a step verbatim', () => {
		expect(stepOf({ shape: underTest, step: '1.2' })?.body).toEqual(bodyOf({ create: ['c.js'] }));
	});

	test('states a line range that holds the heading and the body of the step', () => {
		const one = stepOf({ shape: underTest, step: '1.3' }),
			lines = planText.split('\n').slice((one?.from ?? 0) - 1, one?.to ?? 0);

		expect(lines.join('\n')).toEqual(`#### Step 1.3: Third\n\n${bodyOf({ modify: ['b.js'] })}\n`);
	});

	test('names the later step of the same group that writes a file of this step', () => {
		expect(stepOf({ shape: underTest, step: '1.1' })?.writtenAlsoBy).toEqual([{ step: '1.3', files: ['b.js'] }]);
	});

	test('names the earlier step of the same group that writes a file of this step', () => {
		expect(stepOf({ shape: underTest, step: '1.3' })?.writtenAlsoBy).toEqual([{ step: '1.1', files: ['b.js'] }]);
	});

	test('names no step of another group that writes a file of this step', () => {
		expect(stepOf({ shape: underTest, step: '2.1' })?.writtenAlsoBy).toEqual([]);
	});

	test('names no step when no other step of the group writes a file of this step', () => {
		expect(stepOf({ shape: underTest, step: '1.2' })?.writtenAlsoBy).toEqual([]);
	});

	test('names no step for a step that states no file heading', () => {
		expect(stepOf({ shape: underTest, step: '2.2' })?.writtenAlsoBy).toEqual([]);
	});

	test('answers no restart when no step is completed', () => {
		expect(underTest.restart).toBe(false);
	});

	test('leaves out no step when no step is completed', () => {
		expect(underTest.leftOut).toEqual([]);
	});
});

describe('the run shape of a plan that states more than one shared file', () => {
	test('names each shared file of one step in one entry', () => {
		const shared = [
				{ step: '1.1', title: 'First', body: bodyOf({ create: ['a.js', 'b.js'] }) },
				{ step: '1.2', title: 'Second', body: bodyOf({ modify: ['b.js', 'a.js'] }) }
			],
			underTest = buildRunShape({
				planText: planTextOf(shared),
				block: { groups: [{ name: 'one', steps: ['1.1', '1.2'] }], dependencies: { '1.2': ['1.1'] } },
				completed: []
			});

		expect(stepOf({ shape: underTest, step: '1.1' })?.writtenAlsoBy).toEqual([{ step: '1.2', files: ['a.js', 'b.js'] }]);
	});
});

describe('the run shape of a plan the prose and the block disagree on', () => {
	let underTest;

	beforeEach(() => {
		underTest = buildRunShape({
			planText,
			block: { groups: [{ name: 'one', steps: ['1.1', '9.9'] }], dependencies: {} },
			completed: []
		});
	});

	test('leaves out a step that a group holds and the prose states no heading for', () => {
		expect(namesOf(underTest)).toEqual([{ name: 'one', stages: [['1.1']] }]);
	});

	test('names the step the prose states no heading for, with the group that holds it', () => {
		expect(underTest.leftOut).toEqual([{ step: '9.9', group: 'one', reason: 'noStepHeading' }]);
	});

	test('answers no restart when no step is completed', () => {
		expect(underTest.restart).toBe(false);
	});

	test('drops a group the prose states no step of', () => {
		expect(namesOf(buildRunShape({
			planText,
			block: { groups: [{ name: 'one', steps: ['9.9'] }], dependencies: {} },
			completed: []
		}))).toEqual([]);
	});
});

describe('the run shape of a plan with one step completed', () => {
	let underTest;

	beforeEach(() => {
		underTest = buildRunShape({ planText, block, completed: ['1.1'] });
	});

	test('leaves out the step the completed steps hold', () => {
		expect(namesOf(underTest)).toEqual([
			{ name: 'the first group', stages: [['1.2', '1.3']] },
			{ name: 'the second group', stages: [['2.1', '2.2']] }
		]);
	});

	test('names the step it left out, with the group that holds it and the reason', () => {
		expect(underTest.leftOut).toEqual([{ step: '1.1', group: 'the first group', reason: 'recordedDone' }]);
	});

	test('answers a restart', () => {
		expect(underTest.restart).toBe(true);
	});

	test('names no step it left out in the shared files of a step it sends', () => {
		expect(stepOf({ shape: underTest, step: '1.3' })?.writtenAlsoBy).toEqual([]);
	});

	test('keeps a step the completed steps do not hold', () => {
		expect(stepOf({ shape: underTest, step: '1.2' })?.body).toEqual(bodyOf({ create: ['c.js'] }));
	});
});

describe('the run shape of a plan whose artefact holds a line and no completed step', () => {
	let underTest;

	beforeEach(() => {
		underTest = buildRunShape({ planText, block, completed: [], ranBefore: true });
	});

	test('answers a restart, because a run wrote to the tree before this one', () => {
		expect(underTest.restart).toBe(true);
	});

	test('sends every step, because the artefact records none of them complete', () => {
		expect(namesOf(underTest)).toEqual([
			{ name: 'the first group', stages: [['1.1', '1.2'], ['1.3']] },
			{ name: 'the second group', stages: [['2.1', '2.2']] }
		]);
	});

	test('leaves out no step', () => {
		expect(underTest.leftOut).toEqual([]);
	});
});

describe('the run shape of a plan with every step of one group completed', () => {
	let underTest;

	beforeEach(() => {
		underTest = buildRunShape({ planText, block, completed: ['1.1', '1.2', '1.3'] });
	});

	test('drops the group that then holds no step', () => {
		expect(namesOf(underTest)).toEqual([{ name: 'the second group', stages: [['2.1', '2.2']] }]);
	});

	test('names each step of the dropped group in the steps it left out', () => {
		expect(underTest.leftOut.map((one) => one.step)).toEqual(['1.1', '1.2', '1.3']);
	});
});

describe('the run shape of a plan with a completed step the prose states no heading for', () => {
	test('states that the record holds the step done', () => {
		const underTest = buildRunShape({
			planText,
			block: { groups: [{ name: 'one', steps: ['1.1', '9.9'] }], dependencies: {} },
			completed: ['9.9']
		});

		expect(underTest.leftOut).toEqual([{ step: '9.9', group: 'one', reason: 'recordedDone' }]);
	});
});

describe('the run shape of a plan whose Progress section marks a step done', () => {
	let underTest;

	beforeEach(() => {
		underTest = buildRunShape({
			planText: [planText, '## Progress', '', '### Step 1.1: First', '', '**Done**', ''].join('\n'),
			block,
			completed: []
		});
	});

	test('answers no restart, because the builder reads no Progress section', () => {
		expect(underTest.restart).toBe(false);
	});

	test('sends the step the Progress section marks done', () => {
		expect(stepOf({ shape: underTest, step: '1.1' })?.body).toEqual(bodyOf({ create: ['a.js', 'b.js'] }));
	});
});

describe('the run shape of a plan with a cycle inside a group', () => {
	test('throws an error that names the group', () => {
		expect(() => buildRunShape({
			planText,
			block: {
				groups: [{ name: 'the first group', steps: ['1.1', '1.2'] }],
				dependencies: { '1.1': ['1.2'], '1.2': ['1.1'] }
			},
			completed: []
		})).toThrow('the first group');
	});
});
