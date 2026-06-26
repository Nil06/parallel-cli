# Parallel

Real-time coding agents that work like a live team, not isolated background jobs.

Parallel lets several AI coding agents co-edit the same repository at the same time with shared awareness injected before every model action. Each agent has its own task, mode, live activity timeline, model, and visible coordination context. The TUI stays keyboard-first so you can launch work, inspect progress, answer approvals, steer agents, review risks, and reconcile changes without leaving the terminal.

> One working tree. Many agents. Shared awareness. Human in control.

[![npm version](https://img.shields.io/npm/v/@parallel-cli/parallel?color=blue)](https://www.npmjs.com/package/@parallel-cli/parallel)
![node version](https://img.shields.io/node/v/@parallel-cli/parallel)
![license](https://img.shields.io/npm/l/@parallel-cli/parallel)
![platform](https://img.shields.io/badge/platform-linux%20%7C%20macos-lightgrey)

## Highlights

- Run multiple agents as a live team on one shared working tree.
- Choose explicit modes: `/ask`, `/task`, `/plan`, and `/review`.
- Type plain text to launch a task agent immediately.
- Use context-aware input in the hub, focus view, and attached agent terminals.
- Steer one agent with `@a1 ...` or broadcast with `@all ...`.
- Open dedicated agent terminals with native scrollback.
- Use a cleaner Codex-like hub with a framed header, focused prompt bar, and quieter empty state.
- Review agents, notes, file activity, diffs, cost, skills, specialists, and saved sessions from the TUI.
- Use `/review [agent|all]` to spawn a lightweight ask-mode reviewer with verdict, risks, tests, and files to inspect.
- Avoid lost work with file revision safety: stale `write_file` and `edit_file` calls must re-read and merge before retrying.
- Nudge agents immediately when another agent posts a targeted note, with dedupe and rate-limit safeguards.
- See overlapping claims and repeated co-edit conflicts in the Hub, `/board`, `/diff`, and agent timelines.
- Track shell-created file mutations in the same live diff feed as agent edits.
- Configure OpenAI-compatible providers through a guided wizard and settings panel.
- Use 29 provider presets across Western, Chinese, Gateway, Inference, and Local categories.
- Support local no-key endpoints such as Ollama and vLLM/SGLang.
- Keep shell execution controlled with `ask`, `auto-safe`, or `yolo` approvals.
- Get prompted for npm updates at startup, with an explicit skip path.
- Save and restore project sessions.
- Reuse a persistent, automatically synthesized project map across new agents in the same folder.
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
/ask Reviewer: should we split the CLI parser?
/plan Migration: propose the safest rollout for the config change
/task Builder: implement the approved plan
/review all before we commit
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

## Best Use Case: Coupled Work

Parallel is strongest when the work is too coupled for isolated fan-out and too large for one agent.

Example live-team flow:

```text
/task API: define the new billing quote contract in src/api/quotes.ts
/task Client: build the UI client against the quote contract
/task Tests: write integration coverage for quote creation and validation
```

The API agent can claim `src/api`, post a note with the proposed signature, and update the contract. The client agent sees that note and the diff before its next model action, re-reads the file, and adapts without inventing a second interface. The tests agent watches both sides, adds coverage, and can ask for clarification before the three agents collide.

Before committing:

```text
/review all verify the API contract, client usage, and tests agree
```

The reviewer is ask-only: it does not edit, does not gate the session globally, and returns a structured verdict with risks and validation steps.

## Agent Modes

- `/ask`: questions, reviews, audits, and tradeoffs. The agent answers and advises; mutating tools and shell commands are blocked.
- `/task`: implementation work. The agent can execute, edit, validate, and summarize. It may also conclude that no file change is needed when the task is a verification.
- `/plan`: risky or unclear work. The agent inspects first, presents a plan, then edits only after explicit approval. A timeout does not approve the plan.
- `/review`: lightweight reviewer around `/ask`. It inspects the current shared-tree work and returns `APPROVE`, `REVISE`, or `BLOCK` with risks, tests to run, and files to inspect.

Task and plan agents maintain a small Cursor-style checklist with one active step at a time. The runtime also encourages batched inspection through `read_many` and `inspect_project` so agents avoid slow chains of tiny read-only shell commands.

Every agent also receives an execution profile:

- `quick`: targeted questions, diagnostics, and small changes; six model turns by default.
- `standard`: bounded multi-file work; sixteen model turns by default.
- `deep`: plans, migrations, and long-running refactors; up to the configured global limit.

Parallel selects the profile locally without spending a model call. Override it when needed with `--quick`, `--standard`, or `--deep`, for example `/task --quick fix the sound toggle`. A profile only escalates automatically when the agent discovers concrete cross-file complexity; repeated exploration does not earn more budget.

Aliases:

- `/a` -> `/ask`
- `/t` -> `/task`
- `/p` -> `/plan`

Plain text is equivalent to `/task`.

## Control Room

The main TUI is the Parallel hub. The default view stays intentionally quiet: a Codex-like framed header, cream-toned accents, a focused prompt block, compact cropped agent rows, and detailed status moved into explicit views.

It is designed to answer:

- what needs your input
- which agents are working
- what each agent just did
- what changed in the project
- what model, provider, shell mode, and cost are active

Agent rows stay compact even when summaries are long. Use the row shortcuts to expand the right level of detail:

- `full /focus a1`: open the full in-Hub transcript and result for one agent.
- `term /attach a1`: reopen that agent's dedicated terminal.

Input has three explicit contexts:

- Hub: plain text launches a new `/task` agent. Slash suggestions show hub commands and agent arguments autocomplete for `/focus`, `/send`, `/attach`, `/pause`, `/resume`, `/stop`, `/restore`, and `/commit`.
- Focus: after `/focus a1`, plain text talks to the focused agent instead of spawning a new one. `/raw` affects this view only.
- Attach: in `parallel attach a1`, the same minimal prompt UI steers the attached agent. `/stop` stops the attached agent, `/task`, `/ask`, and `/plan` spawn new agents from that terminal, while `@all ...`, `@a2 ...`, and `/send ...` route instructions through the main session.

Use `Name: task` when naming an agent:

```text
/task Tests: add regression coverage for the auth middleware
/plan Migration: outline the safest database rollout
```

Common hub commands:

- `/agents`: agent overview.
- `/focus a1`: inspect and steer one agent.
- `/raw`: toggle raw detail in focus view.
- `/attach a1`: open or reopen an agent's dedicated terminal.
- `/review all`: ask-mode reviewer with verdict, risks, tests, and files to inspect.
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
- Up/Down selects suggestions in the same order they appear.
- Enter accepts the selected suggestion.
- Tab or Right accepts the best completion.
- `/help` is keyboard navigable: Up/Down moves the visible selection, PgUp/PgDn pages, and Enter runs the selected command.
- Wizard, settings, slash suggestions, and help views use clamped keyboard selection so the highlight does not jump, disappear, or wrap unexpectedly.
- PgUp/PgDn scrolls the hub or focus view even while the input is active. Up/Down scrolls long views and navigates suggestions/history.
- Escape returns to the agents view or clears the input.

Best terminal size is around `120x34`. Parallel adapts to smaller terminals, but the hub is most readable with enough width for model, folder, status, and agent summaries.

## Dedicated Agent Terminals

Each agent can have its own terminal connected to the same session:

```bash
parallel attach a1 --root .
```

Attached terminals show:

- a launch header with agent, mode, model, and task
- the selected agent's live timeline
- native terminal scrollback
- append-only final results after `done`, `error`, or `stopped`
- model, elapsed time, context, and cost
- other agents' current state
- approval and question prompts for that agent
- an input that steers that agent directly

From an attached terminal:

```text
plain text sends a message to this agent
@all pause public interface changes until tests finish
@a2 re-read the API client before editing it
/send a2 check the new parser contract
/task Tests: write parser regression tests
/ask Reviewer: is this result safe to merge?
/plan Migration: prepare a migration plan
/review all before commit
/stop
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
- `PARALLEL_SKIP_UPDATE_CHECK=1`: disable npm update checks.

## Updates

On interactive startup, Parallel checks npm at most once per day for a newer `@parallel-cli/parallel` version. The check is skipped in `attach`, `--headless`, `--first-run`, CI, non-TTY sessions, or when `PARALLEL_SKIP_UPDATE_CHECK=1` is set.

When an update is available, Parallel asks before running:

```bash
npm install -g @parallel-cli/parallel
```

If the update succeeds, restart Parallel to run the new version. Use `parallel --no-update` for a one-off launch without checking.

## Commands

### Create Agents

- `/ask [Name:] <question> [--model=m]`: launch an ask-only agent.
- `/task [Name:] <task> [--model=m] [#skill]`: launch a task agent. Plain text does the same.
- `/plan [Name:] <task> [--model=m]`: launch a plan-first agent. It cannot mutate files or run risky shell commands until you manually approve the plan.
- `/review [agent|all] [prompt]`: launch a lightweight ask-mode reviewer for one agent or the whole shared tree.
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
- `/board`: shared blackboard, work-map warnings, claims, file activity, and notes.
- `/notes`: full notes history.
- `/diff`: live diff history.
- `/cost`: token and cost breakdown.
- `/status`: session model, approval mode, agents, and cost snapshot.
- `/memory`: show shared project-memory freshness, model, tokens, and cost.
- `/memory refresh`: force a visible regeneration of the shared project map.
- `/skills`: available skills.
- `/specialists`: available specialists.
- `/save [name]`: save the current session.
- `/sessions`: list saved sessions.
- `/session <n|latest>`: load a saved session snapshot. If active agents are running, use `/session <n|latest> --force` after saving/stopping what you need.
- `/restore <agent>`: relaunch a restored agent by name, alias, or saved id when its conversation history is still available.

Project and session memory have three distinct layers:

- Live memory: active agents see statuses, notes, claims, work-map warnings, file activity, and recent diffs before every model action.
- Project memory: `.parallel/project-context.json` stores a model-generated architecture map, entry points, conventions, pitfalls, file hashes, and recent completed work. It loads automatically for every new agent in the same folder.
- Local index: `.parallel/index/manifest.json` incrementally records text files, symbols, imports, hashes, and searchable terms. Before the first model call, Parallel uses it to rank the files relevant to the current task.
- Session/conversation memory: `/save` and autosave persist coordination state and per-agent conversation paths for explicit `/restore`.

Parallel prewarms project memory when a project opens, but the first agent never waits for an LLM-generated synthesis. It immediately uses the persisted map, deterministic fallback, and local task-oriented index while enrichment continues in the background. `/memory` reports both map and index freshness.

Agents trust the project map for orientation, but re-read files that are relevant, unknown, stale, or about to be modified. Full conversations are never copied into unrelated new agents. Restore remains best effort and explicit: `/session` reloads coordination memory, while `/restore <agent>` relaunches the selected agent with its prior conversation when available.

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
- `/doctor`: run local readiness diagnostics for provider, key, model, endpoint, project memory, attach socket, and Git tooling.
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
- `yolo`: auto-approve every shell command. Intended only for fully trusted local runs.

`auto` is accepted as a compatibility spelling for `auto-safe`.

## Security And Privacy

Parallel stores credentials and session state with owner-only permissions where supported:

- `~/.parallel/config.json` and `~/.parallel/update.json` are written privately and atomically.
- Project runtime files under `.parallel/` use private directories for sessions, conversations, project context, memory, socket state, and attach tokens.
- Attached terminals authenticate to the running session with a per-session token; local clients without the token cannot steer agents or answer approvals.
- `/doctor` reports local permission warnings alongside provider, model, endpoint, attach socket, `git`, and `gh` checks.
- Command output shown in logs is sanitized to strip terminal escape/control sequences.
- Clipboard images require a second `Ctrl+V` confirmation before they are attached and sent to the selected model provider.

Shell safety is still a shared responsibility. `auto-safe` uses conservative heuristics, while `yolo` deliberately grants full local command execution to agents.

## Sessions, Skills, And Specialists

Parallel stores project state under `.parallel/` in the selected project directory. That includes saved sessions, the generated project context, durable facts, skills, specialists, and session socket state.

`.parallel/state.json` remains a best-effort diagnostic snapshot. It is not loaded as conversation history; use project memory for shared understanding and `/restore` for exact agent continuity.

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
3. If another agent or shell command changed it, the write is rejected with an adaptation diff.
4. The stale baseline is not silently synchronized. The agent must call `read_file`, merge both intentions on top of the current revision, and retry.

The same stale-read guard applies to `edit_file`, even when `old_string` still exists. This keeps agents moving without allowing silent overwrites.

Commands run through `run_command` are also snapshotted before and after execution. If a shell command edits, creates, or deletes tracked project files, Parallel records those mutations in `/diff`, `/board`, and `/commit` ownership just like tool-based edits.

The work map is advisory, not a lock. Agents can declare claims with `claim_files`; Parallel detects overlapping claims and repeated conflicts, then shows non-blocking warnings in `/board` and injects them into agent context so agents can coordinate before collisions become expensive.

## Shared-Tree Vs Isolated Agents

Use Parallel's shared-tree mode when agents need to negotiate live contracts: API and client, schema and tests, parser and docs, or any change where one agent's edit should affect another agent's next step.

Use isolated agents or separate worktrees for embarrassingly parallel work: unrelated files, independent chores, or experiments you only want to merge after review. Parallel's identity is the shared-tree team workflow; isolation is a future complement, not the default.

## Headless Mode

For CI and scripts, run without the TUI:

```bash
parallel --headless "fix lint failures" "update tests" --json
```

Headless mode:

- runs one agent per task
- uses the current folder as the project root
- uses `auto-safe` shell approvals by default
- auto-answers agent questions with the recommended option
- saves the session
- exits non-zero if any agent does not finish successfully

For fully trusted automation where every shell command should be approved without prompts, opt in explicitly:

```bash
parallel --headless --yolo "run the release checklist" --json
```

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
