import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { lessonLines } from '../src/generator/lesson-lines.js';
import { progressReportOf } from '../src/generator/progress-report-of.js';
import { readExecutionPlan } from '../src/generator/read-execution-plan.js';
import { readPlanSteps } from '../src/generator/read-plan-steps.js';
import { readProgressLines } from '../src/generator/read-progress-lines.js';
import { streamsOf } from '../src/generator/streams-of.js';

const USAGE = 'show-progress: name the plan to show, for example: node .claude/workflow/bin/show-progress.js plans/a-plan.md [--lessons] [--out /tmp/claude-transient/status.txt]',
	MARKDOWN_SUFFIX = /\.md$/u,
	messageOf = (thrown) => thrown instanceof Error ? thrown.message : String(thrown),
	textOf = (path) => {
		try {
			return readFileSync(path, 'utf8');
		} catch (thrown) {
			throw new Error(`${path} cannot be read: ${messageOf(thrown)}`, { cause: thrown });
		}
	},
	besideOf = ({ planPath, suffix }) => `${planPath.replace(MARKDOWN_SUFFIX, '')}${suffix}`,
	linesOf = (planPath) => {
		const path = besideOf({ planPath, suffix: '.progress.jsonl' });

		return existsSync(path) ? readProgressLines(textOf(path)) : [];
	},
	executionPlanOf = (planPath) => {
		const path = besideOf({ planPath, suffix: '.plan.json' });

		if (!existsSync(path)) {
			throw new Error(`${planPath}: ${path} is absent, and a run has no shape`);
		}
		return readExecutionPlan({ path, text: textOf(path) });
	},
	reportOf = ({ planPath, lessons }) => lessons
		? lessonLines(linesOf(planPath)).join('\n')
		: progressReportOf({
			planPath,
			lines: linesOf(planPath),
			steps: readPlanSteps(textOf(planPath)),
			groups: executionPlanOf(planPath).groups
		}),
	shownOf = ({ planPath, out, lessons }) => {
		const report = reportOf({ planPath, lessons });

		if (out !== undefined) {
			writeFileSync(out, `${report}\n`);
		}
		return { out: report, error: '', status: 0 };
	},
	outOf = (given) => {
		const at = given.indexOf('--out');

		if (at === -1) {
			return undefined;
		}
		const path = given[at + 1];

		if (path === undefined || path.startsWith('--')) {
			throw new Error('--out names no path to write the report to');
		}
		return path;
	},
	answerOf = (given) => {
		const [planPath] = given;

		if (planPath === undefined || planPath.startsWith('--')) {
			return { out: '', error: USAGE, status: 1 };
		}
		try {
			return shownOf({ planPath, out: outOf(given), lessons: given.includes('--lessons') });
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
