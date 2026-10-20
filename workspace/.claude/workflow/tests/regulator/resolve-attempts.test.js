import { describe, test, expect } from '@jest/globals';
import { resolveAttempts } from '../../src/regulator/resolve-attempts.js';

const allowLs = { id: 'ls', decision: 'allow', matchSegment: (tokens) => tokens[0] === 'ls' };

describe('resolveAttempts', () => {
	test('returns the decision of the first attempt that a rule resolves', () => {
		const attempts = [
			{ tokens: ['/usr/bin/ls'], originalCommandString: '/usr/bin/ls' },
			{ tokens: ['ls'], originalCommandString: 'ls' }
		];
		expect(resolveAttempts({ attempts, rules: [allowLs] })).toEqual({ decision: 'allow', id: 'ls' });
	});

	test('never reaches a later attempt once an earlier one resolves', () => {
		const seen = [];
		const rules = [{ id: 'first', decision: 'deny', reason: 'D', matchSegment: (tokens) => { seen.push(tokens); return true; } }];
		resolveAttempts({
			attempts: [
				{ tokens: ['/usr/bin/ls'], originalCommandString: '/usr/bin/ls' },
				{ tokens: ['ls'], originalCommandString: 'ls' }
			],
			rules
		});
		expect(seen).toEqual([['/usr/bin/ls']]);
	});

	test('returns no-match when no attempt resolves', () => {
		const attempts = [{ tokens: ['unknown'], originalCommandString: 'unknown' }];
		expect(resolveAttempts({ attempts, rules: [allowLs] })).toEqual({ decision: 'no-match' });
	});

	test('returns no-match for an attempt that holds no token', () => {
		expect(resolveAttempts({ attempts: [{ tokens: [], originalCommandString: '' }], rules: [allowLs] })).toEqual({ decision: 'no-match' });
	});

	test('passes the command string of the attempt to a matchRaw rule', () => {
		const seen = [];
		const rules = [{ id: 'raw', decision: 'deny', reason: 'D', matchRaw: (cmd) => { seen.push(cmd); return cmd === 'ls'; } }];
		resolveAttempts({
			attempts: [
				{ tokens: ['/usr/bin/ls'], originalCommandString: '/usr/bin/ls' },
				{ tokens: ['ls'], originalCommandString: 'ls' }
			],
			rules
		});
		expect(seen).toEqual(['/usr/bin/ls', 'ls']);
	});
});
