const QUOTES = new Set([`'`, '"']);

function holdsProcessSubstitution(command) {
	let quote = null,
		i = 0;

	while (i < command.length) {
		const ch = command[i];

		if (quote === null && ch === '\\') {
			i += 2;
			continue;
		}
		if (quote !== null) {
			quote = ch === quote ? null : quote;
		} else if (QUOTES.has(ch)) {
			quote = ch;
		} else if ((ch === '<' || ch === '>') && command[i + 1] === '(') {
			return true;
		}
		i += 1;
	}
	return false;
}

export { holdsProcessSubstitution };
