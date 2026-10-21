---
description: Validate a plan, generate its workflow script, run it with the Workflow tool, and watch and record the run
argument-hint: <plan path or name>
---

# Workflow — Run a Plan as a Multi-Agent Workflow

This command runs a plan through the `Workflow` tool. It states what a PERSON
decides: when a workflow is right, how the groups of a plan are shaped, how to
watch a run and how a resume behaves.

**It states no script.** The generator writes every script, and its tests prove
it. This command applies to the `Workflow` tool, not to a single `Agent`.

## Arguments

`$ARGUMENTS` — the plan to run. A path is used as given; a bare name means
`plans/<name>.md`. With no argument, ask which plan to run.

## When a workflow is right

A workflow is for work that is **already decomposed** into steps that name their
own files. It is fixed orchestration — groups and fan-out — around agents that
each do one thing.

- **It is not for exploring.** A step whose files are unknown cannot be bounded,
  and its worker will reach outside its lane.
- **A plan whose steps name no file is not ready.** The validator reports each
  such step. Complete the plan with `/plan-execution` first.
- **It is not for one agent.** One `Agent` call costs less and reports more.
- **The user must have opted in.** The `Workflow` tool description states what
  counts. A task that would only gain speed from parallel agents is not an
  opt-in.

---

## The generator writes the script

A plan has three files with one name: `plans/<plan>.md` (the prose),
`plans/<plan>.plan.json` (the groups and dependencies) and
`plans/<plan>.progress.jsonl` (the record of every run). Run every entry from the
project root:

```
node .claude/workflow/bin/validate-plan.js plans/<plan>.md
node .claude/workflow/bin/generate-workflow.js plans/<plan>.md
```

The validator reports every structural fault of the plan, including an absent
sidecar. It exits 0 and prints one line for a plan with no fault. The generator
runs the same check first, then writes the script beside the plan, as
`plans/<plan>.workflow.mjs`, and prints its path. Pass that path to the Workflow
tool as `scriptPath`. The script is in the workspace, so the tool can load it.
`.gitignore` names `*.workflow.mjs`, so **the script never enters the
repository.** A plan with a fault gets the faults and no script.

**The generator sends only the steps the progress file does not record as
complete**, and it writes the groups of THIS run beside the plan, to
`plans/<plan>.groups.json` (also git-ignored), which the first poll reads.

**Never write a script by hand.** The generator holds the retry wrapper, the
answer schemas, the stages of a group, the gate placement, the barrier, the check
agent and the restart. Run the generated script with the `Workflow` tool.

- `.claude/workflow/README.md` states the notation, the faults, the recording
  rules and a worked example.
- `/plan-execution` states the notation where a plan is written.
- **Where a plan needs a shape the notation cannot state, say so in the plan and
  stop.** The reader refuses an invented key. The README states how a new shape
  enters the notation.

---

## The roles

**Each role does the least that its position can prove.** A worker proves its
own files. A gate proves that the merged tree stayed consistent. The check agent
asks whether each claim of the run is true.

| The role        | Its `agentType`   | What it runs                                                          |
| :-------------- | :---------------- | :-------------------------------------------------------------------- |
| The worker      | `workflow-worker` | the test runner and `eslint` over its OWN files                       |
| The gate        | `workflow-gate`   | `make workflow-serial-gate`, or `make workflow-final-gate` at the end |
| The check agent | `workflow-check`  | nothing that writes; it reads the tree and the claims                 |

**One gate role holds two positions.** A serial gate runs between two groups; the
barrier runs once, after the last group. The prompt gives the gate the goal NAME,
and the gate definition holds the one way to run it, so no agent chooses a
command.

**The two make goals hold the whole method of a gate.** Read their prerequisites and recipes in
`makefile` to see what each one covers. Make them wider there, never in a plan.

**A worker owns the files it was given, not the state of the tree.** Whether the
tree is green is the gate's question, asked once over the merged result. That is
what makes a workflow fast.

**The Bash regulator enforces the boundaries.** `.claude/workflow/bin/regulate.js`
reads `agent_type` from the hook payload and refuses each role the commands it
may not run, whatever a prompt says. `/regulator --agent workflow-worker
<command>` traces one decision.

### The definitions

They live in `.claude/agents/`: `workflow-worker.md`, `workflow-gate.md` and
`workflow-check.md`.

- **A role rule is read from its definition**, and this document does not restate
  it. Correct the definition, and every later agent reads the correction.
- **A definition is read at session start.** A session that edits one cannot use
  the edit: start a new session. A wrong agent name fails loudly before the run
  starts anything.

---

## The groups are a judgement of the plan author

**A group exists so that the tree is green at its end.** It is the smallest set
of steps after which a gate can answer green, so the groups ARE the gate
placement.

- **A group may hold two steps that depend on each other.** A step that renames a
  function leaves the tree red, and the step that moves the callers closes it. No
  gate can answer green between the two, so both are in one group.
- **The stages of a group are derived from the dependencies** and never written.
  No gate runs between two stages.
- **Two steps run at one time only when neither waits for the other and they
  touch disjoint files.** When in doubt about a shared file, make the second step
  wait for the first.
- **No step names a make goal.** The gates run the two goals, and the gates are
  not steps. The validator refuses a step body that names a build command.

---

## Run it, and watch it

- **When the run starts, start a check that reports progress every 10 minutes**
  and says whether the run is blocked. The mechanism is `/loop 10m <what to
check>`.
- **Never a `sleep`.** The regulator refuses a long `sleep` and a loop that can
  end only on the clock.
- **The poll is one command; never write a script for it:**

  ```
  node .claude/workflow/bin/record-progress.js plans/<plan>.md <transcript directory>
  ```

  The transcript directory is
  `~/.claude/projects/<project>/subagents/workflows/wf_<id>`. One run of the
  entry appends to `plans/<plan>.progress.jsonl` every record the journal holds
  and the progress file does not, and prints the live state: the step the run
  reached, each live agent, and a stuck agent marked `STUCK` (exit 1).

- **The append is idempotent.** A second poll appends nothing, and a missed poll
  loses nothing. No agent of a run writes a record; the entry derives every line
  from what the agents answered.
- **At the end, state the outcome once**: `--ended completed`, `--ended halted` or
  `--ended stopped`, with `--said "<the reason>"` where there is one.
- **`node .claude/workflow/bin/show-progress.js plans/<plan>.md`** prints the
  status of the plan and writes nothing unless `--out <path>` names a file.
  `--lessons` prints what the runs learned: blockers, deviations, defects, gate
  summaries, claims that did not hold and plan faults.
- **Read the answers of a run through `show-progress.js --lessons`, never through a script.** 
  Record the run first, then print the lessons. The task
  output and `journal.jsonl` are raw; a script over them reads only the fields
  it names, and it misses a gate repair or a step that wrote outside its task.
- **A hung agent is not a dead agent.** The retry wrapper starts a dead agent
  again; an agent that stops writing keeps the run waiting. Stop the run, prove
  the tree by hand, and start the run again.
- **After the run completes, run
  `node .claude/workflow/bin/measure-run.js <transcript directory>` and report
  what it answers**: the wall clock, the time the model held, the time the tools
  held, the tool calls and the tokens, for each agent and in total. Propose
  optimisations from that report, never from a guess. A figure of it is a
  measurement of one machine at one moment, not a budget.

### Resuming

**A run that a person stops keeps only what the journal calls complete.**
`resumeFromRunId` serves a cached answer for an agent that finished, and runs a
failed agent and everything after it again. An agent still running when the run
stopped is not cached. Read `<transcript directory>/journal.jsonl` before you
plan a resume: it is the only record of which agent started, failed or
completed.

**The cache key is the prompt and the options, and nothing a prompt merely points
at.** An agent whose prompt did not change replays its old answer even when the
plan file changed. That is why the generator puts the whole task body inside the
prompt. A definition file is not part of the key either.

**A restart regenerates the script; nothing rests on the resume cache.** Run the
generator again over the plan. A restart leads with one gate that proves the tree
the stopped run left behind and records no step; a fresh run has no gate in front
of it.
