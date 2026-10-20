import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { agentTimingOf } from '../src/generator/agent-timing-of.js';
import { runTimingLines } from '../src/generator/run-timing-lines.js';

const USAGE = 'measure-run: name the transcript directory of the run, for example: node .claude/workflow/bin/measure-run.js ~/.claude/projects/<project>/subagents/workflows/wf_<id>',
	AGENT_FILE = /^agent-(?<id>.+)\.jsonl$/u,
	messageOf = (thrown) => thrown instanceof Error ? thrown.message : String(thrown),
	textOf = (path) => {
		try {
			return readFileSync(path, 'utf8');
		} catch (thrown) {
			throw new Error(`${path} cannot be read: ${messageOf(thrown)}`, { cause: thrown });
		}
	},
	parsedOf = (text) => text
		.split('\n')
		.filter((line) => line.trim() !== '')
		.flatMap((line) => {
			try {
				return [JSON.parse(line)];
			} catch {
				return [];
			}
		}),
	nameOf = (result) => {
		if (result?.kind === 'step') {
			return `step ${result.step ?? '?'}`;
		}
		if (result?.kind === 'gate') {
			return `gate ${result.group ?? '?'}`;
		}
		return result?.kind === 'barrier' ? 'barrier' : 'check';
	},
	namesOf = (directory) => {
		const path = join(directory, 'journal.jsonl');

		return existsSync(path)
			? new Map(parsedOf(textOf(path))
				.filter((line) => line.type === 'result')
				.map((line) => {
					const entry = line;

					return [entry.agentId ?? '', nameOf(entry.result)];
				}))
			: new Map();
	},
	momentOf = (line) => {
		const blocks = Array.isArray(line.message?.content) ? line.message.content : [],
			usage = line.message?.usage;

		return {
			at: Date.parse(line.timestamp ?? ''),
			from: line.type === 'assistant' ? 'agent' : 'tool',
			carriesWork: blocks.length > 0,
			toolCalls: blocks.filter((block) => block.type === 'tool_use').length,
			request: line.requestId ?? line.message?.id ?? '',
			outTokens: usage?.output_tokens ?? 0,
			cacheReadTokens: usage?.cache_read_input_tokens ?? 0
		};
	},
	momentsOf = (path) => parsedOf(textOf(path))
		.filter((line) => line.timestamp !== undefined && !Number.isNaN(Date.parse(line.timestamp)))
		.map(momentOf),
	timingsOf = (directory) => {
		const names = namesOf(directory);

		return readdirSync(directory).flatMap((file) => {
			const found = AGENT_FILE.exec(file),
				id = found?.groups?.id;

			return id === undefined
				? []
				: [agentTimingOf({ who: names.get(id) ?? id, moments: momentsOf(join(directory, file)) })];
		});
	},
	measuredOf = (directory) => {
		if (!existsSync(directory)) {
			throw new Error(`${directory} is absent, and a run wrote no transcript there`);
		}
		return { out: runTimingLines(timingsOf(directory)).join('\n'), error: '', status: 0 };
	},
	answerOf = (directory) => {
		if (directory === undefined) {
			return { out: '', error: USAGE, status: 1 };
		}
		try {
			return measuredOf(directory);
		} catch (thrown) {
			return { out: '', error: messageOf(thrown), status: 1 };
		}
	},
	answer = answerOf(process.argv[2]);

if (answer.out !== '') {
	process.stdout.write(`${answer.out}\n`);
}

if (answer.error !== '') {
	process.stderr.write(`${answer.error}\n`);
}

process.exit(answer.status);
