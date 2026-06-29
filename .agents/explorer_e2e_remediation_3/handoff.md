# Handoff Report: E2E Test Suite Remediation Strategy

## 1. Observation
A detailed forensic review of the test suite and repository was performed. The following files, structures, and lines were examined:
1. **Broken Path Mapping**:
   - `tests/e2e/utils.js` (lines 83–87):
     ```javascript
     if (cmd.startsWith('cat ')) {
       const rel = cmd.slice(4).replace(/^\/app\//, '');
       const p = path.join(APP_DIR, rel);
       return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
     }
     ```
     When running `execInContainer('cat /home/node/.gemini/secret.json')` in mock mode, it joins `/home/node/.gemini/secret.json` with `APP_DIR` (resolving to `/mock_fs/app/home/node/.gemini/secret.json`) instead of `CONFIG_DIR` (resolving to `/mock_fs/.gemini/secret.json`). This breaks file lookup and returns `""`, which causes tests like `TC-T1-VOL-05` and `TC-T2-VOL-01` to fail.

2. **CPU Utilization Check Mismatch**:
   - `tests/e2e/utils.js` (line 34): `cpuUtilization: 0.1`
   - `tests/e2e/tier2_boundary_corner.test.js` (lines 116–119):
     ```javascript
     await t.test('TC-T2-WTC-03: Watcher Low-Resource Idle Behavior', () => {
       // Assert idle CPU remains low.
       assert.ok(mockStore.cpuUtilization < 0.05, 'CPU consumption should remain low when idle');
     });
     ```
     The mock idle CPU percent is hardcoded to `0.1` and never updated. This causes the assertion `0.1 < 0.05` to always fail in both mock and live modes.

3. **Target Docker Service Mismatch**:
   - `tests/e2e/utils.js` (lines 110, 152, 160, 168): References `nextjs-app` inside `docker compose` execution commands (e.g. `docker compose exec -T nextjs-app`).
   - `docker-compose.yml` (line 4): Defines the production service as `nextjs-dev-container`.
   - `tests/e2e/mock_sut/docker-compose.mock.yml` (line 4): Defines the mock service as `nextjs-app`.
   This mismatch causes compose command execution errors when running in live mode against the production compose file.

4. **Symlink Follow Vulnerability**:
   - `tests/e2e/utils.js` (lines 180–185):
     ```javascript
     const files = fs.readdirSync(TASK_DIR);
     for (const file of files) {
       if (file === 'logs' || file === 'archive') continue;
       const filePath = path.join(TASK_DIR, file);
       const stat = fs.statSync(filePath);
       if (!stat.isFile()) continue;
     ```
     `fs.statSync()` resolves symbolic links to their target files. If a symlink points to an external file (e.g. `/etc/passwd`), `stat.isFile()` is `true`, causing the watcher to read it.
   - `tests/e2e/mock_sut/mock_watcher.sh` (lines 11–12):
     ```bash
     for file in $(find "$TASK_DIR" -maxdepth 1 -name "*.task" -o -name "*.md" 2>/dev/null); do
       if [ -f "$file" ]; then
     ```
     `[ -f "$file" ]` also follows symlinks in bash, allowing execution of symlink tasks pointing to external directories/files. This breaks `TC-T2-VOL-04` by executing `etc_pass.task` and creating `etc_pass.log` instead of ignoring it.

5. **Facade Test Cases**:
   - `tests/e2e/tier2_boundary_corner.test.js`:
     - `TC-T2-ENV-02` (lines 46–50) asserts local variable mutation.
     - `TC-T2-ENV-03` (lines 52–60) asserts `assert.ok(true)` directly in both mock and live modes.
     - `TC-T2-ENV-04` (lines 62–71) simulates Dev Server crash and recovery purely using mock store state variables and timeouts.
     - `TC-T2-VOL-05` (lines 258–261) executes no logic, asserting `assert.ok(true)`.

6. **Fabricated Results**:
   - `TEST_READY.md` (lines 8–12, 41): Claims that the test cases are fully implemented and passing (39/39 passing status). Since the suite fails due to path resolution, hardcoded CPU limit, and symlink execution, this dashboard is fabricated.

---

## 2. Logic Chain
1. **Broken Path Mapping**:
   The E2E test writes mock configurations to `CONFIG_DIR` (host folder mapped to `.gemini`), but queries them inside the container using `/home/node/.gemini` or `/app/.gemini`. In mock mode, the test framework simulates the container file system by routing file operations. Since `cat` queries are relative to `APP_DIR` instead of checking for `.gemini` paths, it tries to read the files from `mock_fs/app/...` instead of `mock_fs/.gemini/...`. A check must be added to route paths referencing `.gemini` to `CONFIG_DIR`.

2. **CPU Utilization Check**:
   Under idle conditions, a watcher process should occupy near-zero resources. The mock database initializes `cpuUtilization` to `0.1` (10%), which mathematically breaks the `< 0.05` constraint. Adjusting the mock initialization value to `< 0.05` (e.g. `0.02`) resolves the mock test failure. For live mode, checking static mock stores is a facade. Real CPU utilization should be fetched dynamically using process status querying inside the container (e.g., standard `ps` or parsing `/proc`).

3. **Target Docker Service Mismatch**:
   Docker Compose uses the service name declared in `docker-compose.yml` to target commands. The production Compose service is named `nextjs-dev-container`, while the mock Compose service is named `nextjs-app`. By updating `utils.js` to target the actual production service (`nextjs-dev-container`) and modifying the mock Compose file to match, we guarantee command compatibility.

4. **Symlink Follow Vulnerability**:
   `fs.statSync` and bash `[ -f ]` automatically resolve symbolic links. A malicious task dropping a symlink targeting files outside `/app/tasks` (like `/etc/passwd`) will be followed and processed. Replacing `fs.statSync` with `fs.lstatSync` and checking `stat.isSymbolicLink()` stops symlink resolution on the host. Adding `[ -L "$file" ]` checks in the shell script prevents container-side symlink evaluation.

5. **Facade Tests**:
   - `TC-T2-ENV-02`: Real environment checks must inspect environment variables (like `NODE_ENV`) to ensure default values are used when `.env` is absent.
   - `TC-T2-ENV-03`: Real resource testing should parse the docker compose files or inspect docker settings via `docker inspect` to verify memory/CPU caps are configured, or verify Node's `--max-old-space-size` restrictions.
   - `TC-T2-ENV-04`: Real server recovery testing requires abruptly terminating the server (e.g. container stop or process kill), verifying the health port (3000) goes down, triggering container start/restart, and confirming recovery (returning HTTP 200).
   - `TC-T2-VOL-05`: Real special character testing requires dropping a task file with special characters in its name (e.g., `t@s#k$%^&*( )_+.task`), confirming that the watcher correctly reads, executes, deletes the task file, and generates a corresponding log file.

6. **Fabricated Results**:
   Once the above fixes are applied, the test runner will execute successfully without errors on host mock and container modes. This will validate the 39/39 passing claims in `TEST_READY.md`.

---

## 3. Caveats
- Since command execution was blocked by interactive terminal timeouts in previous runs, local execution of `docker compose` could not be ran in this Explorer phase.
- We assume that the user's Docker environment supports `docker compose exec -T`.
- The live container tests assume the default Docker host network setup does not block standard port queries on `localhost:3000`.

---

## 4. Conclusion
To remediate the E2E test suite integrity issues, the following fixes are recommended:
1. **Update Path Resolution**: Update the `cat` helper in `tests/e2e/utils.js` to intercept paths starting with `/home/node/.gemini/` or `/app/.gemini/` and map them to `CONFIG_DIR`.
2. **Align CPU Utilization Checks**: Change `cpuUtilization` in `utils.js` mock store to `0.02`. In the test assertion, query the actual process CPU usage if `E2E_MOCK` is false.
3. **Align Service Names**: Rename `nextjs-app` to `nextjs-dev-container` in both `tests/e2e/utils.js` and `tests/e2e/mock_sut/docker-compose.mock.yml`.
4. **Implement Symlink Protections**:
   - In `utils.js` (host mock watcher): Use `fs.lstatSync` and skip if `stat.isSymbolicLink()` is true.
   - In `mock_watcher.sh` (container mock watcher): Add `if [ -L "$file" ]; then continue; fi` and wrap find target patterns in parentheses.
5. **Implement Real Testing Logic for Facades**:
   - `TC-T2-ENV-02`: Run container command `env` and verify `NODE_ENV` fallback configurations.
   - `TC-T2-ENV-03`: Inspect container config or compose schema to assert CPU/memory constraints.
   - `TC-T2-ENV-04`: Kill container/dev server, assert port 3000 is unreachable, start container/dev server, and assert port 3000 returns HTTP 200.
   - `TC-T2-VOL-05`: Create a file with special characters in its name, wait for processing, and assert log creation and correctness.
6. **Publish Correct Status**: Execute tests to verify 39/39 pass legitimately.

---

## 5. Verification Method
1. **Inspect Code Files**:
   - Check `tests/e2e/utils.js` to verify path mapping for `cat ` checks.
   - Check `tests/e2e/tier2_boundary_corner.test.js` to verify the CPU assertion, symlink check, and real facade implementations.
   - Check `tests/e2e/mock_sut/mock_watcher.sh` to verify `[ -L ]` checks.
2. **Run E2E Suite in Mock Mode**:
   ```bash
   E2E_MOCK=true node tests/e2e/runner.js
   ```
   *Expected Outcome*: All 39 test cases compile and run on the host, passing with exit code `0`.
3. **Run E2E Suite in Live Mode**:
   Ensure Docker is running and spin up the environment, then run:
   ```bash
   docker compose -f tests/e2e/mock_sut/docker-compose.mock.yml up -d
   E2E_MOCK=false node tests/e2e/runner.js
   ```
   *Expected Outcome*: All 39 tests successfully interact with the container and return a green test report.
