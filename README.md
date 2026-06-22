# Parallel

Real-time multi-agent coding from one terminal control room.

Parallel lets you run several AI coding agents on the same repository at the same time. Each agent has its own task, mode, terminal, live activity timeline, and shared view of the session. The hub keeps you in control: what is running, what needs input, what changed, what it cost, and where to steer next.

> One hub. Many agents. Shared context. No silent overwrites.

[![npm version](https://img.shields.io/npm/v/@parallel-cli/parallel?color=blue)](https://www.npmjs.com/package/@parallel-cli/parallel)
![node version](https://img.shields.io/node/v/@parallel-cli/parallel)
![license](https://img.shields.io/npm/l/@parallel-cli/parallel)
![platform](https://img.shields.io/badge/platform-linux%20%7C%20macos-lightgrey)

## What Parallel Is

Parallel is built for active coding sessions where one agent is not enough:

- ask one agent to audit while another implements
- run a plan-first agent before allowing edits
- keep a test-focused agent watching regressions
- steer any agent live without stopping the others
- open a dedicated terminal for deep scrollback on one agent

The philosophy is simple: agents can move in parallel, but the human keeps the control room.

## Features

- Launch agents in three explicit modes: `/ask`, `/task`, and `/plan`.
- Type plain text to launch a task agent immediately.
- Run multiple agents at once on the same repository.
- Open a dedicated terminal per agent with native scrollback and live steering.
- See structured activity timelines instead of raw tool spam.
- Share live context between agents: status, notes, claims, file activity, and diffs.
- Avoid silent overwrites with adaptive merge-on-write for file edits.
- Pause, resume, stop, focus, restore, and steer agents while they are running.
- Review live diffs, notes, costs, sessions, skills, and specialists from built-in views.
- Use any OpenAI-compatible provider — 17 pre-configured cloud providers (DeepSeek, xAI/Grok, Perplexity, Cohere, DeepInfra, Fireworks, Cerebras, Novita, Hyperbolic, SambaNova, and more), plus Ollama for local models, and any custom OpenAI-compatible endpoint.
- Choose shell approval behavior: `ask`, `auto-safe`, or `yolo`.
- Track token usage and estimated cost per agent and per session.

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

On first launch, Parallel opens a setup wizard for language, folder, session, provider, and model.

After setup, type a task and press Enter:

```text
> refactor the API client and update the tests
```

Plain text launches a `/task` agent. Start another agent at any time, even while the first one is still working:

```text
> add regression coverage for auth middleware
```

Use explicit modes when intent matters:

```text
/ask reviewer should we split the CLI parser?
/plan migration propose the safest rollout for the config change
/task builder implement the approved plan
```

Send a live instruction to one agent:

```text
@a1 also handle empty response bodies
```

Broadcast to every agent:

```text
@all stop changing public interfaces until the test agent finishes
```

## Agent Modes

| Mode | Use it for | Behavior |
| --- | --- | --- |
| `/ask` | Questions, reviews, audits, tradeoffs | Answers and advises without editing files. |
| `/task` | Implementation work | Executes, edits, validates, and summarizes. |
| `/plan` | Risky or unclear work | Inspects first, asks for approval, then edits only after approval. |

Aliases:

- `/a` -> `/ask`
- `/t` -> `/task`
- `/p` -> `/plan`

Plain text is equivalent to `/task`.

## Control Room

The main TUI is the Parallel hub. It is designed to answer four questions quickly:

- What needs my input?
- Which agents are working?
- What did each agent just do?
- What model, folder, shell mode, and cost am I currently running?

Useful hub commands:

```text
/agents              agent overview
/focus a1            inspect and steer one agent
/raw                 toggle raw detail in focus view
/board               shared blackboard, claims, file activity
/diff                live diff history
/cost                token and cost breakdown
/sessions            saved sessions
/settings            global settings
/settings-session    session-only settings
```

Best terminal size is around `120x34`. Parallel still adapts to smaller terminals, but the hub is most readable with enough width for model, folder, status, and agent summaries.

## Dedicated Agent Terminals

Each agent can have its own terminal connected to the same session:

```bash
parallel attach a1 --root .
```

Attached terminals show:

- the selected agent's live timeline
- native terminal scrollback
- model, elapsed time, steps, tokens, context percentage, and cost
- other agents' current state
- approval and question prompts for that agent
- an input that steers that agent directly

From an attached terminal:

```text
plain text sends a message to this agent
/task write parser regression tests
/ask is this result safe to merge?
/plan prepare a migration plan
/raw
/quit
```

Toggle automatic agent terminals from the hub:

```text
/attach on
/attach off
```

## Shell Approvals

Parallel separates agent modes from shell approval behavior.

```text
/approvals ask
/approvals auto-safe
/approvals yolo
```

| Mode | Behavior |
| --- | --- |
| `ask` | Ask before shell commands unless explicitly allowed. |
| `auto-safe` | Auto-approve safe inspection/build/test commands; ask for risky commands. |
| `yolo` | Auto-approve every shell command. Intended for trusted/headless usage only. |

`auto` is accepted as a compatibility spelling for `auto-safe`.

## Headless Mode

For CI and scripts, run without the TUI:

```bash
parallel --headless "fix lint failures" "update tests" --json
```

Headless mode:

- runs one agent per task
- uses the current folder as the project root
- uses `yolo` shell approvals
- auto-answers agent questions with the recommended option
- saves the session
- exits non-zero if any agent does not finish successfully

## Commands

### Create Agents

| Command | Description |
| --- | --- |
| `/ask [Name:] <question> [--model=m]` | Launch an ask-only agent. |
| `/task [Name:] <task> [--model=m] [#skill]` | Launch a task agent. Plain text does the same. |
| `/plan [Name:] <task> [--model=m]` | Launch a plan-first agent. |
| `/issue <n>` | Spawn a task from a GitHub issue using the `gh` CLI. |
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
| `/raw` | | Toggle conversation-raw view. |
| `/copy` | | Copy latest completed result to clipboard. |

### Git Safety

| Command | Description |
| --- | --- |
| `/undo [agent]` | Revert the last file change made by an agent, with conflict detection. |
| `/commit [agent\|all] [message]` | Commit files touched by an agent or by all agents. |
| `/autocommit <on\|off>` | Commit each agent's changes automatically when it finishes. |

### Views And Sessions

| Command | Description |
| --- | --- |
| `/agents` | Agent overview. |
| `/board` | Shared blackboard, file activity, claims, and notes. |
| `/notes` | Full notes history. |
| `/diff` | Live diff history. |
| `/cost` | Token and cost breakdown. |
| `/status` | | Session model, approval mode, agents, cost snapshot. |
| `/skills` | Available skills. |
| `/specialists` | Available specialists. |
| `/save [name]` | Save the current session. |
| `/sessions` | List saved sessions. |
| `/session <n\|latest>` | Restore a saved session. |
| `/restore <agent>` | Relaunch a restored agent with its conversation history. |

### Settings

| Command | Description |
| --- | --- |
| `/model [[provider:]model]` | Show or switch the session model. |
| `/key <api-key>` | Store the API key for the active provider. |
| `/approvals <ask\|auto\|auto-safe\|yolo>` | Set shell approvals for this session. |
| `/sound <on\|off>` | Toggle terminal bell notifications. |
| `/settings` | Edit global language, providers, keys, defaults, and approvals. |
| `/settings-session` | Edit session-only model, approvals, and sound. |
| `/doctor` | Check provider, key, and model configuration. |
| `/help` | Full command reference. |
| `/quit` | Save the session and exit. |

When there is exactly one agent, commands such as `/undo`, `/focus`, `/pause`, `/resume`, `/stop`, and `/commit` can omit the agent name.

## Providers

Parallel ships with **17 pre-configured cloud providers** with verified endpoints and curated model lists, plus **Ollama** for local models with automatic model detection. All providers use OpenAI-compatible chat completions with tool calling. You can also add any custom OpenAI-compatible endpoint.

The built-in DeepSeek preset works out of the box once an API key is configured. Additional providers like xAI/Grok, Perplexity, Cohere, DeepInfra, Fireworks, Cerebras, Novita, Hyperbolic, and SambaNova are available for selection during setup or from the Providers settings submenu.

Environment variables:

| Variable | Purpose |
| --- | --- |
| `DEEPSEEK_API_KEY` | API key for the built-in DeepSeek provider. |
| `PARALLEL_API_KEY` | Generic fallback API key. |
| `PARALLEL_BASE_URL` | Override the provider base URL. |
| `PARALLEL_MODEL` | Override the session model. |
| `PARALLEL_NO_ALT_SCREEN=1` | Disable the alternate terminal screen. |

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

## Codebase Map

The runtime is intentionally small:

- `src/index.tsx`: CLI entrypoint, TUI launch, attach mode, and headless mode.
- `src/controller.ts`: session state, agents, approvals, questions, terminals, commits, and restores.
- `src/coordination/blackboard.ts`: shared live state for agents, logs, notes, file activity, claims, and diffs.
- `src/agents/agent.ts`: agent loop, mode instructions, live context injection, and completion.
- `src/agents/tools.ts`: file, shell, note, skill, memory, and question tools.
- `src/server.ts`: Unix socket bridge for dedicated agent terminals.
- `src/ui/`: Ink components for the hub, timelines, settings, prompts, and attach UI.
- `src/commands.ts`: hub command registry, hidden compatibility commands, aliases, and dispatch.
- `src/config.ts` and `src/i18n.ts`: provider/session config and translations.

## Changelog

### 0.4.1

- **17 pre-configured cloud providers** with verified endpoints and curated model lists (up from 8). Added: xAI/Grok, Perplexity, Cohere, DeepInfra, Fireworks, Cerebras, Novita, Hyperbolic, SambaNova.
- **Ollama (local models)** as a first-class preset with automatic connectivity check and model detection.
- **Wizard redesign** — provider selection now grouped by category (Configured, Cloud, Local, Custom) instead of a flat list.
- **Settings reorganization** — all provider actions (keys, models, pricing, add/remove) consolidated under a "Providers" submenu; settings root reduced from 13 to 8 items.
- **Provider removal** — can now remove configured providers from settings.
- Custom provider option always available for any OpenAI-compatible endpoint.

### 0.4.0

- **Removed `/spawn`** — use `/task` instead. The alias was redundant and its removal simplified the command registry.
- **System messages color-coded by severity** — green for success, yellow for warnings, red for errors, gray for informational. Applied across all ~40 system messages in every command.
- **UI fully internationalized** — all wizard screens, menus, and prompts now available in English, French, Spanish, and Chinese (zh).
- **AgentHub header indicators** — the hub header now shows the active mode, model, and context usage at a glance.
- **Fixed `/pause` double-call** — rapid consecutive `/pause` invocations no longer trigger the action twice.

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

Published package:

- npm: https://www.npmjs.com/package/@parallel-cli/parallel
- GitHub: https://github.com/Nil06/parallel-cli

## License

MIT
