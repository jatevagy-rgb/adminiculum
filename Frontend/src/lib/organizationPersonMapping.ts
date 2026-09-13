import type { OrgPersonDTO } from "./clientOrganizationApi";

export type PersonTransferField = "name" | "role" | "contactEmail" | "phone" | "notes";

export interface PersonTransferOption {
  key: PersonTransferField;
  label: string;
  value: string;
}

/**
 * Explicit, user-selected fields copied into the known-party (anonymization)
 * form. Org membership/portal/grant fields are NEVER transferable: they are
 * access data, not document metadata.
 */
export interface KnownPartyTransfer {
  name?: string;
  role?: string;
  contactEmail?: string;
  phone?: string;
  notes?: string;
}

const FIELD_DEFS: { key: PersonTransferField; label: string; value: (p: OrgPersonDTO) => string | null }[] = [
  { key: "name", label: "Név", value: (p) => p.name },
  { key: "role", label: "Szerep (beosztás)", value: (p) => p.jobTitle },
  { key: "contactEmail", label: "Kapcsolattartó email", value: (p) => p.email },
  { key: "phone", label: "Telefonszám", value: (p) => p.phone },
  {
    key: "notes",
    label: "Megjegyzés (felelősségi kör)",
    value: (p) => p.responsibilitiesSummary,
  },
];

export function availablePersonFields(person: OrgPersonDTO): PersonTransferOption[] {
  return FIELD_DEFS.map((def) => ({ key: def.key, label: def.label, value: def.value(person) }))
    .filter((option): option is PersonTransferOption => !!option.value && option.value.trim().length > 0);
}

export function buildKnownPartyTransfer(
  person: OrgPersonDTO,
  selected: ReadonlySet<PersonTransferField>,
): KnownPartyTransfer {
  const transfer: KnownPartyTransfer = {};
  for (const option of availablePersonFields(person)) {
    if (!selected.has(option.key)) continue;
    switch (option.key) {
      case "name":
        transfer.name = option.value;
        break;
      case "role":
        transfer.role = option.value;
        break;
      case "contactEmail":
        transfer.contactEmail = option.value;
        break;
      case "phone":
        transfer.phone = option.value;
        break;
      case "notes":
        transfer.notes = option.value;
        break;
    }
  }
  return transfer;
}
