/**
 * GWO-1 — developer-facing dry-run CLI.
 *
 * Modes:
 *   --dry-run            (default) one bounded live search, diff against the
 *                        service-local capture store, then update the store.
 *   --no-commit          same diff without updating the capture store.
 *   --replay <file>      offline replay of a captured official response
 *                        (search envelope, TopicDetails object, or a
 *                        { searchResults: [...] } fixture). No network.
 *   --state-dir <path>   capture-store directory override.
 *
 * The dry-run NEVER touches Adminiculum. Exit code 0 on a processed run
 * (including explicit record rejections), 1 when the source fetch failed.
 */

import { readFileSync } from 'node:fs';
import type { NormalizedExternalOpportunity } from './types.ts';
import { validateNormalizedOpportunity } from './types.ts';
import type { OpportunityVariantInput } from './normalize/variant.ts';
import { groupVariants, toNormalizedOpportunity } from './normalize/multilingual.ts';
import { CaptureStore, captureKey } from './capture/store.ts';
import { classifyBatch } from './diff/classify.ts';
import { assertPrivacySafe } from './privacy.ts';
import { buildDryRunReport } from './report.ts';
import type { DryRunReport } from './report.ts';
import { loadFundingTendersReference } from './reference/fundingTendersReference.ts';
import type { AdapterResult } from './adapters/fundingTenders/index.ts';
import { runFundingTendersAdapter } from './adapters/fundingTenders/index.ts';
import { normalizeFundingTendersRecord } from './adapters/fundingTenders/normalize.ts';

export interface CliOptions {
  mode: 'dry-run' | 'no-commit';
  replayPath: string | null;
  stateDir: string | null;
}

export function parseCliArgs(argv: readonly string[]): CliOptions {
  let mode: CliOptions['mode'] = 'dry-run';
  let replayPath: string | null = null;
  let stateDir: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? '';
    if (arg === '--no-commit') {
      mode = 'no-commit';
    } else if (arg === '--dry-run') {
      mode = 'dry-run';
    } else if (arg === '--replay') {
      replayPath = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === '--state-dir') {
      stateDir = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        'Usage: node src/index.ts [--dry-run|--no-commit] [--replay <file>] [--state-dir <path>]\n',
      );
      process.exit(0);
    }
  }
  return { mode, replayPath, stateDir };
}

function loadReplayRecords(replayPath: string): { rawRecords: unknown[]; fetchedCount: number } {
  const text = readFileSync(replayPath, 'utf8');
  const parsed: unknown = JSON.parse(text);
  if (Array.isArray(parsed)) {
    return { rawRecords: parsed, fetchedCount: parsed.length };
  }
  if (parsed !== null && typeof parsed === 'object') {
    const row = parsed as Record<string, unknown>;
    if (Array.isArray(row['searchResults'])) {
      const records = row['searchResults'];
      return { rawRecords: records, fetchedCount: records.length };
    }
    if (Array.isArray(row['results'])) {
      const records = row['results'];
      return { rawRecords: records, fetchedCount: records.length };
    }
    if (row['TopicDetails'] !== undefined) {
      return { rawRecords: [parsed], fetchedCount: 1 };
    }
    return { rawRecords: [parsed], fetchedCount: 1 };
  }
  return { rawRecords: [parsed], fetchedCount: 1 };
}

function buildOpportunities(
  variants: readonly OpportunityVariantInput[],
  observedAt: string,
): { opportunities: NormalizedExternalOpportunity[]; rejectedCount: number } {
  const opportunities: NormalizedExternalOpportunity[] = [];
  let rejectedCount = 0;
  for (const group of groupVariants(variants)) {
    const opportunity = toNormalizedOpportunity(group, observedAt);
    assertPrivacySafe(opportunity, `opportunity:${opportunity.sourceIdentifier}`);
    const validation = validateNormalizedOpportunity(opportunity);
    if (!validation.ok) {
      rejectedCount += 1;
      continue;
    }
    opportunities.push(opportunity);
  }
  return { opportunities, rejectedCount };
}

export async function runCli(options: CliOptions): Promise<{ report: DryRunReport; exitCode: number }> {
  const observedAt = new Date().toISOString();
  const reference = loadFundingTendersReference();
  const store = new CaptureStore(options.stateDir ?? undefined);
  const previousLastSuccess = store.all().length > 0 ? store.all()[store.all().length - 1]?.lastObservedAt ?? null : null;

  let adapter: AdapterResult;
  if (options.replayPath !== null) {
    const { rawRecords, fetchedCount } = loadReplayRecords(options.replayPath);
    const variants: OpportunityVariantInput[] = [];
    const rejections: { reason: string; detail: string | null }[] = [];
    for (const raw of rawRecords) {
      const outcome = normalizeFundingTendersRecord(raw, reference);
      if (outcome.ok) variants.push(outcome.variant);
      else rejections.push(outcome.rejection);
    }
    adapter = {
      source: 'EU_FUNDING_TENDERS',
      health: 'ACTIVE',
      healthReason: 'Replay: captured official response processed (not a live fetch).',
      requestedAt: observedAt,
      completedAt: observedAt,
      lastSuccessAt: previousLastSuccess,
      fetchedCount,
      normalizedCount: variants.length,
      rejectedCount: rejections.length,
      enrichedCount: 0,
      enrichmentRejectedCount: 0,
      variants,
      rejections,
    };
  } else {
    adapter = await runFundingTendersAdapter({ reference, lastSuccessAt: previousLastSuccess });
  }

  if (adapter.health === 'ERROR') {
    const report = buildDryRunReport(
      {
        source: 'EU_FUNDING_TENDERS',
        health: adapter.health,
        healthReason: adapter.healthReason,
        requestedAt: adapter.requestedAt,
        completedAt: adapter.completedAt,
        lastSuccessAt: adapter.lastSuccessAt,
        fetchedCount: 0,
        normalizedCount: 0,
        rejectedCount: 0,
        opportunities: [],
        diff: null,
        errorCode: 'SOURCE_FAILURE',
        errorMessage: adapter.healthReason,
      },
      options.mode,
      new Date().toISOString(),
    );
    assertPrivacySafe(report, 'report');
    return { report, exitCode: 1 };
  }

  const { opportunities, rejectedCount: invalidCount } = buildOpportunities(adapter.variants, observedAt);
  const diff = classifyBatch(opportunities, (source, sourceIdentifier) => store.get(captureKey(source, sourceIdentifier)));
  if (options.mode === 'dry-run') {
    for (const opportunity of opportunities) {
      store.upsert(opportunity);
    }
    store.save(new Date().toISOString());
  }

  const report = buildDryRunReport(
    {
      source: 'EU_FUNDING_TENDERS',
      health: adapter.health,
      healthReason: adapter.healthReason,
      requestedAt: adapter.requestedAt,
      completedAt: adapter.completedAt,
      lastSuccessAt: adapter.lastSuccessAt,
      fetchedCount: adapter.fetchedCount,
      normalizedCount: opportunities.length,
      rejectedCount: adapter.rejectedCount + invalidCount,
      opportunities,
      diff,
      errorCode: null,
      errorMessage: null,
    },
    options.mode,
    new Date().toISOString(),
  );
  assertPrivacySafe(report, 'report');
  return { report, exitCode: 0 };
}
