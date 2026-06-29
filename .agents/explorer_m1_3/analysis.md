# Milestone 1 Analysis & Implementation Proposal: Docker Env & Next.js Init

## Executive Summary
This document proposes a robust implementation strategy for Milestone 1: "Docker Env & Next.js Init" of the Next.js Agentic Dev Container project. By leveraging a Debian-based `node:20-bookworm` base image, mapping user permissions dynamically, and establishing a structured Next.js initialization flow with Tailwind CSS, Zustand, SWR, and shadcn/ui, we ensure high compatibility with the Antigravity CLI (`agy`) and a clean development experience.

---

## 1. Container Environment Design

### 1.1. Base Image Selection (Node.js Version)
We recommend using **`node:20-bookworm`** (Node.js 20 LTS on Debian Bookworm). 
* **Why Node 20 LTS**: Next.js App Router and all modern dependencies are fully supported on Node 20. LTS provides stable support and security.
* **Why Debian Bookworm (non-alpine)**: Antigravity CLI (`agy`) and its underlying agent tools rely on native platform binaries, standard C libraries (`glibc`), and helper command-line utilities (like `git`, `ssh`, `curl`, `ca-certificates`). Alpine Linux uses `musl-libc`, which frequently causes compilation and runtime issues for precompiled Python/C++ wheels and CLI binaries. Debian Bookworm ensures native binary compatibility.

### 1.2. Antigravity CLI (`agy`) Installation
Since the container operates in "agentic" mode, the `agy` CLI must be installed and executable inside the container. We propose the following installation vectors in the `Dockerfile`:
1. **Primary**: Official installation script: `curl -fsSL https://antigravity.google/install.sh | bash`
2. **Secondary/Fallback**: NPM global installation (if packaged as an NPM CLI): `npm install -g @google/antigravity-cli`
3. **Tertiary**: Allowing the CLI configuration and cache to persist via the `.gemini` volume mapping.

### 1.3. User and Permissions Configuration
To avoid host-container file permission conflicts (which typically result in host-created files being owned by root or container-created files being inaccessible by the host user):
* The container will run under the pre-existing **`node`** user (UID 1000, GID 1000).
* A passwordless sudo rule will be added to allow the `node` user to perform root tasks if necessary.
* Volume mounts in `docker-compose.yml` will map host configurations (like git credentials and SSH keys) directly to the `node` user's home directory.

### 1.4. Proposed `Dockerfile`
```dockerfile
# Use Node.js 20 LTS on Debian Bookworm
FROM node:20-bookworm

# Install required system packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ssh \
    ca-certificates \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Grant passwordless sudo to node user
RUN echo "node ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Create workspace and app folder
WORKDIR /app

# Install Google Antigravity CLI (agy)
# Attempts installer script, then fallback to npm, or handles pre-installed mounts
RUN curl -fsSL https://antigravity.google/install.sh | bash || \
    npm install -g @google/antigravity-cli || \
    echo "agy CLI will be provided by host mount or environment"

# Ensure correct file permissions on home and app directories
RUN chown -R node:node /app /home/node

# Switch to non-root node user
USER node

# Expose port for Next.js development server
EXPOSE 3000

# Keep container alive
CMD ["tail", "-f", "/dev/null"]
```

### 1.5. Proposed `docker-compose.yml`
```yaml
version: '3.8'

services:
  nextjs-dev-container:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: nextjs-dev-container
    user: "1000:1000" # Match host user (assumed UID:GID 1000:1000)
    ports:
      - "3000:3000"
    volumes:
      # Workspace mount (Next.js project files)
      - .:/app
      # Map host Git config read-only to persist git identity inside container
      - ~/.gitconfig:/home/node/.gitconfig:ro
      # Map host SSH keys read-only for git operations inside container
      - ~/.ssh:/home/node/.ssh:ro
      # Map the host project-specific .gemini folder to persist agent configuration
      - ./.gemini:/home/node/.gemini
    environment:
      - NODE_ENV=development
      - PORT=3000
    working_dir: /app
    tty: true
    stdin_open: true
    restart: unless-stopped
```

### 1.6. Antigravity Configuration (`settings.json`)
The `.gemini` folder mapped to `/home/node/.gemini` will contain the agentic configuration. We recommend initializing `/home/node/.gemini/antigravity-cli/settings.json` with the following keys for autonomous watcher compatibility:
```json
{
  "allowNonWorkspaceAccess": false,
  "toolPermission": "always-proceed",
  "artifactReviewPolicy": "always-proceed",
  "verbosity": "high"
}
```
* `"allowNonWorkspaceAccess": false`: Confines the agent's file operations strictly to `/app`.
* `"toolPermission": "always-proceed"` and `"artifactReviewPolicy": "always-proceed"`: Crucial for the automated Task Watcher (Milestone 2) to run `agy` tasks autonomously without waiting for human confirmation prompts.

---

## 2. Next.js App Router Initialization Strategy

### 2.1. Initialization Command
Since the workspace already contains `.agents` metadata, standard `create-next-app` will reject initializing directly into a non-empty directory. To bypass this, we propose:
1. Initialize in a temporary directory inside the container.
2. Move the files to `/app`.
3. Clean up the temporary directory.

```bash
# Inside the container /app directory:
npx create-next-app@latest tmp-app \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --use-npm

# Move all files and hidden configs to root /app
mv tmp-app/* tmp-app/.* /app/ 2>/dev/null || true
rmdir tmp-app
```

### 2.2. Dependencies Installation
Install the requested frontend tech stack packages:
```bash
# Core dependencies
npm install zustand swr lucide-react

# Styling / utility dependencies (required by shadcn/ui)
npm install clsx tailwind-merge class-variance-authority
```

### 2.3. shadcn/ui Initialization
Initialize shadcn/ui using the automated defaults flag (`-d`) to prevent interactive prompt blocks during automated tasks:
```bash
npx shadcn@latest init -d
```
This generates `components.json` and updates the tailwind/postcss configurations automatically.

### 2.4. Target Folder Structure
Once initialized, the workspace code layout should look like this:
```
/app
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── tailwind.config.ts (or js)
├── components.json
├── src/
│   ├── app/
│   │   ├── layout.tsx     # Next.js Root Layout
│   │   ├── page.tsx       # Next.js Home Page
│   │   └── globals.css    # Global CSS including Tailwind directives
│   ├── components/
│   │   └── ui/            # UI components added via npx shadcn add
│   ├── lib/
│   │   └── utils.ts       # Utility helpers (cn function)
│   ├── store/
│   │   └── useStore.ts    # Zustand global state store
│   └── hooks/
│       └── useData.ts     # Custom SWR fetching hooks
├── tasks/                 # Drop directory for Task Watcher (Milestone 2)
└── .gemini/               # Persisted Antigravity configuration
```

### 2.5. Custom Framework Setup Recommendations
* **Zustand (State Management)**: Create `src/store/useAppStore.ts` to manage application state (e.g. tracking processed tasks, active logs, watcher connection state, or theme configurations).
* **SWR (Data Fetching)**: Create custom hooks inside `src/hooks/` utilizing SWR for polling API endpoints (e.g., retrieving task status logs from the watcher service).

---

## 3. Recommended Implementation Verification Strategy

To verify this milestone once implemented:
1. **Container verification**:
   - Run `docker compose up -d --build`.
   - Run `docker compose ps` to verify the container is in `running` status.
   - Run `docker compose exec nextjs-dev-container agy --version` to verify the CLI is installed and returns its version.
2. **Next.js server verification**:
   - Run `docker compose exec nextjs-dev-container npm run dev` in the background.
   - Curl the development server: `docker compose exec nextjs-dev-container curl -I http://localhost:3000` to confirm a `200 OK` response.
