import { describe, expect, test } from '@jest/globals';

import { deriveStages } from '../../src/generator/derive-stages.js';

const stagesOf = ({ name, steps, dependencies }) =>
	deriveStages({ group: { name, steps }, dependencies });

describe('the stages of a group', () => {
	test('answers one stage that holds every step when the group states no dependency', () => {
		expect(stagesOf({ name: 'A', steps: ['1.1', '1.2', '1.3'], dependencies: {} })).toEqual([['1.1', '1.2', '1.3']]);
	});

	test('answers no stage when the group states no step', () => {
		expect(stagesOf({ name: 'A', steps: [], dependencies: { '1.1': ['1.2'] } })).toEqual([]);
	});

	test('answers one stage for each step of a chain', () => {
		expect(stagesOf({
			name: 'A',
			steps: ['1.1', '1.2', '1.3'],
			dependencies: { '1.2': ['1.1'], '1.3': ['1.2'] }
		})).toEqual([['1.1'], ['1.2'], ['1.3']]);
	});

	test('keeps the order of the group inside a stage', () => {
		expect(stagesOf({
			name: 'A',
			steps: ['1.3', '1.1', '1.2'],
			dependencies: { '1.2': ['1.1'] }
		})).toEqual([['1.3', '1.1'], ['1.2']]);
	});

	test('answers a step in stage 1 when it waits only for a step of an earlier group', () => {
		expect(stagesOf({
			name: 'B',
			steps: ['2.1', '2.2'],
			dependencies: { '2.1': ['1.4'], '2.2': ['2.1', '1.4'] }
		})).toEqual([['2.1'], ['2.2']]);
	});

	test('answers a step after the deepest of its parents when its parents sit in two stages', () => {
		expect(stagesOf({
			name: 'A',
			steps: ['1.1', '1.2', '1.3', '1.4'],
			dependencies: { '1.3': ['1.1'], '1.4': ['1.2', '1.3'] }
		})).toEqual([['1.1', '1.2'], ['1.3'], ['1.4']]);
	});

	test('answers a stage for each depth of a group that holds chains of different lengths', () => {
		expect(stagesOf({
			name: 'B',
			steps: ['2.1', '2.2', '2.3', '2.4', '4.1', '4.2', '8.1', '8.3'],
			dependencies: {
				'2.2': ['2.1'],
				'2.3': ['2.2'],
				'2.4': ['2.3'],
				'4.2': ['4.1'],
				'8.1': ['1.9']
			}
		})).toEqual([['2.1', '4.1', '8.1', '8.3'], ['2.2', '4.2'], ['2.3'], ['2.4']]);
	});

	test('throws an error that names the group and the steps when the dependencies of the group hold a cycle', () => {
		expect(() => stagesOf({
			name: 'B',
			steps: ['2.1', '2.2', '2.3'],
			dependencies: { '2.2': ['2.3'], '2.3': ['2.2'] }
		})).toThrow('group "B" states a dependency cycle that holds the steps 2.2, 2.3');
	});

	test('throws an error that names the step when a step of the group waits for itself', () => {
		expect(() => stagesOf({
			name: 'A',
			steps: ['1.1'],
			dependencies: { '1.1': ['1.1'] }
		})).toThrow('group "A" states a dependency cycle that holds the steps 1.1');
	});
});
