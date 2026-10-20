import { describe, test, expect } from '@jest/globals';
import { stripSystemBinPrefix } from '../../src/regulator/strip-system-bin-prefix.js';

describe('stripSystemBinPrefix', () => {
	test('returns the bare command name for a /usr/bin prefix', () => {
		expect(stripSystemBinPrefix(['/usr/bin/time', 'make', 'test'])).toEqual(['time', 'make', 'test']);
	});

	test('returns the bare command name for a /bin prefix', () => {
		expect(stripSystemBinPrefix(['/bin/ls', '-la'])).toEqual(['ls', '-la']);
	});

	test('keeps every argument after the command name', () => {
		expect(stripSystemBinPrefix(['/usr/bin/grep', '-rn', '/usr/bin/foo', '.'])).toEqual(['grep', '-rn', '/usr/bin/foo', '.']);
	});

	test('returns null for a command with no path prefix', () => {
		expect(stripSystemBinPrefix(['time', 'make', 'test'])).toBe(null);
	});

	test('returns null for /usr/local/bin', () => {
		expect(stripSystemBinPrefix(['/usr/local/bin/sass', 'in.scss'])).toBe(null);
	});

	test('returns null for /opt/homebrew/bin', () => {
		expect(stripSystemBinPrefix(['/opt/homebrew/bin/sass', 'in.scss'])).toBe(null);
	});

	test('returns null for a directory below /usr/bin', () => {
		expect(stripSystemBinPrefix(['/usr/bin/vendor/tool'])).toBe(null);
	});

	test('returns null for an empty token list', () => {
		expect(stripSystemBinPrefix([])).toBe(null);
	});
});
