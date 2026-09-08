import { InvoiceDraft, InvoiceDraftLine, InvoiceVatTreatment, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../prisma/prisma.service';
import { ROLES } from '../../middleware/auth';
import { InteractionError, InternalActor } from '../client-interaction/base';
import { requireBillingReviewer, withTransaction } from '../billing-preparations/service';
import { renderInvoiceDraftPdf } from './pdf';

type Db = PrismaClient | Prisma.TransactionClient;

const fail = (status: number, code: string, message: string, details?: Record<string, unknown>): never => {
  const error = new InteractionError(status, code, message);
  if (details) Object.assign(error, details);
  throw error;
};

/**
 * T6A — invoice draft foundation ("Számlatervezet — nem számla").
 *
 * A draft is a snapshot document derived from ONE CLOSED BillingPreparation.
 * It never re-reads TimeEntries, never re-resolves rates, and never recomputes
 * billing review state — persisted billingMinutes / description / netAmount
 * are authoritative. Issuer and customer identity are copied at creation so
 * later profile/Client edits cannot retroactively change a draft.
 *
 * Legal safety: no invoice number, no issuance state, no NAV integration.
 * Drafts keep `status = DRAFT` — T6B will add numbering/issuance separately.
 *
 * Money: Prisma.Decimal only; amounts serialize as decimal strings. VAT =
 * net × rate / 100 rounded HALF_UP to 2 decimals. The 27% default is never
 * hardcoded — the rate comes from the configured issuer profile / draft input.
 */
export const ISSUER_PROFILE_KEY = 'billing.issuerProfile';
export const ITEM_UNIT = 'tétel';

export type VatTreatment = 'NORMAL_VAT' | 'TAX_EXEMPT' | 'REVERSE_CHARGE' | 'OUT_OF_SCOPE';
const VAT_TREATMENTS: readonly VatTreatment[] = ['NORMAL_VAT', 'TAX_EXEMPT', 'REVERSE_CHARGE', 'OUT_OF_SCOPE'];
export type TaxNumberRequirement = 'UNCONFIRMED' | 'REQUIRED' | 'NOT_APPLICABLE';
const TAX_NUMBER_REQUIREMENTS: readonly TaxNumberRequirement[] = ['UNCONFIRMED', 'REQUIRED', 'NOT_APPLICABLE'];

export type IssuerProfile = {
  legalName: string | null;
  address: string | null;
  taxNumber: string | null;
  euVatNumber: string | null;
  registrationNumber: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  email: string | null;
  phone: string | null;
  logoPath: string | null;
  defaultVatTreatment: VatTreatment;
  defaultVatRate: string | null;
  defaultPaymentMethod: string | null;
  defaultPaymentTermDays: number | null;
};

const EMPTY_PROFILE: IssuerProfile = {
  legalName: null, address: null, taxNumber: null, euVatNumber: null,
  registrationNumber: null, bankName: null, bankAccountNumber: null,
  email: null, phone: null, logoPath: null,
  defaultVatTreatment: 'NORMAL_VAT', defaultVatRate: null,
  defaultPaymentMethod: null, defaultPaymentTermDays: null,
};

const VAT_RATE_PATTERN = /^\d{1,3}(\.\d{1,4})?$/;
const parseVatRate = (value: unknown): Prisma.Decimal | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !VAT_RATE_PATTERN.test(value)) {
    return fail(400, 'INVOICE_DRAFT_INPUT_INVALID', 'Érvénytelen áfa-kulcs.');
  }
  const rate = new Prisma.Decimal(value);
  if (rate.gt(100)) return fail(400, 'INVOICE_DRAFT_INPUT_INVALID', 'Érvénytelen áfa-kulcs.');
  return rate;
};

/** Authoritative VAT-combination validation: NORMAL_VAT requires a rate (4xx,
 * never a DB CHECK crash); every other treatment normalizes rate to null so no
 * stale value survives next to e.g. TAX_EXEMPT. */
function resolveVatCombination(vatTreatment: VatTreatment, vatRate: Prisma.Decimal | null): { vatTreatment: VatTreatment; vatRate: Prisma.Decimal | null } {
  if (vatTreatment === 'NORMAL_VAT') {
    if (vatRate === null) {
      return fail(422, 'INVOICE_VAT_RATE_REQUIRED', 'Normál áfa-kezeléshez áfa-kulcs megadása kötelező.');
    }
    return { vatTreatment, vatRate };
  }
  return { vatTreatment, vatRate: null };
}

function parseVatTreatment(value: unknown): VatTreatment | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !VAT_TREATMENTS.includes(value as VatTreatment)) {
    return fail(400, 'INVOICE_DRAFT_INPUT_INVALID', 'Ismeretlen áfa-kezelés.');
  }
  return value as VatTreatment;
}

/** Minimum issuer prerequisites for ANY draft row. Without them the immutable
 * snapshot would be permanently unrepairable — creation must fail clearly. */
function issuerProfileMissing(profile: IssuerProfile): string[] {
  const missing: string[] = [];
  if (!profile.legalName?.trim()) missing.push('Szállító neve');
  if (!profile.address?.trim()) missing.push('Szállító címe');
  if (!profile.taxNumber?.trim()) missing.push('Szállító adószáma');
  return missing;
}
const PROFILE_TEXT_KEYS = ['legalName', 'address', 'taxNumber', 'euVatNumber', 'registrationNumber', 'bankName', 'bankAccountNumber', 'email', 'phone', 'logoPath', 'defaultVatRate', 'defaultPaymentMethod'] as const;

const isoDate = (value: Date | null | undefined): string | null => (value ? value.toISOString().slice(0, 10) : null);
const parseDraftDate = (value: unknown, code: string, message: string): Date | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fail(400, code, message);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return fail(400, code, message);
  return date;
};
const optionalText = (value: unknown, code: string, message: string): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return fail(400, code, message);
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** net × rate% → VAT, HALF_UP 2dp. Non-normal treatments carry no VAT amount. */
export function vatAmountFor(netAmount: Prisma.Decimal, treatment: VatTreatment, vatRate: Prisma.Decimal | null): Prisma.Decimal {
  if (treatment !== 'NORMAL_VAT' || vatRate === null) return new Prisma.Decimal(0);
  return netAmount.mul(vatRate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

const minutesHMM = (value: number): string => `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;

function ftPerHour(rate: Prisma.Decimal): string {
  const [whole, fraction = '00'] = rate.toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fraction === '00' ? `${grouped} Ft/óra` : `${grouped},${fraction} Ft/óra`;
}

/** Invoice-face line description keeps the billing basis visibly
 * understandable; the face itself uses quantity=1 tétel × authoritative net. */
function lineDescription(item: { sourceDescription?: string | null; invoiceDescription?: string | null; sourceWorkType: string; billingMinutes: number; hourlyRate: Prisma.Decimal | null; rateOverride?: Prisma.Decimal | null }): string {
  const base = item.invoiceDescription?.trim() || item.sourceDescription?.trim() || item.sourceWorkType;
  const rate = item.rateOverride ?? item.hourlyRate;
  const basis = rate !== null && rate !== undefined
    ? `${minutesHMM(item.billingMinutes)} óra · ${ftPerHour(rate)}`
    : `${minutesHMM(item.billingMinutes)} óra`;
  return `${base} — ${basis}`;
}

/** Hungarian missing-field list for the PDF gate. Empty array = ready to render. */
export function invoiceDraftMissing(draft: Pick<InvoiceDraft, 'issuerLegalName' | 'issuerAddress' | 'issuerTaxNumber' | 'customerName' | 'customerAddress' | 'customerTaxNumber' | 'customerTaxNumberRequirement' | 'performanceDate' | 'paymentDueDate' | 'paymentMethod' | 'vatTreatment' | 'vatRate'>, lines: Pick<InvoiceDraftLine, 'description'>[]): string[] {
  const missing: string[] = [];
  if (!draft.issuerLegalName?.trim()) missing.push('Szállító neve');
  if (!draft.issuerAddress?.trim()) missing.push('Szállító címe');
  if (!draft.issuerTaxNumber?.trim()) missing.push('Szállító adószáma');
  if (!draft.customerName?.trim()) missing.push('Ügyfél neve');
  if (!draft.customerAddress?.trim()) missing.push('Ügyfél címe');
  if (draft.customerTaxNumberRequirement === 'UNCONFIRMED') missing.push('Vevő adószámának alkalmazhatósága');
  else if (draft.customerTaxNumberRequirement === 'REQUIRED' && !draft.customerTaxNumber?.trim()) missing.push('Ügyfél adószáma');
  if (!draft.performanceDate) missing.push('Teljesítés dátuma');
  if (!draft.paymentDueDate) missing.push('Fizetési határidő');
  if (!draft.paymentMethod?.trim()) missing.push('Fizetési mód');
  if (lines.length === 0) missing.push('Tételsor');
  if (lines.some((line) => !line.description.trim())) missing.push('Tétel megnevezése');
  if (draft.vatTreatment === 'NORMAL_VAT' && draft.vatRate === null) missing.push('ÁFA kulcs');
  return missing;
}

async function readIssuerProfile(db: Db): Promise<IssuerProfile> {
  const row = await db.systemSetting.findUnique({ where: { key: ISSUER_PROFILE_KEY } });
  if (!row || typeof row.value !== 'object' || row.value === null || Array.isArray(row.value)) return EMPTY_PROFILE;
  const raw = row.value as Record<string, unknown>;
  const profile = { ...EMPTY_PROFILE };
  for (const key of PROFILE_TEXT_KEYS) {
    const value = raw[key];
    profile[key] = typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
  }
  if (typeof raw.defaultVatTreatment === 'string' && VAT_TREATMENTS.includes(raw.defaultVatTreatment as VatTreatment)) {
    profile.defaultVatTreatment = raw.defaultVatTreatment as VatTreatment;
  }
  profile.defaultPaymentTermDays = Number.isInteger(raw.defaultPaymentTermDays) ? (raw.defaultPaymentTermDays as number) : null;
  return profile;
}

export async function getIssuerProfile(actor: InternalActor, db: Db = prisma) {
  await requireBillingReviewer(actor, db);
  const row = await db.systemSetting.findUnique({ where: { key: ISSUER_PROFILE_KEY }, select: { updatedAt: true } });
  return { profile: await readIssuerProfile(db), configured: row?.updatedAt ?? null };
}

export async function putIssuerProfile(actor: InternalActor, body: unknown, db: Db = prisma) {
  // Issuer identity is firm-level configuration: ADMIN only, re-verified on the DB row.
  const user = await db.user.findUnique({ where: { id: actor.userId }, select: { role: true, status: true, isActive: true } });
  if (!user || !user.isActive || user.status !== 'ACTIVE' || user.role !== ROLES.ADMIN) {
    return fail(403, 'INVOICE_ISSUER_ADMIN_ONLY', 'A számlázó adatait csak aktív adminisztrátor módosíthatja.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'ISSUER_PROFILE_INVALID', 'Érvénytelen szállítói profil.');
  const input = body as Record<string, unknown>;
  const allowed = [...PROFILE_TEXT_KEYS, 'defaultVatTreatment', 'defaultPaymentTermDays'];
  if (Object.keys(input).some((key) => !allowed.includes(key))) return fail(400, 'ISSUER_PROFILE_INVALID', 'Nem támogatott mező.');

  const next: Record<string, unknown> = {};
  for (const key of PROFILE_TEXT_KEYS) {
    const value = optionalText(input[key], 'ISSUER_PROFILE_INVALID', 'Szöveges mező várható.');
    if (value !== undefined) next[key] = value;
  }
  if (input.defaultVatTreatment !== undefined) {
    if (typeof input.defaultVatTreatment !== 'string' || !VAT_TREATMENTS.includes(input.defaultVatTreatment as VatTreatment)) {
      return fail(400, 'ISSUER_PROFILE_INVALID', 'Ismeretlen áfa-kezelés.');
    }
    next.defaultVatTreatment = input.defaultVatTreatment;
  }
  if (input.defaultPaymentTermDays !== undefined) {
    const days = input.defaultPaymentTermDays;
    if (days !== null && (!Number.isInteger(days) || (days as number) < 0 || (days as number) > 365)) {
      return fail(400, 'ISSUER_PROFILE_INVALID', 'Érvénytelen fizetési határidő napokban.');
    }
    next.defaultPaymentTermDays = days;
  }
  if (typeof next.defaultVatRate === 'string'
    && (!VAT_RATE_PATTERN.test(next.defaultVatRate as string) || new Prisma.Decimal(next.defaultVatRate as string).gt(100))) {
    return fail(400, 'ISSUER_PROFILE_INVALID', 'Érvénytelen alapértelmezett áfa-kulcs.');
  }

  const current = await readIssuerProfile(db);
  const merged = { ...current, ...next } as IssuerProfile;
  await db.systemSetting.upsert({
    where: { key: ISSUER_PROFILE_KEY },
    create: { key: ISSUER_PROFILE_KEY, value: merged as unknown as Prisma.InputJsonValue, description: 'Számlázó (kiállító) profil — T6A számlatervezet alap' },
    update: { value: merged as unknown as Prisma.InputJsonValue },
  });
  return { profile: merged };
}

type DraftWithLines = InvoiceDraft & { lines: InvoiceDraftLine[] };

function draftDto(draft: DraftWithLines) {
  const net = draft.lines.reduce((sum, l) => sum.plus(l.netAmount), new Prisma.Decimal(0));
  const vat = draft.lines.reduce((sum, l) => sum.plus(l.vatAmount), new Prisma.Decimal(0));
  const gross = draft.lines.reduce((sum, l) => sum.plus(l.grossAmount), new Prisma.Decimal(0));
  return {
    id: draft.id,
    billingPreparationId: draft.billingPreparationId,
    currency: draft.currency,
    status: draft.status,
    issuer: {
      legalName: draft.issuerLegalName, address: draft.issuerAddress, taxNumber: draft.issuerTaxNumber,
      euVatNumber: draft.issuerEuVatNumber, registrationNumber: draft.issuerRegistrationNumber,
      bankName: draft.issuerBankName, bankAccountNumber: draft.issuerBankAccountNumber,
      email: draft.issuerEmail, phone: draft.issuerPhone, logoPath: draft.issuerLogoPath,
    },
    customer: {
      name: draft.customerName, address: draft.customerAddress,
      taxNumber: draft.customerTaxNumber, vatNumber: draft.customerVatNumber,
      taxNumberRequirement: draft.customerTaxNumberRequirement,
    },
    performanceDate: isoDate(draft.performanceDate),
    draftDate: isoDate(draft.draftDate),
    paymentDueDate: isoDate(draft.paymentDueDate),
    paymentMethod: draft.paymentMethod,
    note: draft.note,
    vatTreatment: draft.vatTreatment,
    vatRate: draft.vatRate?.toString() ?? null,
    missing: invoiceDraftMissing(draft, draft.lines),
    totals: { netAmount: net.toFixed(2), vatAmount: vat.toFixed(2), grossAmount: gross.toFixed(2) },
    lines: draft.lines.map((line) => ({
      id: line.id,
      billingItemId: line.billingItemId,
      sortOrder: line.sortOrder,
      description: line.description,
      quantity: line.quantity.toFixed(4),
      unit: line.unit,
      netUnitPrice: line.netUnitPrice?.toFixed(4) ?? null,
      netAmount: line.netAmount.toFixed(2),
      vatTreatment: line.vatTreatment,
      vatRate: line.vatRate?.toString() ?? null,
      vatAmount: line.vatAmount.toFixed(2),
      grossAmount: line.grossAmount.toFixed(2),
      source: {
        workDate: isoDate(line.sourceWorkDate), caseNumber: line.caseNumber, caseTitle: line.caseTitle,
        workerName: line.workerName, billingMinutes: line.billingMinutes, hourlyRate: line.hourlyRate?.toFixed(4) ?? null,
      },
    })),
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}

async function requireDraft(id: string, db: Db): Promise<DraftWithLines> {
  const draft = await db.invoiceDraft.findUnique({ where: { id }, include: { lines: { orderBy: { sortOrder: 'asc' } } } });
  if (!draft) return fail(404, 'INVOICE_DRAFT_NOT_FOUND', 'A számlatervezet nem található.');
  return draft;
}

export async function createDraft(actor: InternalActor, body: unknown, db: Db = prisma) {
  await requireBillingReviewer(actor, db);
  const input = (body ?? {}) as Record<string, unknown>;
  const billingPreparationId = typeof input.billingPreparationId === 'string' ? input.billingPreparationId : '';
  if (!billingPreparationId) return fail(400, 'INVOICE_DRAFT_INPUT_INVALID', 'billingPreparationId kötelező.');

  const preparation = await db.billingPreparation.findUnique({
    where: { id: billingPreparationId },
    include: { client: true, items: { orderBy: [{ sourceWorkDate: 'asc' }, { id: 'asc' }] } },
  });
  if (!preparation) return fail(404, 'BILLING_PREP_NOT_FOUND', 'A számlázási előkészítés nem található.');
  if (preparation.status !== 'CLOSED') {
    return fail(409, 'INVOICE_DRAFT_REQUIRES_CLOSED', 'Számlatervezet csak lezárt számlázási előkészítésből készíthető.');
  }

  const existing = await db.invoiceDraft.findUnique({ where: { billingPreparationId }, include: { lines: { orderBy: { sortOrder: 'asc' } } } });
  if (existing) return { created: false, draft: draftDto(existing) };

  const profile = await readIssuerProfile(db);
  // Issuer identity is immutable once snapshotted — an incomplete profile must
  // never produce a draft row the user cannot repair later.
  const issuerMissing = issuerProfileMissing(profile);
  if (issuerMissing.length > 0) {
    return fail(422, 'INVOICE_ISSUER_PROFILE_INCOMPLETE',
      `A számlázói profil hiányos: ${issuerMissing.join(', ')}. Állítsa be a Beállítások → Számlázói profil felületen.`,
      { missing: issuerMissing });
  }
  const vatTreatmentInput = parseVatTreatment(input.vatTreatment) ?? profile.defaultVatTreatment;
  const vatRateInput = input.vatRate !== undefined ? input.vatRate : profile.defaultVatRate;
  const { vatTreatment, vatRate } = resolveVatCombination(vatTreatmentInput, parseVatRate(vatRateInput) ?? null);

  const client = preparation.client;

  // Whether a customer tax number applies is explicit domain state — inferred
  // only from canonical portal-workspace modes, never from names or filled
  // fields. Unresolvable cases stay UNCONFIRMED until a reviewer decides.
  const workspaces = client
    ? await db.clientPortalWorkspace.findMany({ where: { clientId: client.id }, select: { mode: true, status: true } })
    : [];
  const activeModes = new Set(workspaces.filter((w) => w.status === 'ACTIVE').map((w) => w.mode));
  let customerTaxNumberRequirement: TaxNumberRequirement = 'UNCONFIRMED';
  if (activeModes.has('ORGANIZATION')) customerTaxNumberRequirement = 'REQUIRED';
  else if (activeModes.size === 1 && activeModes.has('INDIVIDUAL')) customerTaxNumberRequirement = 'NOT_APPLICABLE';
  const performanceDate = parseDraftDate(input.performanceDate, 'INVOICE_DRAFT_INPUT_INVALID', 'Érvénytelen teljesítési dátum.') ?? preparation.periodEnd;
  const paymentDueDate = parseDraftDate(input.paymentDueDate, 'INVOICE_DRAFT_INPUT_INVALID', 'Érvénytelen fizetési határidő.')
    ?? (profile.defaultPaymentTermDays !== null ? new Date(performanceDate.getTime() + profile.defaultPaymentTermDays * 24 * 60 * 60 * 1000) : null);
  const paymentMethod = optionalText(input.paymentMethod, 'INVOICE_DRAFT_INPUT_INVALID', 'Érvénytelen fizetési mód.') ?? profile.defaultPaymentMethod;
  const note = optionalText(input.note, 'INVOICE_DRAFT_INPUT_INVALID', 'Érvénytelen megjegyzés.') ?? null;
  const draftDate = parseDraftDate(input.draftDate, 'INVOICE_DRAFT_INPUT_INVALID', 'Érvénytelen tervezet dátum.') ?? new Date();

  const billable = preparation.items.filter((item) => item.included && item.netAmount !== null);

  const createData: Prisma.InvoiceDraftCreateInput = {
    preparation: { connect: { id: billingPreparationId } },
    currency: preparation.currency,
    issuerLegalName: profile.legalName,
    issuerAddress: profile.address,
    issuerTaxNumber: profile.taxNumber,
    issuerEuVatNumber: profile.euVatNumber,
    issuerRegistrationNumber: profile.registrationNumber,
    issuerBankName: profile.bankName,
    issuerBankAccountNumber: profile.bankAccountNumber,
    issuerEmail: profile.email,
    issuerPhone: profile.phone,
    issuerLogoPath: profile.logoPath,
    customerTaxNumberRequirement,
    customerName: client?.name ?? null,
    customerAddress: client?.address ?? null,
    customerTaxNumber: client?.taxNumber ?? null,
    customerVatNumber: client?.vatNumber ?? null,
    performanceDate,
    draftDate,
    paymentDueDate,
    paymentMethod,
    note,
    vatTreatment,
    vatRate,
    createdBy: { connect: { id: actor.userId } },
    lines: {
      create: billable.map((item, index) => {
        const netAmount = item.netAmount!;
        const vatAmount = vatAmountFor(netAmount, vatTreatment, vatRate);
        return {
          billingItemId: item.id,
          sortOrder: index,
          description: lineDescription(item),
          // quantity=1 tétel at the authoritative net: the face always
          // reconciles exactly (net stays the persisted billing amount).
          quantity: new Prisma.Decimal(1),
          unit: ITEM_UNIT,
          netUnitPrice: netAmount,
          netAmount,
          vatTreatment,
          vatRate,
          vatAmount,
          grossAmount: netAmount.plus(vatAmount),
          sourceWorkDate: item.sourceWorkDate,
          caseNumber: item.caseNumber,
          caseTitle: item.caseTitle,
          workerName: item.workerName,
          billingMinutes: item.billingMinutes,
          hourlyRate: item.rateOverride ?? item.hourlyRate,
        };
      }),
    },
  };
  try {
    const created = await db.invoiceDraft.create({ data: createData, include: { lines: { orderBy: { sortOrder: 'asc' } } } });
    return { created: true, draft: draftDto(created) };
  } catch (error) {
    // Concurrent creates race on the unique billingPreparationId — the loser
    // may surface P2002 (unique) or P2003/P2014 (relation) depending on timing;
    // whichever, a re-read returning the winner's draft keeps this idempotent.
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2003', 'P2014'].includes(error.code)) {
      const raced = await db.invoiceDraft.findUnique({ where: { billingPreparationId }, include: { lines: { orderBy: { sortOrder: 'asc' } } } });
      if (raced) return { created: false, draft: draftDto(raced) };
    }
    throw error;
  }
}

export async function getDraft(actor: InternalActor, id: string, db: Db = prisma) {
  await requireBillingReviewer(actor, db);
  return { draft: draftDto(await requireDraft(id, db)) };
}

const DRAFT_PATCH_ALLOWED = ['performanceDate', 'draftDate', 'paymentDueDate', 'paymentMethod', 'note', 'vatTreatment', 'vatRate', 'customerName', 'customerAddress', 'customerTaxNumber', 'customerVatNumber', 'customerTaxNumberRequirement'];

export async function patchDraft(actor: InternalActor, id: string, body: unknown, db: Db = prisma) {
  await requireBillingReviewer(actor, db);
  const draft = await requireDraft(id, db);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'INVOICE_DRAFT_INPUT_INVALID', 'Érvénytelen tervadatok.');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !DRAFT_PATCH_ALLOWED.includes(key))) return fail(400, 'INVOICE_DRAFT_INPUT_INVALID', 'Nem támogatott mező.');

  const data: Record<string, unknown> = {};
  for (const key of ['performanceDate', 'draftDate', 'paymentDueDate'] as const) {
    const value = parseDraftDate(input[key], 'INVOICE_DRAFT_INPUT_INVALID', 'Érvénytelen dátum (ÉÉÉÉ-HH-NN).');
    if (value !== undefined) data[key] = value;
  }
  for (const key of ['paymentMethod', 'note', 'customerName', 'customerAddress', 'customerTaxNumber', 'customerVatNumber'] as const) {
    const value = optionalText(input[key], 'INVOICE_DRAFT_INPUT_INVALID', 'Szöveges mező várható.');
    if (value !== undefined) data[key] = value;
  }
  if (input.customerTaxNumberRequirement !== undefined) {
    if (typeof input.customerTaxNumberRequirement !== 'string' || !TAX_NUMBER_REQUIREMENTS.includes(input.customerTaxNumberRequirement as TaxNumberRequirement)) {
      return fail(400, 'INVOICE_DRAFT_INPUT_INVALID', 'Ismeretlen adószám-kötelezettség.');
    }
    data.customerTaxNumberRequirement = input.customerTaxNumberRequirement;
  }
  const vatTreatmentPatch = parseVatTreatment(input.vatTreatment);
  if (vatTreatmentPatch !== undefined) data.vatTreatment = vatTreatmentPatch;
  const vatRatePatch = parseVatRate(input.vatRate);
  if (vatRatePatch !== undefined) data.vatRate = vatRatePatch;

  // One authoritative combination check for create and patch alike: throws a
  // controlled 422 on NORMAL_VAT+null long before the DB CHECK could fire, and
  // normalizes the rate away beside non-normal treatments.
  const { vatTreatment: nextTreatment, vatRate: nextRate } = resolveVatCombination(
    (data.vatTreatment ?? draft.vatTreatment) as InvoiceVatTreatment,
    'vatRate' in data ? (data.vatRate as Prisma.Decimal | null) : draft.vatRate,
  );
  data.vatTreatment = nextTreatment;
  data.vatRate = nextRate;

  const updated = await withTransaction(db, async (tx) => {
    for (const line of draft.lines) {
      const vatAmount = vatAmountFor(line.netAmount, nextTreatment, nextRate);
      await tx.invoiceDraftLine.update({
        where: { id: line.id },
        data: { vatTreatment: nextTreatment, vatRate: nextRate, vatAmount, grossAmount: line.netAmount.plus(vatAmount) },
      });
    }
    return tx.invoiceDraft.update({ where: { id: draft.id }, data, include: { lines: { orderBy: { sortOrder: 'asc' } } } });
  });
  return { draft: draftDto(updated) };
}

/** Explicit user discard of a DRAFT — required before its preparation may be
 * reopened. Never touches TimeEntry or BillingPreparationItem rows. */
export async function discardDraft(actor: InternalActor, id: string, db: Db = prisma) {
  await requireBillingReviewer(actor, db);
  const draft = await requireDraft(id, db);
  if (draft.status !== 'DRAFT') return fail(409, 'INVOICE_DRAFT_NOT_DRAFT', 'Csak piszkozat állapotú számlatervezet vethető el.');
  await db.invoiceDraft.delete({ where: { id: draft.id } });
  return { discarded: true, billingPreparationId: draft.billingPreparationId };
}

export async function patchDraftLine(actor: InternalActor, draftId: string, lineId: string, body: unknown, db: Db = prisma) {
  await requireBillingReviewer(actor, db);
  const draft = await requireDraft(draftId, db);
  const line = draft.lines.find((row) => row.id === lineId);
  if (!line) return fail(404, 'INVOICE_DRAFT_LINE_NOT_FOUND', 'A tételsor nem található.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(400, 'INVOICE_DRAFT_INPUT_INVALID', 'Érvénytelen soradatok.');
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'description')) return fail(400, 'INVOICE_DRAFT_INPUT_INVALID', 'Csak a megnevezés módosítható.');
  const description = optionalText(input.description, 'INVOICE_DRAFT_INPUT_INVALID', 'Érvénytelen megnevezés.');
  if (description === undefined) return { draft: draftDto(draft) };
  if (description === null) return fail(400, 'INVOICE_DRAFT_INPUT_INVALID', 'A megnevezés nem lehet üres.');
  await db.invoiceDraftLine.update({ where: { id: line.id }, data: { description } });
  return { draft: draftDto(await requireDraft(draftId, db)) };
}

export async function getDraftPdf(actor: InternalActor, id: string, db: Db = prisma): Promise<Buffer> {
  await requireBillingReviewer(actor, db);
  const draft = await requireDraft(id, db);
  const missing = invoiceDraftMissing(draft, draft.lines);
  if (missing.length > 0) {
    return fail(422, 'INVOICE_DRAFT_INCOMPLETE', `A számlatervezethez még hiányzik: ${missing.join(', ')}`, { missing });
  }
  return renderInvoiceDraftPdf(draft);
}
