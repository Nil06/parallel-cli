# Changelog

All notable changes to Parallel are documented here.

## 0.5.2 - 2026-06-28

### 0.5.2 Changed

- Reworked Hub agent rows so task, result, validation, file, risk, and change summaries wrap instead of being truncated.
- Moved per-agent runtime, context, tool, cache, and cost telemetry into a separate muted strip after `Changes`.
- Made Hub scrolling operate over long agent rows so large multi-agent sessions can page through each agent result.

### 0.5.2 Fixed

- Removed the detailed “Real changes” diff box from focused agent transcripts; compact change counts remain in the Hub and full patches remain available through `/diff`.

## 0.5.1 - 2026-06-27

### 0.5.1 Added

- Added compact live diff previews to focused and attached agent timelines, reusing the same green/red patch rendering as `/diff`.

### 0.5.1 Changed

- Made timeline narration context-specific by naming the file, command, or coordination signal currently being handled instead of repeating generic phase text.
- Tightened agent progress guidance so visible steps and current actions name concrete files, commands, behaviors, or validation targets.
- Centralized audible notifications for the hub and attached terminals with a quieter best-effort fallback strategy.

### 0.5.1 Fixed

- Fixed backspace removal for collapsed paste chips that include the trailing space inserted after the marker.
- Fixed attached terminal live activity missing the actual edited lines even though `/diff` already had the full patch.

## 0.5.0 - 2026-06-25

### 0.5.0 Added

- Added an automatically generated, versioned project context in `.parallel/project-context.json`, shared by every new agent in the same folder.
- Added targeted freshness tracking for files inspected by agents, including content hashes and stale-file warnings.
- Added visible project-memory indexing, deterministic fallback, token/cost accounting, `/memory`, and `/memory refresh`.
- Added restored-session summaries directly to new-agent bootstrap context instead of relying on historical notes.
- Added an agent performance diagnostician and deterministic simulator for model rounds, tool churn, shell micro-commands, repeated reads, hidden compactions, and context amplification.
- Added adaptive Quick, Standard, and Deep execution profiles with visible badges and `--quick`, `--standard`, and `--deep` overrides.
- Added a persistent incremental lexical/symbol index under `.parallel/index/` and task-oriented retrieval before the first model call.
- Added targeted line-range reads, bounded tool output artifacts, provider retry/cache telemetry, and runtime convergence budgets.

### 0.5.0 Changed

- New agents now start from shared architecture, conventions, pitfalls, entry points, and recent work instead of treating the repository as unknown.
- Replaced generic “explore first” prompting with targeted verification of relevant, unknown, stale, or soon-to-be-modified files.
- Kept full conversations isolated per agent; `/restore` remains the explicit path for exact conversation continuity.
- Session snapshots now record inspected files and project-context metadata while remaining compatible with older snapshots.
- Agent telemetry now records provider wait time, hidden compaction time/calls, and peak prompt tokens.
- Quick and Standard agents now keep a bounded recent window plus a deterministic work ledger instead of repeatedly sending every raw tool result.
- Project-memory enrichment now runs in the background; startup no longer waits up to 20 seconds before useful work can begin.
- Ordinary inter-agent notes are batched for the next natural turn instead of aborting an in-flight model request.
- Included stable Settings and Wizard list navigation/windowing fixes.

### 0.5.0 Fixed

- Fixed newly spawned agents ignoring all useful work, notes, and conclusions that existed before their creation.
- Fixed loaded-session summaries being added to the blackboard and then skipped by the next agent’s note cursor.
- Fixed repetitive generic “Explore the project” progress steps when a valid project map already exists.
- Fixed simple investigations inheriting the same 60-turn allowance as long-running plans.
- Fixed large command and inspection results remaining in every later prompt.

## 0.4.9 - 2026-06-24

### 0.4.9 Added

- Added private, atomic persistence helpers for config, update state, session snapshots, conversations, and project memory.
- Added per-session attach socket authentication with a private token file and owner-only socket permissions.
- Added security diagnostics to `/doctor` for local config and `.parallel` permissions.
- Added a visible clipboard image consent step before sending pasted images to the selected model provider.
- Added a dedicated long-memory compaction UX signal with cleaner wording, spacing, and timeline rendering.

### 0.4.9 Changed

- Changed `--headless` to use `auto-safe` shell approvals by default; full auto-approval now requires explicit `--yolo`.
- Hardened shell risk detection for download-and-execute chains, inline interpreters, network exfiltration tools, sensitive redirections, and risky package scripts.
- Scoped “always approve” shell approvals to the normalized full command instead of the command basename.
- Marked user tasks, live notes, restored summaries, and agent state as untrusted data in model context so they cannot override safety or tool policy.
- Added best-effort cleanup for old saved sessions.

### 0.4.9 Fixed

- Fixed sensitive files inheriting permissive umasks such as `0644` on systems with group-writable defaults.
- Fixed unauthenticated local processes being able to control a running attach socket.
- Fixed ANSI/OSC terminal escape sequences passing through command output logs unfiltered.

## 0.4.8 - 2026-06-24

### 0.4.8 Changed

- Added clearer attached-terminal control with `/stop`, visible stop hints for active agents, and command palette support in attached terminals.
- Made hidden Hub progress explicit by showing `+N steps` with direct `full /focus aN` and `term /attach aN` shortcuts when rows are truncated.
- Froze elapsed-time telemetry once agents reach `done`, `error`, or `stopped` so finished agents no longer keep counting.

### 0.4.8 Fixed

- Fixed OpenAI-compatible `tool_calls` history failures by recording assistant tool calls and all matching tool results atomically, even when a task completes early or an agent is stopped.
- Repaired restored conversations with missing tool results before the next model call to prevent 400 errors after interrupted runs.
- Restored a bounded live activity timeline in attached terminals while preserving append-only native scrollback for final results.

## 0.4.7 - 2026-06-24

### 0.4.7 Added

- Added file revision safety for shared-tree co-editing so stale `write_file` retries and `edit_file` calls must re-read and merge concurrent work before mutating.
- Added immediate agent-to-agent note nudging with duplicate-note suppression, active-agent checks, and rate-limit safeguards.
- Added visible coordination signals in the Hub, `/board`, `/diff`, and timelines for claims, work-map warnings, notes, approvals, and questions.
- Added `/review [agent|all] [prompt]`, a lightweight ask-mode reviewer that returns `APPROVE`, `REVISE`, or `BLOCK` with risks, tests to run, and files to inspect.
- Added Cursor-style per-agent progress steps through `update_steps`, visible in the Hub and attached terminals.
- Added batched read-only inspection tools (`read_many`, `inspect_project`) plus lightweight performance counters for model turns, tool calls, shell commands, and context usage.

### 0.4.7 Changed

- Reworked `/board` into a coordination surface with Work map warnings first, agent/path/time metadata, and suggestions to inspect `/focus` or `/diff`.
- Prioritized incoming notes and work-map context in agent live context so coordination updates are handled before ordinary activity.
- Updated product messaging around shared awareness: agents work like a live team on one working tree, not isolated background jobs.
- Reworked agent rows to keep the Hub compact with cropped summaries, cream bullet recaps capped at four lines, mode badges, and visible `full /focus aN` plus `term /attach aN` shortcuts.
- Reworked dedicated agent terminals with a launch header, hidden raw launch noise in normal mode, append-only final results, and a small live status region so native scrollback remains usable.
- Tuned agent prompts by mode so `/ask`, `/task`, `/plan`, and `/review` use clearer contracts, early progress steps, batched inspection, and less redundant shell micro-commanding.

### 0.4.7 Fixed

- Fixed the previous collision retry weakness where a stale writer could receive an adaptation diff and then overwrite without a real re-read.
- Fixed `edit_file` allowing targeted edits on a stale file as long as `old_string` still existed.
- Fixed timeline narration being hardcoded in French by routing narration through i18n.
- Fixed `claim_files` appearing as generic file activity instead of coordination activity.
- Fixed completed attached terminals repainting large dynamic result panels that could trap mouse-wheel scroll at the top.

## 0.4.6 - 2026-06-24

### 0.4.6 Added

- Added an interactive npm update prompt on startup with daily cache, CI/headless/attach skips, `PARALLEL_SKIP_UPDATE_CHECK=1`, and `--no-update`.
- Added a Codex-like empty hub with a quieter framed header, cream-toned accents, and a full-width prompt block with distinct background.
- Added a complete paginated slash palette driven by one deterministic rendered order.
- Added selectable `/help` command navigation with visible highlight and Enter-to-run behavior.
- Added localized prompt placeholder copy and an i18n audit to keep all used UI keys translated.

### 0.4.6 Changed

- Reduced default Hub noise by removing persistent startup toasts, duplicate task hints, and always-on command footer lines.
- Replaced blue/cyan UI accents with a softer cream theme across hub, palettes, wizard/settings lists, markdown summaries, and attached agent terminals.
- Made the prompt block start at three rows, grow when input wraps, and show the blinking cursor on the first placeholder character while empty.
- Reused the same minimal prompt treatment in dedicated agent terminals and toned down their footer.
- Simplified agent rows so secondary telemetry only appears when there is a useful latest signal or result.
- Moved command palette priority to shared command helpers so autocomplete, help, and rendering stay aligned.

### 0.4.6 Fixed

- Fixed slash palette Up/Down navigation jumping to visually unrelated commands.
- Fixed `/help` being scrollable but not actually selectable.
- Fixed Wizard and Settings selection lists wrapping around unexpectedly by clamping navigation at list boundaries.

## 0.4.5 - 2026-06-23

### 0.4.5 Added

- Added explicit hub, focus, and attach input contexts with context-specific hints and filtered command suggestions.
- Added agent argument autocomplete for `/focus`, `/send`, `/attach`, `/pause`, `/resume`, `/stop`, `/restore`, and `/commit`.
- Added attach-terminal routing for `@all`, `@agent`, and `/send`, so dedicated terminals can broadcast or steer another agent through the main session.
- Added richer hub rows using latest useful agent signals, specialist badges, context percentage, and responsive timeline widths.
- Added durable session memory for claims, recent diff excerpts, file activity, work-map warnings, agent aliases, provider/model metadata, specialist, and context usage.
- Added shell mutation tracking: files changed by `run_command` now appear in live diffs, file activity, and agent commit ownership.
- Added a non-blocking work map that surfaces overlapping claims and repeated co-edit conflicts in `/board` and agent context.

### 0.4.5 Changed

- Clarified agent naming around `Name: task` syntax in README examples.
- Made `/raw` visible only when it affects the active focus view.
- Reset focus scroll follow-tail behavior when switching focused agents.
- Improved session restore so `/restore` can target saved agents by name, alias, or id when their conversation is available.

### 0.4.5 Fixed

- Fixed attach-terminal `@all` being treated as plain text to the attached agent.
- Fixed restored note ids drifting by resynchronizing blackboard note and change sequences after loading session data.
- Fixed shell-created edits being invisible to `/diff`, `/board`, and `/commit`.

## 0.4.4 - 2026-06-23

### 0.4.4 Added

- Added tool-level safeguards for `/ask` and `/plan`: ask agents cannot mutate project state, and plan agents must get explicit approval before mutating files or running risky shell commands.
- Added session-only provider setup for `/settings-session`, with an explicit choice between temporary session use and saving globally.
- Expanded `/doctor` into actionable readiness diagnostics for provider, model, key, local endpoints, attach socket, `git`, and `gh`.
- Added scrolling/windowing budgets to long TUI views such as board, notes, diffs, cost, skills, specialists, and sessions.
- Added saved-session restore hints and clearer `/restore` errors.

### 0.4.4 Changed

- Reworked the README to render consistently on both GitHub and npm.
- Replaced wide Markdown tables and fixed-width command blocks with npm-friendly lists.
- Removed provider-specific environment variable guidance from the public README so provider setup remains neutral.
- Documented DeepSeek only as one provider preset in the Chinese provider group, not as a special standalone setup path.
- Made `@all` steer active agents directly instead of only posting a passive note.
- Made `/plan` timeouts safe by requiring manual approval before mutations are unlocked.
- Increased the saved sessions list window from 8 to 20 and shows `/save [name]` labels in `/sessions`.
- Bumped the TUI header version to `0.4.4`.

### 0.4.4 Fixed

- Fixed `/commit message...` with exactly one agent so the first word is treated as part of the message, not as a missing agent name.
- Fixed `/project` and `/wizard` transitions by warning when active agents are running unless `--force` is passed.
- Fixed local/custom provider setup so localhost endpoints do not require an API key and placeholder models are not considered ready.
- Fixed stale focus after agents disappear through clear, stop, project switch, session load, or restore.
- Fixed `/settings-session` key entry so provider setup reaches the session-only vs global-save choice instead of returning early.
- Fixed first-run custom provider setup so it reviews/edits endpoints and skips API keys for localhost endpoints.
- Fixed filesystem boundary checks so agent tools reject sibling paths with a shared project-root prefix.
- Fixed TUI clipping risks by budgeting the hub by rendered rows and applying body-height windowing to notes/diffs.
- Fixed Settings Escape handling so typed inputs clear before navigating back.

## 0.4.3 - 2026-06-23

### 0.4.3 Added

- Added a guided provider setup flow in both first-run wizard and settings: provider, model, endpoint review, API key, then save/default selection.
- Added endpoint review and endpoint editing for provider presets and configured providers.
- Added first-class local/no-key provider semantics for Ollama and vLLM/SGLang.
- Added `/project` and `/folder` commands to reopen the project picker or switch project folder from inside the TUI.
- Added `/wizard` and `/setup` commands to relaunch setup without restarting with `--first-run`.
- Added keyboard selection for slash command and `@agent` suggestions.
- Added viewport/windowing support for long wizard/settings lists.
- Added Up/Down scrolling for long static views such as `/help`.
- Added `CHANGELOG.md` to public release documentation.

### 0.4.3 Changed

- Refreshed the provider and model catalog across 29 presets.
- Refreshed built-in pricing entries and made pricing lookup case-insensitive.
- Reworked settings provider details to expose model changes, endpoint editing, key changes, key clearing, default selection, pricing, and removal.
- Hid `/key` from visible help/autocomplete; provider keys are now guided through `/settings`.
- Updated CLI help, TUI help, and README to document current commands and provider flows.
- Updated the hardcoded TUI header version to `0.4.3`.
- Corrected npm metadata to point at `Nil06/parallel-cli`.

### 0.4.3 Fixed

- Fixed preset providers skipping model selection and endpoint review before API key entry.
- Fixed session settings accidentally behaving like global provider mutation in several flows.
- Fixed bare model IDs containing `:` such as `qwen3-coder:480b`.
- Fixed stale default provider normalization during config load and provider removal.
- Fixed provider-specific environment overrides leaking into whichever provider happened to be default.
- Fixed local endpoints being blocked by missing API keys.
- Fixed sensitive `/key ...` entries being stored in input history.
- Fixed tiny pseudo-TTY dimensions causing negative string repeat values in the TUI header.

## 0.4.2 - 2026-06-22

### 0.4.2 Added

- Expanded provider presets from 18 to 29.
- Added new provider categories: Western, Chinese, Gateways, Inference, and Local.
- Added MiniMax, Z.ai / GLM, Alibaba / Qwen, Moonshot / Kimi, Xiaomi / MiMo, StepFun, SiliconFlow, Atlas Cloud, Requesty, Vercel AI Gateway, and vLLM/SGLang presets.
- Added provider category metadata for cleaner Wizard and Settings grouping.
- Added a larger built-in model pricing catalog.

### 0.4.2 Changed

- Reworked the README provider section to be provider-agnostic.
- Updated provider tables, endpoint documentation, and model catalog references.
- Removed internal docs from remote tracking and kept them out of the public package.

### 0.4.2 Fixed

- Fixed Settings showing only configured providers instead of all presets in the Providers submenu.
- Fixed README coherence around provider count, missing commands, approvals, repository metadata, and environment variables.

## 0.4.1 - 2026-06-22

### 0.4.1 Added

- Added 10 new provider presets.
- Added Ollama as a first-class local preset with automatic connectivity check and model detection.
- Added custom provider setup for any OpenAI-compatible endpoint.
- Added provider removal from Settings.

### 0.4.1 Changed

- Redesigned the provider wizard around grouped provider categories.
- Reorganized Settings so provider keys, models, pricing, add/remove, and defaults are managed under a Providers submenu.
- Reduced Settings root menu complexity.

## 0.4.0 - 2026-06-22

### 0.4.0 Added

- Added explicit agent modes: `/ask`, `/task`, and `/plan`.
- Added aliases `/a`, `/t`, and `/p`.
- Added dedicated agent terminals through `parallel attach`.
- Added automatic dedicated terminal opening with `/attach on`.
- Added focus mode for routing plain input to one agent.
- Added live telemetry in the hub and attached terminals.
- Added structured timeline presentation for agent activity.
- Added UI translations for English, French, Spanish, and Chinese.
- Added color-coded system messages by severity.
- Added safer test script behavior when local tests are absent.

### 0.4.0 Changed

- Redesigned the control room UI with a compact ASCII header and improved agent rows.
- Reworked command grouping and alias resolution.
- Reworked attached terminal command handling around modern agent modes.
- Kept source tests local/internal instead of remote-tracked.

### 0.4.0 Removed

- Removed the visible `/spawn` command in favor of `/task`.

### 0.4.0 Fixed

- Fixed missing i18n strings in commands.
- Fixed several TUI layout issues around headers, root height, arrow focus guards, and small terminals.
- Fixed rapid repeated `/pause` behavior.

## 0.3.3 - 2026-06-12

### 0.3.3 Added

- Initial public release.
- Added the Parallel TUI control room for running multiple coding agents on one project.
- Added OpenAI-compatible provider configuration.
- Added session state, agent coordination, shared notes, file activity, diffs, approvals, and basic command dispatch.
- Added npm binaries: `parallel` and `prl`.
