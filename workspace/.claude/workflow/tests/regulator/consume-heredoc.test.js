import { describe, test, expect } from '@jest/globals';
import { consumeHeredoc } from '../../src/regulator/consume-heredoc.js';

describe('consumeHeredoc', () => {
	describe('supported unquoted opener forms', () => {
		test('<<EOF with simple body and close → endIndex past the close, no substitutions', () => {
			const command = 'cat <<EOF\nfoo\nEOF';
			const result = consumeHeredoc(command, 4);
			expect(result).toEqual({ endIndex: command.length, substitutionSpans: [] });
		});

		test('<< EOF (with space) parses identically', () => {
			const command = 'cat << EOF\nfoo\nEOF';
			const result = consumeHeredoc(command, 4);
			expect(result).toEqual({ endIndex: command.length, substitutionSpans: [] });
		});

		test('<<END (alternative delimiter) parses', () => {
			const command = 'cat <<END\nfoo\nbar\nEND';
			const result = consumeHeredoc(command, 4);
			expect(result).toEqual({ endIndex: command.length, substitutionSpans: [] });
		});

		test('<<SCRIPT (mixed-case multi-letter delimiter) parses', () => {
			const command = 'cat <<SCRIPT\nbody\nSCRIPT';
			const result = consumeHeredoc(command, 4);
			expect(result).toEqual({ endIndex: command.length, substitutionSpans: [] });
		});

		test('endIndex points past trailing newline when close is followed by \\n', () => {
			const command = 'cat <<EOF\nfoo\nEOF\n';
			const result = consumeHeredoc(command, 4);
			expect(result.endIndex).toBe(command.length);
			expect(result.substitutionSpans).toEqual([]);
		});

		test('endIndex points past close when more text follows the close newline', () => {
			const command = 'cat <<EOF\nfoo\nEOF\n&& ls';
			const result = consumeHeredoc(command, 4);
			expect(command.slice(result.endIndex)).toEqual('&& ls');
			expect(result.substitutionSpans).toEqual([]);
		});
	});

	describe('body substitution extraction', () => {
		test('body $(date) is surfaced as a substitution span', () => {
			const command = 'cat <<EOF\n$(date)\nEOF';
			const result = consumeHeredoc(command, 4);
			expect(result.substitutionSpans).toEqual(['$(date)']);
			expect(result.endIndex).toBe(command.length);
		});

		test('body with $(rm -rf /tmp) surfaces the inner span verbatim', () => {
			const command = 'cat <<EOF\n$(rm -rf /tmp)\nEOF';
			const result = consumeHeredoc(command, 4);
			expect(result.substitutionSpans).toEqual(['$(rm -rf /tmp)']);
		});

		test('backtick body span surfaced', () => {
			const command = 'cat <<EOF\n`date`\nEOF';
			const result = consumeHeredoc(command, 4);
			expect(result.substitutionSpans).toEqual(['`date`']);
		});

		test('multiple body spans surfaced in order', () => {
			const command = 'cat <<EOF\n$(a) and $(b)\nEOF';
			const result = consumeHeredoc(command, 4);
			expect(result.substitutionSpans).toEqual(['$(a)', '$(b)']);
		});

		test('operator && inside body does NOT split — body is opaque', () => {
			const command = 'cat <<EOF\nfoo && bar\nEOF';
			const result = consumeHeredoc(command, 4);
			expect(result.substitutionSpans).toEqual([]);
		});

		test('unterminated $( in body returns tooComplex', () => {
			const command = 'cat <<EOF\n$(cmd\nEOF';
			expect(consumeHeredoc(command, 4)).toEqual({ tooComplex: true });
		});
	});

	describe('close line requirements', () => {
		test('close not found → tooComplex', () => {
			expect(consumeHeredoc('cat <<EOF\nfoo', 4)).toEqual({ tooComplex: true });
		});

		test('close indented (leading whitespace) does NOT match → tooComplex', () => {
			expect(consumeHeredoc('cat <<EOF\nfoo\n  EOF', 4)).toEqual({ tooComplex: true });
		});

		test('close with trailing junk on same line does NOT match → tooComplex', () => {
			expect(consumeHeredoc('cat <<EOF\nfoo\nEOF junk', 4)).toEqual({ tooComplex: true });
		});

		test('close at column 0 followed by newline matches', () => {
			const command = 'cat <<EOF\nbody\nEOF\nmore';
			const result = consumeHeredoc(command, 4);
			expect(command.slice(result.endIndex)).toEqual('more');
		});

		test('close at column 0 at end-of-input matches', () => {
			const command = 'cat <<EOF\nbody\nEOF';
			const result = consumeHeredoc(command, 4);
			expect(result.endIndex).toBe(command.length);
		});
	});

	describe('supported quoted opener forms', () => {
		test(`<<'EOF' (single-quoted) parses with no substitutions`, () => {
			const command = `cat <<'EOF'\nfoo\nEOF`;
			const result = consumeHeredoc(command, 4);
			expect(result).toEqual({ endIndex: command.length, substitutionSpans: [] });
		});

		test(`<< 'EOF' (single-quoted with space after <<) parses`, () => {
			const command = `cat << 'EOF'\nfoo\nEOF`;
			const result = consumeHeredoc(command, 4);
			expect(result).toEqual({ endIndex: command.length, substitutionSpans: [] });
		});

		test('<<"EOF" (double-quoted) parses with no substitutions', () => {
			const command = 'cat <<"EOF"\nfoo\nEOF';
			const result = consumeHeredoc(command, 4);
			expect(result).toEqual({ endIndex: command.length, substitutionSpans: [] });
		});

		test('<<\\EOF (backslash-quoted) parses with no substitutions', () => {
			const command = 'cat <<\\EOF\nfoo\nEOF';
			const result = consumeHeredoc(command, 4);
			expect(result).toEqual({ endIndex: command.length, substitutionSpans: [] });
		});

		test(`<<'EOF' with $(date) in body returns no substitutions — bash treats body as literal`, () => {
			const command = `cat <<'EOF'\n$(date)\nEOF`;
			const result = consumeHeredoc(command, 4);
			expect(result).toEqual({ endIndex: command.length, substitutionSpans: [] });
		});

		test(`<<'EOF' with $(rm -rf /) in body still returns no substitutions — body is opaque`, () => {
			const command = `cat <<'EOF'\n$(rm -rf /)\nEOF`;
			const result = consumeHeredoc(command, 4);
			expect(result).toEqual({ endIndex: command.length, substitutionSpans: [] });
		});

		test('<<"EOF" with backtick body returns no substitutions', () => {
			const command = 'cat <<"EOF"\n`date`\nEOF';
			const result = consumeHeredoc(command, 4);
			expect(result).toEqual({ endIndex: command.length, substitutionSpans: [] });
		});

		test(`<<'EOF' with body containing unterminated $( returns no substitutions — body opaque, never extracted`, () => {
			const command = `cat <<'EOF'\n$(cmd\nEOF`;
			const result = consumeHeredoc(command, 4);
			expect(result).toEqual({ endIndex: command.length, substitutionSpans: [] });
		});

		test(`<<'EOF' with text after close line is consumed correctly`, () => {
			const command = `cat <<'EOF'\nfoo\nEOF\n&& ls`;
			const result = consumeHeredoc(command, 4);
			expect(command.slice(result.endIndex)).toEqual('&& ls');
			expect(result.substitutionSpans).toEqual([]);
		});

		test(`<<'EOF' with no matching close → tooComplex`, () => {
			expect(consumeHeredoc(`cat <<'EOF'\nfoo`, 4)).toEqual({ tooComplex: true });
		});

		test(`<<'' (empty single-quoted delimiter) → tooComplex`, () => {
			expect(consumeHeredoc(`cat <<''\nfoo\n`, 4)).toEqual({ tooComplex: true });
		});

		test(`<<'EOF (unterminated single-quote on opener) → tooComplex`, () => {
			expect(consumeHeredoc(`cat <<'EOF\nfoo\nEOF`, 4)).toEqual({ tooComplex: true });
		});
	});

	describe('unsupported variants return tooComplex', () => {
		test('<<-EOF (tab-strip) → tooComplex', () => {
			expect(consumeHeredoc('cat <<-EOF\nfoo\nEOF', 4)).toEqual({ tooComplex: true });
		});

		test(`<<-'EOF' (tab-strip + quoted) → tooComplex`, () => {
			expect(consumeHeredoc(`cat <<-'EOF'\nfoo\nEOF`, 4)).toEqual({ tooComplex: true });
		});

		test('<< followed by digit (invalid delimiter) → tooComplex', () => {
			expect(consumeHeredoc('cat <<9EOF\nfoo\n9EOF', 4)).toEqual({ tooComplex: true });
		});

		test('<< with no delimiter at all → tooComplex', () => {
			expect(consumeHeredoc('cat <<', 4)).toEqual({ tooComplex: true });
		});
	});
});
