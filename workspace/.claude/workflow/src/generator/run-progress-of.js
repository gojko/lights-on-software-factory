const STUCK_AFTER_SECONDS = 600,
	STEP_IN_TEXT = /["']step["']\s*:\s*["']([^"']+)["']/u,
	stepOf = (result) => {
		if (typeof result === 'object' && result !== null) {
			const named = result.step;

			return typeof named === 'string' ? named : null;
		}
		if (typeof result !== 'string') {
			return null;
		}
		const parts = STEP_IN_TEXT.exec(result);

		return parts === null ? null : parts[1] ?? null;
	},
	entryOf = (line) => {
		if (line.trim() === '') {
			return null;
		}
		try {
			const held = JSON.parse(line);

			if (typeof held !== 'object' || held === null) {
				return null;
			}
			const record = held;

			return {
				type: typeof record.type === 'string' ? record.type : '',
				agentId: typeof record.agentId === 'string' ? record.agentId : '',
				step: stepOf(record.result)
			};
		} catch {
			return null;
		}
	},
	entriesOf = (journalText) => journalText.split('\n')
		.map(entryOf)
		.filter((entry) => entry !== null && entry.agentId !== ''),
	idsOf = ({ entries, type }) => [
		...new Set(entries.filter((entry) => entry.type === type).map((entry) => entry.agentId))
	],
	ageOf = ({ agent, at }) => agent === undefined
		? null
		: Math.max(0, Math.floor((at - agent.modifiedAt) / 1000)),
	liveOf = ({ ids, agents, at }) => ids.map((agentId) => {
		const agent = agents.find((one) => one.agentId === agentId),
			silentSeconds = ageOf({ agent, at });

		return {
			agentId,
			label: agent?.label ?? '',
			silentSeconds,
			stuck: silentSeconds !== null && silentSeconds > STUCK_AFTER_SECONDS
		};
	});

/**
 * What one workflow run has reached, out of the text of its `journal.jsonl` and
 * the transcript file of each agent beside it.
 *
 * The journal states which agents started, which answered and which died. The
 * modification time of a transcript states which of the rest are still writing,
 * and the two readings answer different questions: a progress bar shows a dead
 * agent and a stuck agent the same way, and they need different answers.
 *
 * `at` is the moment the reading is taken, in milliseconds, and `modifiedAt` is
 * the modification time of one transcript in the same unit. A line the reader
 * cannot parse, and a line that names no agent, are not a record and are passed
 * over: the journal is appended to while it is read.
 *
 * The answer a `result` line carries is the reply shape of the agent, and the
 * journal writes it as a record where the agent stated a schema and as text
 * where it did not. Both spellings name the step the same way.
 */
export const runProgressOf = ({ journalText, agents, at }) => {
	const entries = entriesOf(journalText),
		started = idsOf({ entries, type: 'started' }),
		settled = idsOf({ entries, type: 'result' }),
		failed = idsOf({ entries, type: 'failed' }),
		ids = started.filter((agentId) => settled.includes(agentId) === false && failed.includes(agentId) === false);

	return {
		started: started.length,
		settled: settled.length,
		failed,
		settledSteps: entries.flatMap((entry) => entry.type === 'result' && entry.step !== null ? [entry.step] : []),
		live: liveOf({ ids, agents, at })
	};
};
