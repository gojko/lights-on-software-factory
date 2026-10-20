const STEP_STATUSES = ['done', 'doneWithDeviation', 'notDone', 'noTaskBody', 'noFilesNamed'],
	CLAIM_ANSWERS = ['held', 'notHeld', 'notProvable'],
	CLAIM_REPAIRS = ['resendStep', 'needsAssertion', 'needsNewStep', 'planDisagreement'],
	isRecord = (value) =>
		typeof value === 'object' && value !== null && !Array.isArray(value),
	isTexts = (value) =>
		Array.isArray(value) && value.every((one) => typeof one === 'string'),
	isRework = (value) =>
		isRecord(value) && typeof value.step === 'string' && typeof value.said === 'string',
	isFault = (value) =>
		isRecord(value) && typeof value.fault === 'string' && (value.steps === undefined || isTexts(value.steps)),
	faultOf = ({ head, said }) =>
		new Error(`${head.run} ${head.key} ${head.agent}: ${said}`),
	recordOf = ({ head, value, said }) => {
		if (!isRecord(value)) {
			throw faultOf({ head, said });
		}
		return value;
	},
	textOf = ({ head, payload, field }) => {
		const value = payload[field];

		if (typeof value !== 'string') {
			throw faultOf({ head, said: `the reply states no "${field}"` });
		}
		return value;
	},
	boolOf = ({ head, payload, field }) => {
		const value = payload[field];

		if (typeof value !== 'boolean') {
			throw faultOf({ head, said: `the reply states no "${field}"` });
		}
		return value;
	},
	wordOf = ({ head, payload, field, allowed }) => {
		const value = textOf({ head, payload, field }),
			found = allowed.find((word) => word === value);

		if (found === undefined) {
			throw faultOf({ head, said: `the reply states "${field}" as "${value}", and the record holds ${allowed.join(', ')}` });
		}
		return found;
	},
	kindOf = ({ head, payload, agentType, allowed }) => {
		const value = textOf({ head, payload, field: 'kind' });

		if (!allowed.includes(value)) {
			throw faultOf({ head, said: `the reply states "kind" as "${value}", and a ${agentType} answers ${allowed.join(' or ')}` });
		}
		return value;
	},
	textsOf = ({ head, payload, fields }) => Object.fromEntries(
		fields.flatMap((field) => payload[field] === undefined ? [] : [[field, textOf({ head, payload, field })]])
	),
	repairOf = ({ head, payload }) => payload.repair === undefined
		? {}
		: { repair: wordOf({ head, payload, field: 'repair', allowed: CLAIM_REPAIRS }) },
	relativeOf = ({ path, root }) =>
		path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path,
	filesWrittenOf = ({ head, payload, root }) => {
		const value = payload.filesWritten;

		if (!isTexts(value)) {
			throw faultOf({ head, said: 'the reply states no "filesWritten" array of paths' });
		}
		return value.map((path) => relativeOf({ path, root }));
	},
	reworkOf = ({ head, payload }) => {
		const value = payload.needsRework;

		if (!Array.isArray(value) || !value.every(isRework)) {
			throw faultOf({ head, said: 'the reply states no "needsRework" array of a step and what it said' });
		}
		return value.map(({ step, said }) => ({ step, said }));
	},
	faultsOf = ({ head, payload }) => {
		const value = payload.planFaults;

		if (!Array.isArray(value) || !value.every(isFault)) {
			throw faultOf({ head, said: 'the reply states no "planFaults" array of faults' });
		}
		return value.map(({ fault, steps }) => steps === undefined ? { fault } : { fault, steps });
	},
	claimsOf = ({ head, payload }) => {
		const value = payload.claims;

		if (!Array.isArray(value)) {
			throw faultOf({ head, said: 'the reply states no "claims" array' });
		}
		return value.map((claim) => recordOf({ head, value: claim, said: 'a claim of the reply is not a record' }));
	},
	workerLineOf = ({ head, result, root }) => {
		const payload = recordOf({ head, value: result, said: 'the reply is not a record' });

		kindOf({ head, payload, agentType: 'workflow-worker', allowed: ['step'] });
		return [{
			...head,
			agentType: 'workflow-worker',
			step: textOf({ head, payload, field: 'step' }),
			event: {
				kind: 'step',
				status: wordOf({ head, payload, field: 'status', allowed: STEP_STATUSES }),
				summary: textOf({ head, payload, field: 'summary' }),
				filesWritten: filesWrittenOf({ head, payload, root }),
				...textsOf({ head, payload, fields: ['deviation', 'blocker', 'decisionForLaterSteps', 'carryForwardDefect'] })
			}
		}];
	},
	gateEventOf = ({ head, payload }) => {
		const kind = kindOf({ head, payload, agentType: 'workflow-gate', allowed: ['gate', 'barrier'] }),
			verdict = {
				green: boolOf({ head, payload, field: 'green' }),
				needsRework: reworkOf({ head, payload }),
				blocked: textOf({ head, payload, field: 'blocked' }),
				summary: textOf({ head, payload, field: 'summary' })
			};

		return kind === 'barrier'
			? {
				kind: 'barrier',
				...verdict,
				...textsOf({ head, payload, fields: ['statusAnswer'] })
			}
			: { kind: 'gate', ...verdict };
	},
	gateLineOf = ({ head, result }) => {
		const payload = recordOf({ head, value: result, said: 'the reply is not a record' });

		return [{
			...head,
			agentType: 'workflow-gate',
			group: textOf({ head, payload, field: 'group' }),
			event: gateEventOf({ head, payload })
		}];
	},
	claimLineOf = ({ head, claim }) => ({
		...head,
		agentType: 'workflow-check',
		step: textOf({ head, payload: claim, field: 'step' }),
		event: {
			kind: 'claim',
			claim: textOf({ head, payload: claim, field: 'claim' }),
			answer: wordOf({ head, payload: claim, field: 'answer', allowed: CLAIM_ANSWERS }),
			evidence: textOf({ head, payload: claim, field: 'evidence' }),
			...repairOf({ head, payload: claim }),
			...textsOf({ head, payload: claim, fields: ['inspect'] })
		}
	}),
	checkLinesOf = ({ head, result }) => {
		const payload = recordOf({ head, value: result, said: 'the reply is not a record' }),
			claims = claimsOf({ head, payload }),
			faults = faultsOf({ head, payload });

		return [
			...claims.map((claim) => claimLineOf({ head, claim })),
			{ ...head, agentType: 'workflow-check', event: { kind: 'planFaults', faults } }
		];
	},
	BUILDERS = {
		'workflow-worker': workerLineOf,
		'workflow-gate': gateLineOf,
		'workflow-check': checkLinesOf
	},
	parsedOf = (line) => {
		try {
			return JSON.parse(line);
		} catch {
			return null;
		}
	},
	answersOf = (journalText) => journalText.split('\n').flatMap((line) => {
		const entry = parsedOf(line);

		return isRecord(entry) && entry.type === 'result' && typeof entry.key === 'string' && typeof entry.agentId === 'string'
			? [{ key: entry.key, agentId: entry.agentId, result: entry.result }]
			: [];
	}),
	linesOfAnswer = ({ answer, run, agents, root }) => {
		const agent = agents.find((one) => one.agentId === answer.agentId),
			head = { at: agent?.at ?? '', run, key: answer.key, agent: answer.agentId };

		if (agent === undefined) {
			throw faultOf({ head, said: 'no meta file states the agent type' });
		}
		const build = BUILDERS[agent.agentType];

		if (build === undefined) {
			throw faultOf({ head, said: `the agent type "${agent.agentType}" is not one the record holds` });
		}
		return build({ head, result: answer.result, root });
	},
	stoodKeysOf = ({ held, run }) =>
		new Set(held.flatMap((line) => 'key' in line && line.run === run ? [line.key] : []));

/**
 * The lines one journal adds to the artefact of a run.
 *
 * The caller reads the files and the clock, and this function reads neither.
 * `agents` carries what `agent-<id>.meta.json` states and the ISO timestamp of
 * the LAST line of the transcript of that agent, and `run` is the run id the
 * transcript directory is named by.
 *
 * A journal line whose `(run, key)` already stands in `held` answers nothing, so
 * the caller appends what it gets at every poll and the artefact holds each
 * record one time. A line the reader cannot parse is passed over, because the
 * journal is appended to while it is read.
 *
 * `agentType` is copied from the meta file. `kind` is copied for a worker and a
 * gate, and this function SETS it for a check, because one check reply becomes
 * one line for each claim and one `planFaults` line, all under one key. An agent
 * type the record does not hold, and a payload that does not fit the event,
 * refuse the whole append and name the run, the key and the agent.
 *
 * A `filesWritten` entry under `root` is written relative to it, because a
 * worker reports the absolute path its own shell saw.
 */
export const progressLinesOf = ({ journalText, run, agents, root, held }) => {
	const stood = stoodKeysOf({ held, run });

	return answersOf(journalText)
		.filter((answer) => !stood.has(answer.key))
		.flatMap((answer) => linesOfAnswer({ answer, run, agents, root }));
};
