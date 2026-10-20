import { describe, expect, test } from '@jest/globals';
import { formatGreeting } from '../src/format-greeting.js';

describe('formatGreeting', () => {
	test('returns a greeting with the name when a name is given', () => {
		expect(formatGreeting('Ada')).toEqual('Hello, Ada!');
	});

	test('returns the fallback greeting when the name is empty', () => {
		expect(formatGreeting('')).toEqual('Hello, there!');
	});

	test('returns the fallback greeting when the name holds only spaces', () => {
		expect(formatGreeting('   ')).toEqual('Hello, there!');
	});

	test('returns the fallback greeting when no name is given', () => {
		expect(formatGreeting()).toEqual('Hello, there!');
	});

	test('returns a greeting with the trimmed name when the name has outer spaces', () => {
		expect(formatGreeting('  Ada ')).toEqual('Hello, Ada!');
	});
});
