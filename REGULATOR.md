# The Bash-command regulator

The regulator is a Claude Code `PreToolUse` hook. Before every Bash command
runs, it allows the command, asks you about it, denies it with a reason that
goes back to Claude, or makes no decision and leaves the command to Claude
Code's normal permission settings. Different rules apply to the main session
and to each workflow agent role.

All paths below are relative to `workspace/`, the directory you start Claude
Code in. The hook is wired in `.claude/settings.local.json` (see
[SETTINGS.md](SETTINGS.md)):

```
PreToolUse, matcher Bash:
node $CLAUDE_PROJECT_DIR/.claude/workflow/bin/regulate.js
```

The engine is in `.claude/workflow/src/regulator/`, the rule list in
`.claude/workflow/src/regulator/rules.js`, and the single rules in
`.claude/workflow/src/regulator/rules/`. Tests are in
`.claude/workflow/tests/regulator/`.

## How a decision is made

The hook splits a command into segments (`&&`, `||`, `;`, `|` and so on) and
checks each segment against the ordered list in `rules.js`. The first rule that
matches a segment decides it. Then:

- any segment **deny** → the command is denied, and the reason goes to Claude;
- else any segment **ask** → Claude Code asks you;
- else every segment **allow** → the command runs with no prompt;
- else (some segment matched nothing) → **no decision**: Claude Code's normal
  permission prompt and settings apply.

Before a segment meets the rules:

- **Wrappers are unwrapped.** `time`, `nohup`, `nice`, `stdbuf`, `xargs`, `env`,
  `timeout` and `command` are removed with their own flags, so
  `timeout 60 jest x.test.js` is judged as `jest x.test.js`. The list is in
  `.claude/workflow/src/regulator/wrappers.js`.
- **`bash -c` and `sh -c`** are opened, and the inner command is checked like
  any other command.
- **A system path prefix** such as `/usr/bin/git` is read as `git`.

A command the parser cannot read safely (for example a heredoc it cannot follow,
process substitution `<(...)`, or unbalanced quotes) is denied with a reason
that says how to rewrite it, and a pointer to `debug.js`.

## Roles

The hook reads `agent_type` from the payload. Some rules apply to one role only:

- **`workflow-worker`** runs `jest` or `eslint` over named files only; no make
  goal, no whole-tree verification, no type check, and no git command that
  records state (`git mv` and `git rm` are allowed).
- **`workflow-gate`** runs only make goals whose names start with `workflow-`,
  plus file-level diagnosis; no mutating git.
- **`workflow-check`** runs no make goal; it reads.
- Any `workflow-*` agent is denied every command that no earlier rule allows
  (`workflow-agent-catch-all`), and is never prompted. The `ask` rules apply only
  to the main session.

The roles match the three agent definitions in `.claude/agents/`; see
[ORCHESTRATOR.md](ORCHESTRATOR.md#agents).

## Notable rules

| Rule                                                          | Decision | Applies to                                                 |
| :------------------------------------------------------------ | :------- | :--------------------------------------------------------- |
| `common-allowed-commands`                                     | allow    | read/inspect tools, `node`, `make`, `jest`, `eslint`, `jq` |
| `git-readonly-subcommands`                                    | allow    | `git status`, `diff`, `log`, `show`, ...                   |
| `npm-test`                                                    | allow    | `npm test`, `npm t`                                        |
| `git-mutating-local`, `npm-install`                           | ask      | `git add/commit/checkout/...`, `npm install`               |
| `git-remote`                                                  | deny     | `git push/pull/fetch/clone`                                |
| `sudo`, `npx`                                                 | deny     | any `sudo`, any `npx`                                      |
| `npx-jest`, `npx-eslint`, `npm-run-lint`, `require-from-path` | deny     | non-`$PATH` forms of jest and eslint                       |
| `node-absolute-path`                                          | deny     | `node /abs/path.js` outside the transient directory        |
| `export-env-var`, `shell-comment`                             | deny     | `export X=1`; `#` comment lines                            |
| `long-sleep`, `bare-wait-loop`                                | deny     | waits longer than 30 seconds                               |
| `worker-*`, `gate-*`, `check-*`                               | deny     | role boundaries (above)                                    |
| `workflow-agent-catch-all`                                    | deny     | anything else, for workflow agents                         |

`make` is allowed, so `make lint` runs `eslint .` inside make without a
denial: the hook sees only the command Claude sends, not what a make recipe
runs.

## Diagnosing a decision

Run `/regulator <command>` in Claude Code. It explains why a Bash command was
allowed, refused or prompted, and proposes the smallest rule change, test
first. Use `/regulator --agent workflow-worker <command>` to trace the decision
for an agent role, for example when an agent is refused a command during an
`/execute` run ([ORCHESTRATOR.md](ORCHESTRATOR.md#agents) lists the roles).

Or run the trace directly, from `workspace/`:

```sh
node .claude/workflow/bin/debug.js git commit -m x
node .claude/workflow/bin/debug.js --agent workflow-worker make test
```

The trace shows each segment, the rule that resolved it and the merged decision.

## Configuring

- **Rule order.** `rules.js` holds one ordered `rules` array. The first match
  wins, so role rules come first, denies before the allow-lists, and the
  catch-all last. `.claude/workflow/tests/regulator/rules.test.js` checks the
  expected ids and the ordering invariants.
- **The allow-list.** To let the session run another tool without a prompt, add
  it to the `common-allowed-commands` list in `rules.js`. A command that no rule
  matches is not denied; it falls through to Claude Code's own permission
  prompt.
- **The transient directory.** `CLAUDE_TRANSIENT_DIR` (default
  `/tmp/claude-transient`) is where agents put scratch scripts, gate logs and
  debug input. The regulator reads it through
  `.claude/workflow/src/transient-dir.js`, the same module the generator uses;
  `node-absolute-path` allows `node /abs/path.js` only under it. To change it,
  see [SETTINGS.md](SETTINGS.md).
- **The `$PATH` policy.** The regulator denies `npx jest`, `npx eslint`,
  `npm run lint` and path-prefixed forms such as `./node_modules/.bin/eslint`,
  and tells agents to run `jest <files>` and `eslint <files>` bare. In the
  container, `.bashrc` puts `workspace/node_modules/.bin` on `$PATH`, and both
  `make claude` and `make shell` start through it (see
  [CONTAINER.md](CONTAINER.md#what-bashrc-adds)). The deny reasons say the same
  thing, so an agent that meets one knows what to do.
- **`bypassPermissions`.** The regulator refuses every Bash command when Claude
  Code runs with `--permission-mode bypassPermissions`.

## Adding a rule

1. **Write the test first.** `rules/sudo.js` with
   `.claude/workflow/tests/regulator/rules/sudo.test.js` is the simplest model:
   a rule is an object with `id`, `decision` (`allow`, `ask` or `deny`), a
   `reason` (string or function of the command), `matchSegment(tokens)` and
   optionally `appliesTo(context)`. For a plain pattern, use the factories
   `regexDenyRule`, `regexAskRule`, `regexAllowRule` or `allowCommands`.
2. Add an end-to-end row to
   `.claude/workflow/tests/regulator/regulate-bin.test.js`, and add the id to
   the expected list in `.claude/workflow/tests/regulator/rules.test.js`, which
   also checks ordering invariants and that agent-role reasons are short
   imperative directions.
3. Put the rule in the `rules` array in `rules.js`. **Order matters**: the first
   match wins.
4. Run `jest .claude/workflow/tests/regulator` from `workspace/`.

See also [GETTING-STARTED.md](GETTING-STARTED.md) for setup and [ORCHESTRATOR.md](ORCHESTRATOR.md)
for the workflow the roles belong to.
