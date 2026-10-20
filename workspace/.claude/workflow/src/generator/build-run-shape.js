import { deriveStages } from './derive-stages.js';
import { readPlanSteps } from './read-plan-steps.js';
import { readStepFiles } from './read-step-files.js';

const filesOfBody = (body) => {
		const answer = readStepFiles(body);

		return 'absentHeadings' in answer ? [] : answer.files;
	},
	sharedFilesOf = ({ files, beside }) => files.filter((file) => beside.includes(file)),
	writtenAlsoBy = ({ step, held, filesOf }) => {
		const files = filesOf.get(step) ?? [];

		return held.flatMap((other) => {
			const shared = other.step === step ? [] : sharedFilesOf({ files, beside: filesOf.get(other.step) ?? [] });

			return shared.length === 0 ? [] : [{ step: other.step, files: shared }];
		});
	},
	runStepsOf = ({ stage, held, filesOf }) => stage.flatMap((step) => {
		const plan = held.find((one) => one.step === step);

		return plan === undefined
			? []
			: [{ step, body: plan.body, from: plan.from, to: plan.to, writtenAlsoBy: writtenAlsoBy({ step, held, filesOf }) }];
	}),
	heldOf = ({ group, stated, done }) => group.steps.flatMap((step) => {
		const plan = stated.get(step);

		return plan === undefined || done.has(step) ? [] : [plan];
	}),
	leftOutOf = ({ group, stated, done }) => group.steps.flatMap((step) => {
		if (done.has(step)) {
			return [{ step, group: group.name, reason: 'recordedDone' }];
		}

		return stated.has(step) ? [] : [{ step, group: group.name, reason: 'noStepHeading' }];
	}),
	runGroupOf = ({ group, dependencies, stated, done }) => {
		const held = heldOf({ group, stated, done }),
			filesOf = new Map(held.map((one) => [one.step, filesOfBody(one.body)])),
			stages = deriveStages({ group: { name: group.name, steps: held.map((one) => one.step) }, dependencies });

		return { name: group.name, stages: stages.map((stage) => runStepsOf({ stage, held, filesOf })) };
	};

/**
 * The run shape of one plan: what each group sends, in the order it sends it.
 *
 * `completed` states the steps a run has already finished, and the caller reads
 * them out of the progress artefact. The builder reads no record of its own: it
 * takes the answer, so one rule of completeness serves the generator and the
 * report.
 *
 * A step of `completed` is left out, and a group that then holds no step is
 * dropped.
 *
 * A step the execution block holds and the prose states no heading for is left
 * out, because a worker with no task body can do nothing. `validatePlan`
 * answers that disagreement as a fault, and this builder does not report it.
 * Where `completed` holds such a step, the record is the reason it answers,
 * because a step that is done asks nothing more of the run.
 *
 * `leftOut` names each step that is left out for either reason, and `restart`
 * repeats `ranBefore`, which the caller reads from the artefact holding a line
 * of any kind. A run that a person stopped before its first gate completed no
 * step, and it still wrote files to the tree, so a count of completed steps
 * would read that run as a fresh one and send no leading gate.
 *
 * A step that states no file heading writes no file here, so it shares a file
 * with no step beside it.
 *
 * The builder throws the error of `deriveStages`, which names the group and the
 * steps that remain, where the dependencies inside one group hold a cycle.
 */
export const buildRunShape = ({ planText, block, completed, ranBefore = completed.length > 0 }) => {
	const stated = new Map(readPlanSteps(planText).map((one) => [one.step, one])),
		done = new Set(completed),
		groups = block.groups.map((group) => runGroupOf({ group, dependencies: block.dependencies, stated, done }));

	return {
		restart: ranBefore,
		groups: groups.filter((group) => group.stages.length > 0),
		leftOut: block.groups.flatMap((group) => leftOutOf({ group, stated, done }))
	};
};
