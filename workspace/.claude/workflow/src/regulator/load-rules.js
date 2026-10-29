import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import defaultRules from './rules.js';

async function loadRules(entryPoint) {
	if (!entryPoint) {
		return defaultRules;
	}
	const absolute = resolve(process.cwd(), entryPoint),
		loaded = await import(pathToFileURL(absolute).href);
	if (!Array.isArray(loaded.default)) {
		throw new Error(`rules entry point ${absolute} does not export an array as default`);
	}
	return loaded.default;
}

export { loadRules };
