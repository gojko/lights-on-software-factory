import { describe, expect, test } from '@jest/globals';

import { readProgressLines } from '../../src/generator/read-progress-lines.js';

const RUN = 'wf_a8009725-679',
	runStarted = {
		at: '2026-09-03T10:02:04Z',
		run: RUN,
		agentType: 'orchestrator',
		event: {
			kind: 'runStarted',
			plan: 'plans/a-plan.md',
			groups: [{ name: 'A', steps: ['1.1'] }, { name: 'B', steps: ['2.1'] }]
		}
	},
	worker = {
		at: '2026-09-03T10:09:41Z',
		run: RUN,
		key: 'v2:89a3043de7a0de30',
		agent: 'ab461a19b5edfe2a0',
		agentType: 'workflow-worker',
		step: '1.1',
		event: {
			kind: 'step',
			status: 'done',
			summary: 'The port answers one count for each region.',
			filesWritten: ['src/model/region-counts.js']
		}
	},
	gate = {
		at: '2026-09-03T10:16:52Z',
		run: RUN,
		key: 'v2:3519145219fff2f7',
		agent: 'aeb01115fffc24ac2',
		agentType: 'workflow-gate',
		group: 'A',
		event: { kind: 'gate', green: true, needsRework: [], blocked: 'none', summary: 'The merged tree is green.' }
	},
	textOf = (lines) =>
		lines.map((line) => typeof line === 'string' ? line : JSON.stringify(line)).join('\n'),
	filesWrittenOf = (lines) =>
		lines.flatMap((line) => line.event.kind === 'step' ? line.event.filesWritten : []);

describe('the lines one artefact text holds', () => {
	test('answers every well-formed line in file order', () => {
		expect(readProgressLines(textOf([runStarted, worker, gate]))).toEqual([runStarted, worker, gate]);
	});

	test('answers the lines around a torn line, because the file is appended to while it is read', () => {
		expect(readProgressLines(textOf([runStarted, '{"at":"2026-09-03T10:0', gate])))
			.toEqual([runStarted, gate]);
	});

	test('answers the lines around an empty line', () => {
		expect(readProgressLines(textOf([worker, '', gate]))).toEqual([worker, gate]);
	});

	test('answers one line when the text states one line and a trailing newline', () => {
		expect(readProgressLines(`${textOf([worker])}\n`)).toEqual([worker]);
	});

	test('answers an empty array when the text is empty', () => {
		expect(readProgressLines('')).toEqual([]);
	});

	test('passes over a line that states a JSON value which is not an object', () => {
		expect(readProgressLines(textOf(['[]', '12', 'null', worker]))).toEqual([worker]);
	});

	test('passes over a line of the journal, because it states no event of the artefact', () => {
		expect(readProgressLines(textOf([{ type: 'started', key: 'v2:89a3', agentId: 'ab46' }, worker])))
			.toEqual([worker]);
	});

	test('passes over a line whose event states a kind no artefact event holds', () => {
		expect(readProgressLines(textOf([{ ...worker, event: { kind: 'reworked' } }, gate]))).toEqual([gate]);
	});

	test('passes over a line that states no run and a line that states no timestamp', () => {
		expect(readProgressLines(textOf([{ ...worker, run: 12 }, { ...gate, at: null }]))).toEqual([]);
	});

	test('answers a line a reader reaches by event.kind alone', () => {
		expect(filesWrittenOf(readProgressLines(textOf([runStarted, worker, gate]))))
			.toEqual(['src/model/region-counts.js']);
	});
});
