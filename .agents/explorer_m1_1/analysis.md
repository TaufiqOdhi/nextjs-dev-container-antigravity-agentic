# Milestone 1 Analysis & Implementation Proposal: Docker Env & Next.js Init

This report details the proposed configuration and initialization strategy for Milestone 1 of the Next.js Agentic Dev Container project. It is designed to satisfy the requirements of `PROJECT.md` and `ORIGINAL_REQUEST.md`, while aligning with the E2E Test Suite design specified in the E2E Test Track handoff.

---

## 1. Container Environment Design

We propose a containerized development environment using a custom `Dockerfile` and a `docker-compose.yml` configuration. The setup uses **Node.js 20 LTS** as the base runtime, configures permissions to match the host user, and provides paths for git credentials and Antigravity CLI persistence.

### A. Proposed `Dockerfile`
The `Dockerfile` is based on `node:20-slim` to minimize image size while providing a stable, production-grade Node.js environment. It installs essential tools (`git`, `curl`, `python3` for node-gyp and `agy` dependencies) and configures the default non-root `node` user.

```dockerfile
# Dockerfile
FROM node:20-slim

# Install system dependencies
# git: required for source control operations
# curl: required for dev-server health checks
# python3, pip, build-essential: required for compiled node-gyp modules and agy Python SDK fallback
RUN apt-get update && apt-get install -y \
    git \
    curl \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /app

# Expose Next.js default development server port
EXPOSE 3000

# Install Antigravity CLI (agy)
# Note: The CLI can be installed in three ways depending on the target system delivery:
# 1. via global npm (if Node-based):
#    RUN npm install -g @google/antigravity-cli
# 2. via pip (since the Python SDK includes the compiled agy runtime binary):
#    RUN pip3 install google-antigravity --break-system-packages
#
# For maximum robustness in the benchmark environment, we will install both options
# to ensure the `agy` command is always available inside the container path.
RUN pip3 install google-antigravity --break-system-packages || true
RUN npm install -g @google/antigravity-cli || true

# Switch to the default non-root user 'node' (UID 1000) for security and file permission sync
USER node

# Initialize configuration directories in the node home directory
RUN mkdir -p /home/node/.gemini /home/node/.ssh

# Start the Next.js development server
CMD ["npm", "run", "dev"]
```

### B. Proposed `docker-compose.yml`
The compose configuration exposes the service `nextjs-dev-container` (which matches the service name expected by the E2E runner) and defines volume mounts to persist code, git credentials, and `.gemini` configurations.

```yaml
version: '3.8'

services:
  nextjs-dev-container:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: nextjs-dev-container
    ports:
      - "3000:3000"
    volumes:
      # Mount workspace directory to /app
      - .:/app
      # Mount host git configurations (read-only for security)
      - ~/.gitconfig:/home/node/.gitconfig:ro
      # Mount host SSH credentials (read-only) for seamless git authentication
      - ~/.ssh:/home/node/.ssh:ro
      # Mount local project .gemini folder to container ~/.gemini
      - ./.gemini:/home/node/.gemini
    environment:
      - NODE_ENV=development
      - PORT=3000
      - WATCHPACK_POLLING=true # Force file polling so Next.js hot reload works inside Docker volume mounts
    stdin_open: true # Keep stdin open for manual container shell execution
    tty: true        # Allocate pseudo-TTY for manual interaction
    restart: unless-stopped
```

### C. User and Permission Mapping
To prevent file permission issues (such as files created inside the container being owned by `root` on the host):
- The `Dockerfile` switches to `USER node` (UID 1000, GID 1000).
- On standard Linux hosts, the primary user has UID 1000. When files are written by `node` inside `/app`, they will map to the host user `hafida` (UID 1000) on the host filesystem.
- Mounting `~/.gitconfig` and `~/.ssh` as read-only (`:ro`) guarantees that git commands run inside the container will use the host user's identity without risking modification of the host's credentials.

---

## 2. Next.js App Router Initialization Strategy

The Next.js application will be initialized directly inside the workspace root (which maps to `/app` inside the container).

### A. Initialization Steps
The following commands should be executed to set up the boilerplate:

```bash
# 1. Initialize Next.js with TypeScript, Tailwind, ESLint, and Src directory
npx create-next-app@latest . \
  --ts \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --use-npm

# 2. Install supplementary libraries (Zustand & SWR)
npm install zustand swr

# 3. Initialize shadcn/ui
npx shadcn@latest init -y
```

### B. Directory Layout
Following initialization, the codebase directory structure will match:
```
/
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tailwind.config.ts
├── watcher/               # (Implemented in Milestone 2)
├── src/
│   ├── app/               # Next.js pages & layouts
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/        # Shared components
│   │   └── ui/            # shadcn/ui components (e.g. button.tsx)
│   ├── store/             # Zustand state management
│   ├── hooks/             # SWR data fetching hooks
│   └── lib/               # Utility functions (e.g. utils.ts)
└── .gemini/               # Persisted Antigravity configuration (on host)
```

---

## 3. Tech Stack Code Architecture & Examples

To ensure that the Next.js setup passes the E2E verification tests (Tier 4 scenario tests), we propose the following structure and code implementation.

### A. Zustand State Management
Create a global/domain-specific state store to manage the application state. For example, a user session store located at `src/store/userStore.ts`:

```typescript
// src/store/userStore.ts
import { create } from 'zustand';

interface UserState {
  username: string;
  isLoggedIn: boolean;
  login: (username: string) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>((set) => ({
  username: '',
  isLoggedIn: false,
  login: (username) => set({ username, isLoggedIn: true }),
  logout: () => set({ username: '', isLoggedIn: false }),
}));
```

### B. SWR Data Fetching
Configure a standard data fetching hook using SWR. We propose a general fetcher utility and a custom hook at `src/hooks/useUserData.ts`:

```typescript
// src/hooks/useUserData.ts
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useUserData(userId: string) {
  const { data, error, isLoading } = useSWR(
    userId ? `https://jsonplaceholder.typicode.com/users/${userId}` : null,
    fetcher
  );

  return {
    user: data,
    isLoading,
    isError: error,
  };
}
```

### C. shadcn/ui Integration
After running `npx shadcn@latest init`, components can be added as needed:
```bash
npx shadcn@latest add button
```
This adds the `Button` component under `src/components/ui/button.tsx`. An example page component (`src/app/page.tsx`) utilizing all elements of the stack:

```typescript
// src/app/page.tsx
'use client';

import { useUserStore } from '@/store/userStore';
import { useUserData } from '@/hooks/useUserData';
import { Button } from '@/components/ui/button';

export default function Home() {
  const { username, isLoggedIn, login, logout } = useUserStore();
  const { user, isLoading } = useUserData(isLoggedIn ? '1' : '');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-background text-foreground">
      <div className="z-10 max-w-5xl w-full items-center justify-between text-sm flex flex-col gap-6">
        <h1 className="text-4xl font-bold tracking-tight">
          Next.js Agentic Dev Container
        </h1>
        
        <div className="p-6 border rounded-lg bg-card text-card-foreground shadow-sm">
          {isLoggedIn ? (
            <div className="flex flex-col gap-2">
              <p>Logged in as: <span className="font-semibold">{username}</span></p>
              {isLoading ? (
                <p className="text-muted-foreground">Loading user info...</p>
              ) : user ? (
                <p className="text-sm text-muted-foreground">Email: {user.email}</p>
              ) : null}
              <Button variant="destructive" onClick={logout}>
                Log Out
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-muted-foreground">Please log in to load mock user data.</p>
              <Button onClick={() => login('Junior Dev Agent')}>
                Log In
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
```

---

## 4. E2E Test Compatibility & Pre-flight Checklist

Our container and Next.js setup is designed to be fully compatible with the designed E2E test runner (`tests/e2e/runner.js`):
1. **Container Name (`nextjs-dev-container`)**: Explicitly specified in `docker-compose.yml` to support Docker command execution and health checks (`docker compose ps nextjs-dev-container`).
2. **Next.js Dev Server**: Configured on port `3000` with `WATCHPACK_POLLING=true` to pass dev server connectivity checks (`curl -I http://localhost:3000` inside the container) and hot-reload verification.
3. **Volume Mappings**: Maps `.gitconfig` and `.gemini` folder to `/home/node/` to ensure persistence tests pass.
4. **Local Directory Requirement**: To prevent compose errors during execution, the host directory `./.gemini` must be pre-created before executing `docker compose up -d`. We suggest adding a setup script or updating the runner's pre-flight hook to ensure the folder exists.
