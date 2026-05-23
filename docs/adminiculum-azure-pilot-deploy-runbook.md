# Adminiculum Azure Pilot Deploy Runbook

Dátum: 2026-05-23  
Scope: belső pilot deploy (staging + pilot production baseline)

## 1. Cél és hatókör

Ez a runbook az Adminiculum Azure pilot telepítésének minimum biztonságos menete:
- build és típusellenőrzés,
- env beállítás canonical nevekkel,
- DB migrációs sorrend,
- post-deploy smoke ellenőrzés,
- rollback/troubleshooting kiindulópontok.

No-secrets policy:
- Secret csak Azure App Settings / Key Vault.
- Repo fájlokban kizárólag placeholder szerepelhet.

## 2. Javasolt architektúra (pilot)

1. Frontend:
- Next.js app külön Azure App Service-en (Linux, Node 20).
- Alternatíva: SWA + Next hosting, de jelen állapotban App Service egyszerűbb.

2. Backend:
- Külön Azure App Service (Linux, Node 20).
- API: `/api/v1/*`.

3. Adatbázis:
- Azure Database for PostgreSQL (vagy meglévő managed PostgreSQL).
- Prisma migrations deploy módban.

4. Identity:
- Azure AD / Entra App Registration.
- Backend audience/issuer validáció.

5. SharePoint:
- Graph application permissions (`Sites.ReadWrite.All`, `Files.ReadWrite.All`, ajánlott `User.Read.All`).
- Admin consent kötelező.

6. Hálózat/CORS:
- Backend `CORS_ALLOWED_ORIGINS` explicit frontend domainekkel.
- Frontend `NEXT_PUBLIC_BACKEND_BASE_URL` backend hostra állítva.

## 3. Production build audit

| Csomag | Script | Mire jó | Azure-ready? | Megjegyzés |
|---|---|---|---|---|
| Backend | `npm run build` | TypeScript -> `dist/` | Igen | `tsc` build |
| Backend | `npm run start` | API indítás productionban | Igen | `node dist/index.js` |
| Backend | `npm run db:deploy` | Prisma migration deploy | Igen | production-safe |
| Backend | `npm run db:generate` | Prisma client generálás | Igen | migrate után futtassuk |
| Frontend | `npm run build` | Next production build | Igen | App Service kompatibilis |
| Frontend | `npm run start` | Next production runtime | Igen | `-p 3000` |
| Root | `npm run build` | Backend build wrapper | Részben | frontendre nem vonatkozik |

## 4. Env checklist (required/optional/legacy)

### Backend required
- `NODE_ENV=production`
- `PORT` (App Service runtime adja, default fallback van)
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `AZURE_AD_TENANT_ID`
- `AZURE_AD_AUDIENCE`
- `CORS_ALLOWED_ORIGINS`
- `SP_TENANT_ID`
- `SP_CLIENT_ID`
- `SP_CLIENT_SECRET`
- `SP_DRIVE_ID` (erősen ajánlott)
- `SP_SITE_ID` vagy `SHAREPOINT_SITE_URL`

### Backend optional
- `FRONTEND_ORIGIN`, `FRONTEND_URL` (CORS fallback)
- `SP_ROOT_FOLDER` (ha használjátok)
- feature flag-ek (`ENABLE_*`)

### Backend legacy fallback (átmeneti)
- `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` (SharePoint legacy)
- `SP_SITE_URL`
- `SHAREPOINT_SITE_ID`, `SHAREPOINT_DRIVE_ID`

### Frontend required
- `NEXT_PUBLIC_BACKEND_BASE_URL`
- `NEXT_PUBLIC_ENTRA_TENANT_ID`
- `NEXT_PUBLIC_ENTRA_CLIENT_ID`
- `NEXT_PUBLIC_ADMINICULUM_API_SCOPE`

### Frontend optional
- `NEXT_PUBLIC_ENTRA_AUTHORITY`
- `NEXT_PUBLIC_ENTRA_REDIRECT_URI`
- `NEXT_PUBLIC_ENTRA_POST_LOGOUT_REDIRECT_URI`
- `NEXT_PUBLIC_ENABLE_UI_PACKS`

### Frontend legacy fallback
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_AZURE_TENANT_ID`
- `NEXT_PUBLIC_AZURE_CLIENT_ID`
- `NEXT_PUBLIC_AZURE_REDIRECT_URI`

### Local only (NE production)
- `NEXT_PUBLIC_ENABLE_LOCAL_DEV_AUTH`
- `NEXT_PUBLIC_DEV_LOGIN_EMAIL`
- `NEXT_PUBLIC_DEV_LOGIN_PASSWORD`
- dev starter port-páros: frontend `3000`, backend `3001`

## 5. Prisma migration deploy terv

Deploy sorrend (backend):
1. `npm ci`
2. `npm run build`
3. `npm run db:status`
4. `npm run db:deploy`
5. `npm run db:generate`
6. `npm run start`

Mit ne csináljunk productionban:
- ne `prisma migrate dev`
- ne `prisma db push` (kivéve kontrollált, üres dev környezet)
- ne DB reset
- ne seedelj fake/demo adatot véletlenül

Migration ellenőrzés:
- `npm run db:status` legyen up-to-date.
- backend `/health` ne legyen config-degraded kritikus okokkal.

## 6. Deployment lépések (staging -> pilot)

### Backend App Service
1. App Settings feltöltése (backend required env-ek).
2. Build/deploy artifact (`dist` + runtime deps).
3. Startup command: `npm run start` (vagy platform default).
4. Health check: `GET /health`.

### Frontend App Service
1. App Settings feltöltése (frontend required env-ek).
2. Build/deploy (`next build` output).
3. Startup: `npm run start`.
4. Frontend elérés és login flow ellenőrzés.

### CORS ellenőrzés
1. Backend env: `CORS_ALLOWED_ORIGINS=https://<frontend-domain>`
2. Böngészőben login + dashboard, CORS hiba nélkül.

## 7. Azure smoke checklist (blocker/non-blocker)

### Backend smoke
1. `GET {backend}/health`
- Elvárt: JSON + status.
- Blocker: 5xx / unreachable.
- Tipikus ok: App Settings hiány, DB elérés hiba.

2. `GET {backend}/api/v1/auth/me` (valid bearer)
- Elvárt: user context.
- Blocker: 401/500 minden valid tokenre.
- Tipikus ok: audience/issuer/env mismatch.

3. `GET {backend}/api/v1/sharepoint/diagnostics` (valid bearer)
- Elvárt: structured diagnostics.
- Blocker: 500 vagy secret-szivárgás.
- Tipikus ok: SP credential/site/drive hiba.

4. `GET {backend}/api/v1/notifications/unread-count` (valid bearer)
- Elvárt: JSON unreadCount.
- Non-blocker: 0 unread.

5. `POST /api/v1/documents` (teszt fájl)
- Elvárt: rekord + SP linkage.
- Blocker: rendszeres 5xx.

6. `GET /api/v1/documents/{id}/download`
- Elvárt: binary response helyes filename-nel.
- Blocker: strukturált hiba helyett random 500.

7. `GET /api/v1/cases/{caseId}/handoff-packages`
- Elvárt: lista/üres lista.
- Non-blocker: üres adat.

8. `GET /api/v1/tasks/my/tasks` (review queue alap)
- Elvárt: task lista.
- Blocker: auth/runtime hiba.

### Frontend smoke
1. `{frontend}/` login
2. Dashboard
3. `/cases`
4. `/cases/{caseId}`
5. `/cases/{caseId}/documents`
6. `/documents/compare?caseId={caseId}`
7. `/cases/{caseId}/communications`
8. `/time-entries?caseId={caseId}`
9. `/cases/{caseId}/handoff`
10. `/reviews`
11. `/notifications`
12. `/clients`
13. `/clause-library`
14. `/settings`

Blocker példa:
- route 500, üres shell, auth loop, CORS error, mentés/feltöltés kritikus hiba.
Non-blocker példa:
- üres lista valid „nincs adat” állapottal.

## 8. Rollback / troubleshooting röviden

1. Backend rollback:
- előző stabil release redeploy.
- env változások visszaállítása.

2. Frontend rollback:
- előző stabil build redeploy.

3. Első diagnosztika:
- backend logs + `/health`
- `/api/v1/sharepoint/diagnostics`
- auth me endpoint
- CORS origin beállítás ellenőrzése

## 9. Ajánlott futtatási sorrend release előtt

Local/CI verifikáció:
1. `cd Backend && npx tsc --noEmit`
2. `cd Frontend && npx tsc --noEmit`
3. `cd Backend && npm run build`
4. `cd Frontend && npm run build`
5. `git diff --check`
6. staging deploy + smoke
7. pilot deploy + smoke

## 10. GitHub CI preflight quality gate

Workflow:
- `.github/workflows/preflight.yml`
- Trigger: `push`, `pull_request`

Mit ellenőriz:
1. Backend:
- `npm ci`
- `npx prisma generate`
- `npx prisma validate`
- `npx tsc --noEmit`
- `npm run build`

2. Frontend:
- `npm ci`
- `npm run build`
- `npx tsc --noEmit` (build után, mert `.next/types` ekkor stabil)

Mit NEM csinál:
- nem deployol Azure-ra
- nem futtat `prisma migrate deploy`
- nem használ production secretet
- nem módosít adatbázist

CI env policy:
- csak dummy/non-secret env értékek
- production URL/tenant/client secret nincs beégetve
