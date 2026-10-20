function consumeDollarParen(body, startIndex) {
	let depth = 1,
		j = startIndex + 2;
	while (j < body.length && depth > 0) {
		if (body[j] === '(') {
			depth += 1;
		} else if (body[j] === ')') {
			depth -= 1;
		}
		j += 1;
	}
	if (depth !== 0) {
		return { tooComplex: true };
	}
	return { span: body.slice(startIndex, j), nextIndex: j };
}

function consumeBacktick(body, startIndex) {
	let j = startIndex + 1;
	while (j < body.length && body[j] !== '`') {
		j += 1;
	}
	if (j >= body.length) {
		return { tooComplex: true };
	}
	return { span: body.slice(startIndex, j + 1), nextIndex: j + 1 };
}

function extractHeredocBodySubstitutions(bodyText) {
	const spans = [];
	let i = 0;
	while (i < bodyText.length) {
		if (bodyText[i] === '$' && bodyText[i + 1] === '(') {
			const result = consumeDollarParen(bodyText, i);
			if (result.tooComplex) {
				return { tooComplex: true };
			}
			if (bodyText[i + 2] !== '(') {
				spans.push(result.span);
			}
			i = result.nextIndex;
			continue;
		}
		if (bodyText[i] === '`') {
			const result = consumeBacktick(bodyText, i);
			if (result.tooComplex) {
				return { tooComplex: true };
			}
			spans.push(result.span);
			i = result.nextIndex;
			continue;
		}
		i += 1;
	}
	return { substitutionSpans: spans };
}

export { extractHeredocBodySubstitutions };
