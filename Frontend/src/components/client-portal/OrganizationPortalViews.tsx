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
import { PortalPersonHeader } from "./PortalPresentationPrimitives";
import { DemoCompanyPresentation } from "./DemoCompanyPresentation";

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
  return value === "OWN" ? "SajĂˇt ĂĽgyem" : "Megosztott ĂĽgy";
}

function intakeStatusLabel(value: string) {
  const labels: Record<string, string> = {
    DRAFT: "Tervezet",
    SUBMITTED: "BekĂĽldve",
    TRIAGE_IN_PROGRESS: "ĂttekintĂ©s alatt",
    MORE_INFORMATION_REQUIRED: "TovĂˇbbi informĂˇciĂł szĂĽksĂ©ges",
    LINKED_TO_EXISTING_CASE: "ĂśgyhĂ¶z kapcsolva",
    CONVERTED_TO_CASE: "ĂśggyĂ© alakĂ­tva",
    DECLINED: "ElutasĂ­tva",
    WITHDRAWN: "Visszavonva",
    CLOSED: "LezĂˇrva",
  };
  return labels[value] || "FeldolgozĂˇs alatt";
}

function OrganizationContextHeader({ context, units }: { context: PortalIdentityContext; units: PortalOrganizationUnit[] }) {
  const workspace = context.selectedWorkspace;
  if (!workspace) return null;
  const roleLabel = workspace.membershipRole === "APPROVER" ? "Szervezeti kapcsolattartĂł" : workspace.membershipRole === "REPRESENTATIVE" ? "Szervezeti kapcsolattartĂł" : "Szervezeti portĂˇlfelhasznĂˇlĂł";
  const isCaseRelay = workspace.mode === "CASE_RELAY";
  return (
    <section className={`${card} bg-gradient-to-br from-white to-[#f7f1e2]`}>
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#9b7b25]">{isCaseRelay ? "EgyĂĽttmĹ±kĂ¶dĂ©si ĂĽgyfĂ©lfelĂĽlet" : "Szervezeti ĂĽgyfĂ©lfelĂĽlet"}</p>
      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <h1 className="break-words font-serif text-3xl font-semibold text-stone-950 sm:text-4xl">{workspace.clientDisplayName}</h1>
          <p className="mt-2 text-stone-700">{workspace.name}</p>
          <div className="mt-3"><PortalPersonHeader identity={context.identity} /></div>
        </div>
        <div className="rounded-2xl bg-white/70 p-4 text-sm text-stone-700">
          <p className="font-semibold text-stone-950">{isCaseRelay ? "ĂttekintĂ©si egysĂ©gek" : "Szervezeti egysĂ©geim"}</p>
          <p className="mt-1">{units.length ? units.map((unit) => unit.name).join(" Â· ") : "Nincs egysĂ©ghez kĂ¶tĂ¶tt tagsĂˇg"}</p>
          <p className="mt-3 font-semibold text-stone-950">SzerepkĂ¶r</p>
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{item.publicReference} Â· {item.organizationUnitName || "Szervezet"}</p>
          <h3 className="mt-1 break-words text-lg font-semibold text-stone-950">{item.publicTitle}</h3>
        </div>
        <span className="rounded-full bg-[#f3ead2] px-3 py-1 text-xs font-semibold text-[#6f5514]">{relationshipLabel(item.relationshipToCase)}</span>
      </div>
      <p className="mt-3 text-sm text-stone-700">{item.publicStatus}</p>
      <dl className="mt-3 grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
        <div><dt className="font-semibold text-stone-800">Mire vĂˇrunk</dt><dd>{item.waitingOn}</dd></div>
        <div><dt className="font-semibold text-stone-800">KĂ¶vetkezĹ‘ lĂ©pĂ©s</dt><dd>{item.nextStep || "Nincs kĂ¶zzĂ©tett kĂ¶vetkezĹ‘ lĂ©pĂ©s"}</dd></div>
        <div><dt className="font-semibold text-stone-800">HatĂˇridĹ‘</dt><dd>{formatDate(item.publicTargetDate)}</dd></div>
        <div><dt className="font-semibold text-stone-800">FrissĂ­tve</dt><dd>{formatDate(item.lastPublishedUpdateAt)}</dd></div>
      </dl>
    </Link>
  );
}

function Section({ title, children, empty, emptyText }: { title: string; children?: React.ReactNode; empty?: boolean; emptyText?: string }) {
  return (
    <section className={card}>
      <h2 className="font-serif text-2xl font-semibold text-stone-950">{title}</h2>
      <div className="mt-4 grid gap-3">{empty ? <p className="text-sm text-stone-600">{emptyText || "Nincs megjelenĂ­thetĹ‘ elem."}</p> : children}</div>
    </section>
  );
}

function OrganizationHome({ state, workspace, showIntakes = true }: { state: OrgState; workspace: PortalWorkspace; showIntakes?: boolean }) {
  const own = state.cases.filter((item) => item.relationshipToCase === "OWN");
  const shared = state.cases.filter((item) => item.relationshipToCase === "SHARED");
  const attention = [
    ...workspace.actions.filter((item) => item.bucket === "now"),
    ...state.cases.filter((item) => item.customerActionRequired).map((item) => ({ id: item.matterPublicationId, title: item.publicTitle, matterTitle: item.organizationUnitName || "Szervezeti ĂĽgy", status: item.waitingOn, actionUrl: `/portal/matters/${encodeURIComponent(item.matterPublicationId)}` })),
  ];
  return (
    <div className="space-y-5">
      <DemoContentBanner enabled={false} />
      <PortalProfileCard available={false} />
      <ClientSafeResultCard topicLabel="Szervezeti tĂˇjĂ©koztatĂł" stateLabel="Jelenleg nincs kĂ¶zzĂ©tett eredmĂ©ny" explanation="Az iroda mĂ©g nem tett kĂ¶zzĂ© ĂĽgyfĂ©lnek szĂłlĂł Ă¶sszefoglalĂłt ezen a felĂĽleten." nextAction="A kĂ¶zzĂ©tett ĂĽgyinformĂˇciĂłk itt jelennek meg, amikor elĂ©rhetĹ‘vĂ© vĂˇlnak." />
      {attention.length ? <Section title="Figyelmet igĂ©nyel">{attention.slice(0, 6).map((item) => <Link key={item.id} href={item.actionUrl} className="rounded-2xl border border-[#eadfbf] bg-[#fffaf0] p-4 text-sm"><b>{item.title}</b><span className="mt-1 block text-stone-700">{item.matterTitle} Â· {item.status}</span></Link>)}</Section> : null}
      <Section title="SajĂˇt aktĂ­v ĂĽgyeim" empty={!own.length}>{own.slice(0, 4).map((item) => <OrgCaseCard key={item.publicReference} item={item} />)}</Section>
      {shared.length ? <Section title="Nekem megosztott ĂĽgyek">{shared.slice(0, 4).map((item) => <OrgCaseCard key={item.publicReference} item={item} />)}</Section> : null}
      {showIntakes ? <Section title="Ăltalam indĂ­tott megkeresĂ©sek" empty={!state.intakes.length}>{state.intakes.slice(0, 5).map((item) => <IntakeRow key={item.reference} item={item} />)}</Section> : null}
      {workspace.messages.length ? <Section title="Olvasatlan kommunikĂˇciĂł">{workspace.messages.slice(0, 5).map((item) => <Link key={item.id} href={item.actionUrl} className="rounded-2xl bg-stone-50 p-4"><b>{item.matterTitle}</b><span className="block text-sm text-stone-700">{item.subject} Â· {item.status}</span></Link>)}</Section> : null}
      <Section title="Dokumentumok Ă©s feltĂ¶ltĂ©sek" empty={!workspace.documents.length}>{workspace.documents.slice(0, 6).map((item) => <Link key={`${item.kind}-${item.id}`} href={item.actionUrl} className="rounded-2xl bg-stone-50 p-4"><b>{item.title}</b><span className="block text-sm text-stone-700">{item.matterTitle || "Szervezeti ĂĽgy"} Â· {item.status || "ElĂ©rhetĹ‘"}</span></Link>)}</Section>
      <Section title="KĂ¶zelgĹ‘ hatĂˇridĹ‘k" empty={!workspace.upcomingDeadlines.length}>{workspace.upcomingDeadlines.map((item) => <Link key={item.id} href={item.actionUrl} className="rounded-2xl bg-stone-50 p-4"><b>{item.title}</b><span className="block text-sm text-stone-700">{formatDate(item.dueAt)}</span></Link>)}</Section>
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
      <p className="mt-2 text-stone-600">EgysĂ©g: {item.organizationGroupName || item.organizationGroupId || "Nincs megadva"} Â· BekĂĽldve: {formatDate(item.submittedAt)}</p>
      {item.linkedMatterPublicationId ? <Link className="mt-2 inline-flex text-[#7a5f18] underline" href={`/portal/matters/${encodeURIComponent(item.linkedMatterPublicationId)}`}>Kapcsolt ĂĽgy megnyitĂˇsa</Link> : null}
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
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b95e4b]">Ăśgyeim</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-stone-950">SajĂˇt Ă©s megosztott szervezeti ĂĽgyek</h1>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <input className={input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="KeresĂ©s cĂ­m vagy hivatkozĂˇs szerint" aria-label="Ăśgy keresĂ©se" />
          <select className={input} value={filter} onChange={(event) => setFilter(event.target.value as "ALL" | "OWN" | "SHARED")} aria-label="Ăśgykapcsolat szĹ±rĹ‘">
            <option value="ALL">Minden</option><option value="OWN">SajĂˇt</option><option value="SHARED">Megosztott</option>
          </select>
          <select className={input} value={unitName} onChange={(event) => setUnitName(event.target.value)} aria-label="Szervezeti egysĂ©g szĹ±rĹ‘">
            <option value="">Minden szervezeti egysĂ©g</option>
            {units.map((unit) => <option key={unit.id} value={unit.name}>{unit.name}</option>)}
          </select>
        </div>
      </section>
      <Section title="SajĂˇt ĂĽgyeim" empty={!visible.filter((item) => item.relationshipToCase === "OWN").length}>{visible.filter((item) => item.relationshipToCase === "OWN").map((item) => <OrgCaseCard key={item.publicReference} item={item} />)}</Section>
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
  if (!detail) return <section className={card}>Az ĂĽgy nem Ă©rhetĹ‘ el ezen az ĂĽgyfĂ©lfelĂĽleten.</section>;
  if (matterLoading) return <section className={card}>Ăśgy rĂ©szleteinek betĂ¶ltĂ©seâ€¦</section>;
  if (matterError) return <section className={card}>{matterError}</section>;
  if (!matter) return <section className={card}>Az ĂĽgy rĂ©szletei jelenleg nem Ă©rhetĹ‘k el.</section>;
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
      <Section title="LegutĂłbb megosztott" empty={!shared.length}>{shared.map((item) => <Link key={item.id} href={item.actionUrl} className="rounded-2xl border border-stone-200 bg-white p-4"><b>{item.title}</b><span className="block text-sm text-stone-600">{item.matterTitle || "Szervezeti ĂĽgy"} Â· {formatDate(item.publishedAt)}</span></Link>)}</Section>
      <Section title="Ăśgyek szerint" empty={!workspace.documents.length}>{workspace.documents.map((item) => <Link key={`${item.kind}-${item.id}`} href={item.actionUrl} className="rounded-2xl bg-stone-50 p-4"><b>{item.matterTitle || "KĂ¶zzĂ©tett ĂĽgy"}</b><span className="block text-sm text-stone-700">{item.title}</span></Link>)}</Section>
      <Section title="FeltĂ¶ltĂ©sre vĂˇr" empty={!uploads.length}>{uploads.map((item) => <Link key={`${item.kind}-${item.id}`} href={item.actionUrl} className="rounded-2xl border border-[#eadfbf] bg-[#fffaf0] p-4"><b>{item.title}</b><span className="block text-sm text-stone-700">A fĂˇjl beĂ©rkezĂ©s utĂˇn ellenĹ‘rzĂ©sre vĂˇr.</span></Link>)}</Section>
    </div>
  );
}

function OrganizationMessages({ workspace, cases }: { workspace: PortalWorkspace; cases: PortalOrganizationCase[] }) {
  if (!workspace.messages.length) return <Section title="Kapcsolat" empty emptyText="MĂ©g nincs folyamatban kĂ©rdĂ©s vagy ĂĽzenetvĂˇltĂˇs." />;
  return (
    <Section title="Kapcsolat">
      <p className="text-sm text-stone-600">Itt tud az irodĂˇval az ĂĽgyeirĹ‘l egyeztetni.</p>
      <div className="mt-3 grid gap-3">
        {workspace.messages.map((message) => {
          const linked = cases.find((item) => message.matterTitle.includes(item.publicTitle) || message.actionUrl.includes(item.publicReference));
          return <Link key={message.id} href={message.actionUrl} className="rounded-2xl bg-stone-50 p-4"><b>{message.matterTitle}</b><span className="block text-sm text-stone-700">{linked?.organizationUnitName ? `${linked.organizationUnitName} Â· ` : ""}{message.subject} Â· {message.status}</span></Link>;
        })}
      </div>
    </Section>
  );
}

function OrganizationTasks({ workspace }: { workspace: PortalWorkspace }) {
  const groups: Array<[string, string]> = [["now", "Most szĂĽksĂ©ges"], ["upcoming", "KĂ¶zelgĹ‘"], ["completed", "TeljesĂ­tett"]];
  return (
    <div className="space-y-5">
      <section className={card}>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b95e4b]">TeendĹ‘k</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-stone-950">Ami most Ă–ntĹ‘l kell</h1>
      </section>
      {groups.map(([bucket, label]) => {
        const items = workspace.actions.filter((item) => item.bucket === bucket);
        return <Section key={bucket} title={label} empty={!items.length} emptyText={bucket === "completed" ? "MĂ©g nincs teljesĂ­tett teendĹ‘." : "Jelenleg nincs Ă–ntĹ‘l szĂĽksĂ©ges teendĹ‘."}>{items.slice(0, 10).map((item) => <Link key={item.id} href={item.actionUrl} className="rounded-2xl border border-stone-200 bg-white p-4 text-sm"><b className="block text-stone-950">{item.title}</b><span className="mt-1 block text-stone-600">{item.matterTitle}{item.dueAt ? ` Â· HatĂˇridĹ‘: ${formatDate(item.dueAt)}` : ""}</span></Link>)}</Section>;
      })}
    </div>
  );
}

function OrganizationContracts({ contracts }: { contracts: PortalOrgContract[] }) {
  if (!contracts.length) {
    return (
      <Section title="SzerzĹ‘dĂ©sek" empty emptyText="Jelenleg nincs kĂ¶zzĂ©tett szerzĹ‘dĂ©ses ĂˇttekintĂ©s. Ha elkĂ©szĂĽl egy kĂ¶zzĂ©tehetĹ‘ szerzĹ‘dĂ©ses dokumentum, az itt fog megjelenni.">
        <p className="text-sm text-stone-600" />
      </Section>
    );
  }
  return (
    <div className="space-y-5">
      <section className={card}>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b95e4b]">SzerzĹ‘dĂ©sek</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-stone-950">KĂ¶zzĂ©tett szerzĹ‘dĂ©ses dokumentumok</h1>
        <p className="mt-2 text-sm text-stone-600">Csak azok a szerzĹ‘dĂ©ses dokumentumok lĂˇthatĂłk, amelyeket az iroda kĂ¶zzĂ©tett az Ă–n szĂˇmĂˇra.</p>
      </section>
      <Section title="KĂ¶zzĂ©tett szerzĹ‘dĂ©sek">
        {contracts.map((contract) => (
          <article key={contract.reference} className="rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="break-words text-lg font-semibold text-stone-950">{contract.title}</h3>
                {contract.relatedMatterTitle ? <p className="mt-1 text-sm text-stone-600">KapcsolĂłdĂł ĂĽgy: {contract.relatedMatterTitle}</p> : null}
              </div>
              <span className="rounded-full bg-[#f3ead2] px-3 py-1 text-xs font-semibold text-[#6f5514]">{contract.statusLabel}</span>
            </div>
            <dl className="mt-3 grid gap-2 text-sm text-stone-600 sm:grid-cols-2">
              <div><dt className="font-semibold text-stone-800">KulcsdĂˇtum</dt><dd>{formatDate(contract.keyDate)}</dd></div>
              <div><dt className="font-semibold text-stone-800">KĂ¶zzĂ©tett dokumentum</dt><dd>{contract.publishedDoc ? `${contract.publishedDoc.title || contract.title} Â· ${contract.publishedDoc.versionLabel}` : "Nincs letĂ¶lthetĹ‘ dokumentum"}</dd></div>
            </dl>
            {contract.publishedDoc?.downloadAvailable ? (
              <Link className="mt-3 inline-flex rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white" href={`/portal/documents/${encodeURIComponent(contract.publishedDoc.publicationId)}`}>
                Dokumentum megnyitĂˇsa
              </Link>
            ) : null}
          </article>
        ))}
      </Section>
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
      setMessage("Ehhez a mĹ±velethez mĂ©g nincs szervezeti egysĂ©ghez rendelve. A megkeresĂ©s elkĂĽldĂ©sĂ©hez elĹ‘bb szervezeti egysĂ©ghez kell tartoznia. KĂ©rjĂĽk, jelezze kapcsolattartĂłjĂˇnak.");
      return;
    }
    if (!groupId) {
      setMessage("VĂˇlassza ki, melyik szervezeti egysĂ©g nevĂ©ben kĂĽldi be a megkeresĂ©st.");
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
      setMessage("A megkeresĂ©s bekĂĽldve. Ez mĂ©g nem hoz lĂ©tre Ăşj ĂĽgyet; az iroda elĹ‘szĂ¶r Ăˇttekinti, majd visszajelez.");
      onCreated();
    } catch (error) {
      setMessage(clientSafeError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={card}>
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b95e4b]">Ăšj megkeresĂ©s</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold text-stone-950">Szervezeti megkeresĂ©s indĂ­tĂˇsa</h1>
      <p className="mt-2 text-sm text-stone-600">A megkeresĂ©s elkĂĽldĂ©se mĂ©g nem hoz lĂ©tre Ăşj ĂĽgyet. Az iroda elĹ‘szĂ¶r Ăˇttekinti, majd visszajelez.</p>
      {!activeUnits.length ? (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status">
          Ehhez a mĹ±velethez mĂ©g nincs szervezeti egysĂ©ghez rendelve. A megkeresĂ©s elkĂĽldĂ©sĂ©hez elĹ‘bb szervezeti egysĂ©ghez kell tartoznia. KĂ©rjĂĽk, jelezze kapcsolattartĂłjĂˇnak.
        </div>
      ) : null}
      <div className="mt-5 grid gap-3">
        <label className="grid gap-1 text-sm font-semibold">TĂˇrgy<input className={input} value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
        <label className="grid gap-1 text-sm font-semibold">Szervezeti egysĂ©g<select className={input} value={groupId} onChange={(event) => setGroupId(event.target.value)} disabled={activeUnits.length <= 1}>{activeUnits.length === 1 ? null : <option value="">â€” vĂˇlasszon szervezeti egysĂ©get â€”</option>}{activeUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">LeĂ­rĂˇs<textarea className={input} value={descriptionSafe} onChange={(event) => setDescriptionSafe(event.target.value)} rows={5} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">SĂĽrgĹ‘ssĂ©g<select className={input} value={urgency} onChange={(event) => setUrgency(event.target.value)}><option value="NORMAL">NormĂˇl</option><option value="URGENT">SĂĽrgĹ‘s</option></select></label>
          <label className="grid gap-1 text-sm font-semibold">KĂ©rt hatĂˇridĹ‘<input type="date" className={input} value={requestedDeadline} onChange={(event) => setRequestedDeadline(event.target.value)} /></label>
        </div>
      </div>
      {message ? <p className="mt-4 rounded-2xl bg-stone-100 p-3 text-sm text-stone-700" role="status">{message}</p> : null}
      <button className="mt-4 rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || !activeUnits.length || !subject.trim() || !descriptionSafe.trim()} onClick={() => void submit()}>MegkeresĂ©s bekĂĽldĂ©se</button>
    </section>
  );
}

function LeadershipSummary({ units, mode }: { units: PortalLeadershipUnitAggregate[] | null; mode?: string }) {
  const isCaseRelay = mode === "CASE_RELAY";
  const title = isCaseRelay ? "EgyĂĽttmĹ±kĂ¶dĂ©si ĂˇttekintĂ©s" : "VezetĹ‘i ĂˇttekintĂ©s";
  if (!units) return <section className={card}>Ehhez az ĂĽgyfĂ©lfelĂĽlethez nincs vezetĹ‘i Ă¶sszesĂ­tĹ‘ rĂˇlĂˇtĂˇs.</section>;
  return (
    <Section title={title} empty={!units.length}>
      <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">Ez az oldal kizĂˇrĂłlag Ă¶sszesĂ­tett adatokat mutat, Ă©s nem ad hozzĂˇfĂ©rĂ©st egyedi ĂĽgyekhez, dokumentumokhoz vagy kommunikĂˇciĂłhoz.</p>
      {units.map((unit) => <div key={unit.organizationUnitName || "organization"} className="rounded-2xl border border-stone-200 bg-white p-4">
        <h3 className="font-semibold text-stone-950">{unit.organizationUnitName || "Teljes szervezet"}</h3>
        <dl className="mt-3 grid gap-2 text-sm text-stone-700 sm:grid-cols-3">
          <div><dt>AktĂ­v ĂĽgyek</dt><dd className="font-semibold">{unit.activeCaseCount}</dd></div>
          <div><dt>LezĂˇrt ĂĽgyek</dt><dd className="font-semibold">{unit.closedCaseCount}</dd></div>
          <div><dt>KĂ¶zelgĹ‘ hatĂˇridĹ‘k</dt><dd className="font-semibold">{unit.approachingDeadlineCount}</dd></div>
          <div><dt>ĂśgyfĂ©lre vĂˇr</dt><dd className="font-semibold">{unit.waitingOnCustomerCount}</dd></div>
          <div><dt>IrodĂˇra vĂˇr</dt><dd className="font-semibold">{unit.waitingOnOfficeCount}</dd></div>
        </dl>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Jogi terĂĽlet szerinti megoszlĂˇs</p>
            <div className="mt-2 flex flex-wrap gap-2">{Object.entries(unit.legalAreaDistribution || {}).map(([area, count]) => <span key={area} className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-700">{area}: {count}</span>)}</div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Jelenlegi stĂˇtuszok</p>
            <div className="mt-2 flex flex-wrap gap-2">{Object.entries(unit.publicStageCounts).map(([stage, count]) => <span key={stage} className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-700">{stage}: {count}</span>)}</div>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">LegutĂłbbi biztonsĂˇgos aktivitĂˇs</p>
          <div className="mt-2 grid gap-2">{(unit.recentSafeActivity || []).length ? unit.recentSafeActivity.map((activity) => <p key={`${activity.label}-${activity.happenedAt}`} className="rounded-xl bg-stone-50 p-3 text-xs text-stone-700">{activity.label} Â· {formatDate(activity.happenedAt)}</p>) : <p className="text-sm text-stone-600">Nincs friss Ă¶sszesĂ­tett aktivitĂˇs.</p>}</div>
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

  if (state.loading) return <section className={card}>Szervezeti ĂĽgyfĂ©lfelĂĽlet betĂ¶ltĂ©seâ€¦</section>;
  if (state.message) return <section className={card}>{state.message}</section>;
  if (communicationDisabled && view === "messages") return <section className={card}>Ehhez az ĂĽgyfĂ©lfelĂĽlethez a portĂˇlon belĂĽli ĂĽzenetkĂĽldĂ©s nincs engedĂ©lyezve.</section>;

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
      {view === "company" ? <DemoCompanyPresentation company={state.company} /> : null}
      {view === "intakes" && !isCaseRelay ? <Section title="MegkeresĂ©seim" empty={!state.intakes.length}>{state.intakes.map((item) => <IntakeRow key={item.reference} item={item} />)}</Section> : null}
      {view === "new-intake" && !isCaseRelay ? <NewIntake units={state.units} onCreated={load} /> : null}
      {view === "leadership" ? <LeadershipSummary units={state.leadership} mode={context.selectedWorkspace?.mode} /> : null}
    </div>
  );
}


