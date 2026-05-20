# Adminiculum E2E Smoke Checklist (Pilot)

Dátum: 2026-05-20
Scope: manuális smoke teszt a fő legal-ops workflow-ra (no-fake elvvel)

Használat:
- Minden lépésnél töltsd ki a `Pass`/`Fail` mezőt.
- `Fail` esetén rövid hiba-leírás és reprodukciós infó kötelező.

## 1) Login
- Route: `/login`
- Elvárt eredmény: sikeres bejelentkezés után dashboard/app shell betölt.
- Failure jel: 401/403, loop, üres shell, hibás user context.
- Screenshot needed?: Yes
- Pass: [ ]  Fail: [ ]

## 2) Ügyfél kiválasztás / létrehozás
- Route: `/clients` (és ha van: `/clients/[clientId]`)
- Elvárt eredmény: ügyfél lista betölt; meglévő ügyfél kiválasztható; új ügyfél menthető valós API-val.
- Failure jel: lista üres hiba nélkül, mentés sikertelen, UI-state nem frissül.
- Screenshot needed?: Yes
- Pass: [ ]  Fail: [ ]

## 3) Új ügy létrehozás
- Route: `/cases?newCase=1` vagy `/cases?newCase=1&clientId={clientId}`
- Elvárt eredmény: modal megnyílik; kötelező mezők validálnak; ügy létrejön és megjelenik a listában.
- Failure jel: create hiba, hibás route-redirect, case nem látszik refresh után sem.
- Screenshot needed?: Yes
- Pass: [ ]  Fail: [ ]

## 4) Munkaterv beállítás
- Route: új ügy modal (Cases lista kontextus)
- Elvárt eredmény: preset/saját útvonal menthető; felelős sorrend megmarad; case detailen visszalátszik.
- Failure jel: route builder elveszti sorrendet, taskok nem jönnek létre, enum/raw adat látszik.
- Screenshot needed?: Yes
- Pass: [ ]  Fail: [ ]

## 5) Dokumentum feltöltés
- Route: `/cases/{caseId}/documents`
- Elvárt eredmény: fájl feltölthető; dokumentum megjelenik ledgerben; hiba esetén értelmes üzenet.
- Failure jel: upload spinner beragad, dokumentum nem jelenik meg, SharePoint hiba néma.
- Screenshot needed?: Yes
- Pass: [ ]  Fail: [ ]

## 6) Dokumentumtár ellenőrzés
- Route: `/cases/{caseId}/documents`
- Elvárt eredmény: 3 szekció (feltöltött, módosított munkapéldány, generált/módosított) konzisztens; aktív panel működik.
- Failure jel: rossz kategorizálás, hibás action hierarchy, raw enum (`MODIFIED_WORKING_COPY`) látható.
- Screenshot needed?: Yes
- Pass: [ ]  Fail: [ ]

## 7) Workspace megnyitás
- Route: `/documents/compare?caseId={caseId}` (opcionálisan `&documentId={documentId}`)
- Elvárt eredmény: dokumentum-szöveg betölt; workspace header/backlinkek működnek; nincs törött compare panel.
- Failure jel: üres editor, query kezelés hibás, TypeScript/runtime hiba.
- Screenshot needed?: Yes
- Pass: [ ]  Fail: [ ]

## 8) Anonimizálás
- Route: workspace/dokumentumtár anonimizálás flow
- Elvárt eredmény: anonimizálás indítható a valós endpointon; siker esetén anonim tartalom elérhető.
- Failure jel: fake success, nincs valós eredmény, hibás forrásdokumentum hivatkozás.
- Screenshot needed?: Yes
- Pass: [ ]  Fail: [ ]

## 9) Prompt copy workflow
- Route: workspace (AI prompt panel)
- Elvárt eredmény: prompt/anonimizált szöveg másolható; UI őszintén jelzi, hogy külső AI-ba másolás történik.
- Failure jel: automatikus AI futás látszata, félrevezető „lefutott” státusz.
- Screenshot needed?: Yes
- Pass: [ ]  Fail: [ ]

## 10) Legal analysis import
- Route: workspace / documents legal analysis intake felület
- Elvárt eredmény: külső AI-ból visszahozott elemzés rögzíthető; kapcsolódik a dokumentumhoz.
- Failure jel: mentés nélkül „kész” státusz, hibás dokumentum-kapcsolás.
- Screenshot needed?: Yes
- Pass: [ ]  Fail: [ ]

## 11) Módosított munkapéldány mentés
- Route: `/documents/compare?caseId={caseId}`
- Elvárt eredmény: mentés új/kapcsolt `MODIFIED_WORKING_COPY` rekordként történik; eredeti dokumentum változatlan.
- Failure jel: eredeti felülírása, fake Word track changes, hibás helper szöveg.
- Screenshot needed?: Yes
- Pass: [ ]  Fail: [ ]

## 12) Review queue
- Route: `/reviews` és `/cases/{caseId}/review/{documentId}`
- Elvárt eredmény: review-ra váró elemek listázódnak; „Review megnyitása” működik.
- Failure jel: törött route, raw státusz enum, fake batch approve.
- Screenshot needed?: Yes
- Pass: [ ]  Fail: [ ]

## 13) Kommunikáció
- Route: `/cases/{caseId}/communications`
- Elvárt eredmény: kommunikációs napló betölt; új belső jegyzet menthető; follow-up panel működik.
- Failure jel: fake chat üzenetek, mentés nélkül megjelenő tartalom, enum megjelenés.
- Screenshot needed?: Yes
- Pass: [ ]  Fail: [ ]

## 14) Munkaóra rögzítés
- Route: `/time-entries?caseId={caseId}`
- Elvárt eredmény: case-aware banner helyes; bejegyzés menthető; lista frissül.
- Failure jel: rossz ügy/munkacsomag kötés, preset gomb auto-save-el, mentési hiba.
- Screenshot needed?: Yes
- Pass: [ ]  Fail: [ ]

## 15) Leadási csomag
- Route: `/cases/{caseId}/handoff`
- Elvárt eredmény: HandoffPackagePanel betölt; belső review-warning látszik; státuszfrissítés valós endpointtal.
- Failure jel: fake approval/export benyomás, hibás státuszváltás, üres hiba nélküli panel.
- Screenshot needed?: Yes
- Pass: [ ]  Fail: [ ]

## 16) SharePoint ellenőrzés
- Route: backend diagnostics: `/api/v1/sharepoint/diagnostics` (auth), UI oldalak: documents/workspace
- Elvárt eredmény: diagnostics strukturált választ ad (`configured/siteResolvable/driveResolvable`); upload/download életút működik.
- Failure jel: secret kiszivárgás, 500 diagnosztikában, site/drive feloldás hibák.
- Screenshot needed?: Yes
- Pass: [ ]  Fail: [ ]

## 17) Notifications (ha elérhető)
- Route: `/notifications`
- Elvárt eredmény: dedikált notification API-ból lista; unread badge; mark read / mark all read működik.
- Failure jel: fake aggregált feed, hibás unread count, read action nem perzisztál.
- Screenshot needed?: Yes
- Pass: [ ]  Fail: [ ]

---

## Összesítés
- Pilot smoke eredmény: Pass [ ]  Fail [ ]
- Kritikus blokkolók száma: ____
- Magas prioritású hibák száma: ____
- Következő javító patch(ek): ____________________________________________
- Tesztelő neve / dátum: _________________________________________________
