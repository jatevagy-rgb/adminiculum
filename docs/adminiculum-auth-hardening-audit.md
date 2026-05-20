# Adminiculum Auth Hardening Audit

## 1. Current auth flows
- `Backend/src/middleware/auth.ts` az elsődlegesen használt middleware (`authenticate`) a route-okban.
- `authenticate` hibrid módon próbál:
  1. Azure AD JWT validáció JWKS-sel
  2. fallback saját JWT (`jwtConfig.secret`)
- `Backend/src/middleware/azureAdAuth.ts` külön hibrid middleware (`hybridAuth`) hasonló céllal, de eltérő implementációval.
- `Backend/src/modules/auth/routes.ts`:
  - `POST /auth/login` saját email+jelszó alapú tokenkibocsátás
  - `GET /auth/me` Azure esetben `getMeByClaims`, egyébként `getMe`
  - `POST /auth/refresh`, `POST /auth/logout`
  - `POST /auth/register` DEV/TEST only jelöléssel, de aktív route

## 2. Local/dev auth
- Saját JWT flow működik (`auth/services.ts`): `login`, `refresh`, `logout`.
- Nem production módban van local dev bootstrap login (`DEV_LOGIN_EMAIL`/`DEV_LOGIN_PASSWORD`) auto-user provisioninggel.
- Erős kockázat: `users/services.ts` `createUser()` fix default jelszót állít (`password123`).
- `auth/routes.ts` register route nyitott, ha nincs külön környezetből tiltva.

## 3. Azure AD / Entra auth
- Két eltérő middleware létezik (`auth.ts` és `azureAdAuth.ts`), eltérő:
  - JWKS URL
  - issuer/audience kezelés
  - request user shape
- `auth.ts` használatban van; `azureAdAuth.ts` inkább párhuzamos, redundáns implementáció.
- `auth.ts` Azure claim-ekből `userId`-t `oid || sub`-ból épít, emailt több claimből.
- `auth/services.ts` Azure user mapping: `id` szerinti lookup, majd email szerinti fallback, opcionális auto-provision.

## 4. Token audience/issuer policy
Fő inkonzisztenciák:
- `auth.ts`:
  - env: `AZURE_AD_TENANT_ID`, `AZURE_AD_AUDIENCE`
  - issuer: v2 + legacy v1
  - audience fallback: hardcoded `DEFAULT_AUDIENCES` (kockázatos)
  - JWKS URI: `.../{tenant}/discovery/v2.0/keys`
- `azureAdAuth.ts`:
  - env: `AZURE_TENANT_ID`, `AZURE_AD_ALLOWED_AUDIENCES || AZURE_AD_AUDIENCE || AZURE_CLIENT_ID`
  - issuer validáció külön try/catch ágban
  - JWKS URI: `.../{tenant}/v2.0/.well-known/jwks`

Javasolt policy:
- Egyetlen tenant env: `AZURE_AD_TENANT_ID`
- Egyetlen audience env: `AZURE_AD_AUDIENCE` (CSV)
- Issuer allowlist: kizárólag adott tenant v2 + szükség esetén legacy v1
- Hardcoded fallback audience-ek eltávolítása productionban

## 5. User mapping strategy
Jelenlegi:
- Azure tokenből `userId = oid || sub`, email preferencia-lánc alapján.
- DB lookup: `id` alapján, majd `email` alapján.
- Auto-provision opcionális (`ENABLE_AZURE_AD_AUTO_PROVISION`).

Hardening javaslat:
- Elsődleges külső azonosító: `oid` (Entra object id), dedikált mezőben tárolva (`azureObjectId`) a User modellen.
- Email csak másodlagos fallback (email változhat).
- Auto-provision csak explicit engedéllyel és korlátozott default role-lal.
- Provision audit log kötelező (ki/mikor/honnan).

## 6. Role strategy
Jelenlegi eltérések:
- `auth.ts` Role típus: `LAWYER | COLLAB_LAWYER | TRAINEE | LEGAL_ASSISTANT | ADMIN`
- `auth/services.ts` UserRole tartalmaz: `PARTNER | CLIENT | EXTERNAL_REVIEWER` is.
- Azure token role claim közvetlen cast, validáció nélkül.

Hardening javaslat:
- Központi role map (shared konstans), explicit claim->app role mapping.
- Ismeretlen Azure role esetén: deny vagy minimális least-privilege role (pl. `LEGAL_ASSISTANT`) policy szerint.
- `requireRole` és üzleti szabályok ugyanarra a központi role-definícióra álljanak.

## 7. Risks
1. Dupla middleware miatt eltérő auth viselkedés (production drift).
2. Hardcoded default audience-ek elfedhetik rossz env konfigurációt.
3. Túl részletes token/debug logok auth middleware-ben (header/payload/kid) információszivárgási kockázat.
4. Request `user` shape inkonzisztens (`role` vs `roles`, azure flag eltérő mezőn).
5. Email-alapú user mapping collision kockázat (rename/alias esetek).
6. `POST /auth/register` aktív route production exposure kockázattal.
7. `users/createUser` fix default jelszó súlyos biztonsági kockázat.
8. Role enum mismatch miatt authorization bypass/lockout edge case-ek.
9. Tenant env duplikáció (`AZURE_TENANT_ID` vs `AZURE_AD_TENANT_ID`) hibalehetőség.
10. Nincs egységes auth diagnostics endpoint (config/issuer/audience állapotra).

## 8. Proposed consolidation plan
Cél: egyetlen auth middleware + egységes token policy + stabil user mapping.

Konszolidált célállapot:
- Egy middleware export (`authenticate`) és opcionális `requireRole`.
- Azure validáció egyetlen helyen, egységes JWKS+issuer+audience policy-val.
- Custom JWT fallback megtartható dev/staging kompatibilitásra, de explicit feature flag-gel productionban.
- Egységes request user contract:
  - `userId`
  - `email`
  - `role`
  - `authProvider: 'azure-ad' | 'local-jwt'`
  - `azureObjectId?`

## 9. Step-by-step safe implementation patches
1. **Audit patch**
- Logold ki (nem secret) startupban: tenant set, audience count, provider mode.
- Adj auth diagnostics read-only endpointot adminnak (secret nélkül).

2. **Middleware unification patch**
- `azureAdAuth.ts` deprecate, `auth.ts` legyen single source.
- Egységes JWKS endpoint és env kulcsok.

3. **Audience/issuer hardening patch**
- Hardcoded `DEFAULT_AUDIENCES` eltávolítás productionban.
- Fail-fast, ha productionban nincs `AZURE_AD_TENANT_ID` vagy `AZURE_AD_AUDIENCE`.

4. **Request user contract patch**
- Típusos, közös `AuthenticatedUser` interface.
- Minden route/service ezt használja (`userId`, `role`, `authProvider`).

5. **Role mapping patch**
- Központi role map modul.
- Azure claim role normalizáció és explicit fallback policy.

6. **User mapping hardening patch**
- User modellhez `azureObjectId` bevezetése (migrációval külön patchben).
- Lookup elsődlegesen `azureObjectId`, email csak fallback.

7. **Provisioning guard patch**
- `ENABLE_AZURE_AD_AUTO_PROVISION` mellé allowlist/domain kontroll.
- Provision event audit trail.

8. **Dev endpoint hardening patch**
- `POST /auth/register` route dev-only gate (`NODE_ENV !== 'production'`) vagy teljes eltávolítás.
- `users/createUser` random egyszer használatos jelszó + reset flow.

9. **Logging hardening patch**
- Token payload debug logok eltávolítása productionban.
- Structured security log minimális claim mezőkkel.

10. **Regression/security verification patch**
- E2E tesztek: Azure valid token, invalid issuer, invalid audience, expired token, custom JWT fallback.
- Role authorization tesztek kritikus endpointokra.
