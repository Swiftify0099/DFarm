import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { assertDisposablePg17Cluster } from './pg17-safety-guard.js';

const TEST_PG_URL = process.env['TEST_POSTGRES_URL'] || '';

const REQUIRED_SUITES = [
  {
    name: 'RESTART-04 Real PG17 Device Auth & Offline Sync Integration Suite',
    path: 'services/backend/tests/restart04-real-postgres-device-sync.test.js',
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
    const child = spawn(process.execPath, ['--test', '--test-reporter=tap', suitePath], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        REQUIRE_REAL_POSTGRES: '1',
        TEST_REAL_POSTGRES: '1',
        DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS: process.env['DFARM_ALLOW_DISPOSABLE_PG17_MUTATIONS'] || '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

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
      resolve({ exitCode: code ?? 1, stdout });
    });
  });
}

async function main() {
  const { serverVersion, serverVersionNum, activeDb, activeUser } =
    await assertDisposablePg17Cluster({ connectionString: TEST_PG_URL });
  console.log(
    `Verified disposable PG17 target for RESTART-04 (version=${serverVersion}, num=${serverVersionNum}, db=${activeDb}, user=${activeUser}).`
  );

  const results = [];
  for (const suite of REQUIRED_SUITES) {
    const run = await runSuite(suite.path);
    const stats = parseTapStats(run.stdout);
    const passed =
      run.exitCode === 0 &&
      stats.tests > 0 &&
      stats.fail === 0 &&
      stats.skipped === 0 &&
      !stats.usedPgMemFallback;

    results.push({
      pgVersion: `${serverVersion} (${serverVersionNum})`,
      suiteName: suite.path,
      ...stats,
      exitCode: run.exitCode,
      passed,
    });
  }

  const markdown = [
    `## RESTART-04 PostgreSQL 17 Device Auth & Sync Gate Summary`,
    ``,
    `| PostgreSQL Version | Suite Name | Tests Executed | Pass | Fail | Skip | Exit Code | Status |`,
    `| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |`,
    ...results.map(
      (r) =>
        `| \`${r.pgVersion}\` | \`${r.suiteName}\` | ${r.tests} | ${r.pass} | ${r.fail} | ${r.skipped} | ${r.exitCode} | ${r.passed ? 'PASS' : 'FAIL'} |`
    ),
    ``,
  ].join('\n');

  console.log(`\n${markdown}`);
  if (process.env['GITHUB_STEP_SUMMARY']) {
    fs.appendFileSync(process.env['GITHUB_STEP_SUMMARY'], `${markdown}\n`, 'utf8');
  }

  if (!results.every((r) => r.passed)) {
    console.error('RESTART-04 PG17 GATE FAILED.');
    process.exit(1);
  }
  console.log('RESTART-04 PG17 GATE PASSED.');
}

main().catch((err) => {
  console.error(`RESTART-04 PG17 runner error: ${err?.message || err}`);
  process.exit(1);
});
