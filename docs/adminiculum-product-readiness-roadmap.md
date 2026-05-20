# Adminiculum Product Readiness Roadmap

Dátum: 2026-05-20
Források:
- `docs/adminiculum-backend-capability-matrix.md`
- `docs/adminiculum-design-bible.md`
- `docs/adminiculum-expanded-feature-board-inventory.md`

## 1. Current truth
- Az Adminiculum már most is jelentős, moduláris legal-ops platform: ügyek, dokumentumtár, szerződés-workspace, módosított munkapéldány, anonimizálás/rehidratálás, kommunikáció, feladatok, munkaórák, timesheet riport, house style, leadási csomag, clause-library, review-notes, workflow, SharePoint integráció.
- A fő hiány nem „funkciók hiánya”, hanem: **felszínre hozás, összekötés, és production hardening**.
- A pilot-ready állapot leginkább integrációs és stabilizációs feladat, nem greenfield fejlesztés.

## 2. Target product state
Azure-on futó, SharePoint-alapú, kollégák által napi használatban pilotként bevezethető Adminiculum, amely:
- konzisztens magyar legal-ops munkapad UX-et ad,
- valós dokumentum- és workflow-életciklust kezel,
- megbízható Azure AD + role-aware auth-tal működik,
- SharePoint műveletekben üzembiztos (hibaágak, visszajelzés, monitorozás),
- auditálható (timeline/esemény),
- és őszinte, no-fake működést kommunikál.

## 3. What already exists
- **Domain mag**: Case/Task/Document/Timeline/Communication/TimeEntry/Matter/Workgroup modellek.
- **Dokumentum pipeline**: upload, text extraction, workspace mentés, review, handoff előkészítés.
- **AI-adjacent workflow**: prompt-copy, anonimizálás, rehidratálás, legal analysis intake.
- **Workflow engine**: státuszátmenet-validáció, workflow graph/history, timeline eventing.
- **Clause és assembly alapok**: clause CRUD + recommendation + assembly draft.
- **Timesheet rendszer**: presetek, report instance/artifact, DOCX render útvonal.
- **SharePoint modul**: Graph kliens + drive service (upload/download/move/folder/version).

## 4. What needs surfacing
- Notification modell backendbe kötése (valós in-app értesítési központ).
- Legal analysis, handoff package és clause-library mélyebb, önállóbb operatív felülete.
- Document search/classification, deadline extraction és review queue képességek erősebb UI-felszínre hozása.
- Settings és UI pack backend-kapcsolat fokozatos aktiválása (nem csak local-state).

## 5. What needs integration
- Route- és navigációs konzisztencia a fő workflow mentén:
  ügy áttekintő ↔ dokumentumtár ↔ workspace ↔ kommunikáció ↔ munkaórák ↔ review.
- Case-aware kontextus átadása minden releváns felületre.
- Task/review/communication/deadline összekötések egységesítése.
- Handoff, legal analysis, clause és review-notes együttműködésének UI-szintű tisztítása.

## 6. What needs production hardening
- Auth konszolidáció (`auth.ts` + `azureAdAuth.ts` policy egységesítés).
- SharePoint hibakezelés és observability (structured error, retry policy, diagnosztika).
- Env/config egyszerűsítés (legacy és új credential minták tisztítása).
- Feature-flag governance (staging/prod mátrix).
- Timeline/event taxonómia normalizálás az auditálhatóság érdekében.

## 7. Azure + SharePoint readiness plan
1. **Identity baseline**
- Azure AD audience/issuer policy fixálása környezetenként.
- App Registration + permission set (minimum: `Sites.ReadWrite.All`, `Files.ReadWrite.All`) és admin consent ellenőrzés.

2. **Config baseline**
- Canonical env profile per environment (dev/staging/prod).
- Startup config health + secret rotation policy dokumentálása.

3. **SharePoint reliability**
- SP smoke test script (upload/download/move/version/folder).
- Binary letöltési és részleges hibaágak keményítése.
- SP diagnostics endpoint (config + reachability + capability check).

4. **Operational safety**
- E2E business smoke: case → docs → workspace → save copy → handoff.
- Incident playbook: auth hiba, SP hiba, migration hiba.

## 8. Pilot readiness checklist
- [ ] Azure AD auth flow validálva (token, role, me endpoint, fallback policy)
- [ ] SharePoint app permission + consent + smoke test PASS
- [ ] Core workflow E2E PASS (ügytől handoffig)
- [ ] Notification minimum működik (lista + olvasott/jelöletlen)
- [ ] Settings source-of-truth policy rögzítve (local vs backend)
- [ ] Observability baseline aktív (API hibák, SP hibák, workflow hibák)
- [ ] Migration/deploy runbook staging dry-run PASS
- [ ] UX consistency pass lezárva a top workflow oldalakra

## 9. Sprint roadmap
### Sprint 1 — Surfacing baseline
- Notification backend minimal API + frontend bekötés.
- Review queue és deadline signal UX tisztítás.
- Handoff és legal analysis felületek operatív egységesítése.

### Sprint 2 — Integration baseline
- Case-aware navigációs összekötések teljesítése.
- Document search/classification/deadline extraction felszínre hozása.
- Settings backend bridge (UI pack + policy jelölések).

### Sprint 3 — Hardening baseline
- Auth middleware konszolidáció.
- SharePoint diagnostics + binary hibaág hardening.
- Timeline/event taxonomy normalizáció.

### Sprint 4 — Pilot stabilization
- E2E regressziós smoke készlet.
- Pilot UX polish pass (design bible szerinti finomítás).
- Deployment/playbook véglegesítés + go/no-go checklist.

## 10. Recommended next 20 patches
1. Notification module: `GET /notifications`, `PATCH /notifications/:id/read`, unread count.
2. Frontend notifications page átállítása persisted Notification forrásra.
3. Auth middleware consolidation (`auth.ts` és `azureAdAuth.ts` összehangolás).
4. Azure audience/issuer config policy tisztítás és dokumentálás.
5. SharePoint diagnostics endpoint (token/site/drive capability check).
6. SharePoint download binary path hardening + egységes hibakódok.
7. Structured error envelope bevezetése SP-kapcsolt endpointokra.
8. Feature-flag matrix dokumentáció és environment gate-ek.
9. Workflow event taxonomy normalizáció (`eventType/type/payload`).
10. Handoff package standalone page a panel mellé.
11. Legal analysis queue/overview page.
12. Clause-library operational board (usage + lifecycle).
13. Review queue filter/owner/action polish.
14. Deadline board extraction-intent visibility bővítés.
15. Document search UI bekötés a ledger/workspace flow-ba.
16. Document classification UI surfacing (őszinte, no-fake jelölésekkel).
17. Settings backend bridge a UI pack és alap policy elemekhez.
18. Case-aware cross-route backlink szabványosítás.
19. E2E smoke scripts a fő workflow-ra (CI-barát).
20. Pilot go-live checklist és incident runbook véglegesítés.

---

## Roadmap fő üzenet
Az Adminiculum alapcapability-jei már nagyrészt rendelkezésre állnak; a pilothoz vezető út fókusza a meglévő modulok **felszínre hozása, konzisztens összekötése, és production-grade hardeningje** Azure + SharePoint környezetben.
