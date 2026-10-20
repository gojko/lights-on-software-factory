import { describe, test, expect } from '@jest/globals';
import { evaluateCommand } from '../../src/regulator/evaluate-command.js';

const allowAll = { id: 'allow-all', decision: 'allow', reason: 'allowed', matchSegment: () => true };
const denyAll = { id: 'deny-all', decision: 'deny', reason: 'denied', matchSegment: () => true };
const askAll = { id: 'ask-all', decision: 'ask', reason: 'asks', matchSegment: () => true };

describe('evaluateCommand', () => {
	test('empty rules → no-match', () => {
		expect(evaluateCommand({ command: 'ls', rules: [] })).toEqual({ decision: 'no-match' });
	});

	test('allow-all → allow', () => {
		expect(evaluateCommand({ command: 'ls', rules: [allowAll] })).toEqual({ decision: 'allow', reason: 'allowed' });
	});

	test('deny-all → deny', () => {
		expect(evaluateCommand({ command: 'rm -rf /', rules: [denyAll] })).toEqual({ decision: 'deny', reason: 'denied' });
	});

	test('compound: allow && deny → deny (deny wins)', () => {
		expect(evaluateCommand({ command: 'ls && rm -rf /', rules: [denyAll] })).toEqual({ decision: 'deny', reason: 'denied' });
	});

	test('compound: allow && unmatched → no-match (the downgrade)', () => {
		const allowOnlyLs = { id: 'ls-only', decision: 'allow', reason: 'ls', matchSegment: (tokens) => tokens[0] === 'ls' };
		expect(evaluateCommand({ command: 'ls && pwd', rules: [allowOnlyLs] })).toEqual({ decision: 'no-match' });
	});

	test('env-var prefix is stripped before evaluation', () => {
		const allowMake = { id: 'make', decision: 'allow', reason: 'make', matchSegment: (tokens) => tokens[0] === 'make' };
		expect(evaluateCommand({ command: 'TARGET=myenv make deploy', rules: [allowMake] })).toEqual({ decision: 'allow', reason: 'make' });
	});

	test('wrapper is unwrapped before evaluation', () => {
		const allowMake = { id: 'make', decision: 'allow', reason: 'make', matchSegment: (tokens) => tokens[0] === 'make' };
		expect(evaluateCommand({ command: 'time make test', rules: [allowMake] })).toEqual({ decision: 'allow', reason: 'make' });
	});

	test('tooComplex parse → deny (the regulator blocks commands it cannot understand)', () => {
		const result = evaluateCommand({ command: 'cat <<EOF', rules: [allowAll] });
		expect(result.decision).toBe('deny');
		expect(result.reason).toMatch(/could not be safely parsed/);
		expect(result.reason).toMatch(/debug\.js/);
	});

	test('matchRaw rules see the whole original command', () => {
		const seen = [];
		const rule = { id: 'raw', decision: 'deny', reason: 'r', matchRaw: (cmd) => { seen.push(cmd); return true; } };
		evaluateCommand({ command: 'a && b', rules: [rule] });
		expect(seen).toContain('a && b');
	});

	test('reason as function receives the original command (not the segment)', () => {
		const rule = {
			id: 'r',
			decision: 'deny',
			reason: (cmd) => `blocked: ${cmd}`,
			matchSegment: (tokens) => tokens[0] === 'rm'
		};
		expect(evaluateCommand({ command: 'ls && rm /tmp/x', rules: [rule] })).toEqual({ decision: 'deny', reason: 'blocked: ls && rm /tmp/x' });
	});

	test('ask rule on the only segment → ask', () => {
		expect(evaluateCommand({ command: 'foo', rules: [askAll] })).toEqual({ decision: 'ask', reason: 'asks' });
	});

	test('bare wrapper is preserved (not collapsed) so rules can still evaluate it', () => {
		const allowOnlyMake = { id: 'make', decision: 'allow', reason: 'make', matchSegment: (tokens) => tokens[0] === 'make' };
		expect(evaluateCommand({ command: 'nohup', rules: [allowOnlyMake] })).toEqual({ decision: 'no-match' });
	});

	test('bare wrapper with a matching rule fires (the wrapper is not stripped when there is no inner command)', () => {
		const allowNohup = { id: 'nohup', decision: 'allow', reason: 'nohup', matchSegment: (tokens) => tokens[0] === 'nohup' };
		expect(evaluateCommand({ command: 'nohup', rules: [allowNohup] })).toEqual({ decision: 'allow', reason: 'nohup' });
	});

	describe('system bin prefix fallback', () => {
		const allowMake = { id: 'make', decision: 'allow', reason: 'make', matchSegment: (tokens) => tokens[0] === 'make' };

		test('a no-match segment is retried without the prefix', () => {
			expect(evaluateCommand({ command: '/usr/bin/make test', rules: [allowMake] })).toEqual({ decision: 'allow', reason: 'make' });
		});

		test('the retry peels a wrapper the prefix hid', () => {
			expect(evaluateCommand({ command: '/usr/bin/time make test', rules: [allowMake] })).toEqual({ decision: 'allow', reason: 'make' });
		});

		test('a rule that matched the path form keeps its decision', () => {
			const pathDeny = { id: 'path', decision: 'deny', reason: 'path form', matchSegment: (tokens) => tokens[0].includes('/') };
			expect(evaluateCommand({ command: '/usr/bin/make test', rules: [pathDeny, allowMake] })).toEqual({ decision: 'deny', reason: 'path form' });
		});

		test('the retry of one segment does not change the others', () => {
			expect(evaluateCommand({ command: '/usr/bin/make test && make build', rules: [allowMake] })).toEqual({ decision: 'allow', reason: 'make' });
		});

		test('a prefixed command outside /usr/bin and /bin stays a no-match', () => {
			expect(evaluateCommand({ command: '/usr/local/bin/make test', rules: [allowMake] })).toEqual({ decision: 'no-match' });
		});
	});

	describe('the refusal of an unparseable command', () => {
		test('names the debug entry by a relative path, which the node-absolute-path rule permits', () => {
			const { reason } = evaluateCommand({ command: 'cat <<EOF', rules: [] });
			expect(reason).toMatch(/`node \.claude\/workflow\/bin\/debug\.js`/);
			expect(reason).not.toMatch(/node \//);
		});

		test('carries the reason the parser stated, where the parser stated one', () => {
			const { decision, reason } = evaluateCommand({ command: 'diff <(ls) <(ls)', rules: [] });
			expect(decision).toBe('deny');
			expect(reason).toMatch(/process substitution/);
		});
	});

	describe('the caller context', () => {
		const scopedDeny = {
			id: 'scoped',
			decision: 'deny',
			reason: 'scoped',
			matchSegment: () => true,
			appliesTo: (context) => context.agentType === 'workflow-worker'
		};

		test('reaches a rule that states appliesTo', () => {
			expect(evaluateCommand({ command: 'ls', rules: [scopedDeny], context: { agentType: 'workflow-worker' } }).decision).toBe('deny');
		});

		test('leaves the rule aside for a caller it does not name', () => {
			expect(evaluateCommand({ command: 'ls', rules: [scopedDeny], context: { agentType: 'general-purpose' } }).decision).toBe('no-match');
		});

		test('leaves the rule aside when the caller states no context at all', () => {
			expect(evaluateCommand({ command: 'ls', rules: [scopedDeny] }).decision).toBe('no-match');
		});
	});
});
