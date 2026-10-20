import { isWorker } from '../is-worker.js';
import { makeGoalDenyRule } from '../make-goal-deny-rule.js';

const workerMakeGateRule = makeGoalDenyRule({
	id: 'worker-make-gate',
	appliesTo: isWorker,
	regex: /(^|-)gate$/,
	reason:
		'Run `jest <your own test file>` and `eslint <your own files>`, bare, from the project root. Put anything a gate must know into your report. No form of a gate goal is yours, so do not write this one again in another shape.'
});

export { workerMakeGateRule };
