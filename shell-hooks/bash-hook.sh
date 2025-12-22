#!/bin/bash

# ============================================================
# Linux Activity Tracker - BASH Hook
# Logs every command to the activity tracker server
# Requires: bash-preexec library
# ============================================================

# Configuration
ACTIVITY_TRACKER_URL="${ACTIVITY_TRACKER_URL:-http://localhost:3000/api/command}"
ACTIVITY_TRACKER_ENABLED="${ACTIVITY_TRACKER_ENABLED:-true}"

# Create logs directory
HOOK_LOG_DIR="${HOME}/.logs/activity-tracker"
mkdir -p "$HOOK_LOG_DIR" 2>/dev/null

# Download bash-preexec if not present
BASH_PREEXEC_PATH="${HOME}/.bash-preexec.sh"
if [[ ! -f "$BASH_PREEXEC_PATH" ]]; then
  echo "⏬ Downloading bash-preexec..."
  curl -s https://raw.githubusercontent.com/rcaloras/bash-preexec/master/bash-preexec.sh \
    -o "$BASH_PREEXEC_PATH"
fi

# Source bash-preexec
source "$BASH_PREEXEC_PATH"

# Hook function
preexec_activity_tracker() {
  # Skip if disabled
  if [[ "$ACTIVITY_TRACKER_ENABLED" != "true" ]]; then
    return
  fi

  # Skip if root
  if [[ "$(id -u)" -eq 0 ]]; then
    return
  fi

  local cmd="$1"
  local cwd="$PWD"
  local user="$USER"
  local shell_name="bash"
  local hostname="$(hostname)"

  # Skip empty commands
  if [[ -z "$cmd" ]]; then
    return
  fi

  # Escape JSON special characters
  cmd=$(echo "$cmd" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed 's/\t/\\t/g')
  cwd=$(echo "$cwd" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g')

  # Build JSON payload
  local json_payload=$(
    cat <<EOF
{
  "cmd": "$cmd",
  "cwd": "$cwd",
  "user": "$user",
  "shell": "$shell_name",
  "hostname": "$hostname"
}
EOF
  )

  # Send to server in background
  {
    curl -X POST "$ACTIVITY_TRACKER_URL" \
      -H "Content-Type: application/json" \
      -H "X-Activity-Tracker: bash-hook" \
      --data "$json_payload" \
      --max-time 2 \
      --silent \
      --show-error \
      >>"$HOOK_LOG_DIR/bash-hook.log" 2>&1
  } &
}

# Debug
# echo "✅ Activity Tracker BASH Hook loaded (URL: $ACTIVITY_TRACKER_URL)"
