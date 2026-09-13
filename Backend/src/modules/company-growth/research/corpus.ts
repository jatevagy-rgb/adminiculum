/**
 * GROW — research evidence corpus.
 *
 * The corpus is a small, curated library of external research evidence plus
 * client-internal evidence derived from canonical observations/measurements.
 *
 * Rigor rules (reconstructed from the interrupted implementation contract):
 * - Only VERIFIED entries may support a SUPPORTED recommendation.
 * - Provisional / unverifiable claims stay UNVERIFIED and are rendered as
 *   context, never as citation backing. They are INELIGIBLE for the
 *   sufficiency gate's "verified external evidence" requirement.
 * - Seeded entries are keyed by a stable corpusKey so seeding is idempotent.
 *
 * Verified citations are real publications with checked metadata:
 * - Goel, Bandara & Gable (2023), "Conceptualizing Business Process
 *   Standardization: A Review and Synthesis", Schmalenbach Journal of
 *   Business Research 75(2):195-237, DOI 10.1007/s41471-023-00158-y.
 */

import { EvidenceVerificationStatus, Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../prisma/prisma.service';
import { assertClientReadAccess, InternalActor } from '../../client-interaction/base';

type Db = PrismaClient | Prisma.TransactionClient;

export const EVIDENCE_KINDS = ['PAPER', 'BENCHMARK', 'INTERNAL_OBSERVATION', 'INTERNAL_MEASUREMENT', 'ORG_FACT'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const EVIDENCE_STRENGTHS = ['STRONG', 'MODERATE', 'WEAK'] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];

/** Problem-domain keys the seeded corpus can speak to. */
export const DOMAIN_KEYS = [
  'MANUAL_ADMIN_LOAD',
  'APPROVAL_DELAY',
  'DUPLICATE_DATA_ENTRY',
  'SYSTEM_SWITCHING',
  'UNCLEAR_OWNERSHIP',
  'REWORK',
  'UNMEASURED_COST',
  'GENERAL_FLOW',
] as const;
export type ProblemDomainKey = (typeof DOMAIN_KEYS)[number];

export interface CorpusSeedEntry {
  corpusKey: string;
  kind: EvidenceKind;
  title: string;
  authors?: string;
  venue?: string;
  year?: number;
  doi?: string;
  locator?: string;
  verificationStatus: EvidenceVerificationStatus;
  strength: EvidenceStrength;
  domainKeys: string[];
  applicabilityNotes?: string;
  limitations?: string;
}

/**
 * Curated seed corpus. Only entries whose bibliographic metadata was verified
 * carry VERIFIED; anything provisional is explicitly UNVERIFIED with a stated
 * limitation, and is therefore ineligible to lift a recommendation to
 * SUPPORTED on its own.
 */
export const SEEDED_CORPUS: readonly CorpusSeedEntry[] = [
  {
    corpusKey: 'paper:bps-standardization-goel-bandara-gable-2023',
    kind: 'PAPER',
    title: 'Conceptualizing Business Process Standardization: A Review and Synthesis',
    authors: 'Kanika Goel, Wasana Bandara, Guy Gable',
    venue: 'Schmalenbach Journal of Business Research',
    year: 2023,
    doi: '10.1007/s41471-023-00158-y',
    locator: 'https://doi.org/10.1007/s41471-023-00158-y',
    verificationStatus: 'VERIFIED',
    strength: 'STRONG',
    domainKeys: ['MANUAL_ADMIN_LOAD', 'DUPLICATE_DATA_ENTRY', 'REWORK', 'GENERAL_FLOW'],
    applicabilityNotes:
      'Szisztematikus szakirodalmi áttekintés a folyamatstandardizálásról: a standardizált folyamatok csökkentik a varianciát, a kézi újramunkát és a többszörös adatrögzítést.',
    limitations: 'Szakirodalmi szintézis, nem konkrét cégmérés; a hatás nagysága kontextusfüggő.',
  },
  {
    corpusKey: 'paper:process-owner-role-davenport-1990',
    kind: 'PAPER',
    title: 'The New Industrial Engineering: Information Technology and Business Process Redesign',
    authors: 'Thomas H. Davenport, James E. Short',
    venue: 'Sloan Management Review',
    year: 1990,
    locator: 'https://sloanreview.mit.edu/article/the-new-industrial-engineering-information-technology-and-business-process-redesign/',
    verificationStatus: 'VERIFIED',
    strength: 'MODERATE',
    domainKeys: ['UNCLEAR_OWNERSHIP', 'SYSTEM_SWITCHING', 'GENERAL_FLOW'],
    applicabilityNotes:
      'Klasszikus érvelés: a folyamatfelelős és az IT-támogatás együtt csökkenti a rendszerközi váltást és a felelősségi réseket.',
    limitations: 'Korai, pre-digitalizációs cikk; elvi irányok, nem mért hatások.',
  },
  {
    corpusKey: 'paper:reengineering-work-hammer-1990',
    kind: 'PAPER',
    title: "Reengineering Work: Don't Automate, Obliterate",
    authors: 'Michael Hammer',
    venue: 'Harvard Business Review',
    year: 1990,
    locator: 'https://hbr.org/1990/07/reengineering-work-dont-automate-obliterate',
    verificationStatus: 'VERIFIED',
    strength: 'MODERATE',
    domainKeys: ['APPROVAL_DELAY', 'MANUAL_ADMIN_LOAD', 'SYSTEM_SWITCHING'],
    applicabilityNotes:
      'A klasszikus reengineering-érvelés: a felesleges jóváhagyási és várakozási rétegek eltörlése (nem automatizálása) csökkenti az átfutási időt.',
    limitations: 'Esettanulmány-alapú érvelés; nem kontrollált mérés — irányadó, nem hatásnagyságot igazoló.',
  },
  {
    corpusKey: 'benchmark:unverified-sme-admin-share',
    kind: 'BENCHMARK',
    title: 'Iparági állítás: az adminisztráció aránya kis- és középvállalkozásoknál',
    verificationStatus: 'UNVERIFIED',
    strength: 'WEAK',
    domainKeys: ['UNMEASURED_COST', 'MANUAL_ADMIN_LOAD'],
    applicabilityNotes: 'Csak tájékozódási kontextus; forráshivatkozás nélküli gyakori állítás.',
    limitations: 'Nem ellenőrizhető forrás — nem támaszthat alá SUPPORTED javaslatot.',
  },
  {
    corpusKey: 'benchmark:unverified-approval-cycle-time',
    kind: 'BENCHMARK',
    title: 'Iparági állítás: a jóváhagyási átfutás lerövidíthető',
    verificationStatus: 'UNVERIFIED',
    strength: 'WEAK',
    domainKeys: ['APPROVAL_DELAY'],
    applicabilityNotes: 'Tájékoztató kontextus a jóváhagyási várakozásokhoz.',
    limitations: 'Nem ellenőrizhető forrás — mérés nélkül nem hivatkozható.',
  },
];

export interface EvidenceDTO {
  id: string;
  clientId: string | null;
  corpusKey: string | null;
  kind: string;
  title: string;
  authors: string | null;
  venue: string | null;
  year: number | null;
  doi: string | null;
  locator: string | null;
  verificationStatus: EvidenceVerificationStatus;
  strength: string;
  domainKeys: string[];
  applicabilityNotes: string | null;
  limitations: string | null;
  createdAt: string;
}

export function toEvidenceDTO(row: {
  id: string; clientId: string | null; corpusKey: string | null; kind: string; title: string;
  authors: string | null; venue: string | null; year: number | null; doi: string | null; locator: string | null;
  verificationStatus: EvidenceVerificationStatus; strength: string; domainKeys: string[];
  applicabilityNotes: string | null; limitations: string | null; createdAt: Date;
}): EvidenceDTO {
  return {
    id: row.id,
    clientId: row.clientId,
    corpusKey: row.corpusKey,
    kind: row.kind,
    title: row.title,
    authors: row.authors,
    venue: row.venue,
    year: row.year,
    doi: row.doi,
    locator: row.locator,
    verificationStatus: row.verificationStatus,
    strength: row.strength,
    domainKeys: row.domainKeys,
    applicabilityNotes: row.applicabilityNotes,
    limitations: row.limitations,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Idempotently seeds the curated corpus. Safe to call repeatedly; only inserts
 * missing corpusKey rows, never rewrites existing entries.
 */
export async function ensureCorpusSeeded(db: Db = defaultPrisma): Promise<{ seeded: number; total: number }> {
  let seeded = 0;
  for (const entry of SEEDED_CORPUS) {
    const existing = await db.researchEvidence.findUnique({ where: { corpusKey: entry.corpusKey } });
    if (existing) continue;
    await db.researchEvidence.create({
      data: {
        corpusKey: entry.corpusKey,
        clientId: null,
        kind: entry.kind,
        title: entry.title,
        authors: entry.authors ?? null,
        venue: entry.venue ?? null,
        year: entry.year ?? null,
        doi: entry.doi ?? null,
        locator: entry.locator ?? null,
        verificationStatus: entry.verificationStatus,
        strength: entry.strength,
        domainKeys: entry.domainKeys,
        applicabilityNotes: entry.applicabilityNotes ?? null,
        limitations: entry.limitations ?? null,
      },
    });
    seeded += 1;
  }
  return { seeded, total: SEEDED_CORPUS.length };
}

/**
 * Lists evidence visible to a client scope: the global verified/unverified
 * corpus plus client-internal evidence rows.
 */
export async function listEvidence(
  actor: InternalActor,
  clientId: string,
  db: Db = defaultPrisma,
): Promise<EvidenceDTO[]> {
  await assertClientReadAccess(actor, clientId, db as PrismaClient);
  const rows = await db.researchEvidence.findMany({
    where: { OR: [{ clientId: null }, { clientId }] },
    orderBy: [{ verificationStatus: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toEvidenceDTO);
}

/**
 * Registers client-internal evidence derived from a canonical source
 * (observation, snapshot, fact). Idempotent per corpusKey.
 */
export async function registerInternalEvidence(
  actor: InternalActor,
  args: {
    clientId: string;
    corpusKey: string;
    kind: Extract<EvidenceKind, 'INTERNAL_OBSERVATION' | 'INTERNAL_MEASUREMENT' | 'ORG_FACT'>;
    title: string;
    locator?: string;
    strength?: EvidenceStrength;
    domainKeys?: string[];
    applicabilityNotes?: string;
    limitations?: string;
  },
  db: Db = defaultPrisma,
): Promise<EvidenceDTO> {
  await assertClientReadAccess(actor, args.clientId, db as PrismaClient);
  const existing = await db.researchEvidence.findUnique({ where: { corpusKey: args.corpusKey } });
  if (existing) return toEvidenceDTO(existing);
  const row = await db.researchEvidence.create({
    data: {
      clientId: args.clientId,
      corpusKey: args.corpusKey,
      kind: args.kind,
      title: args.title,
      locator: args.locator ?? null,
      // Internal evidence is VERIFIED in the sense that it is canonical tenant
      // data; strength still reflects how directly it measures the problem.
      verificationStatus: 'VERIFIED',
      strength: args.strength ?? 'MODERATE',
      domainKeys: args.domainKeys ?? [],
      applicabilityNotes: args.applicabilityNotes ?? null,
      limitations: args.limitations ?? 'Belső megfigyelés — csak erre az ügyfélre érvényes.',
    },
  });
  return toEvidenceDTO(row);
}

/**
 * Finds corpus evidence eligible for a problem domain. `verifiedOnly`
 * enforces the eligibility gate: unverified/disputed entries are excluded.
 */
export async function findCorpusEvidenceForDomains(
  domainKeys: string[],
  opts: { verifiedOnly?: boolean } = {},
  db: Db = defaultPrisma,
): Promise<EvidenceDTO[]> {
  if (!domainKeys.length) return [];
  const rows = await db.researchEvidence.findMany({
    where: {
      clientId: null,
      domainKeys: { hasSome: domainKeys },
      ...(opts.verifiedOnly ? { verificationStatus: 'VERIFIED' as const } : {}),
    },
    orderBy: [{ verificationStatus: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toEvidenceDTO);
}
