/**
 * C3A — EXACT CELEX-ONLY legal source binding.
 *
 * The completed C3 audit proved exactly ONE canonical identifier path that can be
 * matched deterministically against the existing registry:
 *
 *   CDI row.celex  →  LegalSource.sourceKey = 'EU-' + <normalized CELEX>
 *                  →  exactly one LegalSourceVersion with status=ACTIVE and
 *                     reviewStatus=APPROVED.
 *
 * No other identifier path is authorized. There is deliberately NO ELI
 * derivation, NO ECLI / caseId / authority-decision matching, NO source-URL
 * matching, NO locator matching, NO title matching, NO Hungarian act parsing and
 * NO external lookup. A value this module cannot match EXACTLY stays unresolved.
 *
 * IMMUTABILITY: this module only READS the canonical registry. It never creates
 * or updates LegalSource / LegalSourceVersion / RequirementCitation rows, and the
 * ingestion service calls it only while a brand new DocumentVersion's rows are
 * being created — never to backfill an existing anchor row.
 *
 * INTERNAL ONLY: the result of this resolver is internal binding metadata. It is
 * never projected to a customer surface.
 */
import type { PrismaClient } from '@prisma/client';

type Db = PrismaClient;

/**
 * The CELEX token shape proven by the repository's own canonical data:
 *   EU-32016R0679 (GDPR) and EU-32022L2555 (NIS2) → both `3<year><type><number>`.
 *
 * Anything else is unresolved by design. No punctuation is stripped and no
 * leading zeros are added: a value that does not already carry this exact shape
 * is not treated as CELEX, so a malformed or foreign identifier can never bind.
 */
const CELEX_TOKEN = /^3[0-9]{4}[A-Z][0-9]{4}$/;

/** Prefix used by the canonical registry convention for EU instruments. */
export const CELEX_SOURCE_KEY_PREFIX = 'EU-';

export type CelexBindingUnresolvedReason =
  | 'NO_CELEX'
  | 'INVALID_CELEX'
  | 'SOURCE_NOT_FOUND'
  | 'NO_BINDABLE_VERSION'
  | 'AMBIGUOUS_BINDABLE_VERSION';

export interface CelexBindingSource {
  id: string;
  sourceKey: string;
  canonicalCitation: string | null;
  title: string | null;
}

export interface CelexBindingVersion {
  id: string;
  legalSourceId: string;
  status: string;
  reviewStatus: string;
}

export type CelexBindingDecision =
  | {
      status: 'RESOLVED';
      normalizedCelex: string;
      canonicalSourceKey: string;
      legalSourceId: string;
      legalSourceVersionId: string;
      canonicalCitation: string | null;
      canonicalTitle: string | null;
    }
  | {
      status: 'UNRESOLVED';
      reason: CelexBindingUnresolvedReason;
      normalizedCelex: string | null;
    };

const unresolved = (
  reason: CelexBindingUnresolvedReason,
  normalizedCelex: string | null,
): CelexBindingDecision => ({ status: 'UNRESOLVED', reason, normalizedCelex });

/**
 * Minimal, deterministic CELEX normalization: trim, uppercase, and accept only
 * the exact proven token shape. Returns null when the value is absent or is not
 * that shape — it never repairs, derives or guesses a CELEX.
 */
export function normalizeCelex(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const token = String(raw).trim().toUpperCase();
  if (!token) return null;
  return CELEX_TOKEN.test(token) ? token : null;
}

/** The canonical `sourceKey` a normalized CELEX would have. */
export function sourceKeyForCelex(normalizedCelex: string): string {
  return `${CELEX_SOURCE_KEY_PREFIX}${normalizedCelex}`;
}

/**
 * Pure binding decision. Exactly one bindable version is required; ambiguity is
 * never resolved by date, recency or ordering.
 */
export function decideCelexBinding(input: {
  rawCelex: string | null | undefined;
  source: CelexBindingSource | null;
  versions: CelexBindingVersion[];
}): CelexBindingDecision {
  const hasRaw = input.rawCelex !== null && input.rawCelex !== undefined && String(input.rawCelex).trim() !== '';
  if (!hasRaw) return unresolved('NO_CELEX', null);

  const normalizedCelex = normalizeCelex(input.rawCelex);
  if (!normalizedCelex) return unresolved('INVALID_CELEX', null);

  if (!input.source) return unresolved('SOURCE_NOT_FOUND', normalizedCelex);

  const bindable = input.versions.filter(
    (version) =>
      version.legalSourceId === input.source!.id &&
      version.status === 'ACTIVE' &&
      version.reviewStatus === 'APPROVED',
  );
  if (bindable.length === 0) return unresolved('NO_BINDABLE_VERSION', normalizedCelex);
  if (bindable.length > 1) return unresolved('AMBIGUOUS_BINDABLE_VERSION', normalizedCelex);

  return {
    status: 'RESOLVED',
    normalizedCelex,
    canonicalSourceKey: input.source.sourceKey,
    legalSourceId: input.source.id,
    legalSourceVersionId: bindable[0].id,
    canonicalCitation: input.source.canonicalCitation ?? null,
    canonicalTitle: input.source.title ?? null,
  };
}

const emptyDecision = (reason: CelexBindingUnresolvedReason): CelexBindingDecision =>
  unresolved(reason, null);

/**
 * Batch read-time resolution for many rows at once (no N+1): one query for the
 * candidate sources and one for their versions.
 *
 * Keys of the returned map are the caller's row identifiers.
 */
export async function resolveCelexBindings<TRow extends { celex: string | null }>(
  rows: Array<{ key: string; row: TRow }>,
  prisma: Db,
): Promise<Map<string, CelexBindingDecision>> {
  const result = new Map<string, CelexBindingDecision>();
  const normalizedByKey = new Map<string, string | null>();

  for (const entry of rows) {
    const raw = entry.row.celex;
    if (raw === null || raw === undefined || String(raw).trim() === '') {
      result.set(entry.key, emptyDecision('NO_CELEX'));
      continue;
    }
    const normalized = normalizeCelex(raw);
    if (!normalized) {
      result.set(entry.key, emptyDecision('INVALID_CELEX'));
      continue;
    }
    normalizedByKey.set(entry.key, normalized);
  }

  const sourceKeys = [...new Set([...normalizedByKey.values()].filter((value): value is string => Boolean(value)))].map(sourceKeyForCelex);
  if (sourceKeys.length === 0) return result;

  const sources = await prisma.legalSource.findMany({
    where: { sourceKey: { in: sourceKeys } },
    select: { id: true, sourceKey: true, canonicalCitation: true, title: true },
  });
  const versionRows = sources.length
    ? await prisma.legalSourceVersion.findMany({
        where: { legalSourceId: { in: sources.map((source) => source.id) } },
        select: { id: true, legalSourceId: true, status: true, reviewStatus: true },
      })
    : [];

  for (const [key, normalized] of normalizedByKey.entries()) {
    const sourceKey = sourceKeyForCelex(normalized!);
    const source = sources.find((candidate) => candidate.sourceKey === sourceKey) ?? null;
    result.set(
      key,
      decideCelexBinding({
        rawCelex: normalized,
        source: source
          ? {
              id: source.id,
              sourceKey: source.sourceKey,
              canonicalCitation: source.canonicalCitation ?? null,
              title: source.title ?? null,
            }
          : null,
        versions: versionRows,
      }),
    );
  }

  return result;
}

/** Single-row convenience wrapper over the batch resolver. */
export async function resolveCelexBinding(
  celex: string | null,
  prisma: Db,
): Promise<CelexBindingDecision> {
  const bindings = await resolveCelexBindings([{ key: 'row', row: { celex } }], prisma);
  return bindings.get('row') ?? emptyDecision('NO_CELEX');
}
