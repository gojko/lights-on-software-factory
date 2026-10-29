import { describe, test, expect } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';
import { loadRules } from '../../src/regulator/load-rules.js';
import defaultRules from '../../src/regulator/rules.js';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const DEFAULT_RULES = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'regulator', 'rules.js');

describe('loadRules', () => {
	test('returns the default rules when no entry point is given', async () => {
		expect(await loadRules()).toBe(defaultRules);
	});

	test('accepts the default rules module as an entry point', async () => {
		expect(await loadRules(DEFAULT_RULES)).toBe(defaultRules);
	});

	test('returns the rules exported by the entry point at an absolute path', async () => {
		const loaded = await loadRules(resolve(FIXTURES, 'custom-rules.js'));
		expect(loaded.map((rule) => rule.id)).toEqual(['custom-allow-hello']);
	});

	test('resolves a relative entry point against the working directory', async () => {
		const loaded = await loadRules(relative(process.cwd(), resolve(FIXTURES, 'custom-rules.js')));
		expect(loaded.map((rule) => rule.id)).toEqual(['custom-allow-hello']);
	});

	test('throws when the default export of the entry point is not an array', async () => {
		await expect(loadRules(resolve(FIXTURES, 'no-rules-export.js'))).rejects.toThrow(/does not export an array as default/);
	});
});
