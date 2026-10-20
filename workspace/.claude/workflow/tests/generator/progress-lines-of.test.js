import { describe, expect, test } from '@jest/globals';

import { progressLinesOf } from '../../src/generator/progress-lines-of.js';

const RUN = 'wf_a8009725-679',
	ROOT = '/workspaces/propdata/app',
	WORKER_AT = '2026-09-03T10:09:41Z',
	GATE_AT = '2026-09-03T10:16:52Z',
	CHECK_AT = '2026-09-03T10:38:12Z',
	workerAgent = { agentId: 'ab46', agentType: 'workflow-worker', at: WORKER_AT },
	gateAgent = { agentId: 'aeb0', agentType: 'workflow-gate', at: GATE_AT },
	checkAgent = { agentId: 'a96b', agentType: 'workflow-check', at: CHECK_AT },
	journalOf = (entries) => entries.map((entry) => JSON.stringify(entry)).join('\n'),
	replyOf = ({ agentId, key, result }) =>
		({ type: 'result', key, agentId, result }),
	stepReply = (fields = {}) => ({
		kind: 'step',
		step: '1.1',
		status: 'done',
		summary: 'It landed.',
		filesWritten: [],
		...fields
	}),
	gateReply = (fields = {}) => ({
		kind: 'gate',
		group: 'A',
		green: true,
		needsRework: [],
		blocked: 'none',
		summary: 'The merged tree is green.',
		...fields
	}),
	checkReply = {
		claims: [
			{ step: '1.1', claim: 'The port answers one count.', answer: 'held', evidence: '`a.js:18` writes it.' },
			{
				step: '1.2',
				claim: 'buildModel reads the counts.',
				answer: 'notHeld',
				repair: 'resendStep',
				evidence: '`b.js:96` calls the old port.',
				inspect: '`grep -n regionCounts b.js` answers nothing.'
			}
		],
		planFaults: [{ fault: 'Group B holds a step the plan states no heading for.', steps: ['2.3'] }]
	},
	linesOf = ({ journal, agents, held = [] }) => progressLinesOf({ journalText: journalOf(journal), run: RUN, agents, root: ROOT, held }),
	workerLinesOf = (result, held = []) =>
		linesOf({ journal: [replyOf({ agentId: 'ab46', key: 'v2:89a3', result })], agents: [workerAgent], held });

describe('the lines a journal adds to the artefact', () => {
	test('answers one worker line with the step at the top and an event of the kind step', () => {
		expect(workerLinesOf(stepReply())).toEqual([{
			at: WORKER_AT,
			run: RUN,
			key: 'v2:89a3',
			agent: 'ab46',
			agentType: 'workflow-worker',
			step: '1.1',
			event: { kind: 'step', status: 'done', summary: 'It landed.', filesWritten: [] }
		}]);
	});

	test('carries the deviation, the blocker and the decision of a worker reply', () => {
		expect(workerLinesOf(stepReply({
			status: 'doneWithDeviation',
			deviation: 'The step named a Map and the caller wanted an array.',
			blocker: 'none',
			decisionForLaterSteps: 'A region count reaches a caller as an array.'
		}))[0]?.event).toEqual({
			kind: 'step',
			status: 'doneWithDeviation',
			summary: 'It landed.',
			filesWritten: [],
			deviation: 'The step named a Map and the caller wanted an array.',
			blocker: 'none',
			decisionForLaterSteps: 'A region count reaches a caller as an array.'
		});
	});

	test('writes a file under the repository root as a relative path, and leaves a path outside it as it is', () => {
		expect(workerLinesOf(stepReply({
			filesWritten: [`${ROOT}/src/data/snap-point.js`, '/tmp/claude-transient/a.json']
		}))[0]?.event).toEqual(expect.objectContaining({
			filesWritten: ['src/data/snap-point.js', '/tmp/claude-transient/a.json']
		}));
	});

	test('answers one gate line with the group at the top and the agent type of the meta file', () => {
		expect(linesOf({
			journal: [replyOf({ agentId: 'aeb0', key: 'v2:3519', result: gateReply({ needsRework: [{ step: '1.2', said: 'The port answers no empty region.' }] }) })],
			agents: [gateAgent]
		})).toEqual([{
			at: GATE_AT,
			run: RUN,
			key: 'v2:3519',
			agent: 'aeb0',
			agentType: 'workflow-gate',
			group: 'A',
			event: {
				kind: 'gate',
				green: true,
				needsRework: [{ step: '1.2', said: 'The port answers no empty region.' }],
				blocked: 'none',
				summary: 'The merged tree is green.'
			}
		}]);
	});

	test('answers a barrier line that states the status answer', () => {
		expect(linesOf({
			journal: [replyOf({
				agentId: 'aeb0',
				key: 'v2:e5e4',
				result: gateReply({ kind: 'barrier', group: 'B', statusAnswer: 'Tests: 4 passed, 4 total' })
			})],
			agents: [gateAgent]
		})[0]?.event).toEqual({
			kind: 'barrier',
			green: true,
			needsRework: [],
			blocked: 'none',
			summary: 'The merged tree is green.',
			statusAnswer: 'Tests: 4 passed, 4 total'
		});
	});

	test('answers one line for each claim and one planFaults line, and all of them carry one key', () => {
		expect(linesOf({
			journal: [replyOf({ agentId: 'a96b', key: 'v2:aa19', result: checkReply })],
			agents: [checkAgent]
		})).toEqual([
			{
				at: CHECK_AT,
				run: RUN,
				key: 'v2:aa19',
				agent: 'a96b',
				agentType: 'workflow-check',
				step: '1.1',
				event: { kind: 'claim', claim: 'The port answers one count.', answer: 'held', evidence: '`a.js:18` writes it.' }
			},
			{
				at: CHECK_AT,
				run: RUN,
				key: 'v2:aa19',
				agent: 'a96b',
				agentType: 'workflow-check',
				step: '1.2',
				event: {
					kind: 'claim',
					claim: 'buildModel reads the counts.',
					answer: 'notHeld',
					repair: 'resendStep',
					evidence: '`b.js:96` calls the old port.',
					inspect: '`grep -n regionCounts b.js` answers nothing.'
				}
			},
			{
				at: CHECK_AT,
				run: RUN,
				key: 'v2:aa19',
				agent: 'a96b',
				agentType: 'workflow-check',
				event: {
					kind: 'planFaults',
					faults: [{ fault: 'Group B holds a step the plan states no heading for.', steps: ['2.3'] }]
				}
			}
		]);
	});

	test('answers nothing for a journal line whose run and key already stand in the artefact', () => {
		expect(workerLinesOf(stepReply(), [{
			at: WORKER_AT,
			run: RUN,
			key: 'v2:89a3',
			agent: 'ab46',
			agentType: 'workflow-worker',
			step: '1.1',
			event: { kind: 'step', status: 'done', summary: 'It landed.', filesWritten: [] }
		}])).toEqual([]);
	});

	test('answers nothing when it reads one journal a second time, so the derivation is idempotent', () => {
		const journal = [
				replyOf({ agentId: 'ab46', key: 'v2:89a3', result: stepReply() }),
				replyOf({ agentId: 'a96b', key: 'v2:aa19', result: checkReply })
			],
			agents = [workerAgent, checkAgent],
			first = linesOf({ journal, agents });

		expect(linesOf({ journal, agents, held: first })).toEqual([]);
	});

	test('leaves a started line and a failed line out of the answer', () => {
		expect(linesOf({
			journal: [
				{ type: 'started', key: 'v2:89a3', agentId: 'ab46' },
				{ type: 'failed', key: 'v2:0000', agentId: 'a000' }
			],
			agents: [workerAgent]
		})).toEqual([]);
	});

	test('passes over a journal line it cannot parse, because the journal is appended to while it is read', () => {
		expect(progressLinesOf({
			journalText: ['{"type":"result","agen', JSON.stringify(replyOf({ agentId: 'ab46', key: 'v2:89a3', result: stepReply() }))].join('\n'),
			run: RUN,
			agents: [workerAgent],
			root: ROOT,
			held: []
		})).toHaveLength(1);
	});

	test('throws an error that names the run, the key and the agent when the meta states an agent type the record does not hold', () => {
		expect(() => linesOf({
			journal: [replyOf({ agentId: 'ab46', key: 'v2:89a3', result: stepReply() })],
			agents: [{ agentId: 'ab46', agentType: 'workflow-scribe', at: WORKER_AT }]
		})).toThrow(`${RUN} v2:89a3 ab46: the agent type "workflow-scribe" is not one the record holds`);
	});

	test('throws an error that names the run, the key and the agent when no meta file states the agent type', () => {
		expect(() => linesOf({
			journal: [replyOf({ agentId: 'ab46', key: 'v2:89a3', result: stepReply() })],
			agents: []
		})).toThrow(`${RUN} v2:89a3 ab46: no meta file states the agent type`);
	});

	test('throws an error that names the run, the key and the agent when a worker reply states no status', () => {
		expect(() => workerLinesOf({ kind: 'step', step: '1.1', summary: 'It landed.', filesWritten: [] }))
			.toThrow(`${RUN} v2:89a3 ab46: the reply states no "status"`);
	});

	test('throws an error when the kind of a reply disagrees with the agent type', () => {
		expect(() => workerLinesOf(gateReply()))
			.toThrow(`${RUN} v2:89a3 ab46: the reply states "kind" as "gate", and a workflow-worker answers step`);
	});

	test('throws an error when the reply of a worker is text and not a record', () => {
		expect(() => workerLinesOf('The step landed.'))
			.toThrow(`${RUN} v2:89a3 ab46: the reply is not a record`);
	});

	test('throws an error when a check reply states no claims', () => {
		expect(() => linesOf({
			journal: [replyOf({ agentId: 'a96b', key: 'v2:aa19', result: { planFaults: [] } })],
			agents: [checkAgent]
		})).toThrow(`${RUN} v2:aa19 a96b: the reply states no "claims" array`);
	});
});
