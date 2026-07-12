import { DisabledMockButton, PortalMockShell, PortalPageHero, SectionHeader } from "../PortalMockShell";
import { mockUploadRequests } from "../mockPortalData";

export default function PortalUploadsMockPage() {
  return (
    <PortalMockShell activeHref="/portal/uploads">
      <PortalPageHero
        eyebrow="Feltöltési kérések"
        title="Feltöltési kérések előnézete, fájlküldés nélkül."
        description="Ez a mock oldal nem jelenít meg fájlválasztót, nem tölt fel fájlt és nem küld adatot. Csak későbbi portálfolyamatot szemléltet."
      />

      <section className="space-y-4">
        <SectionHeader
          eyebrow="Mock kérések"
          title="Feltöltési kérések éles működés nélkül"
          description="A valódi feltöltéshez külön tárolási, jogosultsági, vírusellenőrzési és adatvédelmi döntés szükséges."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {mockUploadRequests.map((request) => (
            <article key={`${request.title}-${request.dueDate}`} className="rounded-3xl border border-[var(--adm-border)] bg-white p-5 shadow-[var(--adm-shadow-md)]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--adm-text-soft)]">{request.matterTitle}</p>
                  <h2 className="mt-3 text-xl font-semibold tracking-[-0.025em] text-[var(--adm-green-950)]">{request.title}</h2>
                  <p className="mt-2 text-sm font-semibold text-[var(--adm-blue-950)]">Határidő: {request.dueDate}</p>
                  <p className="mt-1 text-sm text-[var(--adm-text-muted)]">Elfogadott típusok később: {request.allowedFileTypes}</p>
                </div>
                <span className="w-fit rounded-full border border-[var(--adm-warm-500)] bg-[rgba(253,158,2,0.12)] px-3 py-1 text-xs font-semibold text-[var(--adm-blue-950)]">
                  {request.status}
                </span>
              </div>
              <div className="mt-5 rounded-2xl bg-[var(--adm-surface)] p-4 text-sm leading-6 text-[var(--adm-text-muted)]">
                Fájl kiválasztása, beküldés és tárhelykapcsolat nincs ezen az oldalon. Ez csak azt mutatja, hogyan nézhet ki egy későbbi, jóváhagyott feltöltési kérés.
              </div>
              <div className="mt-5">
                <DisabledMockButton label="Feltöltés nem aktív" />
              </div>
            </article>
          ))}
        </div>
      </section>
    </PortalMockShell>
  );
}
