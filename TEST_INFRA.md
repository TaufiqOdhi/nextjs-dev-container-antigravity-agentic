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
- Run all tests: `node tests/e2e/runner.js`
- Run host mock: `E2E_MOCK=true node tests/e2e/runner.js`
- Run Mock SUT: `docker compose -f tests/e2e/mock_sut/docker-compose.mock.yml up -d && E2E_MOCK=false node tests/e2e/runner.js`
