import { afterEach, beforeEach, describe, test, expect } from '@jest/globals';
import { rules } from '../../src/regulator/rules.js';
import { evaluateCommand } from '../../src/regulator/evaluate-command.js';
import { parseCommand } from '../../src/regulator/parse-command.js';
import { segmentAttempts } from '../../src/regulator/segment-attempts.js';
import { resolveAttempts } from '../../src/regulator/resolve-attempts.js';

const idOf = (rule) => rule.id;
const indexOf = (id) => rules.findIndex((r) => r.id === id);
const decide = (command) => evaluateCommand({ command, rules });
const asAgent = (command, agentType) => evaluateCommand({ command, rules, context: { agentType } });
const ruleThatAnswers = (command, agentType) =>
	resolveAttempts({
		attempts: segmentAttempts({ tokens: parseCommand(command).segments[0].tokens, originalCommandString: command }),
		rules,
		context: { agentType }
	}).id;
const allowListed = rules.find((r) => r.id === 'common-allowed-commands');

describe('assembled rules array', () => {
	test('no duplicate ids', () => {
		const ids = rules.map(idOf);
		const seen = new Set();
		for (const id of ids) {
			expect(seen.has(id)).toBe(false);
			seen.add(id);
		}
	});

	test('every rule has a non-empty id', () => {
		for (const rule of rules) {
			expect(typeof rule.id).toBe('string');
			expect(rule.id.length).toBeGreaterThan(0);
		}
	});

	test('every rule has decision allow, ask, or deny', () => {
		for (const rule of rules) {
			expect(['allow', 'ask', 'deny']).toContain(rule.decision);
		}
	});

	test('every deny rule has a non-empty reason', () => {
		for (const rule of rules) {
			if (rule.decision === 'deny') {
				expect(typeof rule.reason === 'string' || typeof rule.reason === 'function').toBe(true);
				if (typeof rule.reason === 'string') {
					expect(rule.reason.length).toBeGreaterThan(0);
				}
			}
		}
	});

	test('every allow rule has NO reason (allow decisions need no explanation)', () => {
		for (const rule of rules) {
			if (rule.decision === 'allow') {
				expect(rule.reason).toBeUndefined();
			}
		}
	});

	test('no rule declares BOTH matchSegment and matchRaw', () => {
		for (const rule of rules) {
			const both = typeof rule.matchSegment === 'function' && typeof rule.matchRaw === 'function';
			expect(both).toBe(false);
		}
	});

	test('every rule declares at least one of matchSegment or matchRaw', () => {
		for (const rule of rules) {
			const some = typeof rule.matchSegment === 'function' || typeof rule.matchRaw === 'function';
			expect(some).toBe(true);
		}
	});
});

describe('expected rule ids', () => {
	const expectedIds = [
		'require-from-path',
		'node-absolute-path',
		'test-path-pattern',
		'shell-comment',
		'export-env-var',
		'long-sleep',
		'bare-wait-loop',
		'worker-make-verification',
		'worker-make-gate',
		'worker-make-any-goal',
		'worker-git-file-move',
		'worker-mutating-git',
		'worker-file-scoped-verification',
		'worker-typecheck',
		'gate-mutating-git',
		'gate-goal-boundary',
		'check-goal-boundary',
		'workflow-agent-catch-all',
		'npx',
		'npx-jest',
		'npx-eslint',
		'npm-run-lint',
		'git-remote',
		'git-stash-readonly',
		'git-mutating-local',
		'sudo',
		'background-operator',
		'common-allowed-commands',
		'git-readonly-subcommands',
		'npm-test',
		'npm-install'
	];

	test.each(expectedIds)('rule %s is present in the assembled array', (id) => {
		expect(indexOf(id)).toBeGreaterThanOrEqual(0);
	});

	test('the assembled array holds the expected rules and no other', () => {
		expect(rules.map(idOf).toSorted()).toEqual(expectedIds.toSorted());
	});
});

describe('rules that are not part of a generic rule set', () => {
	test.each([
		'aws-describe',
		'aws-get',
		'aws-head',
		'aws-list',
		'worker-aws-write',
		'worker-make-deployment',
		'jest-rootdir',
		'unpaywall',
		'semantic-scholar-api',
		'openalex-api',
		'aws-lambda-update',
		'aws-readonly-subcommands',
		'bash-pdf-script',
		'node-fuzzy-e2e-scripts',
		'perl',
		'npm-with-prefix',
		'npm-install-version-pin'
	])('rule %s is absent', (id) => {
		expect(indexOf(id)).toBe(-1);
	});
});

describe('the global allow-list', () => {
	test.each([
		'ls',
		'cat package.json',
		'grep -rn foo src',
		'find . -name x',
		'head -5 a.txt',
		'tail -5 a.txt',
		'wc -l a.txt',
		'node scripts/a.js',
		'jest tests/a.test.js',
		'eslint src/a.js',
		'make test',
		'jq . a.json',
		'npm test'
	])('allows %s', (command) => {
		expect(decide(command).decision).toEqual('allow');
	});

	test.each([
		'npm run lint',
		'npm run lint -- --fix',
		'npx jest tests/a.test.js',
		'npx eslint src',
		'./node_modules/.bin/jest tests/a.test.js',
		'node_modules/.bin/eslint src'
	])('denies %s, so that jest and eslint run from $PATH', (command) => {
		expect(decide(command).decision).toEqual('deny');
	});

	test.each(['npx-jest', 'npx-eslint', 'require-from-path', 'npm-run-lint'])(
		'the %s reason tells how to put the project tools on $PATH',
		(id) => {
			const rule = rules.find((one) => idOf(one) === id),
				reason = typeof rule.reason === 'function' ? rule.reason('npx jest') : rule.reason;
			expect(reason).toContain('node_modules/.bin');
			expect(reason).toContain('$PATH');
		}
	);

	test.each([
		'ffmpeg -i a.mp4 b.gif',
		'convert a.png b.jpg',
		'pdftotext a.pdf',
		'tesseract a.png out',
		'aws s3 ls',
		'curl https://example.com',
		'python3 a.py',
		'esbuild src/a.js',
		'tsc --noEmit',
		'sass a.scss a.css',
		'prettier --write .',
		'cfn-lint a.yml',
		'yq . a.yml'
	])('gives no decision to %s, which falls through to the permission prompt', (command) => {
		expect(decide(command).decision).toEqual('no-match');
	});

	test('names no media, PDF, cloud or build tool', () => {
		expect(allowListed.matchSegment(['ffmpeg'])).toBe(false);
		expect(allowListed.matchSegment(['pdftoppm'])).toBe(false);
		expect(allowListed.matchSegment(['aws'])).toBe(false);
		expect(allowListed.matchSegment(['esbuild'])).toBe(false);
	});
});

describe('ordering invariants', () => {
	test('absolute-path denies precede the common-allowed-commands group', () => {
		expect(indexOf('require-from-path')).toBeLessThan(indexOf('common-allowed-commands'));
		expect(indexOf('node-absolute-path')).toBeLessThan(indexOf('common-allowed-commands'));
	});

	test('require-from-path precedes the common-allowed-commands group (which contains the bare tool names)', () => {
		expect(indexOf('require-from-path')).toBeLessThan(indexOf('common-allowed-commands'));
	});

	test('test-path-pattern precedes the common-allowed-commands group (which contains jest)', () => {
		expect(indexOf('test-path-pattern')).toBeLessThan(indexOf('common-allowed-commands'));
	});

	test('npm-run-lint precedes the common-allowed-commands group and the npm-test allow', () => {
		expect(indexOf('npm-run-lint')).toBeLessThan(indexOf('common-allowed-commands'));
		expect(indexOf('npm-run-lint')).toBeLessThan(indexOf('npm-test'));
	});

	test('git-remote deny precedes any git-* allows', () => {
		expect(indexOf('git-remote')).toBeLessThan(indexOf('git-readonly-subcommands'));
	});

	test('git-mutating-local ask precedes the git-readonly-subcommands allow (so commit/checkout/stash ask first)', () => {
		expect(indexOf('git-mutating-local')).toBeLessThan(indexOf('git-readonly-subcommands'));
	});

	test('git-stash-readonly allow precedes git-mutating-local (so stash list/show allow before the stash ask)', () => {
		expect(indexOf('git-stash-readonly')).toBeLessThan(indexOf('git-mutating-local'));
	});

	test('npx-jest precedes npx (so the jest-redirect message wins)', () => {
		expect(indexOf('npx-jest')).toBeLessThan(indexOf('npx'));
	});

	test('npx-eslint precedes npx (so the eslint-redirect message wins)', () => {
		expect(indexOf('npx-eslint')).toBeLessThan(indexOf('npx'));
	});

	test('long-sleep precedes the common-allowed-commands group, which allows sleep with no bound', () => {
		expect(indexOf('long-sleep')).toBeLessThan(indexOf('common-allowed-commands'));
	});

	test('bare-wait-loop precedes the common-allowed-commands group, which allows the one-second sleep of its body', () => {
		expect(indexOf('bare-wait-loop')).toBeLessThan(indexOf('common-allowed-commands'));
	});

	test.each(['worker-make-verification', 'worker-make-gate', 'worker-make-any-goal'])(
		'%s precedes common-allowed-commands, which allows every make goal',
		(id) => {
			expect(indexOf(id)).toBeLessThan(indexOf('common-allowed-commands'));
		}
	);

	test.each(['worker-make-verification', 'worker-make-gate'])(
		'%s precedes worker-make-any-goal, so the goal family answers before the blanket refusal',
		(id) => {
			expect(indexOf(id)).toBeLessThan(indexOf('worker-make-any-goal'));
		}
	);

	test('worker-git-file-move precedes worker-mutating-git, so a worker reads the allow and not the refusal', () => {
		expect(indexOf('worker-git-file-move')).toBeLessThan(indexOf('worker-mutating-git'));
	});

	test('worker-mutating-git precedes both git-mutating-local and git-stash-readonly', () => {
		expect(indexOf('worker-mutating-git')).toBeLessThan(indexOf('git-mutating-local'));
		expect(indexOf('worker-mutating-git')).toBeLessThan(indexOf('git-stash-readonly'));
	});

	test('worker-typecheck precedes common-allowed-commands, so a bare type check gets the type reason', () => {
		expect(indexOf('worker-typecheck')).toBeLessThan(indexOf('common-allowed-commands'));
	});

	test('worker-typecheck precedes require-from-path, so a path form gets the type reason and not the $PATH one', () => {
		expect(indexOf('worker-typecheck')).toBeLessThan(indexOf('require-from-path'));
	});

	test('worker-file-scoped-verification precedes common-allowed-commands, which allows bare jest and bare eslint', () => {
		expect(indexOf('worker-file-scoped-verification')).toBeLessThan(indexOf('common-allowed-commands'));
	});

	test('gate-mutating-git precedes every git allow, so a gate reads the gate reason', () => {
		expect(indexOf('gate-mutating-git')).toBeGreaterThanOrEqual(0);
		expect(indexOf('gate-mutating-git')).toBeLessThan(indexOf('git-remote'));
		expect(indexOf('gate-mutating-git')).toBeLessThan(indexOf('git-stash-readonly'));
		expect(indexOf('gate-mutating-git')).toBeLessThan(indexOf('git-mutating-local'));
		expect(indexOf('gate-mutating-git')).toBeLessThan(indexOf('common-allowed-commands'));
	});

	test('gate-goal-boundary precedes common-allowed-commands, which allows every make goal', () => {
		expect(indexOf('gate-goal-boundary')).toBeGreaterThanOrEqual(0);
		expect(indexOf('gate-goal-boundary')).toBeLessThan(indexOf('common-allowed-commands'));
	});

	test('check-goal-boundary precedes common-allowed-commands, which allows every make goal', () => {
		expect(indexOf('check-goal-boundary')).toBeLessThan(indexOf('common-allowed-commands'));
	});

	test.each(['gate-mutating-git', 'gate-goal-boundary'])('%s precedes the catch-all, so the generic refusal does not answer first', (id) => {
		expect(indexOf(id)).toBeLessThan(indexOf('workflow-agent-catch-all'));
	});

	test('the catch-all is the LAST rule, because it is the final answer a workflow agent can get', () => {
		expect(indexOf('workflow-agent-catch-all')).toBe(rules.length - 1);
	});

	test('no rule sits after the catch-all, because such a rule never answers a workflow agent', () => {
		expect(rules.slice(indexOf('workflow-agent-catch-all') + 1).map(idOf)).toEqual([]);
	});
});

const agentScopedRules = rules.filter((rule) => typeof rule.appliesTo === 'function' && rule.decision === 'deny'),
	humanScopedRules = rules.filter((rule) => typeof rule.appliesTo === 'function' && rule.decision === 'ask');

describe('a rule states who it applies to', () => {
	test('the assembled array holds a rule that refuses one agent role', () => {
		expect(agentScopedRules).not.toHaveLength(0);
	});

	test.each(agentScopedRules.map((rule) => [rule.id, rule]))('%s applies to no caller that states no agent type', (id, rule) => {
		expect(rule.appliesTo({})).toBe(false);
	});

	test('the assembled array holds a rule that asks the caller outside every agent role', () => {
		expect(humanScopedRules).not.toHaveLength(0);
	});

	test.each(humanScopedRules.map((rule) => [rule.id, rule]))('%s applies to a caller that states no agent type', (id, rule) => {
		expect(rule.appliesTo({})).toBe(true);
	});
});

describe('an agent message is a direction and not an explanation', () => {
	const statedReasons = agentScopedRules.filter((rule) => typeof rule.reason === 'string');

	test('the assembled array holds an agent rule with a stated reason', () => {
		expect(statedReasons).not.toHaveLength(0);
	});

	test.each(statedReasons.map((rule) => [rule.id, rule.reason]))('%s says what to run in 300 characters or fewer', (id, reason) => {
		expect(reason.length).toBeLessThanOrEqual(300);
	});

	test.each(statedReasons.map((rule) => [rule.id, rule.reason]))('%s opens with an imperative verb', (id, reason) => {
		expect(reason).toMatch(/^(Run|Read|Only|Do not) /);
	});

	test.each(statedReasons.map((rule) => [rule.id, rule.reason]))('%s names no make goal', (id, reason) => {
		expect(reason).not.toMatch(/make\s+[a-z]/);
	});
});

describe('long-sleep rule', () => {
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

	test.each(['sleep 31', 'sleep 45', 'sleep 60', 'sleep 90', 'sleep 120', 'sleep 300', 'sleep 600', 'sleep 31s', 'sleep 10m', 'sleep 2h', 'sleep 1d'])(
		'denies %s',
		(command) => {
			expect(decide(command).decision).toEqual('deny');
		}
	);

	test('names the wait-loop pattern in the reason, so the reader knows what to write instead', () => {
		expect(decide('sleep 120').reason).toMatch(/foreground|sentinel/i);
	});

	test('names the loop skill in the reason, so a recurring check is scheduled and not slept through', () => {
		expect(decide('sleep 600').reason).toMatch(/\/loop/);
	});

	test('asks first whether the call starts what it waits for, which is what tells the two answers apart', () => {
		expect(decide('sleep 600').reason).toMatch(/does THIS call start what you wait for/i);
	});

	test('the sentinel example starts the command it waits on, so no reader takes it for a bare timer', () => {
		expect(decide('sleep 600').reason).toMatch(/echo \$\? > \S+\.rc/);
		expect(decide('sleep 600').reason).toMatch(/\) &/);
	});

	test('says a wait loop that this call starts nothing for polls a sentinel nothing writes', () => {
		expect(decide('sleep 600').reason).toMatch(/nothing in this call writes/i);
	});

	test('names the default transient directory in the sentinel example', () => {
		expect(decide('sleep 600').reason).toMatch(/> \/tmp\/claude-transient\/x\.rc/);
	});

	test('names the configured transient directory in the sentinel example when the variable is set', () => {
		process.env.CLAUDE_TRANSIENT_DIR = '/var/tmp/ct';
		const { reason } = decide('sleep 600');
		expect(reason).toMatch(/> \/var\/tmp\/ct\/x\.rc/);
		expect(reason).not.toMatch(/claude-transient/);
	});

	test.each(['sleep 1', 'sleep 5', 'sleep 10', 'sleep 30', 'sleep 30s'])('allows %s, which a wait loop uses', (command) => {
		expect(decide(command).decision).not.toEqual('deny');
	});

	test('allows a fractional sleep', () => {
		expect(decide('sleep 0.5').decision).not.toEqual('deny');
	});

	test('denies a long sleep that hides in a compound command', () => {
		expect(decide('sleep 240; tail -5 /tmp/claude-transient/build.log').decision).toEqual('deny');
	});

	test('denies a long sleep for a workflow agent too, because a turn costs the same whoever holds it', () => {
		expect(asAgent('sleep 600', 'workflow-worker').decision).toEqual('deny');
		expect(asAgent('sleep 600', 'workflow-gate').decision).toEqual('deny');
	});
});

describe('bare-wait-loop rule, over the assembled array', () => {
	test.each(['for i in $(seq 1 600); do sleep 1; done', 'for i in $(seq 1 60); do sleep 30; done', 'while true; do sleep 5; done'])(
		'denies %s',
		(command) => {
			expect(decide(command).decision).toEqual('deny');
		}
	);

	test('allows the wait loop that breaks on a sentinel', () => {
		expect(decide('for i in $(seq 1 570); do [[ -f /tmp/claude-transient/build.rc ]] && break; sleep 1; done').decision).toEqual('allow');
	});

	test('allows a counted loop whose whole wait stays under the ceiling', () => {
		expect(decide('for i in $(seq 1 10); do sleep 1; done').decision).toEqual('allow');
	});
});

describe('background-operator rule, over the assembled array', () => {
	test('allows the orphan ampersand a backgrounded subshell leaves behind', () => {
		expect(decide('( ls -la ) &').decision).toEqual('allow');
	});

	test('does not allow a denied command that follows the ampersand on the same segment', () => {
		expect(decide('( echo hi ) & npx jest').decision).not.toEqual('allow');
	});
});

describe('what a worker is answered by the assembled array', () => {
	const asWorker = (command) => asAgent(command, 'workflow-worker');

	test.each(['git rm src/widgets/a-widget.js', 'git mv a.js b.js'])(
		'allows %s, so a step deletes a file the index knows about',
		(command) => {
			expect(asWorker(command).decision).toEqual('allow');
		}
	);

	test.each(['git add .', 'git commit -m "a message"', 'git reset --hard', 'git stash'])(
		'denies %s, which changes what the tree RECORDS',
		(command) => {
			expect(asWorker(command).decision).toEqual('deny');
		}
	);

	test('the refusal of the other git commands names the two a worker reads', () => {
		expect(asWorker('git commit -m "a message"').reason).toMatch(/git status/);
	});

	test.each([
		'git status',
		'git diff --stat',
		'git log --oneline',
		'git ls-files docs/styles/a.scss',
		'git check-ignore -v docs/styles/a.css'
	])('allows %s, which reads and writes nothing', (command) => {
		expect(asWorker(command).decision).toEqual('allow');
	});

	test.each([
		['make test', 'worker-make-verification'],
		['make workflow-serial-gate', 'worker-make-gate'],
		['make deploy-myenv', 'worker-make-any-goal'],
		['make', 'worker-make-any-goal'],
		['make clean', 'worker-make-any-goal']
	])('answers %s by rule %s, so the refusal names its own goal family', (command, id) => {
		expect(asWorker(command)).toEqual(expect.objectContaining({ decision: 'deny' }));
		expect(ruleThatAnswers(command, 'workflow-worker')).toEqual(id);
	});

	test.each(['jest', 'eslint', 'tsc --noEmit', 'aws s3 rm s3://a-bucket/a-key', 'htop'])('denies %s', (command) => {
		expect(asWorker(command).decision).toEqual('deny');
	});

	test.each(['jest tests/a-module/thing.test.js', 'eslint src/a-module/thing.js'])(
		'allows %s, which reads its own files alone',
		(command) => {
			expect(asWorker(command).decision).toEqual('allow');
		}
	);

	test('answers a command no rule allows by the catch-all, and never by a prompt', () => {
		expect(asWorker('htop')).toEqual(expect.objectContaining({ decision: 'deny' }));
		expect(ruleThatAnswers('htop', 'workflow-worker')).toEqual('workflow-agent-catch-all');
	});
});

describe('what a gate is answered by the assembled array', () => {
	const asGate = (command) => asAgent(command, 'workflow-gate');

	test.each(['make workflow-serial-gate', 'make workflow-final-gate'])('allows %s, which is the goal a gate exists to run', (command) => {
		expect(asGate(command).decision).toEqual('allow');
	});

	test.each(['make', 'make test', 'make deploy-myenv', 'make clean'])('denies %s, which belongs to another role', (command) => {
		expect(asGate(command).decision).toEqual('deny');
		expect(ruleThatAnswers(command, 'workflow-gate')).toEqual('gate-goal-boundary');
	});

	test.each(['git commit -m "a message"', 'git stash', 'git push', 'git add .'])('denies %s, because a gate never moves a tree', (command) => {
		expect(asGate(command).decision).toEqual('deny');
		expect(ruleThatAnswers(command, 'workflow-gate')).toEqual('gate-mutating-git');
	});

	test.each(['git status', 'git diff --stat', 'git log --oneline'])('allows %s, which is how a gate decides what it proves', (command) => {
		expect(asGate(command).decision).toEqual('allow');
	});

	test.each(['jest', 'eslint', 'tsc --noEmit', 'git rm a.js'])('leaves %s outside the worker rules, which apply to the worker alone', (command) => {
		expect(asGate(command).decision).not.toEqual('ask');
	});
});

describe('what a check agent is answered by the assembled array', () => {
	const asCheck = (command) => asAgent(command, 'workflow-check');

	test.each(['make', 'make test', 'make workflow-serial-gate', 'make clean', 'make deploy-myenv'])(
		'denies %s, because a check agent reads a finished run and every goal writes something shared',
		(command) => {
			expect(asCheck(command).decision).toEqual('deny');
			expect(ruleThatAnswers(command, 'workflow-check')).toEqual('check-goal-boundary');
		}
	);

	test.each(['git commit -m "a message"', 'git stash', 'git add .'])('denies %s, which changes the tree', (command) => {
		expect(asCheck(command).decision).toEqual('deny');
	});

	test.each(['git status', 'git diff --stat', 'git log --oneline', 'cat package.json'])('allows %s, which reads and writes nothing', (command) => {
		expect(asCheck(command).decision).toEqual('allow');
	});
});

describe('no ask reaches a workflow agent', () => {
	test.each(['git add .', 'git checkout master', 'git commit -m "a message"', 'git stash', 'git revert abc1234'])(
		'answers %s with a prompt for a session',
		(command) => {
			expect(decide(command).decision).toEqual('ask');
		}
	);

	test.each([['workflow-worker'], ['workflow-gate'], ['workflow-check'], ['workflow-reviewer']])(
		'answers git stash with a refusal for %s, and never with a prompt',
		(agentType) => {
			expect(asAgent('git stash', agentType).decision).toEqual('deny');
		}
	);

	test('leaves no ask decision reachable by any workflow role', () => {
		const askIds = rules.filter((rule) => rule.decision === 'ask').map(idOf);

		expect(askIds).not.toHaveLength(0);
		for (const id of askIds) {
			expect(rules.find((rule) => rule.id === id).appliesTo({ agentType: 'workflow-worker' })).toBe(false);
		}
	});
});
