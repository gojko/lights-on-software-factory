import { describe, test, expect } from '@jest/globals';
import { splitSegments } from '../../src/regulator/split-segments.js';

describe('splitSegments', () => {
	describe('bare commands', () => {
		test('a bare command returns a single segment', () => {
			expect(splitSegments('ls -la')).toEqual({ segments: ['ls -la'] });
		});

		test('an empty string returns an empty segment list', () => {
			expect(splitSegments('')).toEqual({ segments: [] });
		});

		test('whitespace-only input returns an empty segment list', () => {
			expect(splitSegments('   ')).toEqual({ segments: [] });
		});
	});

	describe('top-level operator splitting', () => {
		test('splits on top-level && into two segments', () => {
			expect(splitSegments('cd src && ls')).toEqual({ segments: ['cd src', 'ls'] });
		});

		test('splits on top-level ; into two segments', () => {
			expect(splitSegments('echo a ; echo b')).toEqual({ segments: ['echo a', 'echo b'] });
		});

		test('splits on top-level || into two segments', () => {
			expect(splitSegments('make build || echo failed')).toEqual({ segments: ['make build', 'echo failed'] });
		});

		test('splits on top-level pipe | into two segments', () => {
			expect(splitSegments('cat foo | grep bar')).toEqual({ segments: ['cat foo', 'grep bar'] });
		});

		test('splits on top-level newline into two segments', () => {
			expect(splitSegments('echo a\necho b')).toEqual({ segments: ['echo a', 'echo b'] });
		});

		test('splits on top-level newline inside a for-loop body', () => {
			expect(splitSegments('for f in /a /b ; do\n  echo hi\n  grep -n foo /a\ndone')).toEqual({
				segments: ['for f in /a /b', 'do', 'echo hi', 'grep -n foo /a', 'done']
			});
		});

		test('splits a chain of three operators into four segments', () => {
			expect(splitSegments('a && b ; c || d')).toEqual({ segments: ['a', 'b', 'c', 'd'] });
		});

		test('does not confuse single | with ||', () => {
			expect(splitSegments('a | b || c')).toEqual({ segments: ['a', 'b', 'c'] });
		});
	});

	describe('quoting', () => {
		test('a split operator inside single quotes does not split', () => {
			expect(splitSegments(`echo 'a && b'`)).toEqual({ segments: [`echo 'a && b'`] });
		});

		test('a split operator inside double quotes does not split', () => {
			expect(splitSegments('echo "a || b"')).toEqual({ segments: ['echo "a || b"'] });
		});

		test('escaped operator outside quotes does not split', () => {
			expect(splitSegments('echo a \\&\\& b')).toEqual({ segments: ['echo a \\&\\& b'] });
		});

		test('semicolon inside single quotes does not split', () => {
			expect(splitSegments(`echo 'a; b'`)).toEqual({ segments: [`echo 'a; b'`] });
		});

		test('pipe inside double quotes does not split', () => {
			expect(splitSegments('echo "a | b"')).toEqual({ segments: ['echo "a | b"'] });
		});
	});

	describe('line continuations', () => {
		test('backslash-newline after && is elided so the next command is a clean segment', () => {
			expect(splitSegments('echo a && \\\necho b')).toEqual({ segments: ['echo a', 'echo b'] });
		});

		test('backslash-newline joins a split-up command into one segment', () => {
			expect(splitSegments('echo \\\nfoo')).toEqual({ segments: ['echo foo'] });
		});

		test('backslash before a non-newline character is still treated as an escape, not a continuation', () => {
			expect(splitSegments('echo a \\&\\& b')).toEqual({ segments: ['echo a \\&\\& b'] });
		});
	});

	describe('command substitution boundaries', () => {
		test('&& inside $(...) does not split the outer command', () => {
			expect(splitSegments('echo $(a && b)')).toEqual({ segments: ['echo $(a && b)'] });
		});

		test('split operator inside backticks does not split outer', () => {
			expect(splitSegments('echo `a && b`')).toEqual({ segments: ['echo `a && b`'] });
		});

		test('nested $(...) tracks depth correctly', () => {
			expect(splitSegments('echo $(a $(b && c) d)')).toEqual({ segments: ['echo $(a $(b && c) d)'] });
		});

		test('outer && splits when not inside substitution', () => {
			expect(splitSegments('echo $(a) && ls')).toEqual({ segments: ['echo $(a)', 'ls'] });
		});
	});

	describe('nested quotes inside command substitution', () => {
		test('double quotes inside $(...) within double quotes do not split prematurely', () => {
			expect(splitSegments('echo "$(a --query "x y" b)"')).toEqual({ segments: ['echo "$(a --query "x y" b)"'] });
		});

		test('pipe inside a command substitution within double quotes does not split the outer command', () => {
			expect(splitSegments('Q="$(a | head -1)"')).toEqual({ segments: ['Q="$(a | head -1)"'] });
		});

		test('operator inside nested double quotes within $(...) does not split', () => {
			expect(splitSegments('echo "$(a --query "p && q" b)"')).toEqual({ segments: ['echo "$(a --query "p && q" b)"'] });
		});

		test('paren inside a quoted string within $(...) does not prematurely close the substitution', () => {
			expect(splitSegments('echo $(a "b)c" d)')).toEqual({ segments: ['echo $(a "b)c" d)'] });
		});

		test('single-quoted string with parens inside $(...) within double quotes parses as one segment', () => {
			expect(splitSegments(`Q="$(aws --query 'C[?contains(@,'"'"'x'"'"')]' | head -1)"`)).toEqual({
				segments: [`Q="$(aws --query 'C[?contains(@,'"'"'x'"'"')]' | head -1)"`]
			});
		});
	});

	describe('too-complex sentinel', () => {
		test('heredoc without close returns tooComplex', () => {
			expect(splitSegments('cat <<EOF')).toEqual({ tooComplex: true });
		});

		test('heredoc with dash (tab-strip form) returns tooComplex', () => {
			expect(splitSegments('cat <<-EOF\nfoo\nEOF')).toEqual({ tooComplex: true });
		});

		test(`tab-strip + quoted heredoc <<-'EOF' returns tooComplex`, () => {
			expect(splitSegments(`cat <<-'EOF'\nfoo\nEOF`)).toEqual({ tooComplex: true });
		});

		test('multi-heredoc on a single command (cmd <<A <<B) returns tooComplex', () => {
			expect(splitSegments('cmd <<A <<B\nbody1\nA\nbody2\nB')).toEqual({ tooComplex: true });
		});

		test('unterminated single quote returns tooComplex', () => {
			expect(splitSegments(`echo 'hello`)).toEqual({ tooComplex: true });
		});

		test('unterminated double quote returns tooComplex', () => {
			expect(splitSegments('echo "hello')).toEqual({ tooComplex: true });
		});

		test('unterminated $(...) returns tooComplex', () => {
			expect(splitSegments('echo $(cmd')).toEqual({ tooComplex: true });
		});

		test('unterminated backtick returns tooComplex', () => {
			expect(splitSegments('echo `cmd')).toEqual({ tooComplex: true });
		});
	});

	describe('heredoc consumption (supported unquoted form)', () => {
		test('cat <<EOF\\nfoo\\nEOF → single segment [cat]', () => {
			expect(splitSegments('cat <<EOF\nfoo\nEOF')).toEqual({ segments: ['cat'] });
		});

		test('cat << EOF (with space) parses identically', () => {
			expect(splitSegments('cat << EOF\nfoo\nEOF')).toEqual({ segments: ['cat'] });
		});

		test('cat <<END (alternative delimiter) parses', () => {
			expect(splitSegments('cat <<END\nfoo\nbar\nEND')).toEqual({ segments: ['cat'] });
		});

		test('echo before && cat <<EOF\\nbody\\nEOF → two segments', () => {
			expect(splitSegments('echo before && cat <<EOF\nbody\nEOF')).toEqual({
				segments: ['echo before', 'cat']
			});
		});

		test('cat <<EOF\\nfoo\\nEOF\\n&& ls → top-level split resumes after close', () => {
			expect(splitSegments('cat <<EOF\nfoo\nEOF\n&& ls')).toEqual({ segments: ['cat', 'ls'] });
		});

		test('cat <<EOF\\n$(date)\\nEOF → segment surfaces the substitution', () => {
			expect(splitSegments('cat <<EOF\n$(date)\nEOF')).toEqual({ segments: ['cat $(date)'] });
		});

		test('cat <<EOF\\n$(rm -rf /tmp)\\nEOF → segment surfaces destructive substitution', () => {
			expect(splitSegments('cat <<EOF\n$(rm -rf /tmp)\nEOF')).toEqual({ segments: ['cat $(rm -rf /tmp)'] });
		});

		test('cat <<EOF\\n`date`\\nEOF → segment surfaces backtick substitution', () => {
			expect(splitSegments('cat <<EOF\n`date`\nEOF')).toEqual({ segments: ['cat `date`'] });
		});

		test('operator && inside heredoc body does NOT split the command', () => {
			expect(splitSegments('cat <<EOF\nfoo && bar\nEOF')).toEqual({ segments: ['cat'] });
		});

		test('operator ; inside heredoc body does NOT split', () => {
			expect(splitSegments('cat <<EOF\na ; b\nEOF')).toEqual({ segments: ['cat'] });
		});

		test('operator | inside heredoc body does NOT split', () => {
			expect(splitSegments('cat <<EOF\na | b\nEOF')).toEqual({ segments: ['cat'] });
		});

		test('two sequential heredocs in separate segments parse cleanly', () => {
			expect(splitSegments('cat <<EOF\nbody1\nEOF\ncat <<END\nbody2\nEND')).toEqual({
				segments: ['cat', 'cat']
			});
		});
	});

	describe('heredoc consumption (supported quoted forms)', () => {
		test(`cat <<'EOF'\\nfoo\\nEOF (single-quoted) → single segment [cat]`, () => {
			expect(splitSegments(`cat <<'EOF'\nfoo\nEOF`)).toEqual({ segments: ['cat'] });
		});

		test(`cat << 'EOF' (single-quoted with space) parses identically`, () => {
			expect(splitSegments(`cat << 'EOF'\nfoo\nEOF`)).toEqual({ segments: ['cat'] });
		});

		test('cat <<"EOF"\\nfoo\\nEOF (double-quoted) → single segment [cat]', () => {
			expect(splitSegments('cat <<"EOF"\nfoo\nEOF')).toEqual({ segments: ['cat'] });
		});

		test('cat <<\\\\EOF\\nfoo\\nEOF (backslash-quoted) → single segment [cat]', () => {
			expect(splitSegments('cat <<\\EOF\nfoo\nEOF')).toEqual({ segments: ['cat'] });
		});

		test(`quoted heredoc body $(rm -rf /) does NOT split — body is literal`, () => {
			expect(splitSegments(`cat <<'EOF'\n$(rm -rf /)\nEOF`)).toEqual({ segments: ['cat'] });
		});

		test(`quoted heredoc followed by && ls → top-level split resumes after close`, () => {
			expect(splitSegments(`cat <<'EOF'\nfoo\nEOF\n&& ls`)).toEqual({ segments: ['cat', 'ls'] });
		});
	});

	describe('subshell parens', () => {
		test('a bare subshell yields the inner segment', () => {
			expect(splitSegments('(echo a)')).toEqual({ segments: ['echo a'] });
		});

		test('semicolons inside a subshell still split into segments', () => {
			expect(splitSegments('(echo a; echo b)')).toEqual({ segments: ['echo a', 'echo b'] });
		});

		test('a subshell piped to another command splits cleanly across the (...) | boundary', () => {
			expect(splitSegments('(git diff; echo b) | xargs grep foo')).toEqual({
				segments: ['git diff', 'echo b', 'xargs grep foo']
			});
		});

		test('cd && (subshell) | xargs grep ... splits without leaking parens into tokens', () => {
			expect(
				splitSegments(`cd /tmp && (git diff HEAD --name-only -- '*test*'; echo b) | xargs grep -lE "Gap [0-9]" 2>/dev/null`)
			).toEqual({
				segments: [
					'cd /tmp',
					`git diff HEAD --name-only -- '*test*'`,
					'echo b',
					'xargs grep -lE "Gap [0-9]" 2>/dev/null'
				]
			});
		});

		test('parens inside single quotes are not treated as subshell boundaries', () => {
			expect(splitSegments(`echo '(a; b)'`)).toEqual({ segments: [`echo '(a; b)'`] });
		});

		test('parens inside $(...) substitution stay nested, not split', () => {
			expect(splitSegments('echo $(a; b)')).toEqual({ segments: ['echo $(a; b)'] });
		});
	});

	describe('brace groups', () => {
		test('{ foo; } yields the inner segment', () => {
			expect(splitSegments('{ echo a; }')).toEqual({ segments: ['echo a'] });
		});

		test('semicolons inside a brace group still split into segments', () => {
			expect(splitSegments('{ echo a; echo b; }')).toEqual({ segments: ['echo a', 'echo b'] });
		});

		test('brace group piped to another command splits cleanly across the } | boundary', () => {
			expect(splitSegments('{ echo a; echo b; } | grep foo')).toEqual({
				segments: ['echo a', 'echo b', 'grep foo']
			});
		});

		test('brace group with trailing redirect splits redirect off as its own segment', () => {
			expect(splitSegments('{ time make test; } 2>&1 | tail -25')).toEqual({
				segments: ['time make test', '2>&1', 'tail -25']
			});
		});

		test('${VAR} parameter expansion is NOT split (preceded by $)', () => {
			expect(splitSegments('echo ${VAR}')).toEqual({ segments: ['echo ${VAR}'] });
		});

		test('brace expansion file{a,b}.txt is NOT split (no whitespace after {)', () => {
			expect(splitSegments('cp file{a,b}.txt /tmp/')).toEqual({ segments: ['cp file{a,b}.txt /tmp/'] });
		});

		test('find ... {} \\; placeholder is NOT split (no whitespace inside {})', () => {
			expect(splitSegments('find . -exec foo {} \\;')).toEqual({ segments: ['find . -exec foo {} \\;'] });
		});

		test('braces inside single quotes are not treated as brace-group boundaries', () => {
			expect(splitSegments(`echo '{ a; b; }'`)).toEqual({ segments: [`echo '{ a; b; }'`] });
		});

		test('braces inside double quotes are not treated as brace-group boundaries', () => {
			expect(splitSegments('echo "{ a; b; }"')).toEqual({ segments: ['echo "{ a; b; }"'] });
		});

		test('multi-line brace group with newline-separated body', () => {
			expect(splitSegments('{\n  echo a\n  echo b\n}')).toEqual({ segments: ['echo a', 'echo b'] });
		});
	});

	describe('function definitions', () => {
		test('a definition header is kept as a NAME() marker segment', () => {
			expect(splitSegments('run() { echo a; }')).toEqual({ segments: ['run()', 'echo a'] });
		});

		test('a space between the name and the parens is tolerated', () => {
			expect(splitSegments('run () { echo a; }')).toEqual({ segments: ['run()', 'echo a'] });
		});

		test('a space between the parens is tolerated', () => {
			expect(splitSegments('run( ) { echo a; }')).toEqual({ segments: ['run()', 'echo a'] });
		});

		test('a dash in the function name is accepted', () => {
			expect(splitSegments('run-tests() { echo a; }')).toEqual({ segments: ['run-tests()', 'echo a'] });
		});

		test('a piped function body splits into separate segments', () => {
			expect(splitSegments('run() { jest -t "$1" | grep Tests: ; }')).toEqual({
				segments: ['run()', 'jest -t "$1"', 'grep Tests:']
			});
		});

		test('a definition followed by a call keeps the call as its own segment', () => {
			expect(splitSegments('run() { echo a; }\nrun foo')).toEqual({ segments: ['run()', 'echo a', 'run foo'] });
		});

		test('a bare subshell is not mistaken for a definition header', () => {
			expect(splitSegments('(echo a)')).toEqual({ segments: ['echo a'] });
		});

		test('a command followed by a subshell is not mistaken for a definition header', () => {
			expect(splitSegments('echo a && (echo b)')).toEqual({ segments: ['echo a', 'echo b'] });
		});

		test('parens with content are not treated as a definition header', () => {
			expect(splitSegments('foo(echo a)')).toEqual({ segments: ['foo', 'echo a'] });
		});
	});

	describe('whitespace handling', () => {
		test('trims surrounding whitespace from each segment', () => {
			const result = splitSegments('  ls -la  &&   echo done  ');
			expect(result).toEqual({ segments: ['ls -la', 'echo done'] });
		});

		test('drops empty segments produced by trailing operators', () => {
			expect(splitSegments('ls &&')).toEqual({ segments: ['ls'] });
		});
	});
});
