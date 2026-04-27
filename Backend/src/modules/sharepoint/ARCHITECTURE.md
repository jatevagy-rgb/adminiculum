# SharePoint Integrációs Architektúra

## Áttekintés

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Adminiculum Backend                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Express.js Server                              │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │  Auth API  │  │ Cases API  │  │ SharePoint │  │  Timeline  │  │   │
│  │  │  /auth     │  │ /cases     │  │   Module   │  │   Module   │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                          │
│            ┌───────────────────────┼───────────────────────┐                 │
│            │                       │                       │                  │
│            ▼                       ▼                       ▼                  │
│     ┌─────────────┐      ┌─────────────┐      ┌─────────────────┐          │
│     │  PostgreSQL │      │ SharePoint  │      │   Timeline      │          │
│     │   (Prisma)  │      │  Graph API  │      │    Events       │          │
│     └─────────────┘      └─────────────┘      └─────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                              HTTPS / REST
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Microsoft 365 / SharePoint                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    SharePoint Online                                 │   │
│  │  /sites/LegalCases/                                                 │   │
│  │  ├── {Case_ID}/                                                    │   │
│  │  │   ├── Contracts/    ←  Szerződések                             │   │
│  │  │   ├── Correspondence/ ←  Levelezés                             │   │
│  │  │   ├── CourtDocuments/ ←  Bírósági dokumentumok                 │   │
│  │  │   ├── Internal/      ←  Belső dokumentumok                     │   │
│  │  │   └── ...                                                        │   │
│  │  └── ...                                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Modul Struktúra

### Fájlok

```
src/modules/sharepoint/
├── index.ts           ← Fő export pont (unified API)
├── graphClient.ts     ← Low-level Graph API client (token caching)
├── driveService.ts    ← High-level document/folder operations
├── types.ts           ← TypeScript interfaces és konstansok
└── ARCHITECTURE.md    ← Ez a dokumentáció
```

### graphClient.ts (Alacsony szintű)

- Access token kezelés és cache
- GET, POST, PUT, PATCH API hívások
- Hibakezelés

### driveService.ts (Magas szintű)

- Dokumentum feltöltés/letöltés
- Mappa létrehozás és kezelés
- Check-out/Check-in
- Verziókezelés
- Anonymizált dokumentumok
- Dokumentum keresés

## Adatfolyamok

### 1. Dokumentum Feltöltés (Szerződés generálás)

```
┌────────────┐     1. POST /api/v1/cases/:id/generate     ┌────────────┐
│   Frontend │ ─────────────────────────────────────────────▶ │  Cases API │
└────────────┘                                              └──────┬─────┘
                                                                   │
                                                   2. DocumentGenerator
                                                                   │
                                                                   ▼
┌────────────┐     3. uploadDocument()            ┌─────────────────────────┐
│   Backend  │ ─────────────────────────────────▶ │  SharePoint DriveService │
└────────────┘                                    └───────────┬─────────────┘
                                                                 │
                                                                 │ Graph API
                                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SharePoint Online                               │
│  PUT /sites/LegalCases/drive/root:/CASE-001/Contracts/contract.pdf:/content │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Lépések:**
1. Frontend kéri a dokumentum generálást
2. Backend legenerálja a dokumentumot
3. `driveService.uploadDocument()` feltölti SharePoint-ra
4. Visszaadja a SharePoint URL-t

### 2. Review Folymat

```
┌────────────┐     1. review-requested     ┌─────────────────────────────┐
│   Frontend │ ───────────────────────────▶ │  SharePoint DriveService    │
└────────────┘                             │  checkoutDocument()         │
                                           └──────────────┬──────────────┘
                                                          │
                                                          │ Graph API
                                                          ▼
                                           ┌───────────────────────────────┐
                                           │    SharePoint Check-out       │
                                           │    (Dokumentum zárolása)     │
                                           └───────────────┬───────────────┘
                                                           │
                                                           ▼
                                           ┌───────────────────────────────┐
                                           │  User szerkeszti a          │
                                           │  SharePoint-on               │
                                           └───────────────┬───────────────┘
                                                           │
                                                           ▼
                                           ┌───────────────────────────────┐
                                           │  checkinDocument()            │
                                           │  (Új verzió létrehozása)     │
                                           └───────────────┬───────────────┘
```

### 3. Timeline Szinkronizáció

```
┌────────────┐     TimelineEvent      ┌────────────┐
│   Backend  │ ─────────────────────▶ │ PostgreSQL │
└────────────┘                        └────────────┘
       │
       │ driveService.uploadDocument()
       │ driveService.checkoutDocument()
       │ driveService.checkinDocument()
       │
       ▼
┌────────────┐     TimelineEvent      ┌────────────────────┐
│   Backend  │ ─────────────────────▶ │  SharePoint + DB   │
└────────────┘                        └────────────────────┘
```

## Integrációs Pontok

### 1. Prisma Séma + SharePoint Kapcsolat

```prisma
model Case {
  id              String   @id
  caseNumber      String   @unique
  title           String
  
  // SharePoint hivatkozások
  sharePointFolderPath String?  // /sites/LegalCases/{caseId}/
  sharePointSiteId     String?
  
  // Relációk
  documents       CaseDocument[]
  timelineEvents  TimelineEvent[]
}

model CaseDocument {
  id                String   @id
  caseId            String
  
  // SharePoint integráció
  sharePointUrl     String?   // https://.../Documents/contract.pdf
  sharePointItemId  String?   // SharePoint Item ID
  sharePointDriveId String?
  sharePointVersion Int?      // Verziószám
  
  // Metaadatok
  name              String
  mimeType          String
  status            DocumentStatus @default(DRAFT)
  version           Int           @default(1)
  
  case              Case    @relation(fields: [caseId], references: [id])
}
```

### 2. Szinkronizáció Szabályai

| Esemény | SharePoint Művelet | Database Művelet |
|---------|-------------------|------------------|
| Szerződés generálás | Új fájl létrehozása | `CaseDocument` + `TimelineEvent` |
| Review kérése | Check-out | `checkOutUserId` frissítés |
| Jóváhagyás | Check-in + verzió | `TimelineEvent` |
| Új verzió | Új verzió feltöltése | `CaseDocument.version++` |

### 3. Mappa Struktúra Konvenciók

```
/sites/LegalCases/
└── {caseNumber}/
    ├── {YYYY-MM-DD}_{documentName}.pdf
    │
    ├── 01_Client_Input/
    │   └── Ügyfél által feltöltött dokumentumok
    │
    ├── 02_Drafts/
    │   └── Szerződés tervezetek
    │
    ├── 03_Review/
    │   └── Review-ra küldött dokumentumok
    │
    ├── 04_Approved/
    │   └── Jóváhagyott verziók
    │
    ├── 05_Sent_to_Client/
    │   └── Ügyfélnek kiküldött verziók
    │
    ├── 06_Client_Feedback/
    │   └── Ügyfél visszajelzései
    │
    ├── 07_Final/
    │   └── Véglegesített dokumentumok
    │
    └── 08_Internal_Notes/
        └── Belső megjegyzések
```

## Biztonsági Megfontolások

### 1. Azure AD App Registration

- **Client Credentials Flow**: Server-to-server kommunikáció
- **Szükséges jogosultságok**:
  - `Sites.ReadWrite.All` - Drive műveletekhez
  - `User.Read.All` - Felhasználó információkhoz

### 2. Token Kezelés

```typescript
// graphClient.ts - Access Token Cache
class GraphClientService {
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  async getAccessToken(): Promise<string> {
    // Ellenőrzi a cache-t
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }
    // Új token kérése ha lejárt
    // ...
  }
}
```

### 3. Jogosultságkezelés SharePoint-ban

- SharePoint csoportokon keresztül
- Öröklődő jogosultságok case szinten
- Role-based access (LAWYER, TRAINEE, stb.)

## Tesztelés

### 1. Unit Tesztek

```typescript
// driveService.test.ts
describe('DriveService', () => {
  it('should upload document to SharePoint', async () => {
    const result = await driveService.uploadDocument({
      caseId: 'CASE-001',
      fileName: 'test.pdf',
      content: Buffer.from('test content'),
      mimeType: 'application/pdf',
    });
    
    expect(result.success).toBe(true);
    expect(result.webUrl).toContain('CASE-001');
  });
});
```

### 2. Integrációs Tesztek

- Graph API endpoint tesztelés Mock serverrel
- SharePoint műveletek tesztelése teszt site-on

## Konfiguráció

### Környezeti változók (.env)

```bash
# Azure AD
AZURE_CLIENT_ID=xxx-xxx-xxx
AZURE_CLIENT_SECRET=xxx
AZURE_TENANT_ID=xxx

# SharePoint
SHAREPOINT_SITE_ID=xxx
SHAREPOINT_DRIVE_ID=xxx
```

### Azure Portal Beállítások

1. **App Registration létrehozása**
2. **API Permissions** hozzáadása:
   - Microsoft Graph → `Sites.ReadWrite.All`
   - Microsoft Graph → `User.Read.All`
3. **Client Secret** generálása
4. **SharePoint Site** hozzáférés biztosítása
