const SOURCE_LINE = /Source:\s*(\d+(?:\.\d+)*)\s+of\s/u,
	GOAL_LINE = /The name of the goal to run:\s*([\w-]+)/u,
	CHECK_LINE = /Answer for the claim of each step this run sent/u,
	matchedOf = ({ head, pattern }) => {
		const parts = pattern.exec(head);

		return parts === null ? null : parts[1] ?? null;
	};

/**
 * What one agent of a workflow run is doing, read off the head of its
 * transcript, and an empty string where the head names no role.
 *
 * The three roles of a run each state themselves in the first words of their
 * prompt, so the label needs no journal and no script: a worker names the step
 * it was lifted from, a gate names the goal it runs, and the check agent states
 * what it answers for. A person reading a progress line needs the ROLE and not
 * the agent id, and the id says nothing about which of the three is holding the
 * run.
 */
export const labelOfAgent = (head) => {
	const step = matchedOf({ head, pattern: SOURCE_LINE });

	if (step !== null) {
		return `step ${step}`;
	}
	const goal = matchedOf({ head, pattern: GOAL_LINE });

	if (goal !== null) {
		return `gate ${goal}`;
	}
	return CHECK_LINE.test(head) ? 'check' : '';
};
