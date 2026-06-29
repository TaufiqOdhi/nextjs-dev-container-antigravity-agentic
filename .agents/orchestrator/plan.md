# Implementation & Coordination Plan

This plan details the steps required to implement the Next.js Agentic Dev Container.

## Track 1: E2E Testing Track (Parallel)
The E2E Testing Track is responsible for constructing the test runner, designing the test suite covering Tiers 1-4, and outputting `TEST_READY.md`.
- **Step 1.1**: Set up the E2E test runner in the workspace (e.g., using a custom bash script or a Node-based test script running on the host or in a helper container).
- **Step 1.2**: Write Tier 1 tests:
  - Docker container starts successfully.
  - `agy --version` runs inside the container and returns valid output.
  - Next.js development server starts successfully and is reachable.
  - Basic watcher script starts and triggers a command when a file is added.
- **Step 1.3**: Write Tier 2 tests:
  - Watcher script corner cases (empty task files, malformed task files, multiple task files at once).
  - Persistence boundary cases (missing host directory auto-creation, read/write permissions for `.gemini`).
- **Step 1.4**: Write Tier 3 tests:
  - Cross-feature tests: e.g. adding a task while Next.js is running, verifying it modifies code and Next.js hot-reloads properly.
- **Step 1.5**: Write Tier 4 tests:
  - Real-world workloads: adding a task that requires `agy` to add a new Zustand store state and a page referencing it, and verifying the page is updated correctly.
- **Step 1.6**: Publish `TEST_READY.md`.

## Track 2: Implementation Track
The Implementation Track develops the product modules and integrates them.
- **Step 2.1: Milestone 1 - Docker Environment & Next.js Init**
  - Build `Dockerfile` and `docker-compose.yml`.
  - Initialize the Next.js App Router project.
  - Install dependencies: Zustand, SWR, Tailwind CSS, shadcn/ui.
- **Step 2.2: Milestone 2 - Task Watcher Integration**
  - Write a watcher script that polls a folder for tasks.
  - Watcher must parse tasks, log runs, execute `agy`, and handle errors.
  - Ensure the watcher is launched as a system service or background process inside the container.
- **Step 2.3: Milestone 3 - Persistence Config**
  - Configure host mappings in `docker-compose.yml` for source code, git credentials, and `.gemini` folder.
  - Set up permissions correctly so files written inside the container match the host user.
- **Step 2.4: Milestone 4 - E2E Integration Test Pass (Tiers 1-4)**
  - Run the complete E2E test suite.
  - Debug and resolve any integration issues until all tests pass.
- **Step 2.5: Milestone 5 - Adversarial Hardening (Tier 5)**
  - Spin up Challengers to find gaps, write additional edge-case tests, and verify code robustness.

## Coordination & Verification Strategy
- **E2E Testing Track** is executed by a spawned sub-orchestrator running the E2E Testing archetype.
- **Implementation Milestones** will be executed by spawning Workers, Explorers, Reviewers, and Challengers.
- Every milestone completion requires:
  - Clean build & tests.
  - Forensic Auditor review passing.
