function matchesCommand(rule, tokens, originalCommandString) {
	const hasSegment = typeof rule.matchSegment === 'function',
	 hasRaw = typeof rule.matchRaw === 'function';
	if (hasSegment && hasRaw) {
		throw new Error(`rule '${rule.id}' declares both matchSegment and matchRaw`);
	}
	if (!hasSegment && !hasRaw) {
		throw new Error(`rule '${rule.id}' declares neither matchSegment nor matchRaw`);
	}
	if (hasSegment) {
		return rule.matchSegment(tokens);
	}
	return rule.matchRaw(originalCommandString);
}

function ruleMatches({ rule, tokens, originalCommandString, context }) {
	if (!matchesCommand(rule, tokens, originalCommandString)) {
		return false;
	}
	if (typeof rule.appliesTo !== 'function') {
		return true;
	}
	return rule.appliesTo(context || {});
}

function resolveReason(reason, originalCommandString) {
	if (typeof reason === 'function') {
		return reason(originalCommandString);
	}
	return reason;
}

function evaluateSegment({ tokens, originalCommandString, rules, context }) {
	for (const rule of rules) {
		if (ruleMatches({ rule, tokens, originalCommandString, context })) {
			return { decision: rule.decision, reason: resolveReason(rule.reason, originalCommandString), id: rule.id };
		}
	}
	return { decision: 'no-match' };
}

export { evaluateSegment };
