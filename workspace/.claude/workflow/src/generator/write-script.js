import { basename } from 'node:path';

import { readStepFiles } from './read-step-files.js';
import { scriptPreamble } from './script-preamble.js';

const barrierBox = 'Barrier',

	checkBox = 'Check',

	leadingBox = 'Leading gate',

	leadingGroup = 'leading',

	filesOfBody = (body) => {
		const answer = readStepFiles(body);

		return 'absentHeadings' in answer ? [] : answer.files;
	},

	stepDataOf = (step) => ({
		step: step.step,
		body: step.body,
		from: step.from,
		to: step.to,
		files: filesOfBody(step.body),
		writtenAlsoBy: [...new Set(step.writtenAlsoBy.flatMap((one) => one.files))]
	}),

	groupDataOf = (group) => ({
		name: group.name,
		stages: group.stages.map((stage) => stage.map(stepDataOf))
	}),

	gateBoxesOf = ({ group, last }) =>
		(last ? [] : [{ title: `Gate ${group.name}`, detail: `the merged tree of group ${group.name}, alone` }]),

	leadingBoxesOf = (shape) => (shape.restart
		? [{ title: leadingBox, detail: 'the tree the stopped run left behind, before any step of this run' }]
		: []),

	phasesOf = (shape) => [
		...leadingBoxesOf(shape),
		...shape.groups.flatMap((group, at) => [
			{ title: `Implement ${group.name}`, detail: `the steps of group ${group.name}` },
			...gateBoxesOf({ group, last: at === shape.groups.length - 1 })
		]),
		{ title: barrierBox, detail: 'run the final gate once over the merged tree, and the progress of the last group' },
		{ title: checkBox, detail: 'the claim of each step the run sent, read against the tree' }
	],

	metaOf = ({ shape, planPath }) => JSON.stringify({
		name: basename(planPath, '.md'),
		description: `The groups of ${planPath}, with a gate between two of them, then the barrier and the check.`,
		phases: phasesOf(shape)
	}, null, 2),

	runBody = `const SERIAL_GOAL = "workflow-serial-gate";

const BARRIER_GOAL = "workflow-final-gate";

const REWORK_ROUNDS = 3;

const report = [];

const closed = [];

const stepsOf = function (groups) {
  return groups.flatMap((group) => group.stages.flat().map((one) => one.step));
};

const ALL_STEPS = stepsOf(GROUPS);

const BARRIER_GROUP =
  GROUPS.length === 0 ? LEADING_GROUP : GROUPS[GROUPS.length - 1].name;

const statesText = function (text) {
  return typeof text === "string" && text !== "" && text !== "none";
};

const statesBlocker = function (answer) {
  return statesText(answer.blocker);
};

const recordsOf = function (answers) {
  return answers
    .filter(Boolean)
    .filter((one) => one.status !== "done" || statesBlocker(one));
};

const statusLinesOf = function ({ sent, answers }) {
  const answered = answers.filter(Boolean);

  return sent
    .map((step) => {
      const one = answered.find((answer) => answer.step === step);

      return one === undefined
        ? \`\${step}: answered nothing\`
        : \`\${step}: \${one.status} — \${one.summary}\`;
    })
    .join("\\n");
};

const filesTableOf = function (steps) {
  return steps
    .map((one) => \`\${one.step}: \${one.files.join(", ") || "no file named"}\`)
    .join("\\n");
};

const detailOf = function ({ steps, sent, answers }) {
  return \`\\n\\nThe files each step owns:\\n\${filesTableOf(steps)}\\n\\nThe status of each step that was sent:\\n\${statusLinesOf({ sent, answers })}\`;
};

const sendStep = function ({ step, box, gateSaid }) {
  const rework = gateSaid
    ? \`\\n\\nThis is a RESTART of the step. The gate of this group sent it back and said:\\n\\n\${gateSaid}\`
    : "";

  return persistently(
    (attempt) =>
      agent(stepPrompt({ step, planPath: PLAN_PATH, attempt }) + rework, {
        label: \`step:\${step.step}\`,
        phase: box,
        agentType: "workflow-worker",
        schema: STEP_SCHEMA({ step: step.step }),
      }),
    \`step:\${step.step}\`,
  );
};

const sendGate = function ({ group, box, sent, answers, round, sentSoFar }) {
  const again =
    round === 0
      ? ""
      : \`\\n\\nThis is rework round \${round} of this group. Record the progress of this round alone.\`;

  return persistently(
    () =>
      agent(
        gatePrompt({
          goal: SERIAL_GOAL,
          planPath: PLAN_PATH,
          sent,
          answers: recordsOf(answers),
        }) +
          detailOf({ steps: group.stages.flat(), sent, answers }) +
          again,
        {
          label: \`gate:\${group.name}\`,
          phase: box,
          agentType: "workflow-gate",
          schema: GATE_SCHEMA({ group: group.name, steps: sentSoFar }),
        },
      ),
    \`gate:\${group.name}\`,
  );
};

const reworkOf = function ({ gate, steps }) {
  const items = gate.needsRework || [],
    matched = [],
    unmatched = [];

  for (const item of items) {
    const step = steps.find((one) => one.step === item.step);

    if (step === undefined) {
      unmatched.push(item.step);
    } else if (matched.some((one) => one.step === step) === false) {
      matched.push({ step, said: item.said });
    }
  }
  return { matched, unmatched };
};

const reachesBack = function (gate) {
  return (gate.needsRework || [])
    .filter((item) => closed.some((step) => step.step === item.step))
    .map((item) => item.step);
};

const recordRework = function ({ answers, step, answer }) {
  const at = answers.findIndex((one) => one && one.step === step.step);

  if (answer === null) {
    return;
  }
  if (at < 0) {
    answers.push(answer);
    return;
  }
  answers[at] = answer;
};

const haltOf = function ({ gate, steps, round }) {
  if (gate === null) {
    return \`the gate answered nothing, so the tree of this group is not proved\`;
  }
  if (gate.green === true) {
    return null;
  }
  const behind = reachesBack(gate);

  if (behind.length > 0) {
    return \`the gate named a step of a group that is closed: \${behind.join(", ")}\`;
  }
  const { matched, unmatched } = reworkOf({ gate, steps });

  if (unmatched.length > 0) {
    return \`the gate named what no step of this group holds: \${unmatched.join(", ")}\`;
  }
  if (matched.length === 0) {
    return statesText(gate.blocked)
      ? \`the gate is red and named no step to send back: \${gate.blocked}\`
      : "the gate is red and named neither a step nor a blocker";
  }
  if (round === REWORK_ROUNDS) {
    return \`the tree is red after \${REWORK_ROUNDS} rework rounds\`;
  }
  return null;
};

const runGroup = async function ({ group, gated, sentSoFar }) {
  const box = \`Implement \${group.name}\`,
    gating = \`Gate \${group.name}\`,
    steps = group.stages.flat(),
    sent = steps.map((one) => one.step),
    answers = [];

  phase(box);
  log(
    \`Group \${group.name}: \${group.stages.length} stage(s) and \${sent.length} step(s).\`,
  );

  for (const stage of group.stages) {
    const stageAnswers = await parallel(
      stage.map((step) => () => sendStep({ step, box })),
    );

    answers.push(...stageAnswers);
  }

  if (gated === false) {
    return { group: group.name, sent, answers, gate: null, halt: null };
  }
  phase(gating);

  let round = 0,
    gate = await sendGate({ group, box: gating, sent, answers, round, sentSoFar }),
    halt = haltOf({ gate, steps, round });

  while (halt === null && gate.green !== true) {
    const { matched } = reworkOf({ gate, steps });

    round += 1;
    phase(box);
    log(
      \`Group \${group.name}: rework round \${round} sends \${matched.length} step(s) back, one at a time.\`,
    );
    for (const { step, said } of matched) {
      const answer = await sendStep({ step, box, gateSaid: said });

      recordRework({ answers, step, answer });
    }
    phase(gating);
    gate = await sendGate({ group, box: gating, sent, answers, round, sentSoFar });
    halt = haltOf({ gate, steps, round });
  }
  return { group: group.name, sent, answers, gate, halt };
};

const checkPrompt = function ({ planPath, sent, answers, steps }) {
  const answered = answers.filter(Boolean),
    silent = sent.filter(
      (name) => answered.some((one) => one.step === name) === false,
    );

  return \`Answer for the claim of each step this run sent.

Plan file: \${planPath}
The steps that were SENT: \${sent.join(", ")}
The steps that answered nothing, and that you must answer for: \${silent.join(", ") || "none"}\${detailOf({ steps, sent, answers })}

The report of each step that is not done, and of each step that states a blocker:

\${JSON.stringify(recordsOf(answers), null, 2)}\`;
};

const barrierAnswerOf = function (entry) {
  if (entry.gate === null) {
    return {
      group: entry.group,
      sent: entry.sent,
      steps: recordsOf(entry.answers),
    };
  }
  return { group: entry.group, sent: entry.sent, gate: entry.gate };
};

const sendLeadingGate = function () {
  return persistently(
    () =>
      agent(
        gatePrompt({
          goal: SERIAL_GOAL,
          planPath: PLAN_PATH,
          sent: [],
          answers: [],
        }) +
          "\\n\\nThis run is a RESTART, and no step of this run ran before you. Prove the tree the stopped run left behind, and record no step as done.",
        {
          label: "leading-gate",
          phase: LEADING_BOX,
          agentType: "workflow-gate",
          schema: GATE_SCHEMA({ group: LEADING_GROUP, steps: ALL_STEPS }),
        },
      ),
    "leading-gate",
  );
};

const leadingHaltOf = function (gate) {
  if (gate === null) {
    return "the leading gate answered nothing, so the tree of the stopped run is not proved";
  }
  if (gate.green === true) {
    return null;
  }
  return \`the leading gate is red: \${gate.summary}\`;
};

if (LEFT_OUT.length > 0) {
  log(
    \`This run left out \${LEFT_OUT.length} step(s): \${LEFT_OUT.map(
      (one) => \`\${one.step} of group \${one.group}, \${one.reason}\`,
    ).join("; ")}.\`,
  );
}

if (RESTART === true) {
  phase(LEADING_BOX);

  const leadingHalt = leadingHaltOf(await sendLeadingGate());

  if (leadingHalt !== null) {
    log(
      \`HALT before the first group: \${leadingHalt}. No group starts and the barrier does not run.\`,
    );
    return { report, halted: leadingHalt };
  }
}

for (const [at, group] of GROUPS.entries()) {
  const entry = await runGroup({
    group,
    gated: at < GROUPS.length - 1,
    sentSoFar: stepsOf(GROUPS.slice(0, at + 1)),
  });

  report.push(entry);

  if (entry.halt !== null) {
    log(
      \`HALT at group \${entry.group}: \${entry.halt}. No later group starts and the barrier does not run.\`,
    );
    return { report, halted: entry.halt };
  }
  closed.push(...group.stages.flat());
}

phase(BARRIER_BOX);

const barrier = await persistently(
  () =>
    agent(
      gatePrompt({
        goal: BARRIER_GOAL,
        planPath: PLAN_PATH,
        sent: report.flatMap((one) => one.sent),
        answers: report.map(barrierAnswerOf),
      }) +
        detailOf({
          steps: GROUPS.flatMap((group) => group.stages.flat()),
          sent: report.flatMap((one) => one.sent),
          answers: report.flatMap((one) => one.answers),
        }),
      {
        label: "barrier",
        phase: BARRIER_BOX,
        agentType: "workflow-gate",
        schema: BARRIER_SCHEMA({ group: BARRIER_GROUP, steps: ALL_STEPS }),
      },
    ),
  "barrier",
);

if (barrier !== null && barrier.green === false && statesText(barrier.blocked)) {
  log(
    \`HALT at the barrier: \${barrier.blocked}. The check does not run, because the merged tree is not proved.\`,
  );
  return { report, barrier, halted: barrier.blocked };
}

phase(CHECK_BOX);

const check = await persistently(
  () =>
    agent(
      checkPrompt({
        planPath: PLAN_PATH,
        sent: report.flatMap((one) => one.sent),
        answers: report.flatMap((one) => one.answers),
        steps: GROUPS.flatMap((group) => group.stages.flat()),
      }),
      {
        label: "check",
        phase: CHECK_BOX,
        agentType: "workflow-check",
        schema: CHECK_SCHEMA({ steps: ALL_STEPS }),
      },
    ),
  "check",
);

return { report, barrier, check };
`;

/**
 * The whole text of the workflow script one run shape asks for.
 *
 * The text carries its own data, so the script reads no argument and one plan
 * answers the same bytes every time. `meta` is a pure literal that names one
 * progress box for each group, one for the gate between two groups, the barrier
 * and the check: a box a run shares says nothing about where the run is.
 *
 * The barrier IS the gate of the last group, so N groups carry N-1 serial gates
 * and the barrier prompt carries the steps that group sent and the report of
 * each of them.
 *
 * A gate prompt carries the NAME of the goal of its position and no command: the
 * generator knows where each gate sits, so it derives the name, and the
 * definition of the gate role holds the one shape that runs a goal.
 *
 * The check runs last and alone, after the barrier proved the tree. Its prompt
 * carries the plan file, every step the run sent, and the name of each step that
 * answered nothing. A run that halts before the barrier runs no check, and neither
 * does a run whose barrier is red and names a blocker: the final gate did not
 * prove the merged tree, so the check could only answer that it cannot prove a
 * claim.
 *
 * Each agent answers a schema this file fills. A worker gets its own step number
 * as a one-value enum, a gate gets its own group name, and the rework enum of a
 * gate holds every step the run SENT SO FAR. A gate that finds the fault in a
 * closed group must be able to name it, because the run halts on exactly that.
 * The leading gate of a restart takes the whole run shape, because nothing was
 * sent before it and an empty enum matches nothing.
 *
 * A gate prompt and the check prompt carry the files each step owns, one status
 * line for each step that was sent, and the whole record of a step that is not
 * done and of a step that states a blocker. A done step with no blocker carries
 * no record: its status line says what a reader needs.
 *
 * Nothing matches a path and nothing splits a word. A gate answers a step number
 * and what that step must repair, and each step it sends back reads the words
 * about ITSELF.
 *
 * A stage is one `parallel()` over a fixed array and the stages of a group run
 * in array order, with no gate between two of them. A chain that runs free would
 * invoke its steps in the order of the wall clock, and a resume of it reads a
 * different cache key for the same prompt.
 *
 * The steps a red gate names go back one at a time, because two steps one gate
 * names together are the two that can hold one file. The run halts where the
 * tree is still red, where the gate names what no step of the group holds, and
 * where the gate reaches back into a group that is closed. A gate that answers
 * red, names no step and states no blocker contradicts itself, and it halts the
 * run at once.
 *
 * A RESTART leads with one gate that takes no worker beside it, because that run
 * inherits a tree an earlier run wrote. A red leading gate halts the run, so no
 * worker builds on a red tree. A fresh run leads with no gate: it inherits
 * nothing. The barrier runs whatever ran before it, because it proves the whole
 * tree and not a group.
 *
 * The run writes one line that names each step the shape left out, the group of
 * it and the reason, before the first step starts.
 */
export const writeScript = ({ shape, planPath }) => [
	`export const meta = ${metaOf({ shape, planPath })};`,
	'',
	scriptPreamble,
	`const PLAN_PATH = ${JSON.stringify(planPath)};`,
	'',
	`const BARRIER_BOX = ${JSON.stringify(barrierBox)};`,
	'',
	`const CHECK_BOX = ${JSON.stringify(checkBox)};`,
	'',
	`const LEADING_BOX = ${JSON.stringify(leadingBox)};`,
	'',
	`const LEADING_GROUP = ${JSON.stringify(leadingGroup)};`,
	'',
	`const RESTART = ${JSON.stringify(shape.restart)};`,
	'',
	`const LEFT_OUT = ${JSON.stringify(shape.leftOut, null, 2)};`,
	'',
	`const GROUPS = ${JSON.stringify(shape.groups.map(groupDataOf), null, 2)};`,
	'',
	runBody
].join('\n');
