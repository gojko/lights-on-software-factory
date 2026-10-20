const sudoRule = {
	id: 'sudo',
	decision: 'deny',
	reason: (command) => `sudo is not allowed inside a Claude Code session. Ask the user to run \`${command}\` directly.`,
	matchSegment: (tokens) => tokens[0] === 'sudo'
};

export { sudoRule };
