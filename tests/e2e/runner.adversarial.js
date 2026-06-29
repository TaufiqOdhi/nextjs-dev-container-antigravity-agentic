const { run } = require('node:test');
const path = require('path');
const fs = require('fs');
const {
  E2E_MOCK,
  isContainerRunning,
  startHostMockWatcher,
  stopHostMockWatcher,
  cleanTestingDirectories
} = require('./utils');

// Perform pre-flight container check when E2E_MOCK is not true
if (!E2E_MOCK && !isContainerRunning()) {
  console.error(`\x1b[31m[ERROR] System Under Test (SUT) container 'nextjs-dev-container' is offline.\x1b[0m`);
  console.error(`Please spin up the container before running E2E tests:`);
  console.error(`\x1b[36m  docker compose up -d\x1b[0m`);
  process.exit(1);
}

// Clean up before execution
cleanTestingDirectories();

// Start host mock watcher if mock mode is enabled
if (E2E_MOCK) {
  startHostMockWatcher();
}

const testFiles = [
  path.resolve(__dirname, 'tier1_feature_coverage.adversarial_fail.test.js')
];

let reporter;
try {
  const { spec } = require('node:test/reporters');
  reporter = new spec();
} catch (e) {
  const { tap } = require('node:test/reporters');
  reporter = new tap();
}

console.log(`=== Next.js Agentic Dev Container ADVERSARIAL E2E Runner ===`);
console.log(`[Configuration] Host Mock Mode: ${E2E_MOCK}`);
console.log('Running test suites...\n');

let hasFailures = false;

const testStream = run({ files: testFiles });

testStream.on('test:fail', () => {
  hasFailures = true;
});

testStream.compose(reporter).pipe(process.stdout);

testStream.on('end', () => {
  if (E2E_MOCK) {
    stopHostMockWatcher();
  }
  
  // Clean up files after execution
  cleanTestingDirectories();
  
  if (hasFailures) {
    console.log('\n\x1b[31mTest run failed as expected (Adversarial check success).\x1b[0m\n');
    process.exit(1);
  } else {
    console.log('\n\x1b[32mAll tests passed (Adversarial check failed - no error detected).\x1b[0m\n');
    process.exit(0);
  }
});
