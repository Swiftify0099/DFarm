import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { assertDisposablePg17Cluster } from './pg17-safety-guard.js';

const TEST_PG_URL = process.env['TEST_POSTGRES_URL'] || '';

const REQUIRED_SUITES = [
  {
    name: 'RESTART-05 Offline Migration Reconciliation & Catalog Safety Suite',
    path: 'services/backend/tests/restart05-migration-reconciliation.test.js',
  },
  {
    name: 'RESTART-05.1 Migration Runner Fail-Closed Safety, Auth Integrity & CLI Parity Suite',
    path: 'services/backend/tests/restart051-migration-safety.test.js',
  },
  {
    name: 'RESTART-05 Real PG17 Migration Ownership, Quarantine & Atomicity Gate',
    path: 'services/backend/tests/restart05-real-postgres-migrations.test.js',
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
    `Verified disposable PG17 target for RESTART-05 (version=${serverVersion}, num=${serverVersionNum}, db=${activeDb}, user=${activeUser}).`
  );

  const results = [];
  for (const suite of REQUIRED_SUITES) {
    console.log(`\n========================================================================`);
    console.log(`Executing ${suite.name} (${suite.path}) against PostgreSQL ${serverVersion}`);
    console.log(`========================================================================`);

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

  const totalTests = results.reduce((sum, r) => sum + r.tests, 0);
  const totalPass = results.reduce((sum, r) => sum + r.pass, 0);
  const totalFail = results.reduce((sum, r) => sum + r.fail, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);

  const markdown = [
    `## RESTART-05 PostgreSQL 17 Migration Reconciliation Gate Summary`,
    ``,
    `- **PostgreSQL Version:** \`${serverVersion}\` (\`server_version_num=${serverVersionNum}\`)`,
    `- **Totals:** \`${totalPass}/${totalTests} passed\`, \`${totalFail} failed\`, \`${totalSkipped} skipped\``,
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
    console.error('RESTART-05 PG17 GATE FAILED.');
    process.exit(1);
  }
  console.log('RESTART-05 PG17 GATE PASSED.');
}

main().catch((err) => {
  console.error(`RESTART-05 PG17 runner error: ${err?.message || err}`);
  process.exit(1);
});
