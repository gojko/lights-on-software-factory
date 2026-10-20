import { describe, expect, test } from '@jest/globals';

import { validatePlan } from '../../src/generator/validate-plan.js';

const planPath = 'plans/a-plan.md',
	stepTextOf = ({ step, files = [`src/step-${step}.js`], note = '' }) => [
		`#### Step ${step}: a step of the plan`,
		'',
		note,
		'**Files to create**: `none`',
		'',
		'**Files to modify**:',
		'',
		...files.map((file, index) => `${index + 1}. \`${file}\``),
		'',
		'**Files to delete**: `none`',
		''
	].join('\n'),
	planTextOf = ({ steps, tail = '' }) => ['## Implementation Plan', '', ...steps, tail].join('\n'),
	faultsOfPlanText = ({ planText, block }) => validatePlan({ planPath, planText, block }),
	faultsOfPlan = ({ steps, block, tail = '' }) =>
		faultsOfPlanText({ planText: planTextOf({ steps: steps.map(stepTextOf), tail }), block }),
	faultsOfSteps = ({ steps, tail = '' }) =>
		faultsOfPlan({ steps, tail, block: { groups: [{ name: 'A', steps: steps.map((one) => one.step) }], dependencies: {} } }),
	faultsOf = (block) => faultsOfPlan({
		steps: [...new Set(block.groups.flatMap((group) => group.steps))].map((step) => ({ step })),
		block
	});

describe('the faults of an execution block', () => {
	test('answers no fault when one group holds each step and each dependency points at an earlier group', () => {
		expect(faultsOf({
			groups: [
				{ name: 'A', steps: ['1.1', '1.2'] },
				{ name: 'B', steps: ['2.1'] }
			],
			dependencies: { '2.1': ['1.1', '1.2'] }
		})).toEqual([]);
	});

	test('answers no fault when the block states no group and no dependency', () => {
		expect(faultsOf({ groups: [], dependencies: {} })).toEqual([]);
	});

	test('answers a fault that names each group when two groups hold one step', () => {
		expect(faultsOf({
			groups: [
				{ name: 'A', steps: ['1.1'] },
				{ name: 'B', steps: ['1.1'] }
			],
			dependencies: {}
		})).toEqual([{ planPath, step: '1.1', fault: 'the groups "A" and "B" hold this step, and one group holds a step' }]);
	});

	test('answers one fault when three groups hold one step', () => {
		expect(faultsOf({
			groups: [
				{ name: 'A', steps: ['1.1'] },
				{ name: 'B', steps: ['1.1'] },
				{ name: 'C', steps: ['1.1'] }
			],
			dependencies: {}
		})).toEqual([{ planPath, step: '1.1', fault: 'the groups "A", "B" and "C" hold this step, and one group holds a step' }]);
	});

	test('answers a fault that names the plan file when a dependency names a step no group holds', () => {
		expect(faultsOf({
			groups: [{ name: 'A', steps: ['1.1'] }],
			dependencies: { '1.1': ['0.9'] }
		})).toEqual([{ planPath, step: '1.1', fault: 'this step waits for the step 0.9, and no group holds that step' }]);
	});

	test('answers a fault for the waiting step when no group holds it', () => {
		expect(faultsOf({
			groups: [{ name: 'A', steps: ['1.1'] }],
			dependencies: { '3.4': ['1.1'] }
		})).toEqual([{ planPath, step: '3.4', fault: 'this step states a dependency, and no group holds it' }]);
	});

	test('answers a fault that names the later group when a step waits for a step of a later group', () => {
		expect(faultsOf({
			groups: [
				{ name: 'A', steps: ['1.1'] },
				{ name: 'B', steps: ['2.1'] }
			],
			dependencies: { '1.1': ['2.1'] }
		})).toEqual([{ planPath, step: '1.1', fault: 'this step waits for the step 2.1 of the later group "B"' }]);
	});

	test('answers no fault when a step waits for a step of its own group', () => {
		expect(faultsOf({
			groups: [{ name: 'A', steps: ['1.1', '1.2'] }],
			dependencies: { '1.2': ['1.1'] }
		})).toEqual([]);
	});

	test('answers a fault that names the path when two steps wait for each other', () => {
		expect(faultsOf({
			groups: [{ name: 'A', steps: ['1.1', '1.2'] }],
			dependencies: { '1.1': ['1.2'], '1.2': ['1.1'] }
		})).toEqual([{ planPath, step: '1.1', fault: 'the dependencies make a cycle: 1.1 waits for 1.2 waits for 1.1' }]);
	});

	test('answers one fault for a cycle of three steps', () => {
		expect(faultsOf({
			groups: [{ name: 'A', steps: ['1.1', '1.2', '1.3'] }],
			dependencies: { '1.1': ['1.3'], '1.2': ['1.1'], '1.3': ['1.2'] }
		})).toEqual([{ planPath, step: '1.1', fault: 'the dependencies make a cycle: 1.1 waits for 1.3 waits for 1.2 waits for 1.1' }]);
	});

	test('answers a fault when a step waits for itself', () => {
		expect(faultsOf({
			groups: [{ name: 'A', steps: ['1.1'] }],
			dependencies: { '1.1': ['1.1'] }
		})).toEqual([{ planPath, step: '1.1', fault: 'the dependencies make a cycle: 1.1 waits for 1.1' }]);
	});

	test('answers a fault of each kind when the block holds more than one fault', () => {
		expect(faultsOf({
			groups: [
				{ name: 'A', steps: ['1.1', '1.2'] },
				{ name: 'B', steps: ['1.2', '2.1'] }
			],
			dependencies: { '1.1': ['2.1'], '2.1': ['9.9'] }
		})).toEqual([
			{ planPath, step: '1.2', fault: 'the groups "A" and "B" hold this step, and one group holds a step' },
			{ planPath, step: '2.1', fault: 'this step waits for the step 9.9, and no group holds that step' },
			{ planPath, step: '1.1', fault: 'this step waits for the step 2.1 of the later group "B"' }
		]);
	});
});

describe('the faults the block and the prose share', () => {
	test('answers a fault when the prose states a step and no group holds it', () => {
		expect(faultsOfPlan({
			steps: [{ step: '1.1' }, { step: '1.2' }],
			block: { groups: [{ name: 'A', steps: ['1.1'] }], dependencies: {} }
		})).toEqual([{ planPath, step: '1.2', fault: 'the prose states this step, and no group of the execution block holds it' }]);
	});

	test('answers a fault when a group holds a step and the prose states no heading for it', () => {
		expect(faultsOfPlan({
			steps: [{ step: '1.1' }],
			block: { groups: [{ name: 'A', steps: ['1.1', '1.2'] }], dependencies: {} }
		})).toEqual([{ planPath, step: '1.2', fault: 'a group of the execution block holds this step, and the prose states no step heading for it' }]);
	});
});

describe('the stated step count', () => {
	test('answers no fault when the stated count is the count of the step headings', () => {
		expect(faultsOfSteps({ steps: [{ step: '1.1' }, { step: '1.2' }], tail: '**Total**: 1 phase, 2 steps.' })).toEqual([]);
	});

	test('answers a fault when the stated count is not the count of the step headings', () => {
		expect(faultsOfSteps({ steps: [{ step: '1.1' }, { step: '1.2' }], tail: '**Total**: 1 phase, 3 steps.' }))
			.toEqual([{ planPath, step: '', fault: 'the plan states 3 steps, and the count of the step headings is 2' }]);
	});

	test('answers a fault when the plan marks the whole total line and the count disagrees', () => {
		expect(faultsOfSteps({ steps: [{ step: '1.1' }], tail: '**Total: 2 phases, 4 steps.**' }))
			.toEqual([{ planPath, step: '', fault: 'the plan states 4 steps, and the count of the step headings is 1' }]);
	});

	test('answers no fault when the plan states no total', () => {
		expect(faultsOfSteps({ steps: [{ step: '1.1' }] })).toEqual([]);
	});
});

describe('the commands a step body names', () => {
	test('answers a fault that names the command when a step body names a make goal', () => {
		expect(faultsOfSteps({ steps: [{ step: '1.1', note: 'The step proves with `make e2e-test`.\n' }] }))
			.toEqual([{ planPath, step: '1.1', fault: 'this step names the command "make e2e-test", and a step of a plan runs no build tool' }]);
	});

	test('answers a fault for each command when a step body names two make goals', () => {
		expect(faultsOfSteps({ steps: [{ step: '1.1', note: 'It runs `make test` and then `make lint`.\n' }] })).toEqual([
			{ planPath, step: '1.1', fault: 'this step names the command "make test", and a step of a plan runs no build tool' },
			{ planPath, step: '1.1', fault: 'this step names the command "make lint", and a step of a plan runs no build tool' }
		]);
	});

	test('answers no fault when a step body uses the word make in a sentence', () => {
		expect(faultsOfSteps({ steps: [{ step: '1.1', note: 'The worker must make a decision about `resolve-depth.js` here.\n' }] })).toEqual([]);
	});
});

describe('the files two steps of one stage write', () => {
	const sharedFile = 'src/shared.js',
		twoWriters = [{ step: '1.1', files: [sharedFile] }, { step: '1.2', files: [sharedFile] }];

	test('answers a fault that names the file when two steps of one stage write it', () => {
		expect(faultsOfPlan({
			steps: twoWriters,
			block: { groups: [{ name: 'A', steps: ['1.1', '1.2'] }], dependencies: {} }
		})).toEqual([{ planPath, step: '1.1', fault: 'the steps "1.1" and "1.2" of one stage of the group "A" write the file "src/shared.js"' }]);
	});

	test('answers no fault when a dependency puts the two writers in different stages', () => {
		expect(faultsOfPlan({
			steps: twoWriters,
			block: { groups: [{ name: 'A', steps: ['1.1', '1.2'] }], dependencies: { '1.2': ['1.1'] } }
		})).toEqual([]);
	});

	test('answers no fault when the two writers sit in different groups', () => {
		expect(faultsOfPlan({
			steps: twoWriters,
			block: { groups: [{ name: 'A', steps: ['1.1'] }, { name: 'B', steps: ['1.2'] }], dependencies: {} }
		})).toEqual([]);
	});

	test('answers the cycle fault alone when the group of the two writers holds a cycle', () => {
		expect(faultsOfPlan({
			steps: twoWriters,
			block: { groups: [{ name: 'A', steps: ['1.1', '1.2'] }], dependencies: { '1.1': ['1.2'], '1.2': ['1.1'] } }
		})).toEqual([{ planPath, step: '1.1', fault: 'the dependencies make a cycle: 1.1 waits for 1.2 waits for 1.1' }]);
	});
});

describe('the file boundary of a step', () => {
	test('answers a fault when a step names no file in its three lists', () => {
		expect(faultsOfSteps({ steps: [{ step: '1.1', files: [] }] }))
			.toEqual([{ planPath, step: '1.1', fault: 'this step names no file in its three file lists' }]);
	});

	test('answers a fault that names the absent heading when a step states fewer than three file headings', () => {
		expect(faultsOfPlanText({
			planText: planTextOf({ steps: ['#### Step 1.1: a step of the plan\n\n**Files to create**: `none`\n\n**Files to modify**: `src/one.js`\n'] }),
			block: { groups: [{ name: 'A', steps: ['1.1'] }], dependencies: {} }
		})).toEqual([{ planPath, step: '1.1', fault: 'this step states no "Files to delete" heading' }]);
	});
});

describe('a line number a step names in a file an earlier step writes', () => {
	const reader = (note) => ({ step: '2.1', files: ['src/other.js'], note }),
		twoGroups = { groups: [{ name: 'A', steps: ['1.1'] }, { name: 'B', steps: ['2.1'] }], dependencies: { '2.1': ['1.1'] } };

	test('answers a fault when a later step names a line of a file an earlier group writes', () => {
		expect(faultsOfPlan({
			steps: [{ step: '1.1', files: ['tests/page.test.js'] }, reader('The case at `tests/page.test.js:1439` states the new words.\n')],
			block: twoGroups
		})).toEqual([{
			planPath,
			step: '2.1',
			fault: 'this step names the line "tests/page.test.js:1439", and the earlier step 1.1 writes that file, so the line drifts before this step reads it'
		}]);
	});

	test('answers a fault when the step names the file by its base name alone', () => {
		expect(faultsOfPlan({
			steps: [{ step: '1.1', files: ['web/tests/page.test.js'] }, reader('The case at `page.test.js:1439` states the new words.\n')],
			block: twoGroups
		})).toEqual([{
			planPath,
			step: '2.1',
			fault: 'this step names the line "page.test.js:1439", and the earlier step 1.1 writes that file, so the line drifts before this step reads it'
		}]);
	});

	test('answers one fault for a file, whatever the count of the lines the step names of it', () => {
		expect(faultsOfPlan({
			steps: [{ step: '1.1', files: ['tests/page.test.js'] }, reader('The cases at `tests/page.test.js:1439`, `tests/page.test.js:1592` and `tests/page.test.js:1700`.\n')],
			block: twoGroups
		})).toHaveLength(1);
	});

	test('answers a fault when the writer is an earlier STAGE of the same group', () => {
		expect(faultsOfPlan({
			steps: [{ step: '1.1', files: ['tests/page.test.js'] }, { step: '1.2', files: ['src/other.js'], note: 'The case at `tests/page.test.js:12`.\n' }],
			block: { groups: [{ name: 'A', steps: ['1.1', '1.2'] }], dependencies: { '1.2': ['1.1'] } }
		})).toEqual([{
			planPath,
			step: '1.2',
			fault: 'this step names the line "tests/page.test.js:12", and the earlier step 1.1 writes that file, so the line drifts before this step reads it'
		}]);
	});

	test('answers no fault when the step names a line of a file it writes itself', () => {
		expect(faultsOfSteps({ steps: [{ step: '1.1', files: ['tests/page.test.js'], note: 'The case at `tests/page.test.js:12` is kept.\n' }] })).toEqual([]);
	});

	test('answers no fault when no step writes the file the line is in', () => {
		expect(faultsOfSteps({ steps: [{ step: '1.1', note: 'The rule at `src/read-only.js:12` states the key.\n' }] })).toEqual([]);
	});

	test('answers no fault when the writer runs in a LATER group, because the line is still true when this step reads it', () => {
		expect(faultsOfPlan({
			steps: [{ step: '1.1', files: ['src/other.js'], note: 'The case at `tests/page.test.js:12`.\n' }, { step: '2.1', files: ['tests/page.test.js'] }],
			block: { groups: [{ name: 'A', steps: ['1.1'] }, { name: 'B', steps: ['2.1'] }], dependencies: { '2.1': ['1.1'] } }
		})).toEqual([]);
	});

	test('answers no fault for a step body that names a file and no line of it', () => {
		expect(faultsOfPlan({
			steps: [{ step: '1.1', files: ['tests/page.test.js'] }, reader('`tests/page.test.js` states the new words.\n')],
			block: twoGroups
		})).toEqual([]);
	});
});

describe('a step number that is not digits and dots', () => {
	const faultsOfNumber = (step) => faultsOfPlan({
			steps: [{ step }],
			block: { groups: [{ name: 'A', steps: [step] }], dependencies: {} }
		}),
		proseFaultOf = (step) => ({ planPath, step, fault: 'the prose states this step number, and a step number holds digits and dots alone' }),
		groupFaultOf = (step) => ({ planPath, step, fault: 'the group "A" holds this step number, and a step number holds digits and dots alone' }),
		dependencyFaultOf = (step) => ({ planPath, step, fault: 'the dependencies name this step number, and a step number holds digits and dots alone' }),
		dependencyFaultsOf = (dependencies) => faultsOfPlan({
			steps: [{ step: '1.1' }, { step: '1.2' }],
			block: { groups: [{ name: 'A', steps: ['1.1', '1.2'] }], dependencies }
		}).filter(({ fault }) => fault.startsWith('the dependencies name'));

	test('answers a fault of the prose when a step heading states such a number', () => {
		expect(faultsOfNumber('2a.1')).toContainEqual(proseFaultOf('2a.1'));
	});

	test('answers a fault that names the group when a group holds such a number', () => {
		expect(faultsOfNumber('2a.1')).toContainEqual(groupFaultOf('2a.1'));
	});

	test('answers one fault for each place that states the number and never two for one place', () => {
		expect(faultsOfNumber('2a.1')).toEqual([groupFaultOf('2a.1'), proseFaultOf('2a.1')]);
	});

	test('answers a fault of the dependencies when a key states such a number', () => {
		expect(dependencyFaultsOf({ '2a.1': ['1.1'] })).toEqual([dependencyFaultOf('2a.1')]);
	});

	test('answers a fault of the dependencies when a value names such a number', () => {
		expect(dependencyFaultsOf({ '1.2': ['2a.1'] })).toEqual([dependencyFaultOf('2a.1')]);
	});

	test('answers one fault of the dependencies when a key and a value state one such number', () => {
		expect(dependencyFaultsOf({ '1.2': ['2a.1'], '2a.1': ['1.1'] })).toEqual([dependencyFaultOf('2a.1')]);
	});

	test('answers no fault when a block of the Progress section records such a number as done, because no program reads that section', () => {
		expect(faultsOfPlan({
			steps: [{ step: '1.1' }],
			block: { groups: [{ name: 'A', steps: ['1.1'] }], dependencies: {} },
			tail: ['## Progress', '', '### Step 2a.1: a step of the plan', '', '**Done**', ''].join('\n')
		})).toEqual([]);
	});

	test('answers no fault for a number whose second part is two digits', () => {
		expect(faultsOfNumber('1.10')).toEqual([]);
	});

	test('answers no fault for a number of one part', () => {
		expect(faultsOfNumber('2')).toEqual([]);
	});

	test('answers a fault when the number ends with a dot', () => {
		expect(faultsOfNumber('1.1.')).toContainEqual(groupFaultOf('1.1.'));
	});

	test('answers a fault when the number holds a dash', () => {
		expect(faultsOfNumber('1-1')).toContainEqual(groupFaultOf('1-1'));
	});
});

describe('the plan that passes every check', () => {
	const planText = [
		'# A plan of the readers',
		'',
		'## Implementation Plan',
		'',
		'#### Step 1.1: The first reader',
		'',
		'**Goal**: the reader answers the steps of a plan.',
		'',
		'**Files to create**:',
		'',
		'1. `src/generator/read-one.js`',
		'2. `tests/generator/read-one.test.js`',
		'',
		'**Files to modify**: `none`',
		'',
		'**Files to delete**: `none`',
		'',
		'---',
		'',
		'#### Step 1.2: The second reader',
		'',
		'**Goal**: the reader answers the groups of a plan.',
		'',
		'**Files to create**:',
		'',
		'1. `src/generator/read-two.js`',
		'2. `tests/generator/read-two.test.js`',
		'',
		'**Files to modify**: `none`',
		'',
		'**Files to delete**: `none`',
		'',
		'---',
		'',
		'#### Step 2.1: The writer',
		'',
		'**Goal**: the writer answers the whole text of the script.',
		'',
		'**Files to create**:',
		'',
		'1. `src/generator/write-one.js`',
		'',
		'**Files to modify**: `none`',
		'',
		'**Files to delete**: `none`',
		'',
		'---',
		'',
		'**Total**: 1 phase, 3 steps.',
		'',
		'## Progress',
		'',
		'### Step 1.1: The first reader',
		'',
		'**Done**',
		''
	].join('\n');

	const block = {
		groups: [
			{ name: 'The readers', steps: ['1.1', '1.2'] },
			{ name: 'The writer', steps: ['2.1'] }
		],
		dependencies: { '1.2': ['1.1'], '2.1': ['1.1', '1.2'] }
	};

	test('answers no fault for a plan whose sidecar, prose and count all agree', () => {
		expect(validatePlan({ planPath, planText, block })).toEqual([]);
	});
});
