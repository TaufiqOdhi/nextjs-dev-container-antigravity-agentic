# Handoff Report: E2E Test Suite Design

## 1. Observation
I have performed a thorough, read-only analysis of the workspace and project requirements:
- **Project Structure**: Investigated the workspace root and found only metadata files:
  - `ORIGINAL_REQUEST.md` (root, size: 2,471 bytes)
  - `PROJECT.md` (root, size: 3,334 bytes)
  - `.agents/` metadata directory.
- **Specifications & Interfaces**:
  - `PROJECT.md` outlines the Code Layout (with `tests/e2e/` as the E2E test target directory) and Interface Contracts:
    - **Watcher ↔ Antigravity CLI**: Task directory `/app/tasks`, polling for `*.task` or `*.md`, executed via `agy --execute <task_file_path>`, logs to `/app/tasks/logs`.
    - **Host ↔ Container Mappings**: Source code `./` to `/app`, git config `~/.gitconfig` to `/home/node/.gitconfig`, Antigravity CLI config `./.gemini` to `/home/node/.gemini`.
  - `.agents/sub_orch_e2e/SCOPE.md` details the E2E Testing Track scope:
    - Test runner file: `tests/e2e/runner.js`
    - Helper utilities: `tests/e2e/utils.js`
    - Test files: `tier1_feature_coverage.test.js`, `tier2_boundary_corner.test.js`, `tier3_cross_feature.test.js`, `tier4_real_world.test.js`.
    - Execution check commands:
      - Status check: `docker compose ps`
      - Version check: `docker compose exec -t nextjs-dev-container agy --version`
      - Dev server check: `docker compose exec -t nextjs-dev-container curl -I http://localhost:3000`

---

## 2. Logic Chain
Based on the observations:
1. **Runner Fast-Failure**: Since E2E tests are opaque-box tests against the active docker container environment, running them when the container is down is a waste of resources and leads to generic timeouts. Thus, the runner must execute an initial environment check (using `docker compose ps`) and abort/fail immediately if the SUT (System Under Test) container is not in an active running state.
2. **Verification Prior to Implementation (Mock/Dummy Strategy)**: As there is no code implemented yet in the workspace, we need a method to verify that the E2E test suite itself works.
   - **Host-side Mocking (`TEST_MOCK=true`)**: Stubs the docker child process commands (`execSync` / `spawn`) in `tests/e2e/utils.js` to return pre-canned output, allowing developer verification of the test runner structure, hooks, and assertion reporting logic on the host.
   - **Container-side Mocking (Mock SUT)**: A lightweight Docker Compose environment that mounts the same host directories (`./tasks`, `./.gemini`) but runs a minimal shell script mock of the `agy` CLI (returning a simulated version string) and a minimal polling shell loop for the task watcher. This validates the host-container boundary, file permissions, and volume synchronization.
3. **Multi-tiered Test Suites**:
   - Tier 1 (Feature Coverage) directly tests each contract requirement.
   - Tier 2 (Boundary & Corner Cases) challenges robust handling of network restrictions (CODE_ONLY), resource bounds, invalid files, and path lengths.
   - Tier 3 (Cross-Feature) integrates watcher execution with volume mounts and dev server state changes.
   - Tier 4 (Real-World Application) replicates complete end-to-end user journeys (first setup, consecutive task queues, self-healing).

---

## 3. Caveats
- **Assumption of Node.js Version**: The proposed design assumes Node.js v18+ is available on the host, which contains the stable, native `node:test` and `node:assert` modules. If an older version is used, a dependency like Jest or Mocha would need to be added to `package.json`.
- **Docker Command Formats**: `docker compose` is assumed to be available as a command. If the system uses the older hyphenated `docker-compose`, the utility helper will require a fallback string replacement.
- **Port Mapping**: Port 3000 is assumed to be the host-exposed Next.js port.

---

## 4. Conclusion

### A. Test Runner Structure Design

The test runner will be located under `tests/e2e/` and utilize the built-in Node.js `node:test` framework.

#### Directory Layout
```
tests/e2e/
├── runner.js                      # Discovers and runs all test suites sequentially
├── utils.js                       # Shared Docker, filesystem, and setup/teardown helpers
├── mock_sut/                      # Optional container-side mock scripts for dry runs
│   ├── mock_agy.sh                # Simulates the agy CLI tool
│   └── mock_watcher.sh            # Simulates the task watcher service
├── tier1_feature_coverage.test.js # Tier 1 test definitions
├── tier2_boundary_corner.test.js  # Tier 2 test definitions
├── tier3_cross_feature.test.js    # Tier 3 test definitions
└── tier4_real_world.test.js       # Tier 4 test definitions
```

#### Test Runner Flow & Fast-Failure Mechanism
Before running test suites, `runner.js` executes the environment check.
```javascript
// tests/e2e/utils.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const IS_MOCK = process.env.TEST_MOCK === 'true';
const CONTAINER_NAME = 'nextjs-dev-container';

function isContainerRunning() {
  if (IS_MOCK) return true;
  try {
    const status = execSync('docker compose ps --format json', { encoding: 'utf-8' });
    const services = JSON.parse(status);
    const container = services.find(s => s.Name === CONTAINER_NAME || s.Service === 'nextjs-app');
    return container && container.State === 'running';
  } catch (error) {
    try {
      // Fallback parser for non-json format outputs
      const rawPs = execSync('docker compose ps', { encoding: 'utf-8' });
      return rawPs.includes(CONTAINER_NAME) && rawPs.includes('Up');
    } catch {
      return false;
    }
  }
}

function assertContainerRunning() {
  if (!isContainerRunning()) {
    console.error(`\x1b[31m[ERROR] System Under Test (SUT) is not running.\x1b[0m`);
    console.error(`Please spin up the container environment first using:`);
    console.error(`\x1b[36m  docker compose up -d\x1b[0m`);
    process.exit(1);
  }
}

module.exports = {
  assertContainerRunning,
  isContainerRunning,
  // Other utility commands: execInContainer, writeTask, cleanDirs, etc.
};
```

#### Mock/Dummy Verification Strategies
1. **Option 1: Host-level Dry Run (`TEST_MOCK=true`)**
   - The helper functions mock the system commands.
   - For example, `execInContainer('agy --version')` returns `Antigravity CLI v2.0.0-mock-host`.
   - File creation and tracking are done locally in temporary host folders, allowing verification of the test runner's orchestration and assertion logic in under 1 second.
2. **Option 2: Container-level Mock SUT (Integration Dry Run)**
   - The runner starts a minimal target container containing mock shell scripts:
     - `agy`: A simple bash script writing parameters to `/app/tasks/logs/` and stdout.
     - `watcher.sh`: A background shell watcher using standard `sleep 1` loop checking `/app/tasks` for `*.task` or `*.md` files.
   - Allows E2E pipeline verification (Docker Compose, volume mounts, permission settings, host-container interaction) prior to the implementation of the main Next.js app and the NodeJS/bash watcher.

---

### B. Detailed E2E Test Cases Outline

Here is the comprehensive list of E2E test cases categorized by their tier.

#### Tier 1: Feature Coverage (R1, R2, R3)

##### Feature 1: Docker Container Environment (R1)
1. **TC-FC-101: Container Lifecycle and Status Check**
   - *Description*: Verify that the container is built and running in an "Up" state.
   - *Action*: Run `docker compose ps` from the host.
   - *Assertion*: Return code is 0; container state is listed as active/running.
2. **TC-FC-102: Antigravity CLI Availability**
   - *Description*: Verify that the `agy` executable is globally accessible inside the container.
   - *Action*: Execute `docker compose exec -T nextjs-dev-container agy --version`.
   - *Assertion*: Command executes without errors and output matches semantic version regex `^Antigravity CLI v?\d+\.\d+\.\d+`.
3. **TC-FC-103: Next.js Dev Server Startup and Port Binding**
   - *Description*: Verify that port 3000 inside the container is actively listening for TCP connections.
   - *Action*: Execute `docker compose exec -T nextjs-dev-container nc -z localhost 3000`.
   - *Assertion*: Connection check returns success.
4. **TC-FC-104: Next.js Dev Server HTTP Response**
   - *Description*: Verify that the dev server is serving valid HTTP content on port 3000.
   - *Action*: Send a `curl -I http://localhost:3000` request from the host machine.
   - *Assertion*: Header response contains `HTTP/1.1 200 OK` (or 3xx redirect) and a Next.js identifier header.
5. **TC-FC-105: Tech Stack Verification**
   - *Description*: Verify that dependencies required by the developer contract (`tailwindcss`, `zustand`, `swr`, and `shadcn` elements) exist in the container.
   - *Action*: Inspect the `/app/package.json` file inside the container.
   - *Assertion*: Verify presence of the specified npm packages in the dependencies or devDependencies list.

##### Feature 2: Task Watcher (R2)
6. **TC-FC-201: Watcher File Detection (*.task)**
   - *Description*: Verify that creating a file with a `.task` extension in the drop folder triggers the watcher.
   - *Action*: Write a test task file `test_task_1.task` to `./tasks/` on the host. Wait up to 5 seconds.
   - *Assertion*: Log directory contains corresponding log entry or status output showing file detection.
7. **TC-FC-202: Watcher File Detection (*.md)**
   - *Description*: Verify that creating a file with a `.md` extension in the drop folder triggers the watcher.
   - *Action*: Write a test markdown file `test_task_2.md` to `./tasks/` on the host. Wait up to 5 seconds.
   - *Assertion*: Log directory contains corresponding log entry or status output showing markdown file detection.
8. **TC-FC-203: Watcher Triggers Antigravity CLI Execution**
   - *Description*: Verify that the watcher executes the `agy` command with the correct arguments.
   - *Action*: Drop a file `trigger_test.task` into `./tasks/`. Check running processes or logs inside the container.
   - *Assertion*: The logs or process history verify that `agy --execute /app/tasks/trigger_test.task` was run.
9. **TC-FC-204: Execution Log Capture**
   - *Description*: Verify that standard output and error of the `agy` execution are correctly captured in logs.
   - *Action*: Drop a task file. Inspect `./tasks/logs/` directory on the host.
   - *Assertion*: A log file matching `./tasks/logs/trigger_test.log` is generated containing the execution logs.
10. **TC-FC-205: Task Clean-up or Archive**
    - *Description*: Verify that processed files are removed from the active folder or moved to `./tasks/archive`.
    - *Action*: Drop a task file, wait for execution completion.
    - *Assertion*: The file is no longer present in `./tasks/` (or has been moved to `./tasks/archive/`).

##### Feature 3: Volume Persistence (R3)
11. **TC-FC-301: Source Code Volume Mounting**
    - *Description*: Verify that files created in the host workspace are immediately synchronized inside the container.
    - *Action*: Create a temporary file `hello_world.txt` in the host workspace root. Run `docker compose exec -T dev-container cat /app/hello_world.txt`.
    - *Assertion*: Output contents match the host file content. Clean up file.
12. **TC-FC-302: Host Git Config Mounting**
    - *Description*: Verify that the host's `~/.gitconfig` is visible inside the container at `/home/node/.gitconfig` (or equivalent).
    - *Action*: Run `docker compose exec -T dev-container cat /home/node/.gitconfig`.
    - *Assertion*: Output contains git config variables matching host settings (e.g. `[user]`).
13. **TC-FC-303: Host .gemini Folder Mounting**
    - *Description*: Verify that the host's `.gemini` folder inside the project is mounted to `/home/home/.gemini` (or equivalent).
    - *Action*: Create a mock file `test_config.json` in `./.gemini/` on the host. Run `docker compose exec -T dev-container ls /home/node/.gemini`.
    - *Assertion*: Output lists `test_config.json`.
14. **TC-FC-304: Bidirectional Write Persistence (Container to Host)**
    - *Description*: Verify that config changes written inside the container are persisted back to the host filesystem.
    - *Action*: Run `docker compose exec -T dev-container touch /home/node/.gemini/container_created.txt`.
    - *Assertion*: The file `./.gemini/container_created.txt` exists on the host. Clean up file.
15. **TC-FC-305: Persistence Across Container Re-creation**
    - *Description*: Verify that configuration files survive a complete container teardown and re-creation.
    - *Action*: Create file `./.gemini/persist_test.txt` on host. Run `docker compose down`, then `docker compose up -d`. Run `docker compose exec -T dev-container cat /home/node/.gemini/persist_test.txt`.
    - *Assertion*: File content is successfully read in the new container instance.

---

#### Tier 2: Boundary & Corner Cases

##### Feature 1 Boundary Cases (Docker Env):
16. **TC-BC-101: Port Conflict Handling**
    - *Description*: Verify system behavior when host port 3000 is already in use by another process before starting the container.
    - *Action*: Start a dummy netcat server on host port 3000. Run `docker compose up -d`.
    - *Assertion*: Docker compose reports a port allocation failure, and the runner flags this environment error clearly.
17. **TC-BC-102: Missing Environment Variables (.env)**
    - *Description*: Verify container starts or fails gracefully when `.env` configuration is missing.
    - *Action*: Rename `.env` to `.env.bak` and run `docker compose up -d`.
    - *Assertion*: If start fails or starts with default warnings, verify test runner detects configuration errors.
18. **TC-BC-103: Container Resource Limitations (CPU/Memory Throttling)**
    - *Description*: Verify that the Next.js compilation or task runner handles low resources without crashing (e.g. out of memory).
    - *Action*: Configure Docker container limits in docker-compose override (e.g., 512MB RAM). Start Next.js dev server.
    - *Assertion*: Server builds the pages successfully without exit code 137 (OOM killed).
19. **TC-BC-104: Dev Server Abrupt Crash Recovery**
    - *Description*: Verify that the Dev server automatically recovers or compose restarts it when killed.
    - *Action*: Kill the main Next.js node process inside the container using `kill -9`.
    - *Assertion*: The Docker compose container is restarted (if restart policy is enabled) or dev server restarts, and becomes responsive again on port 3000.
20. **TC-BC-105: Read-Only Filesystem Mount Restriction**
    - *Description*: Verify that directories that are supposed to be write-protected behave correctly, and directories that require write access are writable.
    - *Action*: Inspect permission checks inside the container for `/app` vs directories like log folders.
    - *Assertion*: Container has write permissions on `/app/tasks/logs` and `/home/node/.gemini`.

##### Feature 2 Boundary Cases (Task Watcher):
21. **TC-BC-201: Empty or Malformed Task File**
    - *Description*: Verify that the watcher does not crash when an empty file or binary file (e.g. image) is placed in the drop folder.
    - *Action*: Create a zero-byte file `empty.task` and a binary file `test.png` in `./tasks/`.
    - *Assertion*: Watcher ignores the files or logs an unsupported format error without crashing or looping infinitely.
22. **TC-BC-202: Large Task File Injection**
    - *Description*: Verify system limits when processing extremely large task files (e.g., 10MB markdown).
    - *Action*: Create a 10MB text task file with repeated prompt texts.
    - *Assertion*: Watcher safely processes or rejects the task with a size-limit error, avoiding out-of-memory errors.
23. **TC-BC-203: Bulk File Drop / Watcher Congestion**
    - *Description*: Verify that the watcher handles a burst of many files dropped simultaneously.
    - *Action*: Write 50 `.task` files into `./tasks/` in a single shell command.
    - *Assertion*: Watcher queues the tasks and processes them sequentially or concurrently up to a safe limit, without dropping files or crashing.
24. **TC-BC-204: In-Progress File Locking (Slow Write)**
    - *Description*: Verify watcher behavior when a task file is written slowly (e.g., simulated network lag).
    - *Action*: Append to `slow.task` line by line with 100ms pauses.
    - *Assertion*: Watcher does not trigger execution until the file handle is closed/inactive.
25. **TC-BC-205: Watcher Self-Healing on Directory Deletion**
    - *Description*: Verify watcher behavior when the `/app/tasks` directory is temporarily deleted and recreated.
    - *Action*: Delete the `./tasks` directory on host. Recreate it after 3 seconds.
    - *Assertion*: Watcher resumes monitoring the recreated directory and processes new files correctly.

##### Feature 3 Boundary Cases (Volume Persistence):
26. **TC-BC-301: UID/GID Mismatch and Permissions**
    - *Description*: Verify that files created by different users on the host (e.g., root vs standard user) do not block container access.
    - *Action*: Create `./.gemini/root_file.json` using `sudo` on host. Let container read/modify it.
    - *Assertion*: Watcher/agy can read and write to the file without permission denied errors.
27. **TC-BC-302: Deeply Nested Path Names**
    - *Description*: Verify persistence handles path names exceeding typical path lengths (e.g. >255 chars).
    - *Action*: Create a file in a deeply nested path inside `./.gemini/`.
    - *Assertion*: Synchronization succeeds and the file is visible at the same nesting level inside the container.
28. **TC-BC-303: Extreme File Modification Frequency**
    - *Description*: Verify persistence under high write load (e.g., config database lock loops).
    - *Action*: Rapidly write to `./.gemini/config.json` 100 times in 1 second.
    - *Assertion*: File synchronization remains consistent without corrupted states or locking exceptions.
29. **TC-BC-304: Host Disk Space Depletion**
    - *Description*: Verify the container behavior when the host has 0 disk space available.
    - *Action*: (Simulated in mock) Return disk full errors.
    - *Assertion*: Container logs a descriptive error and stops writes cleanly without corrupted config database files.
30. **TC-BC-305: Special Characters in volume names / host directories**
    - *Description*: Verify volume mounts when the host path contains spaces or special characters (e.g. `nextjs dev container (agentic)`).
    - *Action*: Initialize the workspace in a folder named with spaces and parentheses.
    - *Assertion*: `docker compose up -d` successfully builds and mounts directories.

---

#### Tier 3: Cross-Feature Combinations

31. **TC-XC-301: Task Triggered Code Gen with Hot Reload & Mount Verification**
    - *Description*: Tests the complete developer loop: volume mounts, task watcher, agy command, and dev server hot reload.
    - *Steps*:
      1. Drop a task file `add_header.task` on host `./tasks/` requesting a text change in `src/app/page.tsx`.
      2. Task watcher detects the file and runs `agy --execute`.
      3. `agy` modifies `src/app/page.tsx` (mounted volume).
      4. Dev server detects change and rebuilds page.
      5. Host tests query `http://localhost:3000` to verify the modified header is served.
    - *Pass Criteria*: Response contains new text, changes exist on host, and logs verify agy execution.
32. **TC-XC-302: Hard Container Reset During Task Execution**
    - *Description*: Tests volume persistence and task queue recovery across container lifecycle events.
    - *Steps*:
      1. Drop a task `long_running.task` that simulates a long-running execution.
      2. Wait for watcher to start execution.
      3. Perform hard restart: `docker compose down && docker compose up -d`.
      4. Verify that the task status is tracked in `./.gemini/` database/files.
      5. Verify that upon restart, the task watcher resumes and flags the task as failed/interrupted or retries it.
    - *Pass Criteria*: System does not enter an inconsistent state (no lock files prevent startup, log file indicates interruption).
33. **TC-XC-303: Git Operation with SSH agent and Credentials Persistence**
    - *Description*: Tests interaction between persistent SSH keys/git configuration, `agy` command, and network constraints.
    - *Steps*:
      1. Inject mock SSH keys to `./.ssh` and git config to `~/.gitconfig` on the host.
      2. Drop task `git_commit.task` requesting code commit.
      3. Watcher executes `agy`.
      4. `agy` executes Git command using mounted config.
    - *Pass Criteria*: Git operations run inside the container successfully resolve the identity of the host user and authenticate.

---

#### Tier 4: Real-World Application Scenarios

34. **TC-RW-401: Developer Bootstrap Flow**
    - *Scenario*: First-time developer setup. Clones repository, starts environment, runs standard tasks.
    - *Steps*:
      1. Initialize clean workspace (no `.gemini`, empty `./tasks`, default files).
      2. Run `docker compose up -d`.
      3. Drop a setup task `bootstrap.task` (e.g. install additional packages or configure theme).
      4. Verify container starts, configures itself, creates initial `.gemini` structure, and writes successful log.
35. **TC-RW-402: Multi-Agent Collaboration and Task Pipeline**
    - *Scenario*: Processing a queue of tasks representing a ticket board (e.g., ticket 1: create store, ticket 2: create component using store, ticket 3: write page).
    - *Steps*:
      1. Drop three sequential tasks into `./tasks` at once.
      2. Watcher should process them in sequence.
      3. Verify `ticket_1` compiles, then `ticket_2` builds upon `ticket_1` changes, and finally `ticket_3` integrates them.
      4. Dev server remains running and compiles successfully after each step.
36. **TC-RW-403: Network-Isolated Dependency Failure Graceful Recovery**
    - *Scenario*: Task requires downloading an external npm package, but container is in restricted network mode (CODE_ONLY).
    - *Steps*:
      1. Drop task requesting external integration (e.g., `npm install lodash`).
      2. Watcher executes `agy`.
      3. npm install fails due to network isolation.
      4. Verify the system does not crash; log captures package installation error, notifies watcher, and watcher marks task as failed, returning host folder clean.
37. **TC-RW-404: Automated Task Recovery from Fatal Application State**
    - *Scenario*: Code change breaks compilation, rendering the app broken. The system must recover.
    - *Steps*:
      1. Drop task `break_app.task` that writes corrupted syntax to `src/app/page.tsx`.
      2. Dev server breaks (returns compile error logs).
      3. Drop recovery task `fix_app.task` that reverts page.tsx or writes valid syntax.
      4. Watcher processes recovery task, dev server compiles successfully, and returns 200 OK.
38. **TC-RW-405: Persistent Agent Configuration Synchronization and Credentials Leak Prevention**
    - *Scenario*: Agent credentials and settings are updated on the host (e.g. changing API tokens or agent rules) and must be immediately active without restarting the container, while ensuring secret files are protected.
    - *Steps*:
      1. Modify `.gemini/config.json` on the host to update a key constraint or mock API key.
      2. Check that the container immediately sees the updated config.
      3. Verify that secret keys or ssh keys have appropriate permissions inside the container (e.g., `chmod 600`) to prevent SSH rejection of key usage.
      4. Drop task that references the updated configuration, verifying the new rule is applied.

---

### C. Proposed Layout for Metadata Files

#### Proposed Layout for `TEST_INFRA.md` (Project Root)
```markdown
# Test Infrastructure Specification

This document details the architecture, configuration, and execution guidelines for the End-to-End (E2E) testing framework of the Next.js Agentic Dev Container.

## 1. Architecture Overview
- High-level design diagram (ascii) of the E2E Test Suite interacting with the host filesystem, Docker Compose, and Container environment.
- File layout of the test directory (\`tests/e2e/\`).

## 2. Test Runner (\`runner.js\`)
- Design description of the Node.js runner.
- Environment check phase: details on how the runner checks container availability and halts execution if the SUT is offline.
- Execution flow: how tests are loaded, run sequentially, and how assertion failures are handled.

## 3. Test Utilities & Helpers (\`utils.js\`)
- Description of the helper functions:
  - Docker Compose commands (\`exec\`, \`ps\`, \`logs\`, etc.).
  - Host file manipulation (reading/writing to \`./tasks\`, \`./.gemini\`).
  - State reset and cleanup routines.

## 4. Mock / Dry-Run Architecture
- **Host Mocking (\`TEST_MOCK=true\`)**: Details on how to execute tests locally on the host by stubbing child process execution, returning simulated data.
- **Mock Container Execution**: Guidelines on spinning up a dummy container with mock scripts (\`mock agy\` and \`mock watcher\`) to test volume persistence and watcher polling logic without running the actual application codebase.

## 5. Execution Reference
- How to run tests:
  - Command: \`npm run test:e2e\` or \`node tests/e2e/runner.js\`
  - Running specific tiers: \`node tests/e2e/runner.js --tier=1\`
  - Dry run / Mock execution: \`TEST_MOCK=true node tests/e2e/runner.js\`
- Configuration environment variables list (e.g., \`CONTAINER_NAME\`, \`TASK_DIR\`, \`LOG_DIR\`, \`GEMINI_DIR\`).

## 6. Output & Reporting
- Output log format (console representation).
- Test execution report format: JSON output description for CI/CD consumption (\`tests/e2e/reports/report.json\`).
```

#### Proposed Layout for `TEST_READY.md` (Project Root)
```markdown
# Test Suite Readiness and Tracking

This document outlines the implementation status of all planned E2E test cases across the four testing tiers.

## 1. Readiness Summary
- Status summary table:
  - Tier 1: [Count] tests defined, [Count] implemented, [Count] passing
  - Tier 2: [Count] tests defined, [Count] implemented, [Count] passing
  - Tier 3: [Count] tests defined, [Count] implemented, [Count] passing
  - Tier 4: [Count] tests defined, [Count] implemented, [Count] passing
- Overall readiness percentage.

## 2. Tier 1: Feature Coverage Status
- Checklist of all 15+ Feature Coverage test cases.
- For each test case:
  - **ID & Title**: e.g., \`TC-FC-101: Container Lifecycle and Status\`
  - **Description**
  - **Status**: [Planned / Mock-Verifiable / Fully Implemented]
  - **Result**: [Pending / Passed / Failed]

## 3. Tier 2: Boundary & Corner Cases Status
- Checklist of all 15+ Boundary/Corner test cases.
- For each test case:
  - **ID & Title**: e.g., \`TC-BC-201: Empty or Malformed Task File\`
  - **Description**
  - **Status**: [Planned / Mock-Verifiable / Fully Implemented]
  - **Result**: [Pending / Passed / Failed]

## 4. Tier 3: Cross-Feature Combinations Status
- Checklist of all Cross-Feature test cases.
- For each test case:
  - **ID & Title**: e.g., \`TC-XC-301: Task Triggered Code Gen with Hot Reload\`
  - **Description**
  - **Status**: [Planned / Mock-Verifiable / Fully Implemented]
  - **Result**: [Pending / Passed / Failed]

## 5. Tier 4: Real-World Scenarios Status
- Checklist of all Real-World application scenarios.
- For each testcase:
  - **ID & Title**: e.g., \`TC-RW-401: Developer Bootstrap Flow\`
  - **Description**
  - **Status**: [Planned / Mock-Verifiable / Fully Implemented]
  - **Result**: [Pending / Passed / Failed]

## 6. How to Update
- Guidelines for adding new tests or modifying statuses in this file during development.
```

---

## 5. Verification Method
- **Static Verification**: Review this `handoff.md` and check that it meets the requirements of `ORIGINAL_REQUEST.md` and `.agents/sub_orch_e2e/SCOPE.md`.
- **Implementation Validation**: When the E2E framework is implemented in the subsequent milestone phase, the developer agent can run:
  ```bash
  TEST_MOCK=true node tests/e2e/runner.js
  ```
  to verify that the runner parses command options, checks container states, reports test results, and executes assertions correctly.
