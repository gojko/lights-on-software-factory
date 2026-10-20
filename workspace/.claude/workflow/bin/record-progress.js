import { appendFileSync, closeSync, existsSync, openSync, readSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { labelOfAgent } from '../src/generator/label-of-agent.js';
import { progressLinesOf } from '../src/generator/progress-lines-of.js';
import { readProgressLines } from '../src/generator/read-progress-lines.js';
import { runProgressOf } from '../src/generator/run-progress-of.js';
import { streamsOf } from '../src/generator/streams-of.js';

const USAGE = 'record-progress: name the plan and the transcript directory, for example: node .claude/workflow/bin/record-progress.js plans/a-plan.md ~/.claude/projects/<project>/subagents/workflows/wf_<id> [--ended completed|halted|stopped] [--said "what a person saw"]',
	OUTCOMES = ['completed', 'halted', 'stopped'],
	MARKDOWN_SUFFIX = /\.md$/u,
	AGENT_PREFIX = 'agent-',
	TRANSCRIPT_SUFFIX = '.jsonl',
	META_SUFFIX = '.meta.json',
	EDGE_BYTES = 65536,
	messageOf = (thrown) => thrown instanceof Error ? thrown.message : String(thrown),
	isRecord = (value) =>
		typeof value === 'object' && value !== null && !Array.isArray(value),
	parsedOf = (text) => {
		try {
			return JSON.parse(text);
		} catch {
			return null;
		}
	},
	edgeOf = ({ path, from }) => {
		const handle = openSync(path, 'r'),
			buffer = Buffer.alloc(EDGE_BYTES);

		try {
			return buffer.toString('utf8', 0, readSync(handle, buffer, 0, EDGE_BYTES, from));
		} finally {
			closeSync(handle);
		}
	},
	headOf = (path) => edgeOf({ path, from: 0 }),
	tailOf = (path) => edgeOf({ path, from: Math.max(0, statSync(path).size - EDGE_BYTES) }),
	lastTimestampOf = (path) => {
		const last = tailOf(path).split('\n').filter((line) => line.trim() !== '').at(-1);

		if (last === undefined) {
			return null;
		}
		const held = parsedOf(last);

		return isRecord(held) && typeof held.timestamp === 'string' ? held.timestamp : null;
	},
	namesOf = ({ directory, suffix }) => readdirSync(directory)
		.filter((name) => name.startsWith(AGENT_PREFIX) && name.endsWith(suffix))
		.map((name) => ({ name, agentId: name.slice(AGENT_PREFIX.length, -suffix.length) })),
	liveAgentsOf = (directory) => namesOf({ directory, suffix: TRANSCRIPT_SUFFIX }).map(({ name, agentId }) => ({
		agentId,
		label: labelOfAgent(headOf(join(directory, name))),
		modifiedAt: statSync(join(directory, name)).mtimeMs
	})),
	agentTypeOf = ({ directory, name }) => {
		const held = parsedOf(readFileSync(join(directory, name), 'utf8'));

		return isRecord(held) && typeof held.agentType === 'string' ? held.agentType : '';
	},
	timestampOf = ({ directory, agentId, at }) => {
		const path = join(directory, `${AGENT_PREFIX}${agentId}${TRANSCRIPT_SUFFIX}`);

		return existsSync(path) ? lastTimestampOf(path) ?? at : at;
	},
	typedAgentsOf = ({ directory, at }) =>
		namesOf({ directory, suffix: META_SUFFIX }).map(({ name, agentId }) => ({
			agentId,
			agentType: agentTypeOf({ directory, name }),
			at: timestampOf({ directory, agentId, at })
		})),
	journalOf = (directory) => {
		const path = join(directory, 'journal.jsonl');

		try {
			return readFileSync(path, 'utf8');
		} catch (thrown) {
			throw new Error(`${path} cannot be read: ${messageOf(thrown)}`, { cause: thrown });
		}
	},
	artefactPathOf = (planPath) => `${planPath.replace(MARKDOWN_SUFFIX, '')}.progress.jsonl`,
	heldOf = (path) => existsSync(path) ? readProgressLines(readFileSync(path, 'utf8')) : [],
	groupsPathOf = (planPath) => join(dirname(planPath), `${basename(planPath, '.md')}.groups.json`),
	isGroup = (value) => isRecord(value)
		&& typeof value.name === 'string'
		&& Array.isArray(value.steps)
		&& value.steps.every((step) => typeof step === 'string'),
	groupsOf = (path) => {
		if (!existsSync(path)) {
			return null;
		}
		const held = parsedOf(readFileSync(path, 'utf8'));

		if (!Array.isArray(held) || !held.every(isGroup)) {
			throw new Error(`${path} states no JSON array of a group name and the steps of it`);
		}
		return held.map(({ name, steps }) => ({ name, steps }));
	},
	standsStarted = ({ held, run }) =>
		held.some((line) => line.run === run && line.event.kind === 'runStarted'),
	runStartedOf = ({ planPath, run, at, held }) => {
		if (standsStarted({ held, run })) {
			return { line: null, note: '' };
		}
		const path = groupsPathOf(planPath),
			groups = groupsOf(path);

		return groups === null
			? { line: null, note: `${path} is absent, so this poll wrote no runStarted line and no reader can place a step in a group` }
			: { line: { at, run, agentType: 'orchestrator', event: { kind: 'runStarted', plan: planPath, groups } }, note: '' };
	},
	runEndedOf = ({ run, at, ended, said }) =>
		ended === undefined
			? null
			: { at, run, agentType: 'orchestrator', event: { kind: 'runEnded', outcome: ended, ...said === undefined ? {} : { said } } },
	writtenOf = ({ artefactPath, lines }) => {
		if (lines.length > 0) {
			appendFileSync(artefactPath, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
		}
		return lines.length;
	},
	liveLineOf = ({ label, agentId, silentSeconds, stuck }) => {
		const named = label === '' ? agentId : label;

		if (silentSeconds === null) {
			return `live ${named}: no transcript yet`;
		}
		return `live ${named}: silent ${silentSeconds}s${stuck ? ' STUCK' : ''}`;
	},
	reportLinesOf = (progress) => [
		`${progress.started} started, ${progress.settled} settled, ${progress.failed.length} failed`,
		...progress.settledSteps.length === 0 ? [] : [`reached: ${progress.settledSteps.at(-1) ?? ''}`],
		...progress.failed.map((agentId) => `failed: ${agentId}`),
		...progress.live.length === 0 ? ['no agent is live'] : progress.live.map(liveLineOf)
	],
	recordedOf = ({ planPath, directory, ended, said }) => {
		const run = basename(directory),
			at = new Date().toISOString(),
			artefactPath = artefactPathOf(planPath),
			held = heldOf(artefactPath),
			journalText = journalOf(directory),
			agents = typedAgentsOf({ directory, at }),
			started = runStartedOf({ planPath, run, at, held }),
			ending = runEndedOf({ run, at, ended, said }),
			lines = [
				...started.line === null ? [] : [started.line],
				...progressLinesOf({ journalText, run, agents, root: process.cwd(), held }),
				...ending === null ? [] : [ending]
			],
			count = writtenOf({ artefactPath, lines }),
			progress = runProgressOf({ journalText, agents: liveAgentsOf(directory), at: Date.now() });

		return {
			out: [...reportLinesOf(progress), `${artefactPath}: appended ${count} line(s)`].join('\n'),
			error: started.note,
			status: started.note !== '' || progress.live.some((one) => one.stuck) ? 1 : 0
		};
	},
	flagOf = ({ given, flag }) => {
		const at = given.indexOf(flag);

		return at === -1 ? undefined : given[at + 1] ?? '';
	},
	outcomeOf = (given) => {
		const value = flagOf({ given, flag: '--ended' });

		if (value === undefined) {
			return undefined;
		}
		const found = OUTCOMES.find((one) => one === value);

		if (found === undefined) {
			throw new Error(`--ended states "${value}", and a run ends ${OUTCOMES.join(', ')}`);
		}
		return found;
	},
	optionsOf = (given) => {
		const [planPath, directory] = given;

		if (planPath === undefined || directory === undefined || planPath.startsWith('--') || directory.startsWith('--')) {
			return null;
		}
		return { planPath, directory, ended: outcomeOf(given), said: flagOf({ given, flag: '--said' }) };
	},
	answerOf = (given) => {
		try {
			const options = optionsOf(given);

			return options === null ? { out: '', error: USAGE, status: 1 } : recordedOf(options);
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
