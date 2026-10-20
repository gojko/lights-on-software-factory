import { existsSync, readFileSync } from 'node:fs';

import { readExecutionPlan } from '../src/generator/read-execution-plan.js';
import { streamsOf } from '../src/generator/streams-of.js';
import { validatePlan } from '../src/generator/validate-plan.js';

const USAGE = 'validate-plan: name the plan to check, for example: node .claude/workflow/bin/validate-plan.js plans/a-plan.md',
	MARKDOWN_SUFFIX = /\.md$/u,
	messageOf = (thrown) => thrown instanceof Error ? thrown.message : String(thrown),
	textOf = (planPath) => {
		try {
			return readFileSync(planPath, 'utf8');
		} catch (thrown) {
			throw new Error(`${planPath} cannot be read: ${messageOf(thrown)}`, { cause: thrown });
		}
	},
	lineOf = ({ planPath, step, fault }) => step === '' ? `${planPath}: ${fault}` : `${planPath} step ${step}: ${fault}`,
	sidecarPathOf = (planPath) => `${planPath.replace(MARKDOWN_SUFFIX, '')}.plan.json`,
	executionPlanOf = (planPath) => {
		const path = sidecarPathOf(planPath);

		if (!existsSync(path)) {
			throw new Error(lineOf({ planPath, step: '', fault: `${path} is absent, and a run has no shape` }));
		}
		return readExecutionPlan({ path, text: textOf(path) });
	},
	checkedOf = (planPath) => {
		const faults = validatePlan({ planPath, planText: textOf(planPath), block: executionPlanOf(planPath) });

		return faults.length === 0
			? { out: `${planPath}: no fault`, error: '', status: 0 }
			: { out: '', error: faults.map(lineOf).join('\n'), status: 1 };
	},
	answerOf = ([planPath]) => {
		if (planPath === undefined) {
			return { out: '', error: USAGE, status: 1 };
		}
		try {
			return checkedOf(planPath);
		} catch (thrown) {
			return { out: '', error: messageOf(thrown), status: 1 };
		}
	};

const main = () => {
	const { stdout, stderr, status } = streamsOf(answerOf(process.argv.slice(2)));

	process.stdout.write(stdout);
	process.stderr.write(stderr);
	process.exit(status);
};

if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}

export { answerOf };
