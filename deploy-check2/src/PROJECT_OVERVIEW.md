# Adminiculum Backend - Projekt Áttekintés

## Alapinformációk

- **Név:** Adminiculum Backend
- **Technológia:** Node.js + TypeScript + Express.js
- **Adatbázis:** PostgreSQL (Prisma ORM)
- **Fő funkció:** Ügyvédi iroda dokumentumkezelő rendszer

## Projekt Struktúra

```
backend/
├── src/
│   ├── index.ts              ← Entry point
│   ├── config/               ← Konfiguráció
│   │   ├── database.ts       ← Prisma database connection
│   │   └── jwt.ts            ← JWT authentication config
│   ├── middleware/
│   │   └── auth.ts           ← JWT token validation
│   ├── modules/              ← Funkcionális modulok
│   │   ├── anonymize/       ← AI dokumentum anonimizálás
│   │   ├── auth/             ← Felhasználó auth (login/register)
│   │   ├── cases/            ← Ügyek kezelése
│   │   ├── documents/        ← Dokumentumok kezelése
│   │   ├── settings/         ← Beállítások
│   │   ├── sharepoint/       ← SharePoint integráció
│   │   ├── tasks/            ← Feladatok
│   │   └── users/            ← Felhasználók kezelése
│   ├── routes/               ← Legacy routes
│   └── utils/                ← Helper funkciók
├── prisma/
│   ├── schema.prisma         ← Adatbázis séma
│   └── seed.ts               ← Seed script
├── uploads/                  ← Lokális fájl feltöltések
├── .env                      ← Környezeti változók
├── package.json
└── swagger.yaml              ← API dokumentáció
```

## Modulok Állapota

### ✅ Meglévő Funkciók

| Modul | Állapot | Leírás |
|-------|----------|--------|
| Auth | Kész | JWT alapú autentikáció, login/logout/register |
| Users | Kész | Felhasználó CRUD, szerepkörök |
| Cases | Kész | Ügyek létrehozása, lista, részletek |
| Documents | Kész | Dokumentum feltöltés, letöltés, verziók |
| SharePoint | Egységesítve | Microsoft Graph API integráció |
| Tasks | Kész | Feladatok kezelése |
| Anonymize | Részleges | AI anonimizálás (API kulcs szükséges) |

### SharePoint Integráció (FRISSÍTVE)

**Fájlok:**
- `graphClient.ts` - Low-level Graph API kliens (token caching)
- `driveService.ts` - High-level dokumentum műveletek
- `types.ts` - TypeScript interfészek
- `ARCHITECTURE.md` - Architektúra dokumentáció

### **Workflow Engine v1 (ÚJ)** 🎯

**Cél:** A státuszváltások legyenek a rendszer központi vezérlője.

**Fájlok:**
```
src/modules/workflow/
├── workflow.types.ts     ← Statusok, átmenetek, típusok
├── workflow.service.ts  ← Központi workflow motor
└── index.ts             ← Export pont
```

**Státusz gép:**
```
CLIENT_INPUT → DRAFT → IN_REVIEW → APPROVED → SENT_TO_CLIENT → CLIENT_FEEDBACK → FINAL → CLOSED
```

**Minden státuszváltás automatikusan csinálja:**
1. ✅ TimelineEvent létrehozás
2. ✅ Dokumentumok mozgatása SharePoint-ban
3. ✅ Adatbázis metaadat frissítés

**Új Endpoint-ok:**
- `GET /cases/:caseId/workflow-graph` - Workflow térkép (nodes + edges)
- `GET /cases/:caseId/workflow-history` - Státusz történet
- `PATCH /cases/:caseId/status` - Státuszváltás (workflow engine-en keresztül)

**Automatizáció:**
- Dokumentum feltöltés →自动 TimelineEvent létrehozás

**Fő funkciók:**
- Dokumentum feltöltés/letöltés
- Mappa struktúra létrehozás (8 almappás workflow)
- Check-out/Check-in dokumentumokhoz
- Verziókezelés
- Anonymizált dokumentumok kezelése
- Dokumentum keresés

## Adatbázis (Prisma)

**Fő entitások:**
- `User` - Felhasználók (szerepkörök: ADMIN, LAWYER, TRAINEE, CLIENT)
- `Case` - Ügyek (caseNumber, title, client, státusz)
- `CaseDocument` - Dokumentumok SharePoint linkkel
- `TimelineEvent` - Ügy idővonala események
- `Task` - Feladatok

## API Végpontok

### Auth (`/api/v1/auth`)
- `POST /login` - Bejelentkezés
- `POST /register` - Regisztráció
- `POST /refresh` - Token refresh

### Cases (`/api/v1/cases`)
- `GET /` - Ügyek listája
- `POST /` - Új ügy létrehozása
- `GET /:id` - Ügy részletek
- `PATCH /:id` - Ügy módosítása
- `DELETE /:id` - Ügy törlése

### Documents (`/api/v1/documents`)
- `POST /upload` - Dokumentum feltöltés
- `GET /:id` - Dokumentum letöltés
- `GET /:id/versions` - Verziók

### SharePoint (`/api/v1/sharepoint`)
- `POST /folders` - Case mappa struktúra létrehozás
- `GET /documents/:caseId` - Case dokumentumok

## Konfiguráció (.env)

```bash
# Database
DATABASE_URL="postgresql://..."

# JWT
JWT_SECRET="..."
JWT_EXPIRES_IN="1h"

# SharePoint (Microsoft Graph API)
SP_TENANT_ID="..."
SP_CLIENT_ID="..."
SP_CLIENT_SECRET="..."
SP_SITE_ID="..."
SP_DRIVE_ID="..."

# AI (opcionális)
OPENAI_API_KEY="..."
CLAUDE_API_KEY="..."
```

## Telepítés és Futtatás

```bash
# Dependencies telepítése
npm install

# Adatbázis migráció
npx prisma migrate dev

# Seed adatok
npx prisma db seed

# Fejlesztői szerver indítása
npm run dev
```

## Azure AD / SharePoint Beállítások

1. **App Registration létrehozása** (Azure Portal)
2. **API Permissions:**
   - `Sites.ReadWrite.All`
   - `Files.ReadWrite.All`
   - `User.Read.All`
3. **Client Secret** generálása
4. **Site ID és Drive ID** meghatározása (Graph Explorer)

## Mi Kell Még?

1. **Frontend** - Nincs implementálva (csak backend)
2. **Dokumentum generálás** - Szerződés sablonok kezelése
3. **Timeline szinkronizáció** - SharePoint események → DB
4. **Teljes workflow** - Check-out/in integráció
5. **Tesztek** - Unit és integrációs tesztek hiányoznak

## Technikai Követelmények

- Node.js 18+
- PostgreSQL 14+
- TypeScript 5+
- npm vagy yarn

## Kapcsolódó Dokumentációk

- [API Documentation](src/API_DOCUMENTATION.md)
- [SharePoint Architecture](src/modules/sharepoint/ARCHITECTURE.md)
- [Testing Guide](TESTING.md)
- [SharePoint Setup](POWER_APPS_FULL_SETUP.md)
