import {
  mockDocuments,
  mockMatters,
  mockSafeUpdates,
  mockUploadRequests,
  statusTone,
  type PortalDocumentListItemDto,
  type PortalMatterListItemDto,
  type PortalMatterStatus,
  type PortalSafeUpdateDto,
  type PortalUploadRequestDto,
} from "./mockPortalData";
import { PortalMockShell } from "./PortalMockShell";

export default function ClientPortalMockPage() {
  return (
    <PortalMockShell activeHref="/portal">
        <section id="figyelem" className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <PortalHomeAttentionPanel />
          <PortalResponsibleLawyerCard />
        </section>

        <PortalHero />

        <section id="ugyek" className="space-y-4">
          <SectionHeader
            eyebrow="Ügyeim"
            title="Ügyfélnek szánt áttekintés"
            description="A valódi portál később kizárólag külön jogosultsággal megosztott ügyeket mutathat; ez az előnézet szintetikus adatokat használ."
          />
          <div className="grid gap-4 lg:grid-cols-3">
            {mockMatters.map((matter) => (
              <PortalMatterCard key={matter.externalId} matter={matter} />
            ))}
          </div>
        </section>

        <section id="dokumentumok" className="grid gap-4 xl:grid-cols-[1fr_0.75fr]">
          <PortalSharedDocumentList documents={mockDocuments} />
          <PortalSafeUpdateTimeline updates={mockSafeUpdates} />
        </section>

        <section id="feltoltesek" className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <PortalUploadRequestList uploadRequests={mockUploadRequests} />
          <PortalDeferredPanel />
        </section>
    </PortalMockShell>
  );
}

function PortalHero() {
  return (
    <section className="overflow-hidden rounded-[32px] border border-[var(--adm-border)] bg-white shadow-[var(--adm-shadow-shell)]">
      <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--adm-blue-700)]">
            Ügyfélportál előnézet
          </p>
          <h2 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.045em] text-[var(--adm-green-950)] sm:text-5xl">
            Egy helyen a biztonságosan megosztott ügyállapot, teendő és dokumentum-metaadat.
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--adm-text-muted)]">
            Ez a mock shell azt mutatja meg, hogyan nézhet ki egy későbbi ügyfélportál úgy, hogy közben nem nyit meg
            belső ügyvédi munkafelületet, nyers dokumentumtartalmat vagy nem jóváhagyott adatot.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <DisabledAction label="Mock előnézet" />
            <DisabledAction label="Backend nem aktív" />
          </div>
        </div>
        <div className="border-t border-[var(--adm-border)] bg-[linear-gradient(135deg,rgba(2,48,71,0.95),rgba(18,103,130,0.88))] p-6 text-white lg:border-l lg:border-t-0 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70">Mai fókusz</p>
          <div className="mt-5 space-y-4">
            <PortalNextActionCard
              title="Hiánypótlás feltöltése"
              detail="Az előnézet csak megmutatja a folyamat helyét; valódi feltöltés nincs."
              dueDate="2026. július 18."
            />
            <PortalNextActionCard
              title="Tájékoztató megtekintése"
              detail="Csak dokumentum-metaadat látható, letöltés és tartalommegjelenítés nélkül."
              dueDate="Későbbi funkció"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function PortalHomeAttentionPanel() {
  return (
    <section className="rounded-3xl border border-[var(--adm-border)] bg-white p-5 shadow-[var(--adm-shadow-md)]">
      <SectionHeader
        eyebrow="Mi igényel figyelmet?"
        title="Figyelmet igényel"
        description="A legfontosabb minta teendők és határidők vannak elöl. Minden adat szintetikus és inaktív."
      />
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <InfoTile label="Mintaügy" value={`${mockMatters.length}`} />
        <InfoTile label="Ügyfélteendő" value={`${mockUploadRequests.length}`} />
        <InfoTile label="Dokumentum-metaadat" value={`${mockDocuments.length}`} />
        <InfoTile label="Üzenetek" value="Később" />
      </div>
      <div className="mt-5 rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
        <p className="text-sm font-semibold text-[var(--adm-green-950)]">Első minta teendő</p>
        <p className="mt-2 text-sm leading-6 text-[var(--adm-text-muted)]">
          Hiánypótlás: személyi igazolvány másolat. A gomb inaktív, mert ez a shell nem végez valódi feltöltést.
        </p>
        <div className="mt-4">
          <DisabledAction label="Feltöltés későbbi funkció" />
        </div>
      </div>
    </section>
  );
}

function PortalMatterCard({ matter }: { matter: PortalMatterListItemDto }) {
  const documentCount = mockDocuments.filter((document) => document.matterTitle === matter.title).length;
  const uploadCount = mockUploadRequests.filter((request) => request.matterTitle === matter.title).length;

  return (
    <article className="flex min-h-[270px] flex-col rounded-3xl border border-[var(--adm-border)] bg-white p-5 shadow-[var(--adm-shadow-md)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--adm-text-soft)]">{matter.externalId}</p>
        <PortalMatterStatusBadge status={matter.status} />
      </div>
      <h3 className="mt-4 text-xl font-semibold tracking-[-0.025em] text-[var(--adm-green-950)]">{matter.title}</h3>
      <p className="mt-3 flex-1 text-sm leading-6 text-[var(--adm-text-muted)]">{matter.summary}</p>
      <div className="mt-5 rounded-2xl bg-[var(--adm-surface)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--adm-text-soft)]">Következő lépés</p>
        <p className="mt-2 text-sm font-medium text-[var(--adm-text)]">{matter.nextAction}</p>
        <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Határidő: {matter.deadline}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-[var(--adm-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--adm-text-muted)]">
          Dokumentum-metaadat: {documentCount}
        </span>
        <span className="rounded-full border border-[var(--adm-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--adm-text-muted)]">
          Feltöltési kérés: {uploadCount}
        </span>
      </div>
    </article>
  );
}

function PortalMatterStatusBadge({ status }: { status: PortalMatterStatus }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone[status]}`}>
      {status}
    </span>
  );
}

function PortalNextActionCard({ title, detail, dueDate }: { title: string; detail: string; dueDate: string }) {
  return (
    <article className="rounded-2xl border border-white/18 bg-white/10 p-4 shadow-sm backdrop-blur">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-white/78">{detail}</p>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/65">{dueDate}</p>
    </article>
  );
}

function PortalSharedDocumentList({ documents }: { documents: PortalDocumentListItemDto[] }) {
  return (
    <section className="rounded-3xl border border-[var(--adm-border)] bg-white p-5 shadow-[var(--adm-shadow-md)]">
      <SectionHeader
        eyebrow="Dokumentumok"
        title="Megosztott dokumentum-metaadatok"
        description="Csak cím, típus, ügycímke és megosztási dátum látható. Nincs letöltés, nincs nyers tartalom, nincs tárhelyútvonal."
      />
      <div className="mt-5 space-y-3">
        {documents.map((document) => (
          <PortalDocumentCard key={`${document.title}-${document.sharedAt}`} document={document} />
        ))}
      </div>
    </section>
  );
}

function PortalDocumentCard({ document }: { document: PortalDocumentListItemDto }) {
  return (
    <article className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--adm-text-soft)]">{document.type}</p>
          <h3 className="mt-2 text-base font-semibold text-[var(--adm-green-950)]">{document.title}</h3>
          <p className="mt-1 text-sm text-[var(--adm-text-muted)]">{document.matterTitle}</p>
        </div>
        <span className="w-fit rounded-full border border-[var(--adm-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--adm-text-muted)]">
          {document.status}
        </span>
      </div>
      <p className="mt-3 text-xs text-[var(--adm-text-soft)]">Megosztva: {document.sharedAt}</p>
      <button
        type="button"
        disabled
        className="mt-4 rounded-full border border-[var(--adm-border)] px-3 py-2 text-sm font-medium text-[var(--adm-text-soft)]"
      >
        Letöltés nem aktív
      </button>
    </article>
  );
}

function PortalUploadRequestList({ uploadRequests }: { uploadRequests: PortalUploadRequestDto[] }) {
  return (
    <section className="rounded-3xl border border-[var(--adm-border)] bg-white p-5 shadow-[var(--adm-shadow-md)]">
      <SectionHeader
        eyebrow="Feltöltési kérések"
        title="Előkészített, de inaktív kérések"
        description="Az előnézet nem jelenít meg fájlválasztót, nem indít feltöltést, és nem küld adatot sehová."
      />
      <div className="mt-5 space-y-3">
        {uploadRequests.map((request) => (
          <PortalUploadRequestCard key={`${request.title}-${request.dueDate}`} request={request} />
        ))}
      </div>
    </section>
  );
}

function PortalUploadRequestCard({ request }: { request: PortalUploadRequestDto }) {
  return (
    <article className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-[var(--adm-green-950)]">{request.title}</h3>
          <p className="mt-1 text-sm text-[var(--adm-text-muted)]">{request.matterTitle}</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--adm-text-soft)]">
            Határidő: {request.dueDate}
          </p>
          <p className="mt-1 text-xs text-[var(--adm-text-muted)]">Elfogadott típusok később: {request.allowedFileTypes}</p>
        </div>
        <span className="w-fit rounded-full border border-[var(--adm-warm-500)] bg-[rgba(253,158,2,0.12)] px-3 py-1 text-xs font-semibold text-[var(--adm-blue-950)]">
          {request.status}
        </span>
      </div>
      <button
        type="button"
        disabled
        className="mt-4 rounded-full border border-[var(--adm-border)] px-3 py-2 text-sm font-medium text-[var(--adm-text-soft)]"
      >
        Feltöltés nem aktív
      </button>
    </article>
  );
}

function PortalSafeUpdateTimeline({ updates }: { updates: PortalSafeUpdateDto[] }) {
  return (
    <section className="rounded-3xl border border-[var(--adm-border)] bg-white p-5 shadow-[var(--adm-shadow-md)]">
      <SectionHeader
        eyebrow="Biztonságos frissítések"
        title="Ügyfélnek szánt rövid státuszok"
        description="Csak jóváhagyott, külső közlésre alkalmas mintaszöveg."
      />
      <div className="mt-5 space-y-4">
        {updates.map((update) => (
          <article key={`${update.title}-${update.date}`} className="border-l-2 border-[var(--adm-blue-500)] pl-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--adm-text-soft)]">{update.date}</p>
            <h3 className="mt-1 text-sm font-semibold text-[var(--adm-green-950)]">{update.title}</h3>
            <p className="mt-1 text-sm leading-6 text-[var(--adm-text-muted)]">{update.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function PortalResponsibleLawyerCard() {
  return (
    <section className="rounded-3xl border border-[var(--adm-border)] bg-white p-5 shadow-[var(--adm-shadow-md)]">
      <SectionHeader
        eyebrow="Kapcsolat"
        title="Felelős kapcsolattartó"
        description="Szintetikus név, nem valós ügyvédi vagy ügyféladat."
      />
      <div className="mt-5 rounded-2xl bg-[var(--adm-surface)] p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--adm-green-950)] text-sm font-semibold text-white">
            PÜ
          </div>
          <div>
            <p className="font-semibold text-[var(--adm-green-950)]">dr. Példa Ügyvéd</p>
            <p className="text-sm text-[var(--adm-text-muted)]">Ügyfélkapcsolati felelős — mock</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-[var(--adm-text-muted)]">
          Valódi kapcsolatfelvétel nincs bekötve. A későbbi portál csak jóváhagyott elérhetőséget mutathat.
        </p>
      </div>
    </section>
  );
}

function PortalDeferredPanel() {
  return (
    <section id="uzenetek" className="rounded-3xl border border-dashed border-[var(--adm-border-strong)] bg-white p-5">
      <SectionHeader
        eyebrow="Későbbi funkciók"
        title="Üzenetek és profilkezelés későbbi körben"
        description="Ez a shell nem nyit meg üzenetküldést, profilmódosítást, dokumentumletöltést vagy feltöltést."
      />
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <PortalDisabledState title="Üzenetek" detail="Későbbi funkció, nincs kommunikációs adat." />
        <PortalDisabledState title="Profil szerkesztése" detail="Későbbi funkció, nincs beküldés." />
        <PortalDisabledState title="Dokumentumletöltés" detail="Nem aktív ebben a mock előnézetben." />
        <PortalDisabledState title="Feltöltés" detail="Nincs fájlválasztó és nincs adatküldés." />
      </div>
    </section>
  );
}

function PortalDisabledState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
      <p className="text-sm font-semibold text-[var(--adm-green-950)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--adm-text-muted)]">{detail}</p>
      <span className="mt-3 inline-flex rounded-full border border-[var(--adm-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--adm-text-soft)]">
        Nem aktív
      </span>
    </div>
  );
}

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--adm-text-soft)]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-[var(--adm-green-950)]">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--adm-text-muted)]">{description}</p>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-surface)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--adm-text-soft)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--adm-green-950)]">{value}</p>
    </div>
  );
}

function DisabledAction({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      className="rounded-full border border-[var(--adm-border)] bg-white/75 px-4 py-2 text-sm font-semibold text-[var(--adm-text-muted)] shadow-sm disabled:cursor-not-allowed disabled:opacity-80"
    >
      {label}
    </button>
  );
}
