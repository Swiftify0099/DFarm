import pg from 'pg';

async function seed() {
  const client = new pg.Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
  await client.connect();

  await client.query(`
    INSERT INTO system_configurations (config_key, config_value, description, is_approved)
    VALUES 
      (
        'face_recognition_calibration',
        '{"modelName":"MobileFaceNet-ArcFace","modelVersion":"v1.0.0","embeddingDimension":512,"similarityMetric":"COSINE","recommendedThreshold":0.720,"modelArtifactChecksum":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","artifactStatus":"UNVERIFIED_EMPTY_DIGEST","calibrationStatus":"STAGING_UNVERIFIED","isApprovedForProduction":false,"failSafeBehavior":"REJECT_OR_FALLBACK_TO_RFID"}'::jsonb,
        'Centralized face recognition model version and calibration threshold configuration',
        false
      ),
      (
        'canonical_measurement_contract',
        '{"canonicalQuantityUnit":"KG","canonicalPricingUnit":"PER_KG","defaultQuantityUnit":"KG","defaultPricingUnit":"PER_KG","rejectUnapprovedConversions":true,"independentVolumeAllowed":true,"silentConversionAllowed":false}'::jsonb,
        'Canonical measurement units and explicit pricing unit contracts',
        true
      )
    ON CONFLICT DO NOTHING;
  `);

  const res = await client.query('SELECT config_key, config_value FROM system_configurations;');
  console.log('Seeded configurations:', res.rows);
  await client.end();
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});

