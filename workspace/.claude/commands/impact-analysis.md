---
description: Analyse the impact of a proposed change, clarify open questions with the user, and write the analysis into the plan file
argument-hint: [plan path or name]
---

# Impact Analysis

Analyse a proposed change described in a plan file, clarify the open questions
with the user, then write the analysis back into the same file. `/plan-execution`
reads it next.

## Arguments

`$ARGUMENTS` — optional. A path is used as given; a bare or partial name is
looked up in `plans/` (`add-login` means `plans/add-login.md`).

## Process

### Step 1: Locate the plan file

**If `$ARGUMENTS` is given:**

- A path: use it.
- A name: look for `plans/<name>.md`, then for files in `plans/` whose name holds
  it. With several matches, list them and let the user choose with
  AskUserQuestion. With none, ask whether to create `plans/<name>.md` from a
  description the user gives.

**If `$ARGUMENTS` is empty:** list the `.md` files in `plans/` and let the user
choose with AskUserQuestion.

### Step 2: Load context

1. Read the plan file in full.
2. Read the project documentation that bears on the change (the README,
   architecture notes, data schemas).
3. Fetch every external URL the plan references, with WebFetch.
4. Read every file, module or component the plan names, and the tests that
   cover them.
5. **Verify every claim about the current code.** A plan often quotes an older
   document. Check each statement about what the code does today against the
   source. Where a claim is out of date, say so in the analysis and use the real
   behaviour; do not silently rewrite the quoted text.
6. Find the tests that cover the affected behaviour and note which will need to
   change, and which behaviour has no test.

### Step 3: Evaluate the problem statement

Understand:

1. **Intended functionality** — what the change must do, and the outcomes the
   user sees.
2. **Constraints** — the limits and rules the plan imposes.
3. **Implicit assumptions** — what the plan assumes about the existing system.
4. **Scope** — what is in scope and what looks out of scope.
5. **Anti-goals** — what must NOT happen as a result of the change.

### Step 4: Identify open questions and decisions

List:

1. **Ambiguities** — unclear or conflicting requirements.
2. **Missing information** — details the plan needs and does not give.
3. **Design decisions** — choices that could go more than one way.
4. **Concerns** — contradictions with the existing architecture, or risks.
5. **Edge cases** — scenarios the plan does not address.
6. **Test gaps** — tests that must change, and behaviour no test covers.
7. **Data and interface changes** — new fields, formats, public functions or
   endpoints, and their compatibility with existing callers and stored data.
8. **System-wide requirements** — performance, security or access constraints
   that reach beyond the change.
9. **Documentation gaps** — decisions or behaviour that must be documented.
10. **Anti-goal violations** — any change or decision that risks a stated
    anti-goal; name the anti-goal and the conflicting change.

### Step 5: Interactive clarification

Clarify the open questions with AskUserQuestion, in rounds:

- Up to 4 questions per round, the most important first.
- After each round, check whether the answers raise follow-up questions.
- Continue until every significant ambiguity is resolved.
- Record every answer; the answers become part of the analysis.

Order of priority: core functionality, then scope, then integration with
existing components, then edge cases and errors, then non-functional
requirements.

### Step 6: Out-of-scope resolution

For each item that looks out of scope:

1. **Classify it with the user** (AskUserQuestion): **Next** (right after this
   change), **Later** (planned, not now) or **Never** (not planned).
2. **Next** — a rough impact analysis: where it would be implemented, what of
   the current work it extends, and which current decisions must accommodate it.
3. **Later** — a feasibility check: whether the current work would block or
   complicate it, and which decisions must stay flexible.
4. **Consistency** — where a current gap conflicts with a Next or Later item,
   ask the user and update the gaps.
5. **Save or summarise** — ask whether to save each rough analysis as its own
   file in `plans/`. If yes, write a short document (problem, context, proposed
   solution, key decisions) and reference it. If no, summarise it in the Scope
   Refinements.

### Step 7: Write the impact analysis

If the plan file already has an `## Impact Analysis` section, replace it
entirely; otherwise append it below the existing content:

```markdown
---

## Impact Analysis

_Generated: YYYY-MM-DD_

### Clarified Requirements

[The questions resolved in Step 5, grouped by topic. Each item states the
question and the answer.]

### Functional Gaps

#### Gap N: [Title]

**What to implement**: [observable behaviour]

**Verification criteria**:

- [acceptance criteria as concrete, testable statements]

**Examples**:

- [first, simple examples that show the current behaviour beside the new one]
- [then edge cases and boundary conditions]
- [every verification criterion has at least one example]

**Implementation guidelines**:

- [structure, flows and patterns to follow, with references to existing files]

---

[Repeat for each gap]

### Affected Files

#### Information sources

- `path/to/file` — [why it is relevant]

#### Files to modify

- `path/to/file` — [a short summary of the change]

#### Files to delete

- `path/to/file` — [reason]

#### New files needed

- `path/to/file` — [purpose]

### Anti-goals Evaluation

- **[Anti-goal]**: Respected / At risk
  - [If at risk: the gaps or changes that create the risk, and the scope
    adjustment that would resolve it]

### Risks

- [A factual risk, with no mitigation strategy]

### Scope Refinements

#### Next (implement after the current change)

- [Item] — [summary of the rough impact analysis]

#### Later (future planned work)

- [Item] — [summary of the feasibility check]

#### Never (not planned)

- [Item] — [short reason]
```

Leave out a section that has nothing in it, apart from Functional Gaps.

### Step 8: Consistency review

Read the whole Impact Analysis section again and check every example across
every gap:

1. **Contradictions** — two examples that expect different behaviour for the
   same input or state.
2. **Incompatible assumptions** — different data formats, roles, error
   conditions or system states for the same thing.
3. **Terminology drift** — one concept under two names. Use one name.

Fix what you find in the file, and tell the user what you corrected.

### Step 9: Present

1. Read the updated file to confirm the section was written correctly.
2. Tell the user how many functional gaps, affected files and risks the analysis
   holds.
3. Suggest `/plan-execution <plan>` as the next step.

## Rules

- **Do not write an implementation plan.** This command states WHAT must change,
  not how to sequence the work; `/plan-execution` does that.
- **No code or pseudo-code** — behaviour and decisions only.
- **No mitigation strategies** in Risks — state the risks.
- **Keep file descriptions short.** Do not detail individual changes.
- **No release sequence.**
- **Replace an existing Impact Analysis**; treat it as outdated.
- **All output goes into the same plan file.** The only exception is an
  out-of-scope document the user asked to save in Step 6.
- **Fetch external resources** the plan references.
- **Verify claims about the current code** before you treat them as
  constraints.
- **Resolve every out-of-scope item** as Next, Later or Never with the user.
