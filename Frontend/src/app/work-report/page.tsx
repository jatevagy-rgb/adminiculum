"use client";

import { CustomerHistoryPolicyEditor } from '@/components/cases/word-workflow/history/CustomerHistoryPolicyEditor';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthenticatedApp } from "@/components/AuthenticatedApp";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableEmpty,
  DataTableHead,
  DataTableHeaderCell,
  DataTableRow,
  EmptyState,
  MetricTile,
  PageHeader,
} from "@/components/ui";
import { ApiError, getClients } from "@/lib/api";
import {
  downloadWorkReportPdf,
  getWorkReportCase,
  listWorkReportCases,
  listWorkReportOwnerCandidates,
  type ClientWorkReportCaseListItem,
  type ClientWorkReportCasesResponse,
  type ClientWorkReportDetail,
  type ClientWorkReportOwnerCandidate,
} from "@/lib/workReportApi";

const ZERO_TIME_TEXT =
  "Ehhez az ügyhöz a kiválasztott időszakban nincs rögzített, a jelentésbe sorolható munkaidő.";
const NOT_SPECIFIED = "Nincs megadva";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function monthRange(month: string): { startDate: string; endDate: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return {
    startDate: `${match[1]}-${match[2]}-01`,
    endDate: `${match[1]}-${match[2]}-${pad(lastDay)}`,
  };
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

function formatMinutesHu(minutes: number): string {
  const safe = Math.max(0, Math.floor(minutes || 0));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours === 0) return `${rest} p`;
  return rest === 0 ? `${hours} ó` : `${hours} ó ${rest} p`;
}

function formatDayHu(value: string | null): string {
  return value ? `${value.replaceAll("-", ".")}.` : "—";
}

function joinNames(values: string[]): string {
  const present = values.filter(Boolean);
  return present.length > 0 ? present.join(", ") : NOT_SPECIFIED;
}

function WorkReportPageContent() {
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [clientId, setClientId] = useState<string>("");
  const [period, setPeriod] = useState<string>(currentMonth());
  const [caseList, setCaseList] = useState<ClientWorkReportCasesResponse | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [report, setReport] = useState<ClientWorkReportDetail | null>(null);
  const [ownerPeople, setOwnerPeople] = useState<ClientWorkReportOwnerCandidate[]>([]);
  const [ownerPersonId, setOwnerPersonId] = useState<string>("");
  const [loadingCases, setLoadingCases] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Source-switch guards: a response that belongs to an older request must
  // never restore a previous case's report, owner or case list.
  const casesSeq = useRef(0);
  const reportSeq = useRef(0);
  const peopleSeq = useRef(0);

  useEffect(() => {
    getClients()
      .then((response) => {
        setClients(response.data ?? []);
      })
      .catch(() => {
        setError("Az ügyfelek listája nem tölthető be.");
      });
  }, []);

  const periodQuery = useMemo(() => monthRange(period), [period]);

  const loadCases = useCallback(() => {
    if (!clientId || !periodQuery) {
      setCaseList(null);
      setSelectedCaseId(null);
      setReport(null);
      setOwnerPersonId("");
      return;
    }
    setLoadingCases(true);
    setError(null);
    setSelectedCaseId(null);
    setReport(null);
    setOwnerPersonId("");
    const seq = ++casesSeq.current;
    listWorkReportCases(clientId, periodQuery)
      .then((response) => {
        if (seq === casesSeq.current) setCaseList(response);
      })
      .catch(() => {
        if (seq === casesSeq.current) setError("Az ügylista nem tölthető be.");
      })
      .finally(() => {
        if (seq === casesSeq.current) setLoadingCases(false);
      });
  }, [clientId, periodQuery]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  useEffect(() => {
    if (!clientId) {
      setOwnerPeople([]);
      return;
    }
    const seq = ++peopleSeq.current;
    listWorkReportOwnerCandidates(clientId)
      .then((response) => {
        if (seq === peopleSeq.current) setOwnerPeople(response.people ?? []);
      })
      .catch(() => {
        // Owner candidates are optional context; the report itself is unaffected.
      });
  }, [clientId]);

  const loadReport = useCallback(
    (caseId: string, ownerId: string | null) => {
      if (!periodQuery) return;
      setLoadingReport(true);
      setError(null);
      const seq = ++reportSeq.current;
      getWorkReportCase(caseId, periodQuery, ownerId)
        .then((loaded) => {
          if (seq !== reportSeq.current) return;
          setReport(loaded);
        })
        .catch((caught) => {
          if (seq !== reportSeq.current) return;
          if (caught instanceof ApiError && caught.code === "WORK_REPORT_OWNER_NOT_IN_CLIENT") {
            // Cross-client or unknown owner: fail safely, clear the selection
            // and reload without an owner instead of keeping a wrong one.
            setOwnerPersonId("");
            setError(caught.message || "A kiválasztott ügygazda nem tartozik az ügy ügyfeléhez.");
            const retrySeq = ++reportSeq.current;
            getWorkReportCase(caseId, periodQuery, null)
              .then((reloaded) => {
                if (retrySeq === reportSeq.current) setReport(reloaded);
              })
              .catch(() => {
                if (retrySeq === reportSeq.current) setError("A jelentés nem tölthető be.");
              })
              .finally(() => {
                if (retrySeq === reportSeq.current) setLoadingReport(false);
              });
            return;
          }
          setError("A jelentés nem tölthető be.");
        })
        .finally(() => {
          if (seq === reportSeq.current) setLoadingReport(false);
        });
    },
    [periodQuery],
  );

  const openCase = useCallback(
    (caseId: string) => {
      setSelectedCaseId(caseId);
      setOwnerPersonId("");
      loadReport(caseId, null);
    },
    [loadReport],
  );

  const changeOwner = useCallback(
    (personId: string) => {
      setOwnerPersonId(personId);
      if (selectedCaseId) loadReport(selectedCaseId, personId || null);
    },
    [selectedCaseId, loadReport],
  );

  const downloadPdf = useCallback(() => {
    if (!selectedCaseId || !periodQuery) return;
    setDownloading(true);
    downloadWorkReportPdf(selectedCaseId, periodQuery, ownerPersonId || null)
      .then(({ blob, filename }) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename || "munkaora-jelentes.pdf";
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      })
      .catch(() => setError("A PDF letöltése nem sikerült."))
      .finally(() => setDownloading(false));
  }, [selectedCaseId, periodQuery, ownerPersonId]);

  const selectedSummary = report?.case ?? null;

  return (
    <div className="min-h-screen bg-white text-[var(--adm-text-primary)]">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6">
        <PageHeader
          title="Munkaóra-jelentés"
          kicker="Ügyfél riport"
          subtitle="Ügycentrikus, részletes munkaidő-kimutatás ügyfeleknek. A jelentés és a PDF kizárólag munkaidő-tényeket tartalmaz — óradíj, összeg és számlázási adat nélkül."
        />

        <Card>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-secondary)]">
                Ügyfél
                <select
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  className="h-9 rounded-[8px] border border-[var(--adm-border-canonical)] bg-white px-2.5 text-sm font-normal normal-case tracking-normal text-[var(--adm-text-primary)]"
                >
                  <option value="">Válassz ügyfelet…</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-secondary)]">
                Időszak
                <input
                  type="month"
                  value={period}
                  onChange={(event) => setPeriod(event.target.value)}
                  className="h-9 rounded-[8px] border border-[var(--adm-border-canonical)] bg-white px-2.5 text-sm font-normal normal-case tracking-normal text-[var(--adm-text-primary)]"
                />
              </label>
              <Button variant="secondary" size="sm" onClick={loadCases} isLoading={loadingCases}>
                Frissítés
              </Button>
            </div>
          </CardContent>
        </Card>

        {error ? (
          <Alert variant="error" title="Hiba történt">
            {error}
          </Alert>
        ) : null}

        <section aria-label="Ügyek" className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-secondary)]">
            Ügyek a kiválasztott időszakban
          </h2>
          {!clientId ? (
            <EmptyState
              title="Válassz ügyfelet"
              description="A jelentés elkészítéséhez először válassz ki egy ügyfelet."
            />
          ) : caseList && caseList.cases.length === 0 ? (
            <EmptyState
              title="Nincs megjeleníthető ügy"
              description="Ebben az időszakban nincs munkaidő, és nincs lezárt ügy sem."
            />
          ) : (
            <DataTable minWidth={820}>
              <DataTableHead>
                <DataTableHeaderCell>Ügyszám</DataTableHeaderCell>
                <DataTableHeaderCell>Ügy címe</DataTableHeaderCell>
                <DataTableHeaderCell>Ügytárgy</DataTableHeaderCell>
                <DataTableHeaderCell>Állapot</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Rögzített idő</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Bizonytalan</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Kizárt</DataTableHeaderCell>
                <DataTableHeaderCell align="right">Művelet</DataTableHeaderCell>
              </DataTableHead>
              <DataTableBody>
                {(caseList?.cases ?? []).map((item: ClientWorkReportCaseListItem) => (
                  <DataTableRow key={item.caseId} selected={item.caseId === selectedCaseId}>
                    <DataTableCell>{item.caseNumber}</DataTableCell>
                    <DataTableCell>{item.caseTitle}</DataTableCell>
                    <DataTableCell>{item.matter?.title ?? NOT_SPECIFIED}</DataTableCell>
                    <DataTableCell>
                      <Badge status={item.isClosed ? "closed" : "active"} shape="pill" dot>
                        {item.caseStatusLabel}
                      </Badge>
                    </DataTableCell>
                    <DataTableCell align="right">{formatMinutesHu(item.recordedMinutes)}</DataTableCell>
                    <DataTableCell align="right">
                      {item.ambiguousMinutes > 0 ? formatMinutesHu(item.ambiguousMinutes) : "—"}
                    </DataTableCell>
                    <DataTableCell align="right">
                      {item.excludedMinutes > 0 ? formatMinutesHu(item.excludedMinutes) : "—"}
                    </DataTableCell>
                    <DataTableCell align="right">
                      <Button size="sm" variant="neutral" onClick={() => openCase(item.caseId)}>
                        Részletek
                      </Button>
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
              <DataTableEmpty colSpan={8}>
                <p>Nincs ügy.</p>
              </DataTableEmpty>
            </DataTable>
          )}
        </section>

        {selectedCaseId ? (
          <section aria-label="Jelentés részletei" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 border-b border-[var(--adm-border-canonical)] pb-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-serif text-xl font-semibold text-[var(--adm-text-primary)]">
                  {selectedSummary?.caseNumber ?? ""} — {selectedSummary?.caseTitle ?? ""}
                </h2>
                <p className="mt-0.5 text-xs text-[var(--adm-text-secondary)]">
                  Ügyfél: {report?.client.name ?? ""} · Időszak:{" "}
                  {formatDayHu(report?.period.startDate ?? null)} – {formatDayHu(report?.period.endDate ?? null)}
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={downloadPdf}
                isLoading={downloading || loadingReport}
                disabled={report ? report.issuerMissing.length > 0 : true}
              >
                PDF letöltése
              </Button>
            </div>

            <Card>
              <CardContent>
                <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-secondary)]">
                    Ügygazda az ügyfélnél
                    <select
                      value={ownerPersonId}
                      onChange={(event) => changeOwner(event.target.value)}
                      disabled={loadingReport}
                      className="h-9 rounded-[8px] border border-[var(--adm-border-canonical)] bg-white px-2.5 text-sm font-normal normal-case tracking-normal text-[var(--adm-text-primary)]"
                    >
                      <option value="">Mentett ügygazda használata (ha van)</option>
                      {ownerPeople.map((person) => (
                        <option key={person.personId} value={person.personId}>
                          {person.name}
                          {person.organizationGroupName ? ` — ${person.organizationGroupName}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-xs text-[var(--adm-text-secondary)]">
                    Ez a kiválasztás ehhez a jelentéshez tartozik; az ügy tartós ügygazda-beállítását nem módosítja.
                    A jelentés és a PDF a kiválasztott személyt a hozzá tartozó szervezeti egységgel együtt mutatja.
                  </p>
                </div>
              </CardContent>
            </Card>

            {selectedCaseId && <CustomerHistoryPolicyEditor key={selectedCaseId} caseId={selectedCaseId}/> }
            {loadingReport ? (
              <p className="text-sm text-[var(--adm-text-secondary)]">A jelentés betöltése…</p>
            ) : report ? (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <MetricTile
                    tone="primary"
                    label="Összes rögzített idő"
                    value={formatMinutesHu(report.case.recordedMinutes)}
                    hint={`${report.case.recordedEntryCount} bejegyzés`}
                  />
                  <MetricTile
                    label="Munkanapok"
                    value={
                      report.case.recordedEntryCount > 0
                        ? `${formatDayHu(report.rows[0]?.workDate ?? null)} – ${formatDayHu(report.rows[report.rows.length - 1]?.workDate ?? null)}`
                        : "—"
                    }
                    hint="Első – utolsó rögzített munkanap"
                  />
                  <MetricTile
                    label="Állapot"
                    value={report.case.caseStatusLabel}
                    badge={
                      <Badge status={report.case.isClosed ? "closed" : "active"} shape="pill">
                        {report.case.isClosed ? "Lezárt ügy" : "Aktív ügy"}
                      </Badge>
                    }
                  />
                </div>

                <Card>
                  <CardContent>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-secondary)]">
                      Ügyösszefoglaló
                    </h3>
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      <InfoRow label="Ügyfél" value={report.client.name} />
                      <InfoRow label="Ügytárgy" value={report.case.matter?.title ?? NOT_SPECIFIED} />
                      <InfoRow label="Felelős ügyvéd" value={report.case.responsibleLawyerName ?? NOT_SPECIFIED} />
                      <InfoRow label="Ügygazda az ügyfélnél" value={report.owner?.name ?? NOT_SPECIFIED} />
                      <InfoRow
                        label="Szervezeti egység az ügyfélnél"
                        value={report.owner?.organizationGroupName ?? NOT_SPECIFIED}
                      />
                      <InfoRow label="Kezdeményező" value={joinNames(report.case.requesterNames)} />
                      <InfoRow label="Kezdeményező szervezeti egység" value={joinNames(report.case.organizationGroupNames)} />
                      <InfoRow label="Szakterület" value={joinNames(report.case.departmentNames)} />
                      <InfoRow
                        label="Lezárás dátuma"
                        value={report.case.completedAt ? formatDayHu(report.case.completedAt) : NOT_SPECIFIED}
                      />
                    </dl>
                  </CardContent>
                </Card>

                <section aria-label="Rögzített munkaidő" className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-secondary)]">
                    Rögzített munkaidő
                  </h3>
                  <p className="text-xs text-[var(--adm-text-secondary)]">
                    Belső áttekintés — a munkavégzés leírásai itt teljes terjedelemben láthatók.
                  </p>
                  {report.rows.length === 0 ? (
                    <EmptyState title="Nincs rögzített munkaidő" description={ZERO_TIME_TEXT} />
                  ) : (
                    <DataTable minWidth={900}>
                      <DataTableHead>
                        <DataTableHeaderCell>Dátum</DataTableHeaderCell>
                        <DataTableHeaderCell>Munkatárs</DataTableHeaderCell>
                        <DataTableHeaderCell>Munkavégzés leírása</DataTableHeaderCell>
                        <DataTableHeaderCell>Típus</DataTableHeaderCell>
                        <DataTableHeaderCell align="right">Időtartam</DataTableHeaderCell>
                        <DataTableHeaderCell>Megrendelő</DataTableHeaderCell>
                        <DataTableHeaderCell>Szervezeti egység</DataTableHeaderCell>
                        <DataTableHeaderCell>Szakterület</DataTableHeaderCell>
                      </DataTableHead>
                      <DataTableBody>
                        {report.rows.map((row) => (
                          <DataTableRow key={row.timeEntryId}>
                            <DataTableCell>{formatDayHu(row.workDate)}</DataTableCell>
                            <DataTableCell>{row.workerName ?? NOT_SPECIFIED}</DataTableCell>
                            <DataTableCell>{row.description}</DataTableCell>
                            <DataTableCell>{row.workTypeLabel}</DataTableCell>
                            <DataTableCell align="right">{formatMinutesHu(row.minutes)}</DataTableCell>
                            <DataTableCell>{row.requesterName ?? NOT_SPECIFIED}</DataTableCell>
                            <DataTableCell>{row.organizationGroupName ?? NOT_SPECIFIED}</DataTableCell>
                            <DataTableCell>{row.departmentName ?? NOT_SPECIFIED}</DataTableCell>
                          </DataTableRow>
                        ))}
                      </DataTableBody>
                    </DataTable>
                  )}
                </section>

                <section aria-label="Ügyfél-export előnézete" className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-secondary)]">
                    Ügyfél-export előnézete
                  </h3>
                  <p className="text-xs text-[var(--adm-text-secondary)]">
                    Az ügyfélnek készülő kivonat a belső munkaleírásokat nem tartalmazza.
                  </p>
                  {report.issuerMissing.length > 0 ? (
                    <Alert variant="error" title="A PDF exportálásához hiányosak a kiállítói adatok">
                      {report.issuerMissing.join(", ")}. A belső nézet használható, de a PDF addig nem tölthető le, amíg a
                      kiállítói profil nem teljes.
                    </Alert>
                  ) : null}
                  {report.officeIdentifierNote ? (
                    <p className="text-xs text-[var(--adm-text-secondary)]">{report.officeIdentifierNote}</p>
                  ) : null}
                  {report.exportPreview && report.exportPreview.issuer?.legalName ? (
                    <div className="flex flex-col gap-1 rounded-[8px] border border-[var(--adm-border-canonical)] bg-white p-3 text-xs text-[var(--adm-text-primary)]">
                      <p className="font-semibold">{report.exportPreview.issuer.legalName}</p>
                      <p className="text-[var(--adm-text-secondary)]">
                        {report.exportPreview.issuer.address} · Adószám: {report.exportPreview.issuer.taxNumber}
                      </p>
                      {report.exportPreview.issuer.email || report.exportPreview.issuer.phone ? (
                        <p className="text-[var(--adm-text-secondary)]">
                          {[report.exportPreview.issuer.email, report.exportPreview.issuer.phone].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {report.exportPreview ? (
                    <DataTable minWidth={560}>
                      <DataTableHead>
                        <DataTableHeaderCell>Dátum</DataTableHeaderCell>
                        <DataTableHeaderCell>Munkatárs</DataTableHeaderCell>
                        <DataTableHeaderCell>Típus</DataTableHeaderCell>
                        <DataTableHeaderCell align="right">Időtartam</DataTableHeaderCell>
                      </DataTableHead>
                      <DataTableBody>
                        {report.exportPreview.rows.map((row) => (
                          <DataTableRow key={row.timeEntryId}>
                            <DataTableCell>{formatDayHu(row.workDate)}</DataTableCell>
                            <DataTableCell>{row.workerName ?? NOT_SPECIFIED}</DataTableCell>
                            <DataTableCell>{row.workTypeLabel}</DataTableCell>
                            <DataTableCell align="right">{formatMinutesHu(row.minutes)}</DataTableCell>
                          </DataTableRow>
                        ))}
                      </DataTableBody>
                    </DataTable>
                  ) : null}
                  {report.exportPreview && report.exportPreview.rows.length === 0 ? (
                    <EmptyState title="Nincs rögzített munkaidő" description={ZERO_TIME_TEXT} />
                  ) : null}
                </section>

                {report.ambiguousRows.length > 0 ? (
                  <section aria-label="Bizonytalan hozzárendelésű idő" className="flex flex-col gap-2">
                    <Alert
                      variant="warning"
                      title={`Bizonytalan hozzárendelésű idő — ${formatMinutesHu(report.case.ambiguousMinutes)}`}
                    >
                      Ezek a bejegyzések az ügy ügytárgyához tartoznak, de nem rendelhetők hozzá
                      egyértelműen ehhez az ügyhöz, ezért nem szerepelnek az összesített időben.
                    </Alert>
                    <DataTable minWidth={640}>
                      <DataTableHead>
                        <DataTableHeaderCell>Dátum</DataTableHeaderCell>
                        <DataTableHeaderCell>Munkatárs</DataTableHeaderCell>
                        <DataTableHeaderCell>Leírás</DataTableHeaderCell>
                        <DataTableHeaderCell align="right">Időtartam</DataTableHeaderCell>
                      </DataTableHead>
                      <DataTableBody>
                        {report.ambiguousRows.map((row) => (
                          <DataTableRow key={row.timeEntryId}>
                            <DataTableCell>{formatDayHu(row.workDate)}</DataTableCell>
                            <DataTableCell>{row.workerName ?? NOT_SPECIFIED}</DataTableCell>
                            <DataTableCell>{row.description}</DataTableCell>
                            <DataTableCell align="right">{formatMinutesHu(row.minutes)}</DataTableCell>
                          </DataTableRow>
                        ))}
                      </DataTableBody>
                    </DataTable>
                  </section>
                ) : null}

                {report.excludedRows.length > 0 ? (
                  <section aria-label="Kizárt munkaidő" className="flex flex-col gap-2">
                    <Alert
                      variant="info"
                      title={`Kizárt munkaidő — belső jellegű — ${formatMinutesHu(report.case.excludedMinutes)}`}
                    >
                      Belső jellegű munkaidő, amely nem része az ügyféljelentésnek, és nem szerepel
                      az összesített időben.
                    </Alert>
                    <DataTable minWidth={640}>
                      <DataTableHead>
                        <DataTableHeaderCell>Dátum</DataTableHeaderCell>
                        <DataTableHeaderCell>Munkatárs</DataTableHeaderCell>
                        <DataTableHeaderCell>Leírás</DataTableHeaderCell>
                        <DataTableHeaderCell align="right">Időtartam</DataTableHeaderCell>
                      </DataTableHead>
                      <DataTableBody>
                        {report.excludedRows.map((row) => (
                          <DataTableRow key={row.timeEntryId}>
                            <DataTableCell>{formatDayHu(row.workDate)}</DataTableCell>
                            <DataTableCell>{row.workerName ?? NOT_SPECIFIED}</DataTableCell>
                            <DataTableCell>{row.description}</DataTableCell>
                            <DataTableCell align="right">{formatMinutesHu(row.minutes)}</DataTableCell>
                          </DataTableRow>
                        ))}
                      </DataTableBody>
                    </DataTable>
                  </section>
                ) : null}

                {report.safeUpdates.length > 0 ? (
                  <section aria-label="Ügyfélnek közzétett tájékoztatások" className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--adm-text-secondary)]">
                      Ügyfélnek közzétett tájékoztatások
                    </h3>
                    <div className="flex flex-col gap-2">
                      {report.safeUpdates.map((update) => (
                        <Card key={`${update.title}-${update.publishedAt ?? ""}`} variant="subtle">
                          <CardContent>
                            <p className="text-sm font-semibold text-[var(--adm-text-primary)]">{update.title}</p>
                            <p className="mt-0.5 text-xs text-[var(--adm-text-secondary)]">
                              {update.categoryLabel}
                              {update.publishedAt ? ` · ${formatDayHu(update.publishedAt)}` : ""}
                            </p>
                            <p className="mt-2 text-sm leading-relaxed text-[var(--adm-text-primary)]">{update.body}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--adm-text-secondary)]">{label}</dt>
      <dd className="text-[var(--adm-text-primary)]">{value}</dd>
    </div>
  );
}

export default function WorkReportPage() {
  return (
    <AuthenticatedApp section="work-report">
      <WorkReportPageContent />
    </AuthenticatedApp>
  );
}
