import { parseCommand } from './parse-command.js';
import { segmentAttempts } from './segment-attempts.js';
import { resolveAttempts } from './resolve-attempts.js';
import { mergeDecisions } from './merge-decisions.js';

function evaluateCommand({ command, rules, context }) {
	const parsed = parseCommand(command);
	if (parsed.tooComplex) {
		return {
			decision: 'deny',
			reason:
				parsed.reason ??
				'claude-bash-regulator: command contains a construct that could not be safely parsed (heredoc, unbalanced quote, brace expansion, or similar). Analyze it with `node .claude/workflow/bin/debug.js` and simplify the command before trying again.'
		};
	}
	const perSegmentDecisions = parsed.segments.map((segment) =>
		resolveAttempts({ attempts: segmentAttempts({ tokens: segment.tokens, originalCommandString: command }), rules, context })
	);
	return mergeDecisions(perSegmentDecisions);
}

export { evaluateCommand };
