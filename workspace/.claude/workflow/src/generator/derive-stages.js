const inGroupParentsOf = ({ step, steps, dependencies }) =>
	(dependencies[step] ?? []).filter((parent) => steps.has(parent));

/**
 * The stages of one group, in the order they run.
 *
 * A stage is an array of step names, in the order the group writes them, and
 * every step of a stage waits for nothing beyond the stages above it. A step
 * that waits for a step of another group waits for nothing here, because a
 * group runs only when every group above it is finished.
 *
 * The function throws an error that names the group and the steps that remain
 * where the dependencies inside the group hold a cycle.
 */
export const deriveStages = ({ group, dependencies }) => {
	const steps = new Set(group.steps),
		placed = new Set(),
		stages = [];
	let waiting = [...group.steps];

	while (waiting.length > 0) {
		const stage = waiting.filter((step) => inGroupParentsOf({ step, steps, dependencies }).every((parent) => placed.has(parent)));

		if (stage.length === 0) {
			throw new Error(`group "${group.name}" states a dependency cycle that holds the steps ${waiting.join(', ')}`);
		}
		stage.forEach((step) => placed.add(step));
		stages.push(stage);
		waiting = waiting.filter((step) => !placed.has(step));
	}
	return stages;
};
