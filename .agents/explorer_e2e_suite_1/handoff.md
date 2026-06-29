# E2E Test Suite Design Report

## 1. Observation
We analyzed the following workspace files and specification contracts:
- **`ORIGINAL_REQUEST.md`** (lines 17–30):
  * *R1. Container Environment & Tech Stack*: "Provide a standard `docker-compose.yml` and `Dockerfile` to create a Next.js development environment. The container must include Node.js, the Antigravity CLI... Tech stack: Next.js (App Router), Tailwind CSS & shadcn/ui, Zustand, SWR"
  * *R2. Task Watcher Integration*: "Implement a watcher script inside the container that automatically polls external task sources... and triggers the Antigravity CLI"
  * *R3. Persistent State via Volume Mounts*: "Configure the `docker-compose.yml` to use volume mounts that persist the source code, git credentials, and the Antigravity configuration."
- **`PROJECT.md`** (lines 10–23, 35–46):
  * Defines code layout: `tests/e2e/` as the E2E test target directory.
  * *Watcher ↔ Antigravity Contract*: Task directory `/app/tasks`, polls for `*.task` or `*.md`, command `agy --execute <task_file_path>`, logs in `/app/tasks/logs`.
  * *Host ↔ Container Mounts*: Source code `./` to `/app`, git config `~/.gitconfig` to `/home/node/.gitconfig`, Antigravity CLI config `./.gemini` to `/home/node/.gemini`.
- **`.agents/sub_orch_e2e/SCOPE.md`** (lines 4–12, 18–30):
  * Specifies `tests/e2e/runner.js` as the custom runner, `tests/e2e/utils.js` as the helper utilities, and four test files (`tier1_feature_coverage.test.js`, etc.).
  * Lists check commands: status via `docker compose ps`, CLI via `docker compose exec -t nextjs-dev-container agy --version`, and HTTP via `docker compose exec -t nextjs-dev-container curl -I http://localhost:3000`.
- **`.agents/explorer_e2e_suite_2/handoff.md`**:
  * Outlined a custom testing loop, host-level mocking (`E2E_MOCK=true`) stubbing Docker execution, and a 38-case test matrix.
- **`.agents/explorer_e2e_suite_3/handoff.md`**:
  * Outlined a test runner leveraging Node's built-in `node:test` framework, host-level mocking (`TEST_MOCK=true`), and container-level Mock SUT execution mapping simple bash wrappers.

---

## 2. Logic Chain
Based on these direct observations:
1. **Pre-flight Fast-Failure**: E2E testing evaluates the runtime environment. Running E2E tests against an offline environment results in generic socket connection timeouts. Therefore, `runner.js` must execute a pre-flight verification using `docker compose ps` (or API equivalent) and immediately terminate (exit code 1) with clear user feedback if the System Under Test (SUT) is down.
2. **Verification Prior to Implementation (Dual-Mocking Strategy)**: To verify that the E2E test suite's assertion, discovery, and reporter logic works before source code is written, we need to bypass physical dependencies:
   - **Host-level Mocking (`E2E_MOCK=true`)**: Stubs the child process execution inside `tests/e2e/utils.js`. It executes entirely on the host without Docker, virtualizing file interactions in temporary host directories to verify runner orchestration in <1 second.
   - **Container-level Mocking (Mock SUT)**: Creates a lightweight `docker-compose.mock.yml` launching a dummy container. Instead of the full Next.js/Task-Watcher stack, it mounts small shell wrappers simulating `agy` and a simple polling loop. This verifies the actual host-container file boundary, folder mounting permissions, and volume sync prior to application implementation.
3. **Multi-tiered Coverage**: The 38 tests map onto the requested tiers: Feature Coverage (Tier 1), Boundary & Corner Cases (Tier 2), Cross-Feature Integrations (Tier 3), and Real-World Developer Scenarios (Tier 4).
4. **Standardization**: Standardizing test definitions using Node.js's native `node:test` and `node:assert` modules avoids third-party runner dependencies (e.g. Jest/Mocha), ensuring high speed and seamless host execution under `CODE_ONLY` restrictions.

---

## 3. Synthesis of Inputs
We have reconciled and synthesized the proposals from Explorer 2 and Explorer 3:

### A. Consensus
- **Host-side Node.js Runner**: Tests will run on the host using Node.js, spawning child processes to communicate with the container.
- **Early Termination**: The runner checks container status via `docker compose ps` and fails immediately if SUT is offline.
- **File Structure**: Organized under `tests/e2e/` with separate test suite files matching the 4 Tiers.
- **Mock Flag**: Environment-variable-controlled execution to bypass live Docker checks.

### B. Resolved Conflicts
- **Test Runner Framework Choice**: Explorer 2 suggested a custom JavaScript assertion loop. Explorer 3 proposed Node's native `node:test` and `node:assert` modules.
  *Resolution*: We adopt the native `node:test` and `node:assert` framework (introduced in Node.js 18+). It is standard, requires no npm package installations, natively supports test reporting formats (TAP/spec), and allows subsetting test execution via CLI arguments.
- **Mock Verification Method**: Explorer 2 proposed host-level command stubs. Explorer 3 proposed container-level shell stubs (Mock SUT).
  *Resolution*: We implement a **Dual-Mocking Strategy**. Host-level mocking (`E2E_MOCK=true`) is ideal for rapid local validation of runner/test code. Container-level mocking (a mock compose setup) is ideal for verifying volume mount boundaries, permissions, and directory syncing before app implementation is complete.

### C. Dissenting Views
- No unresolved disagreements remain. Both methodologies are fully integrated.

### D. Gaps
- **UID/GID Mapping**: The exact user group permissions mapping on the host vs the container is not explicitly detailed in the project requirements. We address this by including test case `TC-T2-VOL-01` to dynamically verify host-container file ownership and permissions compatibility.

---

## 4. Conclusion

### A. Test Runner Structure Design

The proposed architecture organizes the E2E suite under `tests/e2e/`:

```
tests/e2e/
├── runner.js                      # Main orchestrator, performs pre-flight and loads test files
├── utils.js                       # Wrappers for docker exec, host/container files, and mock stubs
├── mock_sut/                      # Dry-run container scripts
│   ├── Dockerfile.mock            # Lightweight container definition
│   ├── docker-compose.mock.yml    # Companion compose file for dry run
│   ├── mock_agy.sh                # Shell script simulating the agy CLI tool
│   └── mock_watcher.sh            # Polling loop shell script simulating the watcher
├── tier1_feature_coverage.test.js # Tier 1 test definitions
├── tier2_boundary_corner.test.js  # Tier 2 test definitions
├── tier3_cross_feature.test.js    # Tier 3 test definitions
└── tier4_real_world.test.js       # Tier 4 test definitions
```

#### `tests/e2e/runner.js` (Test Orchestrator)
Enforces fail-fast logic and invokes native test suites:
```javascript
// tests/e2e/runner.js
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const E2E_MOCK = process.env.E2E_MOCK === 'true';
const CONTAINER_NAME = 'nextjs-dev-container';

function isContainerRunning() {
  if (E2E_MOCK) return true;
  try {
    const status = execSync('docker compose ps --format json', { encoding: 'utf-8' });
    const services = JSON.parse(status);
    const container = services.find(s => s.Name === CONTAINER_NAME || s.Service === 'nextjs-app');
    return container && (container.State === 'running' || container.Status.includes('Up'));
  } catch {
    try {
      const rawPs = execSync('docker compose ps', { encoding: 'utf-8' });
      return rawPs.includes(CONTAINER_NAME) && (rawPs.includes('Up') || rawPs.includes('running'));
    } catch {
      return false;
    }
  }
}

async function run() {
  console.log(`=== Next.js Agentic Dev Container E2E Suite ===`);
  console.log(`[Configuration] Host Mock Mode: ${E2E_MOCK}`);

  if (!isContainerRunning()) {
    console.error(`\x1b[31m[ERROR] System Under Test (SUT) container '${CONTAINER_NAME}' is offline.\x1b[0m`);
    console.error(`Please spin up the container before running E2E tests:`);
    console.error(`\x1b[36m  docker compose up -d\x1b[0m`);
    process.exit(1);
  }

  // Load and execute test suites using native node:test
  const testFiles = [
    'tier1_feature_coverage.test.js',
    'tier2_boundary_corner.test.js',
    'tier3_cross_feature.test.js',
    'tier4_real_world.test.js'
  ];

  console.log('\nDiscovered suites, starting execution...\n');
  
  // Dynamically import suites to run under the native test runner
  for (const file of testFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      require(filePath);
    }
  }
}

run().catch(err => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
```

#### `tests/e2e/utils.js` (Mock & Live Environment Abstraction)
```javascript
// tests/e2e/utils.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const E2E_MOCK = process.env.E2E_MOCK === 'true';
const TASK_DIR = path.resolve(__dirname, '../../tasks');
const CONFIG_DIR = path.resolve(__dirname, '../../.gemini');

// Virtual filesystem for host mock mode
const mockStore = {
  files: {},
  commandOutputs: {
    'agy --version': 'Antigravity CLI v2.0.0 (mock)',
    'node --version': 'v20.10.0',
    'npm --version': '10.2.3',
    'curl -I http://localhost:3000': 'HTTP/1.1 200 OK\r\nContent-Type: text/html',
  }
};

function execInContainer(cmd) {
  if (E2E_MOCK) {
    if (mockStore.commandOutputs[cmd]) return mockStore.commandOutputs[cmd];
    if (cmd.startsWith('agy --execute')) {
      const taskPath = cmd.split(' ')[2];
      const taskName = path.basename(taskPath);
      const logName = taskName.replace(/\.(task|md)$/, '.log');
      mockWriteFile(`logs/${logName}`, `[MOCK-AGY] Executing instructions from ${taskName}\n[MOCK-AGY] Execution successful.`);
      return `Triggered execution for ${taskName}`;
    }
    return '';
  }
  return execSync(`docker compose exec -T nextjs-dev-container ${cmd}`, { encoding: 'utf-8' });
}

function mockWriteFile(relPath, content) {
  mockStore.files[relPath] = content;
}

function mockReadFile(relPath) {
  return mockStore.files[relPath] || null;
}

function writeHostFile(relPath, content, base = TASK_DIR) {
  if (E2E_MOCK) {
    mockWriteFile(relPath, content);
    return;
  }
  const fullPath = path.join(base, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function readHostFile(relPath, base = TASK_DIR) {
  if (E2E_MOCK) {
    return mockReadFile(relPath);
  }
  const fullPath = path.join(base, relPath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : null;
}

function cleanTestingDirectories() {
  if (E2E_MOCK) {
    mockStore.files = {};
    return;
  }
  if (fs.existsSync(TASK_DIR)) fs.rmSync(TASK_DIR, { recursive: true, force: true });
}

module.exports = {
  execInContainer,
  writeHostFile,
  readHostFile,
  cleanTestingDirectories,
  TASK_DIR,
  CONFIG_DIR
};
```

---

### B. Detailed E2E Test Cases Outline (Tiers 1-4)

#### Tier 1: Feature Coverage (15 tests total)

##### Feature 1: Docker Container Environment (R1)
1. **`TC-T1-ENV-01`: Container Lifecycle and Status**
   - *Description*: Verify the container is built and running in an active state.
   - *Action*: Run `docker compose ps` command on host.
   - *Assertion*: Command exits successfully; container status lists `Up` or `running`.
2. **`TC-T1-ENV-02`: Node.js and NPM Environment**
   - *Description*: Verify that the compatible Node.js environment is configured.
   - *Action*: Run `execInContainer('node --version && npm --version')`.
   - *Assertion*: Outputs valid version numbers matching project standard (e.g. Node v18+).
3. **`TC-T1-ENV-03`: Antigravity CLI Availability**
   - *Description*: Verify the `agy` executable is globally accessible inside the container.
   - *Action*: Run `execInContainer('agy --version')`.
   - *Assertion*: Exits with code 0; stdout matches version pattern `Antigravity CLI v?\d+\.\d+\.\d+`.
4. **`TC-T1-ENV-04`: Next.js Tech Stack Check**
   - *Description*: Verify that libraries required by the developer contract are installed.
   - *Action*: Read and inspect container's `/app/package.json` file.
   - *Assertion*: Contains `next`, `tailwindcss`, `zustand`, and `swr` dependencies.
5. **`TC-T1-ENV-05`: Dev Server Health Check**
   - *Description*: Verify that Next.js Dev Server is running and accessible.
   - *Action*: Execute `curl -I http://localhost:3000` from the host.
   - *Assertion*: Receives valid response header containing `HTTP/1.1 200 OK` (or 3xx).

##### Feature 2: Task Watcher (R2)
6. **`TC-T1-WTC-01`: Watcher Process Liveness**
   - *Description*: Verify that the watcher process daemon is running inside the container.
   - *Action*: Execute `execInContainer('ps aux')` or query process list.
   - *Assertion*: Finds active watcher process (e.g., matching `watcher.js` or `watcher.sh`).
7. **`TC-T1-WTC-02`: Watcher Detection of `.task` files**
   - *Description*: Verify watcher triggers on a standard ticket file drop.
   - *Action*: Write `test.task` with simple text to `./tasks` on host. Wait 5 seconds.
   - *Assertion*: Log file `./tasks/logs/test.log` is generated.
8. **`TC-T1-WTC-03`: Watcher Detection of `.md` files**
   - *Description*: Verify watcher triggers on a markdown-based task instruction.
   - *Action*: Write `spec.md` with mock task description to `./tasks` on host. Wait 5 seconds.
   - *Assertion*: Log file `./tasks/logs/spec.log` is generated.
9. **`TC-T1-WTC-04`: CLI Execution Trigger**
   - *Description*: Verify that the watcher calls the `agy` CLI with correct arguments.
   - *Action*: Drop a file `test_cli.task` to `./tasks`. Monitor command execution trace or mock output.
   - *Assertion*: Verifies that `agy --execute /app/tasks/test_cli.task` is triggered.
10. **`TC-T1-WTC-05`: Task Clean-up and Archiving**
    - *Description*: Verify task files are removed/moved to prevent infinite loops.
    - *Action*: Write `cleanup.task` to `./tasks`. Wait for execution to finish.
    - *Assertion*: `cleanup.task` is removed from active `./tasks` directory (or moved to `/archive`).

##### Feature 3: Volume Persistence (R3)
11. **`TC-T1-VOL-01`: Source Code Volume Sync**
    - *Description*: Verify files written on host are immediately visible in the container.
    - *Action*: Create `host-sync.txt` in host's workspace. Run `execInContainer('cat /app/host-sync.txt')`.
    - *Assertion*: Output content matches host file content.
12. **`TC-T1-VOL-02`: Host Git Config Mapping**
    - *Description*: Verify git credentials configurations mount correctly.
    - *Action*: Execute `execInContainer('cat /home/node/.gitconfig')`.
    - *Assertion*: Outputs user and email configurations matching host's `~/.gitconfig`.
13. **`TC-T1-VOL-03`: Antigravity Config Directory Persistence**
    - *Description*: Verify that config folders map correctly.
    - *Action*: Check if `./.gemini/` exists on host, and run `execInContainer('ls /home/node/.gemini')`.
    - *Assertion*: Directory content syncs bidirectionally.
14. **`TC-T1-VOL-04`: Bidirectional Write Persistence**
    - *Description*: Verify files written inside container persist to host.
    - *Action*: Run `execInContainer('touch /home/node/.gemini/container-key.json')`.
    - *Assertion*: Host file `./.gemini/container-key.json` exists.
15. **`TC-T1-VOL-05`: Persistence across Container Restart**
    - *Description*: Verify configurations survive container lifecycle changes.
    - *Action*: Write `./.gemini/secret.json` on host, run `docker compose restart`, then read file inside container.
    - *Assertion*: File content is successfully read in container.

---

#### Tier 2: Boundary & Corner Cases (16 tests total)

##### Feature 1: Docker Container Environment (R1) Boundary Cases
16. **`TC-T2-ENV-01`: Port 3000 Conflict Handling**
    - *Description*: Check system behavior when host port 3000 is blocked before container startup.
    - *Action*: Bind host port 3000 (e.g. using `netcat`), run `docker compose up -d`.
    - *Assertion*: Runner logs port allocation failure clearly or starts container with dynamic port override.
17. **`TC-T2-ENV-02`: Missing Environment Configuration (.env)**
    - *Description*: Verify container starts or fails gracefully when `.env` is absent.
    - *Action*: Temporarily rename `.env` and start container.
    - *Assertion*: System defaults to safe environment settings or logs clear missing configuration warnings.
18. **`TC-T2-ENV-03`: Container Memory/CPU Constraints**
    - *Description*: Verify container builds pages under strict resource bounds.
    - *Action*: Configure container memory limit to 512MB RAM in docker-compose. Start Next.js dev server.
    - *Assertion*: Dev server builds successfully without code 137 (OOM killed).
19. **`TC-T2-ENV-04`: Abrupt Node Dev Server Crash & Recovery**
    - *Description*: Verify dev server recovers automatically when crashed.
    - *Action*: Kill main Next.js node process using SIGKILL.
    - *Assertion*: Dev server is restarted (by container restart policy) and responds on port 3000 again.
20. **`TC-T2-ENV-05`: Read-Only / Write-Protected Mount Restrictions**
    - *Description*: Ensure permissions allow writes in config and task logs directories while denying unauthorized writes elsewhere.
    - *Action*: Attempt write in `/app/tasks/logs` and write-restricted areas.
    - *Assertion*: Log folders are writeable, while protected source folders have controlled permissions.

##### Feature 2: Task Watcher (R2) Boundary Cases
21. **`TC-T2-WTC-01`: Empty / Zero-byte Task File**
    - *Description*: Ensure empty files do not crash the watcher loop.
    - *Action*: Write an empty `empty.task` to `./tasks`.
    - *Assertion*: Watcher ignores or writes a warning log but does not crash or loop infinitely.
22. **`TC-T2-WTC-02`: Invalid / Non-Text Task File**
    - *Description*: Verify binary data files are rejected cleanly.
    - *Action*: Write a small binary image file named `malformed.task` to `./tasks`.
    - *Assertion*: Watcher logs configuration format exception and skips file safely.
23. **`TC-T2-WTC-03`: Watcher Low-Resource Idle Behavior**
    - *Description*: Ensure watcher does not waste CPU in a busy loop when idle.
    - *Action*: Measure container CPU utilization over 10 seconds of idle state.
    - *Assertion*: CPU consumption remains below 1%.
24. **`TC-T2-WTC-04`: Extremely Large Task File**
    - *Description*: Verify watcher handles oversized inputs without memory overflow.
    - *Action*: Drop a 15MB task file into `./tasks`.
    - *Assertion*: Watcher skips with size-limit exceeded log, avoiding out-of-memory errors.
25. **`TC-T2-WTC-05`: Concurrent Task File Drops**
    - *Description*: Verify multiple files dropped simultaneously are processed sequentially.
    - *Action*: Drop 20 `.task` files into `./tasks` simultaneously.
    - *Assertion*: Watcher processes them sequentially without dropping events or crashing.
26. **`TC-T2-WTC-06`: In-Progress File Locking (Slow Write)**
    - *Description*: Verify watcher waits until slow writes are completed before executing `agy`.
    - *Action*: Append lines to `slow.task` with 150ms intervals.
    - *Assertion*: Watcher executes command only after the file write lock is released.

##### Feature 3: Volume Persistence (R3) Boundary Cases
27. **`TC-T2-VOL-01`: Host-Container User/Group UID/GID Mapping**
    - *Description*: Check permissions compatibility when files are created by root or other users on host.
    - *Action*: Create `./.gemini/root_config.json` as host root. Verify container can read/write to it.
    - *Assertion*: Access succeeds without EACCES errors.
28. **`TC-T2-VOL-02`: Long/Nested Directory Path Resolution**
    - *Description*: Ensure persistence handles extreme path lengths.
    - *Action*: Create path depth exceeding 255 characters under `./.gemini/`.
    - *Assertion*: Read and write operations sync correctly.
29. **`TC-T2-VOL-03`: Extreme Write/Sync Frequency**
    - *Description*: Verify high-frequency configurations changes don't corrupt files.
    - *Action*: Rapidly write to `./.gemini/config.json` 100 times in 1 second.
    - *Assertion*: No file locking, file content remains consistent.
30. **`TC-T2-VOL-04`: Symlink Resolution Security**
    - *Description*: Verify that symlinks targeting outside directories are ignored.
    - *Action*: Create symlink `etc_pass.task` pointing to `/etc/passwd`.
    - *Assertion*: Watcher ignores the task, preventing unauthorized file access.
31. **`TC-T2-VOL-05`: Special Characters in Volume Paths**
    - *Description*: Ensure workspace mounts succeed when paths contain spaces/special characters.
    - *Action*: Initialize dev container inside a workspace path like `/app/nextjs dev container (agentic)`.
    - *Assertion*: Volumes mount correctly and tests execute without syntax errors.

---

#### Tier 3: Cross-Feature Combinations (3 tests total)

32. **`TC-T3-XC-01`: Task Execution across Container Re-creation (R1 + R2 + R3)**
    - *Description*: Verify task queue and volume state survive container rebuild/restart events.
    - *Action*: Drop a long-running task, immediately run `docker compose down && docker compose up -d`, and verify task state files.
    - *Assertion*: System restarts, identifies task interruption via config, and watcher restarts or handles the task.
33. **`TC-T3-XC-02`: Task Modifies Persistent Configuration (R2 + R3)**
    - *Description*: Verify task watcher execution updates persistent settings.
    - *Action*: Drop a task that modifies `./.gemini/config.json` from inside container.
    - *Assertion*: Configuration file updates on host, and changes affect subsequent tasks.
34. **`TC-T3-XC-03`: Code Scaffold and Hot Reload Integration (R1 + R2 + R3)**
    - *Description*: Verify complete round-trip developer lifecycle.
    - *Action*: Drop task to append content to `src/app/page.tsx`. Watcher executes `agy`, source files edit, dev server recompiles.
    - *Assertion*: Querying `http://localhost:3000` serves the newly compiled code content.

---

#### Tier 4: Real-World Application Scenarios (5 tests total)

35. **`TC-T4-RW-01`: Clean Bootstrap Developer Flow**
    - *Description*: Emulate first-time clone and start of development workspace.
    - *Action*: Start clean container, mount keys/configurations, and drop initial check tasks.
    - *Assertion*: Config files are generated, host sync completes, and agent is authenticated.
36. **`TC-T4-RW-02`: Multi-Stage Ticket Execution Pipeline**
    - *Description*: Emulate development of a feature ticket backlog.
    - *Action*: Drop three consecutive tasks: 1. Setup Zustand Store, 2. Create UI components, 3. Integrate in layout.
    - *Assertion*: Dev server remains running and successfully compiles code at each phase.
37. **`TC-T4-RW-03`: Network-Isolated Dependency Installation Failure**
    - *Description*: Emulate task needing internet access inside `CODE_ONLY` container.
    - *Action*: Drop task `npm install lodash`.
    - *Assertion*: Command fails due to network policy, error is logged, code state reverts, and container remains healthy.
38. **`TC-T4-RW-04`: Dev Server Code Syntax Self-Healing**
    - *Description*: Verify recovery when a task introduces a compile error.
    - *Action*: Drop task writing syntax errors to layout file, check dev server failure, drop fix task.
    - *Assertion*: Dev server successfully compiles and returns `200 OK` on next request.
39. **`TC-T4-RW-05`: Credentials Leak Prevention & Permission Protection**
    - *Description*: Ensure SSH and git configurations remain secure.
    - *Action*: Inspect `/home/node/.ssh` and `.gitconfig` file permissions.
    - *Assertion*: SSH files maintain strict `600` permissions (preventing key rejection), and `.gemini` configurations are added to `.gitignore`.

---

### C. Proposed Layout for Metadata Files

#### `TEST_INFRA.md` Proposed Layout

```markdown
# Test Infrastructure Specification

This document details the configuration, mock environment, and usage instructions for the Next.js Agentic Dev Container E2E test framework.

## 1. Test Architecture
Describes the runner orchestration flow, helper abstractions, and interaction boundaries.
- **Test Runner (`tests/e2e/runner.js`)**: Orchestrator that checks container state, imports test suites, and tracks results.
- **Utilities (`tests/e2e/utils.js`)**: Wrappers for Docker executions and file systems.
- **Tiers**: Categorized test suites mapped to `tier*.test.js`.

## 2. Fast-Failure Guard
Details on pre-flight checks. The runner executes `docker compose ps` and terminates immediately with exit code `1` if SUT is offline.

## 3. Mock & Verification Strategies
To support test development prior to app implementation, two modes are defined:
- **Host-level Mocking (`E2E_MOCK=true`)**: Stubs shell child processes inside `utils.js` and uses a virtual file directory, enabling instant test checks on host without Docker.
- **Container-level Mocking (Mock SUT)**: A lightweight dry-run compose file `tests/e2e/mock_sut/docker-compose.mock.yml` running mock bash scripts for `agy` and `watcher.sh` inside a minimal alpine container, validating mounts and folder boundaries.

## 4. Environment Variables
- `E2E_MOCK`: Set to `true` to run host-mocked suites (Default: `false`).
- `NEXT_PORT`: Next.js HTTP port (Default: `3000`).

## 5. Usage Reference
- Run all tests: `npm run test:e2e` or `node tests/e2e/runner.js`
- Run host mock: `E2E_MOCK=true node tests/e2e/runner.js`
- Run Mock SUT: `docker compose -f tests/e2e/mock_sut/docker-compose.mock.yml up -d && node tests/e2e/runner.js`
```

#### `TEST_READY.md` Proposed Layout

```markdown
# E2E Test Suite Readiness and Tracking

This document tracks the definition, implementation, and pass status of all designed E2E test cases.

## 1. Dashboard Summary
| Tier | Designed | Implemented | Passing |
| --- | --- | --- | --- |
| Tier 1: Feature Coverage | 15 | [TBD] | [TBD] |
| Tier 2: Boundary & Corner Cases | 16 | [TBD] | [TBD] |
| Tier 3: Cross-Feature Combinations | 3 | [TBD] | [TBD] |
| Tier 4: Real-World Scenarios | 5 | [TBD] | [TBD] |
| **Total** | **39** | **0/39** | **0/39** |

## 2. Test Verification Index

### Tier 1: Feature Coverage
- [ ] `TC-T1-ENV-01`: Container Lifecycle and Status (Status: Planned | Result: Pending)
- [ ] `TC-T1-ENV-02`: Node.js and NPM Environment (Status: Planned | Result: Pending)
- [ ] `TC-T1-ENV-03`: Antigravity CLI Availability (Status: Planned | Result: Pending)
... [List all Tier 1 cases]

### Tier 2: Boundary & Corner Cases
- [ ] `TC-T2-ENV-01`: Port 3000 Conflict Handling (Status: Planned | Result: Pending)
- [ ] `TC-T2-ENV-02`: Missing Environment Configuration (.env) (Status: Planned | Result: Pending)
... [List all Tier 2 cases]

### Tier 3: Cross-Feature Combinations
- [ ] `TC-T3-XC-01`: Task Execution across Container Re-creation (Status: Planned | Result: Pending)
... [List all Tier 3 cases]

### Tier 4: Real-World Application Scenarios
- [ ] `TC-T4-RW-01`: Clean Bootstrap Developer Flow (Status: Planned | Result: Pending)
... [List all Tier 4 cases]

## 3. Maintenance Guide
Guidelines on adding new cases, editing status flags, and linking code changes to verification results.
```

---

## 5. Verification Method
To verify this design before code is implemented:
1. Confirm files `runner.js` and `utils.js` parse the `E2E_MOCK=true` flag.
2. Run `E2E_MOCK=true node tests/e2e/runner.js` on host (after creation of stubs). The runner must load and complete all suites cleanly.
3. Turn off mock mode (`E2E_MOCK=false`) and stop target container. Run `node tests/e2e/runner.js`. The runner must terminate early with exit code 1, reporting that the SUT is offline.
