# The plan-to-workflow orchestrator

The orchestrator turns a written plan into a script for Claude Code's Workflow
tool, runs it with parallel workers and gates, and records what each run
answered, so a later run picks up where the last one stopped.

All paths below are relative to `workspace/`, the directory you start Claude
Code in. The full reference for the plan notation, the run shape, the answer
schemas and the fault list is
[workspace/.claude/workflow/README.md](workspace/.claude/workflow/README.md).
For the user flow, command by command, see [WORKFLOW.md](WORKFLOW.md).

## How the pieces fit

You describe a change in `plans/<name>.md`. `/impact-analysis` clarifies it with
you and writes the requirements and affected files into that file.
`/plan-execution` adds an implementation plan made of small steps, plus a
`plans/<name>.plan.json` sidecar that states the groups and dependencies of the
steps. `/execute` validates the plan, generates `plans/<name>.workflow.mjs`, and
runs it with the Workflow tool: `workflow-worker` agents carry out the steps of a
group in parallel, a `workflow-gate` agent runs a make goal over the merged tree
after each group, and a `workflow-check` agent finally tries to refute what each
step claimed. Each poll of the run appends what the agents answered to
`plans/<name>.progress.jsonl`, so a later run sends only the steps that are not
yet complete. Throughout, the regulator keeps every agent inside its role (see
[REGULATOR.md](REGULATOR.md#roles)).

The pieces:

- `.claude/commands/` — `impact-analysis.md`, `plan-execution.md`,
  `execute.md` (and `regulator.md`, see [REGULATOR.md](REGULATOR.md)).
- `.claude/agents/` — `workflow-worker.md`, `workflow-gate.md`,
  `workflow-check.md`.
- `.claude/workflow/bin/` and `.claude/workflow/src/generator/` — the plan
  validator, the generator and the progress tools.
- `makefile` — the two gate goals.
- `plans/` — the plans, their sidecars and their progress records.

## Prerequisites

- Claude Code with the Workflow tool enabled (`"enableWorkflows": true` in
  `.claude/settings.local.json`). `/execute` also uses `/loop` and the Cron
  tools, which the `permissions.allow` list already allows.
- The Workflow tool loads a script only from the working directory or an added
  directory. The generated script is written beside the plan, inside
  `workspace/`, so this holds when Claude Code starts in `workspace/`, as
  `make claude` does.
- `node_modules/.bin` on `$PATH`, because workers run `jest <files>` and
  `eslint <files>` bare. The container's `.bashrc` puts it there (see
  [CONTAINER.md](CONTAINER.md#what-bashrc-adds)).
- Agent definitions load at session start: start a new session after you copy
  or change them.

## The commands

`/impact-analysis`, `/plan-execution` and `/execute` are the user flow, in that
order; `/regulator` diagnoses a refused command. What each one asks, writes and
checks, how to watch and resume a run, and a worked example are in
[WORKFLOW.md](WORKFLOW.md).

## The bins

All in `.claude/workflow/bin/`. Run them from `workspace/`, because
`record-progress` writes paths relative to the current directory. Run any of
them with no arguments to print its usage.

| Bin                    | What it does                                                       |
| :--------------------- | :----------------------------------------------------------------- |
| `validate-plan.js`     | reports every structural fault of a plan                           |
| `generate-workflow.js` | writes the workflow script of a plan                               |
| `record-progress.js`   | appends a run's answers to the progress file, shows live state     |
| `show-progress.js`     | prints the status of a plan, or `--lessons` from its runs          |
| `measure-run.js`       | reports time, tool calls and tokens of a finished run              |
| `regulate.js`          | the `PreToolUse` Bash hook (see [REGULATOR.md](REGULATOR.md))      |
| `debug.js`             | traces how the regulator decides one command                       |
| `lint-edited-file.js`  | the `PostToolUse` lint hook (see [LINTER-HOOK.md](LINTER-HOOK.md)) |

Usage:

```sh
node .claude/workflow/bin/validate-plan.js plans/<name>.md
node .claude/workflow/bin/generate-workflow.js plans/<name>.md
node .claude/workflow/bin/record-progress.js plans/<name>.md <transcript directory> [--ended completed|halted|stopped] [--said "what a person saw"]
node .claude/workflow/bin/show-progress.js plans/<name>.md [--lessons] [--out <path>]
node .claude/workflow/bin/measure-run.js <transcript directory>
```

- `validate-plan.js` exits 0 and prints `plans/<name>.md: no fault`, or exits 1
  with one line for each fault. A missing sidecar is a fault.
- `generate-workflow.js` runs the same check first, then writes
  `plans/<name>.workflow.mjs` and `plans/<name>.groups.json` beside the plan
  and prints the script path. The script sends only the steps that the progress
  file does not record as complete.
- `record-progress.js` reads the transcript directory of a run
  (`~/.claude/projects/<project>/subagents/workflows/wf_<id>`), appends what is
  new to `plans/<name>.progress.jsonl` and prints the live state. It marks an
  agent whose transcript has not grown for ten minutes as `STUCK` and exits 1.
- `show-progress.js` prints where the plan stands; `--lessons` prints what the
  runs learned instead (blockers, deviations, defects, decisions, gate
  summaries, claims that did not hold).
- `measure-run.js` reports the wall clock, model and tool time, tool calls and
  tokens of a run, per agent and in total.

## Agents

- **`workflow-worker`** carries out one step of a group, beside its siblings.
  Its prompt carries the whole task body and the files it may write. It
  verifies only its own files (`jest <its test file>`, `eslint <its files>`),
  records no git state, and answers `done`, `doneWithDeviation` or `notDone`
  with a summary, the files written, and any deviation, blocker, decision for
  later steps or carry-forward defect.
- **`workflow-gate`** runs alone, after every worker of a group has finished. It
  runs the gate goal it is named over the merged tree and answers a verdict:
  green, steps that need rework, or blocked. It runs before a restarted group,
  between every two groups, and once at the barrier that ends the run.
- **`workflow-check`** runs last and alone. It tries to refute the claim of each
  step the run sent, checks that the step headings and the sidecar agree, and
  writes and repairs nothing.

The regulator holds each role to these limits; see
[REGULATOR.md](REGULATOR.md#roles).

## Gate goals

To reduce token cost, the workflow orchestrator does not generate a new workflow agent definition for each
gate. Instead, the variability between gate executions should be set in a deterministic makefile script. There
are two goals that you should modify as your project evolves:

- `workflow-serial-gate` — runs after each group except the last, and once
  before the first group when a stopped run resumes. This should normally run
  fast tests, such as unit tests, after each segment for quick feedback. In the
  example repository, it runs only tests for changed files using the jest
  `onlyChanged` option.
- `workflow-final-gate` — runs once, after the last group (the barrier). It
  should run all the tests, even slow ones. In a real project, the final gate
  would usually deploy to a staging environment and then run post-deployment
  tests. 

### What the gates are for

A worker proves only its own files: it runs `jest` and `eslint` on the files its
step names, and the regulator refuses it every make goal. Workers of one group
run side by side, so none of them sees the merged result. The gates are the only
place where the whole tree is proved:

- A **serial gate** proves the merged tree of one group before the next group
  starts. The next group never starts on a red tree.
- The **final gate** proves the whole tree once at the end. The check agent runs
  only after it is green.

When a gate is red, the gate agent fixes a small failure itself. Otherwise it
sends the steps that own the broken files back to their workers, for at most
three rework rounds. If it names no step, or the tree is still red after those
rounds, the run halts and no later group starts.

### When to change them

- **When you replace the sample application or change the stack.** The gates
  must prove what your project needs to be correct: a build, a type check,
  another test runner, other linters, a schema or contract check.
- **When the serial gate is too slow.** It runs after every group. Move slow
  suites (browser, integration, performance) to `workflow-final-gate`.
- **When a check must see the whole result.** A check that is only meaningful
  for the finished change, such as a full clean build or an end-to-end suite,
  belongs in `workflow-final-gate`.
- **When a gate fails on things no step can fix.** Flaky tests, network access
  or machine-specific state make a gate red for reasons a worker cannot repair,
  and the run halts. Make the gate deterministic, or take the check out of it.

To adapt them:

- keep the names, and make each goal exit non-zero when anything fails;
- put whatever proves your tree in the recipe: a build, a type check, another
  test runner, other linters;
- make `workflow-final-gate` the wider one (clean build, slow suites), and keep
  `workflow-serial-gate` fast;
- avoid deploys or anything that changes shared state.

The root `makefile` of this repository does not hold gate goals; it only runs
the workspace goals in the container.

## Progress and resume

Commit `plans/<name>.md`, `<name>.plan.json` and `<name>.progress.jsonl`
together. The progress file is the record: a clone without it repeats every step.

- No agent writes the record. Each agent answers a schema, and
  `record-progress.js` derives every line of the progress file from the
  answers. The file is append-only JSONL, and appending is safe to repeat: a line
  already recorded for a run is skipped, so a missed poll loses nothing.
- A step is complete when its last worker answer is `done` or
  `doneWithDeviation`, the gate of its group in that run is green, and no later
  check claim about it is `notHeld`.
- To resume, run `/execute <name>` again. The generator sends only the steps
  that are not complete, and when an earlier run already wrote to the tree, the
  script starts with a gate that proves the tree it left behind.
- A run you stop by hand is recorded with `--ended stopped`; a stuck agent
  (reported by `record-progress.js`) needs a person: stop the run, prove the
  tree by hand, and start it again.

The reading rules, the torn-line handling and the run shape are described in
[workspace/.claude/workflow/README.md](workspace/.claude/workflow/README.md).
