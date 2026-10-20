import { completedStepsOf } from './completed-steps-of.js';

const ANSWERS = ['held', 'notHeld', 'notProvable'],
	DATE_LENGTH = 10,
	dateOf = (at) => at.slice(0, DATE_LENGTH),
	lastWorkerOf = ({ lines, step }) => lines
		.flatMap((line, index) => line.agentType === 'workflow-worker' && line.step === step ? [{ index, line }] : [])
		.at(-1) ?? null,
	lastClaimOf = ({ lines, step }) => lines
		.flatMap((line) => line.agentType === 'workflow-check' && line.step === step && line.event.kind === 'claim'
			? [line.event]
			: []).at(-1) ?? null,
	lastFaultsOf = (lines) => lines
		.flatMap((line) => line.agentType === 'workflow-check' && line.event.kind === 'planFaults'
			? [{ run: line.run, event: line.event }]
			: []).at(-1) ?? null,
	sentOf = ({ lines, step }) => lines
		.flatMap((line) => line.event.kind === 'runStarted' && line.event.groups.some((group) => group.steps.includes(step))
			? [{ run: line.run, at: line.at }]
			: []).at(-1) ?? null,
	groupInRunOf = ({ lines, run, step }) => lines
		.flatMap((line) => line.run === run && line.event.kind === 'runStarted' ? [line.event.groups] : [])
		.at(-1)
		?.find((group) => group.steps.includes(step))?.name ?? null,
	gatePartOf = ({ lines, step, worker }) => {
		const group = groupInRunOf({ lines, run: worker.run, step }),
			verdict = lines.flatMap((line) => line.agentType === 'workflow-gate'
				&& line.run === worker.run
				&& line.group === group
				? [line.event.green]
				: []).at(-1),
			named = group === null ? 'gate' : `gate ${group}`;

		if (verdict === undefined) {
			return `${named}: no verdict yet`;
		}
		return `${named} ${verdict ? 'green' : 'red'}`;
	},
	checkPartOf = (claim) => {
		if (claim === null) {
			return [];
		}
		return [`check ${claim.answer}${claim.repair === undefined ? '' : ` (${claim.repair})`}`];
	},
	lastAtOf = ({ lines, step }) => lines
		.flatMap((line) => 'step' in line && line.step === step ? [line.at] : [])
		.at(-1) ?? sentOf({ lines, step })?.at ?? '',
	headingOf = ({ steps, step, at }) => {
		const title = steps.find((one) => one.step === step)?.title ?? '';

		return `### Step ${step} — ${title === '' ? '' : `${title} `}(${dateOf(at)})`;
	},
	filesLineOf = (worker) => worker.event.filesWritten.length === 0
		? []
		: [`**Files**: ${worker.event.filesWritten.map((path) => `\`${path}\``).join(', ')}`],
	evidenceLinesOf = (claim) => {
		if (claim === null || claim.answer === 'held') {
			return [];
		}
		return [
			`**Check**: ${claim.evidence}`,
			...claim.inspect === undefined ? [] : [`**See it**: ${claim.inspect}`]
		];
	},
	answeredLinesOf = ({ lines, step, worker, complete }) => {
		const claim = lastClaimOf({ lines, step });

		return [
			[
				complete ? '**Done**' : '**Not done**',
				gatePartOf({ lines, step, worker }),
				...checkPartOf(claim)
			].join(' · '),
			`- ${worker.event.summary}`,
			...filesLineOf(worker),
			...evidenceLinesOf(claim)
		];
	},
	silentLineOf = ({ lines, step }) => {
		const sent = sentOf({ lines, step });

		return sent === null
			? '**Not done** — no run has sent it.'
			: `**Not done** — sent in ${sent.run} and answered nothing.`;
	},
	stepBlockOf = ({ lines, steps, step, complete }) => {
		const worker = lastWorkerOf({ lines, step });

		return [
			headingOf({ steps, step, at: lastAtOf({ lines, step }) }),
			...worker === null
				? [silentLineOf({ lines, step })]
				: answeredLinesOf({ lines, step, worker: worker.line, complete })
		].join('\n');
	},
	groupBlockOf = ({ lines, steps, group, complete }) => [
		`Group ${group.name}`,
		group.steps
			.map((step) => stepBlockOf({ lines, steps, step, complete: complete.includes(step) }))
			.join('\n\n')
	].join('\n'),
	claimsBlockOf = (lines) => {
		const claims = [...new Set(lines.flatMap((line) => line.agentType === 'workflow-check' && line.step !== undefined
			? [line.step]
			: []))].flatMap((step) => lastClaimOf({ lines, step }) ?? []);

		if (claims.length === 0) {
			return [];
		}
		return [`Claims: ${ANSWERS.map((answer) => `${claims.filter((claim) => claim.answer === answer).length} ${answer}`).join(', ')}`];
	},
	faultLineOf = ({ fault, steps }) =>
		`- ${fault}${steps === undefined || steps.length === 0 ? '' : ` (${steps.join(', ')})`}`,
	faultsBlockOf = (lines) => {
		const found = lastFaultsOf(lines);

		if (found === null || found.event.faults.length === 0) {
			return [];
		}
		return [[
			`Plan faults, as the check of ${found.run} found them:`,
			...found.event.faults.map(faultLineOf)
		].join('\n')];
	};

/**
 * The human-readable report of one progress artefact.
 *
 * The status of each step comes from the artefact alone, and the completeness
 * rule of `completedStepsOf` is the one that answers `Done`. The report and the
 * generator therefore agree about what the next run sends.
 *
 * The title of a step comes from the plan by number, and a step the plan states
 * no heading for shows its number alone. The full step set and the grouping
 * come from the plan sidecar, so a group that no later run sent again keeps its
 * place and its steps.
 *
 * Every figure is composed from the lines the report counted, and the function
 * reads no file.
 */
export const progressReportOf = ({ planPath, lines, steps, groups }) => {
	const all = groups.flatMap((group) => group.steps),
		complete = completedStepsOf(lines).filter((step) => all.includes(step)),
		sends = all.filter((step) => !complete.includes(step));

	return [
		`${planPath} — ${complete.length} of ${all.length} steps complete`,
		...groups.map((group) => groupBlockOf({ lines, steps, group, complete })),
		...claimsBlockOf(lines),
		...faultsBlockOf(lines),
		`The next run sends: ${sends.length === 0 ? 'nothing' : sends.join(', ')}`
	].join('\n\n');
};
