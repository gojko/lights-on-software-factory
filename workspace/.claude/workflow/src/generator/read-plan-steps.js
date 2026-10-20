const PLAN_SECTION = /^##\s+Implementation Plan\s*$/u,
	SECTION_HEADING = /^##\s/u,
	HEADING = /^#{1,6}\s/u,
	SEPARATOR = /^-{3,}\s*$/u,
	FENCE = /^\s*```/u,
	STEP_HEADING = /^#{1,6}\s+Step\s+(\d[\w.]*)\s*:\s*(.+?)\s*$/u,
	codeLineFlags = (lines) => {
		let open = false;

		return lines.map((line) => {
			if (FENCE.test(line)) {
				open = !open;
				return true;
			}
			return open;
		});
	},
	planSectionOf = ({ lines, code }) => {
		const start = lines.findIndex((line, index) => code[index] !== true && PLAN_SECTION.test(line));

		if (start === -1) {
			return null;
		}
		const after = lines.findIndex((line, index) => index > start && code[index] !== true && SECTION_HEADING.test(line));

		return { start, end: after === -1 ? lines.length : after };
	},
	headingPartsOf = (line) => {
		const parts = STEP_HEADING.exec(line);

		if (parts === null || parts[1] === undefined || parts[2] === undefined) {
			return null;
		}
		return { step: parts[1], title: parts[2] };
	},
	lastLineOf = ({ lines, code, heading, sectionEnd }) => {
		const boundary = lines.findIndex((line, index) =>
			index > heading && index < sectionEnd && code[index] !== true && (HEADING.test(line) || SEPARATOR.test(line)));

		return boundary === -1 ? sectionEnd : boundary;
	},
	bodyTextOf = (bodyLines) => {
		const first = bodyLines.findIndex((line) => line.trim() !== ''),
			last = bodyLines.findLastIndex((line) => line.trim() !== '');

		return first === -1 ? '' : bodyLines.slice(first, last + 1).join('\n');
	};

/**
 * Every step of the Implementation Plan section of a plan, in file order.
 *
 * A step starts at a heading of the form `Step <number>: <title>` and ends at
 * the line before the next heading, the next thematic break, or the end of the
 * section. The thematic break is a boundary because a plan writes one between
 * two steps, and it belongs to neither.
 *
 * A heading or a break inside a fenced code block is text of the step and not a
 * boundary, so a step that shows a plan or a script in an example keeps its
 * whole body.
 *
 * The number is read whole, so a step numbered `2a.1` answers `2a.1` and never
 * a shorter number. This reader does not judge the number it read: it must
 * start with a digit, and a plan validator refuses a number of a shape the
 * plan rules do not allow.
 *
 * A plan with no Implementation Plan section answers an empty array, and a step
 * that a later section states is not a step of the plan.
 */
export const readPlanSteps = (planText) => {
	const lines = planText.split('\n'),
		code = codeLineFlags(lines),
		section = planSectionOf({ lines, code });

	if (section === null) {
		return [];
	}
	return lines.flatMap((line, index) => {
		const parts = index > section.start && index < section.end && code[index] !== true ? headingPartsOf(line) : null;

		if (parts === null) {
			return [];
		}
		const to = lastLineOf({ lines, code, heading: index, sectionEnd: section.end });

		return [{ ...parts, body: bodyTextOf(lines.slice(index + 1, to)), from: index + 1, to }];
	});
};
