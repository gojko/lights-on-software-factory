import { noComments } from './no-comments.js';
import { nodeProtocolImports } from './node-protocol-imports.js';

export const localPlugin = {
	meta: { name: 'local' },
	rules: {
		'no-comments': noComments,
		'node-protocol-imports': nodeProtocolImports
	}
};
