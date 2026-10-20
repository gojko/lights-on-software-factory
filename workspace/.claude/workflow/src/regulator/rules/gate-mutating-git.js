const PREFIX = String.raw`^git(\s+(-[Cc]\s+\S+|--no-pager))*\s+`,
	MUTATING = 'add|commit|checkout|revert|reset|clean|branch|push',
	MUTATING_GIT_RE = new RegExp(`${PREFIX}(?:(?:${MUTATING})(\\s|$)|stash(?!\\s+(list|show))(\\s|$))`),

	gateMutatingGitRule = {
		id: 'gate-mutating-git',
		decision: 'deny',
		appliesTo: (context) => context.agentType === 'workflow-gate',
		reason:
			'Read `git status`, `git diff` and `git log` to decide what you prove. Change no git state: a gate proves a tree and never moves one. Where the tree needs a commit or a repair of the branch, name it in your report and let the caller do it.',
		matchSegment: (tokens) => MUTATING_GIT_RE.test(tokens.join(' '))
	};

export { gateMutatingGitRule };
