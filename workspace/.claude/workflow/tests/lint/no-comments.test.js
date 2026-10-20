import { RuleTester } from 'eslint';
import { noComments } from '../../src/lint/no-comments.js';

const ruleTester = new RuleTester({
		languageOptions: {
			ecmaVersion: 2025,
			sourceType: 'module',
		},
	}),
	REMOVING = [{ fix: true }],
	TEST_FILE = [{ jsdoc: false, eslintDirectives: false }],
	REMOVING_IN_TEST_FILE = [{ fix: true, jsdoc: false, eslintDirectives: false }];

ruleTester.run('no-comments', noComments, {
	valid: [
		'const answer = 1;',
		'const banner = "// not a comment";',
		'/** A note about the fixture. */\nexport const fixture = () => 1;',
		'/**\n * @param {string} name\n * @returns {string}\n */\nexport const greet = (name) => name;',
		'/* eslint-disable no-unused-vars */\nconst answer = 1;',
		'// eslint-disable-next-line no-unused-vars\nconst answer = 1;',
		'/* global structuredClone */\nconst answer = structuredClone(1);',
		'/** @jest-environment jsdom */\nconst answer = 1;',
		'/**\n * @jest-environment jsdom\n */\nconst answer = 1;',
		'#!/usr/bin/env node\nconst answer = 1;',
		{ code: '#!/usr/bin/env node\nconst answer = 1;', options: TEST_FILE },
		{ code: '/** @jest-environment jsdom */\nconst answer = 1;', options: TEST_FILE },
		{ code: '/** A note about the fixture. */\nexport const fixture = () => 1;', options: REMOVING },
	],
	invalid: [
		{
			code: '// the build stamp\nconst answer = 1;',
			output: null,
			errors: [{ messageId: 'comment' }],
		},
		{
			code: '/* the build stamp */\nconst answer = 1;',
			output: null,
			errors: [{ messageId: 'comment' }],
		},
		{
			code: 'const measure = () => {\n\t// the arrange\n\treturn 1;\n};',
			output: null,
			errors: [{ messageId: 'comment' }],
		},
		{
			code: '/*** three stars is not a doc block */\nconst answer = 1;',
			output: null,
			errors: [{ messageId: 'comment' }],
		},
		{
			code: '/** A note about the fixture. */\nexport const fixture = () => 1;',
			options: TEST_FILE,
			output: null,
			errors: [{ messageId: 'comment' }],
		},
		{
			code: '/* eslint-disable no-unused-vars */\nconst answer = 1;',
			options: TEST_FILE,
			output: null,
			errors: [{ messageId: 'comment' }],
		},
		{
			code: '// eslint-disable-next-line no-unused-vars\nconst answer = 1;',
			options: TEST_FILE,
			output: null,
			errors: [{ messageId: 'comment' }],
		},
		{
			code: '/** @jest-environment jsdom — the widget needs a DOM */\nconst answer = 1;',
			options: TEST_FILE,
			output: null,
			errors: [{ messageId: 'comment' }],
		},
		{
			code: '// the build stamp\nconst answer = 1;',
			options: REMOVING,
			output: 'const answer = 1;',
			errors: [{ messageId: 'comment' }],
		},
		{
			code: 'const answer = 1; // the count of builds\nconst other = 2;',
			options: REMOVING,
			output: 'const answer = 1;\nconst other = 2;',
			errors: [{ messageId: 'comment' }],
		},
		{
			code: '// one\nconst answer = 1;\n// two\nconst other = 2;',
			options: REMOVING,
			output: 'const answer = 1;\nconst other = 2;',
			errors: [{ messageId: 'comment' }, { messageId: 'comment' }],
		},
		{
			code: '/**\n * A note about the fixture.\n */\nexport const fixture = () => 1;',
			options: REMOVING_IN_TEST_FILE,
			output: 'export const fixture = () => 1;',
			errors: [{ messageId: 'comment' }],
		},
		{
			code: '/** @jest-environment jsdom */\n// the build stamp\nconst answer = 1;',
			options: REMOVING,
			output: '/** @jest-environment jsdom */\nconst answer = 1;',
			errors: [{ messageId: 'comment', line: 2 }],
		},
		{
			code: '#!/usr/bin/env node\n// the build stamp\nconst answer = 1;',
			options: REMOVING,
			output: '#!/usr/bin/env node\nconst answer = 1;',
			errors: [{ messageId: 'comment', line: 2 }],
		},
		{
			code: 'describe("a sector", () => {\n\t/* the reason */\n\ttest("answers its name", () => {});\n});',
			options: REMOVING,
			output: 'describe("a sector", () => {\n\ttest("answers its name", () => {});\n});',
			errors: [{ messageId: 'comment' }],
		},
	],
});
