#!/usr/bin/env bash
# =============================================================================
# Task Watcher Script
# Watches /app/tasks/inbox/ for new .md and .task files, runs agy on each,
# and moves processed files to /app/tasks/done/ or /app/tasks/failed/.
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
INBOX_DIR="/app/tasks/inbox"
DONE_DIR="/app/tasks/done"
FAILED_DIR="/app/tasks/failed"
LOG_FILE="/app/tasks/logs/watcher.log"
POLL_INTERVAL="${WATCHER_INTERVAL:-5}"
WORK_DIR="/app"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log() {
  local timestamp
  timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
  local msg="[${timestamp}] $*"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE"
}

# ---------------------------------------------------------------------------
# Ensure directories exist
# ---------------------------------------------------------------------------
mkdir -p "$INBOX_DIR" "$DONE_DIR" "$FAILED_DIR" "$(dirname "$LOG_FILE")"

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
log "Watcher started (poll interval: ${POLL_INTERVAL}s)"

while true; do
  # Find .md and .task files in inbox (non-recursive, ignore hidden files)
  for task_file in "$INBOX_DIR"/*.md "$INBOX_DIR"/*.task; do
    # Skip glob patterns that matched nothing
    [ -f "$task_file" ] || continue

    filename="$(basename "$task_file")"
    log "Detected task file: $filename"

    # Read file contents and run agy
    task_content="$(cat "$task_file")"
    log "Running agy for: $filename"

    set +e
    (cd "$WORK_DIR" && agy "$task_content")
    exit_code=$?
    set -e

    if [ "$exit_code" -eq 0 ]; then
      mv "$task_file" "$DONE_DIR/$filename"
      log "Task completed successfully: $filename (exit code: $exit_code) -> moved to done/"
    else
      mv "$task_file" "$FAILED_DIR/$filename"
      log "Task FAILED: $filename (exit code: $exit_code) -> moved to failed/"
    fi
  done

  sleep "$POLL_INTERVAL"
done
