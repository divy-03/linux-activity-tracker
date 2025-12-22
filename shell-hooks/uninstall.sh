#!/bin/bash

# ============================================================
# Activity Tracker Shell Hook Uninstaller
# ============================================================

SHELL_NAME="$(basename "$SHELL")"

echo "🗑️  Uninstalling Activity Tracker Shell Hook..."

uninstall_zsh() {
  local zshrc="$HOME/.zshrc"

  if [[ ! -f "$zshrc" ]]; then
    echo "❌ ~/.zshrc not found"
    return
  fi

  # Backup
  cp "$zshrc" "${zshrc}.backup.$(date +%s)"

  # Remove hook lines
  sed -i '/# Linux Activity Tracker Hook/d' "$zshrc"
  sed -i '/activity-tracker\/zsh-hook.sh/d' "$zshrc"

  echo "✅ Removed from $zshrc"
}

uninstall_bash() {
  local bashrc="$HOME/.bashrc"

  if [[ ! -f "$bashrc" ]]; then
    echo "❌ ~/.bashrc not found"
    return
  fi

  # Backup
  cp "$bashrc" "${bashrc}.backup.$(date +%s)"

  # Remove hook lines
  sed -i '/# Linux Activity Tracker Hook/d' "$bashrc"
  sed -i '/activity-tracker\/bash-hook.sh/d' "$bashrc"

  echo "✅ Removed from $bashrc"
}

case "$SHELL_NAME" in
zsh)
  uninstall_zsh
  ;;
bash)
  uninstall_bash
  ;;
*)
  echo "❌ Unsupported shell: $SHELL_NAME"
  exit 1
  ;;
esac

echo "🎉 Uninstall complete! Restart your shell."
