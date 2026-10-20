# Contributing

## Project layout

```
workspace/
├── src/                  project source code
├── tests/                project tests (jest, *.test.js)
├── plans/                plans, their .plan.json sidecars and .progress.jsonl records
├── .claude/
│   ├── agents/           workflow-worker, workflow-gate, workflow-check
│   ├── commands/         /impact-analysis, /plan-execution, /execute, /regulator
│   ├── settings.local.json  hooks, environment, permissions
│   └── workflow/         tooling: regulator, workflow generator, lint rules and hooks
│       ├── bin/          entry points the hooks and commands run
│       ├── src/          tooling source
│       └── tests/        tooling tests
├── eslint.config.js      lint configuration, with the local plugin
├── jest.config.js        jest projects: `project` (src/, tests/) and `tooling` (.claude/workflow/)
├── makefile              build targets (run `make help`)
└── package.json          dev dependencies
```

Put project code in `src/` and its tests in `tests/`. Change files under
`.claude/workflow/` only to change the tooling itself.

## Commands

- Run `make help` to list the makefile targets and what each one does.
- Run `jest <test files>` and `eslint <files>` from `$PATH` to check single
  files.

## Rules

- Write a failing test before the code that makes it pass.
- Use ES modules.
- Plans live in `plans/`. Use `/impact-analysis`, `/plan-execution` and
  `/execute` to analyse, plan and run a change.
