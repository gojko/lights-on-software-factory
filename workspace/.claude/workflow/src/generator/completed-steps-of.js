const DONE_STATUSES = ['done', 'doneWithDeviation'],
	lastWorkerOf = ({ lines, step }) =>
		lines.flatMap((line, index) => line.agentType === 'workflow-worker' && line.step === step ? [{ index, line }] : [])
			.at(-1) ?? null,
	groupOf = ({ lines, run, step }) => {
		const groups = lines
			.flatMap((line) => line.run === run && line.event.kind === 'runStarted' ? [line.event.groups] : [])
			.at(-1);

		return groups?.find(({ steps }) => steps.includes(step))?.name ?? null;
	},
	isGateGreen = ({ lines, run, group }) =>
		lines.flatMap((line) => line.agentType === 'workflow-gate' && line.run === run && line.group === group
			? [line.event.green]
			: []).at(-1) ?? false,
	isUnmarkedAfter = ({ lines, index, step }) =>
		lines.slice(index + 1).some((line) => line.agentType === 'workflow-check'
			&& line.step === step
			&& line.event.kind === 'claim'
			&& line.event.answer === 'notHeld'),
	isComplete = ({ lines, step }) => {
		const worker = lastWorkerOf({ lines, step });

		if (worker === null || !DONE_STATUSES.includes(worker.line.event.status)) {
			return false;
		}
		const group = groupOf({ lines, run: worker.line.run, step });

		return group !== null
			&& isGateGreen({ lines, run: worker.line.run, group })
			&& !isUnmarkedAfter({ lines, index: worker.index, step });
	};

/**
 * The steps the artefact states as complete, in the order the steps first
 * appear in it.
 *
 * A step is complete when its LAST worker line says `done` or
 * `doneWithDeviation`, the last gate line of that run and that group says
 * green, and no later check claim about it says `notHeld`. A barrier line is a
 * gate line and it names the group it proved, so it marks that group complete.
 *
 * The group of a step comes from the `runStarted` line of the run its last
 * worker line names, and never from the group of today. The plan moves a step
 * from one group to another between two runs, and the rule asks which gate
 * PROVED the step.
 *
 * A step of a run with no `runStarted` line is not complete, because no line
 * places it under a group. A `notProvable` claim never un-marks a step: it
 * means that the check found no evidence, and not that the work is absent.
 *
 * The function reads the artefact alone. It takes no plan and no journal.
 */
export const completedStepsOf = (lines) =>
	[...new Set(lines.flatMap((line) => line.agentType === 'workflow-worker' ? [line.step] : []))]
		.filter((step) => isComplete({ lines, step }));
