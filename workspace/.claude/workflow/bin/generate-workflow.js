import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { buildRunShape } from '../src/generator/build-run-shape.js';
import { completedStepsOf } from '../src/generator/completed-steps-of.js';
import { readExecutionPlan } from '../src/generator/read-execution-plan.js';
import { readProgressLines } from '../src/generator/read-progress-lines.js';
import { streamsOf } from '../src/generator/streams-of.js';
import { validatePlan } from '../src/generator/validate-plan.js';
import { writeScript } from '../src/generator/write-script.js';

const USAGE = 'generate-workflow: name the plan to convert, for example: node .claude/workflow/bin/generate-workflow.js plans/a-plan.md',
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
	artefactPathOf = (planPath) => `${planPath.replace(MARKDOWN_SUFFIX, '')}.progress.jsonl`,
	recordOf = (planPath) => {
		const path = artefactPathOf(planPath);

		return existsSync(path) ? readProgressLines(textOf(path)) : [];
	},
	groupsOf = (shape) => shape.groups.map((group) => ({
		name: group.name,
		steps: group.stages.flat().map((one) => one.step)
	})),
	writtenAt = ({ planPath, planText, block }) => {
		const name = basename(planPath, '.md'),
			directory = dirname(planPath),
			path = join(directory, `${name}.workflow.mjs`),
			record = recordOf(planPath),
			shape = buildRunShape({
				planText,
				block,
				completed: completedStepsOf(record),
				ranBefore: record.length > 0
			});

		writeFileSync(path, writeScript({ shape, planPath }));
		writeFileSync(join(directory, `${name}.groups.json`), `${JSON.stringify(groupsOf(shape), null, 2)}\n`);
		return path;
	},
	generatedOf = (planPath) => {
		const planText = textOf(planPath),
			block = executionPlanOf(planPath),
			faults = validatePlan({ planPath, planText, block });

		return faults.length === 0
			? { out: writtenAt({ planPath, planText, block }), error: '', status: 0 }
			: { out: '', error: faults.map(lineOf).join('\n'), status: 1 };
	},
	answerOf = ([planPath]) => {
		if (planPath === undefined) {
			return { out: '', error: USAGE, status: 1 };
		}
		try {
			return generatedOf(planPath);
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
