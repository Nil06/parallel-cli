# Changelog

All notable changes to Parallel are documented here.

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
