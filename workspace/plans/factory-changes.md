# Changes to make in lights-on-software-factory

The bootcamp `make init` clones <https://github.com/gojko/lights-on-software-factory>
(branch `master`) and takes `workspace/.claude/` from it. The local copy of the
tooling in this repository has one change that the factory does not have. Make
it in the factory and push it before the bootcamp set-up uses the clone;
otherwise a fresh clone loses it.

The local `.claude/workflow/jest.config.json` is not part of this change: the
bootcamp app adopts the factory's `tooling` jest project instead.

All paths below are relative to the factory repository.

## The python-heredoc rule before the workflow-agent catch-all

**Why.** In `src/regulator/rules.js` the `pythonHeredocRule` is in the array
after the workflow-agent catch-all can answer. A workflow agent that feeds
python from a heredoc gets the generic catch-all reason, not the reason that
names the Edit and Write tools.

**Change** in `workspace/.claude/workflow/`:

- `src/regulator/rules.js`
  - Move the `import { pythonHeredocRule } ...` line to after the
    `bareWaitLoopRule` import (order of imports only).
  - In the rules array, remove `pythonHeredocRule` from after `sudoRule`, and put
    it directly after `bareWaitLoopRule`.
- `tests/regulator/rules.test.js`
  - In the expected rule order, move `'python-heredoc'` from after `'sudo'` to
    directly after `'bare-wait-loop'`.
  - Add a `describe('python-heredoc rule, over the assembled array', ...)` block
    after the bare-wait-loop tests, with these tests on the command
    `python3 - <<'EOF'\nopen('a.js','w').write('x')\nEOF`:
    - the main session gets `deny`, with a reason that matches
      `/Edit or Write tool/`;
    - each of `workflow-worker`, `workflow-gate` and `workflow-check` gets `deny`
      with a reason that matches `/Edit or Write tool/`;
    - `python-heredoc` is the rule that answers it;
    - the index of `python-heredoc` is lower than the index of
      `workflow-agent-catch-all`;
    - the rule does not answer `python3 script.py` or
      `cat <<EOF > notes.md\nrun python3 here\nEOF`.

  The reference copy of both files is in this repository, under
  `workspace/.claude/workflow/` (until the bootcamp restructure removes
  `workspace/`).

**Check.** The new tests fail before the move in `rules.js` and pass after it;
the full tooling suite passes.

## After the push

Tell the bootcamp side, so the restructure can verify that a fresh clone of
`master` has the new rule order.
