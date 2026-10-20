const NOTHING = ['none', 'n/a'],
	statesSomething = (text) => text !== undefined && text.trim() !== '' && !NOTHING.includes(text.trim().toLowerCase()),
	statedOf = ({ heading, body }) =>
		statesSomething(body) ? [{ heading, body: body ?? '' }] : [],
	stepLessonsOf = (line) => [
		...statedOf({ heading: `step ${line.step} — blocker`, body: line.event.blocker }),
		...statedOf({ heading: `step ${line.step} — deviation`, body: line.event.deviation }),
		...statedOf({ heading: `step ${line.step} — defect carried forward`, body: line.event.carryForwardDefect }),
		...statedOf({ heading: `step ${line.step} — design it had to decide`, body: line.event.decisionForLaterSteps })
	],
	gateLessonsOf = (line) =>
		statedOf({
			heading: line.event.kind === 'barrier' ? 'barrier — summary' : `gate ${line.group} — summary`,
			body: line.event.summary
		}),
	checkLessonsOf = (line) => {
		if (line.event.kind === 'planFaults') {
			return line.event.faults.map((one) => ({
				heading: `plan fault${one.steps === undefined || one.steps.length === 0 ? '' : ` (${one.steps.join(', ')})`}`,
				body: one.fault
			}));
		}
		return line.event.answer === 'held'
			? []
			: [{
				heading: `step ${line.step ?? '?'} — claim ${line.event.answer}`,
				body: `${line.event.claim}\n${line.event.evidence}${statesSomething(line.event.inspect) ? `\n${line.event.inspect ?? ''}` : ''}`
			}];
	},
	runLessonsOf = (line) =>
		line.event.kind === 'runEnded'
			? statedOf({ heading: `run ${line.run} ${line.event.outcome} — what a person said`, body: line.event.said })
			: [],
	lessonsOf = (line) => {
		if (line.agentType === 'workflow-worker') {
			return stepLessonsOf(line);
		}
		if (line.agentType === 'workflow-gate') {
			return gateLessonsOf(line);
		}
		return line.agentType === 'workflow-check' ? checkLessonsOf(line) : runLessonsOf(line);
	};

/**
 * Every lesson the artefact of a plan holds, in the order the run recorded it.
 *
 * A plan a workflow runs writes NO session note: no agent writes prose, and each
 * lesson sits in a named field of a record. This rule answers those fields and
 * nothing else, so the archive command reads what the run learned without
 * reading what the run merely did.
 *
 * A field that states `none` or nothing is not a lesson. A claim the check HELD
 * is not a lesson either, because a claim that stands taught nobody anything.
 *
 * A field that says "no blocker stopped the work" in prose is KEPT, and the rule
 * reads no such sentence. The cost of keeping one is a glance, and the cost of
 * dropping one is a lesson nobody reads: a worker that opened with "No blocker
 * stopped the work" went on to name a refused command in the same field.
 *
 * A summary of a gate is always a lesson: a gate states what the merged tree
 * cost and every fault of the framework it met, and no field of it separates
 * the two.
 */
export const lessonLines = (lines) => {
	const lessons = lines.flatMap(lessonsOf);

	return lessons.length === 0
		? ['this run recorded no lesson']
		: lessons.flatMap(({ heading, body }) => [`### ${heading}`, '', body, '']);
};
