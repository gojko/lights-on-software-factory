import { describe, test, expect } from '@jest/globals';
import { workerTypecheckRule } from '../../../src/regulator/rules/worker-typecheck.js';

describe('workerTypecheckRule', () => {
	test('denies, so a form it does not match falls through to the common allow list', () => {
		expect(workerTypecheckRule.decision).toBe('deny');
	});

	test('applies to a worker', () => {
		expect(workerTypecheckRule.appliesTo({ agentType: 'workflow-worker' })).toBe(true);
	});

	test.each([['workflow-gate'], ['workflow-check'], ['general-purpose'], [undefined]])(
		'does not apply to %s, which keeps every form of tsc',
		(agentType) => {
			expect(workerTypecheckRule.appliesTo({ agentType })).toBe(false);
		}
	);

	test('states that the gate reads the types', () => {
		expect(workerTypecheckRule.reason).toMatch(/The gate reads every type when your group is complete/);
	});

	test('names no role, because a role name in a message goes out of date', () => {
		expect(workerTypecheckRule.reason).not.toMatch(/workflow-/);
	});

	test.each([
		[['tsc']],
		[['tsc', '--noEmit']],
		[['tsc', '-p', 'tsconfig.json']],
		[['tsc', '--project', 'tsconfig.json', '--noEmit']],
		[['npx', 'tsc', '--noEmit']],
		[['npx', '-y', 'tsc']],
		[['npm', 'exec', 'tsc']],
		[['node', 'node_modules/typescript/bin/tsc']],
		[['node_modules/.bin/tsc', '--noEmit']],
		[['./node_modules/.bin/tsc']],
		[['/usr/bin/tsc', '--noEmit']]
	])('matches %s, because it reads the types of the whole tree', (tokens) => {
		expect(workerTypecheckRule.matchSegment(tokens)).toBe(true);
	});

	test.each([
		[['grep', 'tsc', 'CONTRIBUTING.md']],
		[['cat', 'src/tools/rule-tester.js']],
		[['ls', 'node_modules/.bin']],
		[['jest', 'tests/a-module/thing.test.js']],
		[['eslint', 'src/tools/syntax-check.js']],
		[[]]
	])('does not match %s, which reads no type', (tokens) => {
		expect(workerTypecheckRule.matchSegment(tokens)).toBe(false);
	});

	test('leaves a make goal to the rule that answers every make goal of a worker', () => {
		expect(workerTypecheckRule.matchSegment(['make', 'typecheck'])).toBe(false);
	});
});
