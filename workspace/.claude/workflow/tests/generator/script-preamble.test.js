import { randomUUID } from 'node:crypto';
import vm from 'node:vm';

import { describe, expect, test } from '@jest/globals';

import { scriptPreamble } from '../../src/generator/script-preamble.js';

const ANSWER = `({
	ATTEMPTS,
	persistently,
	stepSchema: STEP_SCHEMA,
	gateSchema: GATE_SCHEMA,
	barrierSchema: BARRIER_SCHEMA,
	checkSchema: CHECK_SCHEMA,
	stepPrompt,
	gatePrompt
})`,

	partsOf = (log) =>
		new vm.Script(`${scriptPreamble}\n${ANSWER}`).runInNewContext({ log }),

	parts = () => partsOf(() => undefined),

	answersNothing = () => Promise.resolve(null),

	aStep = (writtenAlsoBy = []) => ({
		step: 'Step 2.2',
		body: `the body of the task ${randomUUID()}`,
		from: 2077,
		to: 2107,
		writtenAlsoBy
	}),

	SENT = ['1.1', '1.2', '2.1', '2.2'],

	stepSchema = () => parts().stepSchema({ step: '8.8' }),

	gateSchema = () => parts().gateSchema({ group: 'A', steps: SENT }),

	barrierSchema = () => parts().barrierSchema({ group: 'B', steps: SENT }),

	checkSchema = () => parts().checkSchema({ steps: SENT }),

	fieldOf = ({ schema, name }) => schema.properties[name] ?? {},

	itemOf = ({ schema, name }) => fieldOf({ schema, name }).items ?? {},

	itemFieldOf = ({ schema, name, field }) =>
		itemOf({ schema, name }).properties?.[field] ?? {},

	everyFieldOf = (field) => [
		field,
		...Object.values(field.properties ?? {}).flatMap(everyFieldOf),
		...(field.items === undefined ? [] : everyFieldOf(field.items))
	],

	enumFieldsOf = (schema) => everyFieldOf(schema).filter((field) => field.enum !== undefined);

describe('the schemas the script builds', () => {
	test('states the five words a step answers as its status', () => {
		expect(fieldOf({ schema: stepSchema(), name: 'status' }).enum)
			.toEqual(['done', 'doneWithDeviation', 'notDone', 'noTaskBody', 'noFilesNamed']);
	});

	test('asks a step for its kind, its number, its status, a summary and the files it wrote', () => {
		expect(stepSchema().required).toEqual(['kind', 'step', 'status', 'summary', 'filesWritten']);
	});

	test('states step as the one kind a worker answers', () => {
		expect(fieldOf({ schema: stepSchema(), name: 'kind' }).enum).toEqual(['step']);
	});

	test('states the number of that one step as the one number it answers', () => {
		expect(fieldOf({ schema: stepSchema(), name: 'step' }).enum).toEqual(['8.8']);
	});

	test('asks a step for a deviation, a blocker, a decision and a defect it carries forward', () => {
		expect(Object.keys(stepSchema().properties))
			.toEqual(expect.arrayContaining(['deviation', 'blocker', 'decisionForLaterSteps', 'carryForwardDefect']));
	});

	test('asks a gate for its kind, its group, the verdict, the rework, what blocks it and a summary', () => {
		expect(gateSchema().required).toEqual(['kind', 'group', 'green', 'needsRework', 'blocked', 'summary']);
	});

	test('states gate as the one kind a gate answers', () => {
		expect(fieldOf({ schema: gateSchema(), name: 'kind' }).enum).toEqual(['gate']);
	});

	test('states the group of that one gate as the one group it answers', () => {
		expect(fieldOf({ schema: gateSchema(), name: 'group' }).enum).toEqual(['A']);
	});

	test('asks each rework item for a step and what the gate said about it', () => {
		expect(itemOf({ schema: gateSchema(), name: 'needsRework' }).required).toEqual(['step', 'said']);
	});

	test('states every step the caller gives it as a step a gate can send back', () => {
		expect(itemFieldOf({ schema: gateSchema(), name: 'needsRework', field: 'step' }).enum).toEqual(SENT);
	});

	test('asks a gate for no open read', () => {
		expect(Object.keys(gateSchema().properties)).not.toContain('openReads');
	});

	test('asks the barrier for the status answer beside what a gate answers', () => {
		expect(barrierSchema().required).toEqual(['kind', 'group', 'green', 'needsRework', 'blocked', 'summary', 'statusAnswer']);
	});

	test('asks the barrier for no instance, because the final gate runs over the merged tree alone', () => {
		expect(Object.keys(barrierSchema().properties)).not.toContain('instance');
	});

	test('states barrier as the one kind the barrier answers', () => {
		expect(fieldOf({ schema: barrierSchema(), name: 'kind' }).enum).toEqual(['barrier']);
	});

	test('asks the barrier for the status line the final gate goal printed', () => {
		expect(fieldOf({ schema: barrierSchema(), name: 'statusAnswer' }).type).toEqual('string');
	});

	test('states every step the caller gives it as a step the barrier can send back', () => {
		expect(itemFieldOf({ schema: barrierSchema(), name: 'needsRework', field: 'step' }).enum).toEqual(SENT);
	});

	test('asks the check for its claims and for the faults of the plan', () => {
		expect(checkSchema().required).toEqual(['claims', 'planFaults']);
	});

	test('asks each claim for a step, the claim, the answer and the evidence', () => {
		expect(itemOf({ schema: checkSchema(), name: 'claims' }).required).toEqual(['step', 'claim', 'answer', 'evidence']);
	});

	test('states every step the caller gives it as a step a claim can name', () => {
		expect(itemFieldOf({ schema: checkSchema(), name: 'claims', field: 'step' }).enum).toEqual(SENT);
	});

	test('states the three words a claim answers', () => {
		expect(itemFieldOf({ schema: checkSchema(), name: 'claims', field: 'answer' }).enum)
			.toEqual(['held', 'notHeld', 'notProvable']);
	});

	test('states the four repairs a claim asks for', () => {
		expect(itemFieldOf({ schema: checkSchema(), name: 'claims', field: 'repair' }).enum)
			.toEqual(['resendStep', 'needsAssertion', 'needsNewStep', 'planDisagreement']);
	});

	test('states a type of string beside every enum, so a step number is never read as a number', () => {
		const fields = [stepSchema(), gateSchema(), barrierSchema(), checkSchema()].flatMap(enumFieldsOf);

		expect(fields).not.toHaveLength(0);
		expect(fields.map((field) => field.type)).toEqual(fields.map(() => 'string'));
	});

	test('asks each plan fault for the fault it states', () => {
		expect(itemOf({ schema: checkSchema(), name: 'planFaults' }).required).toEqual(['fault']);
	});

	test('states every step the caller gives it as a step a plan fault can name', () => {
		expect(itemFieldOf({ schema: checkSchema(), name: 'planFaults', field: 'steps' }).items?.enum).toEqual(SENT);
	});
});

describe('the text of the preamble', () => {
	test('compiles as JavaScript', () => {
		expect(() => new vm.Script(scriptPreamble)).not.toThrow();
	});

	test('states four attempts', () => {
		expect(parts().ATTEMPTS).toEqual(4);
	});
});

describe('the retry wrapper', () => {
	test('answers the first answer that is not empty', async () => {
		await expect(parts().persistently(() => Promise.resolve('the answer'), 'step:2.2')).resolves.toEqual('the answer');
	});

	test('gives the number of the attempt to each attempt', async () => {
		const seen = [];

		await parts().persistently((attempt) => {
			seen.push(attempt);
			return Promise.resolve(attempt === 2 ? 'the answer' : null);
		}, 'step:2.2');
		expect(seen).toEqual([0, 1, 2]);
	});

	test('answers null when every attempt answers nothing', async () => {
		await expect(parts().persistently(answersNothing, 'step:2.2')).resolves.toBeNull();
	});

	test('makes no more attempts than the count it states', async () => {
		const underTest = parts();
		let attempts = 0;

		await underTest.persistently(() => {
			attempts += 1;
			return Promise.resolve(null);
		}, 'step:2.2');
		expect(attempts).toEqual(underTest.ATTEMPTS);
	});

	test('reports each attempt that answered nothing and names the label', async () => {
		const lines = [];

		await partsOf((line) => lines.push(line)).persistently(answersNothing, 'step:2.2');
		expect(lines).toHaveLength(5);
		expect(lines.every((line) => line.startsWith('step:2.2'))).toBe(true);
	});

	test('reports nothing when the first attempt answers', async () => {
		const lines = [];

		await partsOf((line) => lines.push(line)).persistently(() => Promise.resolve('the answer'), 'step:2.2');
		expect(lines).toEqual([]);
	});
});

describe('the prompt of a step', () => {
	test('carries the body of the step word for word', () => {
		const step = aStep();

		expect(parts().stepPrompt({ step, planPath: 'plans/a-plan.md' })).toContain(step.body);
	});

	test('names the plan file, the heading of the step and the lines it sits at', () => {
		expect(parts().stepPrompt({ step: aStep(), planPath: 'plans/a-plan.md' })).toContain('Step 2.2 of plans/a-plan.md, at lines 2077 to 2107');
	});

	test('names the files the steps beside it write', () => {
		expect(parts().stepPrompt({ step: aStep(['src/a.js', 'tests/a.test.js']), planPath: 'plans/a-plan.md' })).toContain('src/a.js, tests/a.test.js');
	});

	test('says that no other step writes a file when the step names none beside it', () => {
		expect(parts().stepPrompt({ step: aStep(), planPath: 'plans/a-plan.md' })).toContain('no other step of this group');
	});

	test('says which attempt this is when the attempt is not the first', () => {
		expect(parts().stepPrompt({ step: aStep(), planPath: 'plans/a-plan.md', attempt: 1 })).toContain('attempt 2');
	});

	test('says nothing about an attempt on the first attempt', () => {
		expect(parts().stepPrompt({ step: aStep(), planPath: 'plans/a-plan.md', attempt: 0 })).not.toContain('attempt');
	});
});

describe('the prompt of a gate', () => {
	test('names the goal the gate runs', () => {
		expect(parts().gatePrompt({ goal: 'workflow-a-goal', planPath: 'plans/a-plan.md', sent: ['2.1'], answers: [] })).toContain('workflow-a-goal');
	});

	test('says that the goal is a name, so the role of the gate builds the command around it', () => {
		expect(parts().gatePrompt({ goal: 'workflow-a-goal', planPath: 'plans/a-plan.md', sent: ['2.1'], answers: [] })).toContain('The name of the goal to run: workflow-a-goal');
	});

	test('writes no build tool and no variable around the goal name', () => {
		expect(parts().gatePrompt({ goal: 'workflow-a-goal', planPath: 'plans/a-plan.md', sent: ['2.1'], answers: [] })).not.toMatch(/make |\b[A-Z][A-Z_]*=\S/);
	});

	test('names the plan file', () => {
		expect(parts().gatePrompt({ goal: 'workflow-a-goal', planPath: 'plans/a-plan.md', sent: ['2.1'], answers: [] })).toContain('plans/a-plan.md');
	});

	test('names every step that was sent, and not only the steps that answered', () => {
		expect(parts().gatePrompt({ goal: 'workflow-a-goal', planPath: 'plans/a-plan.md', sent: ['2.1', '2.2', '2.3'], answers: [] })).toContain('2.1, 2.2, 2.3');
	});

	test('carries the record its caller gives it', () => {
		expect(parts().gatePrompt({ goal: 'workflow-a-goal', planPath: 'plans/a-plan.md', sent: ['2.1'], answers: [{ step: '2.1', status: 'done' }] })).toContain('"status": "done"');
	});

	test('says that the record list holds a step that is not done, or that states a blocker', () => {
		expect(parts().gatePrompt({ goal: 'workflow-a-goal', planPath: 'plans/a-plan.md', sent: ['2.1'], answers: [] })).toContain(
			'The report of each step that is not done, and of each step that states a blocker:'
		);
	});

	test('leaves out the answer of a step that died', () => {
		expect(parts().gatePrompt({ goal: 'workflow-a-goal', planPath: 'plans/a-plan.md', sent: ['2.1', '2.2'], answers: [null, { step: '2.2', status: 'done' }] })).not.toContain('null');
	});

	test('asks for a verdict, because the answer of the gate is the record', () => {
		expect(parts().gatePrompt({ goal: 'workflow-a-goal', planPath: 'plans/a-plan.md', sent: ['2.1'], answers: [] })).toContain('Prove the merged tree and answer a verdict on it.');
	});

	test('asks the gate to record nothing, so it writes no file', () => {
		expect(parts().gatePrompt({ goal: 'workflow-a-goal', planPath: 'plans/a-plan.md', sent: ['2.1'], answers: [] })).not.toContain('record its progress');
	});
});

describe('what the preamble does not hold', () => {
	test('reads no clock', () => {
		expect(scriptPreamble).not.toMatch(/Date\.now|new Date/);
	});

	test('makes no random number', () => {
		expect(scriptPreamble).not.toMatch(/Math\.random/);
	});

	test('states no oneOf, because every schema is flat', () => {
		expect(scriptPreamble).not.toContain('oneOf');
	});

	test('states no value of a run, because the caller of a schema states the values', () => {
		expect(scriptPreamble).not.toMatch(/enum: \[\s*"\d+\.\d+"/u);
	});

	test('names no role, because the caller of a prompt states the role', () => {
		expect(scriptPreamble).not.toMatch(/workflow-(worker|gate|check|serial-gate|final-gate)/);
	});

	test('states no rule of a role, because a role is read from its own definition', () => {
		expect(scriptPreamble).not.toMatch(/TDD|RED before GREEN|CONTRIBUTING|\.claude|eslint|jest|three attempts/i);
	});
});
