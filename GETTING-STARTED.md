# Getting started

This guide is a quick introduction for how to run a feature change with the lights-on software factory.

## Prerequisites

Everything runs in the container. On the host, you need only:

- **Docker** and **make**.

## Step 1: Initialize the container

This step is needed only once when setting up a new environment. In the project root dir (not `workspace`, the root you checked out), run:

```
make init
```

Optionally, review the configuration for the docker image name etc in the main project [makefile](makefile). [CONTAINER.md](CONTAINER.md) describes the image, the goals and the overrides.

## Step 2: Launch claude

Start a new container attaching to the workspace directory, and running Claude code:

```
make claude
```

If you want to pass in a specific Anthropic API key, do so by setting the `ANTHROPIC_API_KEY` variable when running make. For example:

```
make claude ANTHROPIC_API_KEY=<YOUR KEY>
```

Without a key, Claude Code asks you to log in once. The login is kept in the git-ignored `.claude-home/` directory at the repository root, which every container mounts; see [Keep the Claude Code login](CONTAINER.md#keep-the-claude-code-login).

Optionally, review the Claude settings in [workspace/.claude/settings.local.json](workspace/.claude/settings.local.json) (see [SETTINGS.md](SETTINGS.md)) and/or create a `settings.json` there with more project specific settings. The default ones are enough to run a few basic examples, you will likely need a more complex project structure for a real project.

## Optional step: swap out the trivial application for your code

The workspace contains a trivial project, that can be used to test the whole setup. You should replace it with your app code and tests. Keep the `src/` and `tests/` directories: jest refuses to start when a directory in `jest.roots` of `workspace/package.json` is missing. Review and update [workspace/CONTRIBUTING.md](workspace/CONTRIBUTING.md) after doing that; `workspace/CLAUDE.md` includes it, so Claude Code reads it in every session. In particular, make sure to explain your project layout so the impact analysis command can find the relevant files.

Also adapt the two gate goals in [workspace/makefile](workspace/makefile) to your stack, so they prove what your project needs (a build, a type check, other test runners). [ORCHESTRATOR.md](ORCHESTRATOR.md#when-to-change-them) explains what the gates are for and when to change them.

The example workflow agents use Node JS tooling. If you are using a different programming language, ask Claude to update them with instructions for different tooling.

## Step 3: Create a new change plan

In the [workspace/plans](workspace/plans) directory, save a new markdown file with a proposed change that you'd like to implement. Generally, plan files should correspond to larger changes (epic/milestone size). 

Explain the problem, and some aspects of the proposed solution. Then ask Claude to run an impact analysis on it (in the Claude Code session from Step 2). If you want to just try out the whole flow on the example code, use [workspace/plans/internationalisation.md](workspace/plans/internationalisation.md).

```
/impact-analysis <plan-file-name>
```

For example

```
/impact-analysis internationalisation
```

Claude will ask you to clarify requirements, then write the analysis back into the markdown file you created. Once that's done, create an implementation plan:

```
/plan-execution <plan-file-name>
```

For example:

```
/plan-execution internationalisation
```

## Step 4: Execute the plan using a multi-agent workflow

To execute the planned changes, run the `/execute` Claude command:

```
/execute <plan-file-name>
```

For example:

```
/execute internationalisation
```

[WORKFLOW.md](WORKFLOW.md) describes what each command asks and writes, how to watch and resume a run, and a worked example.
