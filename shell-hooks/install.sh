#!/bin/bash

# ============================================================
# Activity Tracker Shell Hook Installer
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHELL_NAME="$(basename "$SHELL")"

echo "🔧 Installing Activity Tracker Shell Hook..."
echo "Detected shell: $SHELL_NAME"

install_zsh() {
  local zshrc="$HOME/.zshrc"
  local hook_path="$SCRIPT_DIR/zsh-hook.sh"

  # Check if already installed
  if grep -q "activity-tracker/zsh-hook.sh" "$zshrc" 2>/dev/null; then
    echo "⚠️  Hook already installed in $zshrc"
    return
  fi

  # Backup
  cp "$zshrc" "${zshrc}.backup.$(date +%s)" 2>/dev/null || true

  # Add source line
  echo "" >>"$zshrc"
  echo "# Linux Activity Tracker Hook" >>"$zshrc"
  echo "source \"$hook_path\"" >>"$zshrc"

  echo "✅ Installed to $zshrc"
  echo "📝 Run 'source ~/.zshrc' to activate"
}

install_bash() {
  local bashrc="$HOME/.bashrc"
  local hook_path="$SCRIPT_DIR/bash-hook.sh"

  # Check if already installed
  if grep -q "activity-tracker/bash-hook.sh" "$bashrc" 2>/dev/null; then
    echo "⚠️  Hook already installed in $bashrc"
    return
  fi

  # Backup
  cp "$bashrc" "${bashrc}.backup.$(date +%s)" 2>/dev/null || true

  # Add source line
  echo "" >>"$bashrc"
  echo "# Linux Activity Tracker Hook" >>"$bashrc"
  echo "source \"$hook_path\"" >>"$bashrc"

  echo "✅ Installed to $bashrc"
  echo "📝 Run 'source ~/.bashrc' to activate"
}

case "$SHELL_NAME" in
zsh)
  install_zsh
  ;;
bash)
  install_bash
  ;;
*)
  echo "❌ Unsupported shell: $SHELL_NAME"
  echo "Supported: bash, zsh"
  exit 1
  ;;
esac

echo ""
echo "🎉 Installation complete!"
echo "📊 Commands will be logged to: http://localhost:3000"
echo ""
echo "To disable: export ACTIVITY_TRACKER_ENABLED=false"
