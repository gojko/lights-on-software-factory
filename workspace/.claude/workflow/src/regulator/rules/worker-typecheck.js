import { isWorker } from '../is-worker.js';

const TYPE_CHECKER = 'tsc',
	RUNNERS = ['npx', 'npm', 'pnpm', 'yarn', 'bun', 'bunx', 'node', 'exec', 'dlx', 'run'],
	namesTheTypeChecker = (token) => typeof token === 'string' && token.slice(token.lastIndexOf('/') + 1) === TYPE_CHECKER,
	leadsToACommand = (token) => RUNNERS.includes(token) || token.startsWith('-'),
	matchSegment = (tokens) => {
		const index = tokens.findIndex(namesTheTypeChecker);
		return index >= 0 && tokens.slice(0, index).every(leadsToACommand);
	},

	workerTypecheckRule = {
		id: 'worker-typecheck',
		decision: 'deny',
		appliesTo: isWorker,
		reason:
			'Do not read a type. A type check reads the WHOLE tree, so it reports an error a sibling worker wrote and you cannot tell it from your own. The gate reads every type when your group is complete. Where you want an answer sooner, say so in your report and go on.',
		matchSegment
	};

export { workerTypecheckRule };
