import { isWorker } from '../is-worker.js';
import { makeGoalDenyRule } from '../make-goal-deny-rule.js';

const workerMakeVerificationRule = makeGoalDenyRule({
	id: 'worker-make-verification',
	appliesTo: isWorker,
	regex: /(^|-)(test|jest|lint|typecheck)(-|$)/,
	reason:
		'Run `jest <your own test file>` and `eslint <your own files>`, bare, from the project root. Report a red outside your own files and do not chase it. A gate agent proves the merged tree after your group, and it is not you.'
});

export { workerMakeVerificationRule };
