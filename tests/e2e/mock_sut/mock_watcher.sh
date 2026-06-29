#!/bin/bash
# mock_watcher.sh: Watcher script simulating task polling loop inside the container.

echo "Starting mock watcher..."
TASK_DIR="/app/tasks"
LOG_DIR="$TASK_DIR/logs"
mkdir -p "$LOG_DIR"

while true; do
  # Find *.task or *.md files in /app/tasks (maxdepth 1, exclude logs/ and archive/)
  find "$TASK_DIR" -maxdepth 1 \( -name "*.task" -o -name "*.md" \) -print0 2>/dev/null | while IFS= read -r -d '' file; do
    if [ -L "$file" ]; then
      echo "[MOCK-WATCHER] Skipping symlink $file" >> "$TASK_DIR/logs/$(basename "${file%.*}").log"
      rm -f "$file"
      continue
    fi
    if [ -f "$file" ]; then
      filename=$(basename "$file")
      
      # TC-T2-WTC-06: Wait for file to finish writing
      size1=$(stat -c %s "$file" 2>/dev/null || stat -f %z "$file")
      sleep 0.25
      size2=$(stat -c %s "$file" 2>/dev/null || stat -f %z "$file")
      while [ "$size1" -ne "$size2" ]; do
        size1="$size2"
        sleep 0.25
        size2=$(stat -c %s "$file" 2>/dev/null || stat -f %z "$file")
      done
      
      # Execute agy CLI on it
      /usr/local/bin/agy --execute "$file"
    fi
  done
  sleep 0.5
done
