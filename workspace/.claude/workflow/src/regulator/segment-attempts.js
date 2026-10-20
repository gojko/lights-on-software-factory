import { unwrapWrappers } from './unwrap-wrappers.js';
import { wrappers } from './wrappers.js';
import { stripSystemBinPrefix } from './strip-system-bin-prefix.js';

const SYSTEM_BIN_HEAD_RE = /^\/(?:usr\/)?bin\//;

function segmentAttempts({ tokens, originalCommandString }) {
	const unwrapped = unwrapWrappers(tokens, wrappers),
	 stripped = stripSystemBinPrefix(unwrapped);
	if (!stripped) {
		return [{ tokens: unwrapped, originalCommandString }];
	}
	return [
		{ tokens: unwrapped, originalCommandString },
		{
			tokens: unwrapWrappers(stripped, wrappers),
			originalCommandString: originalCommandString.replace(SYSTEM_BIN_HEAD_RE, '')
		}
	];
}

export { segmentAttempts };
