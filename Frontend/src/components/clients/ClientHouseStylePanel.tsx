"use client";

import { useEffect, useState } from "react";
import { AdminButton, AdminStatusPill } from "@/components/adminiculum/ui";
import {
  getClientHouseStyle,
  upsertClientHouseStyle,
  type ClientHouseStyleProfile,
  type UpsertClientHouseStyleProfilePayload,
} from "@/lib/api";

type ClientHouseStylePanelProps = {
  clientId: string;
  clientName?: string;
  compact?: boolean;
  onSaved?: () => void;
};

type FieldKey = keyof UpsertClientHouseStyleProfilePayload;

const EMPTY_FORM: UpsertClientHouseStyleProfilePayload = {
  officialName: "",
  shortName: "",
  registeredSeat: "",
  taxNumber: "",
  registrationNumber: "",
  contactPerson: "",
  contactEmail: "",
  contactPhone: "",
  preferredLanguage: "HU",
  documentLanguageMode: "HU_ONLY",
  fontFamily: "",
  fontSize: "",
  headingStyle: "",
  numberingStyle: "",
  headerRequirements: "",
  footerRequirements: "",
  signatureBlock: "",
  bilingualNotes: "",
  translationNotes: "",
  preferredTone: "",
  prohibitedWording: "",
  reusablePromptInstructions: "",
  wordFormattingInstructions: "",
  externalAiInstructions: "",
  notes: "",
};

const GROUPS: Array<{ title: string; fields: Array<{ key: FieldKey; label: string; type?: "input" | "textarea" | "select"; options?: Array<{ value: string; label: string }> }> }> = [
  {
    title: "Ügyfél alapadatai",
    fields: [
      { key: "officialName", label: "Hivatalos név" },
      { key: "shortName", label: "Rövid név" },
      { key: "registeredSeat", label: "Székhely / cím" },
      { key: "taxNumber", label: "Adószám" },
      { key: "registrationNumber", label: "Cégjegyzékszám / nyilvántartási szám" },
      { key: "contactPerson", label: "Kapcsolattartó" },
      { key: "contactEmail", label: "Email" },
      { key: "contactPhone", label: "Telefon" },
    ],
  },
  {
    title: "Nyelv és dokumentumszerkezet",
    fields: [
      { key: "preferredLanguage", label: "Preferált nyelv", type: "select", options: [{ value: "HU", label: "Magyar" }, { value: "EN", label: "Angol" }, { value: "BILINGUAL", label: "Kétnyelvű" }] },
      { key: "documentLanguageMode", label: "Dokumentum nyelvi mód", type: "select", options: [{ value: "HU_ONLY", label: "Csak magyar" }, { value: "EN_ONLY", label: "Csak angol" }, { value: "BILINGUAL", label: "Kétnyelvű" }, { value: "BILINGUAL_TWO_COLUMN", label: "Kétnyelvű két hasábban" }] },
      { key: "bilingualNotes", label: "Kétnyelvű formázási megjegyzések", type: "textarea" },
      { key: "translationNotes", label: "Fordítási követelmények", type: "textarea" },
    ],
  },
  {
    title: "Word / formázási szabályok",
    fields: [
      { key: "fontFamily", label: "Betűtípus" },
      { key: "fontSize", label: "Betűméret" },
      { key: "headingStyle", label: "Címsorok" },
      { key: "numberingStyle", label: "Számozás" },
      { key: "headerRequirements", label: "Fejléc követelmények", type: "textarea" },
      { key: "footerRequirements", label: "Lábléc követelmények", type: "textarea" },
      { key: "signatureBlock", label: "Aláírási blokk", type: "textarea" },
    ],
  },
  {
    title: "Prompt / AI instrukciók",
    fields: [
      { key: "preferredTone", label: "Preferált hangnem", type: "textarea" },
      { key: "prohibitedWording", label: "Tiltott megfogalmazások", type: "textarea" },
      { key: "reusablePromptInstructions", label: "Újrahasználható prompt-instrukciók", type: "textarea" },
      { key: "wordFormattingInstructions", label: "Word formázási instrukciók", type: "textarea" },
      { key: "externalAiInstructions", label: "Külső AI eszköz megjegyzések", type: "textarea" },
    ],
  },
  {
    title: "Belső megjegyzések",
    fields: [{ key: "notes", label: "Megjegyzések", type: "textarea" }],
  },
];

function toForm(profile: ClientHouseStyleProfile | null): UpsertClientHouseStyleProfilePayload {
  if (!profile) return { ...EMPTY_FORM };
  const next = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM) as FieldKey[]) {
    next[key] = profile[key] || "";
  }
  return next;
}

function hasProfileContent(profile: ClientHouseStyleProfile | null): boolean {
  if (!profile) return false;
  return Object.keys(EMPTY_FORM).some((key) => Boolean(String(profile[key as FieldKey] || "").trim()));
}

export function ClientHouseStylePanel({ clientId, clientName, compact = false, onSaved }: ClientHouseStylePanelProps) {
  const [profile, setProfile] = useState<ClientHouseStyleProfile | null>(null);
  const [form, setForm] = useState<UpsertClientHouseStyleProfilePayload>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    getClientHouseStyle(clientId)
      .then((loaded) => {
        if (cancelled) return;
        setProfile(loaded);
        setForm(toForm(loaded));
        setIsEditing(!hasProfileContent(loaded));
      })
      .catch(() => {
        if (!cancelled) setError("Az ügyfélprofil betöltése sikertelen.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const updateField = (key: FieldKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setIsSaving(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await upsertClientHouseStyle(clientId, form);
      setProfile(saved);
      setForm(toForm(saved));
      setIsEditing(false);
      setMessage("House style profil mentve.");
      onSaved?.();
    } catch {
      setError("A house style profil mentése sikertelen.");
    } finally {
      setIsSaving(false);
    }
  };

  const cancel = () => {
    setForm(toForm(profile));
    setIsEditing(!hasProfileContent(profile));
    setMessage(null);
    setError(null);
  };

  const summary = [
    profile?.preferredLanguage || null,
    profile?.documentLanguageMode || null,
    profile?.fontFamily || null,
    profile?.headingStyle || null,
  ].filter(Boolean).join(" · ");

  return (
    <section className={`border border-[#DDD7CA] bg-[#FBF9F3] ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7B776D]">Ügyfélprofil / house style</p>
          <h3 className="mt-1 font-serif text-xl font-medium text-[#16201A]">{clientName || "Ügyfél"}</h3>
          <p className="mt-1 text-[11px] leading-5 text-[#514D45]">
            Ez a profil prompt- és dokumentum-előkészítési segédlet. Nem módosítja automatikusan a Word-dokumentumot.
          </p>
        </div>
        <AdminStatusPill tone={hasProfileContent(profile) ? "green" : "neutral"}>
          {hasProfileContent(profile) ? "Profil van" : "Nincs profil"}
        </AdminStatusPill>
      </div>

      {isLoading ? <p className="mt-3 text-xs text-[#7B776D]">Profil betöltése...</p> : null}
      {error ? <p className="mt-3 rounded bg-[#FFF5F3] p-2 text-xs font-semibold text-[#8B2A2A]">{error}</p> : null}
      {message ? <p className="mt-3 rounded bg-[#EEF5E7] p-2 text-xs font-semibold text-[#23472F]">{message}</p> : null}

      {!isLoading && !isEditing ? (
        <div className="mt-3 space-y-3">
          <p className="rounded border border-[#EEE7D9] bg-white p-3 text-xs text-[#3D4842]">
            {summary || "Ehhez az ügyfélhez még nincs részletes house style profil."}
          </p>
          <AdminButton size="sm" variant="neutral" onClick={() => setIsEditing(true)}>Szerkesztés</AdminButton>
        </div>
      ) : null}

      {!isLoading && isEditing ? (
        <div className="mt-4 space-y-5">
          {GROUPS.map((group) => (
            <div key={group.title} className="space-y-2">
              <h4 className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#7B776D]">{group.title}</h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.fields.map((field) => (
                  <label key={field.key} className={field.type === "textarea" ? "sm:col-span-2" : ""}>
                    <span className="text-[10px] font-semibold text-[#7B776D]">{field.label}</span>
                    {field.type === "select" ? (
                      <select value={String(form[field.key] || "")} onChange={(event) => updateField(field.key, event.target.value)} className="mt-1 w-full rounded border border-[#DDD7CA] bg-white px-2 py-1.5 text-xs text-[#16201A]">
                        {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    ) : field.type === "textarea" ? (
                      <textarea value={String(form[field.key] || "")} onChange={(event) => updateField(field.key, event.target.value)} rows={compact ? 2 : 3} className="mt-1 w-full rounded border border-[#DDD7CA] bg-white px-2 py-1.5 text-xs text-[#16201A]" />
                    ) : (
                      <input value={String(form[field.key] || "")} onChange={(event) => updateField(field.key, event.target.value)} className="mt-1 w-full rounded border border-[#DDD7CA] bg-white px-2 py-1.5 text-xs text-[#16201A]" />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <AdminButton size="sm" variant="primary" onClick={save} disabled={isSaving}>{isSaving ? "Mentés..." : "Mentés"}</AdminButton>
            <AdminButton size="sm" variant="muted" onClick={cancel} disabled={isSaving}>Mégse</AdminButton>
          </div>
        </div>
      ) : null}
    </section>
  );
}
