import { RuleTester } from 'eslint';
import { nodeProtocolImports } from '../../src/lint/node-protocol-imports.js';

const ruleTester = new RuleTester({
	languageOptions: {
		ecmaVersion: 2025,
		sourceType: 'module'
	}
});

ruleTester.run('node-protocol-imports', nodeProtocolImports, {
	valid: [
		'import { readFile } from "node:fs/promises";',
		'import path from "node:path";',
		'import { randomUUID } from "node:crypto";',
		'import { Agent } from "node:https";',
		'import express from "express";',
		'import { foo } from "./local.js";',
		'import { foo } from "../sibling/module.js";',
		'import { foo } from "@scope/package";',
		'import("node:fs");',
		'const fs = require("fs");'
	],
	invalid: [
		{
			code: 'import { readFile } from "fs/promises";',
			errors: [{ messageId: 'missingNodeProtocol', data: { source: 'fs/promises' } }],
			output: 'import { readFile } from "node:fs/promises";'
		},
		{
			code: 'import { readFile } from "fs";',
			errors: [{ messageId: 'missingNodeProtocol' }],
			output: 'import { readFile } from "node:fs";'
		},
		{
			code: `import { Agent } from 'https';`,
			errors: [{ messageId: 'missingNodeProtocol' }],
			output: `import { Agent } from 'node:https';`
		},
		{
			code: 'import path from "path";',
			errors: [{ messageId: 'missingNodeProtocol' }],
			output: 'import path from "node:path";'
		},
		{
			code: 'import { randomUUID } from "crypto";',
			errors: [{ messageId: 'missingNodeProtocol' }],
			output: 'import { randomUUID } from "node:crypto";'
		},
		{
			code: 'import { performance } from "perf_hooks";',
			errors: [{ messageId: 'missingNodeProtocol' }],
			output: 'import { performance } from "node:perf_hooks";'
		},
		{
			code: 'import { Worker } from "worker_threads";',
			errors: [{ messageId: 'missingNodeProtocol' }],
			output: 'import { Worker } from "node:worker_threads";'
		},
		{
			code: 'export { default } from "fs";',
			errors: [{ messageId: 'missingNodeProtocol' }],
			output: 'export { default } from "node:fs";'
		},
		{
			code: 'export * from "path";',
			errors: [{ messageId: 'missingNodeProtocol' }],
			output: 'export * from "node:path";'
		}
	]
});
