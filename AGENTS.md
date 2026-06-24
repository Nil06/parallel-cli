## Learned User Preferences

- Read the actual codebase, README, and relevant git history before planning major Parallel changes.
- For attached implementation plans, do not edit the plan file; use the existing todos and mark them as work progresses.
- Do not commit, push, tag, publish to GitHub, or publish to npm unless the user explicitly instructs it.
- Never use `cursoragent` (or any Cursor/agent identity) as git author, git committer, GitHub actor, npm publisher identity, or release identity. Before every commit/push/publish, verify the identity is the user's expected identity (`Nil06 <nil@haldorix.com>` for this repo unless the user says otherwise).
- Keep public docs provider-neutral; do not spotlight a single provider such as DeepSeek outside normal provider lists.
- Before adding release features, audit each feature against the real code and UX first.

## Learned Workspace Facts

- Parallel is an Ink/React TypeScript CLI control room for coordinating multiple coding agents with shared context and human-in-control workflows.
- The npm package is `@parallel-cli/parallel`; releases are published to npm and GitHub from this repo.
- The Hub UI is centered in `src/ui/App.tsx`, with command input/palette in `src/ui/CommandInput.tsx` and command definitions in `src/commands.ts`.
- Provider setup spans `src/config.ts`, `src/ui/Wizard.tsx`, `src/ui/SettingsPanel.tsx`, and `src/controller.ts`.
- The repository has used local/internal tests under `test/`; do not assume test files are tracked by Git.

## Parallel Agent Runtime Rules

- `/ask` agents should stay read-only and short: prefer `search`, `read_file`, `read_many`, and `inspect_project` over shell.
- `/task` agents should run `update_steps` early, batch independent inspection, make focused edits, batch validation, then summarize clearly.
- `/plan` agents should explore broadly but bounded, then ask for approval before any mutation.
- Avoid sequential micro-commands for inspection. Batch independent reads/searches with `read_many` or `inspect_project`; batch independent shell checks into one labelled command when shell is actually useful.
- Track validation explicitly in the final result: exact command and outcome, or say why validation was not run.
