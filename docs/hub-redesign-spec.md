# Hub Redesign Specification

**Status:** Draft — Revised  
**Author:** Architecture  
**Date:** 2026-06-21  
**Audience:** UI implementers, maintainers  
**Revision:** v2 — Added design system, ASCII logotype, animations, version display, project path retention

---

## 1. Visual References

### 1.1 Codex CLI patterns to borrow

| Pattern | How Codex does it | Where we apply it |
|---|---|---|
| **Single-line chrome** | Brand + status on one line, nothing else | Header top bar |
| **2-line agent card** | State icon + name on line 1, truncated task on line 2 | Agent row |
| **No telemetry in hub** | Steps/tokens/cost hidden until `/focus` | Agent row line 4 removal |
| **Dim secondary info** | All non-primary text in gray | Header project line, footer |
| **Grouping by whitespace** | No bold group headers, just `marginTop` | Group rendering |
| **Status bar as single line** | Counters + hints, no separate section | Footer |
| **Animated spinners** | Braille spinner on active agents | Agent row state mark |
| **Stylized branding** | ASCII/box-drawing wordmark in header | Parallel logotype |

### 1.2 Claude Code patterns to borrow

| Pattern | How Claude Code does it | Where we apply it |
|---|---|---|
| **Status dots inline** | Agent state (`●`/`◌`/`✓`) in the name line | Agent row line 1 |
| **No redundant labels** | State is implied by the icon, no text label | Remove `meta.label` from row |
| **Model shown once** | Model in the top bar, not per-agent | Header top bar |
| **/focus via keyboard** | Arrow keys navigate agents, no `/focus` in status | Footer simplification |
| **Version in chrome** | Version number visible in header or footer | Header line 2 right |
| **Pulsing state indicators** | Subtle color transitions on state changes | Agent row state marks |

---

## 2. Design System

### 2.1 Color Palette

Every color token has an explicit semantic purpose. No decorative colors.

#### Brand

| Token | Ink color | Usage |
|---|---|---|
| `brand.primary` | `cyanBright` | ASCII logotype, primary brand presence |
| `brand.secondary` | `cyan` | Borders, highlights, focus indicator, active spinner |

#### Agent State Colors

| Token | Ink color | Applies to | State mark color |
|---|---|---|---|
| `state.active` | `cyan` | `working`, `thinking`, `listening` | `●` in cyan |
| `state.waiting` | `yellow` | `waiting`, `paused` | `?` in yellow |
| `state.done` | `greenBright` | `done` | `✓` in greenBright |
| `state.error` | `redBright` | `error`, `stopped` | `✗` in redBright |
| `state.idle` | `gray` | `idle` | `◌` in gray |

#### Mode Colors

| Token | Ink color | Applies to | Indicator |
|---|---|---|---|
| `mode.ask` | `yellow` | `ask` mode agents | `?` mark before task |
| `mode.plan` | `blue` | `plan` mode agents | `△` mark before task |
| `mode.task` | (inherit) | `task` mode agents | No mark (default) |

#### Chrome Colors (extends existing [`UI`](src/ui/tokens.ts:12) tokens)

| Token | Ink color | Usage |
|---|---|---|
| `chrome.muted` | `gray` | Secondary text, separators, hints, folder path, version |
| `chrome.text` | `white` | Primary content text, agent task descriptions |
| `chrome.ok` | `greenBright` | Cost display, completion indicators, success states |
| `chrome.warn` | `yellow` | Pending counts, approval mode warnings |
| `chrome.danger` | `redBright` | Error counts, yolo mode indicator |
| `chrome.note` | `magentaBright` | Notes, annotations, system messages |

#### Animation Colors

| Token | Ink color | Usage |
|---|---|---|
| `anim.spinner` | `yellow` | Default spinner on agents in `thinking`/`listening` state |
| `anim.spinnerActive` | `cyan` | Spinner on agents in `working` state |
| `anim.spinnerWaiting` | `gray` | Spinner on `waiting`/`paused` agents (dim, barely visible) |

#### Global Header State Dot

| Condition | Color | Meaning |
|---|---|---|
| Any agent `working`/`thinking`/`listening` | `green` (`#00ff00`) | System is active |
| Any agent `waiting`/`paused` | `yellow` | System needs attention |
| All agents `idle`/`done`/`error` | `gray` | System is at rest |
| No agents | `gray` | Empty session |

#### Implementation Note

The existing [`UI`](src/ui/tokens.ts:12) object and [`STATE_META`](src/ui/tokens.ts:23) record already encode most of these semantics. This design system formalizes and extends them without breaking existing callers. New tokens (`mode.*`, `anim.*`) are additive. The `brand.*` tokens replace ad-hoc `cyanBright`/`cyan` usage.

### 2.2 Typography

| Element | Weight | Color | Size constraint |
|---|---|---|---|
| ASCII logotype | N/A (graphic) | `brand.primary` | 22 chars wide, 2 lines |
| Text fallback logo | `bold` | `brand.primary` | `"PARALLEL"` — 8 chars |
| Header state label | normal | `chrome.muted` | `"control room"` — 13 chars |
| Provider:model | normal | `chrome.muted` | `middleTruncate` at 28 (wide) / 18 (narrow) |
| Agent name | `bold` | `agent.color` | `middleTruncate` at 16 |
| Agent task text | normal | `chrome.text` | Truncate to `cols - 18` |
| Agent line 2 text | normal | `chrome.muted` | Truncate to available width |
| State counts | normal | Conditional (see 2.1) | Per-state: `mark + N + label` |
| Footer text | normal | `chrome.muted` | Single line, truncate-end |
| Version number | normal | `chrome.muted` | `v0.3.3` — 6 chars |
| Folder path | normal | `chrome.muted` | `middleTruncate` at 30 (wide) / 15 (narrow) |

### 2.3 Spacing Tokens

| Token | Value | Where |
|---|---|---|
| `space.header-bottom` | 0 (no margin) | Below header before agent list |
| `space.agent-row-gap` | `marginBottom={0}` | Between agent rows (0 = tight packing) |
| `space.group-separator` | 1 full line `─` repeated | Between state groups |
| `space.breathing` | 1 empty line | Between agent list end and footer |
| `space.section-gap` | `marginTop={1}` | Between major sections |
| `space.agent-indent` | `paddingLeft={1}` | Agent row left indent |

---

## 3. ASCII Logotype

### 3.1 Primary Logo (terminals ≥ 80 cols)

2-line box-drawing wordmark, 22 characters wide, in `brand.primary` (`cyanBright`):

```
╔═╗╔═╗╦═╗╔═╗╦  ╦  ╔═╗╦
╚═╝╚═╝╩╚═╝╚═╝╩═╝╩═╝╚═╝╩═╝
```

Each letter is a 2×2 cell (or 2×1 for narrower letters). The bottom line uses a continuous floor (╚═╝/╩═╝/╩╚═╝) as an artistic choice — the "imperfect" box-drawing is part of the terminal pixel-art aesthetic and is immediately recognizable as "PARALLEL."

**Implementation:** Define as a constant array of two strings in a new file or directly in the header component:

```tsx
const LOGO_LINES = [
  '╔═╗╔═╗╦═╗╔═╗╦  ╦  ╔═╗╦',
  '╚═╝╚═╝╩╚═╝╚═╝╩═╝╩═╝╚═╝╩═╝',
] as const;
```

Render via:
```tsx
<Box flexDirection="column">
  {LOGO_LINES.map((line, i) => (
    <Text key={i} color={UI.brand}>{line}</Text>
  ))}
</Box>
```

### 3.2 Narrow Fallback (terminals < 80 cols)

When `cols < 80`, replace the 2-line ASCII logo with a single-line text wordmark:

```
PARALLEL
```

8 characters, `bold`, `brand.primary`. This saves 1 line of header height on small terminals.

```tsx
const LOGO_FALLBACK = 'PARALLEL';
```

### 3.3 Terminal Safety

All characters are from the Unicode Box Drawing block (U+2500–U+257F), which is supported by every modern terminal emulator (iTerm2, Terminal.app, Windows Terminal, Alacritty, Kitty, GNOME Terminal, tmux, screen). No emoji, no private-use characters, no Nerd Font dependencies. If a terminal somehow renders box-drawing as garbage, the narrow fallback kicks in.

---

## 4. Header Redesign

### 4.1 Current (3-4 lines)

```
─── App.tsx:672-693 ──────────────────────────────────────
 Parallel control room · provider:model                    ← line 1
                                                            ← (Box padding)
 Project /home/user/project · change: parallel <folder> …  ← line 2
 Needs input 0 · Working 2 · Completed 1 · Agents 3        ← line 3
 Best at 120x34 · current 80x24           (conditional)    ← line 4
─── App.tsx:831-858 (MainScreen render) ──────────────────
 Parallel   control room                        provider:model
 Project /home/user/project · change: parallel …  Shell ask · $0.01
 Needs input 0   Working 2   Completed 1   Agents 3
```

**Problems:**
- 3 lines of chrome before any content
- Project path is too much detail for the header (belongs in status)
- "change: parallel <folder>" is help text, not a header element
- "Shell ask" is duplicative with session config
- Counts line is all flat text with no visual hierarchy
- `formatHubHeader()` returns a bag of strings that are then re-rendered inline via `<Box>` in `MainScreen` — the function and the JSX are writing the same data in different shapes
- No version shown anywhere
- Plain text "Parallel" has no visual identity

### 4.2 Proposed Header: 2 lines (≥ 80 cols)

```
╔═╗╔═╗╦═╗╔═╗╦  ╦  ╔═╗╦
╚═╝╚═╝╩╚═╝╚═╝╩═╝╩═╝╚═╝╩═╝  ● control room          provider:model
◇0 idle · ●2 active · ✓1 done · ✗1 err   ~/project · v0.3.3 · $0.008
```

**Line 1** — ASCII logotype + status summary:
- 2-line ASCII logo (22 chars wide) in `brand.primary` (`cyanBright`)
- State indicator: `●` (color depends on global state — see §2.1, "Global Header State Dot") + `control room` in `chrome.muted`
- Right-aligned: `provider:model` in `chrome.muted`, model via `middleTruncate` at 28 chars

**Line 2** — Agent counts + metadata:
- Per-state counts: `◇ N idle` (gray), `● N active` (accent if >0), `✓ N done` (ok if >0), `✗ N err` (danger if >0)
- Right-aligned (in `chrome.muted`): folder path (`middleTruncate` at 30) · version (`v{version}`) · cost (`$X.XXX`)

**Version resolution:** Read `version` from `package.json` at import time via `resolveJsonModule` (already enabled in [`tsconfig.json:13`](tsconfig.json:13)):
```ts
import pkg from '../package.json' assert { type: 'json' };
const VERSION = pkg.version; // "0.3.3"
```

**When there are zero agents** — no counts shown, only line 1. Line 2 shows just `~/project · v0.3.3`.

### 4.3 Proposed Header: 2 lines (< 80 cols, narrow)

```
PARALLEL ● control room                   provider:model
◇0 · ●2 · ✓1 · ✗1   ~/proj · v0.3.3 · $0.008
```

- ASCII logo replaced by `PARALLEL` text fallback (8 chars, bold, `brand.primary`)
- State count labels shortened: `◇0 idle` → `◇0`, etc.
- Folder path truncated more aggressively: `middleTruncate` at 15
- Provider:model `middleTruncate` at 18

### 4.4 Project Folder Path

The original spec (§2.3) proposed removing the project path entirely. This revision keeps it — right-aligned on header line 2, in `chrome.muted` gray, truncated. Rationale:

- The user explicitly wants to know which folder they're working on
- Right-aligned gray text is non-intrusive — it's glanceable when needed, ignorable when not
- The path changes only at session start, so it doesn't create visual noise
- At < 80 cols, it shortens to just the directory name

### 4.5 What moved to footer / status bar

| Current header field | New location | Rationale |
|---|---|---|
| `change: parallel <folder>` | Removed | Setup-time hint, not runtime chrome |
| `sessions: /sessions` | Removed | `/help` covers this |
| `Shell ask` | Moved to status bar | Only relevant during approval interactions |
| `Size hint (`Best at 120x34`)` | Removed | Terminal-aware layouts should adapt silently |

### 4.6 Implementation notes

- Replace [`formatHubHeader()`](src/ui/App.tsx:672) with inline JSX in `MainScreen`
- Delete the string-returning function entirely — render directly in JSX
- Color logic per-state already exists in [`STATE_META`](src/ui/tokens.ts:23)
- The `middleTruncate` utility at [`tokens.ts:35`](src/ui/tokens.ts:35) handles long model names and paths
- Define `LOGO_LINES` and `LOGO_FALLBACK` as module-level constants in [`App.tsx`](src/ui/App.tsx)
- Import version from `package.json` at module level

---

## 5. Agent List Redesign

### 5.1 Current agent row: 4 lines

```
● architect   Task working                                           ← AgentPanel.tsx:86
  Redesign the hub layout to be more graphic and airy                ← AgentPanel.tsx:87
  Started analysis of current layout, identified 7 problem areas     ← AgentPanel.tsx:88
  5m12s · 3 st · 12k · 45% · $0.023 · /focus architect              ← AgentPanel.tsx:89
```

**Problems:**
- Line 3 (signal/result) and line 4 (telemetry) are noise in the hub — they belong in `/focus`
- State label text ("working") is redundant with the state mark (`●`)
- Mode label ("Task") takes space for little value in the hub view
- `/focus` hint on every row is wasteful — users type it once

### 5.2 Proposed agent row: 2 lines

```
⠋ architect ?  Redesign the hub layout to be more graphic and airy
   ✓ Started analysis…  ● 5m12s → $0.023
```

**Line 1** — Identity + task:
- **Spinner** (replaces static state mark for active agents): braille spinner `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 80ms interval, color depends on state (see §7.1)
- **Static state mark** for non-active agents: `●`/`◌`/`✓`/`✗`/`?` in `STATE_META.color` bold
- Agent name in `agent.color` bold
- Mode indicator with a single character: `/a` → `?` in yellow, `/p` → `△` in blue, `/t` → no mark (default)
- Task text truncated to `signalMax` (cols - 18), in `chrome.text`

**Line 2** — Status summary:
- If agent has `lastResult`: `✓` in `chrome.ok` + truncated result (80 chars)
- If agent has `currentAction`: `▸` in `brand.secondary` + truncated action (same width)
- If idle/waiting: just the state label text in `STATE_META.color`
- Telemetry only shows: elapsed time + cost (no steps/tokens/ctx%)
- Aligned: `● 5m12s → $0.023` right-padded

### 5.3 State marks and spinner rules

| State | Static mark | Spinner? | Color | Shown as |
|---|---|---|---|---|
| `waiting` | `?` | No (static) | `state.waiting` (yellow) | `? architect` |
| `paused` | `?` | No (static) | `state.waiting` (yellow) | `? architect` |
| `listening` | — | Yes | `anim.spinner` (yellow) | `⠋ architect` |
| `thinking` | — | Yes | `anim.spinner` (yellow) | `⠋ architect` |
| `working` | — | Yes | `anim.spinnerActive` (cyan) | `⠋ architect` |
| `error` | `✗` | No (static) | `state.error` (redBright) | `✗ architect` |
| `stopped` | `✗` | No (static) | `state.error` (redBright) | `✗ architect` |
| `done` | `✓` | No (static) | `state.done` (greenBright) | `✓ architect` |
| `idle` | `◌` | No (static) | `state.idle` (gray) | `◌ architect` |

The spinner is used **only** for `listening`, `thinking`, and `working` states — the states where the agent is actively doing something. All other states use the static mark. This creates a strong visual signal: motion = work in progress.

### 5.4 Mode indicators

| Mode | Character | Color | Visible to user as |
|---|---|---|---|
| `task` | (none) | — | `⠋ architect  Redesign the…` |
| `ask` | `?` | `mode.ask` (yellow) | `⠋ architect ?  What is the…` |
| `plan` | `△` | `mode.plan` (blue) | `⠋ architect △  Step 1: analyze…` |

The mode indicator appears inline after the name, before the task text.

### 5.5 Group rendering

**Current** ([`App.tsx:1040-1053`](src/ui/App.tsx:1040)) — bold colored headers competing with rows:

```
─── Needs input ─── (yellow, bold)
● a1  needs input …
◌ a2  paused …

─── Working ─── (cyan, bold)
● a3  working …

─── Completed ─── (greenBright, bold)
✓ a4  done …
```

**Proposed** — no group headers, visual separation via a colored separator line:

```
? architect  Handle the follow up question
◌ helper     idling for next instruction
─────────────────────────────────────────  ← in chrome.muted (gray)
⠋ designer   Creating the mockup…
⠋ reviewer   Reviewing the implementation
─────────────────────────────────────────  ← in chrome.muted (gray)
✓ writer     Documentation complete
```

- Groups separated by a single muted-gray line (─ repeated to `cols - 2`)
- No text headers — state marks already encode the group
- Group order (from [`groupAgents`](src/ui/App.tsx:786)): needs input → working → errors → completed → idle
- If a group is empty, skip the separator
- First group has no leading separator

### 5.6 Multi-agent legibility

To make scanning many agents fast, the design provides multiple independent visual cues:

1. **Spinner vs static mark** — Motion draws the eye to active agents; static marks recede. A user can instantly see which agents are working without reading text.

2. **Color coding by state** — Each state has a distinct color on the state mark (cyan = working, yellow = waiting, green = done, red = error, gray = idle). The color difference is visible in peripheral vision.

3. **Mode indicator** — The `?` (yellow) and `△` (blue) characters stand out against the default text, making `ask` and `plan` agents distinguishable at a glance, even in a list of 15+ agents.

4. **Agent color** — Each agent already has a unique color assigned at creation via `agent.color`. This persists in the name rendering, providing identity differentiation.

5. **Separator lines** — Thin gray lines between groups provide structure without competing for attention. They create visual "sections" that the eye can skip between.

6. **Tight packing (0 margin between rows)** — No wasted lines. At 2 lines per agent + 1 separator between groups, a 120×34 terminal shows 14 agents with room to spare.

### 5.7 Scroll indicators

```
▲ 3 older · PgDn to latest

⠋ architect  Redesign the hub…
   ✓ Started analysis…
─
⠋ worker     Implement changes
   ▸ Writing tests…

▼ 2 more · PgUp
```

Scroll indicators use `chrome.muted` color. The `above` text appears only when `scroll > 0`. The `below` text appears when there are hidden rows.

---

## 6. Footer / Status Bar

### 6.1 Current

```
Tab/→ autocomplete · /focus <agent> details · /sessions saved work · /settings config   (App.tsx:~938)
```

### 6.2 Proposed

Two lines at the bottom:

```
/ask /task /plan · Tab autocompletes · Esc clears
⌘ Parallel v0.3.3 · Shell ask · Sessions: 3 · ❓1 ⏳2  🎯 architect
```

**Line 1** — Command hints (shown only when no agents exist / session is idle):
- `/ask /task /plan` in `brand.secondary`
- "Tab autocompletes" / "Esc clears" in `chrome.muted`

**Line 2** — Session status (always shown):
- `⌘ Parallel v0.3.3` in `chrome.muted` (brand watermark with version)
- `Shell ask|auto|yolo` in yellow/green/red depending on approval mode
- `Sessions: N` in `chrome.muted` (auto-save count)
- `❓N` (questions pending, yellow)
- `⏳N` (approvals pending, yellow)
- `🎯 agent-name` (focus target, cyan) — only when focused

When the session is empty (no agents), line 1 expands to more verbose help; when agents exist, line 1 collapses to nothing.

### 6.3 Status bar conditions

| Condition | Line 1 | Line 2 |
|---|---|---|
| No agents | Full command hints | `⌘ Parallel v0.3.3 · Shell ask` |
| Agents exist, no pending interactions | (empty) | `⌘ Parallel v0.3.3 · Shell auto · Sessions: 3` |
| Pending questions/approvals | (empty) | `⌘ Parallel v0.3.3 · … · ❓1 ⏳2` |
| Focus mode active | (empty) | `⌘ Parallel v0.3.3 · … · 🎯 architect` |
| Approval mode = yolo | (empty) | `⌘ Parallel v0.3.3 · … · ⚠ yolo` (red) |

---

## 7. Animations

### 7.1 Spinner on active agents

When an agent is in `listening`, `thinking`, or `working` state, the static state mark is replaced with an animated braille spinner.

**Implementation:** Use Ink's built-in `<Spinner>` component (Ink ≥ 4.x) or the existing custom [`Spinner`](src/ui/Spinner.tsx:6) component. Ink's `<Spinner>` uses the same braille frames and is preferred for consistency.

```tsx
import { Spinner } from 'ink';

// In AgentRow:
{isActiveState(agent.state) ? (
  <Spinner type="dots" />  // Ink built-in: ⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏
) : (
  <Text color={meta.color} bold>{meta.mark}</Text>
)}
```

**Timing:**
- Frame interval: 80ms (same as existing [`Spinner.tsx:9`](src/ui/Spinner.tsx:9))
- Full cycle: 10 frames × 80ms = 800ms per rotation
- This is fast enough to convey activity, slow enough not to be distracting

**Color rules:**

| Agent state | Spinner color | Rationale |
|---|---|---|
| `listening` | `anim.spinner` (yellow) | Waiting for user input — attention color |
| `thinking` | `anim.spinner` (yellow) | Processing — warm, active |
| `working` | `anim.spinnerActive` (cyan) | Executing — brand-aligned, distinct from thinking |
| `waiting` | `anim.spinnerWaiting` (gray) | Dim, barely visible — agent is blocked, not progressing |

### 7.2 State transition pulse

When an agent changes state, briefly flash the state mark in a brighter variant of the new state's color, then settle to the normal color. This draws attention to state changes without persistent animation noise.

**Implementation:** Use React state + `useEffect` with a timeout:

```tsx
// In AgentRow or a wrapping StateTransition component:
const [pulse, setPulse] = useState(false);
useEffect(() => {
  setPulse(true);
  const timer = setTimeout(() => setPulse(false), 400);
  return () => clearTimeout(timer);
}, [agent.state]);

const markColor = pulse ? PULSE_COLORS[meta.color] : meta.color;
```

**Pulse color map:**

| Normal color | Pulse color | Duration |
|---|---|---|
| `cyan` | `cyanBright` | 400ms |
| `yellow` | `yellowBright` (or `#ffff00`) | 400ms |
| `greenBright` | `green` → `greenBright` (reverse pulse) | 400ms |
| `redBright` | `red` → `redBright` (reverse pulse) | 400ms |
| `gray` | `white` | 400ms |

**Constraint:** Ink's color support is limited to the named colors Ink exposes (black, red, green, yellow, blue, magenta, cyan, white, gray, and their Bright variants). Hex colors are NOT supported in Ink's `<Text color>` prop (Ink uses chalk's color names). The pulse must use only these named colors.

The pulse fires on every state change. Since `setTick` throttles at 80ms (see [`App.tsx:136`](src/ui/App.tsx:136)), rapid state oscillation will self-throttle — only the most recent state before the render cycle gets the pulse.

### 7.3 What does NOT animate

- **Static state marks** (`◌`, `✓`, `✗`, `?`) — no animation. These states are "settled."
- **Agent task text** — no animation. Content changes are already visible via text replacement.
- **Header ASCII logo** — static. The logo is brand identity, not a status indicator.
- **Separator lines** — static.
- **Footer** — static (except counts updating, which is a text change, not animation).

### 7.4 Performance constraints

- Ink re-renders are React reconciler cycles, not DOM paints. Spinners add negligible overhead — they change a single `<Text>` node per active agent.
- The 80ms throttle on state updates ([`App.tsx:136`](src/ui/App.tsx:136)) applies to all UI changes, including spinner frames. The spinner component's internal 80ms interval aligns with this throttle, so frames won't queue up.
- With 20 active agents all showing spinners: 20 `<Spinner>` instances × 80ms = same render cycle. Ink batches updates. No measurable performance impact.
- State transition pulses are one-shot 400ms timeouts per agent per state change. At most one active pulse per agent at a time.

### 7.5 Ink `<Spinner>` compatibility

Ink 5.x (the project uses `"ink": "^5.1.0"` per [`package.json:49`](package.json:49)) includes `<Spinner>` with the `type` prop:

| `type` | Frames |
|---|---|
| `"dots"` | `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` (braille, default) |
| `"line"` | `\|/—` |
| `"arc"` | `◜◠◝◞◡◟` |

Use `type="dots"` for active agents (matches existing custom spinner). Reserve `type="arc"` for a potential future "system busy" indicator in the header if needed.

The existing custom [`Spinner.tsx`](src/ui/Spinner.tsx) can be deprecated once Ink's built-in `<Spinner>` is adopted. Keep the file for now as a reference; remove after Phase 2 is confirmed working.

---

## 8. Full Layout Blueprint

### 8.1 Before (current, 80×24 terminal)

```
─── App.tsx Header (lines 672-693 + 831-858) ─────────────────────────
 Parallel   control room                        provider:model         ← 1
 Project /home/user/project · change: parallel…  Shell ask · $0.01    ← 2
 Needs input 0   Working 2   Completed 1   Agents 3                   ← 3
                                                                        ← 4
─── App.tsx AgentHub (lines 1040-1053) ────────────────────────────────
─── Working ───                                                       ← 5
● a1  Task working                                                     ← 6
  Implement the feature                                                ← 7
  Started work on the implementation                                   ← 8
  2m · 1 st · 5k · 12% · $0.005 · /focus a1                           ← 9
● a2  Task working                                                     ← 10
  Write tests for the feature                                          ← 11
  Writing unit tests for edge cases                                    ← 12
  1m · 0 st · 2k · 8% · $0.002 · /focus a2                            ← 13
                                                                        ← 14
─── Completed ───                                                     ← 15
✓ a3  Task done                                                       ← 16
  Initial setup                                                        ← 17
  Project scaffolding complete                                         ← 18
  30s · 0 st · 1k · 0% · $0.001 · /focus a3                           ← 19
                                                                        ← 20
─── Footer ────────────────────────────────────────────────────────────
Tab/→ autocomplete · /focus <agent> details · /sessions saved …       ← 21
                                                                        ← 22
[input line]                                                           ← 23
Tab/→ autocomplete · /focus <agent> details …                         ← 24
```

**Total rows used:** 24 (max for 80×24 terminal)  
**Content rows:** ~15 (agents) of 24 available  
**Overhead:** 9 rows (header 3 + group headers 2 + footer 2 + input 1 + status 1)

### 8.2 After (proposed, same 80×24 terminal)

```
─── Header (2 lines + logo) ───────────────────────────────────────────
╔═╗╔═╗╦═╗╔═╗╦  ╦  ╔═╗╦                                          ← 1a
╚═╝╚═╝╩╚═╝╚═╝╩═╝╩═╝╚═╝╩═╝  ● control room          provider:model  ← 1b
◇0 idle · ●2 active · ✓1 done · ✗0 err  ~/project · v0.3.3 · $0.008  ← 2
                                                                        ← 3 (breathing)
─── AgentHub ──────────────────────────────────────────────────────────
⠋ a1  Implement the feature                                            ← 4
   ▸ Started work on the implementation                                 ← 5
─────────────────────────────────────────────────────────────────────── ← 6 (separator)
⠋ a2  Write tests for the feature                                      ← 7
   ▸ Writing unit tests for edge cases                                  ← 8
─────────────────────────────────────────────────────────────────────── ← 9 (separator)
✓ a3  Initial setup                                                    ← 10
   ✓ Project scaffolding complete                                       ← 11
                                                                        ← 12 (breathing)
─── Footer (1-2 lines) ────────────────────────────────────────────────
⌘ Parallel v0.3.3 · Shell ask · Sessions: 3 | ❓0 ⏳0                  ← 13
                                                                        ← 14
                                                                        ← 15
[input line]                                                           ← 16
```

**Total rows used:** 16 (of 24)  
**Content rows:** ~8 (3 agents × 2 lines + 2 separators)  
**Overhead:** 5 rows (header 2 + breathing 1 + footer 1 + input 1)  
**Saved:** 8 rows, giving room for ~4 more agents in the same terminal

### 8.3 Narrow terminal (< 80 cols) layout

```
─── Header (2 lines, compact) ──────────────────────────────────────────
PARALLEL ● control room                             anthropic:claude…  ← 1
◇0 · ●2 · ✓1 · ✗1          ~/proj · v0.3.3 · $0.008                   ← 2
                                                                        ← 3
─── AgentHub ──────────────────────────────────────────────────────────
⠋ a1  Implement the feature                                            ← 4
   ▸ Started work…                                                     ← 5
─────────────────────────────────────────────────────────────────────── ← 6
⠋ a2  Write tests…                                                     ← 7
   ▸ Writing unit tests…                                               ← 8
```

- ASCII logo replaced by `PARALLEL` text (8 chars)
- State count labels shortened (`idle` → omitted, etc.)
- Provider:model truncated at 18 chars
- Folder truncated at 15 chars

### 8.4 Layout by screen size

| Terminal size | Logo type | Header lines | Max agent rows (2-line each) | Footer | Input |
|---|---|---|---|---|---|
| 50×12 (minimum) | Text fallback | 2 | 2 agents (4 lines) | 1 | 1 |
| 80×24 (small) | ASCII 2-line | 2 | 7 agents (14 lines) | 1 | 1 |
| 100×30 (medium) | ASCII 2-line | 2 | 11 agents (22 lines) | 1 | 1 |
| 120×34 (target) | ASCII 2-line | 2 | 14 agents (28 lines) | 1 | 1 |

Agent count calculations: `rows - header(2) - breathing(1) - footer(1) - input(1) = rows - 5`, then `available / 2`.

### 8.5 Empty state

```
╔═╗╔═╗╦═╗╔═╗╦  ╦  ╔═╗╦
╚═╝╚═╝╩╚═╝╚═╝╩═╝╩═╝╚═╝╩═╝  ◌ control room          provider:model
                       ~/project · v0.3.3

  /ask  /task  /plan    —    Tab autocompletes    Esc clears

  Type a task below to get started. Agents work in parallel,
  communicate via the blackboard, and coordinate automatically.

⌘ Parallel v0.3.3 · Shell ask
```

- No agent counts shown (all zero)
- Centered (via padding) empty-state message
- Command hints in footer since there's nothing happening
- Folder path and version still visible on line 2

### 8.6 Focus mode (single agent, scrollable)

```
╔═╗╔═╗╦═╗╔═╗╦  ╦  ╔═╗╦
╚═╝╚═╝╩╚═╝╚═╝╩═╝╩═╝╚═╝╩═╝  🎯 control room          provider:model
◇0 idle · ●2 active · ✓1 done    ~/project · v0.3.3

─── architect — ⠋ working ────────────────────── model · 5m · $0.01
Task  Redesign the hub layout
Current  Working on the header component

▸ Implemented the brand line with provider info
  Added state counts row below the header
  Next: agent list redesign

Result
✓ Layout complete. All sections render correctly.

PgUp/PgDn scroll · /raw toggles detail · Esc returns
```

Focus mode layout is unchanged structurally from current [`AgentTranscript`](src/ui/AgentPanel.tsx:104-159). The hub header compresses to 2 lines + the focus banner acts as a separator.

---

## 9. Transition Plan

### 9.1 Dependency graph

```
Phase 0 (design tokens + logo)
    └─ no deps — pure addition

Phase 1 (header simplification)
    └─ depends on Phase 0 (uses new tokens + logo)

Phase 2 (agent row compression + animations)
    └─ depends on Phase 0 (uses new tokens + spinner rules)
    └─ independent of Phase 1 (can be done in parallel)

Phase 3 (group header removal)
    └─ depends on Phase 2 (row height changes affect group rendering)

Phase 4 (footer compaction)
    └─ no deps (independent, but best done last for visual polish)

Phase 5 (state transition pulses)
    └─ depends on Phase 2 (pulses apply to the new agent row structure)
```

### 9.2 Phase 0 — Design tokens and ASCII logo (1 hour)

**Changes:**
1. Add new color tokens to [`tokens.ts`](src/ui/tokens.ts): `MODE_COLOR`, `ANIM_COLOR`, formalize `BRAND`
2. Add `GLOBAL_STATE_DOT_COLOR` function (maps agent states to header dot color)
3. Add `LOGO_LINES` and `LOGO_FALLBACK` constants in a new file or in [`App.tsx`](src/ui/App.tsx)
4. Import version from `package.json`, export as `APP_VERSION` constant
5. Add `isActiveState()` helper (returns true for `listening`/`thinking`/`working`)

**Files touched:** [`src/ui/tokens.ts`](src/ui/tokens.ts), possibly new `src/ui/logo.ts`, [`src/ui/App.tsx`](src/ui/App.tsx)  
**Risk:** None — pure addition, no behavior changes  
**Reversibility:** Immediate revert  
**Test:** `tsc` compiles clean; token values are correct

### 9.3 Phase 1 — Header simplification (1-2 hours)

**Changes:**
1. Replace [`formatHubHeader()`](src/ui/App.tsx:672) with inline JSX in [`MainScreen`](src/ui/App.tsx:552)
2. Render ASCII logo or text fallback based on `cols`
3. Collapse 3 header boxes into 2 lines as specified in §4.2
4. Move Shell approval mode display to footer
5. Add folder path to header line 2 (right-aligned, muted)
6. Add version number to header line 2 and footer

**Files touched:** [`src/ui/App.tsx`](src/ui/App.tsx) only  
**Risk:** Low — purely cosmetic, no data flow changes  
**Reversibility:** Immediate revert of the JSX block  
**Test:** Header renders correctly at 80×24, 100×30, 120×34, and 50×12

### 9.4 Phase 2 — Agent row compression + animations (3-4 hours)

**Changes:**
1. Rewrite [`AgentRow`](src/ui/AgentPanel.tsx:73-102) from 4 lines to 2 lines
2. Add `<Spinner>` from Ink for active agent states (§7.1)
3. Remove telemetry line (steps/tokens/ctx%/cost)
4. Move mode label to inline single-character indicator
5. Remove `/focus` hint from every row
6. Reformat line 2 to always show either `lastResult` (done/error) or `currentAction` (working) — never both
7. Update [`formatAgentTelemetry`](src/ui/AgentPanel.tsx:36-47) to return only `elapsed · cost` for the hub (callers in `/attach` and `AgentTranscript` still use the full version)

**Files touched:** [`src/ui/AgentPanel.tsx`](src/ui/AgentPanel.tsx), [`src/ui/AttachApp.tsx`](src/ui/AttachApp.tsx) (uses `formatAgentTelemetry`)  
**Risk:** Medium — `formatAgentTelemetry` is called from three places; must ensure callers expecting the full string aren't broken  
**Reversibility:** Add a `detailed` parameter to `formatAgentTelemetry` for backwards compat  
**Test:** Agent list at 5 agents fits in 80×24; `/focus` shows full telemetry; `/attach` still shows full telemetry; spinners animate on active agents

### 9.5 Phase 3 — Group header removal (1 hour)

**Changes:**
1. Replace bold colored group headers in [`groupAgents` / `AgentHub`](src/ui/App.tsx:786-847) with a separator line
2. Add `─` separator rendering using `Text` with `color="gray"`
3. Remove the `group.title` text rendering

**Files touched:** [`src/ui/App.tsx`](src/ui/App.tsx) only  
**Risk:** Low — purely cosmetic  
**Reversibility:** Revert the `AgentHub` render block

### 9.6 Phase 4 — Footer compaction (1 hour)

**Changes:**
1. Reduce footer/status bar from current 2-line setup to 1-2 lines as specified in §6.2
2. Add conditional rendering for empty vs active states
3. Add session count tracking to the controller (or read from `ctl.board`)
4. Add version number to footer watermark

**Files touched:** [`src/ui/App.tsx`](src/ui/App.tsx), possibly [`src/controller.ts`](src/controller.ts) for session count  
**Risk:** Low  
**Reversibility:** Revert the footer JSX

### 9.7 Phase 5 — State transition pulses (1 hour)

**Changes:**
1. Add `useStateTransitionPulse` hook (or inline logic in AgentRow)
2. Apply pulse colors on state change with 400ms timeout
3. Define `PULSE_COLORS` mapping in `tokens.ts`

**Files touched:** [`src/ui/AgentPanel.tsx`](src/ui/AgentPanel.tsx), [`src/ui/tokens.ts`](src/ui/tokens.ts)  
**Risk:** Low — additive, one-shot timeouts  
**Reversibility:** Remove the hook call; everything else works as in Phase 2  
**Test:** Change an agent state (e.g., `/pause` then `/resume`); verify brief color flash on state mark

---

## 10. Risks and Edge Cases

### 10.1 Small terminals (< 80 columns)

| Feature | Behavior at < 80 cols |
|---|---|
| ASCII logo | Replaced by text fallback `PARALLEL` |
| Header line 2 | State labels shortened; folder path truncated at 15; version kept |
| Provider:model | `middleTruncate` at 18 chars |
| Agent row task | `signalMax` drops from `cols-18` to `cols-12`; truncate aggressively |
| Separator line | Render as `─` repeated to `cols - 2` (not full width) |
| Group separator | Hide when fewer than 2 groups visible |
| Footer | Hide line 2 (session status); only show line 1 (compact hints) |
| Spinners | Still animate — Ink's `<Spinner>` is a single character, always fits |

**Implementation:** Use existing `narrow` flag at [`App.tsx:586`](src/ui/App.tsx:586)

### 10.2 Very small terminals (< 50 columns)

At this size, the ASCII logo is always text fallback. Agent rows may need to collapse to 1 line:

```
⠋ a1  Implement feature…  ▸ Started work…  5m·$0.005
```

Defer this to a follow-up — the spec targets ≥50 cols as minimum viable.

### 10.3 Box-drawing character rendering

Some terminals (particularly older Windows consoles without UTF-8 enabled, or misconfigured tmux) may not render box-drawing characters. Mitigations:

- The text fallback `PARALLEL` always works — pure ASCII
- Box-drawing is in the Unicode Basic Multilingual Plane (U+2500–U+257F) and supported by every terminal from the last 15 years
- If a terminal somehow mangles the logo, the rest of the UI is unaffected (the logo is decorative)

### 10.4 Version resolution at build time

Reading `package.json` at import time means the version is baked into the compiled JS. If the user runs an old build with a new `package.json`, the version will be stale. This is acceptable — the version reflects the build, not the package file on disk. `npm run build` always produces a fresh build with the current version.

### 10.5 Many agents (20+)

| Risk | Mitigation |
|---|---|
| Scrolling becomes painful | PageUp/PageDn already implemented via [`hubScroll`](src/ui/App.tsx:607) |
| Agent names too long | Names are already limited to 16 chars at creation ([`commands.ts:139`](src/commands.ts:139)) |
| All agents in same state | Group separator rendering handles empty groups gracefully |
| Screen fill with separators | Only render separator when a group has at least one agent (`filter((g) => g.agents.length > 0)`) |
| Too many spinners (perf) | Ink batches React updates; 20 `<Spinner>` instances at 80ms = negligible overhead |

### 10.6 Long agent names

The 16-char limit at creation time is sufficient. For edge cases where names exceed this (migration, loaded sessions), use `middleTruncate(name, 16)` in the AgentRow.

### 10.7 Empty states

| State | What renders | Where handled |
|---|---|---|
| No agents | Empty state text + command hints | [`App.tsx:919`](src/ui/App.tsx:919) — current border box replaced with centered instruction |
| No agents, just launched | Brief "Agent launched" toast in system lines | Existing systemLines mechanism |
| All agents completed | Group separator precedes "Completed" section; no special handling needed | Phase 3 handles this |
| Focus mode with no matching agent | Toast via `ui.system` in `/focus` handler | Existing commands.ts logic |

### 10.8 Cost display staleness

Cost is calculated from `agent.cost` which is updated as the agent progresses. The 80ms throttle on state updates means cost might be a few hundred ms stale — acceptable for a TUI.

### 10.9 Session count in footer

The controller doesn't currently expose the session save count. Options:
- **Quick:** Count `.parallel-session-*.json` files in the project root (already done via `Controller.listSessions`)
- **Better:** Add a `savedSessionCount` property to the board or controller that tracks save events

Recommend the quick approach for Phase 4, defer the better approach.

---

## 11. Summary of Key Design Decisions

| Decision | Rationale | Trade-off |
|---|---|---|
| **ASCII box-drawing logo** | Distinctive visual identity; terminal-safe; no font deps | 22 chars wide — needs narrow fallback for <80 cols |
| **2-line header** | Minimizes chrome; all essential info fits | Cost is slightly harder to see at a glance |
| **Project path retained** | User explicitly requested it; right-aligned gray = non-intrusive | Adds ~30 chars to header line 2 |
| **Version displayed in header + footer** | Visible at launch; persists in footer watermark | 6 extra chars in header line 2 |
| **Braille spinners on active agents** | Motion = progress; static marks = settled; universal pattern | 20+ spinners may look busy (mitigated by state-based color dimming) |
| **400ms state transition pulse** | Draws attention to state changes without persistent noise | Adds a timeout per state change per agent |
| **Group separators, not headers** | Removes visual competition with agent rows | Groups without text require familiarity with state marks |
| **2-line agent rows** | Doubles density; removes telemetry noise from hub | Telemetry requires `/focus` — acceptable trade-off |
| **Mode as single char** | Saves space vs `Task`/`Ask`/`Plan`; `?` and `△` are distinctive | Users must learn the mapping (shown in `/help`) |
| **Footer shows questions/approvals** | Critical information at the bottom, near the input line | Adds 1 line of chrome |
| **Separator as `─` line** | Cleaner than blank space for group transitions | Adds 1 line between groups (but saves group header line) |
| **`formatAgentTelemetry` refactored** | Prevents breaking callers in AttachApp and AgentTranscript | Slight increase in API surface |
| **Multi-cue legibility** | Motion + color + shape + spacing = independent visual channels | More implementation complexity in AgentRow |

---

## 12. Open Questions

1. Should the ASCII logo animate on startup (a brief "typing" effect where the box-drawing characters appear one by one)? Probably not — adds complexity for marginal delight. Keep it static.

2. Does the `narrow` (<80 cols) layout need its own agent row compact mode (1 line instead of 2)? Defer until Phase 2 is landed and tested at small sizes.

3. Should auto-save session count appear in the footer? Requires adding a counter to the controller — worthwhile but out of scope for v1 of this redesign.

4. Should the version number also appear in the `--version` CLI flag output (it already does via `package.json`)? Confirm this works correctly — out of scope for the UI redesign but worth verifying.

5. Ink's `<Spinner>` vs the custom [`Spinner.tsx`](src/ui/Spinner.tsx) — should we standardize on Ink's built-in? Yes. The built-in `<Spinner>` is maintained by the Ink team, supports the same braille frames, and reduces our code surface. Deprecate the custom spinner after Phase 2.

6. Should `waiting`/`paused` agents show a dim spinner or a static `?` mark? The spec currently says static `?` mark — this is intentional. A spinner on a waiting agent suggests progress when none is happening. The `?` mark is honest: "this agent needs you."
