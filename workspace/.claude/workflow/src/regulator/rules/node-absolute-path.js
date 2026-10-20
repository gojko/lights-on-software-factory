import { transientDir } from '../../transient-dir.js';

const exemptPrefix = () => `${transientDir(process.env)}/`,
	nodeAbsolutePathRule = {
		id: 'node-absolute-path',
		decision: 'deny',
		reason: () =>
			`Do not run node scripts using absolute paths. Use a relative path instead (e.g., node .claude/scripts/foo.js). Scripts under ${exemptPrefix()} are exempt.`,
		matchSegment: (tokens) =>
			tokens[0] === 'node' &&
			typeof tokens[1] === 'string' &&
			tokens[1].startsWith('/') &&
			!tokens[1].startsWith(exemptPrefix())
	};

export { nodeAbsolutePathRule };
