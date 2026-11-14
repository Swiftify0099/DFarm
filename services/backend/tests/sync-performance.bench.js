import { performance } from 'node:perf_hooks';
import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../dist/app.js';
import { query } from '../dist/db.js';
import { signJwt } from '../dist/jwt.js';
import { UserRole } from '@dfarm/shared-types';

async function runPerformanceBenchmarks() {
  const app = createApp();

  console.log('=== DFARM PHASE 09: PERFORMANCE & BENCHMARK SUITE ===\n');

  // 1. Setup organization & device
  const orgRes = await query("SELECT id FROM organizations WHERE name ILIKE '%Sangli%' LIMIT 1;");
  const orgId = orgRes.rows[0].id;
  const centerRes = await query('SELECT id FROM dairy_centers WHERE organization_id = $1 LIMIT 1;', [orgId]);
  const centerId = centerRes.rows[0].id;

  const adminToken = signJwt({
    sub: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    role: UserRole.DAIRY_OWNER,
    organizationId: orgId,
  });

  const deviceIdentifier = `PERF-TERM-${Math.floor(1000 + Math.random() * 9000)}`;
  const regRes = await request(app)
    .post('/api/v1/devices/register')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      deviceIdentifier,
      deviceType: 'COUNTER_TERMINAL',
      organizationId: orgId,
      centerId,
      model: 'Benchmark Terminal',
      serialNumber: `SN-PERF-${Date.now()}`,
    });

  const deviceId = regRes.body.data.deviceId;
  const deviceToken = regRes.body.data.token;

  // Measurement 1: Local Database & Query Latency (PostgreSQL Core Lookups)
  const queryStart = performance.now();
  for (let i = 0; i < 50; i++) {
    await query('SELECT id, farmer_code, full_name FROM customers WHERE organization_id = $1 LIMIT 10;', [orgId]);
  }
  const queryEnd = performance.now();
  const avgQueryMs = (queryEnd - queryStart) / 50;
  console.log(`1. Database Query Latency: avg ${avgQueryMs.toFixed(3)} ms per indexed lookup`);

  // Measurement 2: Sync Batch Push Duration (50 Events)
  const batchSize = 50;
  const events = [];
  const startMem = process.memoryUsage().heapUsed / (1024 * 1024);

  for (let i = 0; i < batchSize; i++) {
    const custId = crypto.randomUUID();
    events.push({
      id: crypto.randomUUID(),
      entityType: 'CUSTOMER_REGISTRATION',
      entityId: custId,
      action: 'INSERT',
      idempotencyKey: `IDEMP-BENCH-${custId}`,
      createdAt: new Date().toISOString(),
      payload: {
        farmerCode: `F-BENCH-${Math.floor(100000 + Math.random() * 900000)}`,
        fullName: `Benchmark Farmer ${i}`,
        mobileNumber: `+9197${Math.floor(10000000 + Math.random() * 90000000)}`,
        permittedCategories: ['COW', 'BUFFALO'],
      },
    });
  }

  const pushStart = performance.now();
  const pushRes = await request(app)
    .post('/api/v1/sync/push')
    .set('Authorization', `Bearer ${deviceToken}`)
    .send({
      deviceId,
      centerId,
      events,
    });
  const pushEnd = performance.now();
  const pushDurationMs = pushEnd - pushStart;
  const endMem = process.memoryUsage().heapUsed / (1024 * 1024);

  console.log(`2. Sync Batch Push Performance:`);
  console.log(`   - Batch Size: ${batchSize} events`);
  console.log(`   - Applied Count: ${pushRes.body.data?.applied || 0}`);
  console.log(`   - Push Total Duration: ${pushDurationMs.toFixed(2)} ms (${(pushDurationMs / batchSize).toFixed(2)} ms/event)`);
  console.log(`   - Memory Usage: ${startMem.toFixed(2)} MB -> ${endMem.toFixed(2)} MB (Delta: ${(endMem - startMem).toFixed(2)} MB)`);

  // Measurement 3: Sync Pull Download Latency
  const pullStart = performance.now();
  const pullRes = await request(app)
    .get(`/api/v1/sync/pull?cursor=0&tombstoneCursor=0&centerId=${centerId}`)
    .set('Authorization', `Bearer ${deviceToken}`);
  const pullEnd = performance.now();
  const pullDurationMs = pullEnd - pullStart;

  console.log(`3. Sync Downstream Pull Performance:`);
  console.log(`   - Customers Downloaded: ${pullRes.body.data?.customers?.length || 0}`);
  console.log(`   - Face Templates Downloaded: ${pullRes.body.data?.faceTemplates?.length || 0}`);
  console.log(`   - Rate Cards Downloaded: ${pullRes.body.data?.rateCards?.length || 0}`);
  console.log(`   - Pull Duration: ${pullDurationMs.toFixed(2)} ms`);

  // Measurement 4: Template Cache Size & Throughput
  const templateCount = pullRes.body.data?.faceTemplates?.length || 0;
  const templatePayloadBytes = JSON.stringify(pullRes.body.data?.faceTemplates || []).length;
  console.log(`4. Template Cache & Network Footprint:`);
  console.log(`   - Active Templates: ${templateCount}`);
  console.log(`   - Compressed JSON Footprint: ${(templatePayloadBytes / 1024).toFixed(2)} KB`);
  console.log(`   - Average Template Size: ${templateCount > 0 ? (templatePayloadBytes / templateCount).toFixed(0) : 0} bytes/template`);

  console.log('\n=== BENCHMARKS COMPLETED SUCCESSFULLY ===');
  process.exit(0);
}

runPerformanceBenchmarks().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});

