import { isWorkflowAgent } from '../is-workflow-agent.js';
import { stripSystemBinPrefix } from '../strip-system-bin-prefix.js';

const workflowAgentCatchAllRule = {
	id: 'workflow-agent-catch-all',
	decision: 'deny',
	appliesTo: isWorkflowAgent,
	reason: (command) =>
		`No rule of the workflow policy allows \`${command}\`. Do not try another shape of the same command: a rewrite of it gets the same answer. Where you cannot go on without it, report \`blocked\` and name the command in your report.`,

	matchSegment: (tokens) => tokens.length > 0 && stripSystemBinPrefix(tokens) === null
};

export { workflowAgentCatchAllRule };
