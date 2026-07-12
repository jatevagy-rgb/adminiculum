import { DisabledMockButton, PortalMockShell, PortalPageHero, SectionHeader } from "../PortalMockShell";
import { mockDocuments } from "../mockPortalData";

export default function PortalDocumentsMockPage() {
  return (
    <PortalMockShell activeHref="/portal/documents">
      <PortalPageHero
        eyebrow="Megosztott dokumentumok"
        title="Dokumentumlista metaadatokkal, tartalom nélkül."
        description="Ez a mock oldal nem tölt le, nem jelenít meg és nem dolgoz fel dokumentumot. Csak szintetikus címeket, típusokat és megosztási dátumokat mutat."
      />

      <section aria-labelledby="portal-documents-list-title" className="space-y-4">
        <SectionHeader
          eyebrow="Dokumentumok"
          title="Ügyfélnek szánt dokumentum-metaadatok"
          titleId="portal-documents-list-title"
          description="A későbbi éles portálon is csak külön jóváhagyott és jogosultsággal megosztott dokumentum jelenhet meg."
        />
        <div role="list" className="grid gap-4 lg:grid-cols-3">
          {mockDocuments.map((document) => (
            <article key={`${document.title}-${document.sharedAt}`} role="listitem" className="rounded-3xl border border-[var(--adm-border)] bg-white p-5 shadow-[var(--adm-shadow-md)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--adm-text-soft)]">{document.type}</p>
                <span className="w-fit rounded-full border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-1 text-xs font-semibold text-[var(--adm-text-muted)]">
                  Tartalom nem látható
                </span>
              </div>
              <h3 className="mt-3 text-xl font-semibold tracking-[-0.025em] text-[var(--adm-green-950)]">{document.title}</h3>
              <p className="mt-2 text-sm text-[var(--adm-text-muted)]">{document.matterTitle}</p>
              <div className="mt-5 rounded-2xl bg-[var(--adm-surface)] p-4">
                <p className="text-xs text-[var(--adm-text-muted)]">Megosztva: {document.sharedAt}</p>
                <p className="mt-2 text-sm font-semibold text-[var(--adm-text)]">{document.status}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--adm-text-muted)]">
                  Csak ügyfélnek szánt metaadat. Nincs előnézet, letöltés, nyers tartalom vagy tárhelyútvonal.
                </p>
              </div>
              <div className="mt-5">
                <DisabledMockButton label="Letöltés nem aktív" />
              </div>
            </article>
          ))}
        </div>
      </section>
    </PortalMockShell>
  );
}
