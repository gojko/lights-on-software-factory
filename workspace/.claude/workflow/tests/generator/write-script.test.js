import { randomUUID } from 'node:crypto';
import vm from 'node:vm';

import { beforeEach, describe, expect, test } from '@jest/globals';

import { progressLinesOf } from '../../src/generator/progress-lines-of.js';
import { scriptPreamble } from '../../src/generator/script-preamble.js';
import { writeScript } from '../../src/generator/write-script.js';

const PLAN = 'plans/a-plan.md',

	bodyOf = ({ step, file }) => [
		`**Goal**: the work of step ${step}, ${randomUUID()}.`,
		'',
		'**Files to create**:',
		'',
		`1. \`${file}\``,
		'',
		'**Files to modify**: `none`',
		'',
		'**Files to delete**: `none`'
	].join('\n'),

	stepOf = ({ step, file, beside = [] }) => ({
		step,
		body: bodyOf({ step, file }),
		from: 100,
		to: 120,
		writtenAlsoBy: beside.length === 0 ? [] : [{ step: 'another', files: beside }]
	}),

	shape = {
		restart: false,
		groups: [
			{
				name: 'A',
				stages: [
					[stepOf({ step: '1.1', file: 'src/one.js', beside: ['src/three.js'] }), stepOf({ step: '1.2', file: 'src/two.js' })],
					[stepOf({ step: '1.3', file: 'src/three.js', beside: ['src/one.js'] })]
				]
			},
			{ name: 'B', stages: [[stepOf({ step: '2.1', file: 'src/four.js' })]] }
		],
		leftOut: []
	},

	threeGroups = {
		restart: false,
		groups: [...shape.groups, { name: 'C', stages: [[stepOf({ step: '3.1', file: 'src/five.js' })]] }],
		leftOut: []
	},

	restarted = { ...shape, restart: true },

	leftOutShape = {
		...shape,
		leftOut: [
			{ step: '1.4', group: 'A', reason: 'recordedDone' },
			{ step: '2.2', group: 'B', reason: 'noStepHeading' }
		]
	},

	textOf = () => writeScript({ shape, planPath: PLAN }),

	metaOf = (text) => JSON.parse(text.slice(text.indexOf('{'), text.indexOf('\n};') + 2)),

	runnableOf = (text) => `(async () => {\n${text.replace('export const meta', 'const meta')}\n})()`,

	isSerialGate = ({ label }) => label.startsWith('gate:'),

	defaultAnswer = (options) => {
		if (options.label === 'barrier') {
			return {
				kind: 'barrier',
				group: 'B',
				green: true,
				needsRework: [],
				blocked: 'none',
				statusAnswer: 'Tests: 4 passed, 4 total',
				summary: 'the merged tree is green'
			};
		}
		if (options.label === 'check') {
			return { claims: [], planFaults: [], summary: 'each claim is read' };
		}
		if (isSerialGate(options) || options.label === 'leading-gate') {
			return {
				kind: 'gate',
				group: options.label.replace('gate:', ''),
				green: true,
				needsRework: [],
				blocked: 'none',
				summary: 'the tree is green'
			};
		}
		return {
			kind: 'step',
			step: options.label.replace('step:', ''),
			status: 'done',
			filesWritten: [],
			summary: 'the step is done'
		};
	},

	gatesThatAnswer = (scripted) => {
		let at = 0;

		return (options) => {
			if (isSerialGate(options) === false) {
				return defaultAnswer(options);
			}
			const answer = at < scripted.length ? scripted[at] : defaultAnswer(options);

			at += 1;
			return answer;
		};
	},

	runOf = async ({ given = shape, answerOf = defaultAnswer }
	= {}) => {
		const phases = [],
			agents = [],
			parallels = [],
			lines = [],
			context = {
				log: (line) => lines.push(line),
				phase: (title) => phases.push(title),
				agent: (prompt, options) => {
					agents.push({ prompt, options });
					return Promise.resolve(answerOf(options, prompt));
				},
				parallel: async (thunks) => {
					const at = agents.length,
						done = await Promise.all(thunks.map((thunk) => thunk()));

					parallels.push(agents.slice(at).map((one) => one.options.label));
					return done;
				}
			},
			answered = await (new vm.Script(runnableOf(writeScript({ shape: given, planPath: PLAN })))
				.runInNewContext(context));

		return { phases, agents, parallels, lines, answered };
	},

	labelsOf = (recorded, agentType) =>
		recorded.agents.filter((one) => one.options.agentType === agentType).map((one) => one.options.label),

	typesOf = (recorded) => recorded.agents.map((one) => one.options.agentType),

	orderOf = (recorded) => recorded.agents.map((one) => one.options.label),

	promptOf = (recorded, label) => recorded.agents.filter((one) => one.options.label === label),

	textOfPrompt = (recorded, label) => promptOf(recorded, label)[0]?.prompt ?? '',

	schemaOf = (recorded, label) =>
		promptOf(recorded, label)[0]?.options.schema ?? { type: '', required: [], properties: {} },

	enumOf = ({ recorded, label, name }) =>
		schemaOf(recorded, label).properties[name]?.enum,

	reworkEnumOf = ({ recorded, label }) =>
		schemaOf(recorded, label).properties.needsRework?.items?.properties?.step?.enum,

	rework = (step) => ({ step, said: `the gate said about ${step}` }),

	redGate = (needsRework) =>
		({ kind: 'gate', group: 'A', green: false, needsRework, blocked: 'none', summary: 'the tree is red' }),

	greenGate = { kind: 'gate', group: 'A', green: true, needsRework: [], blocked: 'none', summary: 'green' },

	answerThat = ({ label, answer }) =>
		(options) => options.label === label ? answer : defaultAnswer(options),

	stepAnswer = (fields) => ({
		kind: 'step',
		status: 'done',
		filesWritten: [],
		summary: 'the step is done',
		...fields
	}),

	answerOfSchema = (asked) => {
		const leastOf = (field) => {
			if (field.enum !== undefined) {
				return field.enum[0];
			}
			if (field.type === 'boolean') {
				return true;
			}
			if (field.type === 'array') {
				return field.items === undefined ? [] : [leastOf(field.items)];
			}
			if (field.type === 'object') {
				return answerOfSchema(field);
			}
			return 'what the agent said';
		};

		return Object.fromEntries((asked.required ?? []).map((name) => [name, leastOf(asked.properties?.[name] ?? {})]));
	},

	derivedOf = ({ agentType, schema }) => progressLinesOf({
		journalText: JSON.stringify({ type: 'result', key: 'v2:0001', agentId: 'a1', result: answerOfSchema(schema) }),
		run: 'wf_00000000-000',
		agents: [{ agentId: 'a1', agentType, at: '2026-09-03T10:00:00Z' }],
		root: '/workspaces/propdata/app',
		held: []
	});

describe('the text of the script', () => {
	test('leads with the meta literal', () => {
		expect(textOf().startsWith('export const meta = {')).toBe(true);
	});

	test('states meta as a pure literal that a JSON reader answers', () => {
		expect(() => metaOf(textOf())).not.toThrow();
	});

	test('names the run after the plan file', () => {
		expect(metaOf(textOf()).name).toEqual('a-plan');
	});

	test('states one line that describes the run', () => {
		expect(metaOf(textOf()).description).toContain(PLAN);
	});

	test('writes out one box for each group, one for each gate but the last group, then the barrier and the check', () => {
		expect(metaOf(textOf()).phases.map((one) => one.title))
			.toEqual(['Implement A', 'Gate A', 'Implement B', 'Barrier', 'Check']);
	});

	test('states a detail for each box', () => {
		expect(metaOf(textOf()).phases.every((one) => one.detail.length > 0)).toBe(true);
	});

	test('describes the barrier box as the final gate, run once over the merged tree', () => {
		expect(metaOf(textOf()).phases.find((one) => one.title === 'Barrier').detail)
			.toEqual('run the final gate once over the merged tree, and the progress of the last group');
	});

	test('writes no release step, because the barrier proves the merged tree and nothing else', () => {
		expect(textOf()).not.toMatch(/deploy|api test/i);
	});

	test('carries the preamble word for word', () => {
		expect(textOf()).toContain(scriptPreamble);
	});

	test('compiles as JavaScript', () => {
		expect(() => new vm.Script(runnableOf(textOf()))).not.toThrow();
	});

	test('writes the bare name of each goal a gate runs', () => {
		expect(textOf()).toContain('"workflow-serial-gate"');
		expect(textOf()).toContain('"workflow-final-gate"');
	});

	test('writes no build tool and no variable, because the role of the gate holds the invocation', () => {
		expect(textOf()).not.toMatch(/make |\b[A-Z][A-Z_]*=\S/);
	});

	test('reads no clock, so two runs of one plan answer the same bytes', () => {
		expect(textOf()).not.toMatch(/Date\.now|new Date/);
	});

	test('writes a box for the leading gate before the box of the first group of a restart', () => {
		expect(metaOf(writeScript({ shape: restarted, planPath: PLAN })).phases.map((one) => one.title))
			.toEqual(['Leading gate', 'Implement A', 'Gate A', 'Implement B', 'Barrier', 'Check']);
	});

	test('states a detail for the box of the leading gate', () => {
		expect(metaOf(writeScript({ shape: restarted, planPath: PLAN })).phases[0].detail.length > 0).toBe(true);
	});
});

describe('the run of the script', () => {
	test('opens one box for each group, one for each gate but the last group, then the barrier and the check', async () => {
		expect((await runOf()).phases).toEqual(['Implement A', 'Gate A', 'Implement B', 'Barrier', 'Check']);
	});

	test('sends the steps of one stage in one parallel call, in array order', async () => {
		expect((await runOf()).parallels).toEqual([['step:1.1', 'step:1.2'], ['step:1.3'], ['step:2.1']]);
	});

	test('names workflow-worker for every step', async () => {
		expect(labelsOf(await runOf(), 'workflow-worker')).toEqual(['step:1.1', 'step:1.2', 'step:1.3', 'step:2.1']);
	});

	test('names workflow-gate for a gate of a group and for the barrier, workflow-check for the check, and workflow-worker for a step', async () => {
		expect(typesOf(await runOf())).toEqual([
			'workflow-worker', 'workflow-worker', 'workflow-worker', 'workflow-gate',
			'workflow-worker', 'workflow-gate', 'workflow-check'
		]);
	});

	test('runs no gate between two stages of one group', async () => {
		expect(orderOf(await runOf()))
			.toEqual(['step:1.1', 'step:1.2', 'step:1.3', 'gate:A', 'step:2.1', 'barrier', 'check']);
	});

	test('gives each step of a group the box of its group', async () => {
		expect(promptOf(await runOf(), 'step:1.3')[0].options.phase).toEqual('Implement A');
	});

	test('carries the body of the step word for word', async () => {
		expect(promptOf(await runOf(), 'step:2.1')[0].prompt).toContain(shape.groups[1].stages[0][0].body);
	});

	test('names the plan file, the step and the lines it sits at', async () => {
		expect(promptOf(await runOf(), 'step:1.2')[0].prompt).toContain(`1.2 of ${PLAN}, at lines 100 to 120`);
	});

	test('names the files a step beside it writes', async () => {
		expect(promptOf(await runOf(), 'step:1.1')[0].prompt).toContain('src/three.js');
	});

	test('says that no other step writes a file where the step names none beside it', async () => {
		expect(promptOf(await runOf(), 'step:1.2')[0].prompt).toContain('no other step of this group');
	});

	test('says nothing about a restart on the first attempt of a step', async () => {
		expect(promptOf(await runOf(), 'step:1.2')[0].prompt).not.toContain('RESTART');
	});

	test('runs one gate between two groups and none after the last group', async () => {
		expect(labelsOf(await runOf(), 'workflow-gate')).toEqual(['gate:A', 'barrier']);
	});

	test('runs no gate but the barrier for a run of one group', async () => {
		expect(labelsOf(await runOf({ given: { restart: false, groups: [shape.groups[0]], leftOut: [] } }), 'workflow-gate'))
			.toEqual(['barrier']);
	});

	test('names the serial goal to a gate between two groups', async () => {
		expect(promptOf(await runOf(), 'gate:A')[0].prompt).toContain('workflow-serial-gate');
	});

	test('gives a gate the name of a goal alone, and no command around it', async () => {
		expect(promptOf(await runOf(), 'gate:A')[0].prompt).not.toMatch(/make |\b[A-Z][A-Z_]*=\S/);
	});

	test('names every step the group sent to its gate, and not only the steps that answered', async () => {
		const recorded = await runOf({ answerOf: (options) => options.label === 'step:1.2' ? null : defaultAnswer(options) });

		expect(promptOf(recorded, 'gate:A')[0].prompt).toContain('1.1, 1.2, 1.3');
	});

	test('starts a step again when the agent of it answers nothing', async () => {
		const recorded = await runOf({ answerOf: (options) => options.label === 'step:1.2' ? null : defaultAnswer(options) });

		expect(promptOf(recorded, 'step:1.2')).toHaveLength(4);
	});

	test('runs the barrier after the last group, with no gate between them', async () => {
		expect(orderOf(await runOf()).slice(-3, -1)).toEqual(['step:2.1', 'barrier']);
	});

	test('names the barrier goal to the barrier', async () => {
		expect(promptOf(await runOf(), 'barrier')[0].prompt).toContain('workflow-final-gate');
	});

	test('gives the barrier the name of a goal alone, and no command around it', async () => {
		expect(promptOf(await runOf(), 'barrier')[0].prompt).not.toMatch(/make |\b[A-Z][A-Z_]*=\S/);
	});

	test('names every step the last group sent to the barrier, and not only the steps that answered', async () => {
		const recorded = await runOf({ answerOf: (options) => options.label === 'step:2.1' ? null : defaultAnswer(options) });

		expect(promptOf(recorded, 'barrier')[0].prompt).toContain('1.1, 1.2, 1.3, 2.1');
	});

	test('carries the report of each step of the last group to the barrier', async () => {
		expect(promptOf(await runOf(), 'barrier')[0].prompt).toContain('2.1: done');
	});

	test('carries the report of the gate of an earlier group to the barrier', async () => {
		expect(promptOf(await runOf(), 'barrier')[0].prompt).toContain('the tree is green');
	});
});

describe('the schema each agent answers', () => {
	test('asks a worker for its own step number and no other', async () => {
		expect(enumOf({ recorded: await runOf(), label: 'step:1.2', name: 'step' })).toEqual(['1.2']);
	});

	test('asks a worker for the one kind a worker answers', async () => {
		expect(enumOf({ recorded: await runOf(), label: 'step:1.2', name: 'kind' })).toEqual(['step']);
	});

	test('asks a gate for the group it proves', async () => {
		expect(enumOf({ recorded: await runOf(), label: 'gate:A', name: 'group' })).toEqual(['A']);
	});

	test('lets the gate of the first group send back the steps that group sent', async () => {
		expect(reworkEnumOf({ recorded: await runOf(), label: 'gate:A' })).toEqual(['1.1', '1.2', '1.3']);
	});

	test('lets the gate of a later group send back every step the run sent before it', async () => {
		expect(reworkEnumOf({ recorded: await runOf({ given: threeGroups }), label: 'gate:B' }))
			.toEqual(['1.1', '1.2', '1.3', '2.1']);
	});

	test('asks the barrier for the one kind the barrier answers', async () => {
		expect(enumOf({ recorded: await runOf(), label: 'barrier', name: 'kind' })).toEqual(['barrier']);
	});

	test('names the last group of the run to the barrier', async () => {
		expect(enumOf({ recorded: await runOf(), label: 'barrier', name: 'group' })).toEqual(['B']);
	});

	test('lets the barrier send back every step the run sent', async () => {
		expect(reworkEnumOf({ recorded: await runOf(), label: 'barrier' })).toEqual(['1.1', '1.2', '1.3', '2.1']);
	});

	test('names the group leading to the leading gate, because it proves no group of this run', async () => {
		expect(enumOf({ recorded: await runOf({ given: restarted }), label: 'leading-gate', name: 'group' }))
			.toEqual(['leading']);
	});

	test('lets the leading gate send back every step of the run shape', async () => {
		expect(reworkEnumOf({ recorded: await runOf({ given: restarted }), label: 'leading-gate' }))
			.toEqual(['1.1', '1.2', '1.3', '2.1']);
	});

	test('asks the check for a claim about every step the run sent', async () => {
		expect(schemaOf(await runOf(), 'check').properties.claims?.items?.properties?.step?.enum)
			.toEqual(['1.1', '1.2', '1.3', '2.1']);
	});

	test('lets a plan fault of the check name every step the run sent', async () => {
		expect(schemaOf(await runOf(), 'check').properties.planFaults?.items?.properties?.steps?.items?.enum)
			.toEqual(['1.1', '1.2', '1.3', '2.1']);
	});
});

describe('what the prompt of a gate carries', () => {
	test('states the files each step of the group owns', async () => {
		expect(textOfPrompt(await runOf(), 'gate:A')).toContain('1.2: src/two.js');
	});

	test('states one status line for each step the group sent', async () => {
		expect(textOfPrompt(await runOf(), 'gate:A')).toContain('1.3: done');
	});

	test('states that a step answered nothing on the status line of it', async () => {
		const recorded = await runOf({ answerOf: answerThat({ label: 'step:1.2', answer: null }) });

		expect(textOfPrompt(recorded, 'gate:A')).toContain('1.2: answered nothing');
	});

	test('carries the whole record of a step that is not done', async () => {
		const recorded = await runOf({
			answerOf: answerThat({ label: 'step:1.2', answer: stepAnswer({ step: '1.2', status: 'notDone' }) })
		});

		expect(textOfPrompt(recorded, 'gate:A')).toContain('"step": "1.2"');
	});

	test('carries the whole record of a done step that states a blocker', async () => {
		const recorded = await runOf({
			answerOf: answerThat({ label: 'step:1.1', answer: stepAnswer({ step: '1.1', blocker: 'the policy refused the command' }) })
		});

		expect(textOfPrompt(recorded, 'gate:A')).toContain('the policy refused the command');
	});

	test('carries no record of a done step that states no blocker', async () => {
		expect(textOfPrompt(await runOf(), 'gate:A')).not.toContain('"step": "1.1"');
	});

	test('carries no record of a done step that states none as its blocker', async () => {
		const recorded = await runOf({
			answerOf: answerThat({ label: 'step:1.1', answer: stepAnswer({ step: '1.1', blocker: 'none' }) })
		});

		expect(textOfPrompt(recorded, 'gate:A')).not.toContain('"step": "1.1"');
	});

	test('states the files each step of the run owns to the barrier', async () => {
		expect(textOfPrompt(await runOf(), 'barrier')).toContain('2.1: src/four.js');
	});
});

describe('the schema an agent answers and the line the record derives', () => {
	test('derives one worker line from the least answer the step schema permits', async () => {
		expect(derivedOf({ agentType: 'workflow-worker', schema: schemaOf(await runOf(), 'step:1.2') })[0]?.event.kind)
			.toEqual('step');
	});

	test('derives one gate line from the least answer the gate schema permits', async () => {
		expect(derivedOf({ agentType: 'workflow-gate', schema: schemaOf(await runOf(), 'gate:A') })[0]?.event.kind)
			.toEqual('gate');
	});

	test('derives one barrier line from the least answer the barrier schema permits', async () => {
		expect(derivedOf({ agentType: 'workflow-gate', schema: schemaOf(await runOf(), 'barrier') })[0]?.event.kind)
			.toEqual('barrier');
	});

	test('derives one claim line and one planFaults line from the least answer the check schema permits', async () => {
		expect(derivedOf({ agentType: 'workflow-check', schema: schemaOf(await runOf(), 'check') }).map((one) => one.event.kind))
			.toEqual(['claim', 'planFaults']);
	});

	test('reads the group of a gate off the answer the schema asks for', async () => {
		expect(derivedOf({ agentType: 'workflow-gate', schema: schemaOf(await runOf(), 'gate:A') })[0])
			.toEqual(expect.objectContaining({ group: 'A' }));
	});

	test('reads the step of a worker off the answer the schema asks for', async () => {
		expect(derivedOf({ agentType: 'workflow-worker', schema: schemaOf(await runOf(), 'step:1.2') })[0])
			.toEqual(expect.objectContaining({ step: '1.2' }));
	});
});

describe('a gate that answers red', () => {
	test('sends the step the gate names back alone, and not beside another step', async () => {
		const recorded = await runOf({ answerOf: gatesThatAnswer([redGate([rework('1.1')])]) });

		expect(recorded.parallels).toEqual([['step:1.1', 'step:1.2'], ['step:1.3'], ['step:2.1']]);
	});

	test('tells the step it sends back that it is a restart', async () => {
		const recorded = await runOf({ answerOf: gatesThatAnswer([redGate([rework('1.1')])]) });

		expect(promptOf(recorded, 'step:1.1')[1].prompt).toContain('RESTART');
	});

	test('carries what the gate said about that step to the step it sends back', async () => {
		const recorded = await runOf({ answerOf: gatesThatAnswer([redGate([rework('1.1')])]) });

		expect(promptOf(recorded, 'step:1.1')[1].prompt).toContain('the gate said about 1.1');
	});

	test('carries what the gate said about one step alone, and not what it said about a step beside it', async () => {
		const recorded = await runOf({ answerOf: gatesThatAnswer([redGate([rework('1.1'), rework('1.3')])]) });

		expect(promptOf(recorded, 'step:1.3')[1].prompt).not.toContain('the gate said about 1.1');
	});

	test('sends two steps the gate names one at a time', async () => {
		const recorded = await runOf({ answerOf: gatesThatAnswer([redGate([rework('1.1'), rework('1.3')])]) });

		expect(orderOf(recorded).slice(4, 7)).toEqual(['step:1.1', 'step:1.3', 'gate:A']);
	});

	test('sends one step back one time where the gate names it two times', async () => {
		const recorded = await runOf({ answerOf: gatesThatAnswer([redGate([rework('1.1'), rework('1.1')])]) });

		expect(promptOf(recorded, 'step:1.1')).toHaveLength(2);
	});

	test('runs the gate of the group again after the rework', async () => {
		const recorded = await runOf({ answerOf: gatesThatAnswer([redGate([rework('1.1')])]) });

		expect(promptOf(recorded, 'gate:A')).toHaveLength(2);
	});

	test('goes on to the next group when the gate answers green after the rework', async () => {
		const recorded = await runOf({ answerOf: gatesThatAnswer([redGate([rework('1.1')])]) });

		expect(orderOf(recorded).at(-2)).toEqual('barrier');
	});

	test('makes no more than three rework rounds', async () => {
		const red = redGate([rework('1.1')]),
			recorded = await runOf({ answerOf: gatesThatAnswer([red, red, red, red, red]) });

		expect(promptOf(recorded, 'gate:A')).toHaveLength(4);
	});

	test('runs no barrier when the tree is red after the last rework round', async () => {
		const red = redGate([rework('1.1')]),
			recorded = await runOf({ answerOf: gatesThatAnswer([red, red, red, red, red]) });

		expect(orderOf(recorded)).not.toContain('barrier');
	});

	test('starts no later group when the tree is red after the last rework round', async () => {
		const red = redGate([rework('1.1')]),
			recorded = await runOf({ answerOf: gatesThatAnswer([red, red, red, red, red]) });

		expect(labelsOf(recorded, 'workflow-worker')).not.toContain('step:2.1');
	});

	test('halts when the gate names a step no step of the group holds', async () => {
		const recorded = await runOf({ answerOf: gatesThatAnswer([redGate([rework('9.9')])]) });

		expect(orderOf(recorded)).not.toContain('barrier');
	});

	test('halts when the gate names a step of a group that is closed', async () => {
		const recorded = await runOf({
			given: threeGroups,
			answerOf: gatesThatAnswer([greenGate, redGate([rework('1.1')])])
		});

		expect(orderOf(recorded)).not.toContain('barrier');
	});

	test('halts when the gate itself answers nothing', async () => {
		const recorded = await runOf({ answerOf: (options) => isSerialGate(options) ? null : defaultAnswer(options) });

		expect(orderOf(recorded)).not.toContain('barrier');
	});

	test('reports why the run halted', async () => {
		const recorded = await runOf({ answerOf: gatesThatAnswer([redGate([rework('9.9')])]) });

		expect(recorded.lines.some((line) => line.includes('9.9'))).toBe(true);
	});
});

describe('a gate that contradicts itself', () => {
	test('halts the run at once when it is red and names neither a step nor a blocker', async () => {
		const recorded = await runOf({ answerOf: gatesThatAnswer([redGate([])]) });

		expect(orderOf(recorded)).not.toContain('barrier');
	});

	test('says that the gate named neither a step nor a blocker', async () => {
		const recorded = await runOf({ answerOf: gatesThatAnswer([redGate([])]) });

		expect(recorded.lines.some((line) => line.includes('named neither a step nor a blocker'))).toBe(true);
	});

	test('starts no later group after that halt', async () => {
		const recorded = await runOf({ answerOf: gatesThatAnswer([redGate([])]) });

		expect(labelsOf(recorded, 'workflow-worker')).not.toContain('step:2.1');
	});

	test('sends no step back after that halt', async () => {
		const recorded = await runOf({ answerOf: gatesThatAnswer([redGate([])]) });

		expect(promptOf(recorded, 'step:1.1')).toHaveLength(1);
	});

	test('halts and reports what the gate said where it names a blocker and no step', async () => {
		const recorded = await runOf({
			answerOf: gatesThatAnswer([{ ...redGate([]), blocked: 'The final gate goal is absent.' }])
		});

		expect(recorded.lines.some((line) => line.includes('The final gate goal is absent.'))).toBe(true);
	});

	test('runs no barrier where the gate names a blocker and no step', async () => {
		const recorded = await runOf({
			answerOf: gatesThatAnswer([{ ...redGate([]), blocked: 'The final gate goal is absent.' }])
		});

		expect(orderOf(recorded)).not.toContain('barrier');
	});
});

describe('what the script does not hold', () => {
	test('splits no word and matches no path, because a gate answers a step number', () => {
		expect(textOf()).not.toMatch(/wordsOf|tailsOf|namesStep/u);
	});
});

describe('the run of a restart', () => {
	test('runs one gate before the first step, and takes no worker beside it', async () => {
		expect(orderOf(await runOf({ given: restarted })))
			.toEqual(['leading-gate', 'step:1.1', 'step:1.2', 'step:1.3', 'gate:A', 'step:2.1', 'barrier', 'check']);
	});

	test('opens the box of the leading gate before the box of the first group', async () => {
		expect((await runOf({ given: restarted })).phases)
			.toEqual(['Leading gate', 'Implement A', 'Gate A', 'Implement B', 'Barrier', 'Check']);
	});

	test('names workflow-gate for the leading gate', async () => {
		expect(promptOf(await runOf({ given: restarted }), 'leading-gate')[0].options.agentType).toEqual('workflow-gate');
	});

	test('names the serial goal to the leading gate', async () => {
		expect(promptOf(await runOf({ given: restarted }), 'leading-gate')[0].prompt)
			.toContain('workflow-serial-gate');
	});

	test('gives the leading gate the name of a goal alone, and no command around it', async () => {
		expect(promptOf(await runOf({ given: restarted }), 'leading-gate')[0].prompt).not.toMatch(/make |\b[A-Z][A-Z_]*=\S/);
	});

	test('tells the leading gate that no step of this run ran before it', async () => {
		expect(promptOf(await runOf({ given: restarted }), 'leading-gate')[0].prompt)
			.toContain('no step of this run ran before you');
	});

	test('runs no leading gate for a fresh run', async () => {
		expect(orderOf(await runOf())).not.toContain('leading-gate');
	});

	test('starts no group when the leading gate answers red', async () => {
		const recorded = await runOf({
			given: restarted,
			answerOf: (options) => options.label === 'leading-gate'
				? { green: false, needsRework: [], summary: 'the inherited tree is red' }
				: defaultAnswer(options)
		});

		expect(labelsOf(recorded, 'workflow-worker')).toEqual([]);
	});

	test('runs no barrier when the leading gate answers red', async () => {
		const recorded = await runOf({
			given: restarted,
			answerOf: (options) => options.label === 'leading-gate'
				? { green: false, needsRework: [], summary: 'the inherited tree is red' }
				: defaultAnswer(options)
		});

		expect(orderOf(recorded)).not.toContain('barrier');
	});

	test('reports why the run halted when the leading gate answers red', async () => {
		const recorded = await runOf({
			given: restarted,
			answerOf: (options) => options.label === 'leading-gate'
				? { green: false, needsRework: [], summary: 'the inherited tree is red' }
				: defaultAnswer(options)
		});

		expect(recorded.lines.some((line) => line.includes('the inherited tree is red'))).toBe(true);
	});

	test('halts when the leading gate answers nothing', async () => {
		const recorded = await runOf({
			given: restarted,
			answerOf: (options) => options.label === 'leading-gate' ? null : defaultAnswer(options)
		});

		expect(orderOf(recorded)).not.toContain('barrier');
	});

	test('runs the leading gate and then the barrier where every group is left out', async () => {
		const recorded = await runOf({
			given: { restart: true, groups: [], leftOut: [{ step: '1.1', group: 'A', reason: 'recordedDone' }] }
		});

		expect(orderOf(recorded)).toEqual(['leading-gate', 'barrier', 'check']);
	});
});

describe('the steps the run leaves out', () => {
	test('writes one line that names each step it left out, the group of it and the reason', async () => {
		const recorded = await runOf({ given: leftOutShape });

		expect(recorded.lines.some((line) => line.includes('1.4 of group A, recordedDone')
			&& line.includes('2.2 of group B, noStepHeading'))).toBe(true);
	});

	test('writes the line of the steps it left out before the first step', async () => {
		const recorded = await runOf({ given: leftOutShape });

		expect(recorded.lines[0]).toContain('1.4');
	});

	test('writes no line about a step left out where the run leaves out none', async () => {
		expect((await runOf()).lines.some((line) => line.includes('left out'))).toBe(false);
	});
});

describe('the check that runs after the barrier', () => {
	test('runs one check agent, and runs it last', async () => {
		expect(labelsOf(await runOf(), 'workflow-check')).toEqual(['check']);
	});

	test('runs the check after the barrier', async () => {
		expect(orderOf(await runOf()).slice(-2)).toEqual(['barrier', 'check']);
	});

	describe('where the barrier is red and names a blocker', () => {
		let recorded;

		beforeEach(async () => {
			recorded = await runOf({
				answerOf: answerThat({
					label: 'barrier',
					answer: { ...defaultAnswer({ label: 'barrier' }), green: false, blocked: 'The SSO token is expired.' }
				})
			});
		});

		test('runs no check', () => {
			expect(labelsOf(recorded, 'workflow-check')).toEqual([]);
		});

		test('reports what the barrier said', () => {
			expect(recorded.lines.some((line) => line.includes('The SSO token is expired.'))).toBe(true);
		});
	});

	test('runs the check where the barrier is red and names no blocker', async () => {
		const recorded = await runOf({
			answerOf: answerThat({
				label: 'barrier',
				answer: { ...defaultAnswer({ label: 'barrier' }), green: false }
			})
		});

		expect(labelsOf(recorded, 'workflow-check')).toEqual(['check']);
	});

	test('gives the check a box of its own', async () => {
		expect(promptOf(await runOf(), 'check')[0].options.phase).toEqual('Check');
	});

	test('names the plan file to the check', async () => {
		expect(promptOf(await runOf(), 'check')[0].prompt).toContain(PLAN);
	});

	test('names every step the run sent to the check, and not only the steps of the last group', async () => {
		expect(promptOf(await runOf(), 'check')[0].prompt).toContain('1.1, 1.2, 1.3, 2.1');
	});

	test('carries the report of a step of an earlier group to the check', async () => {
		expect(promptOf(await runOf(), 'check')[0].prompt).toContain('1.1: done');
	});

	test('carries the report of a step of the last group to the check', async () => {
		expect(promptOf(await runOf(), 'check')[0].prompt).toContain('2.1: done');
	});

	test('states the files each step owns to the check', async () => {
		expect(promptOf(await runOf(), 'check')[0].prompt).toContain('1.3: src/three.js');
	});

	test('carries the whole record of a step that is not done to the check', async () => {
		const recorded = await runOf({
			answerOf: answerThat({ label: 'step:2.1', answer: stepAnswer({ step: '2.1', status: 'notDone' }) })
		});

		expect(promptOf(recorded, 'check')[0].prompt).toContain('"step": "2.1"');
	});

	test('carries no record of a done step that states no blocker to the check', async () => {
		expect(promptOf(await runOf(), 'check')[0].prompt).not.toContain('"step": "1.1"');
	});

	test('names a step that answered nothing as one the check must answer for', async () => {
		const recorded = await runOf({ answerOf: (options) => options.label === 'step:1.2' ? null : defaultAnswer(options) });

		expect(promptOf(recorded, 'check')[0].prompt).toContain('answered nothing, and that you must answer for: 1.2');
	});

	test('names no step that answered nothing when each step answered', async () => {
		expect(promptOf(await runOf(), 'check')[0].prompt).toContain('answered nothing, and that you must answer for: none');
	});

	test('starts the check again when the agent of it answers nothing', async () => {
		const recorded = await runOf({ answerOf: (options) => options.label === 'check' ? null : defaultAnswer(options) });

		expect(promptOf(recorded, 'check')).toHaveLength(4);
	});

	test('runs no check when the run halts before the barrier', async () => {
		const recorded = await runOf({ answerOf: gatesThatAnswer([{ green: false, needsRework: ['src/nowhere.js'], summary: 'red' }]) });

		expect(orderOf(recorded)).not.toContain('check');
	});

	test('answers what the check found beside the report of the run', async () => {
		expect((await runOf()).answered)
			.toEqual(expect.objectContaining({ check: { claims: [], planFaults: [], summary: 'each claim is read' } }));
	});
});
