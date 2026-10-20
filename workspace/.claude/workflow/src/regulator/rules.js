import { transientDir } from '../transient-dir.js';
import { nodeAbsolutePathRule } from './rules/node-absolute-path.js';
import { requireFromPath } from './rules/require-from-path.js';
import { testPathPatternRule } from './rules/test-path-pattern.js';
import { npmInstallRule } from './rules/npm-install.js';
import { npxRule } from './rules/npx.js';
import { makeNpxDirectBinaryRule } from './rules/make-npx-direct-binary-rule.js';
import { gitRemoteRule } from './rules/git-remote.js';
import { sudoRule } from './rules/sudo.js';
import { backgroundOperatorRule } from './rules/background-operator.js';
import { bareWaitLoopRule } from './rules/bare-wait-loop.js';
import { workerMakeVerificationRule } from './rules/worker-make-verification.js';
import { workerMakeGateRule } from './rules/worker-make-gate.js';
import { workerMakeAnyGoalRule } from './rules/worker-make-any-goal.js';
import { workerGitFileMoveRule } from './rules/worker-git-file-move.js';
import { workerMutatingGitRule } from './rules/worker-mutating-git.js';
import { workerFileScopedVerificationRule } from './rules/worker-file-scoped-verification.js';
import { workerTypecheckRule } from './rules/worker-typecheck.js';
import { gateMutatingGitRule } from './rules/gate-mutating-git.js';
import { gateGoalBoundaryRule } from './rules/gate-goal-boundary.js';
import { checkGoalBoundaryRule } from './rules/check-goal-boundary.js';
import { workflowAgentCatchAllRule } from './rules/workflow-agent-catch-all.js';
import { allowCommands } from './allow-commands.js';
import { regexAllowRule } from './regex-allow-rule.js';
import { regexAskRule } from './regex-ask-rule.js';
import { regexDenyRule } from './regex-deny-rule.js';

const longSleepReason = () => {
	const dir = transientDir(process.env);
	return `A sleep above 30 seconds costs a turn and waits longer than the thing it waits on. DOES THIS CALL START WHAT YOU WAIT FOR? IT DOES — run it in the FOREGROUND with an explicit \`timeout\`, or start it here and break on its sentinel inside the one call: \`( <cmd> > ${dir}/x.log 2>&1; echo $? > ${dir}/x.rc ) & for i in $(seq 1 570); do [[ -f ${dir}/x.rc ]] && break; sleep 1; done\`. IT DOES NOT — an earlier turn or another process started it, so a wait loop here counts out a sentinel nothing in this call writes, and every wait costs a turn. Schedule the check instead: \`/loop 10m <what to check>\`, which runs the prompt again on its own and holds no turn between the runs.`;
};

const rules = [
	workerMakeVerificationRule,
	workerMakeGateRule,
	workerMakeAnyGoalRule,
	workerGitFileMoveRule,
	workerMutatingGitRule,
	workerFileScopedVerificationRule,
	workerTypecheckRule,

	gateMutatingGitRule,
	gateGoalBoundaryRule,

	checkGoalBoundaryRule,

	requireFromPath({
		id: 'require-from-path',
		commands: ['jest', 'eslint', 'prettier', 'sass', 'cfn-lint']
	}),

	nodeAbsolutePathRule,
	testPathPatternRule,

	regexDenyRule({
		id: 'shell-comment',
		regex: /^#/,
		reason: 'Commands must not contain `#` comment lines. Resend the command without comments.'
	}),
	regexDenyRule({
		id: 'export-env-var',
		regex: /^export\s+\w+=/,
		reason: 'Do not use `export` to set environment variables. Prefix the command with NAME=VALUE pairs instead (e.g. `FOO=bar some-command`).'
	}),
	regexDenyRule({
		id: 'long-sleep',
		regex: /^sleep\s+(\d+(?:\.\d+)?[mhd]\b|(?:3[1-9]|[4-9]\d|\d{3,})s?\b)/,
		reason: longSleepReason
	}),
	bareWaitLoopRule,

	makeNpxDirectBinaryRule('jest'),
	makeNpxDirectBinaryRule('eslint'),
	regexDenyRule({
		id: 'npm-run-lint',
		regex: /^npm\s+run\s+lint(\s|$)/,
		reason: "Do not use `npm run lint`. Run `eslint` directly from $PATH. If it is not on $PATH, add the project's `node_modules/.bin` to $PATH before you start Claude Code."
	}),
	npxRule,
	gitRemoteRule,
	sudoRule,

	backgroundOperatorRule,

	allowCommands({
		id: 'common-allowed-commands',
		commands: [
			'awk',
			'basename',
			'cat',
			'cmp',
			'comm',
			'break',
			'cd',
			'env',
			'chmod',
			'command -v',
			'cksum',
			'cp',
			'od',
			'cut',
			'date',
			'diff',
			'dirname',
			'echo',
			'eslint',
			'file',
			'free',
			'uptime',
			'find',
			'grep',
			'du',
			'df',
			'strings',
			'head',
			'jest',
			'jq',
			'kill',
			'ls',
			'lsof',
			'make',
			'md5sum',
			'shasum',
			'sha256sum',
			'mkdir',
			'mv',
			'node',
			'nproc',
			'pgrep',
			'pkill',
			'printf',
			'paste',
			'fold',
			'ps',
			'pwd',
			'rg',
			'rm',
			'rmdir',
			'sed',
			'set',
			'sleep',
			'sort',
			'split',
			'stat',
			'tail',
			'tee',
			'test',
			'[',
			'[[',
			'touch',
			'tr',
			'true',
			'uniq',
			'wc',
			'which',
			'zcat',
			'xxd'
		]
	}),

	regexAllowRule({
		id: 'git-stash-readonly',
		regex: /^git(\s+(-[Cc]\s+\S+|--no-pager))*\s+stash\s+(list|show)(\s|$)/
	}),

	regexAskRule({
		id: 'git-mutating-local',
		regex: /^git(\s+(-[Cc]\s+\S+|--no-pager))*\s+(add|checkout|commit|stash|revert)(\s|$)/,
		reason:
			'This git operation changes local repository or working-tree state (add/commit/stash/revert/checkout). Confirm before running, or ask the user to run it directly.'
	}),

	regexAllowRule({
		id: 'git-readonly-subcommands',
		regex: /^git(\s+(-[Cc]\s+\S+|--no-pager))*\s+(blame|diff|grep|log|mv|rm|status|show|archive|ls-files|check-ignore)(\s|$)/
	}),

	allowCommands({
		id: 'npm-test',
		commands: ['npm t', 'npm test']
	}),

	npmInstallRule,

	workflowAgentCatchAllRule
];

export { rules };
