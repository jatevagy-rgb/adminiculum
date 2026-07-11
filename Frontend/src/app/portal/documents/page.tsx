import { DisabledMockButton, PortalMockShell, PortalPageHero, SectionHeader } from "../PortalMockShell";
import { mockDocuments } from "../mockPortalData";

export default function PortalDocumentsMockPage() {
  return (
    <PortalMockShell>
      <PortalPageHero
        eyebrow="Megosztott dokumentumok"
        title="Dokumentumlista metaadatokkal, tartalom nélkül."
        description="Ez a mock oldal nem tölt le, nem jelenít meg és nem dolgoz fel dokumentumot. Csak szintetikus címeket, típusokat és megosztási dátumokat mutat."
      />

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Dokumentumok"
          title="Ügyfélnek szánt dokumentum-metaadatok"
          description="A későbbi éles portálon is csak külön jóváhagyott és jogosultsággal megosztott dokumentum jelenhet meg."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {mockDocuments.map((document) => (
            <article key={`${document.title}-${document.sharedAt}`} className="rounded-3xl border border-[var(--adm-border)] bg-white p-5 shadow-[var(--adm-shadow-md)]">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--adm-text-soft)]">{document.type}</p>
              <h2 className="mt-3 text-xl font-semibold tracking-[-0.025em] text-[var(--adm-green-950)]">{document.title}</h2>
              <p className="mt-2 text-sm text-[var(--adm-text-muted)]">{document.matterTitle}</p>
              <div className="mt-5 rounded-2xl bg-[var(--adm-surface)] p-4">
                <p className="text-xs text-[var(--adm-text-muted)]">Megosztva: {document.sharedAt}</p>
                <p className="mt-2 text-sm font-semibold text-[var(--adm-text)]">{document.status}</p>
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
