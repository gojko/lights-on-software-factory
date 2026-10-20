const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/,
	VALUE_FLAGS = [
		'-C',
		'-f',
		'-I',
		'-o',
		'-W',
		'-j',
		'-l',
		'--directory',
		'--file',
		'--makefile',
		'--include-dir',
		'--old-file',
		'--what-if',
		'--new-file',
		'--assume-new',
		'--jobs',
		'--load-average'
	],
	isFlag = (token) => token === '--' || token.startsWith('-'),
	takesValue = (token) => VALUE_FLAGS.includes(token);

function makeGoals(tokens) {
	if (tokens[0] !== 'make') {
		return [];
	}
	const goals = [];
	let index = 1;
	while (index < tokens.length) {
		const token = tokens[index];
		if (isFlag(token)) {
			index += takesValue(token) ? 2 : 1;
		} else if (ASSIGNMENT_RE.test(token)) {
			index += 1;
		} else {
			goals.push(token);
			index += 1;
		}
	}
	return goals;
}

export { makeGoals };
