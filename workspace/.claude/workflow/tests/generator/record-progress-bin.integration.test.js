import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { afterAll, describe, expect, test } from '@jest/globals';

const ENTRY = join(import.meta.dirname, '..', '..', 'bin', 'record-progress.js'),
	ROOT = mkdtempSync(join(tmpdir(), 'record-progress-bin-')),
	TRANSIENT_DIRECTORY = join(ROOT, 'transient'),
	ENV = { ...process.env, CLAUDE_TRANSIENT_DIR: TRANSIENT_DIRECTORY },
	TOKEN = basename(ROOT),
	SETTLED_AT = '2026-09-03T10:09:41.000Z',
	GROUPS = [{ name: 'A', steps: ['1.1', '1.2'] }, { name: 'B', steps: ['2.1'] }],
	stepReply = (step) => ({ kind: 'step', step, status: 'done', summary: 'It landed.', filesWritten: [] }),
	workerAt = ({ agentId, key, step }) =>
		({ agentId, key, agentType: 'workflow-worker', result: stepReply(step) }),
	promptOf = (step) => step.startsWith('workflow-')
		? `The name of the goal to run: ${step}`
		: `Source: ${step} of plans/a-plan.md, at lines 1 to 9.`,
	transcriptOf = ({ path, step, silentSeconds }) => {
		const at = Date.now() / 1000 - silentSeconds;

		writeFileSync(path, `${JSON.stringify({ role: 'user', text: promptOf(step) })}\n`);
		utimesSync(path, at, at);
	},
	placeOf = (name) => ({
		directory: join(ROOT, `wf_${name}`),
		planPath: join(ROOT, `${TOKEN}-${name}.md`),
		artefactPath: join(ROOT, `${TOKEN}-${name}.progress.jsonl`),
		groupsPath: join(ROOT, `${TOKEN}-${name}.groups.json`),
		transientGroupsPath: join(TRANSIENT_DIRECTORY, `${TOKEN}-${name}.groups.json`)
	}),
	pollAt = ({ place, args = [] }) =>
		spawnSync(process.execPath, [ENTRY, place.planPath, place.directory, ...args], { encoding: 'utf8', env: ENV }),
	artefactOf = (place) => existsSync(place.artefactPath) ? readFileSync(place.artefactPath, 'utf8') : '',
	recordedOf = (place) => artefactOf(place)
		.split('\n')
		.filter((line) => line !== '')
		.map((line) => JSON.parse(line)),
	eventOf = ({ place, kind }) => recordedOf(place)
		.filter((line) => line.event.kind === kind),
	runAt = ({ name, settled = [], live = [], failed = [], groups = GROUPS, args = [] }) => {
		const place = placeOf(name),
			started = [
				...settled.map((one) => ({ type: 'started', agentId: one.agentId })),
				...live.map((one) => ({ type: 'started', agentId: one.agentId })),
				...failed.map((agentId) => ({ type: 'started', agentId }))
			],
			answered = settled.map((one) => ({ type: 'result', key: one.key, agentId: one.agentId, result: one.result }));

		mkdirSync(place.directory, { recursive: true });
		writeFileSync(
			join(place.directory, 'journal.jsonl'),
			[...started, ...answered, ...failed.map((agentId) => ({ type: 'failed', agentId }))]
				.map((entry) => JSON.stringify(entry)).join('\n')
		);
		for (const one of settled) {
			writeFileSync(join(place.directory, `agent-${one.agentId}.meta.json`), JSON.stringify({ agentType: one.agentType, spawnDepth: 1 }));
			writeFileSync(join(place.directory, `agent-${one.agentId}.jsonl`), `${JSON.stringify({ type: 'assistant', timestamp: SETTLED_AT })}\n`);
		}
		for (const one of live) {
			transcriptOf({ path: join(place.directory, `agent-${one.agentId}.jsonl`), step: one.step, silentSeconds: one.silentSeconds });
		}
		rmSync(place.groupsPath, { force: true });
		if (groups !== null) {
			writeFileSync(place.groupsPath, JSON.stringify(groups));
		}
		rmSync(place.artefactPath, { force: true });
		return { place, answer: pollAt({ place, args }) };
	};

afterAll(() => {
	rmSync(ROOT, { recursive: true, force: true });
});

describe('node .claude/workflow/bin/record-progress.js, run with the plan and the transcript directory', () => {
	describe('a poll of a run with one agent still writing', () => {
		const polled = () => runAt({
			name: 'writing',
			settled: [workerAt({ agentId: 's0', key: 'v2:89a3', step: '1.1' })],
			live: [{ agentId: 'w1', step: '1.5', silentSeconds: 12 }]
		});

		test('counts what started, what settled and what failed on the first line', () => {
			expect(polled().answer.stdout.split('\n')[0]).toEqual('2 started, 1 settled, 0 failed');
		});

		test('names the step the run last recorded', () => {
			expect(polled().answer.stdout).toContain('reached: 1.1');
		});

		test('names the live agent by the step its transcript states, and states no stuck mark', () => {
			const out = polled().answer.stdout;

			expect(out).toContain('live step 1.5: silent 1');
			expect(out).not.toContain('STUCK');
		});

		test('exits zero, because nothing needs a person', () => {
			expect(polled().answer.status).toEqual(0);
		});

		test('appends the worker line of the journal, with the step at the top', () => {
			expect(eventOf({ place: polled().place, kind: 'step' })).toEqual([expect.objectContaining({
				run: 'wf_writing',
				key: 'v2:89a3',
				agent: 's0',
				agentType: 'workflow-worker',
				step: '1.1',
				at: SETTLED_AT
			})]);
		});

		test('states on the output stream how many lines it appended', () => {
			expect(polled().answer.stdout).toContain('appended 2 line(s)');
		});

		test('writes the lines of one poll as one buffer, with no empty line and one closing newline', () => {
			const text = artefactOf(polled().place);

			expect(text.endsWith('\n')).toEqual(true);
			expect(text.slice(0, -1).split('\n').filter((line) => line === '')).toEqual([]);
		});
	});

	describe('the runStarted line of the first poll', () => {
		const polled = () => runAt({
			name: 'started',
			settled: [workerAt({ agentId: 's0', key: 'v2:89a3', step: '1.1' })]
		});

		test('states the run of the directory name, the plan and the groups of the groups file', () => {
			expect(eventOf({ place: polled().place, kind: 'runStarted' })).toEqual([expect.objectContaining({
				run: 'wf_started',
				agentType: 'orchestrator',
				event: { kind: 'runStarted', plan: placeOf('started').planPath, groups: GROUPS }
			})]);
		});

		test('stands first in the artefact, above every agent line', () => {
			expect(recordedOf(polled().place)[0].event.kind).toEqual('runStarted');
		});
	});

	describe('a second poll of one run with nothing new in the journal', () => {
		const twice = () => {
			const first = runAt({ name: 'again', settled: [workerAt({ agentId: 's0', key: 'v2:89a3', step: '1.1' })] }),
				before = artefactOf(first.place),
				second = pollAt({ place: first.place });

			return { place: first.place, before, after: artefactOf(first.place), second };
		};

		test('appends nothing', () => {
			const answered = twice();

			expect(answered.after).toEqual(answered.before);
		});

		test('writes the runStarted line one time', () => {
			expect(eventOf({ place: twice().place, kind: 'runStarted' })).toHaveLength(1);
		});

		test('states that it appended no line', () => {
			expect(twice().second.stdout).toContain('appended 0 line(s)');
		});

		test('exits zero', () => {
			expect(twice().second.status).toEqual(0);
		});
	});

	describe('the outcome the orchestrator states', () => {
		test('appends one runEnded line with the outcome it names', () => {
			expect(eventOf({
				place: runAt({ name: 'ended', args: ['--ended', 'completed'] }).place,
				kind: 'runEnded'
			})).toEqual([expect.objectContaining({ run: 'wf_ended', event: { kind: 'runEnded', outcome: 'completed' } })]);
		});

		test('states the text of --said on the runEnded line', () => {
			expect(eventOf({
				place: runAt({ name: 'said', args: ['--ended', 'stopped', '--said', 'A person stopped the run.'] }).place,
				kind: 'runEnded'
			})[0]?.event).toEqual({ kind: 'runEnded', outcome: 'stopped', said: 'A person stopped the run.' });
		});

		test('prints the status one more time', () => {
			expect(runAt({ name: 'ended-status', args: ['--ended', 'halted'] }).answer.stdout)
				.toContain('0 started, 0 settled, 0 failed');
		});

		test('refuses an outcome the record does not hold, and names the three it holds', () => {
			expect(runAt({ name: 'wrong-outcome', args: ['--ended', 'abandoned'] }).answer.stderr)
				.toContain('completed, halted, stopped');
		});

		test('appends nothing and exits non-zero for an outcome the record does not hold', () => {
			const refused = runAt({ name: 'wrong-outcome-status', args: ['--ended', 'abandoned'] });

			expect(refused.answer.status).toEqual(1);
			expect(artefactOf(refused.place)).toEqual('');
		});
	});

	describe('a run whose gate is holding the tree', () => {
		test('names the gate by the goal it runs, and not by its agent id', () => {
			expect(runAt({
				name: 'gating',
				settled: [workerAt({ agentId: 's0', key: 'v2:89a3', step: '1.1' })],
				live: [{ agentId: 'g1', step: 'workflow-serial-gate', silentSeconds: 30 }]
			}).answer.stdout).toContain('live gate workflow-serial-gate: silent 3');
		});
	});

	describe('a run with an agent whose transcript has not grown for longer than ten minutes', () => {
		const polled = () => runAt({ name: 'stuck', live: [{ agentId: 'w1', step: '2.3', silentSeconds: 900 }] });

		test('marks the agent stuck', () => {
			expect(polled().answer.stdout).toContain('live step 2.3: silent 9');
			expect(polled().answer.stdout).toContain('STUCK');
		});

		test('exits non-zero, so a wait loop breaks on it', () => {
			expect(polled().answer.status).toEqual(1);
		});
	});

	describe('a run that recorded a dead agent', () => {
		const polled = () => runAt({
			name: 'dead',
			settled: [workerAt({ agentId: 's0', key: 'v2:89a3', step: '1.1' })],
			failed: ['d1']
		});

		test('names the dead agent', () => {
			expect(polled().answer.stdout).toContain('failed: d1');
		});

		test('exits zero, because the retry wrapper starts a dead agent again on its own', () => {
			expect(polled().answer.status).toEqual(0);
		});

		test('states that no agent is live when every started agent has settled or died', () => {
			expect(polled().answer.stdout).toContain('no agent is live');
		});
	});

	describe('a journal the derivation refuses', () => {
		const refused = () => runAt({
			name: 'refused',
			settled: [{ agentId: 's0', key: 'v2:89a3', agentType: 'workflow-worker', result: { kind: 'step', step: '1.1', summary: 'It landed.', filesWritten: [] } }]
		});

		test('names the run, the key and the agent on the error stream', () => {
			expect(refused().answer.stderr).toContain('wf_refused v2:89a3 s0');
		});

		test('appends nothing, not even the runStarted line', () => {
			expect(artefactOf(refused().place)).toEqual('');
		});

		test('exits non-zero', () => {
			expect(refused().answer.status).toEqual(1);
		});
	});

	describe('a run whose groups file a cleared /tmp took away', () => {
		const polled = () => runAt({
			name: 'no-groups',
			settled: [workerAt({ agentId: 's0', key: 'v2:89a3', step: '1.1' })],
			groups: null
		});

		test('appends every agent line', () => {
			expect(eventOf({ place: polled().place, kind: 'step' })).toHaveLength(1);
		});

		test('names the groups file it looked for, and states that it wrote no runStarted line', () => {
			const { stderr } = polled().answer;

			expect(stderr).toContain(placeOf('no-groups').groupsPath);
			expect(stderr).toContain('runStarted');
		});

		test('exits non-zero', () => {
			expect(polled().answer.status).toEqual(1);
		});
	});

	describe('a directory the entry cannot read', () => {
		const answer = () => spawnSync(
			process.execPath,
			[ENTRY, join(ROOT, 'absent.md'), join(ROOT, 'absent')],
			{ encoding: 'utf8' }
		);

		test('names the journal as text and no stack trace', () => {
			expect(answer().stderr).toContain('journal.jsonl');
			expect(answer().stderr).not.toContain('at ');
		});

		test('exits non-zero', () => {
			expect(answer().status).toEqual(1);
		});
	});

	describe('the groups file of a run', () => {
		test('is read from beside the plan, under the base name of the plan', () => {
			const { place } = runAt({ name: 'beside', groups: [{ name: 'Z', steps: ['9.1'] }] });

			expect(eventOf({ place, kind: 'runStarted' })[0].event.groups).toEqual([{ name: 'Z', steps: ['9.1'] }]);
		});

		test('is not read from the directory CLAUDE_TRANSIENT_DIR names', () => {
			const place = placeOf('transient-only');

			mkdirSync(TRANSIENT_DIRECTORY, { recursive: true });
			writeFileSync(place.transientGroupsPath, JSON.stringify([{ name: 'Z', steps: ['9.1'] }]));

			const { answer } = runAt({ name: 'transient-only', groups: null });

			expect(answer.stderr).toContain(`${place.groupsPath} is absent`);
			expect(eventOf({ place, kind: 'runStarted' })).toEqual([]);
		});
	});

	describe('a poll that names too little', () => {
		test('names the entry and a plan under plans/ as the example', () => {
			expect(spawnSync(process.execPath, [ENTRY], { encoding: 'utf8' }).stderr)
				.toContain('node .claude/workflow/bin/record-progress.js plans/');
		});

		test('asks for the plan and the transcript directory when it is given neither', () => {
			expect(spawnSync(process.execPath, [ENTRY], { encoding: 'utf8' }).stderr)
				.toContain('name the plan and the transcript directory');
		});

		test('asks for the transcript directory when it is given the plan alone', () => {
			expect(spawnSync(process.execPath, [ENTRY, join(ROOT, 'a-plan.md')], { encoding: 'utf8' }).stderr)
				.toContain('name the plan and the transcript directory');
		});

		test('exits non-zero', () => {
			expect(spawnSync(process.execPath, [ENTRY], { encoding: 'utf8' }).status).toEqual(1);
		});
	});
});
