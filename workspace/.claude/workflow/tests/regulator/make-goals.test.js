import { describe, test, expect } from '@jest/globals';
import { makeGoals } from '../../src/regulator/make-goals.js';

describe('makeGoals', () => {
	test('returns the goal when make names one', () => {
		expect(makeGoals(['make', 'test'])).toEqual(['test']);
	});

	test('returns every goal when make names two', () => {
		expect(makeGoals(['make', 'clean', 'test'])).toEqual(['clean', 'test']);
	});

	test('returns an empty list when make names no goal', () => {
		expect(makeGoals(['make'])).toEqual([]);
	});

	test('returns an empty list when the command is not make', () => {
		expect(makeGoals(['jest', 'tests/thing.test.js'])).toEqual([]);
	});

	test('returns an empty list when the segment is empty', () => {
		expect(makeGoals([])).toEqual([]);
	});

	test('returns an empty list when a goal name is the head of another command', () => {
		expect(makeGoals(['npm', 'test'])).toEqual([]);
	});

	test('skips the directory that -C names', () => {
		expect(makeGoals(['make', '-C', 'infra', 'deploy'])).toEqual(['deploy']);
	});

	test('skips the file that -f names', () => {
		expect(makeGoals(['make', '-f', 'other.mk', 'build-demo-pages'])).toEqual(['build-demo-pages']);
	});

	test('skips a short flag that carries its own value', () => {
		expect(makeGoals(['make', '-j4', 'test'])).toEqual(['test']);
	});

	test('skips a long flag that carries its value with an equals sign', () => {
		expect(makeGoals(['make', '--directory=/tmp/build', 'lint'])).toEqual(['lint']);
	});

	test('skips the dry-run flag', () => {
		expect(makeGoals(['make', '-n', 'deploy'])).toEqual(['deploy']);
	});

	test('skips an assignment that follows the goal', () => {
		expect(makeGoals(['make', 'test', 'INCREMENTAL=1'])).toEqual(['test']);
	});

	test('skips an assignment that precedes the goal', () => {
		expect(makeGoals(['make', 'TARGET=myenv', 'smoke-test'])).toEqual(['smoke-test']);
	});

	test('skips the end-of-flags marker', () => {
		expect(makeGoals(['make', '--', 'test'])).toEqual(['test']);
	});

	test('returns the goal when a flag follows it', () => {
		expect(makeGoals(['make', 'typecheck', '-j', '2'])).toEqual(['typecheck']);
	});
});
