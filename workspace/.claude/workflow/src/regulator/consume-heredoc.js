import { extractHeredocBodySubstitutions } from './extract-heredoc-body-substitutions.js';

const DELIMITER_RE = /^[A-Za-z_][A-Za-z0-9_]*/;

function parseQuotedDelimiter(command, quoteIndex, quoteChar) {
	const bodyStart = quoteIndex + 1,
		closeQuote = command.indexOf(quoteChar, bodyStart),
		nextNewline = command.indexOf('\n', bodyStart);
	if (closeQuote === -1 || (nextNewline !== -1 && closeQuote > nextNewline)) {
		return { tooComplex: true };
	}
	const delimiter = command.slice(bodyStart, closeQuote),
		match = DELIMITER_RE.exec(delimiter);
	if (!match || match[0].length !== delimiter.length) {
		return { tooComplex: true };
	}
	return { delimiter, afterDelimiterIndex: closeQuote + 1, bodyIsLiteral: true };
}

function parseBackslashDelimiter(command, backslashIndex) {
	const remainder = command.slice(backslashIndex + 1),
		match = DELIMITER_RE.exec(remainder);
	if (!match) {
		return { tooComplex: true };
	}
	return { delimiter: match[0], afterDelimiterIndex: backslashIndex + 1 + match[0].length, bodyIsLiteral: true };
}

function parseOpener(command, openerIndex) {
	if (command[openerIndex] !== '<' || command[openerIndex + 1] !== '<') {
		return { tooComplex: true };
	}
	let j = openerIndex + 2;
	if (command[j] === '-') {
		return { tooComplex: true };
	}
	while (command[j] === ' ' || command[j] === '\t') {
		j += 1;
	}
	if (command[j] === `'` || command[j] === '"') {
		return parseQuotedDelimiter(command, j, command[j]);
	}
	if (command[j] === '\\') {
		return parseBackslashDelimiter(command, j);
	}
	const remainder = command.slice(j),
		match = DELIMITER_RE.exec(remainder);
	if (!match) {
		return { tooComplex: true };
	}
	return { delimiter: match[0], afterDelimiterIndex: j + match[0].length, bodyIsLiteral: false };
}

function findOpenerLineEnd(command, afterDelimiterIndex) {
	let j = afterDelimiterIndex;
	while (j < command.length && command[j] !== '\n') {
		if (command[j] === '<' && command[j + 1] === '<') {
			return { tooComplex: true };
		}
		j += 1;
	}
	if (j >= command.length) {
		return { tooComplex: true };
	}
	return { bodyStartIndex: j + 1 };
}

function findCloseLine(command, bodyStartIndex, delimiter) {
	let lineStart = bodyStartIndex;
	while (lineStart <= command.length) {
		const lineEnd = command.indexOf('\n', lineStart),
			line = lineEnd === -1 ? command.slice(lineStart) : command.slice(lineStart, lineEnd);
		if (line === delimiter) {
			return {
				bodyEndIndex: lineStart,
				endIndex: lineEnd === -1 ? command.length : lineEnd + 1
			};
		}
		if (lineEnd === -1) {
			return { tooComplex: true };
		}
		lineStart = lineEnd + 1;
	}
	return { tooComplex: true };
}

function consumeHeredoc(command, openerIndex) {
	const opener = parseOpener(command, openerIndex);
	if (opener.tooComplex) {
		return { tooComplex: true };
	}
	const lineEnd = findOpenerLineEnd(command, opener.afterDelimiterIndex);
	if (lineEnd.tooComplex) {
		return { tooComplex: true };
	}
	const close = findCloseLine(command, lineEnd.bodyStartIndex, opener.delimiter);
	if (close.tooComplex) {
		return { tooComplex: true };
	}
	if (opener.bodyIsLiteral) {
		return { endIndex: close.endIndex, substitutionSpans: [] };
	}
	const body = command.slice(lineEnd.bodyStartIndex, close.bodyEndIndex),
		extracted = extractHeredocBodySubstitutions(body);
	if (extracted.tooComplex) {
		return { tooComplex: true };
	}
	return { endIndex: close.endIndex, substitutionSpans: extracted.substitutionSpans };
}

export { consumeHeredoc };
