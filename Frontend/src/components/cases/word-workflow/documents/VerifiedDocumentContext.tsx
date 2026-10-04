"use client";
import { useEffect, useRef, useState } from 'react';
import { fetchApi, getDocumentVersions, type DocumentVersionItem } from '@/lib/api';
import { resolveVerifiedDocumentPrompt, buildDirectRiskMatrixPrompt, type VerifiedDocumentContextDto } from '../tools/safeContextAdapter';
export function VerifiedDocumentContext({ caseId, clientId, documents, readOnly, onCreated }: {
    caseId: string;
    clientId: string | null;
    documents: {
        id: string;
        fileName?: string | null;
    }[];
    readOnly: boolean;
    onCreated?: () => void;
}) {
    const [documentId, setDocumentId] = useState('');
    const [versionId, setVersionId] = useState('');
    const [versions, setVersions] = useState<DocumentVersionItem[]>([]);
    const [phrases, setPhrases] = useState('');
    const [context, setContext] = useState<VerifiedDocumentContextDto | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [fallback, setFallback] = useState('');
    const [message, setMessage] = useState('');
    const epoch = useRef(0);
    const scope = useRef('');
    const nextScope = `${caseId}:${clientId}:${documentId}:${versionId}`;
    if (scope.current !== nextScope) { scope.current = nextScope; ++epoch.current; }
    useEffect(() => { ++epoch.current; setDocumentId(''); setVersionId(''); setContext(null); setFallback(''); setPhrases(''); setBusy(false); setMessage(''); setError(''); }, [caseId, clientId]);
    useEffect(() => () => { ++epoch.current; }, []);
    useEffect(() => {
        const n = ++epoch.current;
        setVersions([]);
        setVersionId('');
        setContext(null);
        setFallback('');
        setError('');
        if (documentId)
            void getDocumentVersions(documentId).then(r => {
                if (n === epoch.current)
                    setVersions(r.versions);
            }).catch(() => {
                if (n === epoch.current)
                    setError('A verziók nem tölthetők be.');
            });
        return () => { ++epoch.current; };
    }, [documentId]);
    const selected = versions.find(v => v.id === versionId);
    const cls = 'min-h-10 min-w-10 rounded border px-3 py-2';
    async function generate() {
        const current = scope.current;
        const operation = ++epoch.current;
        setBusy(true);
        setError('');
        setContext(null);
        setFallback('');
        try {
            const r = await fetchApi<VerifiedDocumentContextDto>(`/documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/anonymize-verified`, { method: 'POST', body: JSON.stringify({ extraPhrases: phrases.split('\n').map(p => p.trim()).filter(Boolean) }) });
            if (current !== scope.current || operation !== epoch.current)
                return;
            if (r.caseId !== caseId || r.clientId !== clientId || r.sourceDocumentId !== documentId || r.sourceDocumentVersionId !== versionId)
                throw Error('Scope mismatch');
            setContext(r);
            onCreated?.();
        }
        catch {
            if (current === scope.current && operation === epoch.current)
                setError('Az ellenőrzött anonimizálás nem érhető el. A semleges promptváz továbbra is használható.');
        }
        finally {
            if (current === scope.current && operation === epoch.current)
                setBusy(false);
        }
    }
    async function copy() {
        if (!context)
            return;
        const current = scope.current;
        const operation = ++epoch.current;
        setBusy(true);
        setError('');
        setMessage('');
        setFallback('');
        try {
            const verified = await resolveVerifiedDocumentPrompt(context, { caseId, clientId, documentId });
            if (current !== scope.current || operation !== epoch.current)
                return;
            const text = buildDirectRiskMatrixPrompt({ caseId, clientId, documentId, sanitizedContext: verified });
            if (!verified)
                throw Error('Unverified context');
            try {
                await navigator.clipboard.writeText(text);
                if (current === scope.current && operation === epoch.current)
                    setMessage('A prompt a vágólapra került.');
            }
            catch {
                if (current === scope.current && operation === epoch.current)
                    setFallback(text);
            }
        }
        catch {
            if (current === scope.current && operation === epoch.current)
                setError('Az átadás újraellenőrzése sikertelen. Nincs másolt háttérszöveg.');
        }
        finally {
            if (current === scope.current && operation === epoch.current)
                setBusy(false);
        }
    }
    return <section aria-label="Verzióhoz kötött külső AI-kontextus" className="space-y-3 rounded-lg border border-[var(--adm-border)] bg-white p-4"><h3 className="font-semibold">Verzióhoz kötött külső AI-kontextus</h3><div className="flex flex-wrap gap-3"><label>Forrásdokumentum <select className={cls} value={documentId} disabled={busy} onChange={e => { setDocumentId(e.target.value); setContext(null); setFallback(''); }}><option value="">Válasszon dokumentumot</option>{documents.map(d => <option key={d.id} value={d.id}>{d.fileName || 'Dokumentum'}</option>)}</select></label><label>Pontos forrásverzió <select className={cls} value={versionId} disabled={busy || !documentId} onChange={e => { setVersionId(e.target.value); setContext(null); setFallback(''); }}><option value="">Válasszon verziót</option>{versions.map(v => <option key={v.id} value={v.id}>v{v.versionNumber}{v.isCurrent ? ' · aktuális' : ' · korábbi'}</option>)}</select></label></div>{selected && !selected.isCurrent && <p role="status">Korábbi verziót választott. Az újabb verzió nem helyettesíti ezt a forrást.</p>}
 {!readOnly && <><label className="block text-sm">További kitakarandó kifejezések (soronként egy; új műpéldány készül)<textarea className={`${cls} block w-full`} maxLength={10000} value={phrases} disabled={busy} onChange={e => { setPhrases(e.target.value); setContext(null); setFallback(''); }}/></label><button type="button" className={cls} disabled={busy || !selected || selected.securityScanStatus !== 'CLEAN'} onClick={() => void generate()}>{busy ? 'Ellenőrzés…' : 'Kiválasztott verzió anonimizálása'}</button></>}
 {error && <p role="alert">{error}</p>}{context && <><p>Forrás: v{context.sourceVersionNumber} · szerver által ellenőrzött verziókötés</p><p>{context.notice}</p><label className="block">Kimenő anonimizált tartalom ellenőrzése<textarea className={`${cls} block min-h-48 w-full`} readOnly value={context.sanitizedText}/></label><button type="button" className={cls} disabled={busy} onClick={() => void copy()}>Ellenőrzött kockázati prompt másolása</button></>}{message && <p role="status">{message}</p>}{fallback && <label className="block">A vágólap nem érhető el. Ugyanez az ellenőrzött prompt kézzel másolható.<textarea className={`${cls} block min-h-48 w-full`} readOnly value={fallback}/></label>}<p className="text-sm">A másolás nem küld AI-kérést. Az eredmény ügyvédi ellenőrzést igénylő munkairat.</p></section>;
}
