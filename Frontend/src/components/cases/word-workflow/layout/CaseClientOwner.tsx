"use client";
import { useEffect, useRef, useState } from 'react';
import { fetchApi } from '@/lib/api';
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
export function CaseClientOwner({ caseId }: {
    caseId: string;
}) {
    const [value, setValue] = useState<Owner | null>(null);
    const [draft, setDraft] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const generation = useRef(0);
    const url = `/case-workspace/cases/${encodeURIComponent(caseId)}/owner`;
    useEffect(() => {
        const current = ++generation.current;
        setValue(null);
        setDraft(null);
        setBusy(false);
        setError('');
        const load = () => void fetchApi<Owner>(url).then(v => {
            if (current === generation.current)
                setValue(v);
        }).catch(() => {
            if (current === generation.current)
                setError('Az ügyfélnél kijelölt ügygazda nem tölthető be.');
        });
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
    return <section aria-label="Ügygazda az ügyfélnél" className="rounded-lg border border-[var(--adm-border)] bg-white p-3 text-sm"><strong>Ügygazda az ügyfélnél</strong><p>{value?.owner ? `${value.owner.name}${value.owner.organizationGroupName ? ' · ' + value.owner.organizationGroupName : ''}${value.owner.valid ? '' : ' · már nem választható; új kijelölés szükséges'}` : 'Nincs kijelölve'}</p>{error && <p role="alert">{error}</p>}{value?.canManage && <div className="mt-2 flex flex-wrap gap-2"><label>Állandó ügygazda <select className={cls} value={draft ?? value.personId ?? ''} disabled={busy} onChange={e => setDraft(e.target.value)}><option value="">Nincs kijelölve</option>{value.candidates.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{draft !== null && <><button type="button" className={cls} disabled={busy} onClick={() => void save()}>{busy ? 'Mentés…' : 'Ügygazda mentése'}</button><button type="button" className={cls} disabled={busy} onClick={() => setDraft(null)}>Mégse</button></>}</div>}<p className="mt-1 text-xs">Az ügyhöz mentett kijelölés. Nem ad ügyfélportál-hozzáférést; a jelentésben külön felülírható.</p></section>;
}
