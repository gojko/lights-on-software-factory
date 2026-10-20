function regexAllowRule({ id, regex }) {
	if (!id) {
		throw new Error('regexAllowRule: id is required');
	}
	if (!regex) {
		throw new Error('regexAllowRule: regex is required');
	}
	return {
		id,
		decision: 'allow',
		matchSegment: (tokens) => regex.test(tokens.join(' '))
	};
}

export { regexAllowRule };
