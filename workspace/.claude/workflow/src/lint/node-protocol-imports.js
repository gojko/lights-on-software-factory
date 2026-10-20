const NODE_BUILTINS = new Set([
		'assert', 'async_hooks', 'buffer', 'child_process', 'cluster',
		'console', 'constants', 'crypto', 'dgram', 'diagnostics_channel',
		'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https',
		'inspector', 'module', 'net', 'os', 'path', 'perf_hooks',
		'process', 'punycode', 'querystring', 'readline', 'repl',
		'stream', 'string_decoder', 'sys', 'timers', 'tls',
		'trace_events', 'tty', 'url', 'util', 'v8', 'vm',
		'wasi', 'worker_threads', 'zlib'
	]),

	bareBuiltinName = function (source) {
		const slashIndex = source.indexOf('/'),
			head = slashIndex >= 0 ? source.slice(0, slashIndex) : source;
		return NODE_BUILTINS.has(head) ? source : null;
	};

export const nodeProtocolImports = {
	meta: {
		type: 'problem',
		fixable: 'code',
		docs: {
			description: 'Require the `node:` prefix on imports of Node.js built-in modules (e.g. `import fs from "node:fs"` instead of `import fs from "fs"`). The prefix disambiguates real built-ins from third-party packages that happen to share a name, and is the format ESM mandates.'
		},
		schema: [],
		messages: {
			missingNodeProtocol: 'Import from Node built-in `{{source}}` is missing the `node:` prefix. Use `import … from "node:{{source}}"`.'
		}
	},
	create(context) {
		const sourceCode = context.sourceCode,
			check = function (node) {
				const source = node.source;
				if (!source || typeof source.value !== 'string') {
					return;
				}
				const match = bareBuiltinName(source.value);
				if (match === null) {
					return;
				}
				context.report({
					node: source,
					messageId: 'missingNodeProtocol',
					data: { source: match },
					fix(fixer) {
						const raw = sourceCode.getText(source),
							quote = raw[0];
						return fixer.replaceText(source, `${quote}node:${match}${quote}`);
					}
				});
			};
		return {
			ImportDeclaration: check,
			ExportAllDeclaration: check,
			ExportNamedDeclaration: check
		};
	}
};
