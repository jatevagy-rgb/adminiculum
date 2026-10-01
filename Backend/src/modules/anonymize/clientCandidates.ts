// ============================================================================
// CLIENT FIELD CANDIDATES — canonical registered-client fact mapping.
// ============================================================================
//
// Pure helper (no database, no I/O) that turns a canonical Client record and
// its optional ClientRedactionProfile into typed redaction candidate specs.
//
// The canonical Prisma Client model exposes `taxNumber`, `companyRegistrationNumber`
// and `vatNumber` (not `taxId`). Reading `clientData.taxId` silently produced no
// candidates, so the client's real tax number was never redacted. This module
// fixes that boundary and is unit-tested independently of the live service.

export type ClientCandidateCategory =
  | 'CLIENT'
  | 'EMAIL'
  | 'PHONE'
  | 'ADDRESS'
  | 'IDENTIFIER'
  | 'REPRESENTATIVE';

export interface ClientCandidateSpec {
  value: string;
  category: ClientCandidateCategory;
  source: string;
  tokenPrefix: string;
  /** Role token used for CLIENT-category names ([MEGBÍZÓ] or [ÜGYFÉL]). */
  roleToken?: '[MEGBÍZÓ]' | '[ÜGYFÉL]';
}

export interface ClientRecordLike {
  name?: string | null;
  taxNumber?: string | null;
  companyRegistrationNumber?: string | null;
  vatNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  authorizedRepresentative?: string | null;
  contactPerson?: string | null;
}

export interface RedactorProfileLike {
  fullName?: string | null;
  aliases?: unknown;
  addresses?: unknown;
  taxId?: string | null;
}

function asTrimmedStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function collectClientFieldCandidates(
  clientRecord: ClientRecordLike | null | undefined,
  profile: RedactorProfileLike | null | undefined,
  clientRoleToken: '[MEGBÍZÓ]' | '[ÜGYFÉL]' = '[ÜGYFÉL]',
): ClientCandidateSpec[] {
  const specs: ClientCandidateSpec[] = [];

  const add = (
    value: string | null | undefined,
    category: ClientCandidateCategory,
    source: string,
    tokenPrefix: string,
    roleToken?: '[MEGBÍZÓ]' | '[ÜGYFÉL]',
  ) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed) return;
    specs.push({ value: trimmed, category, source, tokenPrefix, roleToken });
  };

  if (clientRecord) {
    add(clientRecord.name, 'CLIENT', 'client.name', 'ÜGYFÉL', clientRoleToken);
    add(clientRecord.taxNumber, 'IDENTIFIER', 'client.taxNumber', 'AZONOSÍTÓ');
    add(clientRecord.companyRegistrationNumber, 'IDENTIFIER', 'client.companyRegistrationNumber', 'AZONOSÍTÓ');
    add(clientRecord.vatNumber, 'IDENTIFIER', 'client.vatNumber', 'AZONOSÍTÓ');
    add(clientRecord.email, 'EMAIL', 'client.email', 'EMAIL');
    add(clientRecord.phone, 'PHONE', 'client.phone', 'TELEFON');
    add(clientRecord.address, 'ADDRESS', 'client.address', 'CÍM');
    add(clientRecord.authorizedRepresentative, 'REPRESENTATIVE', 'client.authorizedRepresentative', 'KÉPVISELŐ');
    add(clientRecord.contactPerson, 'REPRESENTATIVE', 'client.contactPerson', 'KÉPVISELŐ');
  }

  if (profile) {
    add(profile.fullName, 'CLIENT', 'redactorProfile.fullName', 'ÜGYFÉL', clientRoleToken);
    for (const alias of asTrimmedStringArray(profile.aliases)) {
      add(alias, 'CLIENT', 'redactorProfile.aliases', 'ÜGYFÉL', clientRoleToken);
    }
    for (const address of asTrimmedStringArray(profile.addresses)) {
      add(address, 'ADDRESS', 'redactorProfile.addresses', 'CÍM');
    }
    add(profile.taxId, 'IDENTIFIER', 'redactorProfile.taxId', 'AZONOSÍTÓ');
  }

  return specs;
}
