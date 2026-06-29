# Original User Request

## Initial Request — 2026-06-29T04:09:13Z

# Teamwork Project Prompt — Draft

> Status: Launched
> Goal: Craft prompt → get user approval → delegate to teamwork_preview

A Next.js frontend development environment running in Docker, configured with the Antigravity CLI in 'agentic' mode. It acts as an autonomous 'junior engineer' capable of reading instructions from external sources (like Notion or task tickets) while persisting code, config, and credentials via local volume mounts.

Working directory: /home/hafida/Projects/personal/nextjs-dev-container-antigravity-agentic
Integrity mode: benchmark

## Requirements

### R1. Container Environment & Tech Stack
Provide a standard `docker-compose.yml` and `Dockerfile` to create a Next.js development environment. The container must include Node.js, the Antigravity CLI, and all necessary dependencies, allowing the user to manually exec into it.
The Next.js project must be initialized with the following tech stack:
- Next.js (App Router)
- Tailwind CSS & shadcn/ui
- Zustand (for state management)
- SWR (for data fetching)

### R2. Task Watcher Integration
Implement a watcher script inside the container that automatically polls external task sources (e.g., Notion cards, task tickets, or a local drop folder) and triggers the Antigravity CLI to process those instructions autonomously.

### R3. Persistent State via Volume Mounts
Configure the `docker-compose.yml` to use volume mounts that persist the source code, git credentials, and the Antigravity configuration. The Antigravity config inside the container must map to a specific folder within the host's project directory.

## Acceptance Criteria

### Environment Verification
- [ ] `docker-compose up -d` successfully builds and starts the container without any errors.
- [ ] Running `docker exec <container_name> agy --version` returns a valid Antigravity CLI version string.
- [ ] Running `docker exec <container_name> npm run dev` successfully starts the Next.js development server.

### Watcher & Agent Verification
- [ ] A test script can simulate adding a task (e.g., writing a dummy ticket file), and the watcher script successfully detects it and triggers the `agy` command in response.

### Persistence Verification
- [ ] A dummy file created inside the container's Antigravity config directory (e.g., `~/.gemini/`) is successfully persisted and verifiable in the corresponding mapped folder on the host machine.
