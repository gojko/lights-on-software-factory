import { readFileSync } from 'node:fs';
import process from 'node:process';
import { evaluateCommand } from '../src/regulator/evaluate-command.js';
import { hookContext } from '../src/regulator/hook-context.js';
import { loadRules } from '../src/regulator/load-rules.js';
import defaultRules from '../src/regulator/rules.js';

function regulate(event, rules = defaultRules) {
	if (event && event.permission_mode === 'bypassPermissions' && event.tool_name === 'Bash') {
		return {
			exitCode: 2,
			stderr: 'claude-bash-regulator: bypassPermissions mode is not allowed in this project; restart Claude Code without --permission-mode bypassPermissions.'
		};
	}
	if (!event || event.tool_name !== 'Bash') {
		return { exitCode: 0 };
	}
	const decision = evaluateCommand({ command: event.tool_input?.command, rules, context: hookContext(event) });
	if (decision.decision === 'no-match') {
		return { exitCode: 0 };
	}
	const payload = {
		hookSpecificOutput: {
			hookEventName: 'PreToolUse',
			permissionDecision: decision.decision,
			permissionDecisionReason: decision.reason
		}
	};
	return { exitCode: 0, stdout: JSON.stringify(payload) };
}

const main = async () => {
	let parsed, result;
	try {
		parsed = JSON.parse(readFileSync(0, 'utf8'));
	} catch {
		process.stderr.write('claude-bash-regulator: invalid JSON on stdin\n');
		process.exit(1);
	}
	try {
		result = regulate(parsed, await loadRules(process.argv[2]));
	} catch (err) {
		process.stderr.write(`claude-bash-regulator: ${err.message}\n`);
		process.exit(1);
	}
	if (result.stderr) {
		process.stderr.write(`${result.stderr}\n`);
	}
	if (result.stdout) {
		process.stdout.write(result.stdout);
	}
	process.exit(result.exitCode);
};

if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}

export { regulate };
