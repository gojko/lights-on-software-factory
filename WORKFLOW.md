# Trivial planning/execution wokflow

This repository includes a trivial set of commands to support planning and execution of software implementation tasks. You should likely replace it with your own commands/flow.

The important aspect of this example flow is the planning format, as it allows the orchestrator to produce workflow scripts in a deterministic way, without spending LLM tokens. See [ORCHESTRATOR.md](ORCHESTRATOR.md) for more information.

Start Claude Code with `make claude` from the repository root; it starts in
`workspace/`, in the container (see [CONTAINER.md](CONTAINER.md)). Every path
below is relative to `workspace/`.

## Overview

With this workflow, any change to software goes through several stages for human review, where you can check the decisions Claude made in a
markdown plan file. This is intended for both human and agentic consumption, as a shared memory for work on a task, and as a record of what happened for the future.

```
  your idea
     │   write plans/<name>.md: a problem statement, and anti-goals if you have any
     ▼
  /impact-analysis <name>      asks you questions, appends "## Impact Analysis" to plans/<name>.md
     │
     ▼
  /plan-execution <name>       asks you to approve phases and groups,
     │                         appends "## Implementation Plan" to plans/<name>.md,
     │                         writes plans/<name>.plan.json, ends with validate-plan: no fault
     ▼
  /execute <name>             validate-plan, generate-workflow
     │                           → plans/<name>.workflow.mjs, plans/<name>.groups.json
     │                         runs the script with the Workflow tool
     │                           group A: workers ─► gate ─► group B: workers ─► … ─► barrier ─► check
     │                         polls with /loop 10m: record-progress
     │                           → appends to plans/<name>.progress.jsonl
     ▼
  finished run                 show-progress, measure-run; commit the plan files
```

A plan file should generally correspond to a larger change (epic/milestone level). You can use it for smaller changes as well, but the whole purpose of the factory setup is to allow you to run larger changes with confidence.

The files in `plans/`:

| File                    | Written by                                      | In git                                |
| :---------------------- | :---------------------------------------------- | :------------------------------------ |
| `<name>.md`             | you, then `/impact-analysis`, `/plan-execution` | yes, commit it                        |
| `<name>.plan.json`      | `/plan-execution`                               | yes, commit it                        |
| `<name>.progress.jsonl` | `record-progress.js` only                       | yes, commit it                        |
| `<name>.workflow.mjs`   | `generate-workflow.js`                          | no, `workspace/.gitignore` ignores it |
| `<name>.groups.json`    | `generate-workflow.js`                          | no, `workspace/.gitignore` ignores it |

Generally, you might want to commit the plan if working on it over a longer period of time. After it's implemented, you can throw it away or keep as a record. The sidecar and the progress file are generally just for mechanical (agentic) consumption, and they can be removed after the implementation. 

You can skip `/impact-analysis` for a small, clear change. `/plan-execution`
then writes the plan from the problem statement alone. You can also write
`<name>.md` and `<name>.plan.json` by hand; `/execute` only needs a plan that
the validator accepts.

## 1. `/impact-analysis <name>`

Finds out WHAT must change, with you. It writes no implementation plan and no
code.

**Plan file.** `<name>` is a path, or a name that means `plans/<name>.md`. A
partial name is matched against `plans/`; with several matches it asks you to
choose. If no file exists, it offers to create `plans/<name>.md` from a
description you give. With no argument, it lists `plans/*.md` and asks.

**What it reads.** The whole plan file, the project documentation, every URL the
plan names, every file and module the plan names, and the tests that cover them.
It checks each claim of the plan about the current code against the source, and
says where a claim is out of date.

**What it asks.** Clarifying questions, up to four per round, in rounds, until
every significant ambiguity is resolved: core functionality first, then scope,
integration, edge cases and errors, and non-functional requirements. Then, for
each item that looks out of scope, it asks you to classify it as **Next**,
**Later** or **Never**, and whether to save a short analysis of a Next or Later
item as its own file in `plans/`.

**What it writes.** An `## Impact Analysis` section, appended to the plan (or
replacing an earlier one):

- Clarified Requirements: each question and your answer.
- Functional Gaps: for each gap, what to implement, verification criteria,
  examples (current behaviour beside the new one, then edge cases) and
  implementation guidelines.
- Affected Files: information sources, files to modify, delete and create.
- Anti-goals Evaluation, Risks, and Scope Refinements (Next, Later, Never).

It then reviews the examples for contradictions and terminology drift, fixes
them, tells you what it corrected, reports the counts of gaps, files and risks,
and suggests `/plan-execution <name>`.

## 2. `/plan-execution <name>`

Writes HOW the change is done, as steps a workflow can run. It appends to the
existing plan file, or creates it with a short problem statement.

It works in three passes, and stops twice for your approval:

1. **Phase outline.** A numbered list of phases: a name, a one-line goal ("the
   user can do X") and the gaps each one covers. It asks you to approve it; you
   can reorder, merge, split, add or remove phases.
2. **The steps.** An `## Implementation Plan` section: a Reference Files table,
   then each phase with its steps, a phase outcome, a summary table and a
   **Total** line with the step count. Each step:
   - has a heading `Step <number>: <title>`, where the number is digits and dots;
   - touches one to four files and one topic, with the test in the same step as
     the source, test first;
   - states all three file lists, **Files to create**, **Files to modify** and
     **Files to delete** (`none` when empty). Their union is the only set of
     files its worker may write;
   - has a **Verification** line that runs `jest` and `eslint` bare over its own
     files only, and never names a `make` goal.
3. **Dependencies and groups.** For each step, the steps whose output it uses
   (an import counts). Steps that write the same file are ordered or put in
   different groups, and `Written also by` is filled in. It proposes the
   **groups** and asks you to approve them, with one line per boundary that
   says why the tree can be green there. A group is the smallest set of steps
   after which the tests and lint pass; a gate runs after each group.

## 3. `/execute <name>`

Runs the plan. Use it to execute a development plan in a Claude code worklow.
