"use client";

import { useEffect, useMemo, useState } from "react";
import { clientOrganizationApi, type OrgPersonDTO } from "@/lib/clientOrganizationApi";
import {
  availablePersonFields,
  buildKnownPartyTransfer,
  type KnownPartyTransfer,
  type PersonTransferField,
} from "@/lib/organizationPersonMapping";

interface OrganizationPersonPickerProps {
  clientId: string;
  isOpen: boolean;
  onCancel: () => void;
  /**
   * Called only on explicit confirm. `legalRole` is the role the user picked —
   * it is never inferred from job title or group.
   */
  onConfirm: (transfer: KnownPartyTransfer, legalRole: string) => void;
}

const legalRoleOptions = ["Ügyfél", "Megbízó", "Eladó", "Vevő", "Ellenérdekű fél", "Egyéb fél"];

export function OrganizationPersonPicker({ clientId, isOpen, onCancel, onConfirm }: OrganizationPersonPickerProps) {
  const [persons, setPersons] = useState<OrgPersonDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [legalRole, setLegalRole] = useState("");
  const [selectedFields, setSelectedFields] = useState<ReadonlySet<PersonTransferField>>(new Set());

  useEffect(() => {
    if (!isOpen || !clientId) return;
    let active = true;
    setLoading(true);
    setError(null);
    setSelectedPersonId("");
    setLegalRole("");
    setSelectedFields(new Set());
    clientOrganizationApi
      .listPersons(clientId)
      .then((res) => {
        if (!active) return;
        setPersons(res.items.filter((p) => String(p.employmentStatus).toUpperCase() !== "ENDED"));
      })
      .catch(() => {
        if (active) setError("A szervezeti névjegyzék nem tölthető be.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, clientId]);

  const selectedPerson = useMemo(() => persons.find((p) => p.id === selectedPersonId) || null, [persons, selectedPersonId]);
  const fieldOptions = useMemo(() => (selectedPerson ? availablePersonFields(selectedPerson) : []), [selectedPerson]);
  const preview = useMemo(
    () => (selectedPerson ? buildKnownPartyTransfer(selectedPerson, selectedFields) : {}),
    [selectedPerson, selectedFields],
  );
  const previewEntries = Object.entries(preview).filter(([, v]) => !!v && String(v).trim().length > 0);
  const canConfirm = !!selectedPerson && !!legalRole && selectedFields.size > 0;

  const selectPerson = (id: string) => {
    setSelectedPersonId(id);
    const person = persons.find((p) => p.id === id);
    setSelectedFields(new Set(person ? availablePersonFields(person).map((f) => f.key) : []));
  };

  const toggleField = (key: PersonTransferField) => {
    setSelectedFields((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="mb-3 rounded border border-[#23472F]/30 bg-white p-3" role="dialog" aria-label="Szervezeti személy átvétele" data-testid="organization-person-picker">
      <p className="text-[11px] font-bold text-[#06190d]">Személy átvétele az ügyfélszervezetből</p>
      <p className="mt-1 text-[10px] text-[#434843]/70">
        Kizárólag az Ön által kijelölt mezők kerülnek át. Tagságot, jogosultságot vagy szervezeti adatot nem másolunk át.
      </p>

      {loading ? <p className="mt-2 text-[11px] text-[#434843]">Személyek betöltése…</p> : null}
      {error ? <p className="mt-2 text-[11px] text-[#8a3b21]" role="alert">{error}</p> : null}

      {!loading && !error ? (
        persons.length === 0 ? (
          <p className="mt-2 text-[11px] text-[#434843]">Nincs aktív szervezeti személy ehhez az ügyfélhez.</p>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block text-[10px] font-semibold text-[#434843]">
              Személy
              <select
                value={selectedPersonId}
                onChange={(e) => selectPerson(e.target.value)}
                className="mt-1 w-full border border-[#c3c8c1]/30 bg-white px-2 py-2 text-xs text-[#06190d] focus:border-[#06190d] focus:outline-none"
              >
                <option value="">Válasszon személyt</option>
                {persons.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                    {person.jobTitle ? ` — ${person.jobTitle}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[10px] font-semibold text-[#434843]">
              Jogi szerep
              <select
                value={legalRole}
                onChange={(e) => setLegalRole(e.target.value)}
                className="mt-1 w-full border border-[#c3c8c1]/30 bg-white px-2 py-2 text-xs text-[#06190d] focus:border-[#06190d] focus:outline-none"
              >
                <option value="">Válasszon jogi szerepet</option>
                {legalRoleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )
      ) : null}

      {selectedPerson && fieldOptions.length > 0 ? (
        <fieldset className="mt-3">
          <legend className="text-[10px] font-semibold text-[#434843]">Átvételre kerülő mezők</legend>
          <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {fieldOptions.map((option) => (
              <label key={option.key} className="flex items-center gap-2 text-[11px] text-[#06190d]">
                <input
                  type="checkbox"
                  checked={selectedFields.has(option.key)}
                  onChange={() => toggleField(option.key)}
                />
                <span>
                  {option.label} <span className="text-[#434843]/60">({option.value})</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {selectedPerson ? (
        <div className="mt-3 rounded border border-[#c3c8c1]/30 bg-[#f5f6f4] p-2">
          <p className="text-[10px] font-semibold text-[#434843]">Előnézet</p>
          {previewEntries.length === 0 ? (
            <p className="mt-1 text-[10px] text-[#434843]/70">Jelöljön ki legalább egy mezőt az átvételhez.</p>
          ) : (
            <dl className="mt-1 space-y-0.5">
              {previewEntries.map(([key, value]) => (
                <div key={key} className="flex gap-2 text-[11px]">
                  <dt className="w-24 shrink-0 text-[#434843]">{key === "name" ? "Név" : key === "role" ? "Szerep" : key === "contactEmail" ? "Email" : key === "phone" ? "Telefon" : "Megjegyzés"}:</dt>
                  <dd className="font-medium text-[#06190d]">{String(value)}</dd>
                </div>
              ))}
              <div className="flex gap-2 text-[11px]">
                <dt className="w-24 shrink-0 text-[#434843]">Jogi szerep:</dt>
                <dd className="font-medium text-[#06190d]">{legalRole || "— nincs kiválasztva —"}</dd>
              </div>
            </dl>
          )}
        </div>
      ) : null}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="border border-[#c3c8c1]/40 px-3 py-1.5 text-[11px] font-semibold text-[#434843] hover:bg-[#f0f1ee] focus-visible:outline focus-visible:outline-2"
        >
          Mégse
        </button>
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => selectedPerson && onConfirm(buildKnownPartyTransfer(selectedPerson, selectedFields), legalRole)}
          className="bg-[#23472F] px-3 py-1.5 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[#06190d] focus-visible:outline focus-visible:outline-2"
        >
          Átvétel az ismert fél mezőibe
        </button>
      </div>
    </div>
  );
}
