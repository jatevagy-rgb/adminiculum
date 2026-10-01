"use client";
import { useEffect, useRef, useState } from 'react';
import { fetchApi } from '@/lib/api';
type Overlay = {
    sourceKey: string;
    sourceRevision: string;
    excluded: boolean;
    customerText: string | null;
    includeTime: boolean;
};
type Snapshot = {
    level: 1 | 2 | 3;
    audienceGrantId: string;
    publicationId: string;
    overlays: Overlay[];
};
type Source = {
    sourceKey: string;
    sourceRevision: string;
    title: string;
    body: string | null;
    minimumLevel: number;
    category: string;
    occurredAt: string;
    minutes: number | null;
};
type Policy = {
    revision: number;
    publishedNumber: number | null;
    draftNumber: number | null;
    reviewed: boolean;
    snapshot: Snapshot | null;
    grants: {
        id: string;
        label?: string;
    }[];
    publications: {
        id: string;
        label?: string;
    }[];
    sources: Source[];
    canManage: boolean;
    canPublish: boolean;
};
const names = ['Rövid állapot', 'Mérföldkövek', 'Részletes ügytörténet'];
export function CustomerHistoryPolicyEditor({ caseId }: {
    caseId: string;
}) {
    const [value, setValue] = useState<Policy | null>(null);
    const [draft, setDraft] = useState<Snapshot | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [preview, setPreview] = useState<{
        title: string;
        body: string | null;
        minutes: number | null;
    }[] | null>(null);
    const [grant, setGrant] = useState('');
    const [publication, setPublication] = useState('');
    const epoch = useRef(0);
    const url = `/case-history/cases/${encodeURIComponent(caseId)}/policy`;
    useEffect(() => {
        const n = ++epoch.current;
        setValue(null);
        setDraft(null);
        setBusy(false);
        setError('');
        setPreview(null);
        void fetchApi<Policy>(url).then(v => {
            if (n === epoch.current) {
                setValue(v);
                setGrant(v.snapshot?.audienceGrantId || '');
                setPublication(v.snapshot?.publicationId || '');
            }
        }).catch(() => {
            if (n === epoch.current)
                setError('A megosztási szabály nem tölthető be vagy nem elérhető.');
        });
        return () => { ++epoch.current; };
    }, [url]);
    const cls = 'min-h-10 min-w-10 rounded border border-[var(--adm-border)] px-3 py-2 text-sm';
    const snapshot = draft || value?.snapshot;
    async function loadAudience() {
        setBusy(true);
        setError('');
        const n = epoch.current;
        try {
            const v = await fetchApi<Policy>(`${url}?grantId=${encodeURIComponent(grant)}&publicationId=${encodeURIComponent(publication)}`);
            if (n !== epoch.current)
                return;
            setValue(v);
            setDraft({ level: v.snapshot?.level || 1, audienceGrantId: grant, publicationId: publication, overlays: v.snapshot?.overlays || [] });
        }
        catch {
            if (n === epoch.current)
                setError('A kiválasztott közzététel vagy aktív célközönség nem érhető el.');
        }
        finally {
            if (n === epoch.current)
                setBusy(false);
        }
    }
    async function action(which: 'save' | 'review' | 'publish' | 'withdraw' | 'preview') {
        if (!value)
            return;
        if ((which === 'publish' || which === 'withdraw') && !window.confirm('A változás az ügyfélportált és a munkajelentést is érinti. Folytatja?'))
            return;
        const n = epoch.current;
        setBusy(true);
        setError('');
        try {
            if (which === 'preview') {
                const p = await fetchApi<{
                    items: {
                        title: string;
                        body: string | null;
                        minutes: number | null;
                    }[];
                }>(`${url}/preview`);
                if (n === epoch.current)
                    setPreview(p.items);
                return;
            }
            const next = await fetchApi<Policy>(which === 'save' ? url : `${url}/${which}`, { method: which === 'save' ? 'PUT' : 'POST', body: JSON.stringify(which === 'save' ? { revision: value.revision, snapshot: draft } : { revision: value.revision }) });
            if (n !== epoch.current)
                return;
            setValue(next);
            setDraft(null);
            setPreview(null);
        }
        catch {
            if (n === epoch.current)
                setError('A művelet sikertelen, ütközés vagy forrásváltozás történt. A piszkozat megmaradt; az új szöveghez ismételt ellenőrzés szükséges.');
        }
        finally {
            if (n === epoch.current)
                setBusy(false);
        }
    }
    function overlay(source: Source, patch: Partial<Overlay>) {
        if (!snapshot)
            return;
        const existing = snapshot.overlays.find(o => o.sourceKey === source.sourceKey);
        const item = { sourceKey: source.sourceKey, sourceRevision: source.sourceRevision, excluded: false, customerText: null, includeTime: false, ...existing, ...patch };
        setDraft({ ...snapshot, overlays: [...snapshot.overlays.filter(o => o.sourceKey !== source.sourceKey), item] });
    }
    return <section aria-label="Ügyféltörténet megosztása" className="space-y-3 rounded-lg border border-[var(--adm-border)] bg-white p-4"><h3 className="font-semibold">Ügyféltörténet megosztása</h3><p className="text-sm">Ugyanaz a szabály érvényes az ügyfélportálra és a munkajelentésre. A piszkozat mentése nem teszi közzé. A kiválasztott célközönség aktív hozzáférését minden olvasás ellenőrzi.</p>{error && <p role="alert">{error}</p>}{value && <><p role="status">{draft ? 'Nem mentett piszkozat' : value.reviewed ? 'Ellenőrzött változat' : 'Mentett piszkozat'} · {value.publishedNumber ? `Közzétett változat: ${value.publishedNumber}` : 'Nincs aktív közzététel'}</p>{value.canManage && <div className="flex flex-wrap gap-2"><label>Célközönség<select className={cls} value={grant} onChange={e => setGrant(e.target.value)} disabled={busy}><option value="">Válasszon aktív hozzáférést</option>{value.grants.map((g, i) => <option key={g.id} value={g.id}>{g.label || `Aktív hozzáférés ${i + 1}`} · {g.id.slice(0, 8)}</option>)}</select></label><label>Közzétett ügy<select className={cls} value={publication} onChange={e => setPublication(e.target.value)} disabled={busy}><option value="">Válasszon közzétételt</option>{value.publications.map((p, i) => <option key={p.id} value={p.id}>{p.label || `Közzététel ${i + 1}`} · {p.id.slice(0, 8)}</option>)}</select></label><button type="button" className={cls} disabled={busy || !grant || !publication} onClick={() => void loadAudience()}>Forráslista betöltése</button></div>}{snapshot && <><label>Megosztási szint<select className={cls} value={snapshot.level} disabled={busy || !value.canManage} onChange={e => setDraft({ ...snapshot, level: Number(e.target.value) as 1 | 2 | 3 })}>{names.map((name, i) => <option key={name} value={i + 1}>{i + 1}. {name}</option>)}</select></label><p className="text-sm">1: közzétett állapot és következő lépés. 2: engedélyezett mérföldkövek, frissítések és dokumentumadatok. 3: külön ellenőrzött munkaszöveg, engedélyezett tényleges időadatok.</p>{value.sources.map(source => { const o = snapshot.overlays.find(x => x.sourceKey === source.sourceKey); return <div key={source.sourceKey} className="space-y-2 rounded border p-3"><p>{source.title} · {source.occurredAt.slice(0, 10)} · {source.minimumLevel}. szint</p><p className="break-all text-xs">Belső forráshivatkozás: {source.sourceKey}</p><label className="flex min-h-10 items-center gap-2"><input type="checkbox" disabled={!value.canManage || busy} checked={o?.excluded || false} onChange={e => overlay(source, { excluded: e.target.checked })}/>Elrejtés {draft ? '(piszkozat)' : '(mentett változat)'}</label><label className="block text-sm">Ügyfélnek szánt szöveg (külön ellenőrzendő)<textarea className={`${cls} block w-full`} maxLength={3000} disabled={!value.canManage || busy} value={o?.customerText ?? source.body ?? ''} onChange={e => overlay(source, { customerText: e.target.value, sourceRevision: source.sourceRevision })}/></label>{source.minutes !== null && <label className="flex min-h-10 items-center gap-2"><input type="checkbox" disabled={!value.canManage || busy} checked={o?.includeTime || false} onChange={e => overlay(source, { includeTime: e.target.checked })}/>Tényleges idő megosztása: {source.minutes} perc</label>}</div>; })}</>}
 <div className="flex flex-wrap gap-2">{draft && value.canManage && <><button type="button" className={cls} disabled={busy} onClick={() => void action('save')}>Piszkozat mentése</button><button type="button" className={cls} disabled={busy} onClick={() => setDraft(null)}>Mégse</button></>}{value.snapshot && !draft && <button type="button" className={cls} disabled={busy} onClick={() => void action('preview')}>Ügyfélnézet előnézete</button>}{value.canPublish && value.snapshot && !draft && <><button type="button" className={cls} disabled={busy} onClick={() => void action('review')}>Szöveg és forrás ellenőrzésének jóváhagyása</button><button type="button" className={cls} disabled={busy || !value.reviewed} onClick={() => void action('publish')}>Közzététel a portálon és jelentésben</button><button type="button" className={cls} disabled={busy || !value.publishedNumber} onClick={() => void action('withdraw')}>Megosztás visszavonása</button></>}</div></>}{preview && <div role="region" aria-label="Ügyfélnézet előnézete">{preview.length === 0 ? <p>Nincs megosztható elem.</p> : preview.map((item, i) => <article key={i}><strong>{item.title}</strong><p className="whitespace-pre-wrap">{item.body}</p>{item.minutes !== null && <p>{item.minutes} perc</p>}</article>)}</div>}</section>;
}
