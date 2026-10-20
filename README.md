# Next.js Agentic Dev Container

A Docker-based development environment for Next.js projects with integrated [Antigravity CLI (agy)](https://github.com/google-deepmind/antigravity) support. Drop task files into an inbox folder and let the built-in watcher automatically execute them via `agy`.

## Prerequisites

- **Docker** & **Docker Compose** (v2+)
- **agy binary** — the Antigravity CLI, installed on your host machine

## Quick Start

```bash
# 1. Copy the agy binary into the project
mkdir -p bin && cp $(which agy) ./bin/agy

# 2. Create the .gemini config directory
mkdir -p .gemini

# 3. (Optional) Install Node dependencies on the host
npm install

# 4. Build and start the container
docker compose up -d --build

# 5. Exec into the running container
docker exec -it nextjs-dev-container bash

# 6. Start the task watcher (inside the container)
bash /app/watcher/watcher.sh &
```

## How the Task Watcher Works

The watcher script (`watcher/watcher.sh`) runs inside the container and:

1. **Polls** `/app/tasks/inbox/` every N seconds (default `5`, configurable via `WATCHER_INTERVAL`).
2. When a `.md` or `.task` file appears, it reads the file content and runs `agy "<content>"` in `/app`.
3. On **success** (exit code 0), the file is moved to `/app/tasks/done/`.
4. On **failure** (non-zero exit), the file is moved to `/app/tasks/failed/`.
5. All activity is logged with timestamps to **stdout** and `/app/tasks/logs/watcher.log`.

### Submitting a Task

Drop a `.md` file into the `tasks/inbox/` directory on your host:

```bash
echo "Add a dark mode toggle to the header component" > tasks/inbox/dark-mode.md
```

The watcher will pick it up, execute it via `agy`, and move the file to `tasks/done/` or `tasks/failed/`.

## Volume Mounts

| Host Path | Container Path | Description |
|---|---|---|
| `.` (project root) | `/app` | Full project source code |
| `./tasks` | `/app/tasks` | Task inbox, done, failed, and logs |
| `~/.gitconfig` | `/home/node/.gitconfig` | Git configuration (read-only) |
| `~/.ssh` | `/home/node/.ssh` | SSH keys (read-only) |
| `./.gemini` | `/home/node/.gemini` | Gemini / agy configuration |

## Tech Stack

- **Runtime**: Node.js 20 (Debian Bookworm)
- **Framework**: Next.js (App Router, TypeScript, Tailwind CSS)
- **AI Agent**: Antigravity CLI (`agy`)
- **Container**: Docker + Docker Compose
- **Task Automation**: Bash watcher script with polling

## Optional Configuration
### Antigravity CLI
Install the Antigravity CLI using these command inside running container:
```
curl -fsSL https://antigravity.google/cli/install.sh | bash
```
### Codex CLI
Inside the container, Run the following command:

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
codex --version
```
