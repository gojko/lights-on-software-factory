const pathStem = (token) => token.slice(token.lastIndexOf('/') + 1).replace(/\.(c|m)?js$/, '');

function isPathForm(token, commands) {
	if (typeof token !== 'string' || !token.includes('/')) {
		return false;
	}
	return commands.includes(pathStem(token));
}

function offendingTool(command, commands) {
	const offender = command.split(/\s+/).find((token) => isPathForm(token, commands));
	return offender ? pathStem(offender) : 'the tool';
}

function requireFromPath({ id, commands }) {
	return {
		id,
		decision: 'deny',
		reason: (command) =>
			`Use \`${offendingTool(command, commands)}\` from $PATH directly; it is on $PATH from the project's \`package.json\`. Do not invoke it via a path prefix (\`./\`, \`../\`, absolute, or \`node_modules/.bin/\`). If it is not on $PATH, add the project's \`node_modules/.bin\` to $PATH before you start Claude Code.`,
		matchSegment: (tokens) => isPathForm(tokens[0], commands)
	};
}

export { requireFromPath };
