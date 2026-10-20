import { isWorker } from '../is-worker.js';

const PREFIX = String.raw`^git(\s+(-[Cc]\s+\S+|--no-pager))*\s+`,
	MUTATING = 'add|commit|checkout|revert|reset|clean|branch|merge|rebase|cherry-pick|restore|switch|apply|am|tag|worktree|submodule|gc|prune|reflog',
	MUTATING_GIT_RE = new RegExp(`${PREFIX}(?:(?:${MUTATING})(\\s|$)|stash(?!\\s+(list|show))(\\s|$))`),

	workerMutatingGitRule = {
		id: 'worker-mutating-git',
		decision: 'deny',
		appliesTo: isWorker,
		reason:
			'Read `git status` and `git diff` over your own files, and `git diff --stat` before you report. Delete and rename with `git rm` and `git mv`, which are allowed. Record no other git state. Where your task asks for a commit, report it as a blocker.',
		matchSegment: (tokens) => MUTATING_GIT_RE.test(tokens.join(' '))
	};

export { workerMutatingGitRule };
