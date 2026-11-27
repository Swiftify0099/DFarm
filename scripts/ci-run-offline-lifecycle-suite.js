import fs from 'node:fs';
import { spawn } from 'node:child_process';

const LIFECYCLE_SUITE = {
  name: 'RESTART-03.8 Offline Pool & Shutdown Lifecycle Suite',
  path: 'services/backend/tests/restart037-pool-lifecycle.test.js',
};

function parseTapStats(output) {
  const testsMatch = output.match(/^# tests\s+(\d+)/m);
  const passMatch = output.match(/^# pass\s+(\d+)/m);
  const failMatch = output.match(/^# fail\s+(\d+)/m);
  const skippedMatch = output.match(/^# skipped\s+(\d+)/m);

  const tests = testsMatch ? Number(testsMatch[1]) : 0;
  const pass = passMatch ? Number(passMatch[1]) : 0;
  const fail = failMatch ? Number(failMatch[1]) : 0;
  const skipped = skippedMatch ? Number(skippedMatch[1]) : 0;

  return { tests, pass, fail, skipped };
}

function runSuite(suitePath) {
  return new Promise((resolve) => {
    const childEnv = { ...process.env };
    delete childEnv['REQUIRE_REAL_POSTGRES'];
    delete childEnv['TEST_REAL_POSTGRES'];
    delete childEnv['TEST_POSTGRES_URL'];
    childEnv['NODE_ENV'] = 'test';
    childEnv['DATABASE_URL'] = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
    childEnv['CENTRAL_DATABASE_URL'] = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
    childEnv['DATABASE_PROVISIONER_URL'] = 'postgresql://postgres:postgres@127.0.0.1:59999/offline_test';
    childEnv['TENANT_POOL_CONNECTION_TIMEOUT_MS'] = '500';

    const child = spawn(
      process.execPath,
      ['--test', '--test-reporter=tap', suitePath],
      {
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    let stdout = '';
    child.stdout.on('data', (chunk) => {
      const s = chunk.toString();
      stdout += s;
      process.stdout.write(s);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk.toString());
    });
    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
      });
    });
  });
}

async function main() {
  console.log(`\n========================================================================`);
  console.log(`Executing ${LIFECYCLE_SUITE.name} (${LIFECYCLE_SUITE.path})`);
  console.log(`========================================================================`);

  const run = await runSuite(LIFECYCLE_SUITE.path);
  const stats = parseTapStats(run.stdout);
  const passed =
    run.exitCode === 0 &&
    stats.tests > 0 &&
    stats.fail === 0 &&
    stats.skipped === 0;

  const markdown = [
    `## Offline Pool Lifecycle Gate Summary`,
    ``,
    `| Suite Name | Mode | Tests Executed | Pass | Fail | Skip | Exit Code | Status |`,
    `| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |`,
    `| \`${LIFECYCLE_SUITE.path}\` | Offline Unit (FakePool / Barriers) | ${stats.tests} | ${stats.pass} | ${stats.fail} | ${stats.skipped} | ${run.exitCode} | ${passed ? 'PASS' : 'FAIL'} |`,
    ``,
  ].join('\n');

  console.log(`\n${markdown}`);

  const summaryPath = process.env['GITHUB_STEP_SUMMARY'];
  if (summaryPath) {
    fs.appendFileSync(summaryPath, `${markdown}\n`, 'utf8');
  }

  if (!passed) {
    console.error('OFFLINE LIFECYCLE GATE FAILED: Suite failed, skipped, or reported 0 tests.');
    process.exit(1);
  }

  console.log(`OFFLINE LIFECYCLE GATE PASSED: ${stats.pass}/${stats.tests} tests passed with 0 skips and 0 failures.`);
}

main().catch((err) => {
  console.error(`Offline lifecycle runner error: ${err?.message || err}`);
  process.exit(1);
});
