import { describe, test, expect } from '@jest/globals';
import { evaluateSegment } from '../../src/regulator/evaluate-segment.js';

describe('evaluateSegment', () => {
	test('returns no-match when rules array is empty', () => {
		expect(evaluateSegment({ tokens: ['ls'], originalSegmentString: 'ls', originalCommandString: 'ls', rules: [] })).toEqual({ decision: 'no-match' });
	});

	test('returns first matching rule decision and reason', () => {
		const rules = [
			{ id: 'a', decision: 'allow', reason: 'A', matchSegment: () => true },
			{ id: 'b', decision: 'deny', reason: 'B', matchSegment: () => true }
		];
		expect(evaluateSegment({ tokens: ['x'], originalSegmentString: 'x', originalCommandString: 'x', rules })).toEqual({ decision: 'allow', reason: 'A', id: 'a' });
	});

	test('skips non-matching rules and returns the next match', () => {
		const rules = [
			{ id: 'a', decision: 'allow', reason: 'A', matchSegment: () => false },
			{ id: 'b', decision: 'deny', reason: 'B', matchSegment: () => true }
		];
		expect(evaluateSegment({ tokens: ['x'], originalSegmentString: 'x', originalCommandString: 'x', rules })).toEqual({ decision: 'deny', reason: 'B', id: 'b' });
	});

	test('matchSegment receives tokens', () => {
		const seen = [];
		const rules = [{ id: 'r', decision: 'allow', reason: 'R', matchSegment: (tokens) => { seen.push(tokens); return true; } }];
		evaluateSegment({ tokens: ['a', 'b'], originalSegmentString: 'a b', originalCommandString: 'a b && c', rules });
		expect(seen[0]).toEqual(['a', 'b']);
	});

	test('matchRaw rules receive the original COMMAND string (not the segment)', () => {
		const seen = [];
		const rules = [{ id: 'r', decision: 'deny', reason: 'R', matchRaw: (cmd) => { seen.push(cmd); return true; } }];
		evaluateSegment({ tokens: ['c'], originalSegmentString: 'c', originalCommandString: 'a && c', rules });
		expect(seen[0]).toBe('a && c');
	});

	test('reason as a function is invoked with the original command string', () => {
		const rules = [{ id: 'r', decision: 'deny', reason: (cmd) => `blocked: ${cmd}`, matchSegment: () => true }];
		const result = evaluateSegment({ tokens: ['x'], originalSegmentString: 'x', originalCommandString: 'x --force', rules });
		expect(result).toEqual({ decision: 'deny', reason: 'blocked: x --force', id: 'r' });
	});

	test('throws when a rule declares both matchSegment and matchRaw', () => {
		const rules = [{ id: 'bad', decision: 'deny', reason: 'r', matchSegment: () => true, matchRaw: () => true }];
		expect(() => evaluateSegment({ tokens: ['x'], originalSegmentString: 'x', originalCommandString: 'x', rules })).toThrow(/bad/);
	});

	test('throws when a rule declares neither matchSegment nor matchRaw', () => {
		const rules = [{ id: 'bad', decision: 'deny', reason: 'r' }];
		expect(() => evaluateSegment({ tokens: ['x'], originalSegmentString: 'x', originalCommandString: 'x', rules })).toThrow(/bad/);
	});
});

describe('a rule that declares appliesTo', () => {
	const ruleThatApplies = (appliesTo) => [{ id: 'scoped', decision: 'deny', reason: 'R', matchSegment: () => true, appliesTo }];
	const scoped = ({ appliesTo, context }) =>
		evaluateSegment({ tokens: ['x'], originalSegmentString: 'x', originalCommandString: 'x', rules: ruleThatApplies(appliesTo), context });

	test('resolves the segment when appliesTo answers true', () => {
		expect(scoped({ appliesTo: () => true, context: {} }).decision).toBe('deny');
	});

	test('passes the rule over when appliesTo answers false', () => {
		expect(scoped({ appliesTo: () => false, context: {} }).decision).toBe('no-match');
	});

	test('gives appliesTo the context it was called with', () => {
		const seen = [];

		scoped({ appliesTo: (context) => seen.push(context) && true, context: { agentType: 'workflow-worker' } });
		expect(seen[0]).toEqual({ agentType: 'workflow-worker' });
	});

	test('gives appliesTo an empty context when the caller states none', () => {
		expect(scoped({ appliesTo: (context) => context.agentType === undefined, context: undefined }).decision).toBe('deny');
	});

	test('asks appliesTo only after the command matched, so a context read costs nothing otherwise', () => {
		const asked = [];
		const rules = [{ id: 'scoped', decision: 'deny', reason: 'R', matchSegment: () => false, appliesTo: () => asked.push(1) }];

		evaluateSegment({ tokens: ['x'], originalSegmentString: 'x', originalCommandString: 'x', rules, context: {} });
		expect(asked).toEqual([]);
	});

	test('falls through to the next rule when appliesTo answers false', () => {
		const rules = [
			{ id: 'scoped', decision: 'deny', reason: 'R', matchSegment: () => true, appliesTo: () => false },
			{ id: 'open', decision: 'allow', matchSegment: () => true }
		];

		expect(evaluateSegment({ tokens: ['x'], originalSegmentString: 'x', originalCommandString: 'x', rules, context: {} }).id).toBe('open');
	});

	test('applies a rule that declares no appliesTo, whatever the context says', () => {
		const rules = [{ id: 'open', decision: 'allow', matchSegment: () => true }];

		expect(
			evaluateSegment({
				tokens: ['x'],
				originalSegmentString: 'x',
				originalCommandString: 'x',
				rules,
				context: { agentType: 'workflow-worker' }
			}).id
		).toBe('open');
	});
});
