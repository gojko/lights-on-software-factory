import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from '@jest/globals';

const ENTRY = join(import.meta.dirname, '..', '..', 'bin', 'validate-plan.js'),
	DIRECTORY = mkdtempSync(join(tmpdir(), 'validate-plan-bin-')),
	GREEN = join(DIRECTORY, 'green.md'),
	runOf = (given) => spawnSync(process.execPath, [ENTRY, ...given], { encoding: 'utf8' });

writeFileSync(GREEN, [
	'## Implementation Plan',
	'',
	'#### Step 1.1: a step of the plan',
	'',
	'**Files to create**: `none`',
	'',
	'**Files to modify**:',
	'',
	'1. `src/step-1.1.js`',
	'',
	'**Files to delete**: `none`',
	''
].join('\n'));
writeFileSync(join(DIRECTORY, 'green.plan.json'), JSON.stringify({ groups: [{ name: 'A', steps: ['1.1'] }], dependencies: {} }));

describe('node .claude/workflow/bin/validate-plan.js, run as a process', () => {
	test('writes the answer to the output stream and exits zero for a plan that states no fault', () => {
		const answer = runOf([GREEN]);

		expect(answer).toEqual(expect.objectContaining({ status: 0, stdout: `${GREEN}: no fault\n`, stderr: '' }));
	});

	test('writes the usage line to the error stream and exits one when it is given no plan', () => {
		const answer = runOf([]);

		expect(answer.status).toEqual(1);
		expect(answer.stdout).toEqual('');
		expect(answer.stderr).toContain('node .claude/workflow/bin/validate-plan.js plans/');
	});
});
