/**
 * The JavaScript text that every generated workflow script carries: the count of
 * attempts, the wrapper that starts a dead agent again, the four answer schemas
 * and the two prompt builders.
 *
 * A generated script writes the `meta` literal, the run data and the loop around
 * this text. Both builders take one object, and the caller states the plan
 * path, the NAME of the goal a gate runs and the role of each agent, so this text
 * holds no data of a run and no rule of a role.
 *
 * A schema is a BUILDER and not a literal, because a field a machine acts on is
 * an enum. This text states the keyword and the caller states the values, so an
 * agent answers a step number, a group name and a repair word the script already
 * knows. Every enum states `type: "string"` beside it, because a step number such
 * as `1.2` is read as a number where no type is stated, and the answer is then
 * refused. No schema states `oneOf`: each one is flat.
 *
 * The prompt of a gate carries a goal NAME and no command. The definition of the
 * role holds the one shape that runs a goal, so the invocation is stated in one
 * place.
 */
export const scriptPreamble = `const ATTEMPTS = 4;

const persistently = async function (make, label) {
  let attempt = 0;

  while (attempt < ATTEMPTS) {
    const answer = await make(attempt);

    if (answer) {
      return answer;
    }
    attempt += 1;
    log(\`\${label}: attempt \${attempt} answered nothing. Starting it again.\`);
  }
  log(
    \`\${label}: \${ATTEMPTS} attempts answered nothing. The run reports it and goes on.\`,
  );
  return null;
};

const STEP_SCHEMA = function ({ step }) {
  return {
    type: "object",
    required: ["kind", "step", "status", "summary", "filesWritten"],
    properties: {
      kind: { type: "string", enum: ["step"] },
      step: { type: "string", enum: [step] },
      status: {
        type: "string",
        enum: [
          "done",
          "doneWithDeviation",
          "notDone",
          "noTaskBody",
          "noFilesNamed",
        ],
      },
      summary: { type: "string" },
      filesWritten: { type: "array", items: { type: "string" } },
      deviation: { type: "string" },
      blocker: { type: "string" },
      decisionForLaterSteps: { type: "string" },
      carryForwardDefect: { type: "string" },
    },
  };
};

const GATE_SCHEMA = function ({ group, steps }) {
  return {
    type: "object",
    required: ["kind", "group", "green", "needsRework", "blocked", "summary"],
    properties: {
      kind: { type: "string", enum: ["gate"] },
      group: { type: "string", enum: [group] },
      green: { type: "boolean" },
      needsRework: {
        type: "array",
        items: {
          type: "object",
          required: ["step", "said"],
          properties: {
            step: { type: "string", enum: steps },
            said: { type: "string" },
          },
        },
      },
      blocked: { type: "string" },
      summary: { type: "string" },
    },
  };
};

const BARRIER_SCHEMA = function ({ group, steps }) {
  const gate = GATE_SCHEMA({ group, steps });

  return {
    type: gate.type,
    required: [...gate.required, "statusAnswer"],
    properties: {
      ...gate.properties,
      kind: { type: "string", enum: ["barrier"] },
      statusAnswer: { type: "string" },
    },
  };
};

const CHECK_SCHEMA = function ({ steps }) {
  return {
    type: "object",
    required: ["claims", "planFaults"],
    properties: {
      claims: {
        type: "array",
        items: {
          type: "object",
          required: ["step", "claim", "answer", "evidence"],
          properties: {
            step: { type: "string", enum: steps },
            claim: { type: "string" },
            answer: {
              type: "string",
              enum: ["held", "notHeld", "notProvable"],
            },
            repair: {
              type: "string",
              enum: [
                "resendStep",
                "needsAssertion",
                "needsNewStep",
                "planDisagreement",
              ],
            },
            evidence: { type: "string" },
            inspect: { type: "string" },
          },
        },
      },
      planFaults: {
        type: "array",
        items: {
          type: "object",
          required: ["fault"],
          properties: {
            fault: { type: "string" },
            steps: {
              type: "array",
              items: { type: "string", enum: steps },
            },
          },
        },
      },
    },
  };
};

const stepPrompt = function ({ step, planPath, attempt }) {
  const siblings =
    (step.writtenAlsoBy || []).join(", ") || "no other step of this group";
  const restart =
    attempt > 0
      ? \`\\n\\nThis is attempt \${attempt + 1}. The agent before you answered nothing.\`
      : "";

  return \`Carry out this task.\${restart}

--- THE TASK ---
\${step.body}
--- END OF THE TASK ---

Source: \${step.step} of \${planPath}, at lines \${step.from} to \${step.to}.

The other steps of this group write these files: \${siblings}.\`;
};

const gatePrompt = function ({ goal, planPath, sent, answers }) {
  return \`Prove the merged tree and answer a verdict on it.

The name of the goal to run: \${goal}
Plan file: \${planPath}
The steps that were SENT: \${sent.join(", ")}
The report of each step that is not done, and of each step that states a blocker:

\${JSON.stringify(answers.filter(Boolean), null, 2)}\`;
};
`;
