import js from '@eslint/js';
import { localPlugin } from './.claude/workflow/src/lint/plugin.js';

const NODE_GLOBALS = Object.fromEntries(
	[
		'AbortController', 'Buffer', 'URL', 'URLSearchParams', 'TextDecoder', 'TextEncoder',
		'clearInterval', 'clearTimeout', 'console', 'fetch', 'process',
		'setImmediate', 'setInterval', 'setTimeout', 'structuredClone'
	].map((name) => [name, 'readonly'])
);

const TEST_FILES = ['tests/**/*.js', '.claude/workflow/tests/**/*.js'];

export default [
	{
		ignores: ['node_modules/', 'plans/*.workflow.mjs']
	},
	js.configs.recommended,
	{
		files: ['**/*.js', '**/*.mjs'],
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: NODE_GLOBALS
		},
		plugins: { local: localPlugin },
		rules: {
			'local/no-comments': 'error',
			'local/node-protocol-imports': 'error'
		}
	},
	{
		files: TEST_FILES,
		rules: {
			'local/no-comments': ['error', { jsdoc: false, eslintDirectives: false }]
		}
	}
];
