import { isWorker } from '../is-worker.js';

const PREFIX = String.raw`^git(\s+(-[Cc]\s+\S+|--no-pager))*\s+`,
	FILE_MOVE_RE = new RegExp(`${PREFIX}(?:rm|mv)(\\s|$)`),

	workerGitFileMoveRule = {
		id: 'worker-git-file-move',
		decision: 'allow',
		appliesTo: isWorker,
		matchSegment: (tokens) => FILE_MOVE_RE.test(tokens.join(' '))
	};

export { workerGitFileMoveRule };
