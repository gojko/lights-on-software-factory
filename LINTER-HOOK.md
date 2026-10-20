# The lint hook and custom rules

After every `Edit`, `MultiEdit` or `Write`, `lint-edited-file.js` runs
`node_modules/.bin/eslint --fix <file>` on the edited file when it is a `.js` or
`.mjs` file inside the project and not under `node_modules`. If errors remain,
the hook returns a `block` decision with the eslint output, and Claude fixes
them before continuing. A project with no local eslint is never blocked. The
hook is wired in `workspace/.claude/settings.local.json`; see
[SETTINGS.md](SETTINGS.md).

The two example rules are in `workspace/.claude/workflow/src/lint/`:

- `no-comments.js` — reports every comment except JSDoc blocks, eslint
  directives and a bare `@jest-environment` pragma. Options: `jsdoc: false` and
  `eslintDirectives: false` make it stricter; `fix: true` removes comments.
- `node-protocol-imports.js` — requires `node:` on imports of Node built-ins,
  with an autofix. A short rule with a fixer: the better model for a first rule.

To write a rule (paths relative to `workspace/`):

1. Write a `RuleTester` test in `.claude/workflow/tests/lint/<rule>.test.js`
   with valid and invalid cases (see `node-protocol-imports.test.js`).
2. Write the rule in `.claude/workflow/src/lint/<rule>.js`: a `meta` object
   (type, docs, messages, `fixable` if it fixes) and `create(context)`.
3. Register it in `.claude/workflow/src/lint/plugin.js`.
4. Turn it on as `local/<rule>` in `eslint.config.js`.
