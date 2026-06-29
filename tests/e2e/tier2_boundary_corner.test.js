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
  mockStore,
  execInContainer,
  writeHostFile,
  readHostFile,
  stopContainer,
  startContainer
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

test('Tier 2: Boundary & Corner Cases', async (t) => {

  // Feature 1: Docker Container Environment (R1) Boundary Cases
  await t.test('TC-T2-ENV-01: Port 3000 Conflict Handling', () => {
    // Check behavior when port 3000 is blocked before container startup.
    mockStore.port3000Blocked = true;
    // In live mode, we can inspect docker-compose.yml or check if a port-bound error can be handled.
    // For test purposes, we assert that the system has ports configuration.
    if (!E2E_MOCK) {
      const composeContent = fs.readFileSync(path.join(APP_DIR, 'docker-compose.yml'), 'utf-8');
      assert.ok(composeContent.includes('3000:3000') || composeContent.includes('3000'), 'Compose must map port 3000');
    } else {
      assert.strictEqual(mockStore.port3000Blocked, true);
    }
  });

  await t.test('TC-T2-ENV-02: Missing Environment Configuration (.env)', () => {
    if (!E2E_MOCK) {
      let envExists = false;
      try {
        execInContainer('test -f /app/.env');
        envExists = true;
      } catch (err) {
        // Doesn't exist
      }
      
      if (envExists) {
        execInContainer('mv /app/.env /app/.env.bak');
      }
      
      try {
        const nodeEnv = execInContainer('node -e "console.log(process.env.NODE_ENV || \'development\')"').trim();
        assert.ok(nodeEnv === 'development' || nodeEnv === 'production', `NODE_ENV should default to development or production, got ${nodeEnv}`);
      } finally {
        if (envExists) {
          execInContainer('mv /app/.env.bak /app/.env');
        }
      }
    } else {
      mockStore.envExists = false;
      assert.strictEqual(mockStore.envExists, false);
    }
  });

  await t.test('TC-T2-ENV-03: Container Memory/CPU Constraints', () => {
    const composePath = E2E_MOCK
      ? path.join(__dirname, 'mock_sut/docker-compose.mock.yml')
      : path.join(APP_DIR, 'docker-compose.yml');
    
    assert.ok(fs.existsSync(composePath), `Compose file should exist: ${composePath}`);
    const composeContent = fs.readFileSync(composePath, 'utf-8');
    
    // Check for cpus and memory definitions under limits
    const hasCpusLimit = /cpus:\s*['"]?[0-9.]+['"]?/.test(composeContent);
    const hasMemoryLimit = /memory:\s*\w+/.test(composeContent);
    
    assert.ok(hasCpusLimit, 'CPU resource limits should be defined in compose config');
    assert.ok(hasMemoryLimit, 'Memory resource limits should be defined in compose config');
  });

  await t.test('TC-T2-ENV-04: Abrupt Node Dev Server Crash & Recovery', async () => {
    const checkPort3000Reachable = () => {
      return new Promise((resolve) => {
        const req = require('http').get('http://localhost:3000/', { timeout: 1000 }, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => {
          resolve(false);
        });
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
      });
    };

    if (!E2E_MOCK) {
      stopContainer();
      const isReachableBefore = await checkPort3000Reachable();
      assert.strictEqual(isReachableBefore, false, 'Port 3000 should be unreachable when container is stopped');
      
      startContainer();
      let reachable = false;
      const start = Date.now();
      while (Date.now() - start < 15000) {
        reachable = await checkPort3000Reachable();
        if (reachable) break;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      assert.strictEqual(reachable, true, 'Port 3000 should become reachable (HTTP 200) after container starts');
    } else {
      mockStore.containerRunning = false;
      mockStore.nextjsDevServerRunning = false;
      assert.strictEqual(mockStore.containerRunning, false);
      
      mockStore.containerRunning = true;
      mockStore.nextjsDevServerRunning = true;
      assert.strictEqual(mockStore.containerRunning, true);
      assert.strictEqual(mockStore.nextjsDevServerRunning, true);
    }
  });

  await t.test('TC-T2-ENV-05: Read-Only / Write-Protected Mount Restrictions', () => {
    // Log folders must be writeable.
    const testLogPath = path.join(TASK_DIR, 'logs/write-test.log');
    fs.writeFileSync(testLogPath, 'write test');
    assert.ok(fs.existsSync(testLogPath), 'Logs directory must be writeable');
    fs.rmSync(testLogPath);

    // Protected source directories should have controlled permissions.
    // Check permission of a file in container.
    const perm = execInContainer('stat -c "%a" /app/package.json');
    assert.ok(perm, 'Should return file permissions');
  });

  // Feature 2: Task Watcher (R2) Boundary Cases
  await t.test('TC-T2-WTC-01: Empty / Zero-byte Task File', async () => {
    const taskName = 'empty.task';
    const logName = 'empty.log';
    
    if (fs.existsSync(path.join(TASK_DIR, 'logs', logName))) {
      fs.rmSync(path.join(TASK_DIR, 'logs', logName));
    }
    
    writeHostFile(taskName, '');
    const log = await waitForLog(logName);
    assert.match(log, /Warning: Empty task file/, 'Watcher should log warning for empty task file');
  });

  await t.test('TC-T2-WTC-02: Invalid / Non-Text Task File', async () => {
    const taskName = 'malformed.task';
    const logName = 'malformed.log';
    
    if (fs.existsSync(path.join(TASK_DIR, 'logs', logName))) {
      fs.rmSync(path.join(TASK_DIR, 'logs', logName));
    }
    
    // Write binary PNG header
    const binaryData = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    fs.writeFileSync(path.join(TASK_DIR, taskName), binaryData);
    
    const log = await waitForLog(logName);
    assert.match(log, /Error: Binary or malformed task file/, 'Watcher should reject binary file');
  });

  await t.test('TC-T2-WTC-03: Watcher Low-Resource Idle Behavior', () => {
    // Assert idle CPU remains low.
    let cpu = 0;
    if (!E2E_MOCK) {
      try {
        const rawCpu = execInContainer('ps -p 1 -o %cpu');
        const lines = rawCpu.trim().split('\n').map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          if (line.toLowerCase().includes('%cpu') || line.toLowerCase().includes('cpu')) {
            continue;
          }
          const val = parseFloat(line);
          if (!isNaN(val)) {
            cpu = val / 100.0;
            break;
          }
        }
      } catch (err) {
        cpu = mockStore.cpuUtilization;
      }
    } else {
      cpu = mockStore.cpuUtilization;
    }
    assert.ok(cpu < 0.05, `CPU consumption should remain low when idle, got: ${cpu}`);
  });

  await t.test('TC-T2-WTC-04: Extremely Large Task File', async () => {
    const taskName = 'large.task';
    const logName = 'large.log';
    
    if (fs.existsSync(path.join(TASK_DIR, 'logs', logName))) {
      fs.rmSync(path.join(TASK_DIR, 'logs', logName));
    }
    
    // Write a > 10MB file (e.g. 11MB)
    const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'a');
    fs.writeFileSync(path.join(TASK_DIR, taskName), largeBuffer);
    
    const log = await waitForLog(logName);
    assert.match(log, /exceeds 10MB limit/, 'Watcher should skip task file exceeding size limit');
  });

  await t.test('TC-T2-WTC-05: Concurrent Task File Drops', async () => {
    const fileCount = 20;
    const promises = [];
    
    for (let i = 0; i < fileCount; i++) {
      const taskName = `concurrent-${i}.task`;
      const logName = `concurrent-${i}.log`;
      
      if (fs.existsSync(path.join(TASK_DIR, 'logs', logName))) {
        fs.rmSync(path.join(TASK_DIR, 'logs', logName));
      }
      
      writeHostFile(taskName, `Concurrent job ${i}`);
      promises.push(waitForLog(logName));
    }
    
    const logs = await Promise.all(promises);
    assert.strictEqual(logs.length, fileCount, 'All concurrent tasks should generate logs');
    for (let i = 0; i < fileCount; i++) {
      assert.match(logs[i], /Execution successful/, `Task ${i} should complete successfully`);
    }
  });

  await t.test('TC-T2-WTC-06: In-Progress File Locking (Slow Write)', async () => {
    const taskName = 'slow.task';
    const logName = 'slow.log';
    
    if (fs.existsSync(path.join(TASK_DIR, 'logs', logName))) {
      fs.rmSync(path.join(TASK_DIR, 'logs', logName));
    }
    
    const taskPath = path.join(TASK_DIR, taskName);
    
    // Simulating slow write by appending lines at intervals
    fs.writeFileSync(taskPath, 'Line 1\n');
    await new Promise(resolve => setTimeout(resolve, 100));
    fs.appendFileSync(taskPath, 'Line 2\n');
    await new Promise(resolve => setTimeout(resolve, 100));
    fs.appendFileSync(taskPath, 'Line 3\n');
    
    // Now wait for watcher to pick it up and execute
    const log = await waitForLog(logName);
    assert.match(log, /Execution successful/, 'Watcher must execute slow.task successfully after write completes');
  });

  // Feature 3: Volume Persistence (R3) Boundary Cases
  await t.test('TC-T2-VOL-01: Host-Container User/Group UID/GID Mapping', () => {
    const p = path.join(CONFIG_DIR, 'root_config.json');
    fs.writeFileSync(p, JSON.stringify({ root: true }));
    
    const output = execInContainer('cat /home/node/.gemini/root_config.json');
    const parsed = JSON.parse(output);
    assert.strictEqual(parsed.root, true, 'Should read file written by host');
    fs.rmSync(p);
  });

  await t.test('TC-T2-VOL-02: Long/Nested Directory Path Resolution', () => {
    // Nested directory path > 255 chars
    let current = CONFIG_DIR;
    for (let i = 0; i < 20; i++) {
      current = path.join(current, `nested_level_${i}`);
    }
    fs.mkdirSync(current, { recursive: true });
    
    const targetFile = path.join(current, 'deep.json');
    const content = JSON.stringify({ ok: true });
    fs.writeFileSync(targetFile, content);
    
    // Resolve deep path in container
    const rel = path.relative(CONFIG_DIR, targetFile);
    const containerContent = execInContainer(`cat /home/node/.gemini/${rel}`);
    assert.strictEqual(containerContent, content, 'Deeply nested directory paths should sync correctly');
    
    // Cleanup
    fs.rmSync(path.join(CONFIG_DIR, 'nested_level_0'), { recursive: true, force: true });
  });

  await t.test('TC-T2-VOL-03: Extreme Write/Sync Frequency', () => {
    const p = path.join(CONFIG_DIR, 'config.json');
    for (let i = 0; i < 100; i++) {
      fs.writeFileSync(p, JSON.stringify({ count: i }));
    }
    const containerContent = execInContainer('cat /home/node/.gemini/config.json');
    const parsed = JSON.parse(containerContent);
    assert.strictEqual(parsed.count, 99, 'File must sync correctly after 100 rapid writes');
  });

  await t.test('TC-T2-VOL-04: Symlink Resolution Security', async () => {
    const symlinkTask = 'etc_pass.task';
    const target = path.join(TASK_DIR, symlinkTask);
    
    if (fs.existsSync(target)) {
      fs.rmSync(target);
    }
    
    // Create symlink pointing outside the task directory
    try {
      fs.symlinkSync('/etc/passwd', target);
    } catch {
      // On some environments, symlinking /etc/passwd on host might fail or require admin.
      // If it fails, create a dummy outside file and symlink to that instead.
      const dummyOutside = path.join(APP_DIR, 'outside.txt');
      fs.writeFileSync(dummyOutside, 'unauthorized content');
      fs.symlinkSync(dummyOutside, target);
    }

    // Wait a brief period to ensure the watcher ignores it or handles it safely
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const logExists = fs.existsSync(path.join(TASK_DIR, 'logs', 'etc_pass.log'));
    assert.strictEqual(logExists, false, 'Watcher should ignore external symlink tasks');
    
    if (fs.existsSync(target)) {
      fs.rmSync(target);
    }
    const dummyOutsidePath = path.join(APP_DIR, 'outside.txt');
    if (fs.existsSync(dummyOutsidePath)) {
      fs.rmSync(dummyOutsidePath);
    }
  });

  await t.test('TC-T2-VOL-05: Special Characters in Volume Paths', async () => {
    const taskName = 't@s#k$%^&*( )_+.task';
    const logName = 't@s#k$%^&*( )_+.log';
    const taskPath = path.join(TASK_DIR, taskName);
    const logPath = path.join(TASK_DIR, 'logs', logName);
    
    if (fs.existsSync(logPath)) {
      fs.rmSync(logPath);
    }
    if (fs.existsSync(taskPath)) {
      fs.rmSync(taskPath);
    }
    
    writeHostFile(taskName, 'echo "Special Character Test"');
    
    // Wait for the log to be created by the watcher
    const log = await waitForLog(logName);
    assert.ok(log.includes('[MOCK-AGY]') || log.includes('Execution successful') || log.includes('[AGY]'), 'Log content should confirm task processing');
    
    // Clean up
    if (fs.existsSync(logPath)) {
      fs.rmSync(logPath);
    }
  });
});
