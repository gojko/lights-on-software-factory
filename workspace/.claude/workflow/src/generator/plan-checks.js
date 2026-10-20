import { deriveStages } from './derive-stages.js';
import { readStepFiles } from './read-step-files.js';

const TOTAL_LINE = /^\*\*Total\b/u,
	STATED_COUNT = /(\d+)\s+steps\b/u,
	MAKE_COMMAND = /`(make\s+[^`\n]+)`/gu,
	LINE_REFERENCE = /([\w.\-/]+\.[a-z]+):(\d+)/gu,
	STEP_NUMBER = /^\d+(?:\.\d+)*$/u,
	NUMBER_SHAPE = 'a step number holds digits and dots alone',
	malformedNumbersOf = (steps) => [...new Set(steps)].filter((step) => !STEP_NUMBER.test(step)),
	baseNameOf = (path) => path.split('/').at(-1) ?? path,
	quotedList = (names) => {
		const quoted = names.map((name) => `"${name}"`),
			last = quoted.at(-1) ?? '';

		return quoted.length > 1 ? `${quoted.slice(0, -1).join(', ')} and ${last}` : last;
	},
	holdersOf = ({ groups }) => {
		const holders = new Map();

		groups.forEach(({ name, steps }) => steps.forEach((step) => holders.set(step, [...holders.get(step) ?? [], name])));
		return holders;
	},
	groupOrderOf = ({ groups }) => {
		const order = new Map();

		groups.forEach(({ steps }, index) => steps.forEach((step) => order.has(step) || order.set(step, index)));
		return order;
	},
	sharedStepFaults = ({ block }) => [...holdersOf(block)]
		.filter(([, names]) => names.length > 1)
		.map(([step, names]) => ({ step, fault: `the groups ${quotedList(names)} hold this step, and one group holds a step` })),
	unknownStepFaults = ({ block }) => {
		const order = groupOrderOf(block);

		return Object.entries(block.dependencies).flatMap(([step, waitsFor]) => [
			...order.has(step) ? [] : [{ step, fault: 'this step states a dependency, and no group holds it' }],
			...waitsFor.filter((one) => !order.has(one)).map((one) => ({ step, fault: `this step waits for the step ${one}, and no group holds that step` }))
		]);
	},
	laterGroupFaults = ({ block }) => {
		const order = groupOrderOf(block),
			isLater = ({ step, one }) => (order.get(one) ?? -1) > (order.get(step) ?? -1) && order.has(step) && order.has(one);

		return Object.entries(block.dependencies).flatMap(([step, waitsFor]) => waitsFor
			.filter((one) => isLater({ step, one }))
			.map((one) => ({ step, fault: `this step waits for the step ${one} of the later group "${block.groups[order.get(one) ?? 0]?.name ?? ''}"` })));
	},
	cycleFaults = ({ block: { dependencies } }) => {
		const faults = [],
			settled = new Set(),
			report = (cycle) => {
				if (cycle.some((one) => settled.has(one))) {
					return;
				}
				faults.push({ step: cycle[0] ?? '', fault: `the dependencies make a cycle: ${cycle.join(' waits for ')}` });
				cycle.forEach((one) => settled.add(one));
			},
			walk = (step, path) => {
				const seen = path.indexOf(step);

				if (seen !== -1) {
					report([...path.slice(seen), step]);
					return;
				}
				if (settled.has(step)) {
					return;
				}
				(dependencies[step] ?? []).forEach((next) => walk(next, [...path, step]));
			};

		Object.keys(dependencies).forEach((step) => walk(step, []));
		return faults;
	},
	groupNumberFaults = ({ block: { groups } }) => groups.flatMap(({ name, steps }) =>
		malformedNumbersOf(steps).map((step) => ({ step, fault: `the group "${name}" holds this step number, and ${NUMBER_SHAPE}` }))),
	dependencyNumberFaults = ({ block: { dependencies } }) =>
		malformedNumbersOf(Object.entries(dependencies).flatMap(([step, waitsFor]) => [step, ...waitsFor]))
			.map((step) => ({ step, fault: `the dependencies name this step number, and ${NUMBER_SHAPE}` })),
	filesOfStep = (body) => {
		const answer = readStepFiles(body);

		return 'absentHeadings' in answer ? [] : answer.files;
	},
	stagesOf = ({ group, dependencies }) => {
		try {
			return deriveStages({ group, dependencies });
		} catch {
			return [];
		}
	},
	writersOf = ({ stage, filesOf }) => {
		const writers = new Map();

		stage.forEach((step) => (filesOf.get(step) ?? []).forEach((file) => writers.set(file, [...writers.get(file) ?? [], step])));
		return writers;
	},
	statedStepFaults = ({ steps, block }) => {
		const stated = steps.map((one) => one.step),
			held = [...new Set(block.groups.flatMap((group) => group.steps))];

		return [
			...stated.filter((step) => !held.includes(step))
				.map((step) => ({ step, fault: 'the prose states this step, and no group of the execution block holds it' })),
			...held.filter((step) => !stated.includes(step))
				.map((step) => ({ step, fault: 'a group of the execution block holds this step, and the prose states no step heading for it' }))
		];
	},
	statedCountFaults = ({ planText, steps }) => planText.split('\n')
		.filter((line) => TOTAL_LINE.test(line))
		.flatMap((line) => {
			const stated = STATED_COUNT.exec(line);

			return stated === null || Number(stated[1]) === steps.length
				? []
				: [{ step: '', fault: `the plan states ${stated[1]} steps, and the count of the step headings is ${steps.length}` }];
		}),
	makeCommandFaults = ({ steps }) => steps.flatMap(({ step, body }) =>
		[...new Set([...body.matchAll(MAKE_COMMAND)].flatMap((match) => match[1] === undefined ? [] : [match[1]]))]
			.map((command) => ({ step, fault: `this step names the command "${command}", and a step of a plan runs no build tool` }))),
	stageFileFaults = ({ steps, block }) => {
		const filesOf = new Map(steps.map(({ step, body }) => [step, filesOfStep(body)]));

		return block.groups.flatMap((group) => stagesOf({ group, dependencies: block.dependencies })
			.flatMap((stage) => [...writersOf({ stage, filesOf })]
				.filter(([, writers]) => writers.length > 1)
				.map(([file, writers]) => ({
					step: writers[0] ?? '',
					fault: `the steps ${quotedList(writers)} of one stage of the group "${group.name}" write the file "${file}"`
				}))));
	},
	orderOf = ({ block }) => {
		const order = new Map();

		block.groups.forEach((group, at) => stagesOf({ group, dependencies: block.dependencies })
			.forEach((stage, stageAt) => stage.forEach((step) => order.set(step, { group: at, stage: stageAt }))));
		return order;
	},
	runsBefore = ({ writer, reader }) =>
		writer !== undefined && reader !== undefined
		&& (writer.group < reader.group || (writer.group === reader.group && writer.stage < reader.stage)),
	writerOfFile = ({ base, step, order, filesOf }) =>
		[...filesOf].find(([writer, files]) =>
			writer !== step && files.some((file) => baseNameOf(file) === base) && runsBefore({ writer: order.get(writer), reader: order.get(step) }))?.[0],
	driftedLineFaults = ({ steps, block }) => {
		const filesOf = new Map(steps.map(({ step, body }) => [step, filesOfStep(body)])),
			order = orderOf({ block });

		return steps.flatMap(({ step, body }) => {
			const named = new Map();

			[...body.matchAll(LINE_REFERENCE)].forEach(([reference, path]) => named.has(baseNameOf(path ?? '')) || named.set(baseNameOf(path ?? ''), reference));
			return [...named].flatMap(([base, reference]) => {
				const writer = writerOfFile({ base, step, order, filesOf });

				return writer === undefined
					? []
					: [{ step, fault: `this step names the line "${reference}", and the earlier step ${writer} writes that file, so the line drifts before this step reads it` }];
			});
		});
	},
	stepBoundaryFaults = ({ steps }) => steps.flatMap(({ step, body }) => {
		const answer = readStepFiles(body);

		if ('absentHeadings' in answer) {
			return [{ step, fault: `this step states no ${quotedList(answer.absentHeadings)} heading` }];
		}
		return answer.files.length > 0 ? [] : [{ step, fault: 'this step names no file in its three file lists' }];
	}),
	proseNumberFaults = ({ steps }) => malformedNumbersOf(steps.map((one) => one.step))
		.map((step) => ({ step, fault: `the prose states this step number, and ${NUMBER_SHAPE}` }));

/**
 * Every check of a plan, in the order the checks run. Each one takes the whole
 * object `{ planText, steps, block }` and answers the faults it finds, so a reader counts the checks
 * of the module by the length of this array.
 *
 * The block alone answers four: a step that two groups hold, a dependency that
 * names a step no group holds, a dependency that points at a step of a later
 * group, and a cycle in the dependencies. A step that waits for a step of its
 * own group is no fault: a cycle inside one group is what the cycle check
 * answers.
 *
 * The block and the prose together answer six more: a step that one of the two
 * states and the other does not, a stated step count that is not the count of
 * the step headings, a step that names a `make` command, two steps of one stage
 * that write one file, a step that names no file boundary, and a step that
 * names a LINE of a file an earlier step writes. That last line drifts before
 * the step reads it, so a step names a test by its name and never by its line.
 *
 * The eleventh is the shape of the step number itself. A step number is one or
 * more digits, and after that any number of groups of a dot and one or more
 * digits, and nothing else. Three places state a number, and each answers this
 * fault with its own line: a group of the block, the dependencies, and a step
 * heading of the prose. One number is reported once for each place that states
 * it, and never two times for one place. A fourth place stated one before: the
 * `## Progress` section of the plan document. No program reads that section any
 * more, so no check answers for it.
 *
 * A letter inside a step number is silent everywhere else. A reader that stops
 * at the letter answers a number no group holds, and sends the step that ran a
 * second time. The refusal is a program, because a rule an author is asked to
 * remember is a rule a plan breaks in silence.
 *
 * A fault of the whole plan states an empty step, because it sits at no step.
 * The stage check answers nothing for a group whose dependencies hold a cycle,
 * because that group has no stages and the cycle check already names it.
 */
export const planChecks = [
	sharedStepFaults,
	unknownStepFaults,
	laterGroupFaults,
	cycleFaults,
	groupNumberFaults,
	dependencyNumberFaults,
	statedStepFaults,
	statedCountFaults,
	makeCommandFaults,
	stageFileFaults,
	stepBoundaryFaults,
	driftedLineFaults,
	proseNumberFaults
];
