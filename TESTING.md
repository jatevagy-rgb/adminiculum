# Tesztelési Útmutató

## 1. Előfeltételek

### 1.1 Környezeti változók (.env)

Másold a `.env.example` fájlt `.env`-re és töltsd ki:

```bash
cd ../lwp/backend
copy .env.example .env
```

A `.env` fájl tartalma:

```env
# Database (PostgreSQL)
DATABASE_URL="postgresql://user:password@localhost:5432/adminiculum"

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="7d"

# Server
PORT=3000
NODE_ENV=development

# Azure AD / SharePoint (opcionális - teszteléshez nem szükséges)
AZURE_CLIENT_ID=""
AZURE_CLIENT_SECRET=""
AZURE_TENANT_ID=""
SHAREPOINT_SITE_ID=""
SHAREPOINT_DRIVE_ID=""
```

### 1.2 Adatbázis létrehozása

```bash
# PostgreSQL adatbázis létrehozása (ha még nem létezik)
createdb adminiculum

# Prisma schema push (táblák létrehozása)
npx prisma db push

# Seed data betöltése (teszt felhasználók)
npx prisma db seed
```

## 2. Backend Indítása

### 2.1 Fejlesztői mód (auto-reload)

```bash
cd ../lwp/backend

# npm start vagy
npm run dev
```

Kimenet:
```
🚀 Adminiculum API V2 running on http://localhost:3000
```

### 2.2 Ellenőrzés

Nyisd meg a böngészőben:
```
http://localhost:3000/health
```

Válasz:
```json
{"status":"healthy","timestamp":"2026-02-09T12:00:00.000Z"}
```

## 3. API Tesztelés

### 3.1 Bejelentkezés

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lawyer@adminiculum.com","password":"password123"}'
```

Válasz:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "...",
    "email": "lawyer@adminiculum.com",
    "name": "Lawyer User",
    "role": "LAWYER"
  }
}
```

### 3.2 Felhasználók lekérése (auth required)

```bash
curl -X GET http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

### 3.3 Cases API Tesztelés

#### Új case létrehozása:

```bash
curl -X POST http://localhost:3000/api/v1/cases \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Teszt Ügy - Minta Szerződés",
    "description": "Ez egy teszt ügy a rendszer teszteléséhez",
    "clientName": "Teszt Kft.",
    "matterType": "CONTRACT",
    "practiceArea": "Civil Law"
  }'
```

Válasz:
```json
{
  "id": "...",
  "caseNumber": "CASE-2026-001",
  "title": "Teszt Ügy - Minta Szerződés",
  "status": "IN_PROGRESS",
  "createdAt": "2026-02-09T12:00:00.000Z"
}
```

#### Case listázása:

```bash
curl -X GET http://localhost:3000/api/v1/cases \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

#### Timeline lekérése:

```bash
curl -X GET http://localhost:3000/api/v1/cases/<CASE_ID>/timeline \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

### 3.4 Settings API Tesztelés

```bash
curl -X GET http://localhost:3000/api/v1/settings/ui \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

## 4. SharePoint Integráció Tesztelése

### 4.1 Konfiguráció ellenőrzése

```bash
cd ../lwp/backend
node -e "
const { graphClient } = require('./src/modules/sharepoint');
console.log('Configured:', graphClient.isConfigured());
"
```

### 4.2 Graph API tesztelés (ha konfigurálva van)

```bash
# SharePoint site lekérése
curl -X GET http://localhost:3000/api/v1/sharepoint/site \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

### 4.3 Ha nincs SharePoint konfiguráció

A SharePoint modul ilyenkor console warning-ot ír, de az API működik.

## 5. Teszt Felhasználók

| Email | Role | Jelszó |
|-------|------|---------|
| lawyer@adminiculum.com | LAWYER | password123 |
| associate@adminiculum.com | COLLAB_LAWYER | password123 |
| trainee@adminiculum.com | TRAINEE | password123 |
| assistant@adminiculum.com | LEGAL_ASSISTANT | password123 |

## 6. Gyakori Hibák és Megoldások

### 6.1 "Connection refused" (3000-es port)

```bash
# Ellenőrizd, hogy fut-e a szerver
netstat -ano | findstr :3000

# Ha igen, állítsd le és indítsd újra
taskkill /PID <PID> /F
npm run dev
```

### 6.2 "Database connection failed"

```bash
# Ellenőrizd a PostgreSQL-t
pg_isready -U postgres

# Vagy indítsd újra a PostgreSQL-t
net start postgresql-x64-15
```

### 6.3 "JWT token invalid"

```bash
# Ellenőrizd a JWT_SECRET-ot a .env-ben
# Generálj új secrets-t ha kell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 7. Teljes Teszt Script (PowerShell)

```powershell
# Futtatás a backend mappából

# 1. Health check
Invoke-RestMethod -Uri "http://localhost:3000/health"

# 2. Login
$login = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"lawyer@adminiculum.com","password":"password123"}'

$token = $login.accessToken

# 3. Get cases
Invoke-RestMethod -Uri "http://localhost:3000/api/v1/cases" `
  -Method GET `
  -Headers @{Authorization="Bearer $token"}

# 4. Create case
$case = Invoke-RestMethod -Uri "http://localhost:3000/api/v1/cases" `
  -Method POST `
  -ContentType "application/json" `
  -Headers @{Authorization="Bearer $token"} `
  -Body '{"title":"PowerShell Teszt","clientName":"Teszt Kft.","matterType":"CONTRACT"}'

Write-Host "Created case: $($case.caseNumber)"
```

## 8. Következő Lépések

1. **SharePoint konfigurálása** - Azure AD App Registration létrehozása (`AzureAD-AppRegistration.ps1`)
2. **Frontend integráció** - UI frissítése az új API-hoz
3. **Dokumentum generálás** - Word template alapú generátor
4. **AI funkciók** - Dokumentum elemzés integráció

---

## 9. Workflow Engine Tesztelés

### 9.1 Státuszváltás Tesztelése

```bash
# Token beszerzése
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"lawyer@adminiculum.com","password":"password123"}' | \
  jq -r '.accessToken')

# Státuszváltás CLIENT_INPUT -> DRAFT
curl -X PATCH http://localhost:3000/api/v1/cases/<CASE_ID>/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "DRAFT", "comment": "Teszt státuszváltás"}'
```

**Elvárt válasz:**
```json
{
  "success": true,
  "caseId": "...",
  "fromStatus": "CLIENT_INPUT",
  "toStatus": "DRAFT",
  "documentsMoved": 3,
  "message": "Status changed from CLIENT_INPUT to DRAFT"
}
```

### 9.2 Workflow Graph Lekérése

```bash
curl -X GET http://localhost:3000/api/v1/cases/<CASE_ID>/workflow-graph \
  -H "Authorization: Bearer $TOKEN"
```

**Elvárt válasz:**
```json
{
  "nodes": [
    { "id": "CLIENT_INPUT", "label": "Ügyfél adat", "status": "completed" },
    { "id": "DRAFT", "label": "Szerződés tervezet", "status": "current" },
    { "id": "IN_REVIEW", "label": "Review", "status": "pending" }
  ],
  "edges": [
    { "from": "CLIENT_INPUT", "to": "DRAFT" }
  ],
  "currentStatus": "DRAFT",
  "possibleTransitions": ["IN_REVIEW", "CLIENT_INPUT"]
}
```

### 9.3 Role-Based Guard Tesztelés

**TRAINEE felhasználóval (korlátozott jogok):**
```bash
# TRAINEE token beszerzése
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"trainee@adminiculum.com","password":"password123"}' | \
  jq -r '.accessToken')

# TRIEE nem vihet FINAL státuszba
curl -X PATCH http://localhost:3000/api/v1/cases/<CASE_ID>/status \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "FINAL"}'
```

**Elvárt válasz (hiba):**
```json
{
  "status": 400,
  "code": "WORKFLOW_ERROR",
  "message": "User role 'TRAINEE' cannot transition to 'FINAL'. Allowed: DRAFT, IN_REVIEW"
}
```

## 10. SharePoint Integráció Tesztelése

### 10.1 Konfiguráció Ellenőrzése

```bash
# Backend mappából
cd ../Adminiculum
node -e "
const { graphClient } = require('./src/modules/sharepoint');
console.log('SharePoint Configured:', graphClient.isConfigured());
console.log('Config:', JSON.stringify(graphClient.getConfig(), null, 2));
"
```

### 10.2 Azure AD App Registration (ha még nincs)

```powershell
# PowerShell 7+ - futtatás rendszergazdaként
cd ../Adminiculum
.\AzureAD-AppRegistration.ps1
```

**Output:**
```
========================================
  Adminiculum - Azure AD App Registration v2
========================================
[1/5] Checking prerequisites...
[2/5] Connecting to Azure AD...
[3/5] Creating or retrieving App...
[4/5] Creating Client Secret...
[5/5] Assigning API Permissions...
========================================
  Azure AD App Provisioning Completed
========================================
   Tenant ID:    xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   App ID:       xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   Client Secret: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
========================================
```

### 10.3 SharePoint Mappa Létrehozás Tesztelése

```bash
curl -X POST http://localhost:3000/api/v1/sharepoint/folders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"caseId": "CASE-2026-001", "caseName": "Teszt Ügy"}'
```

**Elvárt válasz:**
```json
{
  "success": true,
  "mainFolder": { "id": "...", "name": "CASE-2026-001 - Teszt Ügy" },
  "subfolders": [
    { "id": "...", "name": "01_Client_Input" },
    { "id": "...", "name": "02_Drafts" },
    { "id": "...", "name": "03_Review" }
  ],
  "path": "/Cases/CASE-2026-001 - Teszt Ügy"
}
```

## 11. Automatizált End-to-End Tesztek

### 11.1 Teljes Workflow Teszt Script (bash)

```bash
#!/bin/bash
# Futtatás: bash test-workflow.sh

BASE_URL="http://localhost:3000"
EMAIL="lawyer@adminiculum.com"
PASSWORD="password123"

echo "========================================"
echo "  Adminiculum Workflow E2E Tests"
echo "========================================"

# 1. Login
echo ""
echo "[1/6] Login..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.accessToken')
echo "   Token: ${TOKEN:0:20}..."

# 2. Create Case
echo ""
echo "[2/6] Create Case..."
CASE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/cases" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clientName":"Teszt Kft.","matterType":"CONTRACT"}')
CASE_ID=$(echo $CASE_RESPONSE | jq -r '.id')
CASE_NUMBER=$(echo $CASE_RESPONSE | jq -r '.caseNumber')
echo "   Case: $CASE_NUMBER (ID: $CASE_ID)"

# 3. Get Workflow Graph
echo ""
echo "[3/6] Get Workflow Graph..."
WORKFLOW_GRAPH=$(curl -s -X GET "$BASE_URL/api/v1/cases/$CASE_ID/workflow-graph" \
  -H "Authorization: Bearer $TOKEN")
echo "   Current Status: $(echo $WORKFLOW_GRAPH | jq -r '.currentStatus')"

# 4. Status Change: CLIENT_INPUT -> DRAFT
echo ""
echo "[4/6] Status Change: CLIENT_INPUT -> DRAFT..."
STATUS_CHANGE=$(curl -s -X PATCH "$BASE_URL/api/v1/cases/$CASE_ID/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"DRAFT","comment":"E2E teszt státuszváltás"}')
echo "   Success: $(echo $STATUS_CHANGE | jq -r '.success')"

# 5. Status Change: DRAFT -> IN_REVIEW
echo ""
echo "[5/6] Status Change: DRAFT -> IN_REVIEW..."
STATUS_CHANGE2=$(curl -s -X PATCH "$BASE_URL/api/v1/cases/$CASE_ID/status" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"IN_REVIEW","comment":"Review-ra küldés"}')
echo "   Success: $(echo $STATUS_CHANGE2 | jq -r '.success')"

# 6. Get Workflow History
echo ""
echo "[6/6] Get Workflow History..."
HISTORY=$(curl -s -X GET "$BASE_URL/api/v1/cases/$CASE_ID/workflow-history" \
  -H "Authorization: Bearer $TOKEN")
echo "   Events: $(echo $HISTORY | jq '. | length')"

echo ""
echo "========================================"
echo "  E2E Tests Completed Successfully"
echo "========================================"
```

## 12. Tesztelési Checklista

| Teszt | Státusz | Megjegyzés |
|-------|---------|------------|
| Health check | ☐ |
| Auth (login) | ☐ |
| Create case | ☐ |
| Get cases list | ☐ |
| Get case details | ☐ |
| Timeline events | ☐ |
| Workflow graph | ☐ |
| Status change (LAWYER) | ☐ |
| Status change (TRAINEE) | ☐ |
| SharePoint connection | ☐ | Ha konfigurálva |
| Create SP folders | ☐ | Ha konfigurálva |
| Upload document | ☐ |
| Document upload → Timeline | ☐ |
