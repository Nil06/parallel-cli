#!/bin/sh
set -eu

ROOT=$(pwd)
HOME_DIR=$(mktemp -d /tmp/parallel-home.XXXXXX)
PROJECT_DIR=$(mktemp -d /tmp/parallel-pty.XXXXXX)
export HOME="$HOME_DIR"

set +e
NON_TTY_OUTPUT=$(node dist/index.js 2>&1)
NON_TTY_STATUS=$?
set -e

if [ "$NON_TTY_STATUS" -ne 1 ]; then
  echo "Expected non-TTY launch to exit 1, got $NON_TTY_STATUS"
  echo "$NON_TTY_OUTPUT"
  exit 1
fi

case "$NON_TTY_OUTPUT" in
  *"requires an interactive terminal"*) ;;
  *)
    echo "Expected non-TTY launch to explain the TTY requirement"
    echo "$NON_TTY_OUTPUT"
    exit 1
    ;;
esac

CMD="node \"$ROOT/dist/index.js\" \"$PROJECT_DIR\""
set +e
PTY_OUTPUT=$(timeout 1 script -q -e -c "$CMD" /dev/null 2>&1)
PTY_STATUS=$?
set -e

if [ "$PTY_STATUS" -ne 124 ]; then
  echo "Expected pseudo-TTY launch to keep the TUI open until timeout, got $PTY_STATUS"
  echo "$PTY_OUTPUT"
  exit 1
fi

case "$PTY_OUTPUT" in
  *"requires an interactive terminal"*)
    echo "Pseudo-TTY launch was incorrectly rejected as non-interactive"
    echo "$PTY_OUTPUT"
    exit 1
    ;;
esac

case "$PTY_OUTPUT" in
  *"Language"*|*"Choose your working folder"*|*"Set up your model provider"*) ;;
  *)
    echo "Expected pseudo-TTY launch to render the setup TUI"
    echo "$PTY_OUTPUT"
    exit 1
    ;;
esac

set +e
FIRST_RUN_OUTPUT=$(timeout 1 script -q -e -c "node \"$ROOT/dist/index.js\" --first-run \"$PROJECT_DIR\"" /dev/null 2>&1)
FIRST_RUN_STATUS=$?
set -e

if [ "$FIRST_RUN_STATUS" -ne 124 ]; then
  echo "Expected --first-run launch to keep the TUI open until timeout, got $FIRST_RUN_STATUS"
  echo "$FIRST_RUN_OUTPUT"
  exit 1
fi

case "$FIRST_RUN_OUTPUT" in
  *"Language"*|*"Choose your working folder"*|*"Set up your model provider"*) ;;
  *)
    echo "Expected --first-run to render the setup TUI"
    echo "$FIRST_RUN_OUTPUT"
    exit 1
    ;;
esac

CONFIGURED_HOME=$(mktemp -d /tmp/parallel-home-configured.XXXXXX)
CONFIGURED_PROJECT=$(mktemp -d /tmp/parallel-configured-project.XXXXXX)
mkdir -p "$CONFIGURED_HOME"
cat > "$CONFIGURED_HOME/config.json" <<EOF
{
  "language": "en",
  "providers": [
    {
      "name": "Local",
      "baseUrl": "http://127.0.0.1:8917",
      "apiKey": "test-key",
      "models": ["gpt-4o"],
      "defaultModel": "gpt-4o"
    }
  ],
  "defaultProvider": "Local",
  "approvalMode": "ask",
  "maxStepsPerAgent": 60,
  "soundEnabled": true,
  "recentFolders": ["$CONFIGURED_PROJECT"]
}
EOF

set +e
CONFIGURED_OUTPUT=$(timeout 1 script -q -e -c "node \"$ROOT/dist/index.js\" --config-home \"$CONFIGURED_HOME\"" /dev/null 2>&1)
CONFIGURED_STATUS=$?
set -e

if [ "$CONFIGURED_STATUS" -ne 124 ]; then
  echo "Expected configured pseudo-TTY launch to keep the TUI open until timeout, got $CONFIGURED_STATUS"
  echo "$CONFIGURED_OUTPUT"
  exit 1
fi

case "$CONFIGURED_OUTPUT" in
  *"[1/5]"*|*"[2/5]"*|*"[3/5]"*|*"[4/5]"*|*"[5/5]"*)
    echo "Configured launch unexpectedly rendered the setup wizard"
    echo "$CONFIGURED_OUTPUT"
    exit 1
    ;;
esac

case "$CONFIGURED_OUTPUT" in
  *"Ready"*|*"No agents yet"*) ;;
  *)
    echo "Expected configured launch to render the main TUI"
    echo "$CONFIGURED_OUTPUT"
    exit 1
    ;;
esac

echo "pseudo-TTY CLI smoke test passed"
