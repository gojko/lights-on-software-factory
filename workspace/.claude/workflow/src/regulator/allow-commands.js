function allowCommands({ id, commands }) {
	if (!id) {
		throw new Error('allowCommands: id is required');
	}
	if (!Array.isArray(commands) || commands.length === 0) {
		throw new Error('allowCommands: commands must be a non-empty array');
	}
	const matches = (joined) => {
		for (const cmd of commands) {
			if (joined === cmd || joined.startsWith(`${cmd} `)) {
				return true;
			}
		}
		return false;
	};
	return {
		id,
		decision: 'allow',
		matchSegment: (tokens) => matches(tokens.join(' '))
	};
}

export { allowCommands };
