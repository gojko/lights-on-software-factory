import { describe, test, expect } from '@jest/globals';
import { mergeDecisions } from '../../src/regulator/merge-decisions.js';

describe('mergeDecisions', () => {
	test('empty input → no-match', () => {
		expect(mergeDecisions([])).toEqual({ decision: 'no-match' });
	});

	test('all-allow returns allow with first reason', () => {
		expect(
			mergeDecisions([
				{ decision: 'allow', reason: 'A' },
				{ decision: 'allow', reason: 'B' }
			])
		).toEqual({ decision: 'allow', reason: 'A' });
	});

	test('any deny wins; all denying reasons are concatenated to avoid incremental denials', () => {
		expect(
			mergeDecisions([
				{ decision: 'allow', reason: 'A' },
				{ decision: 'deny', reason: 'first-deny' },
				{ decision: 'deny', reason: 'second-deny' }
			])
		).toEqual({ decision: 'deny', reason: 'first-deny\n\nsecond-deny' });
	});

	test('duplicate deny reasons are deduplicated in the concatenated output', () => {
		expect(
			mergeDecisions([
				{ decision: 'deny', reason: 'same-reason' },
				{ decision: 'deny', reason: 'same-reason' }
			])
		).toEqual({ decision: 'deny', reason: 'same-reason' });
	});

	test('deny wins even over ask', () => {
		expect(
			mergeDecisions([
				{ decision: 'ask', reason: 'A' },
				{ decision: 'deny', reason: 'D' }
			])
		).toEqual({ decision: 'deny', reason: 'D' });
	});

	test('any ask wins (no deny present); all asking reasons concatenated', () => {
		expect(
			mergeDecisions([
				{ decision: 'allow', reason: 'A' },
				{ decision: 'ask', reason: 'first-ask' },
				{ decision: 'ask', reason: 'second-ask' }
			])
		).toEqual({ decision: 'ask', reason: 'first-ask\n\nsecond-ask' });
	});

	test('all no-match → no-match', () => {
		expect(
			mergeDecisions([
				{ decision: 'no-match' },
				{ decision: 'no-match' }
			])
		).toEqual({ decision: 'no-match' });
	});

	test('allow + no-match downgrades to no-match (the unmatched segment forces prompt)', () => {
		expect(
			mergeDecisions([
				{ decision: 'allow', reason: 'A' },
				{ decision: 'no-match' }
			])
		).toEqual({ decision: 'no-match' });
	});

	test('ask + no-match → ask (the ask still wins because precedence ranks ask above no-match for stronger decisions)', () => {
		expect(
			mergeDecisions([
				{ decision: 'ask', reason: 'ASK' },
				{ decision: 'no-match' }
			])
		).toEqual({ decision: 'ask', reason: 'ASK' });
	});

	test('deny + no-match → deny', () => {
		expect(
			mergeDecisions([
				{ decision: 'no-match' },
				{ decision: 'deny', reason: 'D' }
			])
		).toEqual({ decision: 'deny', reason: 'D' });
	});
});
