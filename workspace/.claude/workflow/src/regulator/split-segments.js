import { consumeHeredoc } from './consume-heredoc.js';

function isPotentialHeredocOpener(command, i) {
	return command[i] === '<' && command[i + 1] === '<';
}

function pushSegment(state) {
	state.segments.push(state.current);
	state.current = '';
}

function appendBodySubstitutions(state, substitutionSpans) {
	for (const span of substitutionSpans) {
		state.current = state.current.replace(/\s+$/, '');
		state.current += (state.current.length === 0 ? '' : ' ') + span;
	}
}

function topContext(state) {
	return state.stack[state.stack.length - 1];
}

function tryEnterQuoteOrSubstitution(state, command, ch) {
	if (ch === '\\' && command[state.i + 1] === '\n') {
		state.i += 2;
		return true;
	}
	if (ch === '\\' && state.i + 1 < command.length) {
		state.current += ch + command[state.i + 1];
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
	if (ch === '$' && command[state.i + 1] === '(') {
		state.stack.push('subst');
		state.current += '$(';
		state.i += 2;
		return true;
	}
	return false;
}

function stepInsideSingle(state, ch) {
	state.current += ch;
	if (ch === `'`) {
		state.stack.pop();
	}
	state.i += 1;
}

function stepInsideDouble(state, command, ch) {
	if (ch === '\\' && state.i + 1 < command.length) {
		state.current += ch + command[state.i + 1];
		state.i += 2;
		return;
	}
	if (ch === '`') {
		state.stack.push('backtick');
		state.current += ch;
		state.i += 1;
		return;
	}
	if (ch === '$' && command[state.i + 1] === '(') {
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

function stepInsideBacktick(state, command, ch) {
	if (ch === '\\' && state.i + 1 < command.length) {
		state.current += ch + command[state.i + 1];
		state.i += 2;
		return;
	}
	state.current += ch;
	if (ch === '`') {
		state.stack.pop();
	}
	state.i += 1;
}

function stepInsideSubst(state, command, ch) {
	if (tryEnterQuoteOrSubstitution(state, command, ch)) {
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

const FUNCTION_NAME_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function functionHeaderEnd(state, command, ch) {
	if (ch !== '(' || !FUNCTION_NAME_RE.test(state.current.trim())) {
		return -1;
	}
	const closing = /^\(\s*\)/.exec(command.slice(state.i));
	return closing ? state.i + closing[0].length : -1;
}

function trySplitFunctionHeader(state, command, ch) {
	const headerEnd = functionHeaderEnd(state, command, ch);
	if (headerEnd < 0) {
		return false;
	}
	state.current = `${state.current.trim()}()`;
	pushSegment(state);
	state.i = headerEnd;
	return true;
}

function isBraceGroupBoundary(state, command, ch) {
	if (ch === '{') {
		const next = command[state.i + 1];
		return state.current.trim() === '' && (next === ' ' || next === '\t' || next === '\n');
	}
	if (ch === '}') {
		return state.current.trim() === '';
	}
	return false;
}

function trySplitOperator(state, command, ch) {
	if (trySplitFunctionHeader(state, command, ch)) {
		return true;
	}
	if (command.startsWith('&&', state.i) || command.startsWith('||', state.i)) {
		pushSegment(state);
		state.i += 2;
		return true;
	}
	if (ch === ';' || ch === '|' || ch === '\n' || ch === '(' || ch === ')') {
		pushSegment(state);
		state.i += 1;
		return true;
	}
	if (isBraceGroupBoundary(state, command, ch)) {
		pushSegment(state);
		state.i += 1;
		return true;
	}
	return false;
}

function tryHeredoc(state, command) {
	if (!isPotentialHeredocOpener(command, state.i)) {
		return false;
	}
	const consumed = consumeHeredoc(command, state.i);
	if (consumed.tooComplex) {
		state.aborted = true;
		return true;
	}
	appendBodySubstitutions(state, consumed.substitutionSpans);
	state.i = consumed.endIndex;
	pushSegment(state);
	return true;
}

function stepOuter(state, command, ch) {
	if (tryEnterQuoteOrSubstitution(state, command, ch)) {
		return;
	}
	if (tryHeredoc(state, command)) {
		return;
	}
	if (trySplitOperator(state, command, ch)) {
		return;
	}
	state.current += ch;
	state.i += 1;
}

function stepScanner(state, command, ch) {
	const context = topContext(state);
	if (context === 'single') {
		stepInsideSingle(state, ch);
		return;
	}
	if (context === 'double') {
		stepInsideDouble(state, command, ch);
		return;
	}
	if (context === 'backtick') {
		stepInsideBacktick(state, command, ch);
		return;
	}
	if (context === 'subst') {
		stepInsideSubst(state, command, ch);
		return;
	}
	stepOuter(state, command, ch);
}

function splitSegments(command) {
	const state = {
		segments: [],
		current: '',
		i: 0,
		stack: [],
		aborted: false
	};
	while (state.i < command.length && !state.aborted) {
		stepScanner(state, command, command[state.i]);
	}
	if (state.aborted || state.stack.length > 0) {
		return { tooComplex: true };
	}
	state.segments.push(state.current);
	return { segments: state.segments.map((s) => s.trim()).filter((s) => s.length > 0) };
}

export { splitSegments };
