# Handoff Report: E2E Test Suite Adversarial Challenge and Review

## Observation

1. **SUT Service Name Inconsistency**:
   - In `tests/e2e/utils.js`:
     - Line 110: `return execSync(\`docker compose exec -T nextjs-app \${cmd}\`, { encoding: 'utf-8', cwd: PROJECT_ROOT }).trim();`
     - Line 152: `execSync('docker compose restart nextjs-app', { cwd: PROJECT_ROOT });`
     - Line 160: `execSync('docker compose stop nextjs-app', { cwd: PROJECT_ROOT });`
     - Line 168: `execSync('docker compose start nextjs-app', { cwd: PROJECT_ROOT });`
   - In root `docker-compose.yml`:
     - Line 4: `nextjs-dev-container:` (This is the service name of the SUT).
   - In `tests/e2e/mock_sut/docker-compose.mock.yml`:
     - Line 4: `nextjs-app:` (This is the service name of the Mock SUT).

2. **Docker Compose Project Isolation**:
   - In `tests/e2e/utils.js`:
     - Line 53: `const rawPs = execSync('docker compose ps', { encoding: 'utf-8', cwd: PROJECT_ROOT });`

3. **CPU Utilization Assertion Bug**:
   - In `tests/e2e/utils.js`:
     - Line 34: `cpuUtilization: 0.1, // simulated idle CPU %`
   - In `tests/e2e/tier2_boundary_corner.test.js`:
     - Lines 116–119:
       ```javascript
       await t.test('TC-T2-WTC-03: Watcher Low-Resource Idle Behavior', () => {
         // Assert idle CPU remains low.
         assert.ok(mockStore.cpuUtilization < 0.05, 'CPU consumption should remain low when idle');
       });
       ```

4. **Credential Mapping Path Resolution Bug**:
   - In `tests/e2e/tier4_real_world.test.js`:
     - Line 33: `const hostGitconfig = E2E_MOCK ? path.join(APP_DIR, 'mock_fs/home/node/.gitconfig') : path.join(process.env.HOME, '.gitconfig');`
     - The actual path to mock gitconfig is created at `tests/e2e/mock_fs/home/node/.gitconfig`.
     - Lines 31-36 show no assertions are run against the resolved `hostGitconfig` variable.

5. **Command Permission Timeouts**:
   - Attempted execution of E2E test commands (e.g. `E2E_MOCK=true node tests/e2e/runner.js` and `pwd`) resulted in:
     `Encountered error in step execution: Permission prompt for action 'command' on target '...' timed out waiting for user response. The user was not able to provide permission on time.`

---

## Logic Chain

1. **Docker Service/Project Name Incompatibility**:
   - `utils.js` targets `nextjs-app` as the service name in all live docker operations (Observation 1).
   - When running against the real SUT (`E2E_MOCK=false`), `utils.js` executes `docker compose exec -T nextjs-app` in the root workspace folder, where the default compose file defines the service name as `nextjs-dev-container` (Observation 1).
   - This results in a docker compose error (`No such service: nextjs-app`), causing all E2E test commands executing in the container to fail in live mode.
   - Furthermore, `isContainerRunning()` executes `docker compose ps` in the project root without specifying the mock compose file (Observation 2). Because the mock SUT runs under a different compose file, it resides in a separate compose project (`mock_sut`). Root-level `docker compose ps` checks the default project and cannot find this container, returning an empty list.
   - Thus, the pre-flight check in `runner.js` fails, and the runner terminates with exit code 1 immediately even if the Mock SUT container is running.

2. **Host-Mock Mode CPU Assertion Failure**:
   - Under `E2E_MOCK=true`, the code relies on hardcoded variables in `mockStore`.
   - `cpuUtilization` is set to `0.1` (Observation 3).
   - The test `TC-T2-WTC-03` asserts that `cpuUtilization < 0.05` (Observation 3).
   - Because `0.1 < 0.05` evaluates to `false`, the assertion throws an error.
   - The runner detects this test failure and exits with code 1. Thus, the E2E suite under `E2E_MOCK=true` cannot pass successfully in its current form.

3. **Silent Credential Verification Gap**:
   - `tier4_real_world.test.js` resolves the host gitconfig path under `APP_DIR`, which evaluates to `tests/e2e/mock_fs/app/mock_fs/home/node/.gitconfig`. This is incorrect as the mock file is located at `tests/e2e/mock_fs/home/node/.gitconfig` (Observation 4).
   - Because there is no assertion checking the existence of `hostGitconfig`, the test passes silently, missing the verification of git credentials persistence.

---

## Caveats

- **Command Block/Timeout**: Since the execution environment blocked shell commands due to permission timeouts (Observation 5), we could not run physical container builds or executions.
- **Timing Dependencies**: In-progress file locking test `TC-T2-WTC-06` relies on write/sleep intervals (< 250ms). If write delays exceed 250ms, the watcher will process the file pre-maturely, which could result in intermittent test failures on slow systems.

---

## Conclusion

The E2E test suite in its current state is **broken** and **cannot pass** in either mock mode (`E2E_MOCK=true`) or live mode (`E2E_MOCK=false`). 
1. Under `E2E_MOCK=true`, it will consistently fail at `TC-T2-WTC-03` due to the CPU utilization assertion mismatch.
2. Under `E2E_MOCK=false`, it will fail the pre-flight check immediately due to project isolation when running the Mock SUT, and if bypassed, it will fail to target the correct service name (`nextjs-app` vs `nextjs-dev-container`).
3. Credential mapping checks have path resolution errors and missing assertions.

**Recommendation**: Block the verification milestone until these bugs are fixed.

---

## Adversarial Challenge Report

**Overall risk assessment**: CRITICAL

### Challenges

#### [Critical] Challenge 1: Docker Compose Service Mismatch
- **Assumption challenged**: The test suite assumes the container service name is identical across all testing profiles.
- **Attack scenario**: Executing tests in live mode against the SUT. `utils.js` attempts to run commands on `nextjs-app`. The real SUT's docker-compose.yml defines the service as `nextjs-dev-container`.
- **Blast radius**: Bypassing the mock mode causes all docker-based assertions to fail immediately with docker compose service lookup errors.
- **Mitigation**: Update `utils.js` to dynamically determine the service name or keep it consistent (e.g. `nextjs-dev-container`) across both compose files.

#### [Critical] Challenge 2: Docker Compose Project Separation
- **Assumption challenged**: The test runner assumes a default `docker compose ps` command in the root folder can query containers spun up by `tests/e2e/mock_sut/docker-compose.mock.yml`.
- **Attack scenario**: The Mock SUT is spun up using `docker compose -f tests/e2e/mock_sut/docker-compose.mock.yml up -d`. When the test runner is executed with `E2E_MOCK=false`, it calls `docker compose ps` in the root. Docker compose defaults to the root project name and cannot see the mock container (scoped to `mock_sut` project).
- **Blast radius**: The runner terminates immediately with exit code 1, reporting SUT offline, preventing any tests from running.
- **Mitigation**: Update `utils.js` `isContainerRunning()` to query the mock project container explicitly if mock SUT is used, or specify project name / compose file path.

#### [High] Challenge 3: CPU Utilization Assertion Mismatch
- **Assumption challenged**: The mock store configuration values match the assertions defined in the test suites.
- **Attack scenario**: Run `E2E_MOCK=true node tests/e2e/runner.js`. The test `TC-T2-WTC-03` fails because `mockStore.cpuUtilization` is `0.1`, which is not `< 0.05`.
- **Blast radius**: The test runner exits with code 1, rendering the entire mock suite unusable.
- **Mitigation**: Change `mockStore.cpuUtilization` to `0.01` in `utils.js`, or update the assertion limit to `< 0.20` in `tier2_boundary_corner.test.js`.

---

## Stress/Adversarial Test Results (Predicted/Analytical)

- **Scenario 1**: Run host mock mode `E2E_MOCK=true node tests/e2e/runner.js`
  - **Expected**: All tests pass.
  - **Actual**: Fails at `TC-T2-WTC-03` (AssertionError: `0.1 < 0.05` is false). Exits with code 1.
- **Scenario 2**: Run live mode with SUT offline `E2E_MOCK=false node tests/e2e/runner.js`
  - **Expected**: Exits with code 1, reporting SUT offline.
  - **Actual**: Exits with code 1, reporting SUT offline (Pass).
- **Scenario 3**: Spin up mock SUT (`docker compose -f tests/e2e/mock_sut/docker-compose.mock.yml up -d`) and run `E2E_MOCK=false node tests/e2e/runner.js`
  - **Expected**: Connects to SUT and passes all tests.
  - **Actual**: Exits with code 1 reporting SUT offline due to project name isolation in `docker compose ps`. (Fail).
- **Scenario 4 (Adversarial Version Check)**: Alter target version string to v3.x in `tier1_feature_coverage.test.js`
  - **Expected**: Test suite fails, runner returns exit code 1.
  - **Actual**: Test suite fails on `TC-T1-ENV-03`, runner sets `hasFailures = true` and exits with code 1. (Pass).
- **Scenario 5 (Adversarial Pre-flight bypass)**: Run pre-flight check unconditionally in `runner.js`
  - **Expected**: Runner fails immediately when SUT is offline even if `E2E_MOCK` is true.
  - **Actual**: `isContainerRunning` returns false (if real container is offline), runner exits with code 1. (Pass).

---

## Verification Method

To verify these findings independently once command execution permissions are resolved:

1. **Verify Host-Mock CPU Assertion Failure**:
   ```bash
   E2E_MOCK=true node tests/e2e/runner.js
   ```
   *Expected outcome*: Runner reports failure in `TC-T2-WTC-03` and exits with code 1.

2. **Verify Project Isolation/Offline Error**:
   ```bash
   docker compose -f tests/e2e/mock_sut/docker-compose.mock.yml up -d
   E2E_MOCK=false node tests/e2e/runner.js
   ```
   *Expected outcome*: Runner prints `[ERROR] System Under Test (SUT) container 'nextjs-dev-container' is offline` and exits with code 1, despite the container being active.

3. **Verify Service Name Failure (if pre-flight bypass is applied)**:
   Modify `isContainerRunning()` in `utils.js` to return `true` to bypass the offline check, then run:
   ```bash
   E2E_MOCK=false node tests/e2e/runner.js
   ```
   *Expected outcome*: Runner fails with `No such service: nextjs-app`.
