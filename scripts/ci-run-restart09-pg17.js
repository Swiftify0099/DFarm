import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { assertDisposablePg17Cluster } from './pg17-safety-guard.js';

const TEST_PG_URL = process.env['TEST_POSTGRES_URL'] || '';

const RESTART09_SUITES = [
  {
    name: 'RESTART-09 PostgreSQL 17 Multi-Tenant Realtime Outbox & SSE Gate',
    path: 'services/backend/tests/restart09-tenant-realtime-outbox.test.js',
  },
];

function parseTapStats(output) {
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
  const tapSkipDirectives = (output.match(/^\s*ok\s+\d+\s+-\s+.*#\s*SKIP\b/gim) || []).length;
  const hasSkipDirective = tapSkipDirectives > 0 || skipped > 0;
  const usedPgMemFallback =
    /TEST_ISOLATED_MEM_DB|Using in-memory database fallback|ISOLATED_TEST_INSTANCE.*ACTIVE|fallback.*pg-mem|using in-memory pg-mem/i.test(output);

  return {
    tests,
    pass,
    fail,
    skipped: Math.max(skipped, tapSkipDirectives),
    cancelled,
    hasTapSummary,
    hasNotOk,
    hasSkipDirective,
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
        TEST_POSTGRES_URL: TEST_PG_URL,
        DATABASE_URL: TEST_PG_URL,
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
      const s = chunk.toString();
      stdout += s;
      process.stderr.write(s);
    });
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout });
    });
  });
}

async function main() {
  if (!TEST_PG_URL) {
    console.error('FATAL: TEST_POSTGRES_URL is not set. Refusing to run RESTART-09 PG17 verification without real PostgreSQL 17.');
    process.exit(1);
  }

  let preflight;
  try {
    preflight = await assertDisposablePg17Cluster({ connectionString: TEST_PG_URL });
    console.log(
      `Verified disposable PG17 target for RESTART-09 (version=${preflight.serverVersion}, num=${preflight.serverVersionNum}, db=${preflight.activeDb}, user=${preflight.activeUser}).`
    );
  } catch (err) {
    console.error(`FATAL: ${err?.message || err}`);
    process.exit(1);
  }

  const results = [];
  for (const suite of RESTART09_SUITES) {
    console.log(`\n========================================================================`);
    console.log(`Executing ${suite.name} (${suite.path}) against PostgreSQL ${preflight.serverVersion}`);
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
      !stats.hasNotOk &&
      !stats.hasSkipDirective &&
      !stats.usedPgMemFallback;

    results.push({ suite, run, stats, passed });
  }

  const rows = results.map(
    (r) =>
      `| \`${preflight.serverVersion} (${preflight.serverVersionNum})\` | \`${r.suite.path}\` | ${r.stats.tests} | ${r.stats.pass} | ${r.stats.fail} | ${r.stats.skipped} | ${r.run.exitCode} | ${r.passed ? 'PASS' : 'FAIL'} |`
  );

  const markdown = [
    `## RESTART-09 PostgreSQL 17 Multi-Tenant Realtime Outbox Verification`,
    ``,
    `- **PostgreSQL Version:** \`${preflight.serverVersion}\` (\`server_version_num=${preflight.serverVersionNum}\`)`,
    ``,
    `| PostgreSQL Version | Suite Path | Tests Executed | Pass | Fail | Skip | Exit Code | Status |`,
    `| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |`,
    ...rows,
    ``,
  ].join('\n');

  console.log(`\n${markdown}`);

  const summaryPath = process.env['GITHUB_STEP_SUMMARY'];
  if (summaryPath) {
    fs.appendFileSync(summaryPath, `${markdown}\n`, 'utf8');
  }

  if (results.some((r) => !r.passed)) {
    console.error('RESTART-09 PG17 GATE FAILED: One or more suites failed, skipped tests, or lacked real PostgreSQL 17 evidence.');
    process.exit(1);
  }

  console.log('RESTART-09 PG17 GATE PASSED: 100% suites executed against real PostgreSQL 17 with 0 skips and 0 failures.');
}

main().catch((err) => {
  console.error(`RESTART-09 PG17 runner error: ${err?.message || err}`);
  process.exit(1);
});
