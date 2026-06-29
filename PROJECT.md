# Project: Next.js Agentic Dev Container

## Architecture
The project runs as a Next.js web application inside a Docker container, integrated with the Antigravity CLI in 'agentic' mode. 
- **Next.js Application**: Uses Next.js App Router, Tailwind CSS, shadcn/ui, Zustand (state management), and SWR (data fetching).
- **Docker Environment**: Containerized development environment with Node.js and the Antigravity CLI.
- **Task Watcher**: An automated bash/node script running inside the container, polling a local/mounted task directory for tickets and executing the Antigravity CLI (`agy`) autonomously.
- **Volume Mounts**: Persists the Next.js project code, user git/SSH credentials, and the Antigravity configuration (`~/.gemini/` in container to host mapped directory).

## Code Layout
- `docker-compose.yml` - Compose config specifying container service, port mappings, and volume mounts.
- `Dockerfile` - Builds the Next.js and Antigravity development environment.
- `watcher/` - Task watcher implementation.
  - `watcher.sh` / `watcher.js` - Script that polls and executes `agy`.
- `app/` - Next.js App Router root (or root of Next.js project).
  - `package.json` - Node dependencies.
  - `tailwind.config.js` - Tailwind configuration.
  - `src/` - Application source code.
    - `app/` - Next.js App Router pages and layouts.
    - `components/` - Shared UI components (shadcn/ui).
    - `store/` - Zustand state store.
    - `hooks/` - SWR hooks and other data-fetching logic.
- `tests/e2e/` - E2E tests verifying container, agy, watcher, and volume persistence.

## Milestones
| # | Name | Track | Scope | Dependencies | Status | Conversation ID |
|---|------|-------|-------|--------------|--------|-----------------|
| 0 | E2E Testing Track | E2E Testing | Design E2E test suite (Tiers 1-4) & publish `TEST_READY.md` | None | DONE | a865d348-6a45-47c8-9b36-7314c07d2822 |
| 1 | Docker Env & Next.js Init | Implementation | Build Dockerfile/compose, init Next.js with Zustand/SWR/Tailwind/shadcn | None | DONE | Worker: f7d25ebe-0429-42e0-b4fc-0969de412cbf |
| 2 | Task Watcher Integration | Implementation | Implement automated task watcher script inside container | M1 | IN_PROGRESS | TBD |
| 3 | Persistence config | Implementation | Configure and verify SSH/git and Antigravity volume mounts | M1 | PLANNED | TBD |
| 4 | E2E Integration Test Pass | Implementation | Run E2E tests against implementation and fix bugs (Tiers 1-4) | M0, M2, M3 | PLANNED | TBD |
| 5 | Adversarial Hardening | Implementation | Perform white-box analysis, generate adversarial tests (Tier 5) & fix | M4 | PLANNED | TBD |

## Interface Contracts
### Watcher ↔ Antigravity CLI
- Task directory: `/app/tasks` inside container.
- Watcher polls `/app/tasks` for files matching `*.task` or `*.md`.
- Executable: `agy --execute <task_file_path>`.
- Log output: Watcher redirects stdout/stderr of `agy` to `/app/tasks/logs/` or console.

### Host ↔ Container Persistence Mappings
- Source code: Host workspace root mounted to `/app` in container.
- Git config: Host `~/.gitconfig` mounted to `/home/node/.gitconfig` (or equivalent).
- Antigravity CLI config: Host `.gemini` folder inside project directory mapped to `/home/node/.gemini` (or equivalent).
