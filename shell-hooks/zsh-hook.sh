#!/bin/zsh

# ============================================================
# Linux Activity Tracker - ZSH Hook
# Logs every command to the activity tracker server
# ============================================================

# Configuration
ACTIVITY_TRACKER_URL="${ACTIVITY_TRACKER_URL:-http://localhost:3000/api/command}"
ACTIVITY_TRACKER_ENABLED="${ACTIVITY_TRACKER_ENABLED:-true}"

# Create logs directory if it doesn't exist
HOOK_LOG_DIR="${HOME}/.logs/activity-tracker"
mkdir -p "$HOOK_LOG_DIR" 2>/dev/null

# Hook function - runs before each command execution
preexec_activity_tracker() {
    # Skip if disabled
    if [[ "$ACTIVITY_TRACKER_ENABLED" != "true" ]]; then
        return
    fi

    # Skip if root user (safety)
    if [[ "$(id -u)" -eq 0 ]]; then
        return
    fi

    # Get command details
    local cmd="$1"
    local cwd="$PWD"
    local user="$USER"
    local shell_name="zsh"
    local hostname="$(hostname)"
    
    # Skip empty commands
    if [[ -z "$cmd" ]]; then
        return
    fi

    # Escape JSON special characters
    cmd=$(echo "$cmd" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed 's/\t/\\t/g')
    cwd=$(echo "$cwd" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g')
    
    # Build JSON payload
    local json_payload=$(cat <<EOF
{
  "cmd": "$cmd",
  "cwd": "$cwd",
  "user": "$user",
  "shell": "$shell_name",
  "hostname": "$hostname"
}
EOF
)

    # Send to server in background (non-blocking)
    {
        curl -X POST "$ACTIVITY_TRACKER_URL" \
            -H "Content-Type: application/json" \
            -H "X-Activity-Tracker: zsh-hook" \
            --data "$json_payload" \
            --max-time 2 \
            --silent \
            --show-error \
            >> "$HOOK_LOG_DIR/zsh-hook.log" 2>&1
    } &!
}

# Register the hook
autoload -Uz add-zsh-hook
add-zsh-hook preexec preexec_activity_tracker

# Debug info (comment out in production)
# echo "✅ Activity Tracker ZSH Hook loaded (URL: $ACTIVITY_TRACKER_URL)"
