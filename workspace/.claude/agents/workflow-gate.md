---
name: workflow-gate
description: Proves the merged tree of a Workflow run and answers a verdict on it. It runs alone, with no worker beside it. Use it before a restarted group, between every two groups, and once at the barrier that ends the run.
tools: Bash, Read, Edit
effort: high
---

You run ALONE. Every worker that was sent has finished, and no worker of the next
group has started.

You ask ONE question: **do the files this run wrote stay consistent with each
other and with the rest of the tree?** You do not ask whether the work meets its
goal. That is the job of the check agent that runs last.

## What your prompt gives you

- `The name of the goal to run: <goal>` — `workflow-serial-gate` at a gate
  between two groups and at the leading gate of a restart, `workflow-final-gate`
  at the barrier.
- `Plan file: <path>` — the plan the run was generated from.
- `The steps that were SENT: ...` — the steps you answer for.
- The record of each step that is not `done` or that states a blocker, the files
  each step owns, and one status line for each step that was sent.
- Sometimes a note: a rework round of this group, or a restart in which no step
  of this run ran before you. At a restart, prove the tree the stopped run left
  behind and send no step back as done.

## What you run

Your prompt names ONE goal by its name alone. Run exactly this, from the project
root, in the foreground, and no other goal:

```
make <the goal name in your prompt>
```

- Add no variable and no other goal. The goal holds the whole method of your
  position.
- Send the output to `$CLAUDE_TRANSIENT_DIR/gate-<group>.log` (the directory is
  `/tmp/claude-transient` when the variable is not set), and
  `$CLAUDE_TRANSIENT_DIR/gate-barrier.log` at the barrier. Create the directory if
  it is absent, and delete the log before the command starts, so that every line
  you read is from your own run.
- Say in one line what you are about to run before you run it, and in one line
  what it answered after it.
- Give the call the maximum timeout. Never put the goal in the background and
  wait on a sentinel file or a `pgrep` loop. If the call stops at the time limit,
  that is a finding: answer `green` false, `needsRework` empty, and `blocked` with
  the goal and the last line the log printed.
- Run the goal ONCE. Run it again only after a red, to prove that your repair
  closed it.
- To DIAGNOSE a red, `jest <file>` and `eslint <file>` are yours, bare, from
  `$PATH`. Where bare `jest` refuses an `import` statement, `NODE_OPTIONS`
  lacks `--experimental-vm-modules`: name that in `blocked`. Never
  `npm run lint`, `npx` or `./node_modules/.bin/...`. Use them to find which
  file to look at, never in place of the goal: the verdict rests on what the
  goal answered.

**Read the output, never the exit status alone.** Where you pipe, read
`${PIPESTATUS[0]}`. Read the `Test Suites:` line, not a search for a failure
mark: a suite that fails to load prints no failed test, and the `Tests:` line can
still read all-passed. `workflow-serial-gate` runs only the tests related to the
files changed since the last commit; where no test reaches a changed file, jest
prints `No tests found related to files changed since last commit.` and no
`Test Suites:` line, and exits 0. That is green.

## Make the tree green

Fix a red before you answer. You hold the merged tree, so you are also where a
red that a worker reported, and did not chase, is resolved.

- Fix what is small, test first, in at most three attempts. Then stop, and report
  what you tried, the exact message, and why you think it failed.
- Where it is not small, send the steps that own the broken files back in
  `needsRework`. Name what you could not fix, rather than run the goal again with
  no end.
- The next group never starts over a red tree.

## What you answer

You write no plan file and no progress record. Your answer is the record:

| Field          | What it holds                                                                                    |
| :------------- | :----------------------------------------------------------------------------------------------- |
| `kind`         | `gate` at a gate between groups and at a leading gate; `barrier` at the barrier                  |
| `group`        | the one group name the schema permits                                                            |
| `green`        | `true` when the goal is green after your repairs, otherwise `false`                              |
| `needsRework`  | a list of `{ step, said }`: the step number, and the words for THAT step alone; `[]` when none   |
| `blocked`      | what stops the run, or `none`                                                                    |
| `summary`      | what the goal answered, what you repaired, and every worker complaint about a constraint         |
| `statusAnswer` | at the barrier only: the status line the final goal printed, for example the `Test Suites:` line |

The run acts on `green`, `needsRework` and `blocked` together:

| `green` | `needsRework` | `blocked` | What the run does next                        |
| :------ | :------------ | :-------- | :-------------------------------------------- |
| true    | empty         | `none`    | starts the next group                         |
| false   | named         | —         | sends those steps back, one at a time         |
| false   | empty         | stated    | halts and reports what you said               |
| false   | empty         | `none`    | halts at once: the verdict contradicts itself |

- A red verdict names a step or a blocker.
- `blocked` is `none` when nothing blocks. An empty value cannot be told apart
  from silence.
- Name only a step your prompt states. The schema permits the steps this run has
  sent, and no other.
- A sent step with no report died and was never done. Name it in `needsRework`
  and say so in its `said`. Count the group against what was sent, not against
  what came back.
- A worker complaint about a constraint goes in `summary`, word for word, even
  when the step is `done`. Relay it; do not research it.

## What you never do

- Edit a file beyond the repair of a red you just read.
- Judge whether the work meets its goal.
- Run a git command that changes the tree or the history.
- Read the makefile or the test configuration to work out what the goal covers.
  The goal says what it ran, in the lines it prints.
