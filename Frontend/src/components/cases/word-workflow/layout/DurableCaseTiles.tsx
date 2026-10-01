"use client";
import { useEffect, useRef, useState } from 'react';
import { fetchApi } from '@/lib/api';
import type { CaseTileDescriptor } from './CaseContextTiles';
type Tile = {
    id: string;
    revision: number;
    title: string;
    text: string;
    tone: 'info' | 'teal' | 'green';
    archived: boolean;
};
type Surface = 'overview' | 'document';
type Snapshot = {
    tiles: Tile[];
    layoutRevision: number;
    placements: Record<Surface, string[]>;
    canManage: boolean;
};
const toneClass = { info: 'border-[var(--adm-blue-700)] bg-[var(--adm-blue-100)]', teal: 'border-[var(--adm-palette-teal)] bg-white', green: 'border-[var(--adm-green-800)] bg-white' };
const control = 'min-h-10 min-w-10 rounded border border-[var(--adm-border)] px-3 py-2 text-sm';
export function DurableCaseTiles({ caseId, surface, builtin }: {
    caseId: string;
    surface: Surface;
    builtin: CaseTileDescriptor[];
}) {
    const [saved, setSaved] = useState<Snapshot | null>(null);
    const [draft, setDraft] = useState<Snapshot | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const epoch = useRef(0);
    const drag = useRef<string | null>(null);
    const url = `/case-workspace/cases/${encodeURIComponent(caseId)}/tiles`;
    useEffect(() => {
        const generation = ++epoch.current;
        setSaved(null);
        setDraft(null);
        setBusy(false);
        setError('');
        const load = () => {
            void fetchApi<Snapshot>(url).then(value => {
                if (epoch.current === generation)
                    setSaved(value);
            }).catch(() => {
                if (epoch.current === generation)
                    setError('Az egyéni csempék nem tölthetők be. A mentés nem elérhető.');
            });
        };
        load();
        const refresh = (event: Event) => {
            if ((event as CustomEvent).detail === caseId)
                load();
        };
        window.addEventListener('case-tiles-saved', refresh);
        return () => { ++epoch.current; window.removeEventListener('case-tiles-saved', refresh); };
    }, [caseId, url]);
    const view = draft || saved;
    const refs = view?.placements[surface] || builtin.map(t => t.kind);
    const builtinById = new Map(builtin.map(t => [t.kind as string, t]));
    const mutateTile = (id: string, patch: Partial<Tile>) => setDraft(d => d && ({ ...d, tiles: d.tiles.map(t => t.id === id ? { ...t, ...patch } : t) }));
    function move(id: string, to: number) {
        setDraft(d => {
            if (!d)
                return d;
            const order = [...d.placements[surface]];
            const from = order.indexOf(id);
            if (from < 0 || to < 0 || to >= order.length)
                return d;
            order.splice(from, 1);
            order.splice(to, 0, id);
            return { ...d, placements: { ...d.placements, [surface]: order } };
        });
    }
    function place(id: string, target: Surface, include: boolean) {
        setDraft(d => d && ({ ...d, placements: { ...d.placements, [target]: include ? [...d.placements[target].filter(r => r !== id), id].slice(0, 32) : d.placements[target].filter(r => r !== id) } }));
    }
    async function save() {
        if (!draft || !saved)
            return;
        const generation = epoch.current;
        setBusy(true);
        setError('');
        setNotice('');
        const tiles = draft.tiles.filter(t => JSON.stringify(t) !== JSON.stringify(saved.tiles.find(old => old.id === t.id))).map(({ id, revision, title, text, tone, archived }) => ({ id, revision, title, text, tone, archived }));
        try {
            const next = await fetchApi<Snapshot>(url, { method: 'PUT', body: JSON.stringify({ layoutRevision: draft.layoutRevision, placements: draft.placements, tiles }) });
            if (generation !== epoch.current)
                return;
            setSaved(next);
            setDraft(null);
            setNotice('A csempék és a saját elrendezés mentve.');
            window.dispatchEvent(new CustomEvent('case-tiles-saved', { detail: caseId }));
        }
        catch {
            if (generation === epoch.current)
                setError('A mentés nem sikerült vagy másik szerkesztés történt. A piszkozat megmaradt. Másolja ki szükség esetén; a Mégse az aktuális mentett állapothoz tér vissza.');
        }
        finally {
            if (generation === epoch.current)
                setBusy(false);
        }
    }
    return <section aria-label="Ügykontextus" data-testid="word-case-context" className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      {!draft && saved && <button type="button" className={control} onClick={() => { setDraft(structuredClone(saved)); setError(''); setNotice(''); }}>Csempék szerkesztése</button>}
      {draft && <><span className="text-sm">Nem mentett változat · közös tartalom, saját elrendezés</span><button type="button" className={control} disabled={busy} onClick={() => void save()}>{busy ? 'Mentés…' : 'Mentés'}</button><button type="button" className={control} disabled={busy} onClick={() => { setDraft(null); setError(''); }}>Mégse</button><button type="button" className={control} disabled={busy} onClick={() => setDraft(d => d && ({ ...d, placements: { overview: builtin.map(t => t.kind), document: builtin.map(t => t.kind) } }))}>Saját elrendezés alaphelyzetbe</button></>}
    </div>
    {error && <p role="alert" className="text-sm text-[var(--adm-text)]">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-3">
      {refs.map((id, index) => {
            const base = builtinById.get(id);
            const custom = view?.tiles.find(t => t.id === id);
            if (custom?.archived && !draft)
                return null;
            const title = base?.title || custom?.title || 'Nem elérhető csempe';
            return <article key={id} data-tile-id={base?.id || id} data-content-ref={base?.contentRef || id} className={`min-w-0 rounded-lg border-l-4 p-4 ${toneClass[base?.tone || custom?.tone || 'info']}`} onDragOver={draft ? e => e.preventDefault() : undefined} onDrop={draft ? e => {
                    e.preventDefault();
                    if (drag.current)
                        move(drag.current, index);
                    drag.current = null;
                } : undefined}>
          {draft && <div className="mb-2 flex flex-wrap gap-1"><button type="button" aria-label={`${title}: húzás`} className={control} draggable={!busy} onDragStart={() => { drag.current = id; }}>↕</button><button type="button" className={control} disabled={busy || index === 0} onClick={() => move(id, index - 1)} aria-label={`${title}: fel`}>Fel</button><button type="button" className={control} disabled={busy || index === refs.length - 1} onClick={() => move(id, index + 1)} aria-label={`${title}: le`}>Le</button></div>}
          {draft?.canManage && custom ? <><label className="block text-sm">Közös csempe neve<input className={`${control} w-full`} maxLength={120} value={custom.title} disabled={busy} onChange={e => mutateTile(id, { title: e.target.value })}/></label><label className="block text-sm">Közös tartalom<textarea className={`${control} min-h-28 w-full`} maxLength={6000} value={custom.text} disabled={busy} onChange={e => mutateTile(id, { text: e.target.value })}/></label><label className="block text-sm">Szín<select className={control} value={custom.tone} disabled={busy} onChange={e => mutateTile(id, { tone: e.target.value as Tile['tone'] })}><option value="info">Kék</option><option value="teal">Türkiz</option><option value="green">Zöld</option></select></label><button type="button" className={control} disabled={busy} onClick={() => {
                        if (custom.archived || window.confirm('A közös csempe archiválása minden felhasználó elrendezésében elrejti. Visszaállítható.'))
                            mutateTile(id, { archived: !custom.archived });
                    }}>{custom.archived ? 'Közös csempe visszaállítása' : 'Közös csempe archiválása'}</button></> : <><h3 className="text-sm font-semibold text-[var(--adm-green-800)]">{title}</h3><p className="mt-2 whitespace-pre-line break-words text-sm leading-6">{base?.body ?? custom?.text ?? 'A hivatkozás nem érhető el; nincs helyettesítő tartalom.'}</p></>}
          {draft && <div className="mt-2">{(['overview', 'document'] as Surface[]).map(target => <label key={target} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={draft.placements[target].includes(id)} onChange={e => place(id, target, e.target.checked)}/>{target === 'overview' ? 'Saját áttekintés' : 'Saját dokumentumfejléc'}</label>)}</div>}
        </article>;
        })}
    </div>
    {draft && <div className="space-y-2 rounded border p-3"><p className="text-sm">Elhelyezhető csempék (a tartalom közös; az elhelyezés csak Öné)</p>{[...builtin.map(t => ({ id: t.kind, title: t.title })), ...draft.tiles].filter(t => !refs.includes(t.id)).map(t => <button key={t.id} type="button" className={control} disabled={busy || refs.length >= 32} onClick={() => place(t.id, surface, true)}>{t.title || 'Névtelen csempe'} hozzáadása ide</button>)}{draft.canManage && <button type="button" className={control} disabled={busy || refs.length >= 32} onClick={() => { const id = crypto.randomUUID(); setDraft(d => d && ({ ...d, tiles: [...d.tiles, { id, revision: 0, title: 'Új csempe', text: '', tone: 'green', archived: false }], placements: { ...d.placements, [surface]: [...d.placements[surface], id] } })); }}>Új közös szöveges csempe</button>}</div>}
  </section>;
}
