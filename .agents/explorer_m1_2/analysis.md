# Analysis & Implementation Strategy: Milestone 1 (Docker Env & Next.js Init)

This report outlines the proposed strategy for containerizing the Next.js environment and initializing the Next.js App Router project with the required tech stack (Tailwind, Zustand, SWR, shadcn/ui) and Antigravity CLI integration.

---

## 1. Container Environment Design

### 1.1 Base Image and Node.js Version
* **Recommendation**: **Node.js 20 LTS (Debian Bookworm)** (`node:20-bookworm` or `node:20-slim`).
* **Rationale**:
  * **Stability & Support**: Node.js 20 is a stable Long-Term Support (LTS) release, which ensures compatibility with the Next.js 14/15 App Router.
  * **Glibc Compatibility**: Unlike Alpine-based images (`node:20-alpine`), Debian-based images use `glibc` out of the box. This is critical because the Antigravity Python SDK and external CLI binaries (`agy`) rely on compiled C++ runtimes that expect `glibc` (as documented in the Antigravity SDK reference). Running on Alpine would introduce compilation or runtime loading errors.
  * **System Utilities**: The Debian base image makes installing standard build utilities, Python 3, Git, SSH, and `sudo` straightforward and robust.

### 1.2 Installation of Antigravity CLI (`agy`)
The Antigravity CLI (`agy`) must run inside the container to allow autonomous execution.
Depending on the exact packaging format of the CLI in the environment, there are two primary installation strategies:
1. **Pip-based installation**: The Antigravity CLI is packaged as a console script entry point inside the `google-antigravity` Python package.
   * **Implementation**: Run `pip3 install google-antigravity --break-system-packages` during the container build.
2. **Global NPM package or Direct Binary**: If `agy` is distributed as a global npm package, run `npm install -g @google/antigravity-cli`. If it is a host-exclusive binary, it can be mounted directly via Docker Compose.
   * **Implementation**: We design the Dockerfile to try installing `google-antigravity` via `pip3` as the primary standard, and we document alternate package/npm installation commands as fallbacks.

### 1.3 User and Permission Settings
* **Non-root Execution**: To avoid running processes as `root` (which can create files with incorrect ownership on the host), we configure the container to run as the default `node` user (UID 1000, GID 1000).
* **Host-Container Permission Alignment**:
  * The `node` user is given passwordless `sudo` access in the Dockerfile to allow package installations if the user execs into the shell.
  * Home directories (`/home/node`) are mapped correctly to persist configurations like `.gitconfig` and `.gemini`.
  * For systems where the host user has a different UID/GID (not 1000), we recommend parameterized build arguments (`USER_UID` and `USER_GID`) to dynamically align the container's `node` user with the host user.

---

### 1.4 Proposed `Dockerfile`

```dockerfile
# Use Node.js 20 LTS Debian Bookworm as base image
FROM node:20-bookworm

# Avoid prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install core system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    python3 \
    python3-pip \
    python3-venv \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Install Antigravity SDK and CLI globally
# (Using --break-system-packages for Python 3.11+ system pip installation safety)
RUN pip3 install --no-cache-dir google-antigravity --break-system-packages || true

# Grant passwordless sudo to default non-root user 'node'
RUN echo "node ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Set the working directory to the mounted application folder
WORKDIR /app

# Ensure proper ownership of the app directory
RUN chown -R node:node /app

# Switch to the non-root node user
USER node

# Expose the standard Next.js dev server port
EXPOSE 3000

# Set environment variables for Next.js
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Default container startup command
CMD ["npm", "run", "dev"]
```

---

### 1.5 Proposed `docker-compose.yml`

```yaml
version: '3.8'

services:
  nextjs-dev:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: nextjs-agentic-dev
    ports:
      - "3000:3000"
    volumes:
      # Mount workspace root to /app in the container
      - .:/app
      # Persist git credentials from the host
      - ~/.gitconfig:/home/node/.gitconfig:ro
      # Persist SSH credentials for git authentication
      - ~/.ssh:/home/node/.ssh:ro
      # Map host project's .gemini directory to container's home for CLI settings
      - ./.gemini:/home/node/.gemini
    environment:
      - NODE_ENV=development
      - PORT=3000
      - HOSTNAME=0.0.0.0
    # Run container as non-root user
    user: "node"
    # Keep container running interactively
    tty: true
    stdin_open: true
    # Next.js dev server command
    command: npm run dev
```

---

## 2. Next.js App Router Initialization Strategy

### 2.1 Bootstrapping the Project
To initialize Next.js in the root of the workspace without conflicts (as the folder contains `.agents/` and metadata files), we recommend:
1. Creating a temporary Next.js app in a subdirectory:
   ```bash
   npx create-next-app@latest tmp-next-app \
     --typescript \
     --tailwind \
     --eslint \
     --app \
     --src-dir \
     --import-alias "@/*" \
     --use-npm
   ```
2. Moving files and directories from `tmp-next-app` to the project root:
   ```bash
   mv tmp-next-app/* tmp-next-app/.* . 2>/dev/null || true
   rm -rf tmp-next-app
   ```
3. Cleaning up boilerplate files (e.g., default branding in `src/app/page.tsx` and custom public assets).

---

## 3. Tech Stack Dependencies & Configuration

### 3.1 State Management (Zustand)
* **Package**: `zustand`
* **Purpose**: Manages global client-side application states, such as active task items, execution logs, and running watcher statuses.
* **Proposed Implementation** (`src/store/useTaskStore.ts`):
  ```typescript
  import { create } from 'zustand';

  interface Task {
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    logs?: string;
    timestamp: string;
  }

  interface TaskState {
    tasks: Task[];
    activeTaskId: string | null;
    setTasks: (tasks: Task[]) => void;
    addTask: (task: Task) => void;
    updateTaskStatus: (id: string, status: Task['status'], logs?: string) => void;
    setActiveTaskId: (id: string | null) => void;
  }

  export const useTaskStore = create<TaskState>((set) => ({
    tasks: [],
    activeTaskId: null,
    setTasks: (tasks) => set({ tasks }),
    addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),
    updateTaskStatus: (id, status, logs) =>
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === id ? { ...t, status, logs: logs !== undefined ? logs : t.logs } : t
        ),
      })),
    setActiveTaskId: (activeTaskId) => set({ activeTaskId }),
  }));
  ```

### 3.2 Data Fetching (SWR)
* **Package**: `swr`
* **Purpose**: Handles client-side polling and fetching of tasks, execution outputs, and watcher status from the local container API routes.
* **Proposed Implementation** (`src/hooks/useTasks.ts`):
  ```typescript
  import useSWR from 'swr';

  const fetcher = (url: string) => fetch(url).then((res) => res.json());

  export function useTasks() {
    const { data, error, isLoading, mutate } = useSWR('/api/tasks', fetcher, {
      refreshInterval: 2000, // Poll task logs every 2 seconds
    });

    return {
      tasks: data?.tasks || [],
      error,
      isLoading,
      mutate,
    };
  }
  ```

### 3.3 UI Framework (shadcn/ui & Tailwind)
* **Initialization Command**:
  ```bash
  npx shadcn@latest init
  ```
* **Configuration Selection**:
  * Style: `Default`
  * Base Color: `Slate`
  * CSS Variables: `Yes`
  * Tailwind Config: `tailwind.config.ts`
  * Import Alias (Components): `@/components`
  * Import Alias (Utils): `@/lib/utils`
  * React Server Components: `Yes`
* **Initial Components to Add**:
  ```bash
  npx shadcn@latest add button card input dialog scroll-area badge
  ```

---

## 4. Directory Layout Alignment
Once initialized, the workspace will follow this precise structure:
```
/home/hafida/Projects/personal/nextjs-dev-container-antigravity-agentic/
├── .agents/                      # Teamwork agent metadata (DO NOT place source/tests here)
├── .gemini/                      # Volume mounted directory containing global Antigravity CLI config
├── Dockerfile                    # Dev container build definition
├── docker-compose.yml            # Compose service mapping ports & mounts
├── tailwind.config.ts            # Tailwind layout and theme configs
├── package.json                  # Next.js and frontend dev dependencies
├── tsconfig.json                 # TypeScript rules
├── src/                          # Application source code
│   ├── app/                      # Next.js App Router (pages & endpoints)
│   │   ├── layout.tsx            # Global layout wrapper
│   │   ├── page.tsx              # Main dashboard view
│   │   └── api/                  # API endpoints to monitor files/tasks
│   ├── components/               # Shared shadcn/ui components
│   ├── store/                    # Zustand store state definitions
│   ├── hooks/                    # Custom SWR React hooks
│   └── lib/                      # Helper utility code (e.g. cn.ts for shadcn)
└── watcher/                      # Shell/Node daemon monitoring task directories
```

---

## 5. Potential Risks & Mitigation Strategies

1. **Permission Denied for Mapped Volumes**:
   * *Risk*: On Linux systems, files created by containerized node user (UID 1000) might conflict with the host's UID, leading to read/write locks.
   * *Mitigation*: Set the home directory mounts using readable permissions (`ro` where write access is not required, like `~/.ssh` and `~/.gitconfig`). Document that users with custom UIDs can build the image with `--build-arg USER_UID=$(id -u)`.
2. **Antigravity CLI Binary Pathing inside Watcher**:
   * *Risk*: If the watcher runs as a background system daemon, the PATH environment variable may not include the user's local pip/npm binary paths.
   * *Mitigation*: Ensure the watcher script or configuration uses either an absolute path to the executable (e.g. `/usr/local/bin/agy` or `/home/node/.local/bin/agy`) or source the appropriate profile during startup.
