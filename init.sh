#!/bin/bash
set -e

echo "=== Step 1: Copying agy binary to workspace ==="
mkdir -p bin

AGY_PATH=""
if command -v agy &>/dev/null; then
  AGY_PATH="$(which agy)"
elif [ -f "$HOME/.local/bin/agy" ]; then
  AGY_PATH="$HOME/.local/bin/agy"
fi

if [ -z "$AGY_PATH" ]; then
  echo "ERROR: agy binary not found. Install agy first or place it in ~/.local/bin/agy"
  exit 1
fi

cp "$AGY_PATH" ./bin/agy
chmod +x ./bin/agy
echo "Copied agy from: $AGY_PATH"

echo "=== Step 2: Creating .gemini directory ==="
mkdir -p .gemini

echo "=== Step 3: Installing Node dependencies ==="
npm install

echo "=== Step 4: Building and starting Docker container ==="
docker compose up -d --build

echo "=== Step 5: Waiting for container to be healthy ==="
echo "Waiting for container to start..."
sleep 5

docker exec nextjs-dev-container agy --version

echo ""
echo "=========================================="
echo "  Setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Exec into the container:"
echo "     docker exec -it nextjs-dev-container bash"
echo ""
echo "  2. Start the task watcher:"
echo "     bash /app/watcher/watcher.sh &"
echo ""
echo "  3. Submit a task:"
echo "     echo 'Your task prompt' > tasks/inbox/my-task.md"
echo ""
