"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createPortalOrganizationIntake,
  getPortalMatter,
  getPortalOrganizationCase,
  getPortalOrganizationCases,
  getPortalOrganizationContracts,
  getPortalOrganizationCompany,
  getPortalOrganizationIntakes,
  getPortalOrganizationSummary,
  getPortalOrganizationUnits,
  submitPortalOrganizationIntake,
  type PortalIdentityContext,
  type PortalLeadershipUnitAggregate,
  type PortalOrgCompany,
  type PortalOrgContract,
  type PortalOrganizationCase,
  type PortalOrganizationCaseDetail,
  type PortalOrganizationIntake,
  type PortalOrganizationUnit,
  type PortalWorkspace,
} from "@/lib/clientPortalApi";
import { clientSafeError } from "@/lib/clientInteractionApi";
import { CustomerInteractionCard } from "./CustomerInteractionCard";
import { MatterView } from "./MatterWorkspace";
import { ClientSafeResultCard, DemoContentBanner, PortalPersonHeader, PortalProfileCard } from "./PortalPresentationPrimitives";

export type OrganizationPortalView = "home" | "matters" | "tasks" | "documents" | "messages" | "matter" | "intakes" | "new-intake" | "leadership" | "contracts" | "company";

type Props = {
  view: OrganizationPortalView;
  resourceId?: string;
  context: PortalIdentityContext;
  workspace: PortalWorkspace;
};

type FullPortalMatter = Awaited<ReturnType<typeof getPortalMatter>>;

type OrgState = {
  units: PortalOrganizationUnit[];
  cases: PortalOrganizationCase[];
  intakes: PortalOrganizationIntake[];
  leadership: PortalLeadershipUnitAggregate[] | null;
  contracts: PortalOrgContract[];
  company: PortalOrgCompany | null;
  detail: PortalOrganizationCaseDetail | null;
  matter: FullPortalMatter | null;
  matterLoading: boolean;
  matterError: string | null;
  loading: boolean;
  message: string | null;
};

const card = "min-w-0 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm";
const input = "w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40";

function formatDate(value?: string | null) {
  if (!value) return "Nincs megadva";
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function relationshipLabel(value: string) {
  return value === "OWN" ? "Saját ügyem" : "Megosztott ügy";
}

function intakeStatusLabel(value: string) {
  const labels: Record<string, string> = {
    DRAFT: "Tervezet",
    SUBMITTED: "Beküldve",
    TRIAGE_IN_PROGRESS: "Áttekintés alatt",
    MORE_INFORMATION_REQUIRED: "További információ szükséges",
    LINKED_TO_EXISTING_CASE: "Ügyhöz kapcsolva",
    CONVERTED_TO_CASE: "Üggyé alakítva",
    DECLINED: "Elutasítva",
    WITHDRAWN: "Visszavonva",
    CLOSED: "Lezárva",
  };
  return labels[value] || "Feldolgozás alatt";
}

function OrganizationContextHeader({ context, units }: { context: PortalIdentityContext; units: PortalOrganizationUnit[] }) {
  const workspace = context.selectedWorkspace;
  if (!workspace) return null;
  const roleLabel = workspace.membershipRole === "APPROVER" ? "Szervezeti kapcsolattartó" : workspace.membershipRole === "REPRESENTATIVE" ? "Szervezeti kapcsolattartó" : "Szervezeti portálfelhasználó";
  const isCaseRelay = workspace.mode === "CASE_RELAY";
  return (
    <section className={`${card} bg-gradient-to-br from-white to-[#f7f1e2]`}>
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#9b7b25]">{isCaseRelay ? "Együttműködési ügyfélfelület" : "Szervezeti ügyfélfelület"}</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <h1 className="break-words font-serif text-3xl font-semibold text-stone-950 sm:text-4xl">{workspace.clientDisplayName}</h1>
          <p className="mt-2 text-stone-700">{workspace.name}</p>
          <div className="mt-3"><PortalPersonHeader identity={context.identity} /></div>
        </div>
        <div className="rounded-2xl bg-white/70 p-4 text-sm text-stone-700">
          <p className="font-semibold text-stone-950">{isCaseRelay ? "Áttekintési egységek" : "Szervezeti egységeim"}</p>
          <p className="mt-1">{units.length ? units.map((unit) => unit.name).join(" · ") : "Nincs egységhez kötött tagság"}</p>
          <p className="mt-3 font-semibold text-stone-950">Szerepkör</p>
          <p className="mt-1">{roleLabel}</p>
        </div>
      </div>
    </section>
  );
}

function OrgCaseCard({ item }: { item: PortalOrganizationCase }) {
  return (
    <Link href={`/portal/matters/${encodeURIComponent(item.matterPublicationId)}`} className="block rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-[#b99b45] focus:outline-none focus:ring-4 focus:ring-[#d7c48a]/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{item.publicReference} · {item.organizationUnitName || "Szervezet"}</p>
          <h3 className="mt-1 break-words text-lg font-semibold text-stone-950">{item.publicTitle}</h3>
        </div>
        <span className="rounded-full bg-[#f3ead2] px-3 py-1 text-xs font-semibold text-[#6f5514]">{relationshipLabel(item.relationshipToCase)}</span>
      </div>
      <p className="mt-3 text-sm text-stone-700">{item.publicStatus}</p>
      <dl className="mt-3 grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
        <div><dt className="font-semibold text-stone-800">Mire várunk</dt><dd>{item.waitingOn}</dd></div>
        <div><dt className="font-semibold text-stone-800">Következő lépés</dt><dd>{item.nextStep || "Nincs közzétett következő lépés"}</dd></div>
        <div><dt className="font-semibold text-stone-800">Határidő</dt><dd>{formatDate(item.publicTargetDate)}</dd></div>
        <div><dt className="font-semibold text-stone-800">Frissítve</dt><dd>{formatDate(item.lastPublishedUpdateAt)}</dd></div>
      </dl>
    </Link>
  );
}

function Section({ title, children, empty, emptyText }: { title: string; children?: React.ReactNode; empty?: boolean; emptyText?: string }) {
  return (
    <section className={card}>
      <h2 className="font-serif text-2xl font-semibold text-stone-950">{title}</h2>
      <div className="mt-4 grid gap-3">{empty ? <p className="text-sm text-stone-600">{emptyText || "Nincs megjeleníthető elem."}</p> : children}</div>
    </section>
  );
}

function OrganizationHome({ state, workspace, showIntakes = true }: { state: OrgState; workspace: PortalWorkspace; showIntakes?: boolean }) {
  const own = state.cases.filter((item) => item.relationshipToCase === "OWN");
  const shared = state.cases.filter((item) => item.relationshipToCase === "SHARED");
  const attention = [
    ...workspace.actions.filter((item) => item.bucket === "now"),
    ...state.cases.filter((item) => item.customerActionRequired).map((item) => ({ id: item.matterPublicationId, title: item.publicTitle, matterTitle: item.organizationUnitName || "Szervezeti ügy", status: item.waitingOn, actionUrl: `/portal/matters/${encodeURIComponent(item.matterPublicationId)}` })),
  ];
  return (
    <div className="space-y-5">
      <DemoContentBanner enabled={false} />
      <PortalProfileCard available={false} />
      <ClientSafeResultCard topicLabel="Szervezeti tájékoztató" stateLabel="Jelenleg nincs közzétett eredmény" explanation="Az iroda még nem tett közzé ügyfélnek szóló összefoglalót ezen a felületen." nextAction="A közzétett ügyinformációk itt jelennek meg, amikor elérhetővé válnak." />
      {attention.length ? <Section title="Figyelmet igényel">{attention.slice(0, 6).map((item) => <Link key={item.id} href={item.actionUrl} className="rounded-2xl border border-[#eadfbf] bg-[#fffaf0] p-4 text-sm"><b>{item.title}</b><span className="mt-1 block text-stone-700">{item.matterTitle} · {item.status}</span></Link>)}</Section> : null}
      <Section title="Saját aktív ügyeim" empty={!own.length}>{own.slice(0, 4).map((item) => <OrgCaseCard key={item.publicReference} item={item} />)}</Section>
      {shared.length ? <Section title="Nekem megosztott ügyek">{shared.slice(0, 4).map((item) => <OrgCaseCard key={item.publicReference} item={item} />)}</Section> : null}
      {showIntakes ? <Section title="Általam indított megkeresések" empty={!state.intakes.length}>{state.intakes.slice(0, 5).map((item) => <IntakeRow key={item.reference} item={item} />)}</Section> : null}
      {workspace.messages.length ? <Section title="Olvasatlan kommunikáció">{workspace.messages.slice(0, 5).map((item) => <Link key={item.id} href={item.actionUrl} className="rounded-2xl bg-stone-50 p-4"><b>{item.matterTitle}</b><span className="block text-sm text-stone-700">{item.subject} · {item.status}</span></Link>)}</Section> : null}
      <Section title="Dokumentumok és feltöltések" empty={!workspace.documents.length}>{workspace.documents.slice(0, 6).map((item) => <Link key={`${item.kind}-${item.id}`} href={item.actionUrl} className="rounded-2xl bg-stone-50 p-4"><b>{item.title}</b><span className="block text-sm text-stone-700">{item.matterTitle || "Szervezeti ügy"} · {item.status || "Elérhető"}</span></Link>)}</Section>
      <Section title="Közelgő határidők" empty={!workspace.upcomingDeadlines.length}>{workspace.upcomingDeadlines.map((item) => <Link key={item.id} href={item.actionUrl} className="rounded-2xl bg-stone-50 p-4"><b>{item.title}</b><span className="block text-sm text-stone-700">{formatDate(item.dueAt)}</span></Link>)}</Section>
    </div>
  );
}

function IntakeRow({ item }: { item: PortalOrganizationIntake }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <b className="break-words text-stone-950">{item.subject}</b>
        <span className="rounded-full bg-white px-3 py-1 text-xs text-stone-700">{intakeStatusLabel(item.status)}</span>
      </div>
      <p className="mt-2 text-stone-600">Egység: {item.organizationGroupName || item.organizationGroupId || "Nincs megadva"} · Beküldve: {formatDate(item.submittedAt)}</p>
      {item.linkedMatterPublicationId ? <Link className="mt-2 inline-flex text-[#7a5f18] underline" href={`/portal/matters/${encodeURIComponent(item.linkedMatterPublicationId)}`}>Kapcsolt ügy megnyitása</Link> : null}
    </div>
  );
}

function OrganizationMatters({ cases, units }: { cases: PortalOrganizationCase[]; units: PortalOrganizationUnit[] }) {
  const [filter, setFilter] = useState<"ALL" | "OWN" | "SHARED">("ALL");
  const [unitName, setUnitName] = useState("");
  const [query, setQuery] = useState("");
  const visible = cases.filter((item) => (filter === "ALL" || item.relationshipToCase === filter) && (!unitName || item.organizationUnitName === unitName) && (!query.trim() || `${item.publicTitle} ${item.publicReference}`.toLowerCase().includes(query.toLowerCase())));
  return (
    <div className="space-y-5">
      <section className={card}>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b95e4b]">Ügyeim</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-stone-950">Saját és megosztott szervezeti ügyek</h1>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <input className={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Keresés cím vagy hivatkozás szerint" aria-label="Ügy keresése" />
          <select className={input} value={filter} onChange={(event) => setFilter(event.target.value as "ALL" | "OWN" | "SHARED")} aria-label="Ügykapcsolat szűrő">
            <option value="ALL">Minden</option><option value="OWN">Saját</option><option value="SHARED">Megosztott</option>
          </select>
          <select className={input} value={unitName} onChange={(event) => setUnitName(event.target.value)} aria-label="Szervezeti egység szűrő">
            <option value="">Minden szervezeti egység</option>
            {units.map((unit) => <option key={unit.id} value={unit.name}>{unit.name}</option>)}
          </select>
        </div>
      </section>
      <Section title="Saját ügyeim" empty={!visible.filter((item) => item.relationshipToCase === "OWN").length}>{visible.filter((item) => item.relationshipToCase === "OWN").map((item) => <OrgCaseCard key={item.publicReference} item={item} />)}</Section>
      {visible.some((item) => item.relationshipToCase === "SHARED") ? <Section title="Megosztott velem">{visible.filter((item) => item.relationshipToCase === "SHARED").map((item) => <OrgCaseCard key={item.publicReference} item={item} />)}</Section> : null}
    </div>
  );
}

function OrganizationMatterDetail({
  detail,
  matter,
  matterLoading,
  matterError,
}: {
  detail: PortalOrganizationCaseDetail | null;
  matter: FullPortalMatter | null;
  matterLoading: boolean;
  matterError: string | null;
}) {
  if (!detail) return <section className={card}>Az ügy nem érhető el ezen az ügyfélfelületen.</section>;
  if (matterLoading) return <section className={card}>Ügy részleteinek betöltése…</section>;
  if (matterError) return <section className={card}>{matterError}</section>;
  if (!matter) return <section className={card}>Az ügy részletei jelenleg nem érhetők el.</section>;
  return (
    <MatterView
      matter={matter}
      showDocuments={detail.capabilities.showDocuments}
      showMessages={detail.capabilities.showMessages}
      communicationSection={
        <CustomerInteractionCard caseId={matter.caseId} allowAsk={detail.capabilities.allowMessages} />
      }
    />
  );
}

function OrganizationDocuments({ workspace }: { workspace: PortalWorkspace }) {
  const shared = workspace.documents.filter((item) => item.kind === "SHARED_DOCUMENT");
  const uploads = workspace.documents.filter((item) => item.kind !== "SHARED_DOCUMENT");
  return (
    <div className="space-y-5">
      <Section title="Legutóbb megosztott" empty={!shared.length}>{shared.map((item) => <Link key={item.id} href={item.actionUrl} className="rounded-2xl border border-stone-200 bg-white p-4"><b>{item.title}</b><span className="block text-sm text-stone-600">{item.matterTitle || "Szervezeti ügy"} · {formatDate(item.publishedAt)}</span></Link>)}</Section>
      <Section title="Ügyek szerint" empty={!workspace.documents.length}>{workspace.documents.map((item) => <Link key={`${item.kind}-${item.id}`} href={item.actionUrl} className="rounded-2xl bg-stone-50 p-4"><b>{item.matterTitle || "Közzétett ügy"}</b><span className="block text-sm text-stone-700">{item.title}</span></Link>)}</Section>
      <Section title="Feltöltésre vár" empty={!uploads.length}>{uploads.map((item) => <Link key={`${item.kind}-${item.id}`} href={item.actionUrl} className="rounded-2xl border border-[#eadfbf] bg-[#fffaf0] p-4"><b>{item.title}</b><span className="block text-sm text-stone-700">A fájl beérkezés után ellenőrzésre vár.</span></Link>)}</Section>
    </div>
  );
}

function OrganizationMessages({ workspace, cases }: { workspace: PortalWorkspace; cases: PortalOrganizationCase[] }) {
  if (!workspace.messages.length) return <Section title="Kapcsolat" empty emptyText="Még nincs folyamatban kérdés vagy üzenetváltás." />;
  return (
    <Section title="Kapcsolat">
      <p className="text-sm text-stone-600">Itt tud az irodával az ügyeiről egyeztetni.</p>
      <div className="mt-3 grid gap-3">
        {workspace.messages.map((message) => {
          const linked = cases.find((item) => message.matterTitle.includes(item.publicTitle) || message.actionUrl.includes(item.publicReference));
          return <Link key={message.id} href={message.actionUrl} className="rounded-2xl bg-stone-50 p-4"><b>{message.matterTitle}</b><span className="block text-sm text-stone-700">{linked?.organizationUnitName ? `${linked.organizationUnitName} · ` : ""}{message.subject} · {message.status}</span></Link>;
        })}
      </div>
    </Section>
  );
}

function OrganizationTasks({ workspace }: { workspace: PortalWorkspace }) {
  const groups: Array<[string, string]> = [["now", "Most szükséges"], ["upcoming", "Közelgő"], ["completed", "Teljesített"]];
  return (
    <div className="space-y-5">
      <section className={card}>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b95e4b]">Teendők</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-stone-950">Ami most Öntől kell</h1>
      </section>
      {groups.map(([bucket, label]) => {
        const items = workspace.actions.filter((item) => item.bucket === bucket);
        return <Section key={bucket} title={label} empty={!items.length} emptyText={bucket === "completed" ? "Még nincs teljesített teendő." : "Jelenleg nincs Öntől szükséges teendő."}>{items.slice(0, 10).map((item) => <Link key={item.id} href={item.actionUrl} className="rounded-2xl border border-stone-200 bg-white p-4 text-sm"><b className="block text-stone-950">{item.title}</b><span className="mt-1 block text-stone-600">{item.matterTitle}{item.dueAt ? ` · Határidő: ${formatDate(item.dueAt)}` : ""}</span></Link>)}</Section>;
      })}
    </div>
  );
}

function OrganizationContracts({ contracts }: { contracts: PortalOrgContract[] }) {
  if (!contracts.length) {
    return (
      <Section title="Szerződések" empty emptyText="Jelenleg nincs közzétett szerződéses áttekintés. Ha elkészül egy közzétehető szerződéses dokumentum, az itt fog megjelenni.">
        <p className="text-sm text-stone-600" />
      </Section>
    );
  }
  return (
    <div className="space-y-5">
      <section className={card}>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b95e4b]">Szerződések</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-stone-950">Közzétett szerződéses dokumentumok</h1>
        <p className="mt-2 text-sm text-stone-600">Csak azok a szerződéses dokumentumok láthatók, amelyeket az iroda közzétett az Ön számára.</p>
      </section>
      <Section title="Közzétett szerződések">
        {contracts.map((contract) => (
          <article key={contract.reference} className="rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="break-words text-lg font-semibold text-stone-950">{contract.title}</h3>
                {contract.relatedMatterTitle ? <p className="mt-1 text-sm text-stone-600">Kapcsolódó ügy: {contract.relatedMatterTitle}</p> : null}
              </div>
              <span className="rounded-full bg-[#f3ead2] px-3 py-1 text-xs font-semibold text-[#6f5514]">{contract.statusLabel}</span>
            </div>
            <dl className="mt-3 grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
              <div><dt className="font-semibold text-stone-800">Kulcsdátum</dt><dd>{formatDate(contract.keyDate)}</dd></div>
              <div><dt className="font-semibold text-stone-800">Közzétett dokumentum</dt><dd>{contract.publishedDoc ? `${contract.publishedDoc.title || contract.title} · ${contract.publishedDoc.versionLabel}` : "Nincs letölthető dokumentum"}</dd></div>
            </dl>
            {contract.publishedDoc?.downloadAvailable ? (
              <Link className="mt-3 inline-flex rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white" href={`/portal/documents/${encodeURIComponent(contract.publishedDoc.publicationId)}`}>
                Dokumentum megnyitása
              </Link>
            ) : null}
          </article>
        ))}
      </Section>
    </div>
  );
}

function OrganizationCompany({ company }: { company: PortalOrgCompany | null }) {
  if (!company) return <Section title="Vállalat" empty emptyText="Ehhez az ügyfélfelülethez jelenleg nincs közzétehető vállalati áttekintés." />;
  const areaActivity = company.visibleMattersByArea.filter((area) => area.visibleMatterCount > 0);
  return (
    <div className="space-y-5">
      <section className={card}>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b95e4b]">Vállalat</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-stone-950">{company.companyName}</h1>
        {company.profileHeadline ? <p className="mt-2 max-w-2xl leading-7 text-stone-700">{company.profileHeadline}</p> : null}
      </section>
      <Section title="Szervezeti egységek" empty={!company.groups.length}>
        <div className="grid gap-3 sm:grid-cols-2">
          {company.groups.map((group) => (
            <div key={group.id} className="rounded-2xl border border-stone-200 bg-white p-4">
              <h3 className="font-semibold text-stone-950">{group.name}</h3>
              {group.parentGroupId ? <p className="mt-1 text-sm text-stone-600">Része egy magasabb szintű egységnek.</p> : null}
            </div>
          ))}
        </div>
      </Section>
      <Section title="Aktív területek" empty={!areaActivity.length} emptyText="Jelenleg nincs olyan szervezeti terület, ahol közzétett ügye van.">
        <div className="grid gap-3 sm:grid-cols-2">
          {areaActivity.map((area) => (
            <div key={area.areaName} className="rounded-2xl border border-stone-200 bg-white p-4">
              <b className="text-stone-950">{area.areaName}</b>
              <span className="block text-sm text-stone-600">{area.visibleMatterCount} közzétett ügy</span>
            </div>
          ))}
        </div>
      </Section>
      {company.initiatives.length ? (
        <Section title="Fejlődési kezdeményezések">
          <div className="grid gap-3 sm:grid-cols-2">
            {company.initiatives.map((initiative) => (
              <div key={initiative.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2"><b className="text-stone-950">{initiative.title}</b><span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-700">{initiative.statusLabel}</span></div>
                {initiative.targetState ? <p className="mt-1 text-sm text-stone-600">{initiative.targetState}</p> : null}
                {initiative.targetAt ? <p className="mt-1 text-sm text-stone-500">Cél: {formatDate(initiative.targetAt)}</p> : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function NewIntake({ units, onCreated }: { units: PortalOrganizationUnit[]; onCreated: () => void }) {
  const [subject, setSubject] = useState("");
  const [groupId, setGroupId] = useState("");
  const [descriptionSafe, setDescriptionSafe] = useState("");
  const [urgency, setUrgency] = useState("NORMAL");
  const [requestedDeadline, setRequestedDeadline] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activeUnits = useMemo(() => units, [units]);
  useEffect(() => {
    if (activeUnits.length === 1 && groupId !== activeUnits[0].id) setGroupId(activeUnits[0].id);
    if (activeUnits.length === 0 && groupId) setGroupId("");
  }, [activeUnits, groupId]);
  const submit = async () => {
    if (!activeUnits.length) {
      setMessage("Ehhez a művelethez még nincs szervezeti egységhez rendelve. A megkeresés elküldéséhez előbb szervezeti egységhez kell tartoznia. Kérjük, jelezze kapcsolattartójának.");
      return;
    }
    if (!groupId) {
      setMessage("Válassza ki, melyik szervezeti egység nevében küldi be a megkeresést.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const draft = await createPortalOrganizationIntake({ subject, organizationGroupId: groupId || undefined, descriptionSafe, urgency, requestedDeadline: requestedDeadline || null });
      await submitPortalOrganizationIntake(draft.reference, draft.revision);
      setSubject("");
      setDescriptionSafe("");
      setRequestedDeadline("");
      setMessage("A megkeresés beküldve. Ez még nem hoz létre új ügyet; az iroda először áttekinti, majd visszajelez.");
      onCreated();
    } catch (error) {
      setMessage(clientSafeError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={card}>
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b95e4b]">Új megkeresés</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold text-stone-950">Szervezeti megkeresés indítása</h1>
      <p className="mt-2 text-sm text-stone-600">A megkeresés elküldése még nem hoz létre új ügyet. Az iroda először áttekinti, majd visszajelez.</p>
      {!activeUnits.length ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status">
          Ehhez a művelethez még nincs szervezeti egységhez rendelve. A megkeresés elküldéséhez előbb szervezeti egységhez kell tartoznia. Kérjük, jelezze kapcsolattartójának.
        </div>
      ) : null}
      <div className="mt-5 grid gap-3">
        <label className="grid gap-1 text-sm font-semibold">Tárgy<input className={input} value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
        <label className="grid gap-1 text-sm font-semibold">Szervezeti egység<select className={input} value={groupId} onChange={(event) => setGroupId(event.target.value)} disabled={activeUnits.length <= 1}>{activeUnits.length === 1 ? null : <option value="">— válasszon szervezeti egységet —</option>}{activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Leírás<textarea className={input} value={descriptionSafe} onChange={(event) => setDescriptionSafe(event.target.value)} rows={5} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">Sürgősség<select className={input} value={urgency} onChange={(event) => setUrgency(event.target.value)}><option value="NORMAL">Normál</option><option value="URGENT">Sürgős</option></select></label>
          <label className="grid gap-1 text-sm font-semibold">Kért határidő<input type="date" className={input} value={requestedDeadline} onChange={(event) => setRequestedDeadline(event.target.value)} /></label>
        </div>
      </div>
      {message ? <p className="mt-4 rounded-2xl bg-stone-100 p-3 text-sm text-stone-700" role="status">{message}</p> : null}
      <button className="mt-4 rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !activeUnits.length || !subject.trim() || !descriptionSafe.trim()} onClick={() => void submit()}>Megkeresés beküldése</button>
    </section>
  );
}

function LeadershipSummary({ units, mode }: { units: PortalLeadershipUnitAggregate[] | null; mode?: string }) {
  const isCaseRelay = mode === "CASE_RELAY";
  const title = isCaseRelay ? "Együttműködési áttekintés" : "Vezetői áttekintés";
  if (!units) return <section className={card}>Ehhez az ügyfélfelülethez nincs vezetői összesítő rálátás.</section>;
  return (
    <Section title={title} empty={!units.length}>
      <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">Ez az oldal kizárólag összesített adatokat mutat, és nem ad hozzáférést egyedi ügyekhez, dokumentumokhoz vagy kommunikációhoz.</p>
      {units.map((unit) => <div key={unit.organizationUnitName || "organization"} className="rounded-2xl border border-stone-200 bg-white p-4">
        <h3 className="font-semibold text-stone-950">{unit.organizationUnitName || "Teljes szervezet"}</h3>
        <dl className="mt-3 grid gap-2 text-sm text-stone-700 sm:grid-cols-3">
          <div><dt>Aktív ügyek</dt><dd className="font-semibold">{unit.activeCaseCount}</dd></div>
          <div><dt>Lezárt ügyek</dt><dd className="font-semibold">{unit.closedCaseCount}</dd></div>
          <div><dt>Közelgő határidők</dt><dd className="font-semibold">{unit.approachingDeadlineCount}</dd></div>
          <div><dt>Ügyfélre vár</dt><dd className="font-semibold">{unit.waitingOnCustomerCount}</dd></div>
          <div><dt>Irodára vár</dt><dd className="font-semibold">{unit.waitingOnOfficeCount}</dd></div>
        </dl>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Jogi terület szerinti megoszlás</p>
            <div className="mt-2 flex flex-wrap gap-2">{Object.entries(unit.legalAreaDistribution || {}).map(([area, count]) => <span key={area} className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-700">{area}: {count}</span>)}</div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Jelenlegi státuszok</p>
            <div className="mt-2 flex flex-wrap gap-2">{Object.entries(unit.publicStageCounts).map(([stage, count]) => <span key={stage} className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-700">{stage}: {count}</span>)}</div>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Legutóbbi biztonságos aktivitás</p>
          <div className="mt-2 grid gap-2">{(unit.recentSafeActivity || []).length ? unit.recentSafeActivity.map((activity) => <p key={`${activity.label}-${activity.happenedAt}`} className="rounded-xl bg-stone-50 p-3 text-xs text-stone-700">{activity.label} · {formatDate(activity.happenedAt)}</p>) : <p className="text-sm text-stone-600">Nincs friss összesített aktivitás.</p>}</div>
        </div>
      </div>)}
    </Section>
  );
}

export function OrganizationPortalViews({ view, resourceId, context, workspace }: Props) {
  const [state, setState] = useState<OrgState>({ units: [], cases: [], intakes: [], leadership: null, contracts: [], company: null, detail: null, matter: null, matterLoading: false, matterError: null, loading: true, message: null });
  const communicationDisabled = context.selectedWorkspace?.communicationMode === "EXTERNAL_ONLY";
  const isCaseRelay = context.selectedWorkspace?.mode === "CASE_RELAY";

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, message: null, detail: null, matter: null, matterError: null }));
    try {
      const [unitsPage, casesPage, intakesPage, leadership, contractsPage, company] = await Promise.all([
        getPortalOrganizationUnits(),
        getPortalOrganizationCases({ limit: 50 }),
        isCaseRelay ? Promise.resolve({ items: [] }) : getPortalOrganizationIntakes({ limit: 20 }),
        getPortalOrganizationSummary().then((result) => result.units).catch(() => null),
        getPortalOrganizationContracts().then((result) => result.items).catch(() => []),
        getPortalOrganizationCompany().catch(() => null),
      ]);
      const caseReference = view === "matter" && resourceId
        ? (casesPage.items || []).find((item) => item.matterPublicationId === resourceId || item.publicReference === resourceId)?.publicReference || resourceId
        : null;
      const detail = caseReference ? await getPortalOrganizationCase(caseReference).catch(() => null) : null;
      setState({ units: unitsPage.items || [], cases: casesPage.items || [], intakes: intakesPage.items || [], leadership, contracts: contractsPage, company, detail, matter: null, matterLoading: false, matterError: null, loading: false, message: null });
      if (detail?.matterPublicationId) {
        setState((current) => ({ ...current, matterLoading: true }));
        try {
          const matter = await getPortalMatter(detail.matterPublicationId);
          setState((current) => ({ ...current, matter, matterLoading: false }));
        } catch (error) {
          setState((current) => ({ ...current, matterError: clientSafeError(error), matterLoading: false }));
        }
      }
    } catch (error) {
      setState((current) => ({ ...current, loading: false, message: clientSafeError(error) }));
    }
  }, [isCaseRelay, resourceId, view]);

  useEffect(() => { void load(); }, [load]);

  const hasLeadership = useMemo(() => Boolean(state.leadership?.length), [state.leadership]);

  if (state.loading) return <section className={card}>Szervezeti ügyfélfelület betöltése…</section>;
  if (state.message) return <section className={card}>{state.message}</section>;
  if (communicationDisabled && view === "messages") return <section className={card}>Ehhez az ügyfélfelülethez a portálon belüli üzenetküldés nincs engedélyezve.</section>;

  return (
    <div className="space-y-6" data-testid="organization-client-portal">
      <OrganizationContextHeader context={context} units={state.units} />
      {view === "home" && isCaseRelay ? <><LeadershipSummary units={state.leadership} mode={context.selectedWorkspace?.mode} /><OrganizationHome state={state} workspace={workspace} showIntakes={false} /></> : null}
      {view === "home" && !isCaseRelay ? <OrganizationHome state={state} workspace={workspace} /> : null}
      {view === "matters" ? <OrganizationMatters cases={state.cases} units={state.units} /> : null}
      {view === "matter" ? <OrganizationMatterDetail detail={state.detail} matter={state.matter} matterLoading={state.matterLoading} matterError={state.matterError} /> : null}
      {view === "documents" ? <OrganizationDocuments workspace={workspace} /> : null}
      {view === "messages" ? <OrganizationMessages workspace={workspace} cases={state.cases} /> : null}
      {view === "tasks" ? <OrganizationTasks workspace={workspace} /> : null}
      {view === "contracts" ? <OrganizationContracts contracts={state.contracts} /> : null}
      {view === "company" ? <OrganizationCompany company={state.company} /> : null}
      {view === "intakes" && !isCaseRelay ? <Section title="Megkereséseim" empty={!state.intakes.length}>{state.intakes.map((item) => <IntakeRow key={item.reference} item={item} />)}</Section> : null}
      {view === "new-intake" && !isCaseRelay ? <NewIntake units={state.units} onCreated={load} /> : null}
      {view === "leadership" ? <LeadershipSummary units={state.leadership} mode={context.selectedWorkspace?.mode} /> : null}
    </div>
  );
}
