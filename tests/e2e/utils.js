const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const E2E_MOCK = process.env.E2E_MOCK === 'true';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const MOCK_FS_DIR = path.join(__dirname, 'mock_fs');

// Resolve directories depending on mock flag
const TASK_DIR = E2E_MOCK ? path.join(MOCK_FS_DIR, 'tasks') : path.join(PROJECT_ROOT, 'tasks');
const CONFIG_DIR = E2E_MOCK ? path.join(MOCK_FS_DIR, '.gemini') : path.join(PROJECT_ROOT, '.gemini');
const APP_DIR = E2E_MOCK ? path.join(MOCK_FS_DIR, 'app') : PROJECT_ROOT;

// Ensure directories exist
function ensureDirs() {
  fs.mkdirSync(TASK_DIR, { recursive: true });
  fs.mkdirSync(path.join(TASK_DIR, 'logs'), { recursive: true });
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (E2E_MOCK) {
    fs.mkdirSync(APP_DIR, { recursive: true });
    fs.mkdirSync(path.join(APP_DIR, 'src/app'), { recursive: true });
    fs.mkdirSync(path.join(MOCK_FS_DIR, 'home/node'), { recursive: true });
    fs.mkdirSync(path.join(MOCK_FS_DIR, 'home/node/.ssh'), { recursive: true });
  }
}
ensureDirs();

// Virtual configuration state and simulation settings for E2E_MOCK
const mockStore = {
  containerRunning: true,
  port3000Blocked: false,
  networkIsolated: false,
  cpuUtilization: 0.02, // simulated idle CPU %
  nextjsDevServerRunning: true,
  envExists: true,
  commandOutputs: {
    'node --version': 'v20.10.0',
    'npm --version': '10.2.3',
    'agy --version': 'Antigravity CLI v2.0.0 (mock)',
    'ps aux': 'node /app/watcher/watcher.js\nnode /app/node_modules/.bin/next dev',
    'cat /home/node/.gitconfig': '[user]\n\tname = Test User\n\temail = test@example.com',
    'ls /home/node/.gemini': 'config.json',
  }
};

// Check container status
function isContainerRunning() {
  if (E2E_MOCK) {
    return mockStore.containerRunning;
  }
  try {
    const rawPs = execSync('docker compose ps', { encoding: 'utf-8', cwd: PROJECT_ROOT });
    return rawPs.includes('nextjs-dev-container') && (rawPs.includes('Up') || rawPs.includes('running'));
  } catch {
    return false;
  }
}

// Exec inside container
function execInContainer(cmd) {
  if (E2E_MOCK) {
    if (!mockStore.containerRunning) {
      throw new Error('Container nextjs-dev-container is offline');
    }
    // Specific commands
    if (cmd === 'node --version' || cmd === 'npm --version' || cmd === 'agy --version' || cmd === 'ps aux') {
      return mockStore.commandOutputs[cmd];
    }
    if (cmd === 'node --version && npm --version') {
      return `${mockStore.commandOutputs['node --version']}\n${mockStore.commandOutputs['npm --version']}`;
    }
    if (cmd === 'cat /home/node/.gitconfig') {
      return mockStore.commandOutputs['cat /home/node/.gitconfig'];
    }
    if (cmd === 'ls /home/node/.gemini') {
      return mockStore.commandOutputs['ls /home/node/.gemini'];
    }
    if (cmd === 'cat /app/package.json') {
      const p = path.join(APP_DIR, 'package.json');
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '{"dependencies": {}}';
    }
    if (cmd.startsWith('cat ')) {
      let p;
      if (cmd.includes('/home/node/.gemini/') || cmd.includes('/app/.gemini/')) {
        const rel = cmd.slice(4).replace(/^.*\.gemini\//, '');
        p = path.join(CONFIG_DIR, rel);
      } else {
        const rel = cmd.slice(4).replace(/^\/app\//, '');
        p = path.join(APP_DIR, rel);
      }
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
    }
    if (cmd.startsWith('touch ')) {
      const rel = cmd.slice(6).replace(/^\/home\/node\/\.gemini\//, '').replace(/^\/app\/\.gemini\//, '');
      const p = path.join(CONFIG_DIR, rel);
      fs.writeFileSync(p, '{}');
      return '';
    }
    if (cmd.startsWith('ls /home/node/.ssh')) {
      const sshDir = path.join(MOCK_FS_DIR, 'home/node/.ssh');
      const files = fs.existsSync(sshDir) ? fs.readdirSync(sshDir) : [];
      return files.join('\n');
    }
    if (cmd.startsWith('stat -c %a') || cmd.startsWith('stat -f %A') || cmd.startsWith('stat -c "%a"')) {
      // Simulate permission check. E.g. stat -c %a /home/node/.ssh/id_rsa
      if (cmd.includes('.ssh')) {
        return '600';
      }
      return '755';
    }
    return '';
  }

  // Live docker mode
  return execSync(`docker compose exec -T nextjs-dev-container ${cmd}`, { encoding: 'utf-8', cwd: PROJECT_ROOT }).trim();
}

// Read/write host files
function writeHostFile(relPath, content, base = TASK_DIR) {
  const fullPath = path.join(base, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function readHostFile(relPath, base = TASK_DIR) {
  const fullPath = path.join(base, relPath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : null;
}

function cleanTestingDirectories() {
  if (E2E_MOCK) {
    if (fs.existsSync(MOCK_FS_DIR)) {
      fs.rmSync(MOCK_FS_DIR, { recursive: true, force: true });
    }
  } else {
    // Delete files in tasks but keep logs/
    if (fs.existsSync(TASK_DIR)) {
      const items = fs.readdirSync(TASK_DIR);
      for (const item of items) {
        if (item === 'logs') continue;
        fs.rmSync(path.join(TASK_DIR, item), { recursive: true, force: true });
      }
    }
  }
  ensureDirs();
}

// Container state manipulation
function restartContainer() {
  if (E2E_MOCK) {
    mockStore.containerRunning = false;
    setTimeout(() => {
      mockStore.containerRunning = true;
    }, 50);
    return;
  }
  execSync('docker compose restart nextjs-dev-container', { cwd: PROJECT_ROOT });
}

function stopContainer() {
  if (E2E_MOCK) {
    mockStore.containerRunning = false;
    return;
  }
  execSync('docker compose stop nextjs-dev-container', { cwd: PROJECT_ROOT });
}

function startContainer() {
  if (E2E_MOCK) {
    mockStore.containerRunning = true;
    return;
  }
  execSync('docker compose start nextjs-dev-container', { cwd: PROJECT_ROOT });
}

// Host mock watcher loop (simulates watcher.js in background)
let mockWatcherTimer = null;
function startHostMockWatcher() {
  if (!E2E_MOCK) return;
  if (mockWatcherTimer) return;

  mockWatcherTimer = setInterval(() => {
    try {
      if (!mockStore.containerRunning) return;
      const files = fs.readdirSync(TASK_DIR);
      for (const file of files) {
        if (file === 'logs' || file === 'archive') continue;
        const filePath = path.join(TASK_DIR, file);
        const stat = fs.lstatSync(filePath);
        if (stat.isSymbolicLink()) {
          console.warn(`[MOCK-WATCHER] Skipping symlink: ${filePath}`);
          try {
            fs.unlinkSync(filePath);
          } catch (e) {
            // ignore
          }
          continue;
        }
        if (!stat.isFile()) continue;

        // TC-T2-WTC-06: In-Progress File Locking (Slow Write)
        // Wait until stable (mtime older than 250ms)
        const age = Date.now() - stat.mtimeMs;
        if (age < 250) {
          continue; // still writing
        }

        const content = fs.readFileSync(filePath);
        const contentStr = content.toString('utf-8');
        const logName = file.replace(/\.(task|md)$/, '.log');
        const logPath = path.join(TASK_DIR, 'logs', logName);

        // TC-T2-WTC-01: Empty / Zero-byte Task File
        if (content.length === 0) {
          fs.writeFileSync(logPath, `[MOCK-WATCHER] Warning: Empty task file ${file}. Ignoring.\n`);
          fs.rmSync(filePath);
          continue;
        }

        // TC-T2-WTC-02: Invalid / Non-Text Task File
        // Detect binary (e.g. contains null bytes or PNG header)
        let isBinary = false;
        for (let i = 0; i < Math.min(content.length, 100); i++) {
          if (content[i] === 0 || (content[0] === 0x89 && content[1] === 0x50 && content[2] === 0x4E)) {
            isBinary = true;
            break;
          }
        }
        if (isBinary) {
          fs.writeFileSync(logPath, `[MOCK-WATCHER] Error: Binary or malformed task file ${file}. Skpped.\n`);
          fs.rmSync(filePath);
          continue;
        }

        // TC-T2-WTC-04: Extremely Large Task File
        if (stat.size > 10 * 1024 * 1024) { // 10MB limit
          fs.writeFileSync(logPath, `[MOCK-WATCHER] Error: File ${file} size ${stat.size} exceeds 10MB limit. Rejected.\n`);
          fs.rmSync(filePath);
          continue;
        }

        // Execute task
        let logContent = `[MOCK-AGY] Executing instructions from /app/tasks/${file}\n`;
        logContent += `[MOCK-AGY] Command: agy --execute /app/tasks/${file}\n`;

        // Intercept specific test instructions in task content
        if (contentStr.includes('WRITE_CODE:')) {
          // Format: WRITE_CODE: path | content
          const match = contentStr.match(/WRITE_CODE:\s*([^\s|]+)\s*\|\s*([\s\S]+)/);
          if (match) {
            const codePath = path.join(APP_DIR, match[1]);
            fs.mkdirSync(path.dirname(codePath), { recursive: true });
            fs.writeFileSync(codePath, match[2]);
            logContent += `[MOCK-AGY] Scaffolding file ${match[1]}\n`;
          }
        } else if (contentStr.includes('MODIFY_CONFIG:')) {
          // Format: MODIFY_CONFIG: key=value
          const match = contentStr.match(/MODIFY_CONFIG:\s*(\w+)=(\w+)/);
          if (match) {
            const configPath = path.join(CONFIG_DIR, 'config.json');
            let conf = {};
            if (fs.existsSync(configPath)) {
              conf = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            }
            conf[match[1]] = match[2];
            fs.writeFileSync(configPath, JSON.stringify(conf, null, 2));
            logContent += `[MOCK-AGY] Config key ${match[1]} updated to ${match[2]}\n`;
          }
        } else if (contentStr.includes('INSTALL_DEP:')) {
          const match = contentStr.match(/INSTALL_DEP:\s*(\w+)/);
          if (match) {
            const dep = match[1];
            if (dep === 'lodash' && mockStore.networkIsolated) {
              logContent += `[MOCK-AGY] npm install ${dep} failed: Network isolated.\n`;
            } else {
              // Write dependency to package.json
              const pkgPath = path.join(APP_DIR, 'package.json');
              let pkg = { dependencies: {} };
              if (fs.existsSync(pkgPath)) {
                pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
              }
              pkg.dependencies = pkg.dependencies || {};
              pkg.dependencies[dep] = 'latest';
              fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
              logContent += `[MOCK-AGY] Package ${dep} installed successfully.\n`;
            }
          }
        } else if (contentStr.includes('SYNTAX_ERROR')) {
          const layoutPath = path.join(APP_DIR, 'src/app/layout.tsx');
          fs.writeFileSync(layoutPath, 'const Layout = () => { return (<div>Unclosed tag</div) }'); // invalid typescript syntax
          logContent += `[MOCK-AGY] Wrote syntax error to src/app/layout.tsx\n`;
        } else if (contentStr.includes('FIX_SYNTAX')) {
          const layoutPath = path.join(APP_DIR, 'src/app/layout.tsx');
          fs.writeFileSync(layoutPath, 'const Layout = () => { return (<div>Fixed tag</div>); }; export default Layout;');
          logContent += `[MOCK-AGY] Fixed syntax error in src/app/layout.tsx\n`;
        }

        logContent += `[MOCK-AGY] Execution successful.\n`;
        fs.writeFileSync(logPath, logContent);
        
        // Remove file to prevent loop (TC-T1-WTC-05)
        fs.rmSync(filePath);
      }
    } catch (err) {
      console.error('Error in mock watcher loop:', err);
    }
  }, 100);
}

function stopHostMockWatcher() {
  if (mockWatcherTimer) {
    clearInterval(mockWatcherTimer);
    mockWatcherTimer = null;
  }
}

module.exports = {
  E2E_MOCK,
  PROJECT_ROOT,
  TASK_DIR,
  CONFIG_DIR,
  APP_DIR,
  mockStore,
  isContainerRunning,
  execInContainer,
  writeHostFile,
  readHostFile,
  cleanTestingDirectories,
  restartContainer,
  stopContainer,
  startContainer,
  startHostMockWatcher,
  stopHostMockWatcher
};
