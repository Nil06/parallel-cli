# Parallel

Real-time multi-agent coding in your terminal.

Parallel lets you run several AI coding agents on the same repository at the same time. Each agent sees the live shared state of the session, can coordinate with the others, and can edit files without silent overwrites.

> You stay in control. Parallel gives you the hub, the live context, the safety rails, and one dedicated terminal per agent.

[![npm version](https://img.shields.io/npm/v/@parallel-cli/parallel?color=blue)](https://www.npmjs.com/package/@parallel-cli/parallel)
![node version](https://img.shields.io/node/v/@parallel-cli/parallel)
![license](https://img.shields.io/npm/l/@parallel-cli/parallel)
![platform](https://img.shields.io/badge/platform-linux%20%7C%20macos-lightgrey)

## Features

- Run multiple coding agents in parallel from one terminal hub.
- Open a dedicated terminal per agent with native scrollback and live steering.
- Share live context between agents: status, notes, file claims, file activity, and recent diffs.
- Prevent silent overwrites with adaptive merge-on-write for file edits.
- Spawn agents normally, in plan-first mode, from GitHub issues, or from headless CI scripts.
- Pause, resume, stop, focus, restore, and steer agents while they are running.
- Review live diffs, notes, costs, session state, skills, and specialists from built-in views.
- Use any OpenAI-compatible provider, including DeepSeek, OpenAI-compatible gateways, OpenRouter, Ollama, vLLM, LM Studio, and local servers.
- Track token usage and estimated cost per agent and per session.
- Keep project and global skills/specialists as local markdown files.

## Install

Requirements:

- Node.js 18 or newer
- Linux or macOS
- An API key for an OpenAI-compatible provider

Install from npm:

```bash
npm install -g @parallel-cli/parallel
```

Run it inside a project:

```bash
parallel
```

Short alias:

```bash
prl
```

## Quick Start

On first launch, Parallel opens a setup wizard for:

1. Language
2. Working folder
3. New or restored session
4. Provider
5. Model

After setup, type a task and press Enter:

```text
> refactor the API client and update the tests
```

Typing another task starts another agent immediately, even while the first one is still working:

```text
> add coverage for the auth middleware
```

Send a real-time instruction to one agent:

```text
@a1 also handle empty response bodies
```

Broadcast to every agent:

```text
@all stop changing public interfaces until the test agent finishes
```

## Multi-Terminal Sessions

The main TUI is the session hub. Each new agent can open a dedicated terminal connected through `.parallel/session.sock`.

```bash
parallel
parallel attach a1 --root .
```

Attached terminals show:

- the agent log in native terminal scrollback
- state, model, tokens, cost, elapsed time, and current action
- what the other agents are doing
- a prompt for steering that specific agent
- approval and question prompts for that agent

From an attached terminal:

```text
/spawn write regression tests for the parser
```

This launches a new agent in the same session. Use `/quit` to detach from an agent terminal.

Toggle automatic agent terminals in the hub:

```text
/attach on
/attach off
```

## Headless Mode

For CI and scripts, run without the TUI:

```bash
parallel --headless "fix lint failures" "update tests" --json
```

Headless mode:

- runs one agent per task
- uses the current folder as the project root
- auto-approves shell commands
- auto-answers agent questions with the recommended option
- saves the session
- exits non-zero if any agent does not finish successfully

## Commands

### Create Agents

| Command | Description |
| --- | --- |
| `/spawn [Name:] <task> [--model=m] [#skill]` | Launch an agent. Plain text input does the same. |
| `/plan [Name:] <task> [--model=m]` | Launch a plan-first agent that asks before editing files. |
| `/issue <n>` | Spawn an agent from a GitHub issue using the `gh` CLI. |
| `/specialist <name> <task>` | Spawn with a specialist persona. |
| `/specialist new <name> [global]` | Create a specialist template. |
| `/skill new <name> [global]` | Create a skill template. |

### Steer Agents

| Command | Description |
| --- | --- |
| `@agent <message>` | Send a live instruction to one agent. |
| `@all <message>` | Broadcast an instruction to all agents. |
| `/send <agent\|all> <message>` | Command form of live steering. |
| `/attach <agent\|on\|off>` | Open an agent terminal or toggle automatic terminals. |
| `/focus <agent\|off>` | Route plain input to one agent instead of spawning new agents. |
| `/pause <agent\|all>` | Pause at the next action boundary. |
| `/resume <agent\|all>` | Resume paused agents. |
| `/stop <agent\|all>` | Stop running agents. |
| `/clear` | Remove finished agents from the current display. |

### Git Safety

| Command | Description |
| --- | --- |
| `/undo [agent]` | Revert the last file change made by an agent, with conflict detection. |
| `/commit [agent\|all] [message]` | Commit files touched by an agent or by all agents. |
| `/autocommit <on\|off>` | Commit each agent's changes automatically when it finishes. |

### Views

| Command | Description |
| --- | --- |
| `/agents` | Agent grid. |
| `/board` | Shared blackboard, file activity, claims, and notes. |
| `/notes` | Full notes history. |
| `/diff` | Live diff history. |
| `/cost` | Token and cost breakdown. |
| `/skills` | Available skills. |
| `/specialists` | Available specialists. |
| `/help` | Full command reference. |

### Sessions And Settings

| Command | Description |
| --- | --- |
| `/save [name]` | Save the current session. |
| `/sessions` | List saved sessions. |
| `/session <n\|latest>` | Restore a saved session. |
| `/restore <agent>` | Relaunch a restored agent with its conversation history. |
| `/model [[provider:]model]` | Show or switch the session model. |
| `/key <api-key>` | Store the API key for the active provider. |
| `/approvals <ask\|auto>` | Require or skip shell command approvals for the session. |
| `/sound <on\|off>` | Toggle terminal bell notifications. |
| `/settings` | Edit global language, providers, keys, defaults, and approvals. |
| `/settings-session` | Edit session-only model, approvals, and sound. |
| `/doctor` | Check provider, key, and model configuration. |
| `/quit` | Save the session and exit. |

When there is exactly one agent, commands such as `/undo`, `/focus`, `/pause`, `/resume`, `/stop`, and `/commit` can omit the agent name.

## Providers

Parallel uses OpenAI-compatible chat completions with tool calling. The built-in DeepSeek preset works out of the box once an API key is configured.

Environment variables:

| Variable | Purpose |
| --- | --- |
| `DEEPSEEK_API_KEY` | API key for the built-in DeepSeek provider. |
| `PARALLEL_API_KEY` | Generic fallback API key. |
| `PARALLEL_BASE_URL` | Override the provider base URL. |
| `PARALLEL_MODEL` | Override the session model. |
| `PARALLEL_NO_ALT_SCREEN=1` | Disable the alternate terminal screen. |

Local providers are supported if they expose an OpenAI-compatible endpoint, for example:

- Ollama
- vLLM
- LM Studio
- llama.cpp server
- OpenRouter or other compatible gateways

Configuration is stored in `~/.parallel/config.json`. Project state, sessions, skills, specialists, and memory are stored under `.parallel/` in the selected project.

## Skills And Specialists

Skills are markdown instruction files that agents can load with the `load_skill` tool or that you can force-load with `#skill-name` in a task.

Locations:

- Global skills: `~/.parallel/skills/`
- Project skills: `.parallel/skills/`

Specialists are markdown personas with optional pinned models.

Locations:

- Global specialists: `~/.parallel/specialists/`
- Project specialists: `.parallel/specialists/`

Example task with a forced skill:

```text
> add Redis-backed caching for expensive lookups #redis
```

## How Parallel Avoids Lost Work

Parallel does not lock files. Instead, each agent tracks the last version it read.

When an agent writes a file:

1. Parallel checks whether the file changed since that agent last read it.
2. If the file is unchanged, the write proceeds.
3. If another agent changed it, the write is rejected once.
4. The agent receives the other change as context, re-reads the file, merges both intentions, and retries.

This keeps agents moving without allowing silent overwrites.

## Architecture

At runtime, Parallel is built around four pieces:

- **Controller**: manages agents, approvals, questions, sessions, terminals, commits, and restores.
- **Blackboard**: stores live shared state: agents, logs, notes, claims, file activity, and diffs.
- **Agent loop**: injects live context, calls the model, executes tools, reacts to new information, and marks completion.
- **Ink UI**: renders the hub, agent panels, settings, views, prompts, and attached terminal UI.

Agent tools include:

- `list_files`
- `read_file`
- `write_file`
- `edit_file`
- `search`
- `run_command`
- `post_note`
- `update_status`
- `ask_user`
- `load_skill`
- `claim_files`
- `wait_for_agent`
- `remember`
- `task_complete`

## Package

```bash
npm install -g @parallel-cli/parallel
```

Published package:

- npm: https://www.npmjs.com/package/@parallel-cli/parallel
- GitHub: https://github.com/Nil06/parallel-cli

## Development

```bash
npm install
npm run build
npm test
```

Use a local global link while developing:

```bash
npm link
parallel --help
```

## License

MIT
