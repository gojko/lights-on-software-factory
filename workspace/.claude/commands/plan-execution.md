---
description: Write the implementation plan of a change and its .plan.json sidecar, so that /execute can run it
argument-hint: <plan path or name>
---

# Plan Execution — Write a Plan a Workflow Can Run

This command writes the **Implementation Plan** of a change and its sidecar
`.plan.json`: the steps, their file boundaries, the groups and the dependencies.
`/execute` then validates the plan, generates the workflow script and runs it.

The notation, the fault list and a worked example are in
`.claude/workflow/README.md`. This command states how to write a plan that
follows it.

## Arguments

`$ARGUMENTS` — the plan. A path is used as given; a bare name means
`plans/<name>.md`.

- **If the file exists** (for example written by `/impact-analysis`), append the
  `## Implementation Plan` section to it, after the existing content. Never
  create a second file for the same change.
- **If it does not exist**, create it, with a short problem statement above the
  plan.
- The sidecar is the plan path with `.md` replaced by `.plan.json`, for example
  `plans/add-login.plan.json` beside `plans/add-login.md`.

## Inputs

- **If the plan holds an impact analysis** (`/impact-analysis` writes one), read
  its Clarified Requirements, its Functional Gaps with their verification
  criteria and examples, its Affected Files, its Anti-goals Evaluation and its
  Risks. Each phase covers named gaps; each phase outcome refers to their
  criteria. An anti-goal is a hard constraint: where a phase cannot respect it,
  ask the user before you go on.
- Read the code the plan changes. Cite the files that hold a pattern to follow.

## The three passes

### Pass 1: Phase outline

Before any detail, write a **phase outline only**: a numbered list of phases,
each with a name, a one-line goal ("the user can do X"), and the gaps it covers.
No steps, no file lists, no commands.

Present the outline with AskUserQuestion and wait for approval. The user may
reorder, merge, split, add or remove phases.

### Pass 2: The steps

Write the plan under one heading, exactly `## Implementation Plan`. Nothing else
reads a step outside that section.

Start with a reference table of the patterns to follow:

```markdown
### Reference Files

| Pattern               | Reference file           |
| :-------------------- | :----------------------- |
| A module and its test | `src/format-greeting.js` |
```

Then one block per phase, with its steps:

```markdown
### Phase N: [What the user can do]

**Goal**: [what the user can do after this phase]

#### Step N.1: [Title]

**Goal**: [one sentence]

**Files to create**: `none`, or a numbered list

1. `src/area/new-module.js`
2. `tests/area/new-module.test.js`

**Files to modify**: `none`, or a numbered list

1. `src/area/existing.js`

**Files to delete**: `none`, or a numbered list

**Written also by**: `none`

- [What the step does, and the decisions it must respect.]

**Verification**: `jest tests/area/new-module.test.js`, then
`eslint src/area/new-module.js src/area/existing.js tests/area/new-module.test.js`

---

#### Phase N Outcome

**What changed for the user**: [the capability that is new or different]

**How to evaluate**: [the gap criteria and examples this phase delivers, or
manual steps where there is no analysis]
```

End the plan with a summary table and one **Total** line, which states the
count of steps. The validator compares that count with the step headings:

```markdown
| Phase | Goal              | Steps | Evaluation reference |
| ----: | :---------------- | ----: | :------------------- |
|     1 | User can create X |     3 | Gap 1, Gap 2         |

**Total**: 2 phases, 5 steps.
```

### Pass 3: Dependencies and groups

Derive the execution structure over all phases and steps, write the sidecar,
and end with the validator. See the sections below.

## Step rules

- **A step heading is exactly `Step <number>: <title>`**, at any heading level,
  and a step number holds digits and dots only (`2.1`, never `2a.1`).
- **Three or four files at most per step**; one or two is better. One topic per
  step. Each step can be verified on its own.
- **The test file goes in the same step as the source file.** The step writes the
  failing test first. A step that changes behaviour updates its tests in the
  same step.
- **Every step states all three file lists**, and an empty list says `none`. The
  union of the three IS the file boundary of the step; never restate it in
  prose. A step that names no file cannot be given to an agent.
- **`Written also by`** names the other steps that write a file of this step.
  Pass 2 writes `none`; Pass 3 fills it in.
- **A step body travels whole into the worker's prompt**, so it must read on its
  own: its goal, its three lists, its exact verification commands, and the exact
  heading of anything it expects the worker to look up (a `Gap 3`, a `Phase 2`,
  the `Reference Files` table). A decision the step leaves open is a decision the
  worker takes for you.
- **A step names a test by its name, never by a line number** of a file another
  step writes. The line moves before the step reads it.
- **A step states no claim about itself that nothing checks** ("this step stays
  in its lane"). State what it does; the file lists and the gates state the rest.
- No timelines and no release sequence. Code only as short pseudo-code where
  the complexity needs it.

## Step verification

Every step has a verification command, run from the project root, over its OWN
files: `jest <its test files>` and `eslint <its files>`. Both are called bare,
from `$PATH`: never `npm run lint`, never through `npx`, never with a path such
as `./node_modules/.bin/`.

**No step names a make command, not even to say that it does not run one.** A
step body goes whole into the worker's prompt, the regulator refuses every make
goal to a worker, and the validator reports a step body that names one. The two
gate goals, `workflow-serial-gate` and `workflow-final-gate`, belong to the gates,
which are not steps. Write "the whole suite answers at the gate", never the
command. The one exception is a step whose subject is the makefile itself.

**A run of a whole test project is not a step verification.** It reads the
half-written files of the siblings and reports their failures as the step's own.
Name the test files the step lists.

## Dependency analysis (Pass 3)

1. **Per-step dependencies.** For each step, list the steps whose output it
   uses: a file another step creates, a function or class another step adds.
   **An import is a dependency**: a step whose new file imports `./x.js` waits
   for the step that creates `x.js`, even inside one group. The stages of a group
   come from the declared dependencies alone, so an undeclared import starts the
   importer before its module exists. Write the edge.
2. **Cross-phase dependencies**: which phases need an earlier one, and why.
3. **Shared files**: two steps that write one file never run at one time. Put
   them in one group with a dependency between them, or in two groups, and fill
   in `Written also by` for both.
4. **The groups.** **A group exists so that the tree is green at its end.** It is
   the smallest set of steps after which the serial gate can answer green. One
   gate runs after each group, so the groups ARE the gate placement.
   - A group is not "the steps that can run at one time". A step that renames a
     function leaves the callers broken; the step that moves the callers is in
     the same group, because no gate can answer green between them.
   - A step number does not give a group. A group can draw steps from several
     phases.
   - Resolve every cycle before you finish. A cycle is a planning fault.

## The sidecar

Write `plans/<plan>.plan.json` beside the plan. It holds ONE JSON object and
nothing else:

```json
{
  "groups": [
    { "name": "A", "steps": ["1.1", "1.2"] },
    { "name": "B", "steps": ["2.1", "2.2", "3.1"] }
  ],
  "dependencies": {
    "1.2": ["1.1"],
    "2.2": ["2.1"],
    "3.1": ["1.2"]
  }
}
```

`groups` is the run order; every step of the Implementation Plan is in exactly
one group. `dependencies` is keyed by the step that WAITS, and its value lists
every step it waits for. A step that waits for nothing has no key.

Five rules bind the sidecar:

- **A dependency never points at a step of a later group.**
- **A dependency inside a group orders two steps and places no gate.** A gate sits
  only between two groups.
- **The sidecar states no file list.** The three lists of the step body are the
  file boundary, and the generator reads them.
- **The gates and the barrier are not in the sidecar.** A run puts one gate
  between every two groups and one barrier after the last group.
- **The sidecar holds no other key**: no model, no effort, no isolation, no
  per-gate command. Where a plan needs something the two fields cannot say, say
  so in the plan and stop; `.claude/workflow/README.md` states how the notation
  grows.

**Record nothing beside the sidecar**: no dependency table, no parallel-groups
prose, no critical path. Each is derived from the sidecar, and a second copy
drifts.

A plan that is renamed takes its three files with it: the plan, the sidecar and
the progress file.

### The author declares the groups

**Propose a grouping; never decide one.** Whether a step leaves the tree green is
a fact about the work, and only the author knows it. Present the proposed groups
with AskUserQuestion, and for each boundary say in one line why the tree can be
green there.

### The agent type of each segment

A plan states the role of each segment, never the rules of that role. The roles
are the agent definitions in `.claude/agents/`:

| The segment               | Its `agentType`   |
| :------------------------ | :---------------- |
| A step of a group         | `workflow-worker` |
| A gate between two groups | `workflow-gate`   |
| The barrier at the end    | `workflow-gate`   |
| The reader after the run  | `workflow-check`  |

Do not restate what a definition holds (the file boundary, the test-first rule,
the commands a worker may run). A plan names no `Workflow` primitive such as
`parallel()`; the stages are derived from `groups` and `dependencies`.

## The check at the end (mandatory)

Pass 3 ends with the validator, never with the sidecar alone. From the project
root:

```
node .claude/workflow/bin/validate-plan.js <plan path>
```

It reports every structural fault as one line (the full list is in
`.claude/workflow/README.md`). Repair each fault and run it again. **The plan is
finished when the validator prints `<plan path>: no fault`.**

## Progress

A plan that `/execute` runs carries no progress section. Each agent answers a
schema, and `node .claude/workflow/bin/record-progress.js` writes
`plans/<plan>.progress.jsonl` from those answers. `/execute` states the method.
