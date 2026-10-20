const lineOf = (text) => text === '' ? '' : `${text}\n`;

/**
 * The text an entry under bin/ writes to each stream, and the status it exits
 * with, for the answer it computed. An empty part of the answer writes nothing.
 */
export const streamsOf = ({ out, error, status }) => ({ stdout: lineOf(out), stderr: lineOf(error), status });
