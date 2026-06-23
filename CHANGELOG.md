# Changelog

All notable changes to Parallel are documented here.

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
- Fixed `DEEPSEEK_API_KEY` overriding whichever provider happened to be default; it now targets DeepSeek only.
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

- Reworked the README provider section to be provider-agnostic instead of DeepSeek-centered.
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
