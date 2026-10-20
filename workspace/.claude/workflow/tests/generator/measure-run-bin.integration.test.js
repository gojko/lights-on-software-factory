import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from '@jest/globals';

const ENTRY = join(import.meta.dirname, '..', '..', 'bin', 'measure-run.js'),
	lineOf = ({ at, from, blocks = 1, request = 'req-a', out = 0, read = 0 }) => JSON.stringify({
		timestamp: at,
		type: from,
		requestId: request,
		message: {
			content: Array.from({ length: blocks }, () => ({ type: 'tool_use', name: 'Bash', input: {} })),
			usage: { output_tokens: out, cache_read_input_tokens: read }
		}
	}),
	WORKER = [
		lineOf({ at: '2026-09-03T20:00:00.000Z', from: 'assistant', request: 'req-a', out: 3 }),
		lineOf({ at: '2026-09-03T20:00:04.000Z', from: 'assistant', request: 'req-a', out: 40, read: 900 }),
		lineOf({ at: '2026-09-03T20:00:05.000Z', from: 'user', blocks: 0, request: 'req-a' }),
		lineOf({ at: '2026-09-03T20:00:15.000Z', from: 'user', request: 'req-a' })
	].join('\n'),
	JOURNAL = [
		JSON.stringify({ type: 'started', agentId: 'a1' }),
		JSON.stringify({ type: 'result', agentId: 'a1', result: { kind: 'step', step: '1.1' } }),
		JSON.stringify({ type: 'result', agentId: 'a2', result: { kind: 'gate', group: 'A' } })
	].join('\n'),
	runAt = (given) => spawnSync('node', [ENTRY, ...given], { encoding: 'utf8' }),
	directoryOf = ({ journal = true, second = true } = {}) => {
		const root = mkdtempSync(join(tmpdir(), 'measure-run-bin-'));

		writeFileSync(join(root, 'agent-a1.jsonl'), `${WORKER}\n`);
		if (second) {
			writeFileSync(join(root, 'agent-a2.jsonl'), `${WORKER}\n`);
		}
		if (journal) {
			writeFileSync(join(root, 'journal.jsonl'), `${JOURNAL}\n`);
		}
		return root;
	};

describe('the measure-run entry', () => {
	test('names each agent by the name the journal gives it', () => {
		expect(runAt([directoryOf()]).stdout).toMatch(/step 1\.1[\s\S]*gate A/u);
	});

	test('answers a status of zero for a run it read', () => {
		expect(runAt([directoryOf()]).status).toEqual(0);
	});

	test('reports the wall clock of an agent in seconds', () => {
		expect(runAt([directoryOf({ second: false })]).stdout).toContain('15.0');
	});

	test('counts the output tokens of one request once, however many lines carry it', () => {
		expect(runAt([directoryOf({ second: false })]).stdout).toContain('40');
	});

	test('names an agent by its id where the journal states no result for it', () => {
		expect(runAt([directoryOf({ journal: false })]).stdout).toContain('a1');
	});

	test('answers the usage line and a status of one when no directory is named', () => {
		const answer = runAt([]);

		expect(answer.status).toEqual(1);
		expect(answer.stderr).toContain('measure-run: name the transcript directory');
	});

	test('names the entry and a workflow transcript directory as the example', () => {
		expect(runAt([]).stderr).toContain('node .claude/workflow/bin/measure-run.js ~/.claude/projects/<project>/subagents/workflows/wf_<id>');
	});

	test('answers a status of one and names the directory when it is absent', () => {
		const answer = runAt([join(tmpdir(), 'measure-run-bin-no-such-directory')]);

		expect(answer.status).toEqual(1);
		expect(answer.stderr).toContain('a run wrote no transcript there');
	});

	test('writes nothing to the directory it reads', () => {
		const root = directoryOf();

		runAt([root]);
		expect(runAt([root]).stdout).toEqual(runAt([root]).stdout);
	});
});
