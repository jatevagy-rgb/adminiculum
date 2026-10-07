"use client";
import { useEffect, useRef, useState } from 'react';
import { ApiError, fetchApi } from '@/lib/api';
type Owner = {
    revision: number;
    personId: string | null;
    owner: {
        name: string;
        organizationGroupName: string | null;
        valid: boolean;
    } | null;
    candidates: {
        id: string;
        name: string;
    }[];
    canManage: boolean;
};
function ownerReadError(error: unknown) {
    if (error instanceof ApiError) {
        if (error.code === 'OWNER_CAPABILITY_UNAVAILABLE' || error.code === 'WORKSPACE_CAPABILITY_UNAVAILABLE')
            return 'A funkció nem érhető el ebben a munkaterületen.';
        if (error.status === 403)
            return 'Nincs jogosultságod az ügygazda megtekintéséhez.';
    }
    return 'Az ügyfélnél kijelölt ügygazda nem tölthető be.';
}
export function CaseClientOwner({ caseId }: {
    caseId: string;
}) {
    const [value, setValue] = useState<Owner | null>(null);
    const [readState, setReadState] = useState<'loading' | 'error' | 'success'>('loading');
    const [draft, setDraft] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const generation = useRef(0);
    const url = `/case-workspace/cases/${encodeURIComponent(caseId)}/owner`;
    useEffect(() => {
        const load = () => {
            const current = ++generation.current;
            setReadState('loading');
            setValue(null);
            setDraft(null);
            setEditing(false);
            setBusy(false);
            setError('');
            void fetchApi<Owner>(url).then(v => {
                if (current === generation.current) {
                    setValue(v);
                    setReadState('success');
                }
            }).catch(error => {
                if (current === generation.current) {
                    setReadState('error');
                    setError(ownerReadError(error));
                }
            });
        };
        load();
        const refresh = (e: Event) => {
            if ((e as CustomEvent).detail === caseId)
                load();
        };
        window.addEventListener('case-owner-saved', refresh);
        return () => { ++generation.current; window.removeEventListener('case-owner-saved', refresh); };
    }, [caseId, url]);
    async function save() {
        if (!value || draft === null)
            return;
        const current = generation.current;
        setBusy(true);
        setError('');
        try {
            const next = await fetchApi<Owner>(url, { method: 'PUT', body: JSON.stringify({ revision: value.revision, personId: draft || null }) });
            if (current !== generation.current)
                return;
            setValue(next);
            setDraft(null);
            window.dispatchEvent(new CustomEvent('case-owner-saved', { detail: caseId }));
        }
        catch {
            if (current === generation.current)
                setError('A mentés sikertelen vagy ütközés történt. A választás megmaradt.');
        }
        finally {
            if (current === generation.current)
                setBusy(false);
        }
    }
    const cls = 'min-h-10 min-w-10 rounded border px-3 py-2';
    return <section aria-label="Ügygazda az ügyfélnél" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[var(--adm-border)] bg-white px-3 py-2 text-sm">
      <strong className="text-xs text-[var(--adm-text-muted)]">Ügygazda az ügyfélnél</strong>
      {readState === 'loading' ? <span role="status">Betöltés…</span> : readState === 'success' ? <span>{value?.owner ? `${value.owner.name}${value.owner.organizationGroupName ? ' · ' + value.owner.organizationGroupName : ''}${value.owner.valid ? '' : ' · új kijelölés szükséges'}` : 'Nincs kijelölve'}</span> : null}
      {error && <span role="alert" className="text-xs">{error}</span>}
      {readState === 'success' && value?.canManage && !editing && <button type="button" className={cls} onClick={() => setEditing(true)}>Módosítás</button>}
      {readState === 'success' && value?.canManage && editing && <div className="flex w-full flex-wrap items-center gap-2">
        <label className="min-w-0">Ügygazda <select className={cls + ' max-w-full'} value={draft ?? value.personId ?? ''} disabled={busy} onChange={e => setDraft(e.target.value)}><option value="">Nincs kijelölve</option>{value.candidates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <button type="button" className={cls} disabled={busy || draft === null} onClick={() => void save()}>{busy ? 'Mentés…' : 'Mentés'}</button>
        <button type="button" className={cls} disabled={busy} onClick={() => { setDraft(null); setEditing(false); }}>Mégse</button>
        <span className="text-xs text-[var(--adm-text-muted)]">A kijelölés nem ad ügyfélportál-hozzáférést.</span>
      </div>}
    </section>;
}
