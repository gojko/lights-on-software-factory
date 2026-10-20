import { isWorker } from '../is-worker.js';

const workerMakeAnyGoalRule = {
	id: 'worker-make-any-goal',
	decision: 'deny',
	appliesTo: isWorker,
	reason:
		'Run `jest <your own test file>` and `eslint <your own files>`, bare, from the project root. Every goal of the build tool writes something the whole tree shares, and the default goal reinstalls the dependencies. Where your task needs a build, report it as a blocker.',
	matchSegment: (tokens) => tokens[0] === 'make'
};

export { workerMakeAnyGoalRule };
