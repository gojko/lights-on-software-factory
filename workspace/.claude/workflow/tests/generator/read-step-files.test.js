import { describe, expect, test } from '@jest/globals';

import { readStepFiles } from '../../src/generator/read-step-files.js';

const bodyOf = (lines) => lines.join('\n');

describe('the file boundary of a step', () => {
	test('answers the union of the three lists in the order the step states them', () => {
		expect(readStepFiles(bodyOf([
			'**Goal**: something.',
			'',
			'**Files to create**:',
			'',
			'1. `src/a/one.js`',
			'2. `tests/a/one.test.js`',
			'',
			'**Files to modify**:',
			'',
			'1. `src/a/two.js`',
			'',
			'**Files to delete**:',
			'',
			'1. `src/a/three.js`',
			'',
			'**Verification**: `jest tests/a`'
		]))).toEqual({ files: ['src/a/one.js', 'tests/a/one.test.js', 'src/a/two.js', 'src/a/three.js'] });
	});

	test('answers no path for a list that states none', () => {
		expect(readStepFiles(bodyOf([
			'**Files to create**:',
			'',
			'1. `src/a/one.js`',
			'',
			'**Files to modify**: `none`',
			'',
			'**Files to delete**: `none`'
		]))).toEqual({ files: ['src/a/one.js'] });
	});

	test('answers an empty array when each of the three lists states none', () => {
		expect(readStepFiles(bodyOf([
			'**Files to create**: `none`',
			'',
			'**Files to modify**: `none`',
			'',
			'**Files to delete**: `none`'
		]))).toEqual({ files: [] });
	});

	test('answers a path once when two lists name one file', () => {
		expect(readStepFiles(bodyOf([
			'**Files to create**: `none`',
			'',
			'**Files to modify**:',
			'',
			'1. `src/a/one.js`',
			'',
			'**Files to delete**:',
			'',
			'1. `src/a/one.js`'
		]))).toEqual({ files: ['src/a/one.js'] });
	});

	test('answers the path a heading states beside itself', () => {
		expect(readStepFiles(bodyOf([
			'**Files to create**: `src/a/one.js`',
			'',
			'**Files to modify**: `none`',
			'',
			'**Files to delete**: `none`'
		]))).toEqual({ files: ['src/a/one.js'] });
	});

	test('answers no path that a heading after the list states', () => {
		expect(readStepFiles(bodyOf([
			'**Files to create**:',
			'',
			'1. `src/a/one.js`',
			'',
			'**Files to modify**: `none`',
			'',
			'**Files to delete**: `none`',
			'',
			'**Written also by**: `src/a/two.js` by step 9.9',
			'',
			'**Verification**: `jest tests/a`'
		]))).toEqual({ files: ['src/a/one.js'] });
	});

	test('answers every item of a list that a nested line breaks', () => {
		expect(readStepFiles(bodyOf([
			'**Files to create**:',
			'',
			'1. `src/a/one.js`',
			'',
			'   - a nested line about `src/a/other.js`',
			'',
			'2. `src/a/two.js`',
			'',
			'**Files to modify**: `none`',
			'',
			'**Files to delete**: `none`'
		]))).toEqual({ files: ['src/a/one.js', 'src/a/two.js'] });
	});

	test('answers no path from a line that states a heading in the middle of a sentence', () => {
		expect(readStepFiles(bodyOf([
			'**Files to create**:',
			'',
			'1. `src/a/one.js`',
			'',
			'**Files to modify**: `none`',
			'',
			'**Files to delete**: `none`',
			'',
			'The three headings are `**Files to create**`, `**Files to modify**` and',
			'`**Files to delete**`.'
		]))).toEqual({ files: ['src/a/one.js'] });
	});

	test('answers the name of the absent heading when the body states two of the three', () => {
		expect(readStepFiles(bodyOf([
			'**Goal**: something.',
			'',
			'**Files to create**:',
			'',
			'1. `src/a/one.js`',
			'',
			'**Files to modify**: `none`'
		]))).toEqual({ absentHeadings: ['Files to delete'] });
	});

	test('answers the name of each heading when the body states none of the three', () => {
		expect(readStepFiles(bodyOf([
			'**Goal**: something.',
			'',
			'**Verification**: `jest tests/a`'
		]))).toEqual({ absentHeadings: ['Files to create', 'Files to modify', 'Files to delete'] });
	});
});
