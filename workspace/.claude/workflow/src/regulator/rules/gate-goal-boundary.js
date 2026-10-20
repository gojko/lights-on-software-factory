import { makeGoals } from '../make-goals.js';

const SEPARATORS = new Set(['&&', '||', ';', '|', '&']),
	outsideThePrefix = (goals) => goals.filter((goal) => !goal.startsWith('workflow-')),
	refusesTheGoals = (goals) => goals.length === 0 || outsideThePrefix(goals).length > 0,

	tokensFromTheTool = (command) => {
		const tokens = command.trim().split(/\s+/u);
		return tokens.slice(Math.max(tokens.indexOf('make'), 0));
	},
	goalsOfTheCommand = (command) => {
		const fromTheTool = tokensFromTheTool(command),
			end = fromTheTool.findIndex((token, index) => index > 0 && SEPARATORS.has(token));
		return makeGoals(end < 0 ? fromTheTool : fromTheTool.slice(0, end));
	},
	refusedNames = (command) => {
		const refused = outsideThePrefix(goalsOfTheCommand(command));
		return refused.length > 0 ? refused.map((goal) => `\`${goal}\``).join(' and ') : 'the default goal';
	},

	gateGoalBoundaryRule = {
		id: 'gate-goal-boundary',
		decision: 'deny',
		appliesTo: (context) => context.agentType === 'workflow-gate',
		reason: (command) =>
			`Run a goal whose name starts with \`workflow-\`, and no other: a gate reaches a \`workflow-\` goal alone, and ${refusedNames(command)} belongs to another role. A \`NAME=value\` argument does not change the answer. To narrow a red suite, run \`jest <file>\` or \`eslint <file>\` bare — both are yours.`,
		matchSegment: (tokens) => tokens[0] === 'make' && refusesTheGoals(makeGoals(tokens))
	};

export { gateGoalBoundaryRule };
