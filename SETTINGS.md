# Settings

All wiring is in `workspace/.claude/settings.local.json`.

- **Hooks.** `PreToolUse` with matcher `Bash` runs
  `node $CLAUDE_PROJECT_DIR/.claude/workflow/bin/regulate.js`. `PostToolUse`
  with matcher `Edit|MultiEdit|Write` runs
  `node $CLAUDE_PROJECT_DIR/.claude/workflow/bin/lint-edited-file.js`. Both
  resolve against the directory Claude Code started in, which must be
  `workspace/`; `make claude` starts it there. See [REGULATOR.md](REGULATOR.md)
  and [LINTER-HOOK.md](LINTER-HOOK.md).
- **`env`.**
  - `CLAUDE_TRANSIENT_DIR` (default `/tmp/claude-transient`): the scratch
    directory for gate logs, regulator debug input and agent scratch scripts.
    The regulator and the generator read it through one module,
    `workspace/.claude/workflow/src/transient-dir.js`.
  - `NODE_OPTIONS` is not set here. The container image sets it, for every
    process in the container (see [CONTAINER.md](CONTAINER.md#the-image)).
- **`plansDirectory: "plans"`**: Claude Code keeps plan-mode files in the same
  directory the commands use.
- **`permissions`.**
  - `additionalDirectories` holds the transient directory, so agents can read
    gate logs and debug input there.
  - `allow` holds `Read`/`Edit` of the project and of the transient directory,
    `Glob(*)`, `Workflow`, `Skill(loop)` and `CronCreate`/`CronList`/`CronDelete`,
    which the workflow loop needs.
  - `defaultMode: "acceptEdits"`.
- **Personal preferences**, safe to remove or change: `language: "ASD-STE100"`
  (a controlled-English output style), `outputStyle: "Concise"`,
  `showTurnDuration`, `showThinkingSummaries`, `syntaxHighlightingDisabled`,
  `autoMemoryEnabled`, `awaySummaryEnabled`, `useAutoModeDuringPlan`,
  `disableAutoMode`, `respectGitignore`, `workflowSizeGuideline`, `attribution`
  and `worktree.bgIsolation`. Keep `enableWorkflows`.

Notes:

- Claude Code usually git-ignores `settings.local.json` as a personal file. To
  share the setup with a team, move the entries to `workspace/.claude/settings.json`.
- If you change `CLAUDE_TRANSIENT_DIR`, change `additionalDirectories` and the
  two `//tmp/claude-transient/**` allow entries to match. In the container,
  only `/tmp` (and `$TMPDIR`) and the repository are mounted (see
  [CONTAINER.md](CONTAINER.md#what-the-run-command-sets)), so keep the
  transient directory under one of them.
- Settings, hooks and agent definitions load at session start. Start a new
  session after you copy or change them.
- The regulator refuses every Bash command when Claude Code runs with
  `--permission-mode bypassPermissions` (see
  [REGULATOR.md](REGULATOR.md#configuring)).
