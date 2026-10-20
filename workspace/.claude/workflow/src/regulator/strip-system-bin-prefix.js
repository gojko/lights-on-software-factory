const SYSTEM_BIN_COMMAND_RE = /^\/(?:usr\/)?bin\/([^/]+)$/;

function stripSystemBinPrefix(tokens) {
	const match = SYSTEM_BIN_COMMAND_RE.exec(tokens[0] || '');
	return match ? [match[1], ...tokens.slice(1)] : null;
}

export { stripSystemBinPrefix };
