function regexDenyRule({ id, regex, reason }) {
	if (!id) {
		throw new Error('regexDenyRule: id is required');
	}
	if (!regex) {
		throw new Error('regexDenyRule: regex is required');
	}
	if (!reason) {
		throw new Error('regexDenyRule: reason is required');
	}
	return {
		id,
		decision: 'deny',
		reason,
		matchSegment: (tokens) => regex.test(tokens.join(' '))
	};
}

export { regexDenyRule };
