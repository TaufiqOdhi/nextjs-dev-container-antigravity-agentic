const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  TASK_DIR,
  CONFIG_DIR,
  APP_DIR,
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

test('Tier 3: Cross-Feature Combinations', async (t) => {

  await t.test('TC-T3-XC-01: Task Execution across Container Re-creation', async () => {
    const taskName = 'restart_test.task';
    const logName = 'restart_test.log';
    
    if (fs.existsSync(path.join(TASK_DIR, 'logs', logName))) {
      fs.rmSync(path.join(TASK_DIR, 'logs', logName));
    }
    
    // Write task file
    writeHostFile(taskName, 'Simulated task execution persisting through restarts');
    
    // Instantly restart container
    restartContainer();
    
    // Verify watcher resumes and completes task execution
    const log = await waitForLog(logName, 8000);
    assert.match(log, /Execution successful/, 'Watcher must resume task processing and succeed after restart');
  });

  await t.test('TC-T3-XC-02: Task Modifies Persistent Configuration', async () => {
    const taskName = 'modify_config.task';
    const logName = 'modify_config.log';
    
    if (fs.existsSync(path.join(TASK_DIR, 'logs', logName))) {
      fs.rmSync(path.join(TASK_DIR, 'logs', logName));
    }
    
    // Task content tells the agy command to update config.json
    writeHostFile(taskName, 'MODIFY_CONFIG: mode=agentic');
    
    await waitForLog(logName);
    
    const configPath = path.join(CONFIG_DIR, 'config.json');
    assert.ok(fs.existsSync(configPath), 'config.json should be created');
    
    const configContent = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    assert.strictEqual(configContent.mode, 'agentic', 'Config property mode must be updated to agentic');
  });

  await t.test('TC-T3-XC-03: Code Scaffold and Hot Reload Integration', async () => {
    const taskName = 'scaffold.task';
    const logName = 'scaffold.log';
    const testPageRelPath = 'src/app/page.tsx';
    
    if (fs.existsSync(path.join(TASK_DIR, 'logs', logName))) {
      fs.rmSync(path.join(TASK_DIR, 'logs', logName));
    }
    
    const code = 'export default function Page() { return <h1>Agentic Dev Environment</h1>; }';
    writeHostFile(taskName, `WRITE_CODE: ${testPageRelPath} | ${code}`);
    
    await waitForLog(logName);
    
    const hostCodePath = path.join(APP_DIR, testPageRelPath);
    assert.ok(fs.existsSync(hostCodePath), 'Scaffolded code file should exist on host');
    
    const hostContent = fs.readFileSync(hostCodePath, 'utf-8');
    assert.ok(hostContent.includes('Agentic Dev Environment'), 'File content should match code scaffolded');
    
    // Clean up
    fs.rmSync(hostCodePath);
  });
});
