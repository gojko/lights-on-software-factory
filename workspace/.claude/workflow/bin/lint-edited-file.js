import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { LintEditedFile } from '../src/lint/lint-edited-file.js';

const EslintRunner = function (projectDir) {
	const eslintPath = join(projectDir, 'node_modules', '.bin', 'eslint');
	const isInstalled = () => existsSync(eslintPath);
	const fix = (filePath) => {
		const result = spawnSync(eslintPath, ['--fix', filePath], { cwd: projectDir, encoding: 'utf8' });
		return { exitCode: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
	};
	Object.freeze(Object.assign(this, { isInstalled, fix }));
};

const main = () => {
	let payload;
	try {
		payload = JSON.parse(readFileSync(0, 'utf8'));
	} catch {
		process.stderr.write('lint-edited-file: invalid JSON on stdin\n');
		process.exit(1);
	}
	const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
	const lintEditedFile = new LintEditedFile({ projectDir, eslintRunner: new EslintRunner(projectDir) });
	const decision = lintEditedFile.decide(payload);
	if (decision) {
		process.stdout.write(JSON.stringify(decision));
	}
	process.exit(0);
};

main();
