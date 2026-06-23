# Parallel

Real-time multi-agent coding from one terminal control room.

Parallel lets you run several AI coding agents on the same repository at the same time. Each agent has its own task, mode, live activity timeline, model, and shared session context. The TUI stays keyboard-first so you can launch work, inspect progress, answer approvals, steer agents, and review changes without leaving the terminal.

> One hub. Many agents. Shared context. Human in control.

[![npm version](https://img.shields.io/npm/v/@parallel-cli/parallel?color=blue)](https://www.npmjs.com/package/@parallel-cli/parallel)
![node version](https://img.shields.io/node/v/@parallel-cli/parallel)
![license](https://img.shields.io/npm/l/@parallel-cli/parallel)
![platform](https://img.shields.io/badge/platform-linux%20%7C%20macos-lightgrey)

## Highlights

- Run multiple agents in parallel on one project.
- Choose explicit modes: `/ask`, `/task`, and `/plan`.
- Type plain text to launch a task agent immediately.
- Steer one agent with `@a1 ...` or broadcast with `@all ...`.
- Open dedicated agent terminals with native scrollback.
- Review agents, notes, file activity, diffs, cost, skills, specialists, and saved sessions from the TUI.
- Configure OpenAI-compatible providers through a guided wizard and settings panel.
- Use 29 provider presets across Western, Chinese, Gateway, Inference, and Local categories.
- Support local no-key endpoints such as Ollama and vLLM/SGLang.
- Keep shell execution controlled with `ask`, `auto-safe`, or `yolo` approvals.
- Save and restore project sessions.
- Run headless multi-agent jobs for CI or scripts.

## Install

Requirements:

- Node.js 18 or newer
- Linux or macOS
- An API key for a cloud provider, or a local OpenAI-compatible endpoint

Install from npm:

```bash
npm install -g @parallel-cli/parallel
```

Run inside a project:

```bash
parallel
```

Short alias:

```bash
prl
```

## Quick Start

On first launch, Parallel opens a setup wizard:

1. Choose language.
2. Choose the project folder.
3. Restore a saved session or start a new one.
4. Choose a provider.
5. Choose the model.
6. Review or edit the endpoint.
7. Enter the provider API key if required.

After setup, type a task and press Enter:

```text
> refactor the API client and update the tests
```

Plain text launches a `/task` agent. You can launch another agent while the first is still working:

```text
> add regression coverage for auth middleware
```

Use explicit modes when intent matters:

```text
/ask reviewer should we split the CLI parser?
/plan migration propose the safest rollout for the config change
/task builder implement the approved plan
```

Steer a running agent:

```text
@a1 also handle empty response bodies
```

Broadcast to every agent:

```text
@all stop changing public interfaces until the test agent finishes
```

`@all` steers active agents in real time. Finished, stopped, or errored agents are not relaunched by a broadcast.

## Agent Modes

- `/ask`: questions, reviews, audits, and tradeoffs. The agent answers and advises; mutating tools and shell commands are blocked.
- `/task`: implementation work. The agent can execute, edit, validate, and summarize.
- `/plan`: risky or unclear work. The agent inspects first, presents a plan, then edits only after explicit approval. A timeout does not approve the plan.

Aliases:

- `/a` -> `/ask`
- `/t` -> `/task`
- `/p` -> `/plan`

Plain text is equivalent to `/task`.

## Control Room

The main TUI is the Parallel hub. It is designed to answer:

- what needs your input
- which agents are working
- what each agent just did
- what changed in the project
- what model, provider, shell mode, and cost are active

Common hub commands:

- `/agents`: agent overview.
- `/focus a1`: inspect and steer one agent.
- `/raw`: toggle raw detail in focus view.
- `/board`: shared blackboard, claims, notes, and file activity.
- `/diff`: live diff history.
- `/cost`: token and cost breakdown.
- `/sessions`: saved sessions.
- `/settings`: global settings.
- `/settings-session`: session-only settings.
- `/project [folder]`: change project folder.
- `/wizard`: rerun setup wizard.

Commands are typed in the control room input. When a long view is open, use Escape to return to the agents view/input.

Keyboard behavior:

- `/` opens slash command suggestions.
- Up/Down selects suggestions when a suggestion menu is open.
- Enter accepts the selected suggestion.
- Tab or Right accepts the best completion.
- PgUp/PgDn scrolls the hub or focus view even while the input is active. Up/Down scrolls long views and navigates suggestions/history.
- Escape returns to the agents view or clears the input.

Best terminal size is around `120x34`. Parallel adapts to smaller terminals, but the hub is most readable with enough width for model, folder, status, and agent summaries.

## Dedicated Agent Terminals

Each agent can have its own terminal connected to the same session:

```bash
parallel attach a1 --root .
```

Attached terminals show:

- the selected agent's live timeline
- native terminal scrollback
- model, elapsed time, context, and cost
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

## Providers And Models

Parallel works with OpenAI-compatible chat completions and tool calling. It ships with 29 presets:

- Western: OpenAI, Anthropic, Google Gemini, xAI Grok, Mistral, Cohere, Perplexity
- Chinese: DeepSeek, MiniMax, Z.ai / GLM, Alibaba / Qwen, Moonshot / Kimi, Xiaomi / MiMo, StepFun
- Gateways: OpenRouter, SiliconFlow, Atlas Cloud, Requesty, Vercel AI Gateway
- Inference: Groq, Cerebras, Together AI, Fireworks, DeepInfra, Novita, Hyperbolic, SambaNova
- Local: Ollama, vLLM / SGLang

Provider setup is guided in both the first-run wizard and `/settings`:

1. Pick a provider preset or custom provider.
2. Pick the model.
3. Review or edit the endpoint.
4. Enter the provider API key if the provider requires one.
5. Save globally or use the provider/model for the current session.

Local providers such as Ollama, vLLM/SGLang, and custom localhost OpenAI-compatible endpoints do not require an API key. You can still review and edit their endpoints. Ollama/local OpenAI-compatible endpoints can detect models from `/models`; vLLM/SGLang requires replacing the `your-model-here` placeholder before it is considered ready.

Useful settings commands:

- `/settings`: global language, providers, keys, defaults, and approvals.
- `/settings-session`: temporary model, provider, approvals, and sound. New providers can be used for this session only or saved globally.
- `/model`: show the current session model.
- `/model provider:id`: switch model for this session.
- `/doctor`: check provider, model, API key, local endpoint reachability, attach socket, `git`, and `gh`.

Configuration is stored in `~/.parallel/config.json`.

Environment variables:

- `PARALLEL_API_KEY`: API key for the current default provider.
- `PARALLEL_BASE_URL`: override the default provider base URL.
- `PARALLEL_MODEL`: override the session model.
- `PARALLEL_NO_ALT_SCREEN=1`: disable the alternate terminal screen.

## Commands

### Create Agents

- `/ask [Name:] <question> [--model=m]`: launch an ask-only agent.
- `/task [Name:] <task> [--model=m] [#skill]`: launch a task agent. Plain text does the same.
- `/plan [Name:] <task> [--model=m]`: launch a plan-first agent. It cannot mutate files or run risky shell commands until you manually approve the plan.
- `/issue <n>`: spawn a task from a GitHub issue. Requires the `gh` CLI, a GitHub repository, and `gh auth login`.
- `/specialist <name> <task>`: spawn with a specialist persona.
- `/specialist new <name> [global]`: create a specialist template.
- `/skill new <name> [global]`: create a skill template.

### Steer Agents

- `@agent <message>`: send a live instruction to one agent.
- `@all <message>`: broadcast an instruction to all agents.
- `/send <agent|all> <message>`: command form of live steering.
- `/attach <agent|on|off>`: open an agent terminal or toggle automatic terminals.
- `/focus <agent|off>`: route plain input to one agent instead of spawning new agents.
- `/pause <agent|all>`: pause at the next action boundary.
- `/resume <agent|all>`: resume paused agents.
- `/stop <agent|all>`: stop running agents.
- `/clear`: remove finished agents from the current display.
- `/raw`: toggle conversation-raw view.
- `/copy`: copy the latest completed result to clipboard.

### Git Safety

- `/undo [agent]`: revert the last file change made by an agent, with conflict detection.
- `/commit [agent|all] [message]`: commit only files touched by the selected agent or by all agents. It does not run `git add -A`. With exactly one agent, `/commit message...` uses that agent and treats the rest as the message.
- `/autocommit <on|off>`: commit each agent's touched files automatically when it finishes. This is session-only.

### Views And Sessions

- `/agents`: agent overview.
- `/board`: shared blackboard, file activity, claims, and notes.
- `/notes`: full notes history.
- `/diff`: live diff history.
- `/cost`: token and cost breakdown.
- `/status`: session model, approval mode, agents, and cost snapshot.
- `/skills`: available skills.
- `/specialists`: available specialists.
- `/save [name]`: save the current session.
- `/sessions`: list saved sessions.
- `/session <n|latest>`: load a saved session snapshot. If active agents are running, use `/session <n|latest> --force` after saving/stopping what you need.
- `/restore <agent>`: relaunch a restored agent with its conversation history.

### Settings And Exit

- `/model [[provider:]model]`: show or switch the session model.
- `/approvals <ask|auto|auto-safe|yolo>`: set shell approvals for this session.
- `/sound <on|off>`: toggle terminal bell notifications.
- `/settings`: edit global language, providers, keys, defaults, and approvals.
- `/settings-session`: edit session-only model, provider, approvals, and sound.
- `/project [folder]`: change project folder or reopen the folder picker. If agents are active, use `/project [folder] --force` after saving/stopping what you need.
- `/folder [folder]`: alias for `/project`.
- `/wizard`: relaunch the setup wizard. If agents are active, use `/wizard --force` after saving/stopping what you need.
- `/setup`: alias for `/wizard`.
- `/doctor`: run local readiness diagnostics for provider, key, model, endpoint, attach socket, and Git tooling.
- `/help`: full command reference.
- `/quit`: save the session and exit.

When there is exactly one agent, commands such as `/undo`, `/focus`, `/pause`, `/resume`, `/stop`, and `/commit` can omit the agent name.

## Shell Approvals

Parallel separates agent modes from shell approval behavior.

```text
/approvals ask
/approvals auto-safe
/approvals yolo
```

- `ask`: ask before shell commands unless explicitly allowed.
- `auto-safe`: auto-approve safe inspection/build/test commands and ask for risky commands.
- `yolo`: auto-approve every shell command. Intended for trusted/headless usage only.

`auto` is accepted as a compatibility spelling for `auto-safe`.

## Sessions, Skills, And Specialists

Parallel stores project state under `.parallel/` in the selected project directory. That includes saved sessions, memory, skills, specialists, and session socket state.

Skills are markdown instruction files agents can load with the `load_skill` tool or that you can force-load with `#skill-name` in a task:

```text
> add Redis-backed caching for expensive lookups #redis
```

Skill locations:

- Global skills: `~/.parallel/skills/`
- Project skills: `.parallel/skills/`

Specialists are reusable personas with optional pinned models.

Specialist locations:

- Global specialists: `~/.parallel/specialists/`
- Project specialists: `.parallel/specialists/`

## How Parallel Avoids Lost Work

Parallel does not lock files. Instead, each agent tracks the last version it read.

When an agent writes a file:

1. Parallel checks whether the file changed since that agent last read it.
2. If the file is unchanged, the write proceeds.
3. If another agent changed it, the write is rejected once.
4. The agent receives the other change as context, re-reads the file, merges both intentions, and retries.

This keeps agents moving without allowing silent overwrites.

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

## Package Contents

The npm package is intentionally small. It publishes the compiled runtime and public release docs only:

- `dist/`
- `README.md`
- `CHANGELOG.md`
- `LICENSE`

Internal development files such as source tests and design docs are not part of the npm package.

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md).

## Links

- npm: [@parallel-cli/parallel](https://www.npmjs.com/package/@parallel-cli/parallel)
- GitHub: [Nil06/parallel-cli](https://github.com/Nil06/parallel-cli)

## License

MIT
