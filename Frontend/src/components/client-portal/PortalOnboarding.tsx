"use client";

import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api';
import type { PortalIdentityContext } from '@/lib/clientPortalApi';
import {
  acceptInvitation,
  cancelMembershipRequest,
  onboardingPayloadIsSafe,
  buildOnboardingPayload,
  readSelectedModeIntent,
  submitMembershipRequest,
  type OnboardingMode,
} from '@/lib/clientOnboardingApi';

const MODE_LABELS: Record<OnboardingMode, string> = {
  INDIVIDUAL: 'Magánügyfél',
  ORGANIZATION: 'Szervezeti ügyfél',
  CASE_RELAY: 'Ügyátvezető',
};

const MODES: OnboardingMode[] = ['INDIVIDUAL', 'ORGANIZATION', 'CASE_RELAY'];

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 ${className}`}>{children}</section>;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'ORGANIZATION_CONTEXT_REQUIRED': return 'Ehhez a hozzáférési módhoz meg kell adnia a szervezet nevét.';
      case 'CLIENT_EMAIL_NOT_VERIFIED': return 'Az e-mail-cím ellenőrzése szükséges. Jelentkezzen be újra.';
      case 'INVITATION_UNAVAILABLE': return 'A meghívás már nem érvényes. Kérjük, vegye fel a kapcsolatot az irodával.';
      case 'INVITATION_EMAIL_MISMATCH': return 'A meghívás egy másik e-mail-címhez tartozik.';
      case 'WORKSPACE_NOT_ACTIVE': return 'A meghívott ügyfélfelület jelenleg nem aktív.';
      case 'REQUEST_NOT_CANCELLABLE': return 'A kérelem a jelenlegi állapotában nem vonható vissza.';
      case 'REVISION_CONFLICT': return 'A kérelem időközben módosult. Frissítettük az adatokat.';
      default: break;
    }
  }
  return 'A művelet nem sikerült. Kérjük, próbálja újra.';
}

/** Mode-specific access-request form. The verified e-mail is read-only and is
 *  never sent as an authoritative field — the server takes it from the session. */
function OnboardingForm({ context, initialMode, onDone }: { context: PortalIdentityContext; initialMode: OnboardingMode | null; onDone: () => void }) {
  const [mode, setMode] = useState<OnboardingMode>(initialMode || 'INDIVIDUAL');
  const [displayName, setDisplayName] = useState(context.identity.displayName || '');
  const [phone, setPhone] = useState('');
  const [organization, setOrganization] = useState('');
  const [unit, setUnit] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [corporateEmail, setCorporateEmail] = useState('');
  const [externalSystem, setExternalSystem] = useState('');
  const [note, setNote] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const orgMode = mode === 'ORGANIZATION' || mode === 'CASE_RELAY';

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const combinedNote = [note.trim(), externalSystem.trim() ? `Külső rendszer: ${externalSystem.trim()}` : ''].filter(Boolean).join(' · ');
      const payload = buildOnboardingPayload({
        requestedMode: mode,
        displayName,
        phone,
        claimedOrganizationName: orgMode ? organization : null,
        claimedUnitName: orgMode ? unit : null,
        claimedJobTitle: orgMode ? jobTitle : null,
        corporateEmail: orgMode ? corporateEmail : null,
        note: combinedNote,
      });
      // Defence-in-depth: never send a server-authoritative field.
      if (!onboardingPayloadIsSafe(payload)) throw new ApiError(400, 'A kérés érvénytelen mezőt tartalmaz.');
      await submitMembershipRequest({
        requestedMode: mode,
        displayName,
        phone,
        claimedOrganizationName: orgMode ? organization : null,
        claimedUnitName: orgMode ? unit : null,
        claimedJobTitle: orgMode ? jobTitle : null,
        corporateEmail: orgMode ? corporateEmail : null,
        note: combinedNote,
      });
      onDone();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = !busy && consent && displayName.trim().length > 0 && (!orgMode || organization.trim().length > 0);

  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9b7b25]">Ügyfélportál</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">Hozzáférés igénylése</h1>
      <p className="mt-3 max-w-2xl text-stone-700">Adja meg az azonosításhoz szükséges adatokat. A kérelem elküldése nem biztosít automatikus hozzáférést; azt az ügyvédi iroda hagyja jóvá.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-stone-800">
          <span>Ügyfélfelületi mód</span>
          <select data-testid="onboarding-mode" value={mode} onChange={(event) => setMode(event.target.value as OnboardingMode)} className="rounded-2xl border border-stone-300 px-4 py-3">
            {MODES.map((value) => <option key={value} value={value}>{MODE_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-stone-800">
          <span>Hitelesített e-mail-cím</span>
          <input data-testid="onboarding-verified-email" value={context.identity.email} readOnly aria-readonly="true" className="cursor-not-allowed rounded-2xl border border-stone-200 bg-stone-100 px-4 py-3 text-stone-600" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-stone-800">
          <span>Teljes név *</span>
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={160} className="rounded-2xl border border-stone-300 px-4 py-3" />
        </label>
        <label className="grid gap-1 text-sm font-medium text-stone-800">
          <span>Telefonszám (opcionális)</span>
          <input value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={60} className="rounded-2xl border border-stone-300 px-4 py-3" />
        </label>

        {orgMode ? (
          <>
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              <span>Szervezet / cég neve *</span>
              <input value={organization} onChange={(event) => setOrganization(event.target.value)} maxLength={180} className="rounded-2xl border border-stone-300 px-4 py-3" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              <span>Szervezeti egység (pl. HR)</span>
              <input value={unit} onChange={(event) => setUnit(event.target.value)} maxLength={120} className="rounded-2xl border border-stone-300 px-4 py-3" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              <span>Munkakör</span>
              <input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} maxLength={160} className="rounded-2xl border border-stone-300 px-4 py-3" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              <span>Céges kapcsolattartó / meghívó (opcionális)</span>
              <input value={corporateEmail} onChange={(event) => setCorporateEmail(event.target.value)} maxLength={254} className="rounded-2xl border border-stone-300 px-4 py-3" />
            </label>
          </>
        ) : null}

        {mode === 'CASE_RELAY' ? (
          <label className="grid gap-1 text-sm font-medium text-stone-800 sm:col-span-2">
            <span>Használt külső rendszer megnevezése / referencia (opcionális)</span>
            <input value={externalSystem} onChange={(event) => setExternalSystem(event.target.value)} maxLength={200} className="rounded-2xl border border-stone-300 px-4 py-3" />
          </label>
        ) : null}

        <label className="grid gap-1 text-sm font-medium text-stone-800 sm:col-span-2">
          <span>Rövid megjegyzés (opcionális)</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={600} className="min-h-24 rounded-2xl border border-stone-300 px-4 py-3" />
        </label>
      </div>

      <label className="mt-4 flex items-start gap-3 text-sm text-stone-700">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1" />
        <span>Elolvastam és elfogadom az adatkezelési tájékoztatót. A megadott szervezet önmagában nem ad hozzáférést; a tényleges ügyfél- és munkatér-hozzárendelést az ügyvédi iroda végzi.</span>
      </label>

      {message ? <p role="alert" data-testid="onboarding-error" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</p> : null}

      <button type="button" data-testid="onboarding-submit" disabled={!canSubmit} onClick={submit} className="mt-6 inline-flex w-fit rounded-full bg-stone-950 px-6 py-3 font-semibold text-white disabled:opacity-50">
        {busy ? 'Beküldés…' : 'Hozzáférési kérelem beküldése'}
      </button>
    </Card>
  );
}

function PendingPanel({ context, onDone }: { context: PortalIdentityContext; onDone: () => void }) {
  const request = context.onboarding?.latestRequest || null;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const cancel = async () => {
    if (!request) return;
    setBusy(true);
    setMessage(null);
    try {
      await cancelMembershipRequest(request.id, request.revision);
      onDone();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9b7b25]">Függőben</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">Hozzáférési kérelme elbírálásra vár</h1>
      <p className="mt-3 max-w-2xl text-stone-700">A kérelmet megkaptuk. Az ügyvédi iroda ellenőrzi és jóváhagyás után értesíti Önt. Ügyanyag csak külön jóváhagyott hozzáférés után jelenik meg.</p>
      <dl className="mt-6 grid gap-3 text-sm text-stone-700 sm:grid-cols-2">
        <div><dt className="font-semibold text-stone-500">Beküldve</dt><dd data-testid="pending-submitted-at">{formatDate(request?.submittedAt)}</dd></div>
        <div><dt className="font-semibold text-stone-500">Kért ügyfélfelület</dt><dd>{request?.requestedMode ? MODE_LABELS[request.requestedMode as OnboardingMode] || request.requestedMode : '—'}</dd></div>
        <div><dt className="font-semibold text-stone-500">Megadott szervezet</dt><dd>{request?.claimedOrganizationName || '—'}</dd></div>
        <div><dt className="font-semibold text-stone-500">Szervezeti egység</dt><dd>{request?.claimedUnitName || '—'}</dd></div>
      </dl>
      {request?.decisionMessage ? <p className="mt-4 rounded-2xl bg-stone-100 p-4 text-sm text-stone-700">Iroda üzenete: {request.decisionMessage}</p> : null}
      {message ? <p role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</p> : null}
      {request ? <button type="button" disabled={busy} onClick={cancel} className="mt-6 inline-flex w-fit rounded-full border border-stone-300 px-5 py-3 text-sm font-semibold text-stone-800 disabled:opacity-50">Kérelem visszavonása</button> : null}
    </Card>
  );
}

function RejectedPanel({ context, initialMode, onDone }: { context: PortalIdentityContext; initialMode: OnboardingMode | null; onDone: () => void }) {
  const request = context.onboarding?.latestRequest || null;
  const [resubmitting, setResubmitting] = useState(false);
  if (resubmitting) return <OnboardingForm context={context} initialMode={initialMode} onDone={onDone} />;
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#b95e4b]">Elutasítva</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">Hozzáférési kérelmét nem hagyták jóvá</h1>
      <p className="mt-3 max-w-2xl text-stone-700">A korábbi kérelmét az ügyvédi iroda nem hagyta jóvá. Ha szükséges, új kérelmet nyújthat be a helyes adatokkal.</p>
      {request?.decisionMessage ? <p data-testid="rejected-message" className="mt-4 rounded-2xl bg-[#fdf3e2] p-4 text-sm text-[#7a5f18]">Indokolás: {request.decisionMessage}</p> : null}
      <button type="button" data-testid="rejected-resubmit" onClick={() => setResubmitting(true)} className="mt-6 inline-flex w-fit rounded-full bg-stone-950 px-6 py-3 font-semibold text-white">Új hozzáférési kérelem</button>
    </Card>
  );
}

function InvitationPanel({ context, onAccepted }: { context: PortalIdentityContext; onAccepted: (reference: string) => void }) {
  const invitation = context.onboarding?.invitation || null;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const accept = async () => {
    if (!invitation) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await acceptInvitation(invitation.invitationId);
      onAccepted(result.workspaceReference);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9b7b25]">Meghívás</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950">Meghívás egy ügyfélfelületre</h1>
      <p className="mt-3 max-w-2xl text-stone-700">Az ügyvédi iroda meghívta Önt az alábbi ügyfélfelületre. A meghívás elfogadása munkatér-hozzáférést ad; ügyanyaghoz külön, kifejezett hozzáférés szükséges.</p>
      <dl className="mt-6 grid gap-3 text-sm text-stone-700 sm:grid-cols-2">
        <div><dt className="font-semibold text-stone-500">Szervezet</dt><dd data-testid="invitation-org">{invitation?.organizationName || '—'}</dd></div>
        <div><dt className="font-semibold text-stone-500">Ügyfélfelület</dt><dd>{invitation?.workspaceName || '—'}</dd></div>
        <div><dt className="font-semibold text-stone-500">Érvényes eddig</dt><dd>{formatDate(invitation?.expiresAt)}</dd></div>
      </dl>
      {message ? <p role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</p> : null}
      {invitation ? <button type="button" data-testid="invitation-accept" disabled={busy} onClick={accept} className="mt-6 inline-flex w-fit rounded-full bg-stone-950 px-6 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Feldolgozás…' : 'Meghívás elfogadása'}</button> : null}
    </Card>
  );
}

/**
 * Onboarding surface rendered by the portal shell whenever the resolver reports
 * a non-active state (needs a request, pending, rejected, or invited) — the
 * replacement for the "Nincs aktív ügyfélfelülete" dead-end.
 */
export function PortalOnboarding({ context, onReload, onEnterWorkspace }: { context: PortalIdentityContext; onReload: () => void; onEnterWorkspace: (reference: string) => void }) {
  const [selectedMode, setSelectedMode] = useState<OnboardingMode | null>(null);
  useEffect(() => { setSelectedMode(readSelectedModeIntent()); }, []);
  const initialMode = useMemo<OnboardingMode | null>(() => {
    const requested = context.onboarding?.latestRequest?.requestedMode;
    if (requested === 'ORGANIZATION' || requested === 'CASE_RELAY' || requested === 'INDIVIDUAL') return requested;
    return selectedMode;
  }, [context.onboarding, selectedMode]);

  switch (context.state) {
    case 'REQUEST_PENDING':
    case 'PENDING_APPROVAL':
      return <PendingPanel context={context} onDone={onReload} />;
    case 'REQUEST_REJECTED':
      return <RejectedPanel context={context} initialMode={initialMode} onDone={onReload} />;
    case 'INVITATION_PENDING':
      return <InvitationPanel context={context} onAccepted={onEnterWorkspace} />;
    case 'ONBOARDING_REQUIRED':
    case 'NO_ACCESS':
    default:
      return <OnboardingForm context={context} initialMode={initialMode} onDone={onReload} />;
  }
}
