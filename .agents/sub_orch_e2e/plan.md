# E2E Test Suite Plan

## Objective
Design and build the E2E testing framework, write tests covering Tiers 1-4, and publish `TEST_INFRA.md` and `TEST_READY.md` at the project root for the Next.js Agentic Dev Container.

## System Under Test Features
- **F1: Docker Container Environment (R1)**: Verifies container build, start, `node`/`npm` existence, `npm run dev` startup, and `agy` CLI availability and versioning.
- **F2: Task Watcher (R2)**: Verifies that the task watcher successfully detects new files matching `*.task` or `*.md` in `/app/tasks` inside the container, triggers `agy --execute <file>`, and writes log files correctly.
- **F3: State & Config Persistence (R3)**: Verifies that source files, git configuration (`.gitconfig`), and Antigravity configuration (`.gemini`) are correctly mapped from the host to the container and survive container restarts.

## Test Tier Definitions
- **Tier 1 (Feature Coverage)**: 5 happy-path test cases per feature (15 total).
- **Tier 2 (Boundary & Corner Cases)**: 5 boundary/error/corner test cases per feature (15 total).
- **Tier 3 (Cross-Feature Combinations)**: 3 test cases testing interaction between features (e.g. volume mapping persistence across container restarts while task watcher is running).
- **Tier 4 (Real-World Application)**: 5 real-world scenarios representing user workflows (e.g. launching container, mounting git credentials and .gemini configurations, dropping multiple tasks, verifying watcher sequential/parallel execution, verifying host-side file outputs and log formats).

## E2E Testing Framework Design
- **Language/Runner**: Node.js script using custom or standard assertions (e.g. Jest-like or a plain test runner script `tests/e2e/runner.js`) to run CLI-based E2E commands (e.g. executing `docker compose`, checking container status, inspect volumes, checking logs, dropping mock tasks, verifying outputs).
- **Architecture**: A main runner script `tests/e2e/runner.js` that discovers test files, executes them, collects results, and prints a structured summary.
- **Test files**:
  - `tests/e2e/tier1_feature_coverage.test.js`
  - `tests/e2e/tier2_boundary_corner.test.js`
  - `tests/e2e/tier3_cross_feature.test.js`
  - `tests/e2e/tier4_real_world.test.js`

## Steps
1. **Exploration**: Spawn an Explorer subagent to check the host environment (Docker version, node/npm version, available test runners, host paths, etc.).
2. **Decomposition**: Write `SCOPE.md` detailing the test cases and directory structure.
3. **Framework Design & Implementation**: Spawn a Worker subagent to implement the test runner and scaffolding in `tests/e2e/`.
4. **Test Case Implementation**:
   - Write Tier 1 tests.
   - Write Tier 2 tests.
   - Write Tier 3 tests.
   - Write Tier 4 tests.
5. **Validation & Verification**: Run the E2E tests against the empty directory (to verify they fail or report correctly/gracefully).
6. **Publication**: Publish `TEST_INFRA.md` and `TEST_READY.md` at the project root.
7. **Report**: Write the handoff report and notify the Project Orchestrator.
