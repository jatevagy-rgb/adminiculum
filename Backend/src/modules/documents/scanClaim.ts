/**
 * Cross-process scan claim — session-scoped PostgreSQL advisory lock keyed
 * deterministically from a DocumentVersion.id.
 *
 * SECURITY INVARIANT: for one immutable DocumentVersion, AT MOST ONE effective
 * malware scan may run at a time ACROSS ALL backend processes. This closes the
 * "temporary CLEAN exposure" window where process A holds an in-flight scan that
 * will return INFECTED while process B independently scans the same bytes and
 * publishes CLEAN first.
 *
 * An in-process Map cannot provide this guarantee (each process has its own).
 * A session-level advisory lock held on a DEDICATED connection is used instead:
 *   - the lock belongs to one dedicated DB session, not Prisma's shared pool;
 *   - connection/process death releases the session lock automatically;
 *   - the lock is released in a finally before the session returns to the pool;
 *   - only the SAME version is serialized (different versions use different
 *     keys and remain independently scannable).
 */
import crypto from 'crypto';
import { Pool } from 'pg';

let claimPool: Pool | null = null;

/** Bounded, dedicated pool. Separate from Prisma's pool so an advisory lock can
 *  be held on a single session for the exact duration of one scanner call. */
function getClaimPool(): Pool {
  if (claimPool) return claimPool;
  const url = process.env.DATABASE_URL || '';
  // Azure PostgreSQL requires SSL when the connection string asks for it;
  // local/CI DBs without sslmode connect plaintext, mirroring Prisma.
  const wantsSsl = /[?&]sslmode=(require|verify-ca|verify-full|no-verify)/.test(url);
  claimPool = new Pool({
    connectionString: url,
    max: 10,
    ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    // Idle claim connections must not hold the process open (tests / shutdown).
    allowExitOnIdle: true,
  });
  // Prevent an idle client error from crashing the process; the next acquire
  // simply opens a fresh connection.
  claimPool.on('error', () => { /* swallow; no sensitive detail logged */ });
  return claimPool;
}

/** Close the dedicated claim pool (tests / graceful shutdown). */
export async function closeScanClaimPool(): Promise<void> {
  if (claimPool) {
    const p = claimPool;
    claimPool = null;
    await p.end();
  }
}

/**
 * Deterministic 64-bit claim key from a version id (UUID string). Two int4
 * halves avoid bigint serialization edge cases. A collision only over-serializes
 * two different versions (availability), never weakens the security invariant.
 */
export function scanClaimKey(versionId: string): [number, number] {
  const digest = crypto.createHash('sha256').update(`scan-claim:${versionId}`).digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
}

export interface ScanClaimResult<T> {
  acquired: boolean;
  result?: T;
}

/**
 * Run `fn` while holding the cross-process scan claim for `versionId`. Returns
 * { acquired: false } (without invoking `fn`) when another process already owns
 * the same version's scan.
 */
export async function withScanClaim<T>(versionId: string, fn: () => Promise<T>): Promise<ScanClaimResult<T>> {
  const pool = getClaimPool();
  const client = await pool.connect();
  const [hi, lo] = scanClaimKey(versionId);
  try {
    const lockRes = await client.query('SELECT pg_try_advisory_lock($1::int, $2::int)', [hi, lo]);
    const acquired = lockRes.rows?.[0]?.pg_try_advisory_lock === true;
    if (!acquired) {
      return { acquired: false };
    }
    try {
      const result = await fn();
      return { acquired: true, result };
    } finally {
      // Release every session advisory lock before returning the session to the
      // pool so a leaked lock can never outlive this scan.
      try {
        await client.query('SELECT pg_advisory_unlock_all()');
      } catch {
        /* session is already dying; the connection close releases the lock */
      }
    }
  } finally {
    client.release();
  }
}
