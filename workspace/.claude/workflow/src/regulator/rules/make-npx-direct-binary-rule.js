const VALUE_FLAGS = ['-p', '--package', '-c', '--call'];

function skipNpxFlags(tokens) {
	let index = 1;
	while (index < tokens.length) {
		const token = tokens[index];
		if (typeof token !== 'string' || !token.startsWith('-')) {
			break;
		}
		index += VALUE_FLAGS.includes(token) ? 2 : 1;
	}
	return tokens[index];
}

function makeNpxDirectBinaryRule(binaryName) {
	return {
		id: `npx-${binaryName}`,
		decision: 'deny',
		reason: `Use the \`${binaryName}\` binary from $PATH; ${binaryName} is on $PATH from the project's \`package.json\`. If it is not on $PATH, add the project's \`node_modules/.bin\` to $PATH before you start Claude Code.`,
		matchSegment: (tokens) => tokens[0] === 'npx' && skipNpxFlags(tokens) === binaryName
	};
}

export { makeNpxDirectBinaryRule };
