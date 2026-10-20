const ALLOWED_KEYS = ['groups', 'dependencies'],
	parsedOf = ({ path, text }) => {
		try {
			return JSON.parse(text);
		} catch (fault) {
			throw new Error(`${path} is not JSON: ${fault instanceof Error ? fault.message : String(fault)}`, { cause: fault });
		}
	},
	isStepNames = (value) => Array.isArray(value) && value.every((step) => typeof step === 'string'),
	isGroup = (value) =>
		value !== null && typeof value === 'object' && !Array.isArray(value)
			&& typeof value.name === 'string'
			&& isStepNames(value.steps),
	groupsOf = ({ path, value }) => {
		if (value === undefined) {
			return [];
		}
		if (!Array.isArray(value) || !value.every(isGroup)) {
			throw new Error(`${path} states "groups" that is not an array of a name and an array of step names`);
		}
		return value.map(({ name, steps }) => ({ name, steps }));
	},
	dependenciesOf = ({ path, value }) => {
		if (value === undefined) {
			return {};
		}
		if (value === null || typeof value !== 'object' || Array.isArray(value) || !Object.values(value).every(isStepNames)) {
			throw new Error(`${path} states "dependencies" that is not a map of arrays of step names`);
		}
		return Object.fromEntries(Object.entries(value).filter((entry) => isStepNames(entry[1])));
	},
	planOf = ({ path, parsed }) => {
		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error(`${path} states a value that is not a JSON object`);
		}
		const beyond = Object.keys(parsed).filter((key) => !ALLOWED_KEYS.includes(key));

		if (beyond.length > 0) {
			throw new Error(`${path} states the keys ${beyond.map((key) => `"${key}"`).join(', ')}, and only "groups" and "dependencies" are allowed`);
		}
		const fields = parsed;

		return {
			groups: groupsOf({ path, value: fields.groups }),
			dependencies: dependenciesOf({ path, value: fields.dependencies })
		};
	};

/**
 * The execution plan a sidecar file states, read whole.
 *
 * The reader answers a fault, and names the path of the file and what it found,
 * where the text is not JSON, where it states a value that is not an object,
 * and where it states a key beyond `groups` and `dependencies`. A key that the
 * file leaves out is empty and is no fault.
 */
export const readExecutionPlan = ({ path, text }) =>
	planOf({ path, parsed: parsedOf({ path, text }) });
