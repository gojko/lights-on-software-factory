import { describe, expect, test } from '@jest/globals';
import { DEFAULT_TRANSIENT_DIR, transientDir } from '../src/transient-dir.js';

describe('transientDir', () => {
	test('returns the default directory when the variable is absent', () => {
		expect(transientDir({})).toEqual('/tmp/claude-transient');
	});

	test('returns the default directory when the variable is empty', () => {
		expect(transientDir({ CLAUDE_TRANSIENT_DIR: '' })).toEqual('/tmp/claude-transient');
	});

	test('returns the variable value when the variable is set', () => {
		expect(transientDir({ CLAUDE_TRANSIENT_DIR: '/var/tmp/ct' })).toEqual('/var/tmp/ct');
	});

	test('returns the value without a trailing slash when the variable ends with one', () => {
		expect(transientDir({ CLAUDE_TRANSIENT_DIR: '/var/tmp/ct/' })).toEqual('/var/tmp/ct');
	});

	test('exports the default directory as a constant', () => {
		expect(DEFAULT_TRANSIENT_DIR).toEqual('/tmp/claude-transient');
	});
});
