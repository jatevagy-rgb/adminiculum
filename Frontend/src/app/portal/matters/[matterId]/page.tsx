import Link from "next/link";

import {
  DisabledMockButton,
  MockEmptyState,
  PortalMockShell,
  PortalPageHero,
  PortalStatusBadge,
  SectionHeader,
} from "../../PortalMockShell";
import { mockDocuments, mockMatters, mockUploadRequests } from "../../mockPortalData";

export function generateStaticParams() {
  return mockMatters.map((matter) => ({ matterId: matter.externalId }));
}

export default async function PortalMatterDetailMockPage({ params }: { params: Promise<{ matterId: string }> }) {
  const { matterId } = await params;
  const matter = mockMatters.find((item) => item.externalId === matterId);

  if (!matter) {
    return (
      <PortalMockShell activeHref="/portal/matters">
        <MockEmptyState
          title="Ez az ügy ebben az előnézetben nem érhető el."
          detail="Az előnézet nem árulja el, hogy létezne-e ilyen ügy éles környezetben. Nincs backend lekérdezés."
        />
      </PortalMockShell>
    );
  }

  const relatedDocuments = mockDocuments.filter((document) => document.matterTitle === matter.title);
  const relatedUploads = mockUploadRequests.filter((request) => request.matterTitle === matter.title);

  return (
    <PortalMockShell activeHref="/portal/matters">
      <PortalPageHero
        eyebrow="Minta ügy részlete"
        title={matter.title}
        description="Ez a részletező nézet csak ügyfélnek szánt státuszt, következő lépést és metaadatot mutat. Nem jelenít meg belső idővonalat, jegyzetet vagy dokumentumtartalmat."
      />

      <section aria-label="Ügyféloldali ügyállapot és kapcsolat" className="grid gap-4 lg:grid-cols-[1fr_0.7fr]">
        <article className="rounded-3xl border border-[var(--adm-border)] bg-white p-5 shadow-[var(--adm-shadow-md)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--adm-text-soft)]">{matter.externalId}</p>
            <PortalStatusBadge status={matter.status} />
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-[-0.035em] text-[var(--adm-green-950)]">Ügyfélnek szánt állapot</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--adm-text-muted)]">{matter.safeUpdate}</p>
          <div className="mt-5 rounded-2xl border border-[rgba(253,158,2,0.28)] bg-[rgba(253,158,2,0.08)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--adm-text-soft)]">Következő lépés</p>
            <p className="mt-2 text-sm font-semibold text-[var(--adm-text)]">{matter.nextAction}</p>
            <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Ügyféloldali határidő: {matter.deadline}</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <SummaryPill label="Dokumentum-metaadat" value={`${relatedDocuments.length}`} />
            <SummaryPill label="Feltöltési kérés" value={`${relatedUploads.length}`} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <DisabledMockButton label="Beküldés nem aktív" />
            <Link
              href="/portal/matters"
              className="rounded-full border border-[var(--adm-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--adm-text-muted)]"
            >
              Vissza a minta ügyekhez
            </Link>
          </div>
        </article>

        <article className="rounded-3xl border border-[var(--adm-border)] bg-white p-5 shadow-[var(--adm-shadow-md)]">
          <SectionHeader
            eyebrow="Kapcsolat"
            title="Kapcsolattartó előnézet"
            description="Szintetikus kapcsolattartó. Valódi üzenetküldés vagy profiladat nincs bekötve."
          />
          <div className="mt-5 rounded-2xl bg-[var(--adm-surface)] p-4 text-sm leading-6 text-[var(--adm-text-muted)]">
            Üzenetek és válaszok későbbi funkcióként jelenhetnek meg, külön jóváhagyott adatmodell és jogosultság után.
          </div>
        </article>
      </section>

      <section aria-label="Kapcsolódó dokumentumok és feltöltési kérések" className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-[var(--adm-border)] bg-white p-5 shadow-[var(--adm-shadow-md)]">
          <SectionHeader
            eyebrow="Megosztott dokumentumok"
            title="Metaadatok, tartalom nélkül"
            titleId="portal-matter-documents-title"
            description="Nincs letöltés, nincs előnézet, nincs tárhelyútvonal."
          />
          <div role="list" aria-labelledby="portal-matter-documents-title" className="mt-5 space-y-3">
            {relatedDocuments.length === 0 ? (
              <MockEmptyState title="Nincs megosztott dokumentum" detail="Ez is szintetikus üres állapot, backend lekérdezés nélkül." />
            ) : (
              relatedDocuments.map((document) => (
                <div key={document.title} role="listitem" className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
                  <p className="text-sm font-semibold text-[var(--adm-green-950)]">{document.title}</p>
                  <p className="mt-1 text-xs text-[var(--adm-text-muted)]">{document.type} · megosztva: {document.sharedAt}</p>
                  <p className="mt-2 text-xs font-semibold text-[var(--adm-text-soft)]">{document.status}</p>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rounded-3xl border border-[var(--adm-border)] bg-white p-5 shadow-[var(--adm-shadow-md)]">
          <SectionHeader
            eyebrow="Feltöltési kérések"
            title="Inaktív minta teendők"
            titleId="portal-matter-uploads-title"
            description="Nincs fájlválasztó, nincs adatküldés."
          />
          <div role="list" aria-labelledby="portal-matter-uploads-title" className="mt-5 space-y-3">
            {relatedUploads.length === 0 ? (
              <MockEmptyState title="Nincs aktív minta feltöltés" detail="A shell nem kapcsolódik a backendhez." />
            ) : (
              relatedUploads.map((request) => (
                <div key={request.title} role="listitem" className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
                  <p className="text-sm font-semibold text-[var(--adm-green-950)]">{request.title}</p>
                  <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Határidő: {request.dueDate}</p>
                  <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Elfogadott típusok később: {request.allowedFileTypes}</p>
                  <DisabledMockButton label="Feltöltés nem aktív" />
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </PortalMockShell>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--adm-text-soft)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--adm-green-950)]">{value}</p>
    </div>
  );
}
