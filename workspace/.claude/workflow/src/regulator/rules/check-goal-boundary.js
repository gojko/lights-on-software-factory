const checkGoalBoundaryRule = {
	id: 'check-goal-boundary',
	decision: 'deny',
	appliesTo: (context) => context.agentType === 'workflow-check',
	reason:
		'Read the files, the journal and the reports of the run instead: a check agent reads a run that is finished, and every goal of this tree writes something shared — a cache, a bundle, a report. State what you found in your report.',
	matchSegment: (tokens) => tokens[0] === 'make'
};

export { checkGoalBoundaryRule };
