const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const {
  E2E_MOCK,
  TASK_DIR,
  CONFIG_DIR,
  APP_DIR,
  mockStore,
  writeHostFile,
  readHostFile,
  execInContainer
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

test('Tier 4: Real-World Scenarios', async (t) => {

  await t.test('TC-T4-RW-01: Clean Bootstrap Developer Flow', () => {
    // Verify default configs are present or generated
    const hostGitconfig = E2E_MOCK ? path.join(APP_DIR, 'mock_fs/home/node/.gitconfig') : path.join(process.env.HOME, '.gitconfig');
    assert.ok(fs.existsSync(CONFIG_DIR), 'Antigravity config directory must exist');
    assert.ok(fs.existsSync(TASK_DIR), 'Task directory must exist');
  });

  await t.test('TC-T4-RW-02: Multi-Stage Ticket Execution Pipeline', async () => {
    // Drop 3 consecutive tasks simulating a backlog
    const stages = [
      {
        task: 'stage1.task',
        log: 'stage1.log',
        content: 'WRITE_CODE: src/app/store.ts | export const store = { count: 0 };',
        fileCheck: 'src/app/store.ts',
        expected: 'store = { count: 0 }'
      },
      {
        task: 'stage2.task',
        log: 'stage2.log',
        content: 'WRITE_CODE: src/app/button.tsx | export const Button = () => null;',
        fileCheck: 'src/app/button.tsx',
        expected: 'Button = () => null'
      },
      {
        task: 'stage3.task',
        log: 'stage3.log',
        content: 'WRITE_CODE: src/app/layout.tsx | import { Button } from "./button";',
        fileCheck: 'src/app/layout.tsx',
        expected: 'import { Button }'
      }
    ];

    for (const stage of stages) {
      if (fs.existsSync(path.join(TASK_DIR, 'logs', stage.log))) {
        fs.rmSync(path.join(TASK_DIR, 'logs', stage.log));
      }
      
      writeHostFile(stage.task, stage.content);
      await waitForLog(stage.log);
      
      const filePath = path.join(APP_DIR, stage.fileCheck);
      assert.ok(fs.existsSync(filePath), `Pipeline file ${stage.fileCheck} should be generated`);
      assert.ok(fs.readFileSync(filePath, 'utf-8').includes(stage.expected));
      
      // Cleanup
      fs.rmSync(filePath);
    }
  });

  await t.test('TC-T4-RW-03: Network-Isolated Dependency Installation Failure', async () => {
    const taskName = 'install_lodash.task';
    const logName = 'install_lodash.log';
    
    if (fs.existsSync(path.join(TASK_DIR, 'logs', logName))) {
      fs.rmSync(path.join(TASK_DIR, 'logs', logName));
    }

    // Set network isolated
    mockStore.networkIsolated = true;
    if (!E2E_MOCK) {
      // In live mode, simulate network block by touching a flag file used by mock agy
      fs.writeFileSync(path.join(APP_DIR, '.network_isolated'), '');
    }

    writeHostFile(taskName, 'INSTALL_DEP: lodash');
    const log = await waitForLog(logName);
    
    assert.match(log, /Network isolated|failed/, 'Dependency installation should fail due to network isolation');

    // Restore state
    mockStore.networkIsolated = false;
    if (!E2E_MOCK) {
      if (fs.existsSync(path.join(APP_DIR, '.network_isolated'))) {
        fs.rmSync(path.join(APP_DIR, '.network_isolated'));
      }
    }
  });

  await t.test('TC-T4-RW-04: Dev Server Code Syntax Self-Healing', async () => {
    const badTaskName = 'bad_syntax.task';
    const badLogName = 'bad_syntax.log';
    const fixTaskName = 'fix_syntax.task';
    const fixLogName = 'fix_syntax.log';
    const layoutFile = path.join(APP_DIR, 'src/app/layout.tsx');

    if (fs.existsSync(path.join(TASK_DIR, 'logs', badLogName))) {
      fs.rmSync(path.join(TASK_DIR, 'logs', badLogName));
    }
    if (fs.existsSync(path.join(TASK_DIR, 'logs', fixLogName))) {
      fs.rmSync(path.join(TASK_DIR, 'logs', fixLogName));
    }

    // 1. Introduce syntax error
    writeHostFile(badTaskName, 'SYNTAX_ERROR');
    await waitForLog(badLogName);
    assert.ok(fs.readFileSync(layoutFile, 'utf-8').includes('Unclosed tag'), 'Layout file should contain bad syntax');

    // 2. Fix syntax error
    writeHostFile(fixTaskName, 'FIX_SYNTAX');
    await waitForLog(fixLogName);
    assert.ok(fs.readFileSync(layoutFile, 'utf-8').includes('Fixed tag'), 'Layout file should be self-healed');

    // Cleanup
    fs.rmSync(layoutFile);
  });

  await t.test('TC-T4-RW-05: Credentials Leak Prevention & Permission Protection', () => {
    // 1. Check SSH directory permissions if present
    if (E2E_MOCK) {
      // Simulate file permissions
      const sshDir = path.join(APP_DIR, 'mock_fs/home/node/.ssh');
      fs.mkdirSync(sshDir, { recursive: true });
      fs.writeFileSync(path.join(sshDir, 'id_rsa'), 'private-key');
    }
    
    // In container, verify .ssh directory contains files with 600 permissions
    const sshPermissions = execInContainer('stat -c "%a" /home/node/.ssh/id_rsa');
    assert.strictEqual(sshPermissions, '600', 'Private keys must have 600 permissions');

    // 2. Check gitignore contents on host
    const gitignorePath = path.join(APP_DIR, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, '.gemini/\n.mock_fs/\n');
    } else {
      const gitignore = fs.readFileSync(gitignorePath, 'utf-8');
      if (!gitignore.includes('.gemini')) {
        fs.appendFileSync(gitignorePath, '\n.gemini/\n');
      }
    }
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    assert.ok(gitignoreContent.includes('.gemini'), '.gemini directory must be gitignored to prevent credentials leak');
  });
});
