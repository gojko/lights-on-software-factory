import { splitSegments } from './split-segments.js';
import { holdsProcessSubstitution } from './holds-process-substitution.js';
import { extractHeredocBodySubstitutions } from './extract-heredoc-body-substitutions.js';
import { unwrapWrappers } from './unwrap-wrappers.js';
import { wrappers } from './wrappers.js';
import { transientDir } from '../transient-dir.js';

const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

function pushToken(state) {
	if (state.current.length > 0) {
		state.tokens.push(state.current);
		state.current = '';
	}
}

function topContext(state) {
	return state.stack[state.stack.length - 1];
}

function tryTokenEnter(state, text, ch) {
	if (ch === '\\' && state.i + 1 < text.length) {
		state.current += ch + text[state.i + 1];
		state.i += 2;
		return true;
	}
	if (ch === `'`) {
		state.stack.push('single');
		state.current += ch;
		state.i += 1;
		return true;
	}
	if (ch === '"') {
		state.stack.push('double');
		state.current += ch;
		state.i += 1;
		return true;
	}
	if (ch === '`') {
		state.stack.push('backtick');
		state.current += ch;
		state.i += 1;
		return true;
	}
	if (ch === '$' && text[state.i + 1] === '(') {
		state.stack.push('subst');
		state.current += '$(';
		state.i += 2;
		return true;
	}
	return false;
}

function stepTokenSingle(state, ch) {
	state.current += ch;
	if (ch === `'`) {
		state.stack.pop();
	}
	state.i += 1;
}

function stepTokenDouble(state, text, ch) {
	if (ch === '\\' && state.i + 1 < text.length) {
		state.current += ch + text[state.i + 1];
		state.i += 2;
		return;
	}
	if (ch === '`') {
		state.stack.push('backtick');
		state.current += ch;
		state.i += 1;
		return;
	}
	if (ch === '$' && text[state.i + 1] === '(') {
		state.stack.push('subst');
		state.current += '$(';
		state.i += 2;
		return;
	}
	state.current += ch;
	if (ch === '"') {
		state.stack.pop();
	}
	state.i += 1;
}

function stepTokenBacktick(state, text, ch) {
	if (ch === '\\' && state.i + 1 < text.length) {
		state.current += ch + text[state.i + 1];
		state.i += 2;
		return;
	}
	state.current += ch;
	if (ch === '`') {
		state.stack.pop();
	}
	state.i += 1;
}

function stepTokenSubst(state, text, ch) {
	if (tryTokenEnter(state, text, ch)) {
		return;
	}
	if (ch === '(') {
		state.stack.push('subst');
		state.current += ch;
		state.i += 1;
		return;
	}
	state.current += ch;
	if (ch === ')') {
		state.stack.pop();
	}
	state.i += 1;
}

function stepTokenOutside(state, text, ch) {
	if (tryTokenEnter(state, text, ch)) {
		return;
	}
	if (ch === ' ' || ch === '\t' || ch === '\n') {
		pushToken(state);
		state.i += 1;
		return;
	}
	state.current += ch;
	state.i += 1;
}

function stepTokenizer(state, text) {
	const ch = text[state.i];
	if (topContext(state) === 'single') {
		stepTokenSingle(state, ch);
		return;
	}
	if (topContext(state) === 'double') {
		stepTokenDouble(state, text, ch);
		return;
	}
	if (topContext(state) === 'backtick') {
		stepTokenBacktick(state, text, ch);
		return;
	}
	if (topContext(state) === 'subst') {
		stepTokenSubst(state, text, ch);
		return;
	}
	stepTokenOutside(state, text, ch);
}

function tokenize(text) {
	const state = { tokens: [], current: '', i: 0, stack: [] };
	while (state.i < text.length) {
		stepTokenizer(state, text);
	}
	if (state.stack.length > 0) {
		return { tooComplex: true };
	}
	pushToken(state);
	return { tokens: state.tokens };
}

function stripQuotes(token) {
	if (token.length >= 2 && token.startsWith(`'`) && token.endsWith(`'`)) {
		return token.slice(1, -1);
	}
	if (token.length >= 2 && token.startsWith('"') && token.endsWith('"')) {
		return token.slice(1, -1);
	}
	return token;
}

function unwrapSubstitutionSpan(span) {
	if (span.startsWith('$(')) {
		return span.slice(2, -1);
	}
	if (span.startsWith('`')) {
		return span.slice(1, -1);
	}
	return span;
}

function stripEnvAssignments(tokens) {
	const innerCommands = [];
	let i = 0;
	while (i < tokens.length && ASSIGNMENT_RE.test(tokens[i])) {
		const token = tokens[i],
			eqIndex = token.indexOf('='),
			value = token.slice(eqIndex + 1),
			extracted = extractHeredocBodySubstitutions(value);
		if (extracted.tooComplex) {
			return { tooComplex: true };
		}
		for (const span of extracted.substitutionSpans) {
			innerCommands.push(unwrapSubstitutionSpan(span));
		}
		i += 1;
	}
	return { tokens: tokens.slice(i), innerCommands };
}

function isRedirectOp(token) {
	return /^[0-9]?>{1,2}$/.test(token) || /^[0-9]?<$/.test(token) || token === '&>';
}

function isFusedRedirect(token) {
	return /^[0-9]?>&[0-9]+$/.test(token) || /^[0-9]?>>[^ \t]/.test(token) || /^[0-9]?>[^ \t&]/.test(token);
}

function stripRedirects(tokens) {
	const result = [];
	let i = 0;
	while (i < tokens.length) {
		if (isRedirectOp(tokens[i])) {
			i += 2;
			continue;
		}
		if (isFusedRedirect(tokens[i])) {
			i += 1;
			continue;
		}
		result.push(tokens[i]);
		i += 1;
	}
	return result;
}

function isArithmeticExpansion(token) {
	return token.startsWith('$((') && token.endsWith('))');
}

function extractSubstitutions(tokens) {
	const innerCommands = [],
	 remaining = [];
	for (const token of tokens) {
		if (isArithmeticExpansion(token)) {
			continue;
		}
		if (token.startsWith('$(') && token.endsWith(')')) {
			innerCommands.push(token.slice(2, -1));
		} else if (token.startsWith('`') && token.endsWith('`')) {
			innerCommands.push(token.slice(1, -1));
		} else {
			remaining.push(token);
		}
	}
	return { tokens: remaining, innerCommands };
}

function consumeLoopBlock(segments, start) {
	let i = start + 1;
	while (i < segments.length && !/^do\b/.test(segments[i])) {
		i += 1;
	}
	if (i >= segments.length) {
		return null;
	}
	const bodyStart = i;
	while (i < segments.length && !/^done\b/.test(segments[i])) {
		i += 1;
	}
	if (i >= segments.length) {
		return null;
	}
	const bodySegments = segments
		.slice(bodyStart, i)
		.map((s, idx) => (idx === 0 ? s.replace(/^do(\s+|$)/, '') : s))
		.filter((s) => s.length > 0);
	return { bodySegments, nextIndex: i + 1 };
}

function collapseLoopBlocks(segments) {
	const result = [];
	let i = 0;
	while (i < segments.length) {
		const head = segments[i];
		if (/^(for|while|until)\b/.test(head)) {
			const block = consumeLoopBlock(segments, i);
			if (block) {
				result.push(...block.bodySegments);
				i = block.nextIndex;
				continue;
			}
		}
		result.push(head);
		i += 1;
	}
	return result;
}

const FUNCTION_HEADER_RE = /^([A-Za-z_][A-Za-z0-9_-]*)\s*\(\)$/;

function collapseFunctionDefinitions(segments) {
	const names = new Set(),
	 result = [];
	for (const segText of segments) {
		const header = FUNCTION_HEADER_RE.exec(segText);
		if (header) {
			names.add(header[1]);
		} else if (!names.has(segText.split(/\s/)[0])) {
			result.push(segText);
		}
	}
	return result;
}

const CONDITIONAL_KEYWORD_RE = /^(if|then|elif|else|fi)\b\s*/;

function stripControlKeywords(segments) {
	const result = [];
	for (const segText of segments) {
		const stripped = segText.replace(CONDITIONAL_KEYWORD_RE, '');
		if (stripped.length > 0) {
			result.push(stripped);
		}
	}
	return result;
}

const RECORDER_COMMANDS = ['script'],
	BUNDLED_C_FLAG_RE = /^-[A-Za-z]*c$/,
	LONG_COMMAND_FLAG = '--command=';

function shellDashC(tokens) {
	if (tokens.length < 3 || (tokens[0] !== 'sh' && tokens[0] !== 'bash') || tokens[1] !== '-c') {
		return null;
	}
	return stripQuotes(tokens[2]);
}

function recorderDashC(tokens) {
	let index = 1;
	if (!RECORDER_COMMANDS.includes(tokens[0])) {
		return null;
	}
	while (index < tokens.length) {
		if (tokens[index].startsWith(LONG_COMMAND_FLAG)) {
			return stripQuotes(tokens[index].slice(LONG_COMMAND_FLAG.length));
		}
		if (BUNDLED_C_FLAG_RE.test(tokens[index])) {
			return index + 1 < tokens.length ? stripQuotes(tokens[index + 1]) : null;
		}
		index += 1;
	}
	return null;
}

function processShellC(tokens) {
	const innerCommand = shellDashC(tokens) ?? recorderDashC(tokens);
	if (innerCommand === null) {
		return null;
	}
	return { outerTokens: [tokens[0], '-c'], innerCommand };
}

const processSubstitutionReason = () =>
	`claude-bash-regulator: the command uses process substitution, \`<(...)\` or \`>(...)\`, which hides an argument from every rule. Rewrite it without one — write the side to a file under ${transientDir(process.env)} and read that file, or do the whole comparison in one awk pass.`;

function parseCommand(command) {
	if (holdsProcessSubstitution(command)) {
		return {
			tooComplex: true,
			reason: processSubstitutionReason()
		};
	}
	const split = splitSegments(command);
	if (split.tooComplex) {
		return { tooComplex: true };
	}
	const collapsed = collapseFunctionDefinitions(stripControlKeywords(collapseLoopBlocks(split.segments))),
	 output = [];
	for (const segText of collapsed) {
		const tokResult = tokenize(segText);
		if (tokResult.tooComplex) {
			return { tooComplex: true };
		}
		const stripped = stripEnvAssignments(tokResult.tokens);
		if (stripped.tooComplex) {
			return { tooComplex: true };
		}
		const cleaned = stripRedirects(stripped.tokens).map(stripQuotes),
		 shellC = processShellC(unwrapWrappers(cleaned, wrappers));
		if (shellC) {
			const inner = parseCommand(shellC.innerCommand);
			if (inner.tooComplex) {
				return { tooComplex: true };
			}
			if (inner.segments.length === 0) {
				output.push({ tokens: shellC.outerTokens, originalText: segText });
			}
			output.push(...inner.segments);
			for (const innerCmd of stripped.innerCommands) {
				const innerParsed = parseCommand(innerCmd);
				if (innerParsed.tooComplex) {
					return { tooComplex: true };
				}
				output.push(...innerParsed.segments);
			}
			continue;
		}
		const extracted = extractSubstitutions(cleaned),
		 allInnerCommands = [...stripped.innerCommands, ...extracted.innerCommands];
		if (extracted.tokens.length > 0) {
			output.push({ tokens: extracted.tokens, originalText: segText });
		}
		for (const innerCmd of allInnerCommands) {
			const innerParsed = parseCommand(innerCmd);
			if (innerParsed.tooComplex) {
				return { tooComplex: true };
			}
			output.push(...innerParsed.segments);
		}
	}
	return { segments: output };
}

export { parseCommand };
