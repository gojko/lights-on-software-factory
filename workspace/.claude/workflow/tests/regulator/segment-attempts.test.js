import { describe, test, expect } from '@jest/globals';
import { segmentAttempts } from '../../src/regulator/segment-attempts.js';

describe('segmentAttempts', () => {
	test('returns one attempt with the wrappers peeled for an ordinary segment', () => {
		expect(segmentAttempts({ tokens: ['time', 'make', 'test'], originalCommandString: 'time make test' })).toEqual([
			{ tokens: ['make', 'test'], originalCommandString: 'time make test' }
		]);
	});

	test('returns one attempt when the command carries no system bin prefix', () => {
		expect(segmentAttempts({ tokens: ['ls', '-la'], originalCommandString: 'ls -la' })).toEqual([{ tokens: ['ls', '-la'], originalCommandString: 'ls -la' }]);
	});

	test('adds a second attempt without the /usr/bin prefix', () => {
		expect(segmentAttempts({ tokens: ['/usr/bin/ls', '-la'], originalCommandString: '/usr/bin/ls -la' })).toEqual([
			{ tokens: ['/usr/bin/ls', '-la'], originalCommandString: '/usr/bin/ls -la' },
			{ tokens: ['ls', '-la'], originalCommandString: 'ls -la' }
		]);
	});

	test('adds a second attempt without the /bin prefix', () => {
		expect(segmentAttempts({ tokens: ['/bin/ls'], originalCommandString: '/bin/ls' })).toEqual([
			{ tokens: ['/bin/ls'], originalCommandString: '/bin/ls' },
			{ tokens: ['ls'], originalCommandString: 'ls' }
		]);
	});

	test('peels a wrapper that the prefix hid from the first attempt', () => {
		expect(segmentAttempts({ tokens: ['/usr/bin/time', 'make', 'test'], originalCommandString: '/usr/bin/time make test' })[1]).toEqual({
			tokens: ['make', 'test'],
			originalCommandString: 'time make test'
		});
	});

	test('strips a prefix that a wrapper hid from the token list', () => {
		expect(segmentAttempts({ tokens: ['time', '/usr/bin/make', 'test'], originalCommandString: 'time /usr/bin/make test' })[1]).toEqual({
			tokens: ['make', 'test'],
			originalCommandString: 'time /usr/bin/make test'
		});
	});

	test('returns one attempt when the prefix is on an argument rather than the command', () => {
		expect(segmentAttempts({ tokens: ['cat', '/usr/bin/sudo'], originalCommandString: 'cat /usr/bin/sudo' })).toHaveLength(1);
	});

	test('returns one attempt for a directory outside /usr/bin and /bin', () => {
		expect(segmentAttempts({ tokens: ['/usr/local/bin/sass'], originalCommandString: '/usr/local/bin/sass' })).toHaveLength(1);
	});

	test('returns one attempt for a nested directory under /usr/bin', () => {
		expect(segmentAttempts({ tokens: ['/usr/bin/vendor/tool'], originalCommandString: '/usr/bin/vendor/tool' })).toHaveLength(1);
	});

	test('returns one empty attempt when the segment holds nothing but wrappers', () => {
		expect(segmentAttempts({ tokens: [], originalCommandString: '' })).toEqual([{ tokens: [], originalCommandString: '' }]);
	});
});
