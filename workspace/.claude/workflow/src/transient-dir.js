export const DEFAULT_TRANSIENT_DIR = '/tmp/claude-transient';

const withoutTrailingSlash = (path) => path.replace(/\/+$/, '');

export const transientDir = function (env) {
	return withoutTrailingSlash(env.CLAUDE_TRANSIENT_DIR || '') || DEFAULT_TRANSIENT_DIR;
};
