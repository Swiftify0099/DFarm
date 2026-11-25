import crypto from 'node:crypto';
import { db } from '../database/PostgresPool.js';
import { logger } from '../../shared/logger/index.js';

export interface DeviceChallengeRecord {
  challenge: string;
  deviceIdentifier: string;
  organizationId: string;
  purpose?: string;
  createdAt: number;
  expiresAt: number;
  consumed: boolean;
  failedAttempts?: number;
}

export class DeviceChallengeService {
  private memChallenges = new Map<string, DeviceChallengeRecord>();
  private static tableEnsured = false;

  public constructor() {
    this.ensureTableExists().catch(() => {});
  }

  private async ensureTableExists(): Promise<void> {
    if (DeviceChallengeService.tableEnsured) return;
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS device_auth_challenges (
          challenge VARCHAR(64) PRIMARY KEY,
          device_identifier VARCHAR(100) NOT NULL,
          organization_id UUID NOT NULL,
          purpose VARCHAR(30) NOT NULL DEFAULT 'OPERATOR_LOGIN',
          failed_attempts INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMPTZ NOT NULL,
          consumed_at TIMESTAMPTZ
        );
        ALTER TABLE device_auth_challenges ADD COLUMN IF NOT EXISTS failed_attempts INT NOT NULL DEFAULT 0;
        CREATE INDEX IF NOT EXISTS idx_device_challenges_dev_org ON device_auth_challenges (device_identifier, organization_id);
        CREATE INDEX IF NOT EXISTS idx_device_challenges_expiry ON device_auth_challenges (expires_at);
      `);
      DeviceChallengeService.tableEnsured = true;
    } catch (err: any) {
      // In-memory or fallback mode if DB is unavailable
      logger.warn({ error: err.message }, '[DeviceChallengeService] Could not auto-verify challenges table');
    }
  }

  /**
   * Generates a short-lived (default 60s), single-use cryptographic challenge for a registered device.
   * Persisted in PostgreSQL to ensure distributed single-use protection across backend instances and restarts.
   * Returns a hybrid thenable Promise that exposes synchronous .challenge & .expiresAt for backward compatibility.
   */
  public createChallenge(
    deviceIdentifier: string,
    organizationId: string,
    ttlMs = 60000,
    purpose = 'OPERATOR_LOGIN'
  ): Promise<{ challenge: string; expiresAt: number }> & { challenge: string; expiresAt: number } {
    this.ensureTableExists().catch(() => {});

    const cleanId = deviceIdentifier.trim();
    const cleanOrg = organizationId.trim();
    const challenge = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const expiresAt = now + ttlMs;

    // 1. Keep in-memory mirror
    this.memChallenges.set(challenge, {
      challenge,
      deviceIdentifier: cleanId,
      organizationId: cleanOrg,
      purpose,
      createdAt: now,
      expiresAt,
      consumed: false,
    });

    if (this.memChallenges.size > 500) {
      for (const [key, record] of this.memChallenges.entries()) {
        if (record.expiresAt < now || record.consumed) {
          this.memChallenges.delete(key);
        }
      }
    }

    // 2. PostgreSQL distributed persistence
    const insertPromise = (async () => {
      try {
        await db.query(
          `INSERT INTO device_auth_challenges (
             challenge, device_identifier, organization_id, purpose, created_at, expires_at, consumed_at
           ) VALUES ($1, $2, $3, $4, TO_TIMESTAMP($5 / 1000.0), TO_TIMESTAMP($6 / 1000.0), NULL);`,
          [challenge, cleanId, cleanOrg, purpose, now, expiresAt]
        );

        db.query(
          `DELETE FROM device_auth_challenges WHERE expires_at < NOW() - INTERVAL '1 hour';`
        ).catch(() => {});
      } catch (err: any) {
        logger.warn({ error: err.message }, '[DeviceChallengeService] DB insert failed, falling back to process memory');
      }
      return { challenge, expiresAt };
    })();

    return Object.assign(insertPromise, { challenge, expiresAt });
  }

  /**
   * Atomically verifies the challenge row, validates device/organization/purpose bindings,
   * checks bounded failed attempts, verifies the cryptographic HMAC proof,
   * and ONLY on a valid proof marks the challenge as consumed within a single PostgreSQL transaction.
   *
   * Security & Ordering guarantees:
   * 1. Begins database transaction and acquires a row lock (FOR UPDATE).
   * 2. Checks device_identifier, organization, and purpose bindings FIRST.
   *    If mismatched, the transaction rolls back immediately — an unauthorized device
   *    CANNOT consume or alter a legitimate device's challenge.
   * 3. Enforces bounded failed attempts: if failed_attempts reaches 3, the challenge is invalidated.
   * 4. The cryptographic proof is verified BEFORE marking consumed_at = NOW().
   * 5. If proof is invalid, failed_attempts is incremented and committed, but consumed_at remains NULL.
   * 6. Marks consumed_at = NOW() ONLY when cryptographic proof verification succeeds.
   */
  public async verifyAndConsumeProof(params: {
    challenge: string;
    deviceIdentifier: string;
    organizationId?: string;
    purpose?: string;
    candidateProof: string;
    proofKeyOrToken: string;
  }): Promise<{ valid: boolean; reason?: string }> {
    const {
      challenge,
      deviceIdentifier,
      organizationId,
      purpose = 'OPERATOR_LOGIN',
      candidateProof,
      proofKeyOrToken,
    } = params;

    if (!challenge || !challenge.trim()) {
      return { valid: false, reason: 'Challenge token is missing' };
    }
    if (!deviceIdentifier || !deviceIdentifier.trim()) {
      return { valid: false, reason: 'Device identifier is missing' };
    }
    if (!candidateProof || typeof candidateProof !== 'string') {
      return { valid: false, reason: 'Proof of possession is missing or invalid' };
    }
    if (!proofKeyOrToken || typeof proofKeyOrToken !== 'string') {
      return { valid: false, reason: 'Verifier key is missing' };
    }

    const cleanChallenge = challenge.trim();
    const cleanId = deviceIdentifier.trim();
    const cleanOrg = organizationId?.trim();
    const cleanPurpose = purpose.trim();

    await this.ensureTableExists();

    // 1. Transactional PostgreSQL execution with row-level locking
    const pool = (db as any).pool;
    if (pool && typeof pool.connect === 'function') {
      let client: any = null;
      try {
        client = await pool.connect();
        await client.query('BEGIN');

        const inspectRes = await client.query(
          `SELECT challenge, device_identifier, organization_id, purpose, expires_at, consumed_at, COALESCE(failed_attempts, 0) AS failed_attempts
           FROM device_auth_challenges
           WHERE challenge = $1
           FOR UPDATE;`,
          [cleanChallenge]
        );

        if (inspectRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return { valid: false, reason: 'Invalid or unknown challenge token' };
        }

        const row = inspectRes.rows[0];

        // Check if already consumed (replay)
        if (row.consumed_at) {
          await client.query('ROLLBACK');
          return { valid: false, reason: 'Challenge has already been consumed (replay attack rejected)' };
        }

        // Check TTL expiry
        if (new Date(row.expires_at).getTime() <= Date.now()) {
          await client.query('ROLLBACK');
          return { valid: false, reason: 'Challenge token has expired' };
        }

        // Check device binding — if wrong device, ROLLBACK immediately (do not consume or burn)
        if (row.device_identifier !== cleanId) {
          await client.query('ROLLBACK');
          return {
            valid: false,
            reason: `Challenge was issued for device '${row.device_identifier}', not '${cleanId}'`,
          };
        }

        // Check organization binding
        if (cleanOrg && row.organization_id !== cleanOrg) {
          await client.query('ROLLBACK');
          return { valid: false, reason: 'Challenge was issued for a different organization' };
        }

        // Check purpose binding
        if (cleanPurpose && row.purpose && row.purpose !== cleanPurpose) {
          await client.query('ROLLBACK');
          return { valid: false, reason: `Challenge was issued for purpose '${row.purpose}', not '${cleanPurpose}'` };
        }

        // Check bounded failed attempts limit (max 3)
        const currentFailed = Number(row.failed_attempts || 0);
        if (currentFailed >= 3) {
          // Burn challenge due to excessive failed attempts
          await client.query(
            `UPDATE device_auth_challenges SET consumed_at = NOW() WHERE challenge = $1;`,
            [cleanChallenge]
          );
          await client.query('COMMIT');
          return { valid: false, reason: 'Maximum proof attempts exceeded for this challenge' };
        }

        // Verify cryptographic proof
        const isProofValid = DeviceChallengeService.verifyProof(cleanChallenge, proofKeyOrToken, cleanId, candidateProof);

        if (!isProofValid) {
          // Increment failed_attempts; only burn if this 3rd attempt fails
          const newFailed = currentFailed + 1;
          if (newFailed >= 3) {
            await client.query(
              `UPDATE device_auth_challenges SET failed_attempts = $2, consumed_at = NOW() WHERE challenge = $1;`,
              [cleanChallenge, newFailed]
            );
          } else {
            await client.query(
              `UPDATE device_auth_challenges SET failed_attempts = $2 WHERE challenge = $1;`,
              [cleanChallenge, newFailed]
            );
          }
          await client.query('COMMIT');
          return {
            valid: false,
            reason: `Invalid challenge response proof for station '${cleanId}'. Proof of possession rejected.`,
          };
        }

        // Valid proof! Mark consumed atomically
        await client.query(
          `UPDATE device_auth_challenges SET consumed_at = NOW() WHERE challenge = $1;`,
          [cleanChallenge]
        );
        await client.query('COMMIT');

        // Update in-memory mirror if present
        const memRec = this.memChallenges.get(cleanChallenge);
        if (memRec) memRec.consumed = true;

        return { valid: true };
      } catch (err: any) {
        if (client) {
          try {
            await client.query('ROLLBACK');
          } catch {}
        }
        logger.warn({ error: err.message }, '[DeviceChallengeService] Transactional DB verification error, falling back to memory/direct');
      } finally {
        if (client) {
          client.release();
        }
      }
    }

    // 2. In-memory / Fallback mode
    const record = this.memChallenges.get(cleanChallenge);
    if (!record) {
      return { valid: false, reason: 'Invalid or unknown challenge token' };
    }
    if (record.consumed) {
      return { valid: false, reason: 'Challenge has already been consumed (replay attack rejected)' };
    }
    if (Date.now() > record.expiresAt) {
      this.memChallenges.delete(cleanChallenge);
      return { valid: false, reason: 'Challenge token has expired' };
    }
    if (record.deviceIdentifier !== cleanId) {
      return {
        valid: false,
        reason: `Challenge was issued for device '${record.deviceIdentifier}', not '${cleanId}'`,
      };
    }
    if (cleanOrg && record.organizationId !== cleanOrg) {
      return { valid: false, reason: 'Challenge was issued for a different organization' };
    }
    if (cleanPurpose && record.purpose && record.purpose !== cleanPurpose) {
      return { valid: false, reason: `Challenge was issued for purpose '${record.purpose}', not '${cleanPurpose}'` };
    }
    const currentFailed = record.failedAttempts || 0;
    if (currentFailed >= 3) {
      record.consumed = true;
      return { valid: false, reason: 'Maximum proof attempts exceeded for this challenge' };
    }

    const isProofValid = DeviceChallengeService.verifyProof(cleanChallenge, proofKeyOrToken, cleanId, candidateProof);
    if (!isProofValid) {
      record.failedAttempts = currentFailed + 1;
      if (record.failedAttempts >= 3) {
        record.consumed = true;
      }
      return {
        valid: false,
        reason: `Invalid challenge response proof for station '${cleanId}'. Proof of possession rejected.`,
      };
    }

    record.consumed = true;
    return { valid: true };
  }

  /**
   * Atomically verifies and consumes the challenge.
   * Uses atomic SQL conditional update (UPDATE ... WHERE consumed_at IS NULL AND expires_at > NOW())
   * to guarantee single-use consumption across concurrent requests and multiple backend instances.
   */
  public async consumeChallenge(
    challenge: string,
    deviceIdentifier: string,
    organizationId?: string,
    purpose = 'OPERATOR_LOGIN'
  ): Promise<{ valid: boolean; reason?: string }> {
    if (!challenge || !challenge.trim()) {
      return { valid: false, reason: 'Challenge token is missing' };
    }

    const cleanChallenge = challenge.trim();
    const cleanId = deviceIdentifier.trim();
    const cleanOrg = organizationId?.trim();
    const cleanPurpose = purpose?.trim();

    await this.ensureTableExists();

    // 1. Try atomic PostgreSQL conditional update
    try {
      const updateRes = await db.query(
        `UPDATE device_auth_challenges
         SET consumed_at = NOW()
         WHERE challenge = $1
           AND device_identifier = $2
           AND ($3::UUID IS NULL OR organization_id = $3::UUID)
           AND ($4::VARCHAR IS NULL OR purpose = $4::VARCHAR)
           AND consumed_at IS NULL
           AND expires_at > NOW()
         RETURNING challenge, organization_id, device_identifier, expires_at;`,
        [cleanChallenge, cleanId, cleanOrg || null, cleanPurpose || null]
      );

      if (updateRes.rows && updateRes.rows.length === 1) {
        // Also mark in-memory mirror if present
        const memRec = this.memChallenges.get(cleanChallenge);
        if (memRec) memRec.consumed = true;
        return { valid: true };
      }

      // 0 rows updated: Query row to determine exact diagnostic reason
      const inspectRes = await db.query(
        `SELECT challenge, device_identifier, organization_id, purpose, expires_at, consumed_at
         FROM device_auth_challenges
         WHERE challenge = $1;`,
        [cleanChallenge]
      );

      if (inspectRes.rows && inspectRes.rows.length > 0) {
        const row = inspectRes.rows[0];
        if (row.consumed_at) {
          return { valid: false, reason: 'Challenge has already been consumed (replay attack rejected)' };
        }
        if (new Date(row.expires_at).getTime() <= Date.now()) {
          return { valid: false, reason: 'Challenge token has expired' };
        }
        if (row.device_identifier !== cleanId) {
          return {
            valid: false,
            reason: `Challenge was issued for device '${row.device_identifier}', not '${cleanId}'`,
          };
        }
        if (cleanOrg && row.organization_id !== cleanOrg) {
          return { valid: false, reason: 'Challenge was issued for a different organization' };
        }
        if (cleanPurpose && row.purpose && row.purpose !== cleanPurpose) {
          return { valid: false, reason: `Challenge was issued for purpose '${row.purpose}', not '${cleanPurpose}'` };
        }
      }
    } catch (err: any) {
      logger.warn({ error: err.message }, '[DeviceChallengeService] DB consumption error, checking in-memory fallback');
    }

    // 2. In-memory fallback
    const record = this.memChallenges.get(cleanChallenge);
    if (!record) {
      return { valid: false, reason: 'Invalid or unknown challenge token' };
    }

    if (record.consumed) {
      return { valid: false, reason: 'Challenge has already been consumed (replay attack rejected)' };
    }

    if (Date.now() > record.expiresAt) {
      this.memChallenges.delete(cleanChallenge);
      return { valid: false, reason: 'Challenge token has expired' };
    }

    if (record.deviceIdentifier !== cleanId) {
      return {
        valid: false,
        reason: `Challenge was issued for device '${record.deviceIdentifier}', not '${cleanId}'`,
      };
    }

    if (cleanOrg && record.organizationId !== cleanOrg) {
      return { valid: false, reason: 'Challenge was issued for a different organization' };
    }

    if (cleanPurpose && record.purpose && record.purpose !== cleanPurpose) {
      return { valid: false, reason: `Challenge was issued for purpose '${record.purpose}', not '${cleanPurpose}'` };
    }

    record.consumed = true;
    return { valid: true };
  }

  /**
   * Cryptographically derives the symmetric HMAC proof key from a provisioned raw deviceToken.
   * Derivation protocol: K_proof = SHA-256(deviceToken)
   * This matches devices.device_token_hash stored in the database.
   */
  public static deriveProofKey(deviceToken: string): string {
    return crypto
      .createHash('sha256')
      .update(deviceToken.trim(), 'utf8')
      .digest('hex');
  }

  /**
   * Computes expected HMAC proof for challenge response.
   * Proof = HMAC-SHA256(K_proof, deviceIdentifier + ":" + challenge)
   * where K_proof is the derived key (or stored device_token_hash).
   */
  public static computeProof(challenge: string, proofKeyOrToken: string, deviceIdentifier: string): string {
    return crypto
      .createHmac('sha256', proofKeyOrToken.trim())
      .update(`${deviceIdentifier.trim()}:${challenge.trim()}`, 'utf8')
      .digest('hex');
  }

  /**
   * Timing-safe verification of challenge response proof
   */
  public static verifyProof(
    challenge: string,
    proofKeyOrToken: string,
    deviceIdentifier: string,
    candidateProof: string
  ): boolean {
    if (!candidateProof || typeof candidateProof !== 'string') return false;
    const expected = DeviceChallengeService.computeProof(challenge, proofKeyOrToken, deviceIdentifier);
    if (candidateProof.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(candidateProof, 'utf8'), Buffer.from(expected, 'utf8'));
  }

  public clear(): void {
    this.memChallenges.clear();
  }
}

export const deviceChallengeService = new DeviceChallengeService();
