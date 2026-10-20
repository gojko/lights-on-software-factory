function joinReasons(decisions) {
	const reasons = decisions.map((d) => d.reason).filter((r) => r !== undefined && r !== null && r !== ''),
	 unique = [];
	for (const reason of reasons) {
		if (!unique.includes(reason)) {
			unique.push(reason);
		}
	}
	return unique.join('\n\n');
}

function mergeDecisions(perSegmentDecisions) {
	const denies = perSegmentDecisions.filter((d) => d.decision === 'deny');
	if (denies.length > 0) {
		return { decision: 'deny', reason: joinReasons(denies) };
	}
	const asks = perSegmentDecisions.filter((d) => d.decision === 'ask');
	if (asks.length > 0) {
		return { decision: 'ask', reason: joinReasons(asks) };
	}
	const anyNoMatch = perSegmentDecisions.some((d) => d.decision === 'no-match');
	if (anyNoMatch || perSegmentDecisions.length === 0) {
		return { decision: 'no-match' };
	}
	return { decision: 'allow', reason: perSegmentDecisions[0].reason };
}

export { mergeDecisions };
