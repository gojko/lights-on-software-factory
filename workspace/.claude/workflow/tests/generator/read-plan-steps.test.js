import { describe, expect, test } from '@jest/globals';

import { readPlanSteps } from '../../src/generator/read-plan-steps.js';

const planOf = (lines) => lines.join('\n');

describe('the steps of a plan', () => {
	test('answers the number, the title, the body and the line range of each step in file order', () => {
		expect(readPlanSteps(planOf([
			'# A plan',
			'',
			'## Implementation Plan',
			'',
			'#### Step 1.1: The first thing',
			'',
			'**Goal**: the first goal.',
			'',
			'---',
			'',
			'#### Step 1.2: The second thing',
			'',
			'**Goal**: the second goal.',
			''
		]))).toEqual([
			{ step: '1.1', title: 'The first thing', body: '**Goal**: the first goal.', from: 5, to: 8 },
			{ step: '1.2', title: 'The second thing', body: '**Goal**: the second goal.', from: 11, to: 14 }
		]);
	});

	test('answers the body verbatim, with the blank lines and the indentation of the plan', () => {
		expect(readPlanSteps(planOf([
			'## Implementation Plan',
			'',
			'#### Step 2.1: The shape',
			'',
			'**Files to create**:',
			'',
			'1. `a/b.js`',
			'',
			'   - a nested line',
			'',
			'**Verification**: `jest a`',
			'',
			'---'
		]))).toEqual([{
			step: '2.1',
			title: 'The shape',
			body: '**Files to create**:\n\n1. `a/b.js`\n\n   - a nested line\n\n**Verification**: `jest a`',
			from: 3,
			to: 12
		}]);
	});

	test('ends the body at the next heading and answers no step for a heading that names no step', () => {
		expect(readPlanSteps(planOf([
			'## Implementation Plan',
			'',
			'#### Step 3.1: The last step of the phase',
			'',
			'**Goal**: something.',
			'',
			'#### Phase 3 Outcome',
			'',
			'The phase is done.'
		]))).toEqual([{ step: '3.1', title: 'The last step of the phase', body: '**Goal**: something.', from: 3, to: 6 }]);
	});

	test('leaves out a step that a section after the Implementation Plan states', () => {
		expect(readPlanSteps(planOf([
			'## Implementation Plan',
			'',
			'#### Step 4.1: Inside',
			'',
			'**Goal**: inside.',
			'',
			'## Progress',
			'',
			'### Step 4.2: Outside',
			'',
			'Done.'
		]))).toEqual([{ step: '4.1', title: 'Inside', body: '**Goal**: inside.', from: 3, to: 6 }]);
	});

	test('answers an empty array when the plan states no Implementation Plan section', () => {
		expect(readPlanSteps(planOf([
			'# A plan',
			'',
			'## Current Context',
			'',
			'#### Step 1.1: Not a step of the plan',
			'',
			'**Goal**: nothing.'
		]))).toEqual([]);
	});

	test('reads no step heading and no separator inside a code fence', () => {
		expect(readPlanSteps(planOf([
			'## Implementation Plan',
			'',
			'#### Step 6.1: The generated script',
			'',
			'```markdown',
			'---',
			'#### Step 9.9: An example inside a fence',
			'```',
			'',
			'**Verification**: `jest x`',
			'',
			'---'
		]))).toEqual([{
			step: '6.1',
			title: 'The generated script',
			body: '```markdown\n---\n#### Step 9.9: An example inside a fence\n```\n\n**Verification**: `jest x`',
			from: 3,
			to: 11
		}]);
	});

	test('answers the whole number when the phase of the step number holds a letter', () => {
		expect(readPlanSteps(planOf([
			'## Implementation Plan',
			'',
			'#### Step 2a.1: A phase with a letter',
			'',
			'**Goal**: the goal of the lettered step.',
			'',
			'---'
		]))).toEqual([{
			step: '2a.1',
			title: 'A phase with a letter',
			body: '**Goal**: the goal of the lettered step.',
			from: 3,
			to: 6
		}]);
	});

	test('answers no step when the first token after Step is a word and not a number', () => {
		expect(readPlanSteps(planOf([
			'## Implementation Plan',
			'',
			'#### Step Rules: what a step states',
			'',
			'A step states the files it writes.',
			'',
			'---'
		]))).toEqual([]);
	});
});
