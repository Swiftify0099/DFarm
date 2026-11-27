import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { assertDisposablePg17Cluster } from './pg17-safety-guard.js';

const TEST_PG_URL = process.env['TEST_POSTGRES_URL'] || '';

const REQUIRED_SUITES = [
  {
    name: 'RESTART-03 Real PG17 Isolation Suite',
    path: 'services/backend/tests/restart03-real-postgres.test.js',
  },
  {
    name: 'RESTART-03.2 Real PG17 Concurrency Suite',
    path: 'services/backend/tests/restart032-real-postgres.test.js',
  },
  {
    name: 'RESTART-03.3 Real PG17 Actual Repository Suite',
    path: 'services/backend/tests/restart033-real-postgres-repositories.test.js',
  },
  {
    name: 'Isolated PG17 Customer Ledger Accounting Suite',
    path: 'services/backend/tests/customer-ledger-accounting.test.js',
  },
  {
    name: 'Concurrent Collection Idempotency & Atomicity Suite',
    path: 'services/backend/tests/concurrent-idempotency-financial.test.js',
  },
];

function parseTapStats(output) {
  const testsMatch = output.match(/^# tests\s+(\d+)/m);
  const passMatch = output.match(/^# pass\s+(\d+)/m);
  const failMatch = output.match(/^# fail\s+(\d+)/m);
  const skippedMatch = output.match(/^# skipped\s+(\d+)/m);

  const tests = testsMatch ? Number(testsMatch[1]) : 0;
  const pass = passMatch ? Number(passMatch[1]) : 0;
  const fail = failMatch ? Number(failMatch[1]) : 0;
  const skipped = skippedMatch ? Number(skippedMatch[1]) : 0;
  const usedPgMemFallback =
    /TEST_ISOLATED_MEM_DB|Using in-memory database fallback|Marked as SKIP \/ NOT RUN/i.test(output);

  return { tests, pass, fail, skipped, usedPgMemFallback };
}

function runSuite(suitePath) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['--test', '--test-reporter=tap', suitePath],
      {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          REQUIRE_REAL_POSTGRES: '1',
          TEST_REAL_POSTGRES: '1',
          DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS: process.env['DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS'] || '',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const s = chunk.toString();
      stdout += s;
      process.stdout.write(s);
    });
    child.stderr.on('data', (chunk) => {
      const s = chunk.toString();
      stderr += s;
      process.stderr.write(s);
    });

    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

async function main() {
  const { serverVersion, serverVersionNum, activeDb, activeUser } =
    await assertDisposablePg17Cluster({ connectionString: TEST_PG_URL });
  console.log(
    `Verified disposable PG17 target (version=${serverVersion}, num=${serverVersionNum}, db=${activeDb}, user=${activeUser}).`
  );

  const results = [];
  for (const suite of REQUIRED_SUITES) {
    console.log(`\n========================================================================`);
    console.log(`Executing ${suite.name} (${suite.path}) against PostgreSQL ${serverVersion}`);
    console.log(`========================================================================`);

    const run = await runSuite(suite.path);
    const stats = parseTapStats(run.stdout);

    const suitePassed =
      run.exitCode === 0 &&
      stats.tests > 0 &&
      stats.fail === 0 &&
      stats.skipped === 0 &&
      !stats.usedPgMemFallback;

    results.push({
      pgVersion: `${serverVersion} (${serverVersionNum})`,
      suiteName: suite.path,
      label: suite.name,
      tests: stats.tests,
      pass: stats.pass,
      fail: stats.fail,
      skipped: stats.skipped,
      exitCode: run.exitCode,
      usedPgMemFallback: stats.usedPgMemFallback,
      passed: suitePassed,
    });
  }

  const summaryLines = [
    `## PostgreSQL 17 Repository & Isolation Gate Summary`,
    ``,
    `- **PostgreSQL Version:** \`${serverVersion}\` (\`server_version_num=${serverVersionNum}\`)`,
    `- **Executed Suites:** \`${results.length}/${REQUIRED_SUITES.length}\``,
    ``,
    `| PostgreSQL Version | Suite Name | Tests Executed | Pass | Fail | Skip | Exit Code | Status |`,
    `| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |`,
    ...results.map(
      (r) =>
        `| \`${r.pgVersion}\` | \`${r.suiteName}\` | ${r.tests} | ${r.pass} | ${r.fail} | ${r.skipped} | ${r.exitCode} | ${r.passed ? 'PASS' : 'FAIL'} |`
    ),
    ``,
  ];

  const markdown = summaryLines.join('\n');
  console.log(`\n${markdown}`);

  const summaryPath = process.env['GITHUB_STEP_SUMMARY'];
  if (summaryPath) {
    fs.appendFileSync(summaryPath, `${markdown}\n`, 'utf8');
  }

  const allPassed =
    results.length === REQUIRED_SUITES.length && results.every((r) => r.passed);

  if (!allPassed) {
    console.error('GATE FAILED: One or more required PostgreSQL 17 suites failed, skipped, or reported 0 tests.');
    process.exit(1);
  }

  console.log('GATE PASSED: All 5 PostgreSQL 17 suites executed with 0 skips and 0 failures.');
}

main().catch((err) => {
  console.error(`CI PostgreSQL 17 runner error: ${err?.message || err}`);
  process.exit(1);
});
