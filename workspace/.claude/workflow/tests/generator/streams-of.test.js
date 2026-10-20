import { describe, expect, test } from '@jest/globals';

import { streamsOf } from '../../src/generator/streams-of.js';

describe('streamsOf', () => {
	test('ends the output with one newline and writes nothing to the error stream for an answer with no error', () => {
		expect(streamsOf({ out: 'plans/a-plan.md: no fault', error: '', status: 0 }))
			.toEqual({ stdout: 'plans/a-plan.md: no fault\n', stderr: '', status: 0 });
	});

	test('ends the error with one newline and writes nothing to the output stream for an answer with no output', () => {
		expect(streamsOf({ out: '', error: 'a fault', status: 1 }))
			.toEqual({ stdout: '', stderr: 'a fault\n', status: 1 });
	});

	test('writes both streams where the answer carries both', () => {
		expect(streamsOf({ out: 'a report', error: 'a note', status: 1 }))
			.toEqual({ stdout: 'a report\n', stderr: 'a note\n', status: 1 });
	});
});
