import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LintEditedFile } from '../../src/lint/lint-edited-file.js';

const BIN = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'lint-edited-file.js');
const PROJECT_DIR = '/work/project';

const payloadFor = (filePath) => ({ tool_name: 'Edit', tool_input: { file_path: filePath } });

describe('LintEditedFile', () => {
	let eslintRunner, underTest;

	beforeEach(() => {
		eslintRunner = {
			isInstalled: jest.fn().mockReturnValue(true),
			fix: jest.fn().mockReturnValue({ exitCode: 0, output: '' })
		};
		underTest = new LintEditedFile({ projectDir: PROJECT_DIR, eslintRunner });
	});

	test('returns no decision and runs eslint --fix when a .js file inside the project has no violations', () => {
		expect(underTest.decide(payloadFor(`${PROJECT_DIR}/src/a.js`))).toBeUndefined();
		expect(eslintRunner.fix).toHaveBeenCalledWith(`${PROJECT_DIR}/src/a.js`);
	});

	test('runs eslint --fix when the file is a .mjs file inside the project', () => {
		underTest.decide(payloadFor(`${PROJECT_DIR}/eslint.config.mjs`));
		expect(eslintRunner.fix).toHaveBeenCalledWith(`${PROJECT_DIR}/eslint.config.mjs`);
	});

	test('returns a block decision with the eslint output when eslint exits non-zero', () => {
		eslintRunner.fix.mockReturnValue({ exitCode: 1, output: '1:1  error  Comments are not allowed  local/no-comments' });
		expect(underTest.decide(payloadFor(`${PROJECT_DIR}/src/a.js`))).toEqual({
			decision: 'block',
			reason: `eslint reported violations in ${PROJECT_DIR}/src/a.js. Fix them before continuing.\n\n1:1  error  Comments are not allowed  local/no-comments`
		});
	});

	test('resolves a relative file path against the project directory', () => {
		underTest.decide(payloadFor('src/a.js'));
		expect(eslintRunner.fix).toHaveBeenCalledWith(`${PROJECT_DIR}/src/a.js`);
	});

	test.each([
		['a markdown file', `${PROJECT_DIR}/README.md`],
		['a json file', `${PROJECT_DIR}/package.json`],
		['a file outside the project', '/elsewhere/src/a.js'],
		['a file in a sibling directory with the same prefix', `${PROJECT_DIR}-other/src/a.js`],
		['a file under node_modules', `${PROJECT_DIR}/node_modules/pkg/index.js`]
	])('returns no decision and does not run eslint when the file is %s', (_, filePath) => {
		expect(underTest.decide(payloadFor(filePath))).toBeUndefined();
		expect(eslintRunner.fix).not.toHaveBeenCalled();
	});

	test('returns no decision and does not run eslint when the payload has no file path', () => {
		expect(underTest.decide({ tool_name: 'Write', tool_input: {} })).toBeUndefined();
		expect(eslintRunner.fix).not.toHaveBeenCalled();
	});

	test('returns no decision and does not run eslint when eslint is not installed in the project', () => {
		eslintRunner.isInstalled.mockReturnValue(false);
		expect(underTest.decide(payloadFor(`${PROJECT_DIR}/src/a.js`))).toBeUndefined();
		expect(eslintRunner.fix).not.toHaveBeenCalled();
	});
});

describe('lint-edited-file.js bin entry', () => {
	let projectDir;

	const runBin = (filePath) => spawnSync('node', [BIN], {
		input: JSON.stringify(payloadFor(filePath)),
		encoding: 'utf8',
		env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir }
	});

	const installFakeEslint = (script) => {
		mkdirSync(join(projectDir, 'node_modules', '.bin'), { recursive: true });
		const eslintPath = join(projectDir, 'node_modules', '.bin', 'eslint');
		writeFileSync(eslintPath, script);
		chmodSync(eslintPath, 0o755);
	};

	beforeEach(() => {
		projectDir = mkdtempSync(join(tmpdir(), 'lint-edited-file-'));
	});

	afterEach(() => {
		rmSync(projectDir, { recursive: true, force: true });
	});

	test('prints nothing and exits 0 when eslint is not installed in the project', () => {
		const result = runBin(join(projectDir, 'a.js'));
		expect(result.status).toBe(0);
		expect(result.stdout).toEqual('');
	});

	test('prints a block decision with the eslint output when the project eslint exits non-zero', () => {
		installFakeEslint('#!/bin/sh\necho "args: $*"\nexit 1\n');
		const filePath = join(projectDir, 'a.js');
		const result = runBin(filePath);
		expect(result.status).toBe(0);
		expect(JSON.parse(result.stdout)).toEqual({
			decision: 'block',
			reason: `eslint reported violations in ${filePath}. Fix them before continuing.\n\nargs: --fix ${filePath}\n`
		});
	});

	test('prints nothing and exits 0 when the project eslint exits 0', () => {
		installFakeEslint('#!/bin/sh\nexit 0\n');
		const result = runBin(join(projectDir, 'a.js'));
		expect(result.status).toBe(0);
		expect(result.stdout).toEqual('');
	});
});
