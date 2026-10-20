# The container

The repository ships a small Linux container so that every person, and Claude
Code itself, runs the project with the same tools. The root `makefile` builds
the image from `vm/Dockerfile` and runs the workspace goals inside it. The
project files stay on the host; the container only mounts them.

You need **Docker** and **make** on the host. Nothing else is installed on the
host.

## Quick start

From the repository root:

```sh
make init     # build the image, then run `npm install` in workspace/ inside the container
make claude   # start Claude Code in the container, in workspace/
```

`make claude` runs `claude` through an interactive bash (`bash -ic claude`), so
the container's `.bashrc` sets `$PATH`, `NODE_OPTIONS` and the git safe
directory first. It also passes `ANTHROPIC_API_KEY` from the host when that
variable is set, so an API-key login needs no step inside the container.

To work in a shell instead, run `make shell` and then `claude` in it.

`claude` comes from `workspace/node_modules/.bin`, because Claude Code is a
devDependency of `workspace/package.json` (`@anthropic-ai/claude-code`), and the
shell puts that directory on `$PATH`.

**The Claude Code login persists.** Every container is removed on exit
(`--rm`), but Claude Code keeps its login and history in `.claude-home/` at the
repository root, which is mounted into the container. See
[Keep the Claude Code login](#keep-the-claude-code-login).

## The image

`vm/Dockerfile` builds the image. Update it to add the packages required by your team for development.

## Makefile goals

Run them from the repository root.

| Goal           | What it runs                                                                                                                         |
| :------------- | :----------------------------------------------------------------------------------------------------------------------------------- |
| `docker-image` | `docker build --platform $(DOCKER_PLATFORM) -t $(DOCKER_IMAGE_NAME) $(DOCKER_IMAGE_DIR)`. Docker's layer cache makes a rebuild fast. |
| `init`         | `docker-image`, then `make init` in `workspace/` inside the container (`npm install`)                                                |
| `test`         | `docker-image`, then `make test` in `workspace/` inside the container (`jest`, every test)                                           |
| `lint`         | `docker-image`, then `make lint` in `workspace/` inside the container (`eslint .`)                                                   |
| `shell`        | an interactive bash shell in the container, in `workspace/`, with a port published                                                   |
| `claude`       | Claude Code in the container, in `workspace/`, through `bash -ic claude`; passes `ANTHROPIC_API_KEY` from the host when it is set    |
| `root`         | an interactive shell as root (`-u 0`) in a new container                                                                             |

- `init`, `test` and `lint` run the container with `/usr/bin/make` as the entry
  point and the goal name as its argument, with a terminal (`-t`) and no input.
- `shell`, `claude` and `root` do not build the image. Run `make init` (or
  `make docker-image`) first.
- `root` is for trying out system changes, for example a package you want to add
  to the Dockerfile. It does not mount the project and it does not use `--rm`, so
  the stopped container stays until you remove it (`docker ps -a`,
  `docker rm <id>`). Put a change you want to keep into `vm/Dockerfile`.

To see the exact commands without running them, use a dry run:

```sh
make -n init
make -n shell
```

## Overrides

Set them on the command line (`make init DOCKER_PLATFORM=linux/amd64`) or in the
environment.

| Variable            | Default                                                     | What it changes                                             |
| :------------------ | :---------------------------------------------------------- | :---------------------------------------------------------- |
| `DOCKER_PLATFORM`   | `linux/amd64` or `linux/arm64`, from `uname -m` on the host | the platform to build and run                               |
| `DOCKER_IMAGE_NAME` | `example-claude-workflow`                                   | the image tag, also shown in the shell prompt               |
| `DOCKER_IMAGE_DIR`  | `vm`                                                        | the build context that holds the `Dockerfile`               |
| `CONTAINER_PORT`    | `8080`                                                      | the host side of the published port of `shell`              |
| `LOCAL_PORT`        | `8080`                                                      | the container side of the published port of `shell`         |
| `TMPDIR`            | from the environment                                        | the extra mount; `TMPDIR=` on the command line turns it off |

Use the same `DOCKER_PLATFORM` and `DOCKER_IMAGE_NAME` for every goal; `shell`
runs the image that `init` built under that name.

## Keep the Claude Code login

Every container goal mounts `.claude-home/` at the repository root as
`/builder/.claude`, the Claude Code configuration directory of the container
user, and sets `CLAUDE_CONFIG_DIR` to it. The makefile creates the directory
before the first `docker run`, so it belongs to your host user and not to root.
`.gitignore` excludes it.

What it keeps across containers:

- the login (when you log in instead of passing `ANTHROPIC_API_KEY`);
- the session history, so `claude --resume` works in a new container;
- the first-run state, so Claude Code does not ask its first-run questions again;
- the transcripts of workflow runs
  (`.claude-home/projects/<project>/subagents/workflows/wf_<id>`), which
  `record-progress` and `measure-run` read (see
  [ORCHESTRATOR.md](ORCHESTRATOR.md#progress-and-resume)).

It is separate from the `~/.claude` of a Claude Code on the host. To start
clean, remove `.claude-home/`. It holds your login, so never commit it or copy
it into another repository.

## Host or container `node_modules`

`workspace/node_modules` is on the mount, so the host and the container see the
same directory. It holds platform-specific binaries (Claude Code, a file
watcher, a resolver): an install made in the Linux container does not run on a
macOS host, and the other way round.

**Install only in the container.** Do not run `npm install` on the host in
`workspace/`. If an install from the host got there, replace it:

```sh
rm -rf workspace/node_modules
make init
```

The same applies when you change `DOCKER_PLATFORM`: an `arm64` install does not
run in an `amd64` container.

## Troubleshooting

**`git` says `dubious ownership`.** You are not in a shell of `make shell` or
`make claude` (the `safe.directory` line is in `.bashrc`), or `PROJECT` is not
set. Start the shell with `make shell`, or Claude Code with `make claude`.

**`claude: command not found` or `jest: command not found` in the shell.** Run
`make init` first; the binaries come from `workspace/node_modules/.bin`.
