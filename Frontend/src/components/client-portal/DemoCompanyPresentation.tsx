"use client";

import { useEffect, useState } from "react";
import { PortalOrgCompany, getPortalCompanyProfileDiscovery, answerPortalCompanyProfileQuestion, PortalCompanyProfileDiscovery } from "@/lib/clientPortalApi";
import { ClientSafeResultCard, DemoContentBanner, PortalProfileCard } from "./PortalPresentationPrimitives";

const card = "rounded-3xl border border-stone-200 bg-white p-6 shadow-sm";

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "short", day: "numeric" }).format(new Date(dateString));
}

function Section({ title, empty, emptyText, children }: { title: string; empty?: boolean; emptyText?: string; children?: React.ReactNode }) {
  return (
    <section className={card}>
      <h2 className="font-serif text-2xl font-semibold text-stone-950">{title}</h2>
      {empty ? <p className="mt-3 text-stone-600">{emptyText || "Nincs elrhet adat."}</p> : <div className="mt-4">{children}</div>}
    </section>
  );
}

export function DemoCompanyPresentation({ company }: { company: PortalOrgCompany | null }) {
  const [discovery, setDiscovery] = useState<PortalCompanyProfileDiscovery | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [employeeCount, setEmployeeCount] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [previousCount, setPreviousCount] = useState<number | null>(null);

  useEffect(() => {
    getPortalCompanyProfileDiscovery().then((res) => {
      setDiscovery(res);
      const q = res.questions.find((q: any) => q.questionKey === "employee_count");
      if (q && typeof q.value === "number") {
        setEmployeeCount(q.value);
        if (q.value === 52) {
           setShowFeedback(true);
           setPreviousCount(47);
        }
      }
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  if (!company) return <Section title="Vállalat" empty emptyText="Ehhez az ügyfélfelülethez jelenleg nincs közzétett vállalati áttekintés." />;

  const isDemo = process.env.NEXT_PUBLIC_ADMINICULUM_DEMO_CONTENT_ENABLED === "true";
  const areaActivity = company.visibleMattersByArea.filter((area) => area.visibleMatterCount > 0);

  async function handleSave() {
    if (typeof employeeCount !== "number") return;
    setSaving(true);
    try {
      const currentVal = discovery?.questions.find((q) => q.questionKey === "employee_count")?.value;
      if (currentVal !== employeeCount) {
        setPreviousCount(currentVal as number);
      }
      await answerPortalCompanyProfileQuestion("employee_count", { status: "ANSWERED", numberValue: employeeCount });
      const res = await getPortalCompanyProfileDiscovery();
      setDiscovery(res);
      if (employeeCount === 52) {
        setShowFeedback(true);
      } else {
        setShowFeedback(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  return (
    <div className="space-y-5">
      <DemoContentBanner enabled={isDemo} />
      
      <section className={card}>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b95e4b]">Vállalat</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-stone-950">{company.companyName}</h1>
        {company.profileHeadline ? <p className="mt-2 max-w-2xl leading-7 text-stone-700">{company.profileHeadline}</p> : null}
      </section>

      {isDemo && !loading && discovery ? (
        // [DEMO] Synthetic presentation scaffolding
        // This 8/12 value is hardcoded for the demo presentation visual.
        // In a fully seeded environment, this would be computed from discovery.questions.
        <PortalProfileCard
          completed={8}
          total={12}
          unknown={0}
          available={true}
          onContinue={() => setEditing(true)}
        />
      ) : null}

      {editing && (
        <section className={card}>
          <h2 className="cp-card-heading">Vállalati profil szerkesztése</h2>
          <div className="mt-4">
            <label className="block text-sm font-medium text-stone-700">Foglalkoztatottak létszáma</label>
            <input
              type="number"
              className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2 text-stone-900 shadow-sm focus:border-stone-950 focus:outline-none focus:ring-1 focus:ring-stone-950 sm:text-sm"
              value={employeeCount}
              onChange={(e) => setEmployeeCount(e.target.value === "" ? "" : parseInt(e.target.value, 10))}
              disabled={saving}
            />
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => setEditing(false)} disabled={saving} className="rounded-full bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-900">Mégse</button>
            <button onClick={handleSave} disabled={saving} className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white">Mentés</button>
          </div>
        </section>
      )}

      {showFeedback && (
        <>
          <ClientSafeResultCard
            topicLabel="Vállalati működés"
            stateLabel="Új működési terület felismerve"
            explanation="1 új terület jelent meg az áttekintésben a létszámváltozás miatt."
            nextAction="Kérjük, tekintse meg a javaslatokat."
          />
          <section className={card}>
            <h2 className="cp-card-heading">Fejlődés (Grow panel)</h2>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-center">
                <p className="text-sm font-semibold text-stone-500 uppercase">EDDIG</p>
                <p className="mt-1 text-2xl font-serif font-bold text-stone-900">{previousCount}</p>
              </div>
              <div className="rounded-xl border border-stone-200 bg-[#f7fdf7] p-4 text-center">
                <p className="text-sm font-semibold text-[#297036] uppercase">MOST</p>
                <p className="mt-1 text-2xl font-serif font-bold text-[#297036]">{employeeCount}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-stone-700">KÖVETKEZŐKÉNT: Új releváns terület áttekintése</p>
          </section>
        </>
      )}

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
    </div>
  );
}



