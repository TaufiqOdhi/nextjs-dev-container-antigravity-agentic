const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  E2E_MOCK,
  TASK_DIR,
  CONFIG_DIR,
  APP_DIR,
  isContainerRunning,
  execInContainer,
  writeHostFile,
  readHostFile,
  restartContainer
} = require('./utils');

// Helpers for polling
async function waitForLog(logName, maxMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const log = readHostFile(`logs/${logName}`);
    if (log) {
      return log;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout waiting for log ${logName}`);
}

async function waitForFileDelete(relPath, maxMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const content = readHostFile(relPath);
    if (content === null) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout waiting for deletion of ${relPath}`);
}

test('Tier 1: Feature Coverage (Adversarial Failure Injected)', async (t) => {

  // Feature 1: Docker Container Environment (R1)
  await t.test('TC-T1-ENV-01: Container Lifecycle and Status', () => {
    const running = isContainerRunning();
    assert.strictEqual(running, true, 'Container should be running');
  });

  await t.test('TC-T1-ENV-02: Node.js and NPM Environment', () => {
    const output = execInContainer('node --version && npm --version');
    assert.match(output, /v\d+\.\d+\.\d+/, 'Should output Node.js version');
    assert.match(output, /\d+\.\d+\.\d+/, 'Should output NPM version');
  });

  await t.test('TC-T1-ENV-03: Antigravity CLI Availability - ADVERSARIAL FAILURE INJECTED', () => {
    const output = execInContainer('agy --version');
    // Injecting deliberate failure: expecting v3.0.0 instead of v2.0.0
    assert.match(output, /Antigravity CLI v3\.0\.0/, 'Should output Antigravity CLI version v3.0.0 (Adversarial Check)');
  });
});
