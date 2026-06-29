# Scope: E2E Testing Track

## Architecture
The E2E testing framework is designed as a standalone Node.js-based test suite that executes opaque-box tests against the Docker container environment.
- **Test Runner (`tests/e2e/runner.js`)**: A custom JS runner that imports and runs tests sequentially. It handles environment setup check, execution context (spawning child processes for Docker commands, file I/O on host/mounted directories), assertions, and reports results in a standard JSON/text format.
- **Helper Utilities (`tests/e2e/utils.js`)**: Functions to wrap docker commands (`docker compose exec`, `docker compose up`, etc.), manage files in the mock task directory, and reset/cleanup state.
- **Tests Location (`tests/e2e/`)**: Test suites grouped by Tier.
  - `tier1_feature_coverage.test.js`
  - `tier2_boundary_corner.test.js`
  - `tier3_cross_feature.test.js`
  - `tier4_real_world.test.js`

## Milestones
| # | Name | Scope | Dependencies | Status | Conversation ID |
|---|------|-------|-------------|--------|-----------------|
| 1 | E2E Test Suite Implementation | Implement the test runner, utility helpers, tests for Tiers 1-4, and publish `TEST_INFRA.md` & `TEST_READY.md` | None | IN_PROGRESS | a865d348-6a45-47c8-9b36-7314c07d2822 |

## Interface Contracts
### E2E Test Suite ↔ System Under Test (Docker Container / Host Filesystem)
- Docker Compose File: Root `docker-compose.yml`
- Executable commands:
  - Check container status: `docker compose ps`
  - Run agy CLI version check: `docker compose exec -t nextjs-dev-container agy --version`
  - Dev server check: `docker compose exec -t nextjs-dev-container curl -I http://localhost:3000`
- File mappings:
  - Task Drop Folder: `./tasks` on host maps to `/app/tasks` in container.
  - Antigravity Config Folder: `./.gemini` on host maps to `/home/node/.gemini` (or equivalent) in container.
  - SSH / Git Config: `~/.gitconfig` on host maps to `/home/node/.gitconfig` (or equivalent) in container.
- Log outputs: `/app/tasks/logs` inside container maps to `./tasks/logs` on host.
