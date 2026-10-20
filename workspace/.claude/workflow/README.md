# The workflow tooling

This directory holds two tools that run inside Claude Code:

- the **regulator** (`bin/regulate.js`, `bin/debug.js`, `src/regulator/`), which decides
  whether a Bash command may run;
- the **workflow generator** (`bin/validate-plan.js`, `bin/generate-workflow.js`,
  `bin/record-progress.js`, `bin/show-progress.js`, `bin/measure-run.js`,
  `src/generator/`), which this document describes.

A plan states its execution structure as data, in a sidecar file beside it. The
generator reads that file and reports every structural fault of the plan, so a
fault is found before a workflow script is written and not after a worker starts
on a step. It then writes the workflow script of the plan, and it records what
each run of the plan answered.

`/plan-execution` writes a plan and its sidecar. `/execute` validates the plan,
generates the script, runs it and records the run with the entries below.

## The three files of a plan

A plan carries three files with one name. The name drops the `.md`, which is the
rule the script name also uses.

| The file                      | What it holds                                      | Who writes it                          |
| :---------------------------- | :------------------------------------------------- | :------------------------------------- |
| `plans/<plan>.md`             | the prose: the phases, the steps and the decisions | a person, with `/plan-execution`       |
| `plans/<plan>.plan.json`      | the groups and the dependencies of the run         | a person, with `/plan-execution`       |
| `plans/<plan>.progress.jsonl` | one line for each agent of each run                | `bin/record-progress.js`, and it alone |

**Commit all three.** A clone with no progress file repeats every step that
already landed, and a plan with no sidecar has no run shape. To rename a plan,
rename all three files.

## The entries

Run each entry from the project root (`workspace/`), because `record-progress` writes paths
relative to the current directory. No build goal wraps them. An entry that gets
no argument prints what it needs and exits non-zero.

- `node .claude/workflow/bin/validate-plan.js plans/<plan>.md` reports every
  structural fault of the plan. It exits 0 and prints `plans/<plan>.md: no fault`
  for a plan with no fault, and exits 1 with one line for each fault it found. An
  absent sidecar is a fault, reported with the path the entry looked for.
- `node .claude/workflow/bin/generate-workflow.js plans/<plan>.md` writes the
  workflow script of the plan and prints its path. It runs the check first, so a
  plan with a fault gets the faults and no script. The script is
  `plans/<plan>.workflow.mjs`, beside the plan. `.gitignore` names it, so it never
  enters the repository. It sends only the steps the progress file does not record
  as complete, and it writes the groups of THIS run beside the plan, to
  `plans/<plan>.groups.json`, which `.gitignore` also names.
- `node .claude/workflow/bin/record-progress.js plans/<plan>.md <transcript directory> [--ended completed|halted|stopped] [--said <text>]`
  appends what is new to the progress file and prints the live state of the run.
  The transcript directory is
  `~/.claude/projects/<project>/subagents/workflows/wf_<id>`. `/execute` runs
  it while the run goes on, and once at the end. `--ended` states the one fact
  the journal cannot hold, because the journal records agents and not runs.
- `node .claude/workflow/bin/show-progress.js plans/<plan>.md [--lessons] [--out <path>]`
  prints the human-readable status of the plan. It writes a file only when
  `--out` names one, because a status on disk is a copy that goes stale.
  `--lessons` prints what the runs LEARNED in place of where the plan stands:
  every blocker, deviation, defect and design decision a worker reported, every
  gate summary, every claim the check did not hold, every fault of the plan, and
  what a person said when they ended a run.
- `node .claude/workflow/bin/measure-run.js <transcript directory>` reports what a
  run COST: the wall clock, the time the model held, the time the tools held, the
  tool calls and the tokens, one line for each agent and one total. It writes
  nothing and refuses nothing.

  **A token count is read once for each REQUEST and never once for each line of a
  transcript.** A streamed reply writes the running totals of one request on many
  lines; adding every line overstates the count.

  **The time the model held is a PROXY.** It is the gap between the answer of a
  tool and the reply after it, so the queue and the scheduling of a request are
  inside it. It is consistent between the agents of one run, which makes two
  agents comparable, but it is not the cost of a model.

## The transient directory

The script and the groups file are not in the transient directory: they are
beside the plan. The transient directory holds the gate logs, the regulator
debug input and the scratch scripts an agent writes. It is `/tmp/claude-transient`
by default. Set `CLAUDE_TRANSIENT_DIR` to use another directory.

The regulator reads the variable through one module (`src/transient-dir.js`), so
the scripts it lets run and the files the agents write are in one place. Set the
variable for the whole Claude Code session, not for one command, or the readers
look in different places.

## What a run does

The generated script runs the groups of the plan in order:

1. **Leading gate** — only on a restart (an earlier run of the plan wrote to the
   tree). It proves the tree the stopped run left behind, before any step runs.
2. **Each group** — its steps run in stages; the steps of one stage run at the
   same time, one `workflow-worker` agent each.
3. **Serial gate** — after each group but the last, one `workflow-gate` agent
   runs the make goal `workflow-serial-gate` over the merged tree and answers a
   verdict. A red gate sends named steps back for rework, or halts the run.
4. **Barrier** — after the last group, one `workflow-gate` agent runs the final
   gate goal `workflow-final-gate` once over the merged tree. A red barrier that
   names a blocker halts the run.
5. **Check** — one `workflow-check` agent reads the claim of each step that the
   run sent against the tree, and reports the claims that do not hold and any
   fault of the plan.

A gate prompt carries the NAME of the goal and no command. The gate agent
definition holds the one way to run a goal, so the invocation is stated in one
place. The project makefile defines both goals. Both lint the whole project.
`workflow-serial-gate` then runs only the tests related to the files changed
since the last commit, so it stays fast between groups; `workflow-final-gate`
runs every test.

Each agent answers a JSON schema that the script builds:

- a worker: `kind`, `step`, `status` (`done`, `doneWithDeviation`, `notDone`,
  `noTaskBody`, `noFilesNamed`), `summary`, `filesWritten`, and optionally
  `deviation`, `blocker`, `decisionForLaterSteps`, `carryForwardDefect`;
- a gate: `kind`, `group`, `green`, `needsRework` (a list of `{ step, said }`),
  `blocked`, `summary`;
- the barrier: the gate fields, plus `statusAnswer`, the status line the final
  gate goal printed;
- the check: `claims` (each with `step`, `claim`, `answer` — `held`, `notHeld`,
  `notProvable` — `evidence`, and optionally `repair` and `inspect`) and
  `planFaults` (each with `fault` and optionally `steps`).

## Recording a run

**No agent of a run writes a record.** A worker, a gate and the check each answer
a schema, and `bin/record-progress.js` derives every line of the progress file
from what they answered.

The progress file is JSONL. It is never edited and never compacted; it is the
audit trail of the plan.

### The three reading rules

**Dedupe.** A journal line is skipped when its `(run, key)` is already in the
progress file. Appending is therefore safe to repeat at every poll, and a missed
poll loses nothing.

**Complete.** For step S, take its last `workflow-worker` line and read `run` from
it. In the `runStarted` line of THAT run, find the group that holds S. The step
is complete when that worker line says `done` or `doneWithDeviation`, the last
`workflow-gate` line of that run and that group says `green`, and no later
`workflow-check` claim about S says `notHeld`. Every clause reads the progress
file alone, so a step that landed under one group stays complete when the plan
moves it to another.

**Last wins.** For a step, for a group and for the run. An earlier line is never
edited and never removed, so a `notHeld` claim of the check un-marks the step and
the next run sends it again.

### A torn line

A process that dies mid-append leaves half a line. Three rules handle it with no
lock: one `appendFileSync` of one buffer per poll; a reader that skips a line it
cannot parse; and the dedupe on `(run, key)`, which appends again what was lost.

## Watching a run

`bin/record-progress.js` reports the two things a person needs while a run is
going, together, because a progress bar cannot tell them apart.

- **`journal.jsonl` states what STARTED, what ANSWERED and what DIED.** A
  `failed` line is a dead agent; the retry wrapper of the script starts it again
  on its own. The entry names it and exits 0.
- **The modification time of `agent-<id>.jsonl` states which agent is still
  WRITING.** An agent whose transcript has not grown for more than ten minutes is
  stuck: it holds the run and no wrapper catches it. Stop the run, prove the tree
  by hand and start it again. The entry marks the agent `STUCK` and exits 1, so a
  wait loop stops on the one state a person must act on.

## The notation

A plan writes the sidecar `plans/<plan>.plan.json` beside `plans/<plan>.md`. The
file holds ONE JSON object and nothing else. **The plan document states no
execution structure**: nothing reads a fenced block inside a document.

The object has two fields and no other key:

- **`groups`** is the run order. It is an array; each group has a `name` and the
  `steps` it holds. A step number is text, so `1.10` stays apart from `1.1`. Every
  step of the Implementation Plan section is in exactly one group, and a group
  runs only when every group above it is finished.
- **`dependencies`** is a map keyed by the step that WAITS. Its value lists every
  step that one waits for. A step that waits for nothing has no key, and a
  dependency never points at a step of a later group.

A field the sidecar leaves out is empty, and that is no fault.

The sidecar holds no file list, no gate and no barrier. The three file lists of a
step body (`**Files to create**`, `**Files to modify**`, `**Files to delete**`)
are the file boundary of the step. One gate runs at the end of each group and one
barrier runs after the last group, so the groups place them.

The stages of a group are derived and never written. The first stage is every
step of the group that waits for nothing inside the group; each later stage is
every step whose prerequisites inside the group are all in earlier stages. The
steps of one stage run at the same time.

## The worked example

The example below is the whole text of one sidecar, `plans/a-plan.plan.json`. No
test reads this document, so check it against
`tests/generator/read-execution-plan.test.js`, which states what the reader
accepts.

Group `A` runs first. Step `1.1` waits for nothing inside `A` and is the first
stage; steps `1.2` and `1.3` wait for `1.1` and form the second stage, and they
run at the same time. A gate runs at the end of `A`. Group `B` runs after that
gate: `2.1` waits for nothing inside `B`, and `2.2` waits only for `2.1`, because
the group above already satisfied its dependency on `1.3`. The barrier runs after
`B`, and the check after the barrier.

```json
{
  "groups": [
    { "name": "A", "steps": ["1.1", "1.2", "1.3"] },
    { "name": "B", "steps": ["2.1", "2.2"] }
  ],
  "dependencies": {
    "1.2": ["1.1"],
    "1.3": ["1.1"],
    "2.2": ["1.3", "2.1"]
  }
}
```

A step of `plans/a-plan.md` that this sidecar runs looks like this:

```markdown
#### Step 1.1: Greeting with a title

**Files to create**: `none`

**Files to modify**:

1. `src/format-greeting.js`
2. `tests/format-greeting.test.js`

**Files to delete**: `none`

- Write the failing test first: a title goes before the name.
```

Then:

```sh
node .claude/workflow/bin/validate-plan.js plans/a-plan.md
node .claude/workflow/bin/generate-workflow.js plans/a-plan.md
```

## What the check refuses

The reader refuses a sidecar that is absent, that is not JSON, whose value is
not a JSON object, or that has a key other than the two fields. Each refusal
names the path it looked for. The check then reports 11 faults:

1. a step that two groups hold
2. a dependency that names a step no group holds
3. a dependency that points at a step of a LATER group
4. a cycle in the dependencies
5. a step that the prose states and no group holds, or that a group holds and the
   prose has no step heading for
6. a stated step count that disagrees with the count of the step headings
7. a step body that names a `make` command, because a step of a plan runs no
   build tool (the gates do)
8. two steps of one stage of one group that write the same file
9. a step that names no file in its three file lists, or that has fewer than
   three file-list headings
10. a step body that names a LINE of a file an earlier step writes, because the
    line moves before this step reads it
11. a step number that is not digits and dots

A step that waits for a step of its own group is no fault: that is how two steps
inside a group are ordered, and the cycle check catches a loop.

**A step names a test by its NAME, never by its line.** A step that writes the
file it quotes is no fault, and neither is a writer that runs in a LATER group.

**Fault 11 is checked in three places, and each reports its own line**: a group
of the sidecar, the dependencies of the sidecar, and a step heading of the prose.
A letter inside a step number is otherwise silent: a reader that stops at the
letter reads a number no group holds (`Step 2a.1` reads as `2`), and a run sends
the step a second time.

## Extending the notation

The two fields are the whole notation. A model, an effort, a worktree flag, an
isolation flag and a per-gate command list are not in it, and the reader refuses
a sidecar that states one of them.

When a plan needs something the two fields cannot say, do this, in this order:

1. **Say so in the plan and stop.** Write what the plan must state and why the two
   fields cannot state it. Do not invent a key in one plan: the reader refuses it,
   and a shape that only one plan holds is a shape no program reads.
2. **Agree the shape with whoever maintains the notation.** One notation serves
   every plan, and each new key is a new way for two plans to disagree.
3. **Add the shape to the code, test first.** `src/generator/read-execution-plan.js`
   reads the sidecar and must let the new key through, and
   `src/generator/plan-checks.js` gets a check for each way the new shape can be
   wrong.
4. **Describe the shape here and in the `/plan-execution` command**, which is what
   an author reads while writing a plan. The reader refuses a key this document
   does not describe, so the code and the two documents change together.

## What the generator holds

- `src/generator/read-execution-plan.js` — one sidecar file, read whole
- `src/generator/read-plan-steps.js` — every step of the Implementation Plan
  section, with its number, its title, its body and its line range
- `src/generator/read-step-files.js` — the file boundary of one step: the union
  of its three file lists
- `src/generator/derive-stages.js` — the stages of one group, in run order
- `src/generator/validate-plan.js` — every structural fault of a plan
- `src/generator/plan-checks.js` — every check of a plan, as one array
- `src/generator/build-run-shape.js` — the groups and stages this run sends,
  without the steps already complete
- `src/generator/write-script.js` — the workflow script of one plan, as text
- `src/generator/script-preamble.js` — the answer schemas and the prompts of each
  role
- `src/generator/read-progress-lines.js` — the progress file as lines, skipping a
  line it cannot parse
- `src/generator/progress-lines-of.js` — a journal, the meta file of each agent
  and the last timestamp of each transcript, turned into the lines to append
- `src/generator/completed-steps-of.js` — the completeness rule, over the
  progress file alone
- `src/generator/progress-report-of.js` — the human-readable status of one
  progress file
- `src/generator/run-progress-of.js` — the live state of one journal and the
  transcripts beside it
- `src/generator/label-of-agent.js` — what one agent is doing, from the head of
  its transcript
- `src/generator/lesson-lines.js` — every lesson the progress file holds
- `src/generator/agent-timing-of.js` — the cost of one agent, from its transcript
- `src/generator/run-timing-lines.js` — the report of what a run cost
- `tests/generator/` — one test file for each module, and one integration test
  for each entry
