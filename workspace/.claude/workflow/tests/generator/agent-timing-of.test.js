import { describe, expect, test } from '@jest/globals';

import { agentTimingOf } from '../../src/generator/agent-timing-of.js';

const momentOf = ({ at, from = 'agent', carriesWork = true, toolCalls = 0, request = `req-${at}`, outTokens = 0, cacheReadTokens = 0 }) =>
		({ at, from, carriesWork, toolCalls, request, outTokens, cacheReadTokens }),
	timingOf = (moments) => agentTimingOf({ who: 'gate A', moments: moments.map(momentOf) }),
	ONE_CALL = [
		{ at: 1000, from: 'agent', toolCalls: 1, request: 'req-a', outTokens: 40 },
		{ at: 3000, from: 'tool', request: 'req-a' },
		{ at: 8000, from: 'agent', toolCalls: 1, request: 'req-b', outTokens: 60 },
		{ at: 9000, from: 'tool', request: 'req-b' }
	];

describe('agentTimingOf', () => {
	test('names the agent it was given', () => {
		expect(timingOf(ONE_CALL).who).toEqual('gate A');
	});

	test('answers the moment the agent started', () => {
		expect(timingOf(ONE_CALL).startedAt).toEqual(1000);
	});

	test('answers the wall clock from the first moment to the last', () => {
		expect(timingOf(ONE_CALL).wall).toEqual(8000);
	});

	test('counts the gap before a moment of the agent as the time of the model', () => {
		expect(timingOf(ONE_CALL).llm).toEqual(5000);
	});

	test('counts the gap before a moment of a tool as the time of that tool', () => {
		expect(timingOf(ONE_CALL).tool).toEqual(3000);
	});

	test('counts every tool call of every moment', () => {
		expect(timingOf(ONE_CALL).toolCalls).toEqual(2);
	});

	test('counts a gap before a moment that carries no work in neither total', () => {
		const timing = timingOf([
			{ at: 1000 },
			{ at: 4000, carriesWork: false },
			{ at: 5000 }
		]);

		expect([timing.llm, timing.tool, timing.wall]).toEqual([1000, 0, 4000]);
	});

	test('counts the output tokens of a request once, however many moments carry it', () => {
		expect(timingOf([
			{ at: 1000, request: 'req-a', outTokens: 3 },
			{ at: 2000, request: 'req-a', outTokens: 581 },
			{ at: 3000, request: 'req-b', outTokens: 40 }
		]).outTokens).toEqual(621);
	});

	test('counts the cache read of a request once, however many moments carry it', () => {
		expect(timingOf([
			{ at: 1000, request: 'req-a', outTokens: 3, cacheReadTokens: 900 },
			{ at: 2000, request: 'req-a', outTokens: 581, cacheReadTokens: 900 }
		]).cacheReadTokens).toEqual(900);
	});

	test('answers every total as zero for an agent that holds no moment', () => {
		expect(agentTimingOf({ who: 'check', moments: [] }))
			.toEqual({ who: 'check', startedAt: 0, wall: 0, llm: 0, tool: 0, toolCalls: 0, outTokens: 0, cacheReadTokens: 0 });
	});
});
