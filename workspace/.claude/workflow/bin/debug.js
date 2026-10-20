import { readFileSync } from 'node:fs';
import process from 'node:process';
import { parseCommand } from '../src/regulator/parse-command.js';
import { segmentAttempts } from '../src/regulator/segment-attempts.js';
import { resolveAttempts } from '../src/regulator/resolve-attempts.js';
import { mergeDecisions } from '../src/regulator/merge-decisions.js';
import { evaluateCommand } from '../src/regulator/evaluate-command.js';
import { rules } from '../src/regulator/rules.js';

function formatTokens(tokens) {
	return JSON.stringify(tokens);
}

function ruleMatches({ rule, tokens, originalCommandString, context }) {
	const matchesCommand =
		typeof rule.matchSegment === 'function'
			? rule.matchSegment(tokens)
			: typeof rule.matchRaw === 'function' && rule.matchRaw(originalCommandString);
	if (!matchesCommand) {
		return false;
	}
	return typeof rule.appliesTo === 'function' ? rule.appliesTo(context) : true;
}

function tracePerRuleResolution(tokens, originalCommandString, context) {
	const trace = [];
	for (const rule of rules) {
		const matched = ruleMatches({ rule, tokens, originalCommandString, context });
		trace.push({ id: rule.id, decision: rule.decision, matched });
		if (matched) {
			return trace;
		}
	}
	return trace;
}

function traceAttempt(attempt, context) {
	const trace = tracePerRuleResolution(attempt.tokens, attempt.originalCommandString, context);
	return { attempt, trace, matched: trace.find((t) => t.matched) };
}

function resolvingAttempt(attempts, context) {
	const traced = attempts.map((attempt) => traceAttempt(attempt, context));
	return traced.find((t) => t.matched) || traced[traced.length - 1];
}

function describeSegment({ segment, index, command, lines, context }) {
	const rawTokens = segment.tokens,
		attempts = segmentAttempts({ tokens: rawTokens, originalCommandString: command }),
		decision = resolveAttempts({ attempts, rules, context }),
		resolved = resolvingAttempt(attempts, context),
		trace = resolved.trace;
	lines.push(`segment ${index}:`);
	lines.push(`  original: ${JSON.stringify(segment.originalText)}`);
	lines.push(`  tokens: ${formatTokens(rawTokens)}`);
	if (formatTokens(attempts[0].tokens) !== formatTokens(rawTokens)) {
		lines.push(`  unwrapped: ${formatTokens(attempts[0].tokens)}`);
	}
	if (resolved.attempt !== attempts[0]) {
		lines.push(`  system-bin: ${formatTokens(resolved.attempt.tokens)}`);
	}
	const checked = trace.length,
		matchedRule = trace.find((t) => t.matched);
	if (matchedRule) {
		lines.push(`  resolved by rule: ${matchedRule.id} (${checked}/${rules.length} rules checked)`);
		lines.push(`  decision: ${decision.decision}`);
		if (decision.reason) {
			lines.push(`  reason: ${decision.reason}`);
		}
	} else {
		lines.push(`  no rule matched (${rules.length} rules checked)`);
		lines.push(`  decision: ${decision.decision}`);
	}
}

function describePerSegmentDecisions(parsed, command, context) {
	return parsed.segments.map((segment) =>
		resolveAttempts({ attempts: segmentAttempts({ tokens: segment.tokens, originalCommandString: command }), rules, context })
	);
}

function describeRole(context) {
	if (!context.agentType) {
		return `role: the session, with no agent type (${rules.length} rules)`;
	}
	return `role: ${context.agentType} (${rules.length} rules)`;
}

function debugCommand(command, context = {}) {
	const lines = [`command: ${command}`, describeRole(context), ''],
		parsed = parseCommand(command);
	if (parsed.tooComplex) {
		const refusal = evaluateCommand({ command, rules, context });
		lines.push('parse: tooComplex');
		lines.push('merged decision: deny');
		lines.push(`reason: ${refusal.reason}`);
		return lines.join('\n');
	}
	lines.push(`parse: ${parsed.segments.length} segment(s)`);
	lines.push('');
	for (let index = 0; index < parsed.segments.length; index += 1) {
		describeSegment({ segment: parsed.segments[index], index, command, lines, context });
		lines.push('');
	}
	const merged = mergeDecisions(describePerSegmentDecisions(parsed, command, context));
	lines.push(`merged decision: ${merged.decision}`);
	if (merged.reason) {
		lines.push(`merged reason: ${merged.reason}`);
	}
	return lines.join('\n');
}

function readStdin() {
	try {
		return readFileSync(0, 'utf8');
	} catch {
		return '';
	}
}

function resolveRole(argv) {
	const rest = [];
	let agentType, index = 0;
	while (index < argv.length) {
		if (argv[index] === '--agent' && index + 1 < argv.length) {
			agentType = argv[index + 1];
			index += 2;
		} else {
			rest.push(argv[index]);
			index += 1;
		}
	}
	return { context: { agentType }, rest };
}

function resolveCommand(rest) {
	if (rest.length > 0) {
		return rest.join(' ');
	}
	if (process.stdin.isTTY) {
		return '';
	}
	return readStdin().replace(/\n$/, '');
}

const main = () => {
	const { context, rest } = resolveRole(process.argv.slice(2)),
		command = resolveCommand(rest);
	if (!command) {
		process.stderr.write('usage: debug.js [--agent <agent-type>] <command>  (or pipe command via stdin)\n');
		process.exit(1);
	}
	process.stdout.write(debugCommand(command, context) + '\n');
	process.exit(0);
};

if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}

export { debugCommand };
