import { describe, expect, test } from '@jest/globals';

import { runTimingLines } from '../../src/generator/run-timing-lines.js';

const timingOf = ({ who, startedAt = 0, wall = 1000, llm = 700, tool = 300, toolCalls = 2, outTokens = 50, cacheReadTokens = 900 }) =>
		({ who, startedAt, wall, llm, tool, toolCalls, outTokens, cacheReadTokens }),
	linesOf = (timings) => runTimingLines(timings.map(timingOf)),
	textOf = (timings) => linesOf(timings).join('\n'),
	THREE = [
		{ who: 'step 1.1', startedAt: 300, wall: 74500, llm: 71000, tool: 3500 },
		{ who: 'barrier', startedAt: 100, wall: 251700, llm: 100200, tool: 151500 },
		{ who: 'gate A', startedAt: 200, wall: 141500, llm: 99800, tool: 41600 }
	];

describe('runTimingLines', () => {
	test('names every agent it was given', () => {
		expect(textOf(THREE)).toMatch(/barrier[\s\S]*gate A[\s\S]*step 1\.1/u);
	});

	test('reports the agents in the order they started', () => {
		expect(linesOf(THREE).findIndex((line) => line.startsWith('barrier')))
			.toBeLessThan(linesOf(THREE).findIndex((line) => line.startsWith('gate A')));
	});

	test('states each time in seconds, because a millisecond says nothing about an agent', () => {
		expect(textOf([{ who: 'gate A', wall: 141500, llm: 99800, tool: 41600 }])).toContain('141.5');
	});

	test('answers one line for each agent, beside the heading, the total and the verdict', () => {
		expect(linesOf(THREE)).toHaveLength(6);
	});

	test('totals the wall clock of every agent', () => {
		expect(textOf(THREE)).toContain('467.7');
	});

	test('states the share of the wall clock the model held', () => {
		expect(textOf([
			{ who: 'a', wall: 100000, llm: 80000, tool: 20000 },
			{ who: 'b', wall: 100000, llm: 80000, tool: 20000 }
		])).toContain('80%');
	});

	test('names the agent that held the most wall clock', () => {
		expect(textOf(THREE)).toContain('barrier');
	});

	test('says that no agent ran where it is given none', () => {
		expect(runTimingLines([])).toEqual(['no agent of this run wrote a transcript']);
	});
});
