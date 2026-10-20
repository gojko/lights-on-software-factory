const COLUMNS = [
		{ name: 'agent', width: 14 },
		{ name: 'wall s', width: 9 },
		{ name: 'llm s', width: 9 },
		{ name: 'tool s', width: 9 },
		{ name: 'calls', width: 7 },
		{ name: 'out tok', width: 10 },
		{ name: 'cache rd', width: 11 }
	],
	secondsOf = (milliseconds) => (milliseconds / 1000).toFixed(1),
	shareOf = ({ part, whole }) => whole === 0 ? 0 : Math.round(part * 100 / whole),
	rowOf = (cells) => cells
		.map((cell, at) => at === 0 ? cell.padEnd(COLUMNS[at]?.width ?? 0) : cell.padStart(COLUMNS[at]?.width ?? 0))
		.join(''),
	cellsOf = (timing) => [
		timing.who,
		secondsOf(timing.wall),
		secondsOf(timing.llm),
		secondsOf(timing.tool),
		String(timing.toolCalls),
		String(timing.outTokens),
		String(timing.cacheReadTokens)
	],
	totalOf = (timings, read) => timings.reduce((sum, one) => sum + read(one), 0),
	totalRowOf = (timings) => rowOf([
		'TOTAL',
		secondsOf(totalOf(timings, (one) => one.wall)),
		secondsOf(totalOf(timings, (one) => one.llm)),
		secondsOf(totalOf(timings, (one) => one.tool)),
		String(totalOf(timings, (one) => one.toolCalls)),
		String(totalOf(timings, (one) => one.outTokens)),
		String(totalOf(timings, (one) => one.cacheReadTokens))
	]),
	verdictOf = (timings) => {
		const wall = totalOf(timings, (one) => one.wall),
			llm = totalOf(timings, (one) => one.llm),
			longest = [...timings].sort((a, b) => b.wall - a.wall)[0];

		return `The model held ${shareOf({ part: llm, whole: wall })}% of the agent time, and the tools held ${shareOf({ part: totalOf(timings, (one) => one.tool), whole: wall })}%. The longest agent was ${longest?.who ?? 'none'}, at ${secondsOf(longest?.wall ?? 0)} s.`;
	};

/**
 * The report of what a run cost, one line for each agent and one total.
 *
 * The agents are in the order they STARTED, so a reader sees the stages of the
 * run in the order the run ran them, and not a ranking.
 *
 * The total of `wall` adds the agents of every stage, so it is larger than the
 * time the run took: the agents of one stage run beside each other. It states
 * what the run SPENT and not how long a person waited.
 *
 * The verdict names the share the model held. That share is a proxy and not a
 * measure of generation: the time between the answer of a tool and the reply
 * after it holds the queue and the scheduling of a request too.
 */
export const runTimingLines = (timings) => {
	if (timings.length === 0) {
		return ['no agent of this run wrote a transcript'];
	}
	const ordered = [...timings].sort((a, b) => a.startedAt - b.startedAt);

	return [
		rowOf(COLUMNS.map((column) => column.name)),
		...ordered.map((one) => rowOf(cellsOf(one))),
		totalRowOf(ordered),
		verdictOf(ordered)
	];
};
