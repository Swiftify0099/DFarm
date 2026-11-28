/**
 * CI Runner for DFarm RESTART-10 (DF-022):
 * Union Bank Reverse MIS Reconciliation Split-Brain & Tenant Isolation PG17 Gate.
 *
 * Fail-closed:
 * - Refuses to run unless TEST_POSTGRES_URL is set and passes assertDisposablePg17Cluster
 * - Executes both unit and two-physical-tenant PG17 integration suites under TAP
 * - Enforces exitCode === 0, tests > 0, pass === tests, fail === 0, skipped === 0
 * - Rejects any `pg-mem` fallback markers in TAP output
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { assertDisposablePg17Cluster } from './pg17-safety-guard.js';

const TEST_PG_URL = process.env['TEST_POSTGRES_URL'] || '';

const SUITES = [
  {
    name: 'RESTART-10 Union Bank Tenant Isolation & Reconciliation Unit Suite',
    path: 'services/backend/tests/restart10-union-bank-tenant-isolation-unit.test.js',
    requireRealPg: false,
  },
  {
    name: 'RESTART-10 Union Bank Reconciliation Two-Tenant PostgreSQL 17 Integration Gate',
    path: 'services/backend/tests/restart10-union-bank-tenant-isolation.test.js',
    requireRealPg: true,
  },
];

function parseTapTotals(output) {
  const topTests = [...output.matchAll(/^# tests\s+(\d+)/gm)];
  const topPass = [...output.matchAll(/^# pass\s+(\d+)/gm)];
  const topFail = [...output.matchAll(/^# fail\s+(\d+)/gm)];
  const topSkip = [...output.matchAll(/^# skipped\s+(\d+)/gm)];
  const topCancelled = [...output.matchAll(/^# cancelled\s+(\d+)/gm)];

  const tests = topTests.length > 0 ? Number(topTests[topTests.length - 1][1]) : 0;
  const pass = topPass.length > 0 ? Number(topPass[topPass.length - 1][1]) : 0;
  const fail = topFail.length > 0 ? Number(topFail[topFail.length - 1][1]) : 0;
  const skipped = topSkip.length > 0 ? Number(topSkip[topSkip.length - 1][1]) : 0;
  const cancelled = topCancelled.length > 0 ? Number(topCancelled[topCancelled.length - 1][1]) : 0;

  const hasTapSummary = topTests.length > 0 && topPass.length > 0 && topFail.length > 0 && topSkip.length > 0;
  const hasNotOk = /^not ok\s+/m.test(output) || /^\s+not ok\s+/m.test(output);
  const usedPgMemFallback =
    /TEST_ISOLATED_MEM_DB|Using in-memory database fallback|ISOLATED_TEST_INSTANCE.*ACTIVE|fallback.*pg-mem|using in-memory pg-mem/i.test(output);

  return {
    tests,
    pass,
    fail,
    skipped,
    cancelled,
    hasTapSummary,
    hasNotOk,
    usedPgMemFallback,
  };
}

function runSuite(suitePath, requireRealPg) {
  return new Promise((resolve) => {
    const childEnv = {
      ...process.env,
      NODE_ENV: 'test',
      TEST_REAL_POSTGRES: '1',
      TEST_POSTGRES_URL: TEST_PG_URL,
      DATABASE_URL: TEST_PG_URL,
      CENTRAL_DATABASE_URL: TEST_PG_URL,
      DATABASE_PROVISIONER_URL: TEST_PG_URL,
    };

    if (requireRealPg) {
      childEnv['REQUIRE_REAL_POSTGRES'] = '1';
      delete childEnv['TEST_ISOLATED_MEM_DB'];
    }

    const child = spawn(process.execPath, ['--test', '--test-reporter=tap', suitePath], {
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout });
    });
  });
}

async function main() {
  if (!TEST_PG_URL) {
    console.error('FATAL: TEST_POSTGRES_URL is not set. Refusing to run RESTART-10 PG17 verification without real PostgreSQL 17.');
    process.exit(1);
  }

  let preflight;
  try {
    preflight = await assertDisposablePg17Cluster({ connectionString: TEST_PG_URL });
    console.log(
      `[RESTART-10 Preflight] Connected to real PostgreSQL ${preflight.serverVersion} (${preflight.serverVersionNum}) database '${preflight.activeDb}' as '${preflight.activeUser}'.`
    );
  } catch (err) {
    console.error(`FATAL PG17 PREFLIGHT FAILURE: ${err?.message || err}`);
    process.exit(1);
  }

  const results = [];
  let overallSuccess = true;

  for (const suite of SUITES) {
    console.log(`\n==================================================================`);
    console.log(`Executing ${suite.name} (${suite.path})`);
    console.log(`==================================================================`);

    const run = await runSuite(suite.path, suite.requireRealPg);
    const stats = parseTapTotals(run.stdout);
    const passed =
      run.exitCode === 0 &&
      stats.hasTapSummary &&
      stats.tests > 0 &&
      stats.pass === stats.tests &&
      stats.fail === 0 &&
      stats.skipped === 0 &&
      stats.cancelled === 0 &&
      !stats.hasNotOk &&
      !(suite.requireRealPg && stats.usedPgMemFallback);

    if (!passed) {
      overallSuccess = false;
    }

    results.push({ suite, run, stats, passed });
  }

  const lines = [
    `## DFarm RESTART-10 (DF-022) PostgreSQL 17 Union Bank Reconciliation Gate`,
    '',
    `| PostgreSQL Version | Suite Path | Tests Executed | Pass | Fail | Skip | Cancelled | Exit Code | Status |`,
    `| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |`,
    ...results.map(
      (r) =>
        `| \`${preflight.serverVersion} (${preflight.serverVersionNum})\` | \`${r.suite.path}\` | ${r.stats.tests} | ${r.stats.pass} | ${r.stats.fail} | ${r.stats.skipped} | ${r.stats.cancelled} | ${r.run.exitCode} | ${r.passed ? 'PASS' : 'FAIL'} |`
    ),
    '',
  ];

  const summaryPath = process.env['GITHUB_STEP_SUMMARY'];
  if (summaryPath) {
    fs.appendFileSync(summaryPath, `${lines.join('\n')}\n`, 'utf8');
  }
  console.log('\n' + lines.join('\n'));

  if (!overallSuccess) {
    console.error('RESTART-10 PG17 GATE FAILED: One or more suites failed, skipped tests, or lacked real PostgreSQL 17 evidence.');
    process.exit(1);
  }

  console.log('RESTART-10 PG17 GATE PASSED: Zero failures, zero skips, two physical tenant DBs verified.');
}

main().catch((err) => {
  console.error(`Unhandled RESTART-10 CI runner error: ${err?.stack || err}`);
  process.exit(1);
});
