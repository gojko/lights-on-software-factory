import { afterEach, beforeEach, describe, test, expect } from '@jest/globals';
import { parseCommand } from '../../src/regulator/parse-command.js';

describe('parseCommand', () => {
	describe('bare commands', () => {
		test('ls -la → one segment with two tokens', () => {
			expect(parseCommand('ls -la')).toEqual({
				segments: [{ tokens: ['ls', '-la'], originalText: 'ls -la' }]
			});
		});

		test('empty input → empty segments', () => {
			expect(parseCommand('')).toEqual({ segments: [] });
		});

		test('whitespace-only input → empty segments', () => {
			expect(parseCommand('   ')).toEqual({ segments: [] });
		});
	});

	describe('quoted token handling', () => {
		test('double-quoted token is one token, quotes stripped', () => {
			expect(parseCommand('echo "hello world"')).toEqual({
				segments: [{ tokens: ['echo', 'hello world'], originalText: 'echo "hello world"' }]
			});
		});

		test('single-quoted token is one token, quotes stripped', () => {
			expect(parseCommand(`echo 'hello world'`)).toEqual({
				segments: [{ tokens: ['echo', 'hello world'], originalText: `echo 'hello world'` }]
			});
		});

		test('split operator inside quotes does not split', () => {
			expect(parseCommand(`echo 'a && b'`)).toEqual({
				segments: [{ tokens: ['echo', 'a && b'], originalText: `echo 'a && b'` }]
			});
		});
	});

	describe('top-level operator splitting', () => {
		test('cd src && ls → two segments', () => {
			expect(parseCommand('cd src && ls')).toEqual({
				segments: [
					{ tokens: ['cd', 'src'], originalText: 'cd src' },
					{ tokens: ['ls'], originalText: 'ls' }
				]
			});
		});

		test('pipe splits into two segments', () => {
			expect(parseCommand('cat foo | grep bar')).toEqual({
				segments: [
					{ tokens: ['cat', 'foo'], originalText: 'cat foo' },
					{ tokens: ['grep', 'bar'], originalText: 'grep bar' }
				]
			});
		});
	});

	describe('line continuations', () => {
		test('backslash-newline after && tokenizes the continued command cleanly', () => {
			expect(parseCommand('echo a && \\\necho b')).toEqual({
				segments: [
					{ tokens: ['echo', 'a'], originalText: 'echo a' },
					{ tokens: ['echo', 'b'], originalText: 'echo b' }
				]
			});
		});

		test('env-assignment survives a backslash-newline continuation before it', () => {
			expect(parseCommand('echo a && \\\nTARGET=myenv make deploy')).toEqual({
				segments: [
					{ tokens: ['echo', 'a'], originalText: 'echo a' },
					{ tokens: ['make', 'deploy'], originalText: 'TARGET=myenv make deploy' }
				]
			});
		});
	});

	describe('env-var stripping', () => {
		test('strips leading VAR=value', () => {
			expect(parseCommand('TARGET=myenv make deploy')).toEqual({
				segments: [{ tokens: ['make', 'deploy'], originalText: 'TARGET=myenv make deploy' }]
			});
		});

		test('strips multiple leading VAR=value tokens', () => {
			expect(parseCommand('TARGET=myenv REGION=region-a make deploy')).toEqual({
				segments: [
					{ tokens: ['make', 'deploy'], originalText: 'TARGET=myenv REGION=region-a make deploy' }
				]
			});
		});

		test('only strips assignments at the front, not in the middle', () => {
			expect(parseCommand('make TARGET=myenv deploy')).toEqual({
				segments: [
					{ tokens: ['make', 'TARGET=myenv', 'deploy'], originalText: 'make TARGET=myenv deploy' }
				]
			});
		});

		test('originalText preserves the unstripped command verbatim', () => {
			const result = parseCommand('FOO=bar baz');
			expect(result.segments[0].originalText).toBe('FOO=bar baz');
		});
	});

	describe('redirect-target stripping', () => {
		test('strips > and target', () => {
			expect(parseCommand('npm test > out.log')).toEqual({
				segments: [{ tokens: ['npm', 'test'], originalText: 'npm test > out.log' }]
			});
		});

		test('strips 2>&1 fused token', () => {
			expect(parseCommand('npm test 2>&1')).toEqual({
				segments: [{ tokens: ['npm', 'test'], originalText: 'npm test 2>&1' }]
			});
		});

		test('strips combined redirects: npm test 2>&1 > out.log', () => {
			expect(parseCommand('npm test 2>&1 > out.log')).toEqual({
				segments: [{ tokens: ['npm', 'test'], originalText: 'npm test 2>&1 > out.log' }]
			});
		});

		test('strips >> append redirect with target', () => {
			expect(parseCommand('echo hi >> log.txt')).toEqual({
				segments: [{ tokens: ['echo', 'hi'], originalText: 'echo hi >> log.txt' }]
			});
		});

		test('strips < input redirect with target', () => {
			expect(parseCommand('sort < input.txt')).toEqual({
				segments: [{ tokens: ['sort'], originalText: 'sort < input.txt' }]
			});
		});

		test('drops standalone pure-redirect segment that follows a subshell close', () => {
			expect(parseCommand('(echo hi) 2>&1')).toEqual({
				segments: [{ tokens: ['echo', 'hi'], originalText: 'echo hi' }]
			});
		});

		test('drops standalone pure-redirect segment that follows a brace-group close', () => {
			expect(parseCommand('{ echo hi; } 2>&1')).toEqual({
				segments: [{ tokens: ['echo', 'hi'], originalText: 'echo hi' }]
			});
		});
	});

	describe('command substitution recursion', () => {
		test('echo $(cat /tmp/cmd.txt) → outer "echo" + inner "cat /tmp/cmd.txt"', () => {
			expect(parseCommand('echo $(cat /tmp/cmd.txt)')).toEqual({
				segments: [
					{ tokens: ['echo'], originalText: 'echo $(cat /tmp/cmd.txt)' },
					{ tokens: ['cat', '/tmp/cmd.txt'], originalText: 'cat /tmp/cmd.txt' }
				]
			});
		});

		test('backtick substitution body parsed as inner segment', () => {
			expect(parseCommand('echo `cat /tmp/x.txt`')).toEqual({
				segments: [
					{ tokens: ['echo'], originalText: 'echo `cat /tmp/x.txt`' },
					{ tokens: ['cat', '/tmp/x.txt'], originalText: 'cat /tmp/x.txt' }
				]
			});
		});

		test('substitution in middle of compound command', () => {
			expect(parseCommand('cd /tmp && echo $(date)')).toEqual({
				segments: [
					{ tokens: ['cd', '/tmp'], originalText: 'cd /tmp' },
					{ tokens: ['echo'], originalText: 'echo $(date)' },
					{ tokens: ['date'], originalText: 'date' }
				]
			});
		});

		test('command substitution inside an env-assignment value is recursively parsed', () => {
			const result = parseCommand('exports=$(grep -E foo bar.js)'),
				grepSeg = result.segments.find((s) => s.tokens[0] === 'grep');
			expect(grepSeg).toBeDefined();
			expect(grepSeg.tokens).toEqual(['grep', '-E', 'foo', 'bar.js']);
		});

		test('backtick substitution inside an env-assignment value is recursively parsed', () => {
			const result = parseCommand('today=`date +%Y`'),
				dateSeg = result.segments.find((s) => s.tokens[0] === 'date');
			expect(dateSeg).toBeDefined();
			expect(dateSeg.tokens).toEqual(['date', '+%Y']);
		});

		test('piped substitution inside an env-assignment value yields each piped command as a segment', () => {
			const result = parseCommand('out=$(grep foo file | sed s/a/b/)'),
				grepSeg = result.segments.find((s) => s.tokens[0] === 'grep'),
				sedSeg = result.segments.find((s) => s.tokens[0] === 'sed');
			expect(grepSeg).toEqual({ tokens: ['grep', 'foo', 'file'], originalText: 'grep foo file' });
			expect(sedSeg).toEqual({ tokens: ['sed', 's/a/b/'], originalText: 'sed s/a/b/' });
		});

		test('double-quoted assignment whose substitution contains nested double quotes and a pipe is recursed', () => {
			const result = parseCommand('Q="$(aws sqs list-queues --query "QueueUrls[0]" --output text | head -1)"'),
				awsSeg = result.segments.find((s) => s.tokens[0] === 'aws'),
				headSeg = result.segments.find((s) => s.tokens[0] === 'head');
			expect(awsSeg).toEqual({
				tokens: ['aws', 'sqs', 'list-queues', '--query', 'QueueUrls[0]', '--output', 'text'],
				originalText: 'aws sqs list-queues --query "QueueUrls[0]" --output text'
			});
			expect(headSeg).toEqual({ tokens: ['head', '-1'], originalText: 'head -1' });
		});

		test('multiple leading env-assignments each have their substitutions recursed', () => {
			const result = parseCommand('A=$(echo hi) B=$(date) make deploy'),
				echoSeg = result.segments.find((s) => s.tokens[0] === 'echo'),
				dateSeg = result.segments.find((s) => s.tokens[0] === 'date'),
				makeSeg = result.segments.find((s) => s.tokens[0] === 'make');
			expect(echoSeg).toEqual({ tokens: ['echo', 'hi'], originalText: 'echo hi' });
			expect(dateSeg).toEqual({ tokens: ['date'], originalText: 'date' });
			expect(makeSeg).toEqual({ tokens: ['make', 'deploy'], originalText: 'A=$(echo hi) B=$(date) make deploy' });
		});

		test('plain env-assignment without substitution still produces no executable command segment', () => {
			const result = parseCommand('FOO=bar');
			expect(result.segments.some((s) => s.tokens.length > 0)).toBe(false);
		});

		test('for-loop body with var=$(grep|sed) and var=$(basename) substitutions are all recursed (regression for permission-prompt case)', () => {
			const command = 'for f in src/strategies/*.js; do\n'
				+ '  exports=$(grep -E "^export (const|function|class) " "$f" | sed -E \'s/^export (const|function|class) ([A-Za-z_$][A-Za-z0-9_$]*).*/\\2/\')\n'
				+ '  base=$(basename "$f" .js)\n'
				+ '  echo "$base.js → $exports"\n'
				+ 'done',
				result = parseCommand(command),
				headTokens = result.segments.map((s) => s.tokens[0]);
			expect(headTokens).toEqual(expect.arrayContaining(['grep', 'sed', 'basename', 'echo']));
			expect(headTokens).not.toContain('for');
			expect(headTokens).not.toContain('do');
			expect(headTokens).not.toContain('done');
		});
	});

	describe('loop body recursion', () => {
		test('for ... do ... done body is re-parsed', () => {
			const result = parseCommand('for f in *.js; do node $f; done');
			const inner = result.segments.find((s) => s.tokens[0] === 'node');
			expect(inner).toEqual({ tokens: ['node', '$f'], originalText: 'node $f' });
		});

		test('while ... do ... done body is re-parsed', () => {
			const result = parseCommand('while read line; do echo $line; done');
			const inner = result.segments.find((s) => s.tokens[0] === 'echo');
			expect(inner).toBeDefined();
			expect(inner.tokens).toEqual(['echo', '$line']);
		});

		test('until ... do ... done body is re-parsed', () => {
			const result = parseCommand('until ok; do sleep 1; done');
			const inner = result.segments.find((s) => s.tokens[0] === 'sleep');
			expect(inner).toBeDefined();
		});

		test('for ... do ... done with redirect on done terminator is still collapsed', () => {
			const result = parseCommand('for f in *.js; do node $f; done 2>/dev/null'),
				headTokens = result.segments.map((s) => s.tokens[0]),
				inner = result.segments.find((s) => s.tokens[0] === 'node');
			expect(inner).toEqual({ tokens: ['node', '$f'], originalText: 'node $f' });
			expect(headTokens).not.toContain('for');
			expect(headTokens).not.toContain('do');
			expect(headTokens).not.toContain('done');
		});

		test('multi-line for ... do ... done body is re-parsed (newline-separated body commands)', () => {
			const result = parseCommand('for f in /a /b ; do\n  echo hi\n  grep -n foo /a\ndone'),
				echoSeg = result.segments.find((s) => s.tokens[0] === 'echo'),
				grepSeg = result.segments.find((s) => s.tokens[0] === 'grep');
			expect(echoSeg).toEqual({ tokens: ['echo', 'hi'], originalText: 'echo hi' });
			expect(grepSeg).toEqual({ tokens: ['grep', '-n', 'foo', '/a'], originalText: 'grep -n foo /a' });
		});
	});

	describe('function definition collapsing', () => {
		test('the definition header segment is dropped and the body is kept', () => {
			const result = parseCommand('run() { echo a; }');
			expect(result.segments).toEqual([{ tokens: ['echo', 'a'], originalText: 'echo a' }]);
		});

		test('a call to a defined function is dropped', () => {
			const headTokens = parseCommand('run() { echo a; }\nrun foo').segments.map((s) => s.tokens[0]);
			expect(headTokens).toEqual(['echo']);
		});

		test('every call to a defined function is dropped when it is called more than once', () => {
			const headTokens = parseCommand('run() { echo a; }\nrun foo\nls\nrun bar').segments.map((s) => s.tokens[0]);
			expect(headTokens).toEqual(['echo', 'ls']);
		});

		test('a call to an undefined function is kept', () => {
			const headTokens = parseCommand('run foo').segments.map((s) => s.tokens[0]);
			expect(headTokens).toEqual(['run']);
		});

		test('a call placed before its definition is kept', () => {
			const headTokens = parseCommand('run foo\nrun() { echo a; }').segments.map((s) => s.tokens[0]);
			expect(headTokens).toEqual(['run', 'echo']);
		});

		test('a command that shares a prefix with a function name is kept', () => {
			const headTokens = parseCommand('run() { echo a; }\nrunner foo').segments.map((s) => s.tokens[0]);
			expect(headTokens).toEqual(['echo', 'runner']);
		});

		test('a multi-command function body is parsed as separate segments', () => {
			const headTokens = parseCommand('run() { jest -t "$1" | grep Tests: ; }\nrun foo').segments.map((s) => s.tokens[0]);
			expect(headTokens).toEqual(['jest', 'grep']);
		});

		test('a loop inside a function body is still collapsed', () => {
			const headTokens = parseCommand('run() { for f in *.js; do node $f; done; }\nrun').segments.map((s) => s.tokens[0]);
			expect(headTokens).toEqual(['node']);
		});
	});

	describe('sh -c / bash -c re-evaluation', () => {
		test('sh -c "INNER" is re-parsed', () => {
			const result = parseCommand('sh -c "npm test"');
			const inner = result.segments.find((s) => s.tokens[0] === 'npm');
			expect(inner).toEqual({ tokens: ['npm', 'test'], originalText: 'npm test' });
		});

		test('bash -c "INNER" is re-parsed', () => {
			const result = parseCommand(`bash -c 'rm -rf /tmp/foo'`);
			const inner = result.segments.find((s) => s.tokens[0] === 'rm');
			expect(inner).toBeDefined();
			expect(inner.tokens).toEqual(['rm', '-rf', '/tmp/foo']);
		});

		test('xargs -I{} sh -c "INNER" is re-parsed (wrapper-prefixed shell)', () => {
			const result = parseCommand(`xargs -I{} sh -c 'grep -o foo bar'`);
			const inner = result.segments.find((s) => s.tokens[0] === 'grep');
			expect(inner).toBeDefined();
			expect(inner.tokens).toEqual(['grep', '-o', 'foo', 'bar']);
		});

		test('sh -c with parseable inner script emits no outer marker segment', () => {
			const result = parseCommand('sh -c "npm test"');
			const marker = result.segments.find((s) => s.tokens[0] === 'sh');
			expect(marker).toBeUndefined();
		});

		test('sh -c with empty inner script keeps the outer marker segment', () => {
			const result = parseCommand(`sh -c ''`);
			expect(result.segments).toEqual([{ tokens: ['sh', '-c'], originalText: `sh -c ''` }]);
		});
	});

	describe('script -c re-evaluation', () => {
		test('script -c "INNER" logfile is re-parsed and the recorder tokens are dropped', () => {
			const result = parseCommand('script -q -e -c "make test" /tmp/o.log');
			expect(result.segments).toEqual([{ tokens: ['make', 'test'], originalText: 'make test' }]);
		});

		test('a bundled flag group that ends in c is re-parsed', () => {
			const result = parseCommand('script -qec "make test" /tmp/o.log');
			expect(result.segments).toEqual([{ tokens: ['make', 'test'], originalText: 'make test' }]);
		});

		test('the --command= long form is re-parsed', () => {
			const result = parseCommand('script --command="make test" /tmp/o.log');
			expect(result.segments).toEqual([{ tokens: ['make', 'test'], originalText: 'make test' }]);
		});

		test('every segment of a compound inner command becomes its own segment', () => {
			const heads = parseCommand('script -c "make test; git push" /tmp/o.log').segments.map((s) => s.tokens[0]);
			expect(heads).toEqual(['make', 'git']);
		});

		test('script without -c keeps the recorder segment', () => {
			const result = parseCommand('script /tmp/o.log');
			expect(result.segments).toEqual([{ tokens: ['script', '/tmp/o.log'], originalText: 'script /tmp/o.log' }]);
		});

		test('script -c with an empty inner command keeps the outer marker segment', () => {
			const heads = parseCommand(`script -c '' /tmp/o.log`).segments.map((s) => s.tokens.join(' '));
			expect(heads).toEqual(['script -c']);
		});
	});

	describe('too-complex propagation', () => {
		test('heredoc with missing close returns tooComplex', () => {
			expect(parseCommand('cat <<EOF')).toEqual({ tooComplex: true });
		});

		test('heredoc with body but no close returns tooComplex', () => {
			expect(parseCommand('cat <<EOF\nfoo')).toEqual({ tooComplex: true });
		});

		test('tab-strip heredoc <<-EOF returns tooComplex', () => {
			expect(parseCommand('cat <<-EOF\nfoo\nEOF')).toEqual({ tooComplex: true });
		});

		test(`tab-strip + quoted heredoc <<-'EOF' returns tooComplex`, () => {
			expect(parseCommand(`cat <<-'EOF'\nfoo\nEOF`)).toEqual({ tooComplex: true });
		});

		test('unterminated quote returns tooComplex', () => {
			expect(parseCommand(`echo 'hello`)).toEqual({ tooComplex: true });
		});
	});

	describe('heredoc consumption', () => {
		test('cat <<EOF\\nfoo\\nEOF → one segment with tokens [cat]', () => {
			const result = parseCommand('cat <<EOF\nfoo\nEOF');
			expect(result.segments).toHaveLength(1);
			expect(result.segments[0].tokens).toEqual(['cat']);
		});

		test('cat <<EOF\\n$(date)\\nEOF → outer [cat], inner [date]', () => {
			const result = parseCommand('cat <<EOF\n$(date)\nEOF');
			expect(result.segments).toHaveLength(2);
			expect(result.segments[0].tokens).toEqual(['cat']);
			expect(result.segments[1]).toEqual({ tokens: ['date'], originalText: 'date' });
		});

		test('cat <<EOF\\n$(rm -rf /tmp)\\nEOF → outer [cat], inner [rm, -rf, /tmp]', () => {
			const result = parseCommand('cat <<EOF\n$(rm -rf /tmp)\nEOF');
			expect(result.segments).toHaveLength(2);
			expect(result.segments[0].tokens).toEqual(['cat']);
			expect(result.segments[1].tokens).toEqual(['rm', '-rf', '/tmp']);
		});

		test('cat <<EOF\\n`date`\\nEOF (backtick) → outer [cat], inner [date]', () => {
			const result = parseCommand('cat <<EOF\n`date`\nEOF');
			expect(result.segments).toHaveLength(2);
			expect(result.segments[0].tokens).toEqual(['cat']);
			expect(result.segments[1].tokens).toEqual(['date']);
		});

		test('cat <<EOF\\n$(nested $(date))\\nEOF recurses through both levels', () => {
			const result = parseCommand('cat <<EOF\n$(nested $(date))\nEOF');
			const innerCmd = result.segments.find((s) => s.tokens[0] === 'nested'),
				innerDate = result.segments.find((s) => s.tokens[0] === 'date');
			expect(result.segments[0].tokens).toEqual(['cat']);
			expect(innerCmd).toBeDefined();
			expect(innerDate).toBeDefined();
		});

		test('echo before && cat <<EOF\\nbody\\nEOF → two outer segments', () => {
			const result = parseCommand('echo before && cat <<EOF\nbody\nEOF');
			expect(result.segments).toHaveLength(2);
			expect(result.segments[0].tokens).toEqual(['echo', 'before']);
			expect(result.segments[1].tokens).toEqual(['cat']);
		});

		test(`cat <<'EOF'\\nfoo\\nEOF (single-quoted) → one segment [cat], body opaque`, () => {
			const result = parseCommand(`cat <<'EOF'\nfoo\nEOF`);
			expect(result.segments).toHaveLength(1);
			expect(result.segments[0].tokens).toEqual(['cat']);
		});

		test(`cat <<'EOF'\\n$(rm -rf /)\\nEOF (single-quoted) → one segment, $() NOT recursed`, () => {
			const result = parseCommand(`cat <<'EOF'\n$(rm -rf /)\nEOF`);
			expect(result.segments).toHaveLength(1);
			expect(result.segments[0].tokens).toEqual(['cat']);
		});

		test('cat <<"EOF"\\nfoo\\nEOF (double-quoted) → one segment [cat]', () => {
			const result = parseCommand('cat <<"EOF"\nfoo\nEOF');
			expect(result.segments).toHaveLength(1);
			expect(result.segments[0].tokens).toEqual(['cat']);
		});

		test('cat <<\\\\EOF\\nfoo\\nEOF (backslash-quoted) → one segment [cat]', () => {
			const result = parseCommand('cat <<\\EOF\nfoo\nEOF');
			expect(result.segments).toHaveLength(1);
			expect(result.segments[0].tokens).toEqual(['cat']);
		});
	});
});

describe('the refusal of a process substitution', () => {
	let savedTransientDir;

	beforeEach(() => {
		savedTransientDir = process.env.CLAUDE_TRANSIENT_DIR;
		delete process.env.CLAUDE_TRANSIENT_DIR;
	});

	afterEach(() => {
		if (savedTransientDir === undefined) {
			delete process.env.CLAUDE_TRANSIENT_DIR;
		} else {
			process.env.CLAUDE_TRANSIENT_DIR = savedTransientDir;
		}
	});

	test('names the default transient directory when the variable is absent', () => {
		expect(parseCommand('diff <(ls) <(ls)').reason).toMatch(/a file under \/tmp\/claude-transient /);
	});

	test('names the configured transient directory when the variable is set', () => {
		process.env.CLAUDE_TRANSIENT_DIR = '/var/tmp/ct';
		const { reason } = parseCommand('diff <(ls) <(ls)');
		expect(reason).toMatch(/a file under \/var\/tmp\/ct /);
		expect(reason).not.toMatch(/claude-transient/);
	});
});
