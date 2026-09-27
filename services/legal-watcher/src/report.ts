/**
 * Run report: deterministic machine-readable JSON + human summary.
 *
 * The report explicitly proves ADMINICULUM_BACKEND_WRITES for the run:
 * dry-run reports 0; DELIVER mode reports backend-confirmed ACCEPTED
 * observations (duplicates wrote nothing). It contains NO credentials, NO
 * tokens, NO customer identity, NO case/document data.
 */
import type {
  CelexRunResult,
  DeliveryMode,
  DeliveryReport,
  DryRunReport,
  ManifestCounts,
  ObservationEvent,
  OverallStatus,
  SanitizedError,
} from './types';
import { REPORT_SCHEMA_VERSION } from './types';

export interface BuildReportInput {
  manifestSchemaVersion: number;
  manifestCounts: ManifestCounts;
  runId: string;
  startedAt: string;
  completedAt: string;
  overallStatus: OverallStatus;
  celexResults: CelexRunResult[];
  observations: ObservationEvent[];
  sanitizedErrors: SanitizedError[];
  /** Optional W2 fields; absent means a W1 dry run. */
  dryRun?: boolean;
  deliveryMode?: DeliveryMode;
  delivery?: DeliveryReport | null;
  adminiculumBackendWrites?: number;
}

export function buildReport(input: BuildReportInput): DryRunReport {
  const celexResults = [...input.celexResults].sort((a, b) =>
    a.sourceIdentifier < b.sourceIdentifier ? -1 : a.sourceIdentifier > b.sourceIdentifier ? 1 : 0,
  );
  const observations = [...input.observations].sort((a, b) =>
    a.eventKey < b.eventKey ? -1 : a.eventKey > b.eventKey ? 1 : 0,
  );

  let newAmendmentCount = 0;
  let newConsolidatedVersionCount = 0;
  let metadataChangedCount = 0;
  let missingFromSourceCount = 0;
  for (const result of celexResults) {
    newAmendmentCount += result.newEvents.filter((e) => e.eventKind === 'AMENDMENT_PUBLISHED').length;
    newConsolidatedVersionCount += result.newEvents.filter(
      (e) => e.eventKind === 'CONSOLIDATED_VERSION_AVAILABLE',
    ).length;
    metadataChangedCount += result.metadataChangedKeys.length;
    missingFromSourceCount += result.missingFromSourceKeys.length;
  }

  const failedCelexCount = celexResults.filter((r) => r.status === 'SOURCE_ERROR').length;
  const successfulCelexCount = celexResults.length - failedCelexCount;
  const firstSeenBaselineCount = celexResults.filter((r) => r.status === 'FIRST_SEEN_BASELINE').length;
  const unchangedCount = celexResults.filter((r) => r.status === 'UNCHANGED').length;

  return {
    reportVersion: REPORT_SCHEMA_VERSION,
    manifestSchemaVersion: input.manifestSchemaVersion,
    runId: input.runId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    dryRun: input.dryRun ?? true,
    deliveryMode: input.deliveryMode ?? 'DRY_RUN',
    delivery: input.delivery ?? null,
    adminiculumBackendWrites: input.adminiculumBackendWrites ?? 0,
    overallStatus: input.overallStatus,
    manifest: input.manifestCounts,
    queriedCelexCount: celexResults.length,
    successfulCelexCount,
    failedCelexCount,
    firstSeenBaselineCount,
    unchangedCount,
    newAmendmentCount,
    newConsolidatedVersionCount,
    sourceErrorCount: failedCelexCount,
    metadataChangedCount,
    missingFromSourceCount,
    sanitizedErrors: input.sanitizedErrors,
    observations,
    celexResults: celexResults.map((r) => ({
      sourceIdentifier: r.sourceIdentifier,
      status: r.status,
      newAmendmentCount: r.newEvents.filter((e) => e.eventKind === 'AMENDMENT_PUBLISHED').length,
      newConsolidatedVersionCount: r.newEvents.filter(
        (e) => e.eventKind === 'CONSOLIDATED_VERSION_AVAILABLE',
      ).length,
      metadataChangedKeys: r.metadataChangedKeys,
      missingFromSourceKeys: r.missingFromSourceKeys,
    })),
  };
}

function renderDeliveryLines(report: DryRunReport): string[] {
  const delivery = report.delivery;
  if (delivery === null) return [];
  const lines: string[] = [];
  lines.push(
    `delivery: endpoint=${delivery.endpoint} candidates=${delivery.candidateCount} ` +
      `attempted=${delivery.attemptedCount} delivered=${delivery.deliveredCount} ` +
      `accepted=${delivery.acceptedCount} duplicate=${delivery.duplicateCount} ` +
      `rejected=${delivery.rejectedCount} error=${delivery.errorCount} ` +
      `pending=${delivery.pendingCount}`,
  );
  for (const batch of delivery.batches) {
    lines.push(
      `  batch ${batch.batchIndex}: observations=${batch.observationCount} ` +
        `http=${batch.httpStatus ?? '-'}` +
        (batch.errorCode === null ? '' : ` ${batch.errorCode}: ${batch.errorMessage ?? ''}`),
    );
  }
  return lines;
}

export function renderHumanSummary(report: DryRunReport): string {
  const lines: string[] = [];
  lines.push(
    `ADMINICULUM LEGAL WATCHER — ${report.dryRun ? 'W1 DRY RUN' : 'W2 DELIVERY RUN'}`,
  );
  lines.push(`runId=${report.runId}`);
  lines.push(`status=${report.overallStatus}`);
  lines.push(
    `manifest: sources=${report.manifest.manifestSourceCount} ` +
      `celexRefs=${report.manifest.celexReferenceCount} ` +
      `distinctCelex=${report.manifest.distinctCelexCount} ` +
      `nonCelexSkipped=${report.manifest.nonCelexSkipped} ` +
      `invalidCelex=${report.manifest.invalidCelexCount}`,
  );
  if (report.manifest.droppedIdentityFields.length > 0) {
    lines.push(`privacyGuardDropped=${report.manifest.droppedIdentityFields.join(',')}`);
  }
  lines.push(
    `celex: queried=${report.queriedCelexCount} successful=${report.successfulCelexCount} failed=${report.failedCelexCount}`,
  );
  lines.push(
    `diff: firstSeenBaseline=${report.firstSeenBaselineCount} unchanged=${report.unchangedCount} ` +
      `newAmendment=${report.newAmendmentCount} newConsolidatedVersion=${report.newConsolidatedVersionCount} ` +
      `sourceError=${report.sourceErrorCount} metadataChanged=${report.metadataChangedCount} ` +
      `missingFromSource=${report.missingFromSourceCount}`,
  );
  for (const result of report.celexResults) {
    lines.push(
      `  ${result.sourceIdentifier}: ${result.status}` +
        (result.newAmendmentCount > 0 ? ` (+${result.newAmendmentCount} amendment)` : '') +
        (result.newConsolidatedVersionCount > 0 ? ` (+${result.newConsolidatedVersionCount} consolidation)` : '') +
        (result.metadataChangedKeys.length > 0
          ? ` [metadataChanged=${result.metadataChangedKeys.length}]`
          : '') +
        (result.missingFromSourceKeys.length > 0
          ? ` [missingFromSource=${result.missingFromSourceKeys.length}]`
          : ''),
    );
  }
  if (report.sanitizedErrors.length > 0) {
    for (const err of report.sanitizedErrors) {
      lines.push(`  ERROR ${err.sourceIdentifier} [${err.phase}] ${err.code}: ${err.message}`);
    }
  }
  lines.push(...renderDeliveryLines(report));
  lines.push(`ADMINICULUM_BACKEND_WRITES=${report.adminiculumBackendWrites}`);
  lines.push(
    report.dryRun
      ? 'DRY RUN — no Adminiculum backend writes were performed.'
      : 'DELIVERY MODE — failed deliveries stay pending and retry on later runs.',
  );
  return lines.join('\n');
}
