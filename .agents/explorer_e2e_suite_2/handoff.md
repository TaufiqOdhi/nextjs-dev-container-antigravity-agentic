# Handoff Report: E2E Test Suite Design

## 1. Observation
We analyzed the following files in the project workspace:
- `/home/hafida/Projects/personal/nextjs-dev-container-antigravity-agentic/ORIGINAL_REQUEST.md` (lines 17–30):
  > "R1. Container Environment & Tech Stack: Provide a standard `docker-compose.yml` and `Dockerfile` ... Next.js (App Router), Tailwind CSS & shadcn/ui, Zustand, SWR"
  > "R2. Task Watcher Integration: Implement a watcher script ... polls external task sources and triggers the Antigravity CLI"
  > "R3. Persistent State via Volume Mounts: Configure the `docker-compose.yml` to use volume mounts that persist the source code, git credentials, and the Antigravity configuration."
- `/home/hafida/Projects/personal/nextjs-dev-container-antigravity-agentic/PROJECT.md` (lines 10–23):
  > Outline of code layout including `docker-compose.yml`, `Dockerfile`, `watcher/`, `app/`, and `tests/e2e/` (where tests are grouped by tier).
- `/home/hafida/Projects/personal/nextjs-dev-container-antigravity-agentic/.agents/sub_orch_e2e/SCOPE.md` (lines 4–12):
  > Details of the standalone Node.js-based test suite: `tests/e2e/runner.js`, `tests/e2e/utils.js`, and the 4 tier files (`tier1_feature_coverage.test.js`, etc.).
- Direct listing of project root: Only `.agents`, `ORIGINAL_REQUEST.md`, and `PROJECT.md` exist. There are no implementation files, Dockerfiles, or tests in the codebase yet.

---

## 2. Logic Chain
Since the container and source code are not yet implemented, a standard E2E test run would immediately fail due to the absence of the Docker environment. To bridge this gap and allow the development of tests in parallel with implementation:
1. We design a **Custom Node.js Test Runner** (`tests/e2e/runner.js`) with a pre-flight validation mechanism that verifies container existence using shell commands (`docker compose ps`).
2. We establish a **Mock Mode** (`E2E_MOCK=true`) inside the test helper utilities (`tests/e2e/utils.js`). In this mode, instead of executing actual Docker commands, the utility functions intercept calls and interact with a virtual filesystem or mock state.
3. This allows the test suite to execute successfully and verify its assertion logic (a green run in mock mode) even before the Docker container is built. Once the container is implemented, turning off mock mode will execute actual Docker integration tests, which will fail if the container is down or misconfigured.
4. We outline a comprehensive 4-tier test plan targeting feature coverage, boundary/corner conditions, cross-feature integrations, and real-world developer workflows.
5. We propose structural layouts for `TEST_INFRA.md` (infrastructure docs) and `TEST_READY.md` (testing dashboard/checklist).

---

## 3. Caveats
- **Mock Fidelity**: The mock mode is a simulation. Passing in mock mode does not guarantee that the real container works. Real validation requires `E2E_MOCK=false`.
- **Container Port Config**: Port 3000 is assumed for the Next.js dev server. If host port 3000 is occupied, the docker-compose or runner must support dynamic port mapping.
- **Node.js Environment**: The E2E test runner itself is executed on the host, which must have Node.js installed.

---

## 4. Conclusion

### A. Test Runner Structure Design

The testing structure consists of three main files under `tests/e2e/`:
- `runner.js` (Test Orchestrator)
- `utils.js` (Docker and Filesystem wrappers)
- `tier*.test.js` (Test definition suites)

#### `tests/e2e/runner.js`
The runner performs environment checks, loads test suites, executes them sequentially, and outputs JSON/text reports.

```javascript
// tests/e2e/runner.js
const fs = require('fs');
const path = require('path');
const { checkContainerStatus, setMockMode } = require('./utils');

const MOCK_MODE = process.env.E2E_MOCK === 'true';

async function runSuite() {
  console.log(`=== Starting E2E Test Suite (Mock Mode: ${MOCK_MODE}) ===`);

  if (MOCK_MODE) {
    setMockMode(true);
  } else {
    // Fail early if container is not running
    const containerRunning = await checkContainerStatus();
    if (!containerRunning) {
      console.error("\x1b[31mError: Dev container 'nextjs-dev-container' is not running.\x1b[0m");
      console.error("Please run 'docker compose up -d' before executing E2E tests.");
      process.exit(1);
    }
  }

  // Discover and run test files
  const testFiles = [
    'tier1_feature_coverage.test.js',
    'tier2_boundary_corner.test.js',
    'tier3_cross_feature.test.js',
    'tier4_real_world.test.js'
  ];

  let total = 0;
  let passed = 0;
  let failed = 0;
  const results = [];

  for (const file of testFiles) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) continue;

    console.log(`\nRunning Suite: ${file}`);
    const suite = require(filePath);
    
    for (const [testName, testFn] of Object.entries(suite)) {
      total++;
      try {
        await testFn();
        console.log(`  ✓ ${testName}`);
        passed++;
        results.push({ name: `${file}::${testName}`, status: 'passed' });
      } catch (err) {
        console.error(`  ✗ ${testName}`);
        console.error(`    Reason: ${err.message}`);
        failed++;
        results.push({ name: `${file}::${testName}`, status: 'failed', error: err.message });
      }
    }
  }

  console.log(`\n=== E2E Test Summary ===`);
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  
  // Write report
  const reportPath = path.join(__dirname, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify({ total, passed, failed, results }, null, 2));

  process.exit(failed > 0 ? 1 : 0);
}

runSuite().catch(err => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
```

#### `tests/e2e/utils.js`
This file implements the abstraction layer. If `E2E_MOCK=true`, it simulates file writes/reads and returns canned outputs for commands.

```javascript
// tests/e2e/utils.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let mockMode = false;
const mockStore = {
  containerRunning: true,
  files: {},
  commandOutputs: {
    'agy --version': 'agy version 2.0.1 (mocked)',
    'node --version': 'v20.11.0',
    'curl -I http://localhost:3000': 'HTTP/1.1 200 OK\nContent-Type: text/html'
  }
};

function setMockMode(value) {
  mockMode = value;
}

async function checkContainerStatus() {
  if (mockMode) return mockStore.containerRunning;
  try {
    const out = execSync('docker compose ps nextjs-dev-container --format json', { stdio: 'pipe' }).toString();
    const parsed = JSON.parse(out);
    return parsed.length > 0 && parsed[0].State === 'running';
  } catch {
    // If json format is not supported by older docker versions
    try {
      const out = execSync('docker compose ps nextjs-dev-container', { stdio: 'pipe' }).toString();
      return out.includes('running') || out.includes('Up');
    } catch {
      return false;
    }
  }
}

async function execDocker(command) {
  if (mockMode) {
    if (mockStore.commandOutputs[command]) {
      return mockStore.commandOutputs[command];
    }
    // Simulate watcher response for executing task
    if (command.startsWith('agy --execute')) {
      const taskPath = command.split(' ')[2];
      const taskName = path.basename(taskPath);
      // Generate mock log
      const logContent = `[Mock agy] Started task processing\n[Mock agy] Read inputs from ${taskName}\n[Mock agy] Done.`;
      writeTaskLog(taskName.replace(/\.(task|md)$/, '.log'), logContent);
      return 'Task execution triggered successfully';
    }
    return '';
  }

  const execCmd = `docker compose exec -t nextjs-dev-container ${command}`;
  return execSync(execCmd, { encoding: 'utf-8' });
}

function writeTaskFile(filename, content) {
  if (mockMode) {
    mockStore.files[filename] = content;
    // Simulate Watcher auto-trigger in mock mode by immediately generating log if watcher is "simulated"
    setTimeout(() => {
      execDocker(`agy --execute /app/tasks/${filename}`);
    }, 50);
    return;
  }
  const taskDir = path.join(__dirname, '../../tasks');
  if (!fs.existsSync(taskDir)) fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, filename), content);
}

function readTaskLog(filename) {
  if (mockMode) {
    return mockStore.files[`logs/${filename}`] || null;
  }
  const logPath = path.join(__dirname, '../../tasks/logs', filename);
  return fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf-8') : null;
}

function writeTaskLog(filename, content) {
  if (mockMode) {
    mockStore.files[`logs/${filename}`] = content;
    return;
  }
  const logDir = path.join(__dirname, '../../tasks/logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(logDir, filename), content);
}

function cleanupTasks() {
  if (mockMode) {
    mockStore.files = {};
    return;
  }
  const taskDir = path.join(__dirname, '../../tasks');
  if (fs.existsSync(taskDir)) {
    fs.rmSync(taskDir, { recursive: true, force: true });
  }
}

module.exports = {
  setMockMode,
  checkContainerStatus,
  execDocker,
  writeTaskFile,
  readTaskLog,
  cleanupTasks
};
```

---

### B. Detailed Test Cases Outline

#### Tier 1: Feature Coverage (15 tests total)

##### Feature 1: Docker Container Environment (R1)
1. **test_container_is_running**: Query docker compose status. Assertion: Container `nextjs-dev-container` status must be `running`.
2. **test_nodejs_version**: Run `node --version` inside the container. Assertion: Must output `v18.*` or `v20.*` or higher.
3. **test_antigravity_cli_installed**: Run `agy --version` inside the container. Assertion: Output must contain `agy` and a version number (no command-not-found error).
4. **test_nextjs_structure**: Run a check on files inside `/app`. Assertion: File layout contains `package.json`, `tailwind.config.js`, and `src/app/page.tsx` (or `.js`).
5. **test_nextjs_dev_server_responds**: Exec `curl -I http://localhost:3000` inside the container. Assertion: Status header returned must contain `HTTP/1.1 200 OK` (meaning Next.js dev server is up).

##### Feature 2: Task Watcher (R2)
6. **test_watcher_process_active**: Run `ps aux` or equivalent inside the container. Assertion: A process named `watcher.sh` or `watcher.js` must be running.
7. **test_watcher_detects_task_file**: Write `test-1.task` containing "test instruction" to `./tasks`. Assertion: Watcher processes it and creates `./tasks/logs/test-1.log` within 5 seconds.
8. **test_watcher_detects_markdown_file**: Write `test-2.md` to `./tasks`. Assertion: Watcher processes it and creates `./tasks/logs/test-2.log`.
9. **test_watcher_archives_processed_tasks**: Write a task file `task-archive.task`. Wait for execution. Assertion: The file `task-archive.task` is either moved to `./tasks/processed/` or deleted, preventing duplicate runs.
10. **test_watcher_log_content_integrity**: Write a task file. Check the contents of the generated `.log` file. Assertion: The log contains standard logs showing `agy` invocation details and execution lifecycle.

##### Feature 3: Volume Persistence (R3)
11. **test_source_code_sync**: Write a temporary file `host-test.txt` inside host's `./src/` folder. Assertion: The file is immediately readable inside the container at `/app/src/host-test.txt`.
12. **test_gitconfig_mapping**: Run `cat /home/node/.gitconfig` inside container. Assertion: Content must match the host's `~/.gitconfig` content.
13. **test_antigravity_config_persistence**: Exec a file creation at `/home/node/.gemini/persisted-config.json` inside container. Assertion: The file `./.gemini/persisted-config.json` appears on the host with identical content.
14. **test_persistence_across_restart**: Create `./.gemini/secret.key` on host, restart container (`docker compose restart`), and read the path inside container. Assertion: File remains present and matches original key.
15. **test_task_logs_persistence**: Write a task inside container tasks folder and verify log is generated. Assertion: Log file is immediately readable on host at `./tasks/logs/*.log`.

---

#### Tier 2: Boundary & Corner Cases (15 tests total)

##### Feature 1: Docker Container Environment (R1) Boundary Cases
1. **test_port_conflict_handling**: Start the test runner when port 3000 is occupied on the host. Assertion: Runner flags port usage and provides clean error instructions or uses override environment configurations.
2. **test_container_resource_exhaustion**: Run a stress-test task that consumes CPU/memory. Assertion: Container handles the load up to its defined compose limits without crashing the host docker daemon.
3. **test_abrupt_shutdown_recovery**: Kill the container while writing a task. Start container again. Assertion: Dev server and watcher restart cleanly without stale lockfiles preventing startup.
4. **test_missing_config_directory**: Delete host's `./.gemini` directory and start container. Assertion: Compose configuration creates it, and runner detects/handles it safely.
5. **test_user_permission_compatibility**: Write a file to `./.gemini` on host using a different user, and verify container `node` user (UID 1000) can read/write to it. Assertion: No `EACCES` or permission errors.

##### Feature 2: Task Watcher (R2) Boundary Cases
6. **test_empty_task_file**: Drop `empty.task` with 0 bytes size. Assertion: Watcher ignores it or logs a warning in `./tasks/logs/empty.log` but does not crash.
7. **test_invalid_task_format**: Write a binary file named `bad.task` to `./tasks`. Assertion: Watcher logs an invalid format error and safely skips it.
8. **test_idle_resource_utilization**: Let watcher run for 10 seconds without tasks. Assertion: Watcher CPU utilization is near-zero (does not hog CPU in a busy loop).
9. **test_large_task_file**: Drop a 50MB task file containing repetitive text. Assertion: Watcher reads file stream without crashing with Node.js Out Of Memory error.
10. **test_concurrent_task_drops**: Simultaneously drop 10 files (`task-1.task` to `task-10.task`) into `./tasks`. Assertion: All 10 tasks are processed sequentially or in an ordered queue without dropping events.

##### Feature 3: Volume Persistence (R3) Boundary Cases
11. **test_symlink_safety**: Create a host symlink in `./tasks` pointing to `/etc/passwd`. Assertion: Watcher rejects parsing/executing symlinked files targeting directories outside the mount scope.
12. **test_filename_special_characters**: Create `t@s#k$%^&*( )_+.task`. Assertion: Watcher successfully triggers `agy` and logs output without shell escaping syntax errors.
13. **test_deeply_nested_paths**: Create directory path with depth of 15 subfolders under `./.gemini/`. Assertion: Read/write operations succeed in both host and container.
14. **test_read_only_fs_error_handling**: Simulate a host filesystem write lock on `./.gemini`. Assertion: Watcher/CLI returns clean exits and logs descriptive error messages.
15. **test_corrupted_config_recovery**: Write random binary data to `./.gemini/config.json`. Assertion: Running `agy` inside container handles corruption by falling back to defaults or prompting for repair, instead of failing silently.

---

#### Tier 3: Cross-Feature Combinations (3 tests total)

1. **test_task_trigger_during_restart (R2 + R1)**: Drop a task file, and immediately execute `docker compose restart`. Assertion: Once container starts, watcher picks up the pending task and completes it cleanly.
2. **test_task_modifies_gemini_config (R2 + R3)**: Drop a task that edits Antigravity configurations inside container `/home/node/.gemini`. Assertion: Task runs, config is modified, and the change is immediately verified on the host `./.gemini/config.json`.
3. **test_watcher_scaffold_triggers_dev_recompilation (R1 + R2 + R3)**: Drop a task that appends a component to `src/app/page.tsx`. Assertion: Task watcher executes task -> page is edited -> host directory syncs -> Next.js server compiles -> `curl http://localhost:3000` returns updated page content.

---

#### Tier 4: Real-World Application Scenarios (5 tests total)

1. **scenario_scaffold_tailwind_ui**: Drop task to build a React state counter component using Tailwind CSS classes. Assertion: File generated at `src/components/Counter.tsx`, Next.js compiles it, and page loads without styling or compiling errors.
2. **scenario_zustand_store_integration**: Drop task to initialize a Zustand user session store. Assertion: Store file is generated, imported in a layout page, state is initializable and passes compilation checks.
3. **scenario_swr_fetcher_integration**: Drop task to implement a user fetch hook via SWR targeting a placeholder API. Assertion: SWR hook matches standard patterns, page compiles and server loads component correctly.
4. **scenario_git_clone_and_commit**: Drop task instructing the container agent to initialize a new git repository inside `/app/temp-repo`, make a commit using the mounted ssh-agent and `.gitconfig`. Assertion: Git log shows commit made with the correct host git credentials.
5. **scenario_syntax_error_self_repair_loop**: Write a broken React component with a syntax error (`src/components/Broken.tsx`), triggering dev server compile failure. Drop a task containing the fix instructions. Assertion: Watcher triggers `agy`, `agy` resolves error, Next.js successfully compiles, and server recovers health status.

---

### C. Proposed File Layouts

#### `TEST_INFRA.md` Layout

```markdown
# Test Infrastructure Specification

This document details the configuration, implementation, and environment settings of the E2E test suite for the Next.js Agentic Dev Container.

## Directory Structure
- `tests/e2e/runner.js` - Standalone E2E Test Runner orchestrator.
- `tests/e2e/utils.js` - High-level abstractions for docker operations and host/container file systems.
- `tests/e2e/tier1_feature_coverage.test.js` - Basic requirement tests.
- `tests/e2e/tier2_boundary_corner.test.js` - Boundary and corner case validations.
- `tests/e2e/tier3_cross_feature.test.js` - Combined feature scenarios.
- `tests/e2e/tier4_real_world.test.js` - Practical developer workflows.

## Environment Variables
- `E2E_MOCK`: Set to `true` to run tests in mock dry-run mode (does not require Docker). Defaults to `false`.
- `NEXT_PORT`: The host port mapped to Next.js dev server. Defaults to `3000`.

## Test Lifecycle
1. **Pre-flight**: Validate if the container `nextjs-dev-container` is active. If not active and `E2E_MOCK` is false, abort.
2. **Discovery**: Load all `tier*.test.js` files.
3. **Execution**: Run all tests sequentially to prevent cross-test file-system state collisions.
4. **Cleanup**: Execute global `cleanupTasks()` after test suite finishes.

## Mock Mode Operations
Describes how mock mode handles commands and folder accesses (as defined in `tests/e2e/utils.js`).
```

#### `TEST_READY.md` Layout

```markdown
# E2E Test Suite Readiness Dashboard

This dashboard shows the current design, implementation, and execution status of the E2E test suite.

## Execution Matrix
| Run Mode | Total Designed | Implemented | Status |
|----------|----------------|-------------|--------|
| Mock Run | 38             | [TBD]/38    | PENDING|
| Real Run | 38             | [TBD]/38    | PENDING|

## Detailed Tests Status

### Tier 1: Feature Coverage
- [ ] test_container_is_running (R1)
- [ ] test_nodejs_version (R1)
- [ ] test_antigravity_cli_installed (R1)
- [ ] test_nextjs_structure (R1)
- [ ] test_nextjs_dev_server_responds (R1)
- [ ] test_watcher_process_active (R2)
- [ ] test_watcher_detects_task_file (R2)
- [ ] test_watcher_detects_markdown_file (R2)
- [ ] test_watcher_archives_processed_tasks (R2)
- [ ] test_watcher_log_content_integrity (R2)
- [ ] test_source_code_sync (R3)
- [ ] test_gitconfig_mapping (R3)
- [ ] test_antigravity_config_persistence (R3)
- [ ] test_persistence_across_restart (R3)
- [ ] test_task_logs_persistence (R3)

### Tier 2: Boundary & Corner Cases
- [ ] test_port_conflict_handling
- [ ] test_container_resource_exhaustion
... [List all 15 cases]

### Tier 3: Cross-Feature Combinations
- [ ] test_task_trigger_during_restart
- [ ] test_task_modifies_gemini_config
- [ ] test_watcher_scaffold_triggers_dev_recompilation

### Tier 4: Real-World Application Scenarios
- [ ] scenario_scaffold_tailwind_ui
- [ ] scenario_zustand_store_integration
- [ ] scenario_swr_fetcher_integration
- [ ] scenario_git_clone_and_commit
- [ ] scenario_syntax_error_self_repair_loop

## Verification Instructions
Commands to run to verify the suite:
- `E2E_MOCK=true node tests/e2e/runner.js` (Verify runner code)
- `node tests/e2e/runner.js` (Verify real environment)
```

---

## 5. Verification Method
To verify the design without writing project source code or running actual container tasks:
1. Re-run the test runner logic locally using our mock javascript snippet definition.
2. Verify that `E2E_MOCK=true` correctly simulates environment checks and file-handling assertions.
3. Once implementation files are created by implementation agents, run `node tests/e2e/runner.js` with container down. It must fail early at the pre-flight check.
4. Bring container up using `docker compose up -d`, and run `node tests/e2e/runner.js` again. It should proceed to run real tests and assert features.
