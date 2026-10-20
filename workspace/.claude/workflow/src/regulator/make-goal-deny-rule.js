import { makeGoals } from './make-goals.js';

function makeGoalDenyRule({ id, regex, reason, appliesTo }) {
	if (!id) {
		throw new Error('makeGoalDenyRule: id is required');
	}
	if (!regex) {
		throw new Error('makeGoalDenyRule: regex is required');
	}
	if (!reason) {
		throw new Error('makeGoalDenyRule: reason is required');
	}
	return {
		id,
		decision: 'deny',
		reason,
		...(appliesTo ? { appliesTo } : {}),
		matchSegment: (tokens) => makeGoals(tokens).some((goal) => regex.test(goal))
	};
}

export { makeGoalDenyRule };
