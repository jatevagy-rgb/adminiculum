"use client";
import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';
import { ApiError, fetchApi } from '@/lib/api';
import { ViewportDialog } from '@/components/ui/ViewportDialog';
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
function tileReadError(error: unknown) {
    if (error instanceof ApiError) {
        if (error.code === 'WORKSPACE_CAPABILITY_UNAVAILABLE')
            return 'Az egyéni csempék funkció nem érhető el ebben a munkaterületen.';
        if (error.status === 403)
            return 'Nincs jogosultságod az ügy csempéinek megtekintéséhez.';
    }
    return 'Az egyéni csempék nem tölthetők be. A mentés nem elérhető.';
}
export function DurableCaseTiles({ caseId, surface, builtin }: {
    caseId: string;
    surface: Surface;
    builtin: CaseTileDescriptor[];
}) {
    const [saved, setSaved] = useState<Snapshot | null>(null);
    const [readState, setReadState] = useState<'loading' | 'error' | 'success'>('loading');
    const [draft, setDraft] = useState<Snapshot | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const [addOpen, setAddOpen] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [menuId, setMenuId] = useState<string | null>(null);
    const [dragId, setDragId] = useState<string | null>(null);
    const [overId, setOverId] = useState<string | null>(null);
    const [moveAnnounce, setMoveAnnounce] = useState('');
    const epoch = useRef(0);
    const dragSession = useRef<{ pointerId: number } | null>(null);
    const url = `/case-workspace/cases/${encodeURIComponent(caseId)}/tiles`;
    useEffect(() => {
        const load = () => {
            const generation = ++epoch.current;
            setReadState('loading');
            setSaved(null);
            setDraft(null);
            setBusy(false);
            setError('');
            setNotice('');
            setAddOpen(false);
            setEditId(null);
            setMenuId(null);
            setDragId(null);
            setOverId(null);
            setMoveAnnounce('');
            void fetchApi<Snapshot>(url).then(value => {
                if (epoch.current === generation) {
                    setSaved(value);
                    setReadState('success');
                }
            }).catch(error => {
                if (epoch.current === generation) {
                    setReadState('error');
                    setError(tileReadError(error));
                }
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
    const refs = view?.placements[surface] ?? builtin.map(t => t.kind);
    const builtinById = new Map(builtin.map(t => [t.kind as string, t]));
    const mutateTile = (id: string, patch: Partial<Tile>) => setDraft(d => d && ({ ...d, tiles: d.tiles.map(t => t.id === id ? { ...t, ...patch } : t) }));
    function move(id: string, to: number) {
        setDraft(d => {
            if (!d)
                return d;
            const order = [...d.placements[surface]];
            const from = order.indexOf(id);
            if (from < 0 || to < 0 || to >= order.length || from === to)
                return d;
            order.splice(from, 1);
            order.splice(to, 0, id);
            return { ...d, placements: { ...d.placements, [surface]: order } };
        });
    }
    function place(id: string, target: Surface, include: boolean) {
        setDraft(d => d && ({ ...d, placements: { ...d.placements, [target]: include ? [...d.placements[target].filter(r => r !== id), id].slice(0, 32) : d.placements[target].filter(r => r !== id) } }));
    }
    function startDrag(event: PointerEvent<HTMLButtonElement>, id: string) {
        if (!draft || busy)
            return;
        dragSession.current = { pointerId: event.pointerId };
        (event.currentTarget as HTMLButtonElement).setPointerCapture?.(event.pointerId);
        setDragId(id);
        setOverId(id);
    }
    function moveDrag(event: PointerEvent<HTMLButtonElement>, id: string) {
        const session = dragSession.current;
        if (!session || session.pointerId !== event.pointerId || !draft || !dragId)
            return;
        const hit = document.elementFromPoint(event.clientX, event.clientY);
        const tileElement = hit?.closest?.('[data-tile-id]') as HTMLElement | null;
        const targetId = tileElement?.getAttribute('data-tile-id');
        if (targetId && targetId !== id) {
            const to = draft.placements[surface].indexOf(targetId);
            if (to >= 0) {
                setOverId(targetId);
                move(id, to);
            }
        }
    }
    function endDrag(event: PointerEvent<HTMLButtonElement>) {
        const session = dragSession.current;
        if (!session || session.pointerId !== event.pointerId)
            return;
        dragSession.current = null;
        setDragId(null);
        setOverId(null);
    }
    function keyboardMove(event: KeyboardEvent<HTMLElement>, id: string, index: number, label: string) {
        if (!draft || busy)
            return;
        let target = index;
        if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
            target = index - 1;
        else if (event.key === 'ArrowDown' || event.key === 'ArrowRight')
            target = index + 1;
        else
            return;
        event.preventDefault();
        const order = draft.placements[surface];
        if (target < 0 || target >= order.length)
            return;
        move(id, target);
        setMoveAnnounce(`${label} áthelyezve a(z) ${target + 1}. helyre.`);
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
            setNotice('A csempék elrendezése mentve.');
            setAddOpen(false);
            setEditId(null);
            setMenuId(null);
            window.dispatchEvent(new CustomEvent('case-tiles-saved', { detail: caseId }));
        }
        catch (error) {
            if (generation === epoch.current) {
                if (error instanceof ApiError && error.status === 409)
                    setError('Az elrendezés időközben megváltozott. A saját módosításaid megmaradtak.');
                else
                    setError('A mentés nem sikerült vagy másik szerkesztés történt. A piszkozat megmaradt. Másolja ki szükség esetén; a Mégse az aktuális mentett állapothoz tér vissza.');
            }
        }
        finally {
            if (generation === epoch.current)
                setBusy(false);
        }
    }
    const hiddenBuiltins = draft ? builtin.filter(t => !draft.placements[surface].includes(t.kind)) : [];
    const hiddenCustom = draft ? draft.tiles.filter(t => !t.archived && !draft.placements[surface].includes(t.id)) : [];
    const archivedCustom = draft?.canManage ? draft.tiles.filter(t => t.archived) : [];
    const editTarget = draft?.canManage && editId ? draft.tiles.find(t => t.id === editId) : null;
    const toolbar = <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--adm-border)] bg-[var(--card-bg)] px-3 py-2">
        <span className="text-sm font-semibold text-[var(--adm-text)]">Csempék szerkesztése</span>
        <span className="text-xs text-[var(--adm-text-muted)]">Húzd a csempéket a kívánt helyre · a mentés csak a saját nézeted elrendezését írja</span>
        <span className="flex-1" />
        <button type="button" className={control} disabled={busy} onClick={() => void save()}>{busy ? 'Mentés…' : 'Mentés'}</button>
        <button type="button" className={control} disabled={busy} onClick={() => { setDraft(null); setError(''); setNotice(''); setAddOpen(false); setEditId(null); setMenuId(null); }}>Mégse</button>
        <div className="relative">
            <button type="button" className={control} disabled={busy} aria-haspopup="menu" aria-expanded={menuId === 'toolbar'} onClick={() => setMenuId(menuId === 'toolbar' ? null : 'toolbar')}>…</button>
            {menuId === 'toolbar' && <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-[var(--adm-border)] bg-white p-1 shadow-lg">
                <button type="button" role="menuitem" className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-[var(--adm-surface)]" disabled={busy} onClick={() => { setDraft(d => d && ({ ...d, placements: { overview: builtin.map(t => t.kind), document: builtin.map(t => t.kind) } })); setMenuId(null); }}>Saját elrendezés alaphelyzetbe</button>
            </div>}
        </div>
    </div>;
    return <section aria-label="Ügykontextus" data-testid="word-case-context" className="space-y-3">
    {readState === 'loading' && <p role="status">Az ügy csempéinek betöltése…</p>}
    {readState === 'success' && !draft && saved && <button type="button" className={control} onClick={() => { setDraft(structuredClone(saved)); setError(''); setNotice(''); }}>Csempék szerkesztése</button>}
    {readState === 'success' && draft && toolbar}
    {error && <p role="alert" className="text-sm text-[var(--adm-text)]">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div aria-live="polite" className="sr-only">{moveAnnounce}</div>
    <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {refs.map((id, index) => {
            const base = builtinById.get(id);
            const custom = view?.tiles.find(t => t.id === id);
            if (custom?.archived && !draft)
                return null;
            const title = base?.title || custom?.title || 'Nem elérhető csempe';
            const tone = base?.tone || custom?.tone || 'info';
            return <article key={id} data-tile-id={id} data-content-ref={base?.contentRef || id} tabIndex={draft ? 0 : undefined}
                onKeyDown={draft ? e => keyboardMove(e, id, index, title) : undefined}
                className={`min-w-0 rounded-lg border-l-4 p-4 ${toneClass[tone]} ${draft ? 'outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--adm-green-800)]' : ''} ${dragId === id ? 'opacity-70 shadow-lg ring-2 ring-[var(--adm-green-800)]' : overId === id ? 'ring-2 ring-dashed ring-[var(--adm-green-800)]' : ''}`}>
          {draft && <div className="mb-2 flex items-center gap-1">
            <button type="button" aria-label={`${title}: áthelyezés húzással`} className={`${control} cursor-grab touch-none`} disabled={busy} onPointerDown={e => startDrag(e, id)} onPointerMove={e => moveDrag(e, id)} onPointerUp={endDrag} onPointerCancel={endDrag}>⋮⋮</button>
            <div className="relative">
              <button type="button" aria-label={`${title}: további műveletek`} aria-haspopup="menu" aria-expanded={menuId === id} className={control} disabled={busy} onClick={() => setMenuId(menuId === id ? null : id)}>…</button>
              {menuId === id && <div role="menu" className="absolute left-0 top-full z-30 mt-1 w-60 rounded-lg border border-[var(--adm-border)] bg-white p-1 shadow-lg">
                <button type="button" role="menuitem" className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-[var(--adm-surface)]" disabled={busy} onClick={() => { place(id, surface, false); setMenuId(null); }}>Elrejtés erről a nézetről</button>
                {custom && draft?.canManage ? <button type="button" role="menuitem" className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-[var(--adm-surface)]" disabled={busy} onClick={() => { setEditId(id); setMenuId(null); }}>Csempe szerkesztése</button> : null}
                {custom && draft?.canManage ? <button type="button" role="menuitem" className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-[var(--adm-surface)]" disabled={busy} onClick={() => {
                    if (custom.archived || window.confirm('A közös csempe archiválása minden felhasználó elrendezésében elrejti. Visszaállítható.'))
                        mutateTile(id, { archived: !custom.archived });
                    setMenuId(null);
                }}>{custom.archived ? 'Közös csempe visszaállítása' : 'Közös csempe archiválása'}</button> : null}
              </div>}
            </div>
          </div>}
          <h3 className="text-sm font-semibold text-[var(--adm-green-800)]">{title}</h3>
          <p className="mt-2 whitespace-pre-line break-words text-sm leading-6">{base?.body ?? custom?.text ?? 'A hivatkozás nem érhető el; nincs helyettesítő tartalom.'}</p>
        </article>;
        })}
    </div>
    {readState === 'success' && draft && <div className="relative">
        <button type="button" className={control} aria-haspopup="dialog" aria-expanded={addOpen} disabled={busy || refs.length >= 32} onClick={() => setAddOpen(v => !v)}>+ Csempe hozzáadása</button>
        {addOpen && <div className="mt-2 w-full max-w-md rounded-lg border border-[var(--adm-border)] bg-white p-2 shadow-lg">
            <p className="px-2 py-1 text-xs text-[var(--adm-text-muted)]">A tartalom közös; az elhelyezés csak Öné.</p>
            {hiddenBuiltins.map(t => <button key={t.kind} type="button" className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-[var(--adm-surface)]" disabled={busy} onClick={() => { place(t.kind, surface, true); setAddOpen(false); }}>{t.title}</button>)}
            {hiddenCustom.map(t => <button key={t.id} type="button" className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-[var(--adm-surface)]" disabled={busy} onClick={() => { place(t.id, surface, true); setAddOpen(false); }}>{t.title || 'Névtelen csempe'}</button>)}
            {archivedCustom.length > 0 && <div className="mt-2 border-t border-[var(--adm-border)] pt-2">
                <p className="px-2 py-1 text-xs font-semibold text-[var(--adm-text-muted)]">Archivált csempék</p>
                {archivedCustom.map(t => <button key={t.id} type="button" className="block w-full rounded px-2 py-2 text-left text-sm hover:bg-[var(--adm-surface)]" disabled={busy} onClick={() => { mutateTile(t.id, { archived: false }); place(t.id, surface, true); setAddOpen(false); }}>{`${t.title || 'Névtelen csempe'} visszaállítása`}</button>)}
            </div>}
            {draft.canManage && <button type="button" className="block w-full rounded px-2 py-2 text-left text-sm font-semibold text-[var(--adm-green-800)] hover:bg-[var(--adm-surface)]" disabled={busy || refs.length >= 32} onClick={() => { const id = crypto.randomUUID(); setDraft(d => d && ({ ...d, tiles: [...d.tiles, { id, revision: 0, title: 'Új csempe', text: '', tone: 'green', archived: false }], placements: { ...d.placements, [surface]: [...d.placements[surface], id] } })); setAddOpen(false); setEditId(id); }}>Új szöveges csempe</button>}
        </div>}
    </div>}
    <ViewportDialog open={Boolean(editTarget)} title="Csempe szerkesztése" onClose={() => { if (!busy) setEditId(null); }} busy={busy} testId="tile-edit-dialog" maxWidth="max-w-lg" footer={<><button type="button" className={control} disabled={busy} onClick={() => setEditId(null)}>Kész</button></>}>
        {editTarget && <>
        <label className="block text-sm">Közös csempe neve<input className={`${control} w-full`} maxLength={120} value={editTarget.title} disabled={busy} onChange={e => mutateTile(editTarget.id, { title: e.target.value })}/></label>
        <label className="mt-3 block text-sm">Közös tartalom<textarea className={`${control} min-h-28 w-full`} maxLength={6000} value={editTarget.text} disabled={busy} onChange={e => mutateTile(editTarget.id, { text: e.target.value })}/></label>
        <label className="mt-3 block text-sm">Szín<select className={control} value={editTarget.tone} disabled={busy} onChange={e => mutateTile(editTarget.id, { tone: e.target.value as Tile['tone'] })}><option value="info">Kék</option><option value="teal">Türkiz</option><option value="green">Zöld</option></select></label>
        </>}
    </ViewportDialog>
  </section>;
}
