import { describe, expect, test } from '@jest/globals';

import { runProgressOf } from '../../src/generator/run-progress-of.js';

const AT = 1_700_000_000_000,
	SECOND = 1000,
	journalOf = (entries) => entries.map((entry) => JSON.stringify(entry)).join('\n'),
	startedAt = (agentId) => ({ type: 'started', key: `v2:${agentId}`, agentId }),
	resultOf = ({ agentId, step }) => ({
		type: 'result',
		key: `v2:${agentId}`,
		agentId,
		result: `{'step': '${step}', 'status': 'done'}`
	}),
	agentOf = ({ agentId, silentSeconds, label = '' }) => ({
		agentId,
		label,
		modifiedAt: AT - silentSeconds * SECOND
	});

describe('what a workflow run has reached', () => {
	test('counts the distinct agents that started and the distinct agents that answered', () => {
		expect(runProgressOf({
			journalText: journalOf([
				startedAt('a1'),
				startedAt('a2'),
				resultOf({ agentId: 'a1', step: 'Step 1.1: the first thing' })
			]),
			agents: [agentOf({ agentId: 'a2', silentSeconds: 4 })],
			at: AT
		})).toEqual(expect.objectContaining({ started: 2, settled: 1, failed: [] }));
	});

	test('names the step of each agent that answered, in journal order', () => {
		expect(runProgressOf({
			journalText: journalOf([
				startedAt('a1'),
				startedAt('a2'),
				resultOf({ agentId: 'a1', step: 'Step 1.1: the first thing' }),
				resultOf({ agentId: 'a2', step: 'Step 1.2: the second thing' })
			]),
			agents: [],
			at: AT
		}).settledSteps).toEqual(['Step 1.1: the first thing', 'Step 1.2: the second thing']);
	});

	test('names the step of an answer the journal wrote as a record and not as text', () => {
		expect(runProgressOf({
			journalText: journalOf([
				startedAt('a1'),
				{ type: 'result', key: 'v2:a1', agentId: 'a1', result: { step: 'Step 1.1: the first thing', status: 'done' } }
			]),
			agents: [],
			at: AT
		}).settledSteps).toEqual(['Step 1.1: the first thing']);
	});

	test('names an agent that started and has not answered as live, with the age of its transcript', () => {
		expect(runProgressOf({
			journalText: journalOf([startedAt('a1'), startedAt('a2'), resultOf({ agentId: 'a1', step: 'Step 1.1: a thing' })]),
			agents: [agentOf({ agentId: 'a2', silentSeconds: 12, label: '1.5' })],
			at: AT
		}).live).toEqual([{ agentId: 'a2', label: '1.5', silentSeconds: 12, stuck: false }]);
	});

	test('marks a live agent stuck when its transcript has not grown for longer than ten minutes', () => {
		expect(runProgressOf({
			journalText: journalOf([startedAt('a1')]),
			agents: [agentOf({ agentId: 'a1', silentSeconds: 601, label: '1.5' })],
			at: AT
		}).live).toEqual([{ agentId: 'a1', label: '1.5', silentSeconds: 601, stuck: true }]);
	});

	test('marks a live agent not stuck when its transcript grew exactly ten minutes ago', () => {
		expect(runProgressOf({
			journalText: journalOf([startedAt('a1')]),
			agents: [agentOf({ agentId: 'a1', silentSeconds: 600 })],
			at: AT
		}).live).toEqual([{ agentId: 'a1', label: '', silentSeconds: 600, stuck: false }]);
	});

	test('answers a null age and no stuck mark for a live agent that has written no transcript', () => {
		expect(runProgressOf({
			journalText: journalOf([startedAt('a1')]),
			agents: [],
			at: AT
		}).live).toEqual([{ agentId: 'a1', label: '', silentSeconds: null, stuck: false }]);
	});

	test('names each agent the journal records as failed, and leaves it out of the live agents', () => {
		const progress = runProgressOf({
			journalText: journalOf([startedAt('a1'), { type: 'failed', key: 'v2:a1', agentId: 'a1' }]),
			agents: [agentOf({ agentId: 'a1', silentSeconds: 900 })],
			at: AT
		});

		expect(progress.failed).toEqual(['a1']);
		expect(progress.live).toEqual([]);
	});

	test('passes over a line it cannot parse, because the journal is appended to while it is read', () => {
		expect(runProgressOf({
			journalText: [JSON.stringify(startedAt('a1')), '{"type":"started","agen'].join('\n'),
			agents: [agentOf({ agentId: 'a1', silentSeconds: 3 })],
			at: AT
		})).toEqual(expect.objectContaining({ started: 1, settled: 0 }));
	});

	test('answers no live agent and no step when the journal holds nothing', () => {
		expect(runProgressOf({ journalText: '', agents: [], at: AT }))
			.toEqual({ started: 0, settled: 0, failed: [], settledSteps: [], live: [] });
	});
});
