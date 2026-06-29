#!/bin/bash
# mock_agy.sh: Simulates agy version and execute commands.

if [ "$1" = "--version" ]; then
  echo "Antigravity CLI v2.0.0 (mock)"
  exit 0
fi

if [ "$1" = "--execute" ]; then
  task_file="$2"
  filename=$(basename "$task_file")
  log_name="${filename%.*}.log"
  log_path="/app/tasks/logs/$log_name"
  
  # TC-T2-WTC-01: Empty task check
  if [ ! -s "$task_file" ]; then
    echo "[MOCK-WATCHER] Warning: Empty task file $filename. Ignoring." > "$log_path"
    rm -f "$task_file"
    exit 0
  fi
  
  # TC-T2-WTC-02: Binary check
  # Check if contains null byte or PNG header
  if grep -q -P '\x00' "$task_file" 2>/dev/null || head -c 4 "$task_file" | grep -q $'\x89\x50\x4e\x47' 2>/dev/null; then
    echo "[MOCK-WATCHER] Error: Binary or malformed task file $filename. Skpped." > "$log_path"
    rm -f "$task_file"
    exit 0
  fi
  
  # TC-T2-WTC-04: Size check
  file_size=$(stat -c %s "$task_file" 2>/dev/null || stat -f %z "$task_file")
  if [ "$file_size" -gt 10485760 ]; then
    echo "[MOCK-WATCHER] Error: File $filename size $file_size exceeds 10MB limit. Rejected." > "$log_path"
    rm -f "$task_file"
    exit 0
  fi

  echo "[MOCK-AGY] Executing instructions from $task_file" > "$log_path"
  echo "[MOCK-AGY] Command: agy --execute $task_file" >> "$log_path"
  
  # Parse contents to execute simulated operations
  content=$(cat "$task_file")
  
  if echo "$content" | grep -q "WRITE_CODE:"; then
    line=$(echo "$content" | grep "WRITE_CODE:")
    dest_path=$(echo "$line" | cut -d':' -f2 | cut -d'|' -f1 | sed 's/^ *//;s/ *$//')
    code_content=$(echo "$line" | cut -d'|' -f2-)
    mkdir -p "$(dirname "/app/$dest_path")"
    echo "$code_content" > "/app/$dest_path"
    echo "[MOCK-AGY] Scaffolding file $dest_path" >> "$log_path"
    
  elif echo "$content" | grep -q "MODIFY_CONFIG:"; then
    line=$(echo "$content" | grep "MODIFY_CONFIG:")
    key_val=$(echo "$line" | cut -d':' -f2 | sed 's/^ *//;s/ *$//')
    key=$(echo "$key_val" | cut -d'=' -f1)
    val=$(echo "$key_val" | cut -d'=' -f2)
    config_file="/home/node/.gemini/config.json"
    mkdir -p "$(dirname "$config_file")"
    echo "{\"$key\": \"$val\"}" > "$config_file"
    echo "[MOCK-AGY] Config key $key updated to $val" >> "$log_path"
    
  elif echo "$content" | grep -q "INSTALL_DEP:"; then
    dep=$(echo "$content" | grep "INSTALL_DEP:" | cut -d':' -f2 | sed 's/^ *//;s/ *$//')
    if [ "$dep" = "lodash" ] && [ -f "/app/.network_isolated" ]; then
      echo "[MOCK-AGY] npm install $dep failed: Network isolated." >> "$log_path"
    else
      if [ -f "/app/package.json" ]; then
        sed -i 's/"dependencies": {/"dependencies": {\n    "'"$dep"'": "latest",/g' /app/package.json
      else
        echo '{"dependencies": {"'"$dep"'": "latest"}}' > /app/package.json
      fi
      echo "[MOCK-AGY] Package $dep installed successfully." >> "$log_path"
    fi
    
  elif echo "$content" | grep -q "SYNTAX_ERROR"; then
    mkdir -p /app/src/app
    echo "const Layout = () => { return (<div>Unclosed tag</div) }" > /app/src/app/layout.tsx
    echo "[MOCK-AGY] Wrote syntax error to src/app/layout.tsx" >> "$log_path"
    
  elif echo "$content" | grep -q "FIX_SYNTAX"; then
    mkdir -p /app/src/app
    echo "const Layout = () => { return (<div>Fixed tag</div>); }; export default Layout;" > /app/src/app/layout.tsx
    echo "[MOCK-AGY] Fixed syntax error in src/app/layout.tsx" >> "$log_path"
  fi
  
  echo "[MOCK-AGY] Execution successful." >> "$log_path"
  rm -f "$task_file"
  exit 0
fi
