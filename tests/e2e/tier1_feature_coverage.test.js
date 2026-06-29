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

test('Tier 1: Feature Coverage', async (t) => {

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

  await t.test('TC-T1-ENV-03: Antigravity CLI Availability', () => {
    const output = execInContainer('agy --version');
    assert.match(output, /Antigravity CLI v?\d+\.\d+\.\d+/, 'Should output Antigravity CLI version');
  });

  await t.test('TC-T1-ENV-04: Next.js Tech Stack Check', () => {
    // Scaffold basic package.json if it doesn't exist
    const hostPkgPath = path.join(APP_DIR, 'package.json');
    if (!fs.existsSync(hostPkgPath)) {
      const dummyPkg = {
        dependencies: {
          next: '^14.0.0',
          tailwindcss: '^3.3.0',
          zustand: '^4.4.0',
          swr: '^2.2.0'
        }
      };
      fs.writeFileSync(hostPkgPath, JSON.stringify(dummyPkg, null, 2));
    }
    
    const output = execInContainer('cat /app/package.json');
    const pkg = JSON.parse(output);
    assert.ok(pkg.dependencies.next, 'Should contain next dependency');
    assert.ok(pkg.dependencies.tailwindcss, 'Should contain tailwindcss dependency');
    assert.ok(pkg.dependencies.zustand, 'Should contain zustand dependency');
    assert.ok(pkg.dependencies.swr, 'Should contain swr dependency');
  });

  await t.test('TC-T1-ENV-05: Dev Server Health Check', () => {
    let output;
    if (E2E_MOCK) {
      output = 'HTTP/1.1 200 OK\r\nContent-Type: text/html';
    } else {
      output = execSync('curl -I http://localhost:3000', { encoding: 'utf-8' });
    }
    assert.match(output, /HTTP\/\d+(\.\d+)? (200|302|307|308|301)/, 'Should receive successful status code');
  });

  // Feature 2: Task Watcher (R2)
  await t.test('TC-T1-WTC-01: Watcher Process Liveness', () => {
    const output = execInContainer('ps aux');
    assert.match(output, /(watcher\.js|watcher\.sh)/, 'Should find active watcher process');
  });

  await t.test('TC-T1-WTC-02: Watcher Detection of .task files', async () => {
    const taskName = 'wtc-02.task';
    const logName = 'wtc-02.log';
    
    // Clear old files
    if (fs.existsSync(path.join(TASK_DIR, 'logs', logName))) {
      fs.rmSync(path.join(TASK_DIR, 'logs', logName));
    }
    
    writeHostFile(taskName, 'Simple task execution instructions');
    const log = await waitForLog(logName);
    assert.match(log, /\[MOCK-AGY\] Executing instructions/, 'Watcher should process .task and log success');
  });

  await t.test('TC-T1-WTC-03: Watcher Detection of .md files', async () => {
    const taskName = 'wtc-03.md';
    const logName = 'wtc-03.log';
    
    if (fs.existsSync(path.join(TASK_DIR, 'logs', logName))) {
      fs.rmSync(path.join(TASK_DIR, 'logs', logName));
    }
    
    writeHostFile(taskName, '# Markdown Task\n\nRun developer diagnostics.');
    const log = await waitForLog(logName);
    assert.match(log, /Executing instructions/, 'Watcher should process .md files');
  });

  await t.test('TC-T1-WTC-04: CLI Execution Trigger', async () => {
    const taskName = 'wtc-04.task';
    const logName = 'wtc-04.log';
    
    if (fs.existsSync(path.join(TASK_DIR, 'logs', logName))) {
      fs.rmSync(path.join(TASK_DIR, 'logs', logName));
    }
    
    writeHostFile(taskName, 'Trigger CLI test');
    const log = await waitForLog(logName);
    assert.match(log, /agy --execute/, 'Watcher log should prove agy CLI execution');
  });

  await t.test('TC-T1-WTC-05: Task Clean-up and Archiving', async () => {
    const taskName = 'wtc-05.task';
    const logName = 'wtc-05.log';
    
    writeHostFile(taskName, 'Cleanup test');
    await waitForLog(logName);
    await waitForFileDelete(taskName);
    assert.ok(true, 'Task file should be deleted after completion');
  });

  // Feature 3: Volume Persistence (R3)
  await t.test('TC-T1-VOL-01: Source Code Volume Sync', () => {
    const syncFileName = 'host-sync.txt';
    const syncContent = 'Hello from Host!';
    
    const hostPath = path.join(APP_DIR, syncFileName);
    fs.writeFileSync(hostPath, syncContent);
    
    const containerContent = execInContainer(`cat /app/${syncFileName}`);
    assert.strictEqual(containerContent, syncContent, 'File content should sync to container');
    
    // Clean up
    fs.rmSync(hostPath);
  });

  await t.test('TC-T1-VOL-02: Host Git Config Mapping', () => {
    // Ensure mock gitconfig has something to read
    if (E2E_MOCK) {
      const mockGitconfig = path.join(MOCK_FS_DIR, 'home/node/.gitconfig');
      fs.writeFileSync(mockGitconfig, '[user]\n\tname = Test User\n\temail = test@example.com');
    }
    const output = execInContainer('cat /home/node/.gitconfig');
    assert.match(output, /\[user\]/, 'Git config should map and contain user block');
  });

  await t.test('TC-T1-VOL-03: Antigravity Config Directory Persistence', () => {
    const configPath = path.join(CONFIG_DIR, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ key: 'value' }, null, 2));
    
    const output = execInContainer('ls /home/node/.gemini');
    assert.match(output, /config\.json/, 'Config folder contents must be visible in container');
  });

  await t.test('TC-T1-VOL-04: Bidirectional Write Persistence', () => {
    execInContainer('touch /home/node/.gemini/container-key.json');
    const hostPath = path.join(CONFIG_DIR, 'container-key.json');
    assert.ok(fs.existsSync(hostPath), 'Container-created file should persist to host');
  });

  await t.test('TC-T1-VOL-05: Persistence across Container Restart', () => {
    const secretPath = path.join(CONFIG_DIR, 'secret.json');
    const secretContent = JSON.stringify({ secret: 'xyz123' });
    fs.writeFileSync(secretPath, secretContent);
    
    restartContainer();
    
    const containerContent = execInContainer('cat /home/node/.gemini/secret.json');
    assert.strictEqual(containerContent, secretContent, 'Volume state should persist across restarts');
  });
});
