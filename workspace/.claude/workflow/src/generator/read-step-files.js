const HEADING_NAMES = ['Files to create', 'Files to modify', 'Files to delete'],
	ITEM = /^\d+\.\s+(.*)$/u,
	CONTINUATION = /^\s+\S/u,
	NONE = /^[\s:`]*none[\s`.]*$/iu,
	QUOTED = /`([^`]+)`/gu,
	markedNameOf = (name) => `**${name}**`,
	quotedTokensOf = (text) =>
		[...text.matchAll(QUOTED)].flatMap((match) => match[1] === undefined ? [] : [match[1]]),
	listEndOf = ({ lines, heading }) => {
		const after = lines.findIndex((line, index) =>
			index > heading && line.trim() !== '' && !CONTINUATION.test(line) && !ITEM.test(line));

		return after === -1 ? lines.length : after;
	},
	listPathsOf = ({ lines, heading }) =>
		lines.slice(heading + 1, listEndOf({ lines, heading })).flatMap((line) => {
			const item = ITEM.exec(line);

			return item === null ? [] : quotedTokensOf(item[1] ?? '').slice(0, 1);
		}),
	filesOfHeading = ({ lines, name }) => {
		const heading = lines.findIndex((line) => line.startsWith(markedNameOf(name)));

		if (heading === -1) {
			return null;
		}
		const beside = (lines[heading] ?? '').slice(markedNameOf(name).length);

		if (NONE.test(beside)) {
			return [];
		}
		const stated = quotedTokensOf(beside);

		return stated.length > 0 ? stated : listPathsOf({ lines, heading });
	};

/**
 * The file boundary of one step: the union of what its three file lists name.
 *
 * A heading states its paths as a numbered list of backquoted paths below it, or
 * as one backquoted path beside itself, and the word `none` states an empty
 * list. A line states a heading only where it starts with one, so a sentence
 * that names a heading in the middle states no list.
 *
 * A body that states fewer than three headings answers the name of each absent
 * heading and no file list. An empty union and an unstated boundary are two
 * different answers, and the caller decides what to do with the fault.
 */
export const readStepFiles = (stepBody) => {
	const lines = stepBody.split('\n'),
		lists = HEADING_NAMES.map((name) => ({ name, files: filesOfHeading({ lines, name }) })),
		absentHeadings = lists.flatMap((list) => list.files === null ? [list.name] : []);

	if (absentHeadings.length > 0) {
		return { absentHeadings };
	}
	return { files: [...new Set(lists.flatMap((list) => list.files ?? []))] };
};
