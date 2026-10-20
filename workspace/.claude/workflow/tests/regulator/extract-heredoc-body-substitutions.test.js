import { describe, test, expect } from '@jest/globals';
import { extractHeredocBodySubstitutions } from '../../src/regulator/extract-heredoc-body-substitutions.js';

describe('extractHeredocBodySubstitutions', () => {
	describe('empty and substitution-free bodies', () => {
		test('returns empty spans when body is empty', () => {
			expect(extractHeredocBodySubstitutions('')).toEqual({ substitutionSpans: [] });
		});

		test('returns empty spans when body has no $( or backticks', () => {
			expect(extractHeredocBodySubstitutions('plain text body\nwith newlines\n')).toEqual({ substitutionSpans: [] });
		});

		test('returns empty spans when body has $VAR but no $(', () => {
			expect(extractHeredocBodySubstitutions('hello $USER and $HOME\n')).toEqual({ substitutionSpans: [] });
		});

		test('returns empty spans when body has $$ but no $(', () => {
			expect(extractHeredocBodySubstitutions('pid is $$\n')).toEqual({ substitutionSpans: [] });
		});
	});

	describe('single top-level $(...) span', () => {
		test('extracts $(date)', () => {
			expect(extractHeredocBodySubstitutions('today is $(date)\n')).toEqual({ substitutionSpans: ['$(date)'] });
		});

		test('extracts $(rm -rf /tmp/foo)', () => {
			expect(extractHeredocBodySubstitutions('$(rm -rf /tmp/foo)')).toEqual({ substitutionSpans: ['$(rm -rf /tmp/foo)'] });
		});

		test('extracts span at start of body', () => {
			expect(extractHeredocBodySubstitutions('$(date) was the date')).toEqual({ substitutionSpans: ['$(date)'] });
		});

		test('extracts span at end of body', () => {
			expect(extractHeredocBodySubstitutions('the date was $(date)')).toEqual({ substitutionSpans: ['$(date)'] });
		});
	});

	describe('nested $(...) returns outer span only', () => {
		test('nested $(nested $(date)) → outer span only', () => {
			expect(extractHeredocBodySubstitutions('body $(nested $(date)) here')).toEqual({
				substitutionSpans: ['$(nested $(date))']
			});
		});

		test('double-nested span returned as one outer span', () => {
			expect(extractHeredocBodySubstitutions('$(a $(b $(c)) d)')).toEqual({
				substitutionSpans: ['$(a $(b $(c)) d)']
			});
		});
	});

	describe('backtick spans', () => {
		test('extracts a single backtick span', () => {
			expect(extractHeredocBodySubstitutions('today is `date`')).toEqual({ substitutionSpans: ['`date`'] });
		});

		test('extracts a backtick span with arguments', () => {
			expect(extractHeredocBodySubstitutions('files: `ls -la /tmp`')).toEqual({ substitutionSpans: ['`ls -la /tmp`'] });
		});
	});

	describe('mixed $(...) and backtick spans', () => {
		test('returns both spans in order', () => {
			expect(extractHeredocBodySubstitutions('$(date) and `whoami` here')).toEqual({
				substitutionSpans: ['$(date)', '`whoami`']
			});
		});

		test('returns multiple $(...) spans', () => {
			expect(extractHeredocBodySubstitutions('$(a) then $(b) and $(c)')).toEqual({
				substitutionSpans: ['$(a)', '$(b)', '$(c)']
			});
		});
	});

	describe('backslash before $( is intentionally NOT respected', () => {
		test('over-approximates: \\$(escaped) is still extracted', () => {
			expect(extractHeredocBodySubstitutions('\\$(escaped)')).toEqual({ substitutionSpans: ['$(escaped)'] });
		});
	});

	describe('unterminated spans return tooComplex', () => {
		test('unterminated $( returns tooComplex', () => {
			expect(extractHeredocBodySubstitutions('hello $(cmd')).toEqual({ tooComplex: true });
		});

		test('unterminated backtick returns tooComplex', () => {
			expect(extractHeredocBodySubstitutions('hello `cmd')).toEqual({ tooComplex: true });
		});

		test('unterminated nested $( returns tooComplex', () => {
			expect(extractHeredocBodySubstitutions('$(outer $(inner)')).toEqual({ tooComplex: true });
		});
	});
});
