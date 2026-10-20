---
description: Diagnose why the Bash regulator allows, refuses or does not decide a command, and propose the smallest rule change with a test first
argument-hint: [--agent <role>] <bash command>
---

# Regulator — Diagnose a Bash Decision

Run a Bash command through the regulator's debug entry, explain how it is parsed
segment by segment, name the rule that decides it (or the absence of one), and
propose the smallest change, test first, that would give the wanted decision.

The regulator lives in `.claude/workflow/`: `bin/regulate.js` is the
`PreToolUse` hook, `bin/debug.js` traces one command, `src/regulator/rules.js`
holds the ordered rule list, and `src/regulator/rules/<id>.js` holds each rule
that needs more than a regular expression.

## Arguments

`$ARGUMENTS` — the full Bash command, exactly as it would run. Quotes, pipes,
redirects and `&&`/`;` chains are all welcome. With no argument, ask for the
command first.

**If an AGENT met the refusal, trace its role.** A rule may apply to some roles
only, and the workflow roles (`workflow-worker`, `workflow-gate`,
`workflow-check`) are refused things a session may run. Pass `--agent <role>`
before the command, or the trace answers for the session and not for the agent.
When the user says "the agent could not run X" and names no role, ask which role
first: the same command can answer `allow` for a session and `deny` for a
worker.

## Process

### Step 1: Run the debugger

Pass the command through a file, to avoid shell quoting:

1. Find the transient directory:
   `echo "${CLAUDE_TRANSIENT_DIR:-/tmp/claude-transient}"`, and create it with
   `mkdir -p` if it is absent.
2. Use the `Write` tool to put the command, verbatim, into
   `<transient directory>/regulator-input.txt`.
3. Run, from the project root, with a relative `node` path (the regulator
   refuses `node` with an absolute script path):

```
node .claude/workflow/bin/debug.js < "${CLAUDE_TRANSIENT_DIR:-/tmp/claude-transient}/regulator-input.txt"
node .claude/workflow/bin/debug.js --agent workflow-worker < "${CLAUDE_TRANSIENT_DIR:-/tmp/claude-transient}/regulator-input.txt"
```

The second line of the output names the role it traced and the rule count
(`role: workflow-worker (N rules)`), so a trace of the wrong role is visible.

### Step 2: Read the output

For each segment, `debug.js` prints the original text, the tokens (and the
unwrapped tokens where a wrapper such as `time`, `xargs` or `env` was removed),
then either `resolved by rule: <id> (n/N rules checked)` with
`decision: allow|ask|deny` and the reason, or `no rule matched` with
`decision: no-match`.

It ends with `merged decision: ...`. The precedence is
`deny > ask > allow > no-match`, and one `no-match` segment makes the whole
command `no-match`, so Claude Code shows its normal permission prompt. A command
the parser cannot read safely prints `parse: tooComplex` and the reason.

### Step 3: Classify the decision

| Merged decision | What it means                                                                                                                                                                                                                                        |
| :-------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allow`         | Already allowed. Say so and stop.                                                                                                                                                                                                                    |
| `deny`          | A rule forbids the command. Read its reason; it usually names the form to run instead (`npx jest` → bare `jest` from `$PATH`, `git push` → the user runs it). Do not propose loosening a deny rule unless the user asks.                             |
| `ask`           | A rule asks a person. Name the rule. If the user wants an allow, propose narrowing the ask rule or adding a more specific allow rule before it.                                                                                                      |
| `no-match`      | No rule covers a segment. Name the segment and the smallest extension: a command name in `allowCommands({ id: 'common-allowed-commands' })`, a subcommand in an existing allow regex (for example `git-readonly-subcommands`), or a new rule module. |
| `tooComplex`    | The parser could not read the command safely (an unbalanced quote, an unsupported heredoc, ...). Quote the reason, and explain that the regulator refuses what it cannot classify on purpose.                                                        |

**A `deny` by a rule of the ROLE.** Where the trace ran with `--agent` and the
rule id starts with `worker-`, `gate-`, `check-` or `workflow-`, the command is
forbidden to THAT role only. Report the reason, which names what the role runs
instead, and do not propose loosening the rule:

| Resolving rule                             | What it means                                                                                                                    |
| :----------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| `worker-make-*`                            | a worker runs no make goal; it runs its own tests and lint over its own files, and a gate proves the merged tree after the group |
| `worker-file-scoped-verification`          | a worker runs the test runner and eslint over named files, never over the whole project                                          |
| `worker-mutating-git`                      | a worker records no git state; `git rm` and `git mv` are allowed before it                                                       |
| `gate-goal-boundary` / `gate-mutating-git` | a gate runs only `workflow-` goals and changes no git state                                                                      |
| `check-goal-boundary`                      | the check agent runs no make goal                                                                                                |
| `workflow-agent-catch-all`                 | the last rule: nothing above allowed the command, so the agent reports a blocker that names it                                   |
| `long-sleep` / `bare-wait-loop`            | nobody sleeps a turn away: a foreground call with an explicit timeout where the call starts what it waits for, otherwise `/loop` |

**A workflow agent never gets `ask`.** The `regexAskRule` factory
(`src/regulator/regex-ask-rule.js`) turns an ask rule off for a workflow agent,
because a run is unattended and an `ask` would stall it. If a trace of a role
reports `ask`, the rule was built by hand and not through the factory; that is a
defect, and the repair is to build it through the factory.

### Step 4: Find the rule code

Open `.claude/workflow/src/regulator/rules.js` for the ordered list. Inline rules
(`regexAllowRule`, `allowCommands`, `regexAskRule`, `regexDenyRule`) are defined
there; a rule with token-position logic is in
`.claude/workflow/src/regulator/rules/<id>.js`.

- For a regex change, quote the current regex and the proposed one, and point at
  the difference.
- For a new `allowCommands` entry, name the `id:` block it goes into.
- For a new rule module, sketch the `{ id, decision, reason, matchSegment }`
  shape and say which rule it must come before or after. The order is policy:
  `.claude/workflow/tests/regulator/rules.test.js` enforces the order
  invariants.

### Step 5: Propose the change; do not apply it yet

Present:

1. **What happens** — one plain sentence per segment.
2. **Why it is not allowed** — the rule, or the absence of one.
3. **The smallest change** — the exact edit, with the file path.
4. **The test, written first** — the test file
   (`.claude/workflow/tests/regulator/regulate.test.js` for a whole-command
   case, `.claude/workflow/tests/regulator/rules/<id>.test.js` for one rule, or
   `.claude/workflow/tests/regulator/rules.test.js` for the order), the table or
   block it extends, and the new cases verbatim.
5. **The risk** — what else the change allows. Name one command the change
   deliberately includes and one it still excludes.

Then ask with AskUserQuestion:

- **Apply the change, test first** — the cycle below.
- **Do not apply** — diagnosis only.

### Step 6: Apply, test first

1. **RED**: add the test cases first and run the affected tests:
   `jest .claude/workflow/tests/regulator -t "<describe or test name>"`.
   Confirm that the new case fails with the decision you expect it to change.
2. **GREEN**: make the smallest edit to `rules.js` or the rule module.
3. Run the focused tests again, then the whole regulator suite:
   `jest .claude/workflow/tests/regulator`. If an order invariant of
   `rules.test.js` fails, fix the order of the rules, not the assertion.
4. `eslint` the files you changed.
5. Run `debug.js` on the original command again and confirm the new merged
   decision.

### Step 7: Report

In three to five lines: the rule file you edited, the test cases you added, the
regulator test count, and the new merged decision. Do not commit unless the user
asks.

## Rules

- **Never loosen a `deny` rule without an explicit request.** The default answer
  to a deny is the alternative its reason names, or "run it yourself".
- **Always run the debugger first.** Do not guess the parse or the decision.
- **Prefer the narrowest change**: a subcommand in an existing alternation before
  a new rule, an `allowCommands` entry before a bespoke allow rule, a bespoke
  rule before a parser change.
- **Pass the command on stdin**, not as arguments, to avoid quoting problems.
- **Run `node` with a relative path** from the project root.
- **The test comes first**, and the whole regulator suite passes before you
  report.
