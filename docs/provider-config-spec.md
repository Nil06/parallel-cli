# Provider Configuration UX Specification

> **Status:** Draft — pending review
> **Target:** Code mode implementation
> **Scope:** Provider presets, Wizard flow, Settings reorganization, UX principles

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Constraints and Assumptions](#2-constraints-and-assumptions)
3. [Provider Preset Expansion](#3-provider-preset-expansion)
4. [Wizard Flow Redesign](#4-wizard-flow-redesign)
5. [Settings Reorganization](#5-settings-reorganization)
6. [UX Principles](#6-ux-principles)
7. [i18n Key Additions](#7-i18n-key-additions)
8. [Pricing Table Additions](#8-pricing-table-additions)
9. [Implementation Phases](#9-implementation-phases)
10. [Open Questions](#10-open-questions)

---

## 1. Problem Statement

The current provider configuration UX has four problems:

1. **Too few presets.** Only 8 providers are pre-configured. Users of Ollama, xAI, Perplexity, Cohere, DeepInfra, Fireworks, Replicate, Cerebras, Novita, Hyperbolic, and SambaNova must manually enter name, URL, model, and key through a 4-step custom flow.

2. **Cryptic wizard values.** The provider pick step uses `existing:ProviderName` and `preset:ProviderName` as internal value strings. These leak implementation details to the UX. Users see these prefixes in the selection UI even though they're meaningless outside of [`App.tsx`](src/ui/App.tsx:344) dispatch logic.

3. **Flat settings menu.** The 13-item root settings list intermixes provider-specific items (Set Key for each provider, Add Provider, Models, Pricing) with global items (Language, Approval Mode, Sound). This creates a long, undifferentiated list.

4. **No local/Ollama story.** There is no preset for locally-hosted models. Users must create a custom provider manually, entering `http://localhost:11434/v1` by hand, even though the code already has localhost pricing logic in [`pricing.ts`](src/pricing.ts:56).

---

## 2. Constraints and Assumptions

### Hard Constraints

- **Ink/React terminal UI.** All rendering is through Ink 5.x components. No web UI, no TUI framework migration.
- **Sequential wizard flow.** The wizard is inherently linear (lang → folder → session → provider → model → main). No branching tree navigation.
- **Static model lists.** Model lists are curated defaults shipped in code. No live-fetch from provider APIs. Users add custom models manually.
- **4-language i18n.** Every user-visible string must have entries in English, French, Spanish, and Chinese in [`i18n.ts`](src/i18n.ts).
- **Config file persistence.** Provider configs are stored in `~/.parallel/config.json` via [`saveConfig`](src/config.ts:160). No database, no cloud sync.

### Assumptions

- Users who configure Ollama understand what a local LLM endpoint is. The connectivity check is a convenience, not a tutorial.
- The current `ProviderConfig` interface (name, baseUrl, apiKey, models[], defaultModel, prices?) in [`types.ts`](src/types.ts:113-121) is adequate for all new presets. No schema changes needed.
- The `SelectList` component in [`Wizard.tsx`](src/ui/Wizard.tsx:16) and `WizardStep` component in [`Wizard.tsx`](src/ui/Wizard.tsx:105) are reused without modification.

---

## 3. Provider Preset Expansion

### 3.1 Current Presets (8)

From [`config.ts`](src/config.ts), preserved as-is:

| # | Name | Base URL | Models | Default |
|---|------|----------|--------|---------|
| 1 | OpenAI | `https://api.openai.com/v1` | gpt-5, gpt-5-mini, gpt-5-nano, o4-mini, o3 | gpt-5 |
| 2 | DeepSeek | `https://api.deepseek.com` | deepseek-v4-flash, deepseek-v4-pro, deepseek-chat, deepseek-reasoner | deepseek-v4-flash |
| 3 | Anthropic | `https://api.anthropic.com/v1/` | claude-opus-4-20250514, claude-sonnet-4-20250514, claude-3-5-haiku-20241022 | claude-sonnet-4-20250514 |
| 4 | OpenRouter | `https://openrouter.ai/api/v1` | openai/gpt-5, anthropic/claude-sonnet-4-20250514, google/gemini-2.5-flash | openai/gpt-5 |
| 5 | Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | gemini-2.5-flash, gemini-2.5-pro | gemini-2.5-flash |
| 6 | Mistral | `https://api.mistral.ai/v1` | mistral-large-latest, pixtral-large-latest, ministral-8b-latest | mistral-large-latest |
| 7 | Groq | `https://api.groq.com/openai/v1` | meta-llama/llama-4-maverick-17b-128e-instruct, qwen-3-235b-a22b, deepseek-r1-distill-llama-70b | meta-llama/llama-4-maverick-17b-128e-instruct |
| 8 | Together | `https://api.together.ai/v1` | meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8, deepseek-ai/DeepSeek-R1-0528, Qwen/Qwen3-235B-A22B | meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8 |

### 3.2 New Presets (11)

#### 3.2.1 Ollama (Local)

```typescript
{
  name: 'Ollama',
  baseUrl: 'http://localhost:11434/v1',
  apiKey: '', // No key needed — skipped in wizard
  models: ['llama3', 'mistral', 'codellama'],
  defaultModel: 'llama3',
}
```

**Special behavior:**
- API key step is skipped entirely. The [`usableProvider`](src/ui/App.tsx:39) check currently requires `apiKey` to be truthy. This must be relaxed for Ollama: either set `apiKey` to a sentinel value like `'ollama'` (non-empty, satisfies truthy check) or modify `usableProvider` to also accept providers whose `baseUrl` starts with `http://localhost` or `http://127.0.0.1`.
- **Recommended approach:** Set `apiKey: 'ollama'` as a sentinel. This keeps `usableProvider` unchanged, avoids special-casing the check, and the sentinel is never sent to a real API (it's localhost). The masked display in Settings will show `••••llama` which is harmless.
- **Connectivity check:** On selecting Ollama in the wizard, fire an HTTP GET to `http://localhost:11434/v1/models`. If the response is valid JSON with a `data` array, extract model IDs and replace the default model list. If the request fails (connection refused, timeout), show a warning: "Could not reach Ollama at localhost:11434. Is it running?" but allow the user to proceed with the curated fallback list.
- The connectivity check should have a short timeout (2 seconds) to avoid blocking the wizard.
- **Pricing:** Already handled — [`priceFor`](src/pricing.ts:56) returns `null` (free) for any provider with a localhost URL.

#### 3.2.2 xAI (Grok)

```typescript
{
  name: 'xAI',
  baseUrl: 'https://api.x.ai/v1',
  apiKey: '',
  models: ['grok-3', 'grok-3-mini'],
  defaultModel: 'grok-3',
}
```

**Note:** xAI uses OpenAI-compatible endpoints. The `/v1` suffix matches the standard pattern.

#### 3.2.3 Perplexity

```typescript
{
  name: 'Perplexity',
  baseUrl: 'https://api.perplexity.ai',
  apiKey: '',
  models: ['sonar-pro', 'sonar', 'sonar-reasoning'],
  defaultModel: 'sonar-pro',
}
```

**Note:** Perplexity's API is OpenAI-compatible but does not use a `/v1` suffix on the base URL. The [`client.ts`](src/llm/client.ts) OpenAI client construction appends paths — verify compatibility.

#### 3.2.4 Cohere

```typescript
{
  name: 'Cohere',
  baseUrl: 'https://api.cohere.ai/v1',
  apiKey: '',
  models: ['command-r-plus', 'command-r'],
  defaultModel: 'command-r-plus',
}
```

#### 3.2.5 DeepInfra

```typescript
{
  name: 'DeepInfra',
  baseUrl: 'https://api.deepinfra.com/v1/openai',
  apiKey: '',
  models: [
    'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
    'deepseek-ai/DeepSeek-R1',
    'mistralai/Mistral-Small-3.1-24B-Instruct-2503',
  ],
  defaultModel: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
}
```

#### 3.2.6 Fireworks

```typescript
{
  name: 'Fireworks',
  baseUrl: 'https://api.fireworks.ai/inference/v1',
  apiKey: '',
  models: [
    'accounts/fireworks/models/llama-v3p1-405b-instruct',
    'accounts/fireworks/models/mixtral-8x22b-instruct',
    'accounts/fireworks/models/qwen3-235b-a22b',
  ],
  defaultModel: 'accounts/fireworks/models/llama-v3p1-405b-instruct',
}
```

**Note:** Fireworks uses fully-qualified model IDs with the `accounts/fireworks/models/` prefix. These are unusual but correct for their API.

#### 3.2.7 Replicate

```typescript
{
  name: 'Replicate',
  baseUrl: 'https://api.replicate.com/v1',
  apiKey: '',
  models: [
    'meta/meta-llama-3.1-405b-instruct',
    'mistralai/mixtral-8x22b-instruct-v0.1',
  ],
  defaultModel: 'meta/meta-llama-3.1-405b-instruct',
}
```

**⚠️ Verification needed:** Replicate's OpenAI-compatibility layer may use a different base URL pattern. Confirm the `/v1` suffix and model ID format before shipping.

#### 3.2.8 Cerebras

```typescript
{
  name: 'Cerebras',
  baseUrl: 'https://api.cerebras.ai/v1',
  apiKey: '',
  models: ['llama-4-maverick-17b-128e-instruct', 'llama3.3-70b'],
  defaultModel: 'llama-4-maverick-17b-128e-instruct',
}
```

#### 3.2.9 Novita

```typescript
{
  name: 'Novita',
  baseUrl: 'https://api.novita.ai/v3/openai',
  apiKey: '',
  models: [
    'meta-llama/llama-4-maverick-17b-128e-instruct',
    'deepseek/deepseek-r1',
    'qwen/qwen-3-235b-a22b',
  ],
  defaultModel: 'meta-llama/llama-4-maverick-17b-128e-instruct',
}
```

**Note:** Novita uses `/v3/openai` suffix rather than the common `/v1`. This is correct for their API.

#### 3.2.10 Hyperbolic

```typescript
{
  name: 'Hyperbolic',
  baseUrl: 'https://api.hyperbolic.xyz/v1',
  apiKey: '',
  models: [
    'meta-llama/Llama-4-Maverick-17B-128E-Instruct',
    'deepseek-ai/DeepSeek-R1',
    'Qwen/Qwen3-235B-A22B',
  ],
  defaultModel: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct',
}
```

#### 3.2.11 SambaNova

```typescript
{
  name: 'SambaNova',
  baseUrl: 'https://api.sambanova.ai/v1',
  apiKey: '',
  models: [
    'Meta-Llama-4-Maverick-17B-128E-Instruct',
    'DeepSeek-R1',
    'Qwen3-235B-A22B',
  ],
  defaultModel: 'Meta-Llama-4-Maverick-17B-128E-Instruct',
}
```

### 3.3 Preset Order in Code

Presets in `PROVIDER_PRESETS` in [`config.ts`](src/config.ts) should be ordered as:

1. OpenAI
2. Anthropic
3. DeepSeek
4. Gemini
5. Mistral
6. Groq
7. Together
8. OpenRouter
9. xAI
10. Perplexity
11. Cohere
12. DeepInfra
13. Fireworks
14. Replicate
15. Cerebras
16. Novita
17. Hyperbolic
18. SambaNova
19. Ollama

This is the storage order. The wizard display order is determined by category grouping (see Section 4).

### 3.4 Verification Checklist for New Presets

Before shipping, verify each new preset:

- [ ] Base URL accepts OpenAI-compatible `/v1/chat/completions` POST requests
- [ ] Model IDs are correct and currently serveable by the provider
- [ ] API key format is compatible (most use `Bearer` token auth — already handled by the OpenAI client)
- [ ] Pricing entries added to `BUILTIN` table in [`pricing.ts`](src/pricing.ts) (see Section 8)

---

## 4. Wizard Flow Redesign

### 4.1 Current Flow (for reference)

```
Phase 1: Language (lang)
  → SelectList of 4 languages
Phase 2: Folder (folder)
  → SelectList of recent folders + type custom
Phase 3: Session (session) — only if sessions exist in the folder
  → SelectList: "Start fresh" + existing session names
Phase 4: Provider (provider) — 6 sub-steps
  → pick: SelectList with existing:Name and preset:Name items
  → key (for presets): masked input for API key
  → name (for custom): free-text provider name
  → url (for custom): free-text base URL
  → model (for custom): free-text first model name
  → newKey (for custom): masked input for API key
Phase 5: Model (model)
  → SelectList of provider models + "Other (type manually)"
  → customTitle (if "Other"): free-text model name
Phase 6: Main (main)
  → MainScreen
```

Key pain points:
- `existing:` and `preset:` prefixes visible in the SelectList values
- Custom provider path requires 4 sequential steps (name → url → model → key) with no escape
- No visual distinction between "already configured" and "available preset"
- The 19-preset flat list will be overwhelming without grouping

### 4.2 Proposed Flow

```
Phase 1: Language (lang)
  → UNCHANGED

Phase 2: Folder (folder)
  → UNCHANGED

Phase 3: Session (session) — only if sessions exist
  → UNCHANGED

Phase 4: Provider (provider)
  → pick: CATEGORIZED SelectList
    ├── Section: "Configured" (only if 1+ providers have apiKey set)
    │   └── ProviderName  (configured)     ← no prefix, just the name
    ├── Section: "Cloud Providers" (all presets except Ollama)
    │   └── ProviderName                  ← no prefix
    ├── Section: "Local"
    │   └── Ollama                        ← special: no API key needed
    └── "Custom provider..."              ← always last, always present

  → key (for presets that need one): masked input
    - Title: "API Key for {providerName}"
    - Skip entirely for Ollama (proceed directly to model)
    - After valid key: proceed to model selection

  → name (for custom, ONLY if user picks "Custom provider..."):
    - Title: "Provider name"
    - Footer: "Type a name and press Enter"

  → url (for custom):
    - Title: "Base URL for {name}"
    - Footer: "Type the API endpoint URL"

  → model (for custom):
    - Title: "Default model for {name}"
    - Footer: "Type a model ID (add more later in Settings)"

  → newKey (for custom):
    - Title: "API Key for {name}"
    - Masked input

Phase 5: Model (model)
  → UNCHANGED structurally, but now reached directly after key entry
  → customTitle: UNCHANGED

Phase 6: Main (main)
  → UNCHANGED
```

### 4.3 Category Grouping Implementation

Instead of the current flat item list with `existing:`/`preset:` prefixes:

```typescript
// Current (App.tsx:342-377) — flat list with prefixes
...config.providers.map((p): SelectItem => ({
  value: `existing:${p.name}`,
  label: `${p.name} (${p.defaultModel || p.models[0] || '?'})`,
}))
...PROVIDER_PRESETS.map((preset): SelectItem => ({
  value: `preset:${preset.name}`,
  label: `${preset.name} — ${preset.defaultModel}`,
}))
```

Proposed approach: use **section headers** within the SelectList. The `SelectList` component currently renders a flat array of `SelectItem`. To add sections, extend `SelectItem` with an optional `section` field:

```typescript
// Extended SelectItem (Wizard.tsx)
export interface SelectItem {
  value: string        // dispatch value — no more prefixes
  label: string        // display label
  section?: string     // if set, renders as a non-selectable section header
  detail?: string      // secondary text (e.g., "configured", model count)
}
```

The provider pick list becomes:

```typescript
const providerItems: SelectItem[] = []

// Section: Configured providers
const configured = config.providers.filter(p => p.apiKey)
if (configured.length > 0) {
  providerItems.push({ value: '', label: t('wiz.provider.section.configured'), section: 'header' })
  for (const p of configured) {
    providerItems.push({
      value: p.name,  // No prefix — just the name
      label: p.name,
      detail: p.defaultModel || p.models[0],
    })
  }
}

// Section: Cloud providers
providerItems.push({ value: '', label: t('wiz.provider.section.cloud'), section: 'header' })
for (const preset of PROVIDER_PRESETS.filter(p => p.name !== 'Ollama')) {
  // Skip if already configured (shown above)
  if (configured.find(c => c.name === preset.name)) continue
  providerItems.push({
    value: preset.name,
    label: preset.name,
    detail: preset.defaultModel,
  })
}

// Section: Local
providerItems.push({ value: '', label: t('wiz.provider.section.local'), section: 'header' })
const ollama = PROVIDER_PRESETS.find(p => p.name === 'Ollama')
if (ollama && !configured.find(c => c.name === 'Ollama')) {
  providerItems.push({
    value: 'Ollama',
    label: 'Ollama',
    detail: t('wiz.provider.ollamaDetail'), // "Local — no API key needed"
  })
}

// Custom
providerItems.push({
  value: '__custom__',
  label: t('wiz.provider.custom'),
  detail: t('wiz.provider.customDetail'), // "Configure manually"
})
```

**Dispatch change:** In the `onSelect` handler, instead of parsing `existing:`/`preset:` prefixes:

```typescript
onSelect={(v) => {
  if (v === '__custom__') {
    setProviderStep({ id: 'name' })
    return
  }
  // Check if it's an already-configured provider
  const existing = config.providers.find(p => p.name === v)
  if (existing?.apiKey) {
    // Already configured — go straight to model selection
    setSessionProvider(existing)
    setPhase('model')
    return
  }
  // It's a preset — find it
  const preset = PROVIDER_PRESETS.find(p => p.name === v)
  if (!preset) return
  // Ollama: skip key, do connectivity check, go to model
  if (preset.name === 'Ollama') {
    setProviderStep({ id: 'ollamaConnect' })
    return
  }
  // Normal preset: go to key entry
  setProviderStep({ id: 'key', preset })
})}
```

### 4.4 ProviderStep Type Changes

Current `ProviderStep` type ([`App.tsx:26-32`](src/ui/App.tsx:26)):

```typescript
type ProviderStep =
  | { id: 'pick' }
  | { id: 'key'; preset: ProviderConfig }
  | { id: 'name' }
  | { id: 'url'; name: string }
  | { id: 'model'; name: string; url: string }
  | { id: 'newKey'; name: string; url: string; model: string }
```

Proposed changes:
- Remove `pick` — replaced by the categorized provider selection (still a SelectList, but within phase='provider' without a sub-step)
- Add `ollamaConnect` — shows a spinner while pinging Ollama, then transitions to model or shows a warning
- Keep `key`, `name`, `url`, `model`, `newKey` as-is

```typescript
type ProviderStep =
  | { id: 'pick' }                                          // Categorized provider list
  | { id: 'key'; preset: ProviderConfig }                   // API key for preset
  | { id: 'ollamaConnect'; preset: ProviderConfig }         // Ollama connectivity check
  | { id: 'ollamaWarning'; preset: ProviderConfig; error: string }  // Ollama unreachable
  | { id: 'name' }                                          // Custom: provider name
  | { id: 'url'; name: string }                             // Custom: base URL
  | { id: 'model'; name: string; url: string }              // Custom: first model
  | { id: 'newKey'; name: string; url: string; model: string }  // Custom: API key
```

### 4.5 Ollama Connectivity Check Flow

```
User selects "Ollama" in provider pick
  ↓
setProviderStep({ id: 'ollamaConnect', preset })
  ↓
useEffect fires HTTP GET to http://localhost:11434/v1/models (2s timeout)
  ↓
  ├── Success + valid JSON with data[]
  │     ↓
  │   Extract model IDs → replace preset.models
  │     ↓
  │   setSessionProvider(updatedPreset)
  │   setPhase('model')
  │
  └── Failure (timeout, connection refused, non-200, bad JSON)
        ↓
      setProviderStep({ id: 'ollamaWarning', preset, error: '...' })
        ↓
      Show warning: "Could not reach Ollama at localhost:11434. Is it running?"
      Options: "Continue with defaults" / "Go back"
        ↓
        ├── Continue → setSessionProvider(preset) → setPhase('model')
        └── Go back → setProviderStep({ id: 'pick' })
```

**Important:** The connectivity check must run in a `useEffect` triggered by `ollamaConnect` state, not inline during rendering. The check should use Node's `http` module (already imported) or `fetch` (available in Node 18+). A 2-second timeout via `AbortController` prevents the wizard from hanging.

### 4.6 SelectList Section Rendering

The `SelectList` component in [`Wizard.tsx`](src/ui/Wizard.tsx:16) needs a minor extension to render section headers. When an item has `section: 'header'`, render it as a dimmed, non-selectable label:

```typescript
// Inside SelectList rendering (Wizard.tsx:79-87)
{items.map((it, i) => {
  if (it.section === 'header') {
    return (
      <Box key={`section-${it.label}`} marginTop={i > 0 ? 1 : 0}>
        <Text dimColor bold>{it.label}</Text>
      </Box>
    )
  }
  const isFocused = !typing && adjustedIdx === i
  return (
    <Text key={it.value + i}>
      <Text color={isFocused ? 'cyanBright' : 'gray'} bold={isFocused}>
        {isFocused ? '❯ ' : '  '}{it.label}
      </Text>
      {it.detail ? (
        <Text color={isFocused ? 'cyan' : 'gray'} dimColor={!isFocused}>
          {' — '}{it.detail}
        </Text>
      ) : null}
    </Text>
  )
})}
```

**Navigation:** Section headers should be skipped during ↑/↓ navigation. The `adjustedIdx` logic must filter out header items when mapping array indices to selectable indices. Alternatively, pre-filter to a `selectableItems` array and track `selectableIdx` separately.

### 4.7 Back Navigation

The existing `wizardBack()` function ([`App.tsx:206-238`](src/ui/App.tsx:206)) needs two adjustments:

1. From `phase='model'` when coming from Ollama (no key step): go back to provider pick, not key entry
2. From `phase='model'` when coming from a configured provider: go back to provider pick, not key entry

These are already mostly handled — the back function checks `providerStep.id`. Adding `ollamaConnect` and `ollamaWarning` states is straightforward.

---

## 5. Settings Reorganization

### 5.1 Current Root Items (13)

From [`SettingsPanel.tsx:66-69`](src/ui/SettingsPanel.tsx:66):

```
1. Language                     → step: 'lang'
2. Default Approval Mode        → step: 'defaultApprovalMode'
3. Key: OpenAI                  → step: 'key', provider
4. Key: DeepSeek                → step: 'key', provider
5. Key: Anthropic               → step: 'key', provider
6. Key: OpenRouter              → step: 'key', provider
7. Key: Gemini                  → step: 'key', provider
8. Key: Mistral                 → step: 'key', provider
9. Key: Groq                    → step: 'key', provider
10. Key: Together               → step: 'key', provider
11. Add Provider                → step: 'newName'
12. Models                      → step: 'pickProvider' (choose provider, then manage models)
13. Pricing                     → step: 'pickProvider' (choose provider, then manage pricing)
14. New Skill                   → step: 'newSkill'
15. New Specialist              → step: 'newSpecialist'
16. Back                        → step: 'back'
```

(Count is actually 16 — 13 global + 3 session items are separate. Session items are unchanged.)

### 5.2 Proposed Root Items (~9 global + 4 session)

```
GLOBAL:
1. Language                     → step: 'lang'
2. Default Provider             → step: 'defaultProvider'  (NEW — pick from configured providers)
3. Providers →                  → step: 'providers'        (NEW — submenu)
4. Default Approval Mode        → step: 'defaultApprovalMode'
5. Max Steps Per Agent          → step: 'maxSteps'         (existing, just moved)
6. Sound                        → step: 'sound'            (existing, just moved)
7. New Skill                    → step: 'newSkill'
8. New Specialist               → step: 'newSpecialist'
9. Back                         → step: 'back'

SESSION (unchanged):
1. Model                        → pickProvider → model list
2. Approval Mode                → cycle
3. Sound                        → toggle
4. Back
```

### 5.3 Provider Submenu Structure

When user selects "Providers" from root:

```
Providers:
  ├── OpenAI                ••••sk-4abc  → step: 'providerDetail', provider
  ├── Anthropic             (no key)     → step: 'providerDetail', provider
  ├── Ollama                local        → step: 'providerDetail', provider
  ├── ...
  ├── Add Provider...                    → step: 'newName'
  └── Back                               → step: 'root'
```

When user selects a specific provider:

```
{ProviderName}:
  ├── Set API Key           ••••sk-4abc  → step: 'key', provider
  ├── Manage Models         (3 models)   → step: 'modelList', provider
  ├── Pricing               $2.00/M      → step: 'priceModel', provider
  ├── Set as Default                      → sets config.defaultProvider, returns to provider list
  ├── Remove Provider                    → confirmation → removes from config, returns to provider list
  └── Back                               → step: 'providers'
```

### 5.4 Step Type Changes

Current `Step` type ([`SettingsPanel.tsx:10-24`](src/ui/SettingsPanel.tsx:10)):

```typescript
type Step =
  | { id: 'root' }
  | { id: 'lang' }
  | { id: 'defaultApprovalMode' }
  | { id: 'defaultPM'; provider: ProviderConfig }
  | { id: 'key'; provider: ProviderConfig }
  | { id: 'pickProvider'; action: 'key' | 'model' | 'models' | 'price' }
  | { id: 'model'; provider: ProviderConfig }
  | { id: 'modelList'; provider: ProviderConfig }
  | { id: 'priceModel'; provider: ProviderConfig }
  | { id: 'priceValue'; provider: ProviderConfig; model: string }
  | { id: 'newName' }
  | { id: 'newUrl'; name: string }
  | { id: 'newModel'; name: string; url: string }
  | { id: 'newKey'; name: string; url: string; model: string }
  | { id: 'newSkill' }
  | { id: 'newSpecialist' }
  | { id: 'back' }
```

Proposed changes:
- Add `{ id: 'providers' }` — the provider submenu root
- Add `{ id: 'providerDetail'; provider: ProviderConfig }` — per-provider action menu
- Add `{ id: 'defaultProvider' }` — select default provider from configured list
- Add `{ id: 'removeProvider'; provider: ProviderConfig }` — confirmation step
- Remove `{ id: 'pickProvider'; action: '...' }` — replaced by the submenu navigation
- Keep all existing sub-steps for key, model, pricing, new provider creation

### 5.5 Key Status Display

In the provider list, show key status as a detail string:

- Has API key: `••••{last4}` (using existing `masked()` function from [`SettingsPanel.tsx:26-29`](src/ui/SettingsPanel.tsx:26))
- Ollama/local: `local — no key`
- No key: `(no key)` in dim color

### 5.6 "Set as Default" Behavior

When user selects "Set as Default" for a provider:
1. Set `config.defaultProvider = provider.name`
2. Save config
3. Return to provider submenu

A checkmark or `(default)` badge should appear next to the current default provider in the submenu list.

### 5.7 "Remove Provider" Flow

```
User selects "Remove Provider" for provider X
  ↓
Confirmation: "Remove {name}? This cannot be undone."
Options: "Yes, remove" / "Cancel"
  ↓
  ├── Yes:
  │     config.providers = config.providers.filter(p => p.name !== X)
  │     If X was defaultProvider → clear defaultProvider or set to first remaining
  │     Save config
  │     Return to provider submenu
  │
  └── Cancel:
        Return to provider detail menu
```

---

## 6. UX Principles

### 6.1 Every Input Step Has Clear Context

Every wizard and settings step must answer three questions:
1. **What am I doing?** → `WizardStep` title
2. **What are my options?** → `SelectList` items or input prompt
3. **How do I proceed/escape?** → footer text

**Rule:** No blank input prompts. Every free-text input step must have a footer explaining what to type and that Enter confirms, Esc goes back.

### 6.2 Masked API Keys

- All API key inputs use `mask={true}` on `SelectList` ([`Wizard.tsx:92-96`](src/ui/Wizard.tsx:92))
- Displayed keys use `masked()`: `••••` + last 4 characters ([`SettingsPanel.tsx:26`](src/ui/SettingsPanel.tsx:26))
- Keys are never displayed in full anywhere in the UI
- The `masked()` function must handle keys shorter than 4 characters gracefully: if `key.length < 4`, show `••••`

### 6.3 Custom Provider Always Available

- "Custom provider..." is always the last item in every provider pick list — wizard and settings
- It must be visually distinct (dimmed, or preceded by a separator)
- The custom flow (name → url → model → key) remains a linear 4-step sequence
- Users can press Esc at any step to return to the provider pick

### 6.4 Ollama / Local Model Treatment

- **No API key step.** Selecting Ollama skips directly to connectivity check, then model selection.
- **Connectivity check is best-effort.** Failure does not block the flow.
- **Auto-detected models override defaults.** If Ollama responds with a model list, use it. If a user has already configured Ollama with custom models, the auto-detect should NOT overwrite user-configured models — only populate on first setup.
- **Pricing is free.** The existing `localhost` check in [`priceFor`](src/pricing.ts:56) handles this automatically.
- **Sentinel key value.** `apiKey: 'ollama'` ensures `usableProvider` returns true without a real API key. This is a sentinel, not a credential.

### 6.5 Provider Pick: Configured vs. Preset Distinction

- **Configured providers** (have apiKey) appear at the top in a "Configured" section
- Selecting a configured provider skips key entry and goes directly to model selection
- **Presets** appear in category sections below
- A provider that exists in both `config.providers` (configured) and `PROVIDER_PRESETS` (preset) appears only in the "Configured" section — no duplicates

### 6.6 Linear Flow, No Branching

- The wizard is always: lang → folder → session? → provider → model → main
- There is no way to skip phases or jump between them (except via Back)
- Back always goes to the previous logical step, never creating loops
- The `session` phase appears only if `SessionData` files exist in the chosen folder

### 6.7 Pricing Display

- Show `$X.XX/M tok` for input + output combined cost, using existing `fmtCost` ([`pricing.ts:68`](src/pricing.ts:68))
- Show `free` for localhost providers
- Show `?` when no pricing data is available
- Provider-specific pricing overrides (from `provider.prices`) take precedence over the `BUILTIN` table

---

## 7. i18n Key Additions

New keys needed in [`i18n.ts`](src/i18n.ts). All must have entries in en, fr, es, zh.

### 7.1 Wizard Keys

| Key | English | Purpose |
|-----|---------|---------|
| `wiz.provider.section.configured` | Configured | Section header for already-configured providers |
| `wiz.provider.section.cloud` | Cloud Providers | Section header for cloud presets |
| `wiz.provider.section.local` | Local | Section header for local providers |
| `wiz.provider.custom` | Custom provider... | Always-last custom option label |
| `wiz.provider.customDetail` | Configure manually | Subtitle for custom option |
| `wiz.provider.ollamaDetail` | Local — no API key needed | Subtitle for Ollama preset |
| `wiz.provider.ollama.checking` | Checking Ollama at localhost:11434... | Spinner text during connectivity check |
| `wiz.provider.ollama.found` | Found {n} models | Success message |
| `wiz.provider.ollama.notFound` | Could not reach Ollama at localhost:11434. Is it running? | Warning message |
| `wiz.provider.ollama.continueDefaults` | Continue with defaults | Button label after failed check |
| `wiz.provider.ollama.goBack` | Go back | Button label after failed check |
| `wiz.provider.key.title` | API Key for {name} | Title for key entry step (with provider name) |
| `wiz.provider.key.footer` | Paste your API key (input is hidden) | Footer for key entry |

### 7.2 Settings Keys

| Key | English | Purpose |
|-----|---------|---------|
| `set.providers` | Providers | Root menu entry for provider submenu |
| `set.providers.title` | Providers | Submenu title |
| `set.providers.add` | Add Provider... | Add provider entry in submenu |
| `set.providers.back` | Back | Back entry in submenu |
| `set.providerDetail.title` | {name} | Per-provider detail menu title |
| `set.providerDetail.key` | Set API Key | Menu entry |
| `set.providerDetail.models` | Manage Models | Menu entry |
| `set.providerDetail.pricing` | Pricing | Menu entry |
| `set.providerDetail.setDefault` | Set as Default | Menu entry |
| `set.providerDetail.remove` | Remove Provider | Menu entry |
| `set.providerDetail.back` | Back | Back entry |
| `set.defaultProvider` | Default Provider | Root menu entry for default provider selection |
| `set.defaultProvider.title` | Default Provider | Title for default provider selection |
| `set.removeProvider.title` | Remove {name}? | Confirmation title |
| `set.removeProvider.confirm` | This cannot be undone. | Confirmation warning |
| `set.removeProvider.yes` | Yes, remove | Confirm button |
| `set.removeProvider.no` | Cancel | Cancel button |
| `set.status.configured` | configured | Badge text for configured providers |
| `set.status.noKey` | no key | Badge text for unconfigured providers |
| `set.status.local` | local | Badge text for local providers |
| `set.status.default` | default | Badge text for default provider |
| `set.key.masked` | {masked} | Masked key display (e.g., `••••sk-4abc`) |

---

## 8. Pricing Table Additions

New entries for the `BUILTIN` table in [`pricing.ts`](src/pricing.ts). The table uses prefix/substring matching via [`priceFor`](src/pricing.ts:44-60), so partial model name matches work.

### 8.1 New Provider Pricing

```typescript
// xAI (Grok)
'grok-3': { input: 3.00, output: 15.00 },
'grok-3-mini': { input: 0.30, output: 4.00 },

// Perplexity
'sonar-pro': { input: 3.00, output: 15.00 },
'sonar': { input: 1.00, output: 5.00 },
'sonar-reasoning': { input: 3.00, output: 15.00 },

// Cohere
'command-r-plus': { input: 2.50, output: 10.00 },
'command-r': { input: 0.50, output: 1.50 },

// DeepInfra (pricing varies by model — these are approximate)
'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8': { input: 0.50, output: 1.50 },
'deepseek-ai/DeepSeek-R1': { input: 0.70, output: 2.00 },
'mistralai/Mistral-Small-3.1-24B-Instruct-2503': { input: 0.20, output: 0.60 },

// Fireworks
'accounts/fireworks/models/llama-v3p1-405b-instruct': { input: 3.00, output: 6.00 },
'accounts/fireworks/models/mixtral-8x22b-instruct': { input: 0.90, output: 1.80 },
'accounts/fireworks/models/qwen3-235b-a22b': { input: 1.00, output: 3.00 },

// Replicate
'meta/meta-llama-3.1-405b-instruct': { input: 2.00, output: 6.00 },
'mistralai/mixtral-8x22b-instruct-v0.1': { input: 1.00, output: 3.00 },

// Cerebras
'llama-4-maverick-17b-128e-instruct': { input: 0.60, output: 1.80 },
'llama3.3-70b': { input: 0.50, output: 1.50 },

// Novita
'meta-llama/llama-4-maverick-17b-128e-instruct': { input: 0.50, output: 1.50 },
'deepseek/deepseek-r1': { input: 0.70, output: 2.00 },
'qwen/qwen-3-235b-a22b': { input: 1.00, output: 3.00 },

// Hyperbolic
'meta-llama/Llama-4-Maverick-17B-128E-Instruct': { input: 0.40, output: 1.20 },
'deepseek-ai/DeepSeek-R1': { input: 0.70, output: 2.00 },
'Qwen/Qwen3-235B-A22B': { input: 1.00, output: 2.50 },

// SambaNova
'Meta-Llama-4-Maverick-17B-128E-Instruct': { input: 0.50, output: 1.50 },
'DeepSeek-R1': { input: 0.70, output: 2.00 },
'Qwen3-235B-A22B': { input: 1.00, output: 2.50 },
```

**⚠️ Pricing verification:** All prices above are approximate and must be verified against current provider pricing pages before shipping. Pricing changes frequently.

### 8.2 Pricing Conflict Resolution

Some model names (e.g., `DeepSeek-R1`, `Llama-4-Maverick`) appear under multiple providers. The `priceFor` function in [`pricing.ts`](src/pricing.ts:44) checks:
1. Provider-specific override (`provider.prices[model]`)
2. BUILTIN table (exact match → prefix match)
3. `localhost` → free

Since different providers charge different prices for the same model, prefix-based matching in BUILTIN may produce incorrect results. **Recommendation:** Rely on provider-specific overrides for models hosted on multiple providers. The BUILTIN table should contain entries for the most common provider-model combinations only. When adding a provider, set `prices` on the `ProviderConfig` for any model that could collide.

---

## 9. Implementation Phases

### Phase 1: Provider Presets (1-2 hours)

**Files touched:**
- [`src/config.ts`](src/config.ts) — add 11 new presets to `PROVIDER_PRESETS`
- [`src/pricing.ts`](src/pricing.ts) — add pricing entries for new models
- [`src/i18n.ts`](src/i18n.ts) — add provider name keys if needed (provider names are currently hardcoded, not i18n'd — continue this pattern)

**Risk:** Low. Pure data addition. No behavior changes.

**Verification:**
- `npm run build` succeeds
- New presets appear in wizard provider list (even if still using old prefix system)

### Phase 2: Wizard Category Grouping (3-4 hours)

**Files touched:**
- [`src/ui/Wizard.tsx`](src/ui/Wizard.tsx) — extend `SelectItem` with `section` and `detail`, add section header rendering, fix navigation to skip headers
- [`src/ui/App.tsx`](src/ui/App.tsx) — rewrite provider pick logic (remove `existing:`/`preset:` prefixes, add category grouping, dispatch by name), add `ollamaConnect`/`ollamaWarning` steps, add Ollama connectivity check effect, adjust `wizardBack()`
- [`src/i18n.ts`](src/i18n.ts) — add all wizard i18n keys from Section 7.1

**Risk:** Medium. Changes core wizard logic and SelectList component. The SelectList changes affect all SelectList usages — test the Settings panel, model selection, and all other SelectList instances for regressions.

**Key implementation note:** The `adjustedIdx` in SelectList currently maps directly to `items` array indices. With section headers, the navigation must skip non-selectable items. Compute a `selectableIndices` array:

```typescript
const selectableIndices = items
  .map((item, i) => (item.section ? -1 : i))
  .filter(i => i >= 0)
```

Then `selectableIndices[adjustedIdx]` gives the actual items index.

### Phase 3: Settings Reorganization (3-4 hours)

**Files touched:**
- [`src/ui/SettingsPanel.tsx`](src/ui/SettingsPanel.tsx) — restructure `rootItems`, add `providers` submenu rendering, add `providerDetail` submenu rendering, add `defaultProvider` step, add `removeProvider` confirmation step, remove `pickProvider` dispatch indirection
- [`src/i18n.ts`](src/i18n.ts) — add all settings i18n keys from Section 7.2

**Risk:** Medium. Changes the entire Settings navigation tree. The nested submenu pattern (root → providers → providerDetail → key/models/pricing) must handle back-navigation correctly at each level.

**Back navigation pattern:**
- Each submenu level stores the previous step so "Back" can return correctly
- The `chooseRoot` handler dispatches based on the selected value
- Provider submenu: `chooseRoot('providers')` → show provider list → on select provider → show detail → on select action → show sub-step → on back → return to detail → on back → return to provider list → on back → return to root

### Phase 4: Ollama Connectivity Check (1-2 hours)

**Files touched:**
- [`src/ui/App.tsx`](src/ui/App.tsx) — `useEffect` for HTTP GET to Ollama, state management for `ollamaConnect`/`ollamaWarning`, model list extraction from response

**Risk:** Low. Isolated to Ollama flow. The connectivity check is best-effort and failure is non-blocking.

**Implementation:**
```typescript
useEffect(() => {
  if (providerStep.id !== 'ollamaConnect') return
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 2000)
  fetch('http://localhost:11434/v1/models', { signal: ctrl.signal })
    .then(res => res.json())
    .then(data => {
      clearTimeout(timeout)
      const models = data?.data?.map((m: any) => m.id).filter(Boolean)
      if (models?.length) {
        const preset = { ...providerStep.preset, models, defaultModel: models[0] }
        upsertProvider(config, { ...preset, apiKey: 'ollama' })
        setSessionProvider(preset)
        setPhase('model')
      } else {
        setProviderStep({ id: 'ollamaWarning', preset: providerStep.preset, error: 'Empty model list' })
      }
    })
    .catch(() => {
      clearTimeout(timeout)
      setProviderStep({ id: 'ollamaWarning', preset: providerStep.preset, error: 'Connection failed' })
    })
  return () => clearTimeout(timeout)
}, [providerStep])
```

---

## 10. Open Questions

1. **Replicate API compatibility.** Does Replicate's OpenAI-compatible endpoint use `https://api.replicate.com/v1` with standard `/chat/completions` path? Needs verification. If not, Replicate may need to be deferred or handled as a non-OpenAI-compatible provider.

2. **Model name collisions in BUILTIN pricing.** Several models (DeepSeek-R1, Llama-4-Maverick) appear under multiple providers with different pricing. The current prefix-match logic may resolve to the wrong price. Should we add provider-qualified pricing keys (e.g., `deepinfra/deepseek-ai/DeepSeek-R1`) or rely entirely on per-provider `prices` overrides?

3. **Provider removal with active sessions.** If a user removes a provider that has active session data referencing it, what happens? The session's `providerName` would point to a non-existent provider. Options: (a) warn and block removal, (b) allow removal and sessions fall back to default provider, (c) allow removal and sessions show an error. **Recommendation:** (a) — warn and block, simplest and safest.

4. **Ollama sentinel value.** Using `apiKey: 'ollama'` as a sentinel could theoretically collide if Ollama ever requires real API keys. Alternatively, modify `usableProvider` to check `baseUrl` for localhost patterns. Which approach? **Recommendation:** The sentinel approach is simpler and less invasive. If Ollama adds auth later, the sentinel changes to a real key naturally.

5. **Preset update strategy.** When new models are added to a provider, existing users with that provider configured won't see them unless they re-add the provider. Should the Settings "Manage Models" screen offer a "Reset to defaults" option that repopulates from the preset? **Recommendation:** Defer to v2. The "Add model manually" flow already covers this.

6. **Provider ordering in Settings submenu.** Should configured providers be sorted alphabetically, by most-recently-used, or by preset order? **Recommendation:** Alphabetically, with the default provider pinned to the top. Simple, predictable.

---

## Appendix A: Current Code References

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| `ProviderConfig` | [`types.ts`](src/types.ts) | 113-121 | Provider data structure |
| `ParallelConfig` | [`types.ts`](src/types.ts) | 130-138 | Top-level config with providers array |
| `PROVIDER_PRESETS` | [`config.ts`](src/config.ts) | 16-88 | 8 current presets |
| `getProvider` | [`config.ts`](src/config.ts) | 96-99 | Look up provider by name |
| `upsertProvider` | [`config.ts`](src/config.ts) | 101-107 | Add or update a provider in config |
| `loadConfig` / `saveConfig` | [`config.ts`](src/config.ts) | 124-167 | Persist config to disk |
| `usableProvider` | [`App.tsx`](src/ui/App.tsx) | 39-42 | Check if provider is ready to use |
| `Phase` type | [`App.tsx`](src/ui/App.tsx) | 23 | Wizard phase enum |
| `ProviderStep` type | [`App.tsx`](src/ui/App.tsx) | 26-32 | Provider sub-step state |
| `wizardBack` | [`App.tsx`](src/ui/App.tsx) | 206-238 | Back navigation logic |
| `finishProvider` | [`App.tsx`](src/ui/App.tsx) | 248-253 | Save provider and enter main |
| `chooseModel` | [`App.tsx`](src/ui/App.tsx) | 265-284 | Model selection dispatch |
| `SelectList` | [`Wizard.tsx`](src/ui/Wizard.tsx) | 16-103 | Reusable selection list component |
| `WizardStep` | [`Wizard.tsx`](src/ui/Wizard.tsx) | 105-131 | Bordered step container |
| `Step` type | [`SettingsPanel.tsx`](src/ui/SettingsPanel.tsx) | 10-24 | Settings navigation state |
| `masked` | [`SettingsPanel.tsx`](src/ui/SettingsPanel.tsx) | 26-29 | Key masking function |
| `rootItems` | [`SettingsPanel.tsx`](src/ui/SettingsPanel.tsx) | 58-87 | Current settings menu items |
| `BUILTIN` | [`pricing.ts`](src/pricing.ts) | 4-43 | Built-in pricing table |
| `priceFor` | [`pricing.ts`](src/pricing.ts) | 44-60 | Pricing lookup with fallback |
| `t()` | [`i18n.ts`](src/i18n.ts) | 30-33 | Translation function |

## Appendix B: Total New Presets Summary

| # | Name | Base URL | Models | Default | Has Key |
|---|------|----------|--------|---------|---------|
| 1 | Ollama | `http://localhost:11434/v1` | llama3, mistral, codellama | llama3 | No (sentinel) |
| 2 | xAI | `https://api.x.ai/v1` | grok-3, grok-3-mini | grok-3 | Yes |
| 3 | Perplexity | `https://api.perplexity.ai` | sonar-pro, sonar, sonar-reasoning | sonar-pro | Yes |
| 4 | Cohere | `https://api.cohere.ai/v1` | command-r-plus, command-r | command-r-plus | Yes |
| 5 | DeepInfra | `https://api.deepinfra.com/v1/openai` | 3 models | Llama-4-Maverick | Yes |
| 6 | Fireworks | `https://api.fireworks.ai/inference/v1` | 3 models | llama-v3p1-405b | Yes |
| 7 | Replicate | `https://api.replicate.com/v1` | 2 models | llama-3.1-405b | Yes |
| 8 | Cerebras | `https://api.cerebras.ai/v1` | llama-4-maverick, llama3.3-70b | llama-4-maverick | Yes |
| 9 | Novita | `https://api.novita.ai/v3/openai` | 3 models | Llama-4-Maverick | Yes |
| 10 | Hyperbolic | `https://api.hyperbolic.xyz/v1` | 3 models | Llama-4-Maverick | Yes |
| 11 | SambaNova | `https://api.sambanova.ai/v1` | 3 models | Llama-4-Maverick | Yes |

**Total presets after expansion:** 19 (8 existing + 11 new)
