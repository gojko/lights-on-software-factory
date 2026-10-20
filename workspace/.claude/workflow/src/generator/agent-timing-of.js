const EMPTY = { wall: 0, llm: 0, tool: 0, toolCalls: 0 },
	spentOf = (moments) => moments.reduce((spent, moment, at) => {
		const previous = moments[at - 1];

		if (previous === undefined || !moment.carriesWork) {
			return { ...spent, toolCalls: spent.toolCalls + moment.toolCalls };
		}
		const gap = moment.at - previous.at;

		return {
			...spent,
			llm: spent.llm + (moment.from === 'agent' ? gap : 0),
			tool: spent.tool + (moment.from === 'tool' ? gap : 0),
			toolCalls: spent.toolCalls + moment.toolCalls
		};
	}, EMPTY),
	largestOf = (moments) => moments.reduce((best, moment) => {
		const held = best.get(moment.request);

		return held !== undefined && held.outTokens >= moment.outTokens ? best : best.set(moment.request, moment);
	}, new Map()),
	countedOf = (moments) => [...largestOf(moments).values()].reduce(
		(total, moment) => ({
			outTokens: total.outTokens + moment.outTokens,
			cacheReadTokens: total.cacheReadTokens + moment.cacheReadTokens
		}),
		{ outTokens: 0, cacheReadTokens: 0 }
	);

/**
 * What one agent cost, out of the moments of its transcript.
 *
 * The moments are read in the order the transcript wrote them. The gap BEFORE a
 * moment is charged to the side that moment came from, so the time between the
 * answer of a tool and the reply after it is charged to the model. A moment
 * that carries no work charges its gap to nothing.
 *
 * A token count is read once for each REQUEST and never once for each moment.
 * A streamed reply writes the running totals of one request on many lines, so
 * the rule keeps the moment that states the largest output of each request.
 * Adding every line was measured at 22% above the truth on one gate.
 *
 * An agent that holds no moment answers every total as zero, which is what an
 * agent that died before it wrote anything costs.
 */
export const agentTimingOf = ({ who, moments }) => {
	const first = moments[0],
		last = moments[moments.length - 1];

	return first === undefined || last === undefined
		? { who, startedAt: 0, ...EMPTY, outTokens: 0, cacheReadTokens: 0 }
		: { who, startedAt: first.at, ...spentOf(moments), wall: last.at - first.at, ...countedOf(moments) };
};
