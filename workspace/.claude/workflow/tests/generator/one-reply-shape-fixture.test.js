import vm from 'node:vm';

import { beforeAll, describe, expect, test } from '@jest/globals';

import { buildRunShape } from '../../src/generator/build-run-shape.js';
import { readPlanSteps } from '../../src/generator/read-plan-steps.js';
import { writeScript } from '../../src/generator/write-script.js';

const planPath = 'plans/a-plan.md',

	stepTextOf = (step) => [
		`#### Step ${step}: the work of step ${step}`,
		'',
		`**Goal**: step ${step} states one outcome of its own.`,
		'',
		'**Files to create**: `none`',
		'',
		'**Files to modify**:',
		'',
		`1. \`src/step-${step}.js\``,
		'',
		'**Files to delete**: `none`',
		'',
		'---',
		''
	].join('\n'),

	statedStepNumbers = ['1.1', '1.2', '1.3', '2.1', '2.2', '3.1'],

	completedSteps = ['1.1', '1.2'],

	planText = [
		'# A plan',
		'',
		'## Implementation Plan',
		'',
		...statedStepNumbers.map(stepTextOf)
	].join('\n'),

	plan = {
		groups: [
			{ name: 'A', steps: ['1.1', '1.2', '1.3'] },
			{ name: 'B', steps: ['2.1', '2.2'] },
			{ name: 'C', steps: ['3.1'] }
		],
		dependencies: { '1.2': ['1.1'], '1.3': ['1.1'], '2.2': ['2.1'] }
	},

	planSteps = plan.groups.flatMap((group) => group.steps),

	statedSteps = new Set(readPlanSteps(planText).map((one) => one.step)),

	variantOf = (completed) => {
		const steps = readPlanSteps(planText),
			done = new Set(completed),
			sentSteps = planSteps.filter((step) => statedSteps.has(step) && !done.has(step)),
			shape = buildRunShape({ planText, block: plan, completed });

		return {
			planSteps: steps,
			sentSteps,
			sentPlanSteps: steps.filter((one) => sentSteps.includes(one.step)),
			sentGroups: plan.groups.filter((group) => group.steps.some((step) => sentSteps.includes(step))).map((group) => group.name),
			shape,
			scriptText: writeScript({ shape, planPath })
		};
	},

	recorded = variantOf(completedSteps),

	fresh = variantOf([]),

	answerOf = (options) => {
		if (options.label === 'barrier') {
			return { green: true, statusAnswer: 'Tests: 4 passed, 4 total', summary: 'the merged tree is green' };
		}
		if (options.label === 'check') {
			return { summary: 'each claim is read' };
		}
		if (options.agentType === 'workflow-gate') {
			return { green: true, needsRework: [], summary: 'the tree is green' };
		}
		return { step: options.label.replace('step:', ''), status: 'done', filesWritten: [], summary: 'the step is done' };
	},

	runOf = async (scriptText) => {
		const agents = [],
			context = {
				log: () => undefined,
				phase: () => undefined,
				agent: (prompt, options) => {
					agents.push({ prompt, options });
					return Promise.resolve(answerOf(options));
				},
				parallel: (thunks) => Promise.all(thunks.map((thunk) => thunk()))
			},
			runnable = `(async () => {\n${scriptText.replace('export const meta', 'const meta')}\n})()`;

		await (new vm.Script(runnable).runInNewContext(context));
		return agents;
	},

	callsOf = ({ agents, agentType }) =>
		agents.filter((one) => one.options.agentType === agentType),

	labelsOf = ({ agents, agentType }) =>
		callsOf({ agents, agentType }).map((one) => one.options.label),

	gateLabelsOf = (variant) => [
		...(variant.shape.restart ? ['leading-gate'] : []),
		...variant.sentGroups.slice(0, -1).map((name) => `gate:${name}`),
		'barrier'
	],

	variants = [
		{ name: 'the plan with the steps a record states complete', variant: recorded },
		{ name: 'the plan with no step complete', variant: fresh }
	];

describe('the plan the generator reads', () => {
	test('states more than one group and more than one step, so a count of it proves something', () => {
		expect(Math.min(plan.groups.length, fresh.sentSteps.length)).toBeGreaterThan(1);
	});

	test('states more than one completed step, so leaving out proves something', () => {
		expect(completedSteps.length).toBeGreaterThan(1);
	});

	test('states a step heading for every step the execution plan names', () => {
		expect(planSteps.filter((step) => !statedSteps.has(step))).toEqual([]);
	});

	test('names in the execution plan every step the Implementation Plan states', () => {
		expect(fresh.planSteps.map((one) => one.step).filter((step) => !planSteps.includes(step))).toEqual([]);
	});
});

describe.each(variants)('the text of the script the generator answers for $name', ({ variant }) => {
	test('carries the body of every step the run sends, word for word', () => {
		expect(variant.sentPlanSteps.filter((one) => !variant.scriptText.includes(JSON.stringify(one.body)))).toEqual([]);
	});

	test('carries the body of no step the run leaves out', () => {
		const left = new Set(variant.shape.leftOut.map((one) => one.step));

		expect(variant.planSteps.filter((one) => left.has(one.step) && variant.scriptText.includes(JSON.stringify(one.body)))).toEqual([]);
	});

	test('compiles as JavaScript', () => {
		expect(() => new vm.Script(`(async () => {\n${variant.scriptText.replace('export const meta', 'const meta')}\n})()`)).not.toThrow();
	});
});

describe.each(variants)('the run of the script the generator answers for $name', ({ variant }) => {
	let agents = [];

	beforeAll(async () => {
		agents = await runOf(variant.scriptText);
	});

	test('sends one workflow-worker agent for each step the run sends', () => {
		expect(labelsOf({ agents, agentType: 'workflow-worker' }).toSorted())
			.toEqual(variant.sentSteps.map((step) => `step:${step}`).toSorted());
	});

	test('sends one serial gate between two groups it keeps, one barrier beside them, and the leading gate of a restart', () => {
		expect(labelsOf({ agents, agentType: 'workflow-gate' }))
			.toHaveLength(Math.max(variant.sentGroups.length - 1, 0) + 1 + (variant.shape.restart ? 1 : 0));
	});

	test('sends the leading gate of a restart, then one gate for each group it keeps but the last, then the barrier', () => {
		expect(labelsOf({ agents, agentType: 'workflow-gate' })).toEqual(gateLabelsOf(variant));
	});

	test('sends exactly one workflow-check agent', () => {
		expect(labelsOf({ agents, agentType: 'workflow-check' })).toEqual(['check']);
	});

	test('carries the body of the step it names, word for word, in every step prompt', () => {
		const prompts = callsOf({ agents, agentType: 'workflow-worker' });

		expect(variant.sentPlanSteps.filter((one) =>
			!prompts.some(({ prompt, options }) => options.label === `step:${one.step}` && prompt.includes(one.body)))).toEqual([]);
	});

	test('gives a step no goal to run, so no step prompt holds a make command', () => {
		expect(callsOf({ agents, agentType: 'workflow-worker' })
			.filter((one) => one.prompt.includes('make '))
			.map((one) => one.options.label)).toEqual([]);
	});

	test('gives a gate the name of a goal, so no gate prompt holds a make command', () => {
		expect(callsOf({ agents, agentType: 'workflow-gate' })
			.filter((one) => one.prompt.includes('make ') || /\b[A-Z][A-Z_]*=\S/.test(one.prompt))
			.map((one) => one.options.label)).toEqual([]);
	});

	test('names a goal of the workflow to every gate', () => {
		expect(callsOf({ agents, agentType: 'workflow-gate' })
			.filter((one) => !(/The name of the goal to run: workflow-[a-z-]+\n/u).test(one.prompt))
			.map((one) => one.options.label)).toEqual([]);
	});
});

describe('the run shape of the plan with the steps a record states complete', () => {
	test('answers a restart', () => {
		expect(recorded.shape.restart).toBe(true);
	});

	test('leaves out every completed step', () => {
		expect(recorded.shape.leftOut.filter((one) => one.reason === 'recordedDone').map((one) => one.step).toSorted())
			.toEqual(completedSteps.toSorted());
	});

	test('sends no completed step', () => {
		expect(recorded.sentSteps.filter((step) => completedSteps.includes(step))).toEqual([]);
	});

	test('names the group of each step it left out', () => {
		expect(recorded.shape.leftOut.filter((one) => !plan.groups.some((group) =>
			group.name === one.group && group.steps.includes(one.step)))).toEqual([]);
	});
});

describe('the run shape of the plan with no step complete', () => {
	test('answers no restart', () => {
		expect(fresh.shape.restart).toBe(false);
	});

	test('leaves out no step', () => {
		expect(fresh.shape.leftOut).toEqual([]);
	});

	test('keeps every group the execution plan names', () => {
		expect(fresh.shape.groups.map((group) => group.name)).toEqual(plan.groups.map((group) => group.name));
	});
});
