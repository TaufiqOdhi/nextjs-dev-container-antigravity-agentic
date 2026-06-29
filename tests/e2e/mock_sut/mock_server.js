const http = require('http');
const { spawn } = require('child_process');

// Start HTTP server on 3000
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('HTTP/1.1 200 OK\r\n');
});

server.listen(3000, '0.0.0.0', () => {
  console.log('Mock Next.js server listening on port 3000');
});

// Spawn the watcher script
const watcher = spawn('/usr/local/bin/mock_watcher.sh', [], { stdio: 'inherit' });

watcher.on('exit', (code) => {
  console.log(`Watcher exited with code ${code}`);
  process.exit(code || 0);
});
