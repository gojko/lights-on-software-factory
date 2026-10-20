import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

const LINTABLE_EXTENSIONS = new Set(['.js', '.mjs']);

const isInsideProject = (projectDir, filePath) => {
	const pathFromProject = relative(projectDir, filePath);
	return pathFromProject !== '' && !pathFromProject.startsWith('..') && !isAbsolute(pathFromProject);
};

const isUnderNodeModules = (projectDir, filePath) => relative(projectDir, filePath).split(sep).includes('node_modules');

const blockDecision = (filePath, output) => ({
	decision: 'block',
	reason: `eslint reported violations in ${filePath}. Fix them before continuing.\n\n${output}`
});

/**
 * Decides whether a PostToolUse edit of one file passes the project's eslint.
 * @param {{ projectDir: string, eslintRunner: { isInstalled: () => boolean, fix: (filePath: string) => { exitCode: number, output: string } } }} dependencies
 */
export const LintEditedFile = function ({ projectDir, eslintRunner }) {
	const isLintable = (filePath) => LINTABLE_EXTENSIONS.has(extname(filePath))
		&& isInsideProject(projectDir, filePath)
		&& !isUnderNodeModules(projectDir, filePath);

	const decide = (payload) => {
		const editedPath = payload?.tool_input?.file_path;
		if (!editedPath) {
			return undefined;
		}
		const filePath = resolve(projectDir, editedPath);
		if (!isLintable(filePath) || !eslintRunner.isInstalled()) {
			return undefined;
		}
		const { exitCode, output } = eslintRunner.fix(filePath);
		return exitCode === 0 ? undefined : blockDecision(filePath, output);
	};

	Object.freeze(Object.assign(this, { decide }));
};
