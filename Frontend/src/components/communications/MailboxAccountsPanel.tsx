"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  confirmMailboxVerification,
  disconnectMailbox,
  getMailboxConnections,
  startMailboxAuthorization,
  startMailboxVerification,
  syncMailbox,
  type MailboxConnection,
  type MailboxProvider,
} from "@/lib/api";

type Feedback = { tone: "success" | "error" | "info"; message: string };

const providerLabels: Record<MailboxProvider, string> = {
  MICROSOFT_GRAPH: "Microsoft",
  GOOGLE_GMAIL: "Google",
  IMAP_SMTP: "Egyéb",
};

const statusLabels: Record<MailboxConnection["status"], string> = {
  EMAIL_UNVERIFIED: "E-mail-cím megerősítése szükséges",
  EMAIL_VERIFIED: "Engedélyezés szükséges",
  AUTHORIZATION_REQUIRED: "Engedélyezés szükséges",
  CONNECTED: "Kapcsolódva",
  CONNECTED_READ_ONLY: "Csak olvasás",
  SYNCING: "Szinkronizálás folyamatban",
  PAUSED: "Szüneteltetve",
  REVOKED: "Újraengedélyezés szükséges",
  ERROR: "Szinkronizálás sikertelen",
};

const safeError = (error: unknown, fallback: string) => {
  if (error instanceof ApiError) {
    if (error.status === 503) return "Ez a csatlakozási mód jelenleg nincs bekapcsolva.";
    if (error.status === 409 && error.code === "MAILBOX_REVOKED") return "A kapcsolat visszavonva. Újraengedélyezés szükséges.";
    if (error.status === 409 && error.code === "MAILBOX_SEND_NOT_AVAILABLE") return "A küldés ehhez a kapcsolathoz nem érhető el.";
  }
  return fallback;
};

function dateLabel(value: string | null | undefined) {
  if (!value) return "Még nem történt sikeres szinkronizálás";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Még nem történt sikeres szinkronizálás" : date.toLocaleString("hu-HU");
}

export default function MailboxAccountsPanel() {
  const [mailboxes, setMailboxes] = useState<MailboxConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState<MailboxProvider>("MICROSOFT_GRAPH");
  const [code, setCode] = useState("");
  const [verificationStarted, setVerificationStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const refresh = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getMailboxConnections();
      setMailboxes(Array.isArray(result.mailboxes) ? result.mailboxes : []);
    } catch {
      setMailboxes([]);
      setLoadError("Az e-mail-fiókok jelenleg nem érhetők el.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const closeConnect = () => {
    if (busy) return;
    setShowConnect(false);
    setVerificationStarted(false);
    setCode("");
    setFeedback(null);
  };

  const startVerification = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      await startMailboxVerification({ email: email.trim(), provider });
      setVerificationStarted(true);
      setFeedback({ tone: "info", message: "Ellenőrző kódot küldtünk. Írd be a kódot a folytatáshoz." });
    } catch (error) {
      setFeedback({ tone: "error", message: safeError(error, "Az e-mail-cím ellenőrzése nem sikerült.") });
    } finally {
      setBusy(false);
    }
  };

  const confirmVerification = async () => {
    if (!email.trim() || !code.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      await confirmMailboxVerification({ email: email.trim(), provider, code: code.trim() });
      setFeedback({ tone: "success", message: "Az e-mail-cím megerősítve. A szolgáltatói engedélyezés még szükséges." });
      setShowConnect(false);
      setVerificationStarted(false);
      setCode("");
      await refresh();
    } catch (error) {
      setFeedback({ tone: "error", message: safeError(error, "Az ellenőrző kód nem fogadható el.") });
    } finally {
      setBusy(false);
    }
  };

  const authorize = async (mailbox: MailboxConnection) => {
    if (mailbox.provider === "IMAP_SMTP") {
      setFeedback({ tone: "info", message: "Az Egyéb csatlakozás jelenleg nincs bekapcsolva ezen a környezeten." });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const result = await startMailboxAuthorization(mailbox.id, mailbox.provider);
      if (result.authorizationUrl) window.location.assign(result.authorizationUrl);
    } catch (error) {
      setFeedback({ tone: "error", message: safeError(error, "Az engedélyezés elindítása nem sikerült.") });
    } finally {
      setBusy(false);
    }
  };

  const sync = async (mailbox: MailboxConnection) => {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await syncMailbox(mailbox.id);
      setMailboxes((current) => current.map((item) => item.id === mailbox.id ? result.mailbox : item));
      setFeedback({ tone: "success", message: "A szinkronizálás befejeződött." });
    } catch (error) {
      setFeedback({ tone: "error", message: safeError(error, "A szinkronizálás nem sikerült.") });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (mailbox: MailboxConnection) => {
    setBusy(true);
    setFeedback(null);
    try {
      await disconnectMailbox(mailbox.id);
      setMailboxes((current) => current.map((item) => item.id === mailbox.id ? { ...item, status: "REVOKED", readCapability: false, sendCapability: false } : item));
      setFeedback({ tone: "success", message: "A kapcsolat leválasztva." });
    } catch (error) {
      setFeedback({ tone: "error", message: safeError(error, "A kapcsolat leválasztása nem sikerült.") });
    } finally {
      setBusy(false);
    }
  };

  const hasMailboxes = useMemo(() => mailboxes.length > 0, [mailboxes]);

  return (
    <main className="adm-dash-stage min-h-screen px-3 pb-4 pt-3 sm:px-5 xl:px-6">
      <div className="mx-auto w-full max-w-[1100px] space-y-3">
        <header className="adm-panel overflow-hidden bg-white">
          <div className="border-b-[3px] border-[var(--adm-blue-500)] px-4 py-4 lg:px-5">
            <Link href="/communications" className="text-[10px] font-semibold text-[var(--adm-blue-700)] hover:underline">← Kommunikáció</Link>
            <p className="adm-kicker mt-3 text-[var(--adm-blue-700)]">Kommunikáció</p>
            <h1 className="adm-heading mt-1 text-[28px] leading-tight">Email-fiókok</h1>
            <p className="mt-2 max-w-2xl text-[12px] leading-5 text-[var(--adm-text-muted)]">A csatlakoztatott fiókok csak a saját postafiókod munkafelületét adják. Az ügyhöz kapcsolás külön, tudatos művelet.</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--adm-surface)] px-4 py-3 lg:px-5">
            <span className="text-[10px] font-semibold text-[var(--adm-text-muted)]">{hasMailboxes ? `${mailboxes.length} csatlakozás` : "Nincs csatlakoztatott e-mail-fiók"}</span>
            <button type="button" onClick={() => { setShowConnect(true); setFeedback(null); }} className="adm-link-button adm-link-button-primary px-3 py-2 text-[11px]">+ Email-fiók csatlakoztatása</button>
          </div>
        </header>

        {feedback ? <div role="status" className={`border px-3 py-2 text-[11px] font-semibold ${feedback.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : feedback.tone === "info" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-800"}`}>{feedback.message}</div> : null}
        {loadError ? <div role="alert" className="border border-[var(--adm-border)] bg-white px-3 py-2 text-[11px] font-semibold text-[var(--adm-text-muted)]">{loadError}</div> : null}

        <section className="grid gap-3" aria-label="Csatlakoztatott e-mail-fiókok">
          {loading ? <div className="adm-panel bg-white p-5 text-[12px] text-[var(--adm-text-muted)]">E-mail-fiókok betöltése…</div> : null}
          {!loading && mailboxes.length === 0 ? <div className="adm-panel bg-white p-6"><h2 className="adm-heading text-[20px]">Még nincs csatlakoztatott fiók</h2><p className="mt-2 max-w-xl text-[11px] leading-5 text-[var(--adm-text-muted)]">A Kommunikáció munkatérben továbbra is a kanonikus kommunikációk jelennek meg. Csatlakoztass egy fiókot, ha saját bejövő üzeneteidet is innen szeretnéd feldolgozni.</p></div> : null}
          {!loading && mailboxes.map((mailbox) => (
            <article key={mailbox.id} className="adm-panel bg-white p-4" data-testid="mailbox-account-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-[13px] font-semibold text-[var(--adm-text)]">{mailbox.mailboxAddress}</p><p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">{providerLabels[mailbox.provider]}</p></div>
                <span className="rounded-full border border-[var(--adm-border)] bg-[var(--adm-surface)] px-2 py-1 text-[9px] font-bold text-[var(--adm-blue-700)]">{statusLabels[mailbox.status]}</span>
              </div>
              <dl className="mt-4 grid gap-2 border-t border-[var(--adm-border)] pt-3 text-[10px] sm:grid-cols-3"><div><dt className="text-[var(--adm-text-muted)]">Olvasás</dt><dd className="font-semibold">{mailbox.readCapability ? "Elérhető" : "Nem érhető el"}</dd></div><div><dt className="text-[var(--adm-text-muted)]">Küldés</dt><dd className="font-semibold">{mailbox.sendCapability ? "Elérhető" : "Nem érhető el"}</dd></div><div><dt className="text-[var(--adm-text-muted)]">Utolsó sikeres szinkron</dt><dd className="font-semibold">{dateLabel(mailbox.lastSyncedAt)}</dd></div></dl>
              <div className="mt-4 flex flex-wrap gap-2">
                {(mailbox.status === "AUTHORIZATION_REQUIRED" || mailbox.status === "REVOKED" || mailbox.status === "ERROR") ? <button type="button" disabled={busy} onClick={() => void authorize(mailbox)} className="adm-link-button adm-link-button-primary px-3 py-2 text-[10px]">{mailbox.status === "REVOKED" ? "Újraengedélyezés" : "Engedélyezés"}</button> : null}
                {mailbox.readCapability ? <button type="button" disabled={busy || mailbox.status === "SYNCING"} onClick={() => void sync(mailbox)} className="adm-link-button px-3 py-2 text-[10px]">{mailbox.status === "SYNCING" ? "Szinkronizálás…" : "Szinkronizálás"}</button> : null}
                {mailbox.status !== "REVOKED" ? <button type="button" disabled={busy} onClick={() => void disconnect(mailbox)} className="border border-[var(--adm-border)] bg-white px-3 py-2 text-[10px] font-semibold text-[var(--adm-text-muted)]">Leválasztás</button> : null}
              </div>
            </article>
          ))}
        </section>
      </div>

      {showConnect ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-md border border-[var(--adm-border)] bg-white shadow-2xl"><div className="border-b border-[var(--adm-border)] px-4 py-3"><h2 className="adm-heading text-[20px]">Email-fiók csatlakoztatása</h2><p className="mt-1 text-[10px] text-[var(--adm-text-muted)]">Először erősítsd meg a postafiók címedet.</p></div><div className="space-y-3 p-4"><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">E-mail-cím<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="adm-modal-field mt-1 w-full px-3 py-2 text-sm" autoComplete="email" /></label><label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Szolgáltató<select value={provider} onChange={(event) => setProvider(event.target.value as MailboxProvider)} className="adm-modal-field mt-1 w-full px-3 py-2 text-sm"><option value="MICROSOFT_GRAPH">Microsoft</option><option value="GOOGLE_GMAIL">Google</option><option value="IMAP_SMTP">Egyéb — jelenleg nem elérhető</option></select></label>{verificationStarted ? <label className="block text-[11px] font-semibold text-[var(--adm-text-muted)]">Ellenőrző kód<input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} className="adm-modal-field mt-1 w-full px-3 py-2 text-sm" autoComplete="one-time-code" /></label> : null}</div><div className="flex justify-end gap-2 border-t border-[var(--adm-border)] px-4 py-3"><button type="button" disabled={busy} onClick={closeConnect} className="border border-[var(--adm-border)] bg-white px-3 py-2 text-[11px] font-semibold text-[var(--adm-text-muted)]">Mégse</button>{verificationStarted ? <button type="button" disabled={busy || !code.trim()} onClick={() => void confirmVerification()} className="bg-[var(--adm-blue-700)] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50">{busy ? "Ellenőrzés…" : "E-mail-cím megerősítése"}</button> : <button type="button" disabled={busy || !email.trim() || provider === "IMAP_SMTP"} onClick={() => void startVerification()} className="bg-[var(--adm-blue-700)] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50">{busy ? "Küldés…" : "Ellenőrző kód küldése"}</button>}</div></div></div> : null}
    </main>
  );
}
