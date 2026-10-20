import { describe, expect, test } from '@jest/globals';

import { readExecutionPlan } from '../../src/generator/read-execution-plan.js';

const path = 'plans/a-plan.plan.json',
	readOf = (lines) => readExecutionPlan({ path, text: lines.join('\n') });

describe('the execution plan beside a plan', () => {
	test('answers the groups in file order and the dependencies of the file', () => {
		expect(readOf([
			'{',
			'  "groups": [',
			'    { "name": "A", "steps": ["1.1", "1.2"] },',
			'    { "name": "B", "steps": ["2.1"] }',
			'  ],',
			'  "dependencies": { "1.2": ["1.1"], "2.1": ["1.1", "1.2"] }',
			'}'
		])).toEqual({
			groups: [
				{ name: 'A', steps: ['1.1', '1.2'] },
				{ name: 'B', steps: ['2.1'] }
			],
			dependencies: { '1.2': ['1.1'], '2.1': ['1.1', '1.2'] }
		});
	});

	test('answers an empty groups array and an empty dependencies map when the file states neither key', () => {
		expect(readOf(['{}'])).toEqual({ groups: [], dependencies: {} });
	});

	test('throws an error that names the path and the parse fault when the text is not JSON', () => {
		expect(() => readOf([
			'{',
			'  "groups": [,]',
			'}'
		])).toThrow(new RegExp(`^${path} is not JSON: .+`, 'u'));
	});

	test('throws an error that names the path when the text states an array and no object', () => {
		expect(() => readOf(['[]'])).toThrow(`${path} states a value that is not a JSON object`);
	});

	test('throws an error that names the path when the text states null', () => {
		expect(() => readOf(['null'])).toThrow(`${path} states a value that is not a JSON object`);
	});

	test('throws an error that names the key when the file states a key beyond groups and dependencies', () => {
		expect(() => readOf([
			'{ "groups": [], "dependencies": {}, "chains": [], "criticalPath": [] }'
		])).toThrow(`${path} states the keys "chains", "criticalPath", and only "groups" and "dependencies" are allowed`);
	});

	test('throws an error that names what it found when a group states no steps', () => {
		expect(() => readOf([
			'{ "groups": [{ "name": "A" }] }'
		])).toThrow(`${path} states "groups" that is not an array of a name and an array of step names`);
	});

	test('throws an error that names what it found when a dependency does not state an array of step names', () => {
		expect(() => readOf([
			'{ "dependencies": { "1.2": "1.1" } }'
		])).toThrow(`${path} states "dependencies" that is not a map of arrays of step names`);
	});
});
