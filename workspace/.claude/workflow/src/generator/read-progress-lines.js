const EVENT_KINDS = ['step', 'gate', 'barrier', 'claim', 'planFaults', 'runStarted', 'runEnded'],
	isRecord = (value) =>
		typeof value === 'object' && value !== null && !Array.isArray(value),
	parsedOf = (line) => {
		try {
			return JSON.parse(line);
		} catch {
			return null;
		}
	},
	isProgressLine = (value) => {
		if (!isRecord(value) || typeof value.at !== 'string' || typeof value.run !== 'string') {
			return false;
		}
		const { event } = value;

		return isRecord(event) && typeof event.kind === 'string' && EVENT_KINDS.includes(event.kind);
	};

/**
 * The lines one artefact text holds, in file order.
 *
 * The reader passes over an empty line, a line it cannot parse, and a line that
 * states no `at`, no `run` or no event of this artefact. The artefact is
 * appended to while it is read, so a process that dies mid-append leaves half a
 * line behind. The dedupe of the derivation appends what is lost again at the
 * next poll, and a torn line therefore costs one cycle.
 */
export const readProgressLines = (artefactText) =>
	artefactText.split('\n').map(parsedOf).filter(isProgressLine);
