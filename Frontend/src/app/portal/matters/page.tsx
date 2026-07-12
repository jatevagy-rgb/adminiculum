import Link from "next/link";

import { DisabledMockButton, PortalMockShell, PortalPageHero, PortalStatusBadge, SectionHeader } from "../PortalMockShell";
import { mockDocuments, mockMatters, mockUploadRequests } from "../mockPortalData";

export default function PortalMattersMockPage() {
  return (
    <PortalMockShell activeHref="/portal/matters">
      <PortalPageHero
        eyebrow="Ügyeim"
        title="Ügyfélnek szánt ügylista, biztonságos összefoglalókkal."
        description="Ez az oldal nem kér le ügyeket a backendből. A kártyák csak azt mutatják, hogyan nézhet ki később egy jogosultsággal megosztott ügyféloldali lista."
      />

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Minta ügyek"
          title="Ügyfélnek szánt, biztonságos összefoglalók"
          description="Nincs belső munkafolyamat, nincs belső feladatlista, nincs ügyvédi jegyzet vagy jogi elemzés."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {mockMatters.map((matter) => (
            <PortalMatterListCard key={matter.externalId} matter={matter} />
          ))}
        </div>
      </section>
    </PortalMockShell>
  );
}

function PortalMatterListCard({ matter }: { matter: (typeof mockMatters)[number] }) {
  const documentCount = mockDocuments.filter((document) => document.matterTitle === matter.title).length;
  const uploadCount = mockUploadRequests.filter((request) => request.matterTitle === matter.title).length;

  return (
    <article className="flex min-h-[320px] flex-col rounded-3xl border border-[var(--adm-border)] bg-white p-5 shadow-[var(--adm-shadow-md)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--adm-text-soft)]">{matter.externalId}</p>
        <PortalStatusBadge status={matter.status} />
      </div>
      <h2 className="mt-4 text-xl font-semibold tracking-[-0.025em] text-[var(--adm-green-950)]">{matter.title}</h2>
      <p className="mt-3 flex-1 text-sm leading-6 text-[var(--adm-text-muted)]">{matter.summary}</p>
      <div className="mt-5 rounded-2xl bg-[var(--adm-surface)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--adm-text-soft)]">Következő ügyféloldali lépés</p>
        <p className="mt-2 text-sm font-medium text-[var(--adm-text)]">{matter.nextAction}</p>
        <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Ügyféloldali határidő: {matter.deadline}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-[var(--adm-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--adm-text-muted)]">
          Dokumentum: {documentCount}
        </span>
        <span className="rounded-full border border-[var(--adm-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--adm-text-muted)]">
          Feltöltés: {uploadCount}
        </span>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={`/portal/matters/${matter.externalId}`}
          className="rounded-full border border-[var(--adm-border-strong)] bg-[var(--adm-green-950)] px-4 py-2 text-sm font-semibold text-white"
        >
          Minta ügy megnyitása
        </Link>
        <DisabledMockButton label="Éles művelet nincs" />
      </div>
    </article>
  );
}
