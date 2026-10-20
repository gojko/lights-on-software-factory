import { describe, test, expect } from '@jest/globals';
import { unwrapWrappers } from '../../src/regulator/unwrap-wrappers.js';
import { wrappers } from '../../src/regulator/wrappers.js';

const unwrap = (commandString) => unwrapWrappers(commandString.split(' ').filter((t) => t.length > 0), wrappers);

describe('unwrapWrappers', () => {
	describe('single wrapper, no flags', () => {
		test('time make test → make test', () => {
			expect(unwrap('time make test')).toEqual(['make', 'test']);
		});

		test('nohup make deploy → make deploy', () => {
			expect(unwrap('nohup make deploy')).toEqual(['make', 'deploy']);
		});

		test('xargs ls → ls', () => {
			expect(unwrap('xargs ls')).toEqual(['ls']);
		});
	});

	describe('wrapper with flags (glued / double-dash / equals)', () => {
		test('time -p make test → make test', () => {
			expect(unwrap('time -p make test')).toEqual(['make', 'test']);
		});

		test('time --verbose make test → make test', () => {
			expect(unwrap('time --verbose make test')).toEqual(['make', 'test']);
		});

		test('time -o/tmp/x.log make test → make test (glued)', () => {
			expect(unwrap('time -o/tmp/x.log make test')).toEqual(['make', 'test']);
		});

		test('time -o /tmp/x.log make test → make test (space-form output file consumed)', () => {
			expect(unwrap('time -o /tmp/x.log make test')).toEqual(['make', 'test']);
		});

		test('time -v -o /tmp/x.time make build → make build (verbose flag then output file)', () => {
			expect(unwrap('time -v -o /tmp/x.time make build')).toEqual(['make', 'build']);
		});

		test('nohup -- make deploy → make deploy (bare double-dash consumed)', () => {
			expect(unwrap('nohup -- make deploy')).toEqual(['make', 'deploy']);
		});

		test('nice -n10 make build → make build (glued)', () => {
			expect(unwrap('nice -n10 make build')).toEqual(['make', 'build']);
		});

		test('xargs -n1 -P4 ls → ls', () => {
			expect(unwrap('xargs -n1 -P4 ls')).toEqual(['ls']);
		});

		test('xargs -I{} basename → basename (glued curly)', () => {
			expect(unwrap('xargs -I{} basename')).toEqual(['basename']);
		});

		test('xargs -I {} basename → basename (space-form replstr consumed)', () => {
			expect(unwrap('xargs -I {} basename')).toEqual(['basename']);
		});

		test('xargs -I {} basename {} → basename {} (replstr consumed, command and placeholder kept)', () => {
			expect(unwrap('xargs -I {} basename {}')).toEqual(['basename', '{}']);
		});

		test('xargs --max-args=1 ls → ls (equals form)', () => {
			expect(unwrap('xargs --max-args=1 ls')).toEqual(['ls']);
		});

		test('env --unset=TEST make → make (equals form)', () => {
			expect(unwrap('env --unset=TEST make')).toEqual(['make']);
		});
	});

	describe('space-form flag arguments (documented limitations)', () => {
		test('nice -n 10 make build → 10 make build', () => {
			expect(unwrap('nice -n 10 make build')).toEqual(['10', 'make', 'build']);
		});

		test('env -u TEST make → TEST make', () => {
			expect(unwrap('env -u TEST make')).toEqual(['TEST', 'make']);
		});
	});

	describe('env-style assignment consumption', () => {
		test('env TARGET=myenv REGION=region-a make deploy → make deploy', () => {
			expect(unwrap('env TARGET=myenv REGION=region-a make deploy')).toEqual(['make', 'deploy']);
		});

		test('time TARGET=myenv make test → make test', () => {
			expect(unwrap('time TARGET=myenv make test')).toEqual(['make', 'test']);
		});

		test('leading assignments without a wrapper are stripped: TARGET=myenv make deploy → make deploy', () => {
			expect(unwrap('TARGET=myenv make deploy')).toEqual(['make', 'deploy']);
		});

		test('multiple leading assignments are all stripped', () => {
			expect(unwrap('TARGET=myenv REGION=region-a make deploy')).toEqual(['make', 'deploy']);
		});
	});

	describe('timeout wrapper (strips the duration positional)', () => {
		test('timeout 400 make test → make test', () => {
			expect(unwrap('timeout 400 make test')).toEqual(['make', 'test']);
		});

		test('timeout 30s jest foo → jest foo (seconds suffix)', () => {
			expect(unwrap('timeout 30s jest foo')).toEqual(['jest', 'foo']);
		});

		test('timeout 5m make build → make build (minutes suffix)', () => {
			expect(unwrap('timeout 5m make build')).toEqual(['make', 'build']);
		});

		test('time timeout 400 make test → make test (chained with another wrapper)', () => {
			expect(unwrap('time timeout 400 make test')).toEqual(['make', 'test']);
		});

		test('timeout make test → make test (no duration, only the keyword is stripped)', () => {
			expect(unwrap('timeout make test')).toEqual(['make', 'test']);
		});

		test('timeout foo make → foo make (non-duration positional is NOT stripped, fails safe)', () => {
			expect(unwrap('timeout foo make')).toEqual(['foo', 'make']);
		});
	});

	describe('command builtin (peel the prefix, but keep the -v/-V lookup form)', () => {
		test('command rm -rf x → rm -rf x', () => {
			expect(unwrap('command rm -rf x')).toEqual(['rm', '-rf', 'x']);
		});

		test('command make deploy → make deploy', () => {
			expect(unwrap('command make deploy')).toEqual(['make', 'deploy']);
		});

		test('command -p rm x → rm x (default-path flag skipped)', () => {
			expect(unwrap('command -p rm x')).toEqual(['rm', 'x']);
		});

		test('command git push → git push (peeled for downstream rule evaluation)', () => {
			expect(unwrap('command git push')).toEqual(['git', 'push']);
		});

		test('command -v chromium → unchanged (lookup form left for the allow rule)', () => {
			expect(unwrap('command -v chromium')).toEqual(['command', '-v', 'chromium']);
		});

		test('command -V foo → unchanged (verbose lookup form left intact)', () => {
			expect(unwrap('command -V foo')).toEqual(['command', '-V', 'foo']);
		});

		test('command -p -v foo → unchanged (lookup even when preceded by -p)', () => {
			expect(unwrap('command -p -v foo')).toEqual(['command', '-p', '-v', 'foo']);
		});

		test('bare command → unchanged (so common-allowed-commands can fire)', () => {
			expect(unwrap('command')).toEqual(['command']);
		});

		test('time command rm x → rm x (chained after another wrapper)', () => {
			expect(unwrap('time command rm x')).toEqual(['rm', 'x']);
		});
	});

	describe('chained wrappers', () => {
		test('time nohup nice make build → make build', () => {
			expect(unwrap('time nohup nice make build')).toEqual(['make', 'build']);
		});

		test('time nohup nice -X make build → make build (flag between wrappers consumed)', () => {
			expect(unwrap('time nohup nice -X make build')).toEqual(['make', 'build']);
		});
	});

	describe('edge cases', () => {
		test('bare wrapper (no further tokens) → unchanged', () => {
			expect(unwrap('nohup')).toEqual(['nohup']);
		});

		test('bare env → unchanged (so common-allowed-commands can fire)', () => {
			expect(unwrap('env')).toEqual(['env']);
		});

		test('wrapper with only flags → unchanged', () => {
			expect(unwrap('xargs -n1 -P4')).toEqual(['xargs', '-n1', '-P4']);
		});

		test('env with only flags → unchanged', () => {
			expect(unwrap('env -i')).toEqual(['env', '-i']);
		});

		test('sudo is NOT a wrapper — segment unchanged', () => {
			expect(unwrap('sudo make deploy')).toEqual(['sudo', 'make', 'deploy']);
		});

		test('non-wrapper first token is returned unchanged', () => {
			expect(unwrap('make -j8 deploy')).toEqual(['make', '-j8', 'deploy']);
		});

		test('flag-leading segment without a wrapper is returned unchanged', () => {
			expect(unwrap('-X make')).toEqual(['-X', 'make']);
		});

		test('empty token list is returned unchanged', () => {
			expect(unwrapWrappers([], wrappers)).toEqual([]);
		});

		test('bare hyphen (stdin marker) is NOT consumed as a flag', () => {
			expect(unwrap('xargs - cat')).toEqual(['-', 'cat']);
		});
	});

	describe('purity and bounds', () => {
		test('identical input produces identical output (pure)', () => {
			const input = ['time', 'nohup', 'make', 'test'];
			const first = unwrapWrappers(input, wrappers);
			const second = unwrapWrappers(input, wrappers);
			expect(first).toEqual(second);
		});

		test('does not mutate the input array', () => {
			const input = ['time', 'make', 'test'];
			unwrapWrappers(input, wrappers);
			expect(input).toEqual(['time', 'make', 'test']);
		});

		test('eight-deep chained wrappers fully unwrap (bound not exceeded)', () => {
			const input = ['time', 'nohup', 'nice', 'stdbuf', 'xargs', 'env', 'time', 'nohup', 'make'];
			expect(unwrapWrappers(input, wrappers)).toEqual(['make']);
		});

		test('beyond the bound the loop stops gracefully (no infinite loop)', () => {
			const input = Array(20).fill('time').concat(['make']);
			const result = unwrapWrappers(input, wrappers);
			expect(Array.isArray(result)).toBe(true);
		});
	});
});
