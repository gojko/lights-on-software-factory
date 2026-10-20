import { evaluateSegment } from './evaluate-segment.js';

function resolveAttempts({ attempts, rules, context }) {
	let resolved = { decision: 'no-match' };
	for (const attempt of attempts) {
		if (attempt.tokens.length > 0) {
			resolved = evaluateSegment({ tokens: attempt.tokens, originalCommandString: attempt.originalCommandString, rules, context });
			if (resolved.decision !== 'no-match') {
				return resolved;
			}
		}
	}
	return resolved;
}

export { resolveAttempts };
