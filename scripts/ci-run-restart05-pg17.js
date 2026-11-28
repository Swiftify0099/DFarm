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
  const lastMatch = (regex) => {
    const matches = [...output.matchAll(regex)];
    return matches.length > 0 ? matches[matches.length - 1] : null;
  };

  const testsMatch = lastMatch(/^# tests\s+(\d+)/gm);
  const passMatch = lastMatch(/^# pass\s+(\d+)/gm);
  const failMatch = lastMatch(/^# fail\s+(\d+)/gm);
  const skippedMatch = lastMatch(/^# skipped\s+(\d+)/gm);
  const cancelledMatch = lastMatch(/^# cancelled\s+(\d+)/gm);

  const hasTapSummary = Boolean(testsMatch && passMatch && failMatch && skippedMatch);
  const tests = testsMatch ? Number(testsMatch[1]) : 0;
  const pass = passMatch ? Number(passMatch[1]) : 0;
  const parsedFail = failMatch ? Number(failMatch[1]) : 0;
  const parsedSkipped = skippedMatch ? Number(skippedMatch[1]) : 0;
  const cancelled = cancelledMatch ? Number(cancelledMatch[1]) : 0;

  const topLevelNotOk = (output.match(/^not ok\s+\d+\b/gm) || []).length;
  const nestedNotOk = (output.match(/^\s+not ok\s+\d+\b/gm) || []).length;
  const tapSkipDirectives = (output.match(/^\s*ok\s+\d+\s+-\s+.*#\s*SKIP\b/gim) || []).length;

  // Fail closed if a suite-level hook or nested TAP failure is not reflected in # fail,
  // or if Node 20 omits a suite-level # SKIP from the # skipped summary line.
  const fail = parsedFail > 0 ? parsedFail : topLevelNotOk + nestedNotOk;
  const skipped = Math.max(parsedSkipped, tapSkipDirectives);
  const hasSuiteOrNestedNotOk = topLevelNotOk > 0 || nestedNotOk > 0;

  const usedPgMemFallback =
    /TEST_ISOLATED_MEM_DB|Using in-memory database fallback|Marked as SKIP \/ NOT RUN/i.test(output);

  return {
    hasTapSummary,
    tests,
    pass,
    fail,
    skipped,
    cancelled,
    hasSuiteOrNestedNotOk,
    usedPgMemFallback,
  };
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
      stats.hasTapSummary &&
      stats.tests > 0 &&
      stats.pass === stats.tests &&
      stats.fail === 0 &&
      stats.skipped === 0 &&
      stats.cancelled === 0 &&
      !stats.hasSuiteOrNestedNotOk &&
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

  if (results.length !== REQUIRED_SUITES.length || !results.every((r) => r.passed)) {
    console.error('RESTART-05 PG17 GATE FAILED.');
    process.exit(1);
  }
  console.log('RESTART-05 PG17 GATE PASSED.');
}

main().catch((err) => {
  console.error(`RESTART-05 PG17 runner error: ${err?.message || err}`);
  process.exit(1);
});
