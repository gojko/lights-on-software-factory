const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/,
	FLAG_RE = /^-{1,2}[A-Za-z0-9]/,
	DURATION_RE = /^[0-9]+(\.[0-9]+)?[smhd]?$/,
	COMMAND_LOOKUP_FLAG_RE = /^-[a-zA-Z]*[vV]/,
	MAX_ITERATIONS = 8,
	VALUE_FLAGS_BY_WRAPPER = { time: ['-o'], xargs: ['-I'] },

	isAssignmentToken = (token) => ASSIGNMENT_RE.test(token),
	isFlagToken = (token) => token === '--' || FLAG_RE.test(token),
	isDurationToken = (token) => typeof token === 'string' && DURATION_RE.test(token),
	flagTakesValue = (wrapper, token) => (VALUE_FLAGS_BY_WRAPPER[wrapper] || []).includes(token);

function isCommandLookup(tokens) {
	let index = 1;
	while (index < tokens.length && isFlagToken(tokens[index])) {
		if (COMMAND_LOOKUP_FLAG_RE.test(tokens[index])) {
			return true;
		}
		index += 1;
	}
	return false;
}

function skipWrapperFlags(tokens, wrapper) {
	let current = tokens.slice();
	while (current.length > 0 && (isFlagToken(current[0]) || isAssignmentToken(current[0]))) {
		current = current.slice(flagTakesValue(wrapper, current[0]) && current.length > 1 ? 2 : 1);
	}
	return current;
}

function consumeWrapperHead(tokens) {
	const wrapper = tokens[0],
	 rest = tokens.slice(wrapper === 'timeout' && isDurationToken(tokens[1]) ? 2 : 1);
	return skipWrapperFlags(rest, wrapper);
}

function unwrapWrappers(tokens, wrappers) {
	const original = tokens.slice();
	let current = tokens.slice();
	for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
		while (current.length > 0 && isAssignmentToken(current[0])) {
			current = current.slice(1);
		}
		if (current.length === 0) {
			return original;
		}
		if (!wrappers.includes(current[0])) {
			return current;
		}
		if (current[0] === 'command' && isCommandLookup(current)) {
			return current;
		}
		current = consumeWrapperHead(current);
	}
	return current.length === 0 ? original : current;
}

export { unwrapWrappers };
