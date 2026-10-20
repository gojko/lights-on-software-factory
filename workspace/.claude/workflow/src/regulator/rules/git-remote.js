const REMOTE_SUBCOMMANDS = ['push', 'pull', 'fetch', 'clone'],

	findSubcommandIndex = (tokens) => {
		let i = 1;
		while (i < tokens.length) {
			if (tokens[i] === '-C' || tokens[i] === '-c') {
				i += 2;
			} else if (tokens[i] === '--no-pager') {
				i += 1;
			} else {
				break;
			}
		}
		return i;
	},

	gitRemoteRule = {
		id: 'git-remote',
		decision: 'deny',
		reason: (command) =>
			`Git operations involving the remote are not allowed inside a Claude Code session. Ask the user to run \`${command}\` directly.`,
		matchSegment: (tokens) => tokens[0] === 'git' && REMOTE_SUBCOMMANDS.includes(tokens[findSubcommandIndex(tokens)])
	};

export { gitRemoteRule };
