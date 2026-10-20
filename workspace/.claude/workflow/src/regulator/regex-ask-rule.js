import { isWorkflowAgent } from './is-workflow-agent.js';

function regexAskRule({ id, regex, reason }) {
	if (!id) {
		throw new Error('regexAskRule: id is required');
	}
	if (!regex) {
		throw new Error('regexAskRule: regex is required');
	}
	const resolvedReason = reason ?? id;
	return {
		id,
		decision: 'ask',
		reason: resolvedReason,
		appliesTo: (context) => !isWorkflowAgent(context),
		matchSegment: (tokens) => regex.test(tokens.join(' '))
	};
}

export { regexAskRule };
