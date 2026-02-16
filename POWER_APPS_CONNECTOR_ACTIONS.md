# Power Apps Custom Connector - Műveletek (Actions) Beállítása

## Probléma

Ha az OpenAPI import meghiúsult (localhost miatt), manuálisan kell hozzáadni a műveleteket.

---

## API Végpontok és Művelet Azonosítók

### Authentication (Auth)

| Művelet azonosítója | Verb | URL Path | Description |
|---------------------|------|----------|-------------|
| `Login` | POST | `/api/v1/auth/login` | Bejelentkezés |
| `Register` | POST | `/api/v1/auth/register` | Regisztráció |
| `GetCurrentUser` | GET | `/api/v1/auth/me` | Jelenlegi felhasználó |

### Cases (Ügyek)

| Művelet azonosítója | Verb | URL Path | Description |
|---------------------|------|----------|-------------|
| `GetCases` | GET | `/api/v1/cases` | Ügyek listázása |
| `CreateCase` | POST | `/api/v1/cases` | Új ügy létrehozása |
| `GetCaseById` | GET | `/api/v1/cases/{id}` | Ügy részletei |
| `UpdateCaseStatus` | PATCH | `/api/v1/cases/{id}/status` | Ügy státusz frissítése |
| `GetCaseHistory` | GET | `/api/v1/cases/{id}/history` | Ügy történet |

### Documents (Dokumentumok)

| Művelet azonosítója | Verb | URL Path | Description |
|---------------------|------|----------|-------------|
| `GetDocuments` | GET | `/api/v1/documents` | Dokumentumok listázása |
| `GetDocumentById` | GET | `/api/v1/documents/{id}` | Dokumentum részletei |
| `UploadDocumentVersion` | POST | `/api/v1/documents/{id}/version` | Új verzió feltöltése |
| `GetDocumentVersions` | GET | `/api/v1/documents/{id}/versions` | Verziók listázása |

### Users (Felhasználók)

| Művelet azonosítója | Verb | URL Path | Description |
|---------------------|------|----------|-------------|
| `GetUsers` | GET | `/api/v1/users` | Felhasználók listázása |
| `CreateUser` | POST | `/api/v1/users` | Új felhasználó |
| `GetUserById` | GET | `/api/v1/users/{id}` | Felhasználó részletei |
| `GetUserSkills` | GET | `/api/v1/users/{id}/skills` | Felhasználó skilljei |
| `UpdateUserSkills` | PUT | `/api/v1/users/{id}/skills` | Skill-ek frissítése |

### Clients (Ügyfelek)

| Művelet azonosítója | Verb | URL Path | Description |
|---------------------|------|----------|-------------|
| `GetClients` | GET | `/api/v1/clients` | Ügyfelek listázása |
| `CreateClient` | POST | `/api/v1/clients` | Új ügyfél |
| `GetClientById` | GET | `/api/v1/clients/{id}` | Ügyfél részletei |
| `GetClientRequests` | GET | `/api/v1/clients/{id}/requests` | Ügyfél kérések |

### Messages / Activity (Üzenetek)

| Művelet azonosítója | Verb | URL Path | Description |
|---------------------|------|----------|-------------|
| `GetMessages` | GET | `/api/v1/messages` | Üzenetek listázása |
| `SendMessage` | POST | `/api/v1/messages` | Üzenet küldése |
| `GetActivityFeed` | GET | `/api/v1/messages/feed` | Tevékenység hírfolyam |
| `GetUnreadCount` | GET | `/api/v1/messages/unread` | Olvasatlanok száma |

### Templates (Sablonok)

| Művelet azonosítója | Verb | URL Path | Description |
|---------------------|------|----------|-------------|
| `GetTemplates` | GET | `/api/v1/templates` | Sablonok listázása |
| `CreateTemplate` | POST | `/api/v1/templates` | Új sablon |
| `GetTemplateById` | GET | `/api/v1/templates/{id}` | Sablon részletei |

### **Contracts (Szerződések - ÚJ)**

| Művelet azonosítója | Verb | URL Path | Description |
|---------------------|------|----------|-------------|
| `GetContractTemplates` | GET | `/api/v1/contracts/templates` | Szerződés sablonok |
| `GetContractTemplateById` | GET | `/api/v1/contracts/templates/{id}` | Sablon részletei |
| `GetAdasvetelVariables` | GET | `/api/v1/contracts/templates/adasvetel/variables` | Adásvételi változók |
| `GenerateContract` | POST | `/api/v1/contracts/generate` | Szerződés generálás |
| `GenerateContractPreview` | POST | `/api/v1/contracts/preview` | Előnézet generálás |
| `GetCaseContracts` | GET | `/api/v1/contracts/case/{caseId}` | Ügy szerződései |
| `DownloadContract` | GET | `/api/v1/contracts/{id}/download` | Szerződés letöltés |
| `UploadContractToSharePoint` | POST | `/api/v1/contracts/{id}/upload-sharepoint` | Feltöltés SharePointba |

### Matters (Ügyek - Magasabb szint)

| Művelet azonosítója | Verb | URL Path | Description |
|---------------------|------|----------|-------------|
| `GetMatters` | GET | `/api/v1/matters` | Matters listázása |
| `GetMatterById` | GET | `/api/v1/matters/{id}` | Matter részletei |

### Time Entries (Időnyilvántartás)

| Művelet azonosítója | Verb | URL Path | Description |
|---------------------|------|----------|-------------|
| `GetTimeEntries` | GET | `/api/v1/time-entries` | Időbejegyzések |
| `CreateTimeEntry` | POST | `/api/v1/time-entries` | Új időbejegyzés |

### Client Portal (Ügyfél Portal - Read Only)

| Művelet azonosítója | Verb | URL Path | Description |
|---------------------|------|----------|-------------|
| `GetClientSummary` | GET | `/api/v1/client-portal/summary/{clientId}` | Ügyfél összefoglaló |
| `GetClientDepartments` | GET | `/api/v1/client-portal/departments/{clientId}` | Osztályok |
| `GetClientMatters` | GET | `/api/v1/client-portal/departments/{deptId}/matters` | Matterek |
| `GetClientMatterDetail` | GET | `/api/v1/client-portal/matters/{matterId}` | Matter részlet |
| `GetClientTimeLog` | GET | `/api/v1/client-portal/matters/{matterId}/time-log` | Időnapló |
| `ExportClientData` | GET | `/api/v1/client-portal/export/{clientId}` | Adat export |

---

## Művelet Hozzáadása - Példák

### Login művelet hozzáadása

```
Művelet azonosítója:     Login
Verb:                    POST
URL path:                /api/v1/auth/login
Leírás:                  User login

Request Body:
{
  "email": "string",
  "password": "string"
}

Response - 200:
{
  "accessToken": "string",
  "refreshToken": "string",
  "expiresIn": "integer",
  "user": {
    "id": "integer",
    "email": "string",
    "name": "string",
    "role": "string"
  }
}
```

---

### **GenerateContract művelet hozzáadása (Szerződés generálás)**

```
Művelet azonosítója:     GenerateContract
Verb:                    POST
URL path:                /api/v1/contracts/generate
Leírás:                  Generál egy DOCX szerződést a sablonból
Authorization:          Bearer (accessToken a Login-ból)

Request Body:
{
  "templateId": "string (UUID)",      // Pl: "36a6c212-54f4-4aa9-b042-ffd3ce83b63c"
  "caseId": "string (UUID) OPTIONAL", // Ügy ID ha van
  "title": "string OPTIONAL",          // Pl: "2024-001 - Ingatlan adásvétel"
  "data": {
    // Itt jönnek a sablon változói - típusonként:
    // String típusú:
    "szerzodes_helye": "Budapest",
    "elado_nev": "Kovács János",
    
    // Dátum típusú (YYYY.MM.DD. formátum):
    "szerzodes_datuma": "2025.02.12.",
    "birtokbaadas_datuma": "2025.03.15.",
    
    // Szám típusú:
    "vetelar": 45000000,                // Ft-ban
    "ingatlan_alapterulet": 75,         // m²
    
    // Cím típusú:
    "elado_lakcim": "1123 Budapest, Fő utca 45."
  }
}

Response - 201:
{
  "success": true,
  "document": {
    "id": "string (UUID)",
    "title": "string",
    "fileName": "string.docx",
    "filePath": "string",
    "fileSize": integer,
    "templateId": "string",
    "generatedAt": "string (ISO date)"
  }
}

Response - 400:
{
  "status": 400,
  "code": "GENERATION_FAILED",
  "message": "Hibaüzenet a sablonból"
}
```

---

### **UploadContractToSharePoint művelet hozzáadása**

```
Művelet azonosítója:     UploadContractToSharePoint
Verb:                    POST
URL path:                /api/v1/contracts/{id}/upload-sharepoint
Leírás:                  Feltölti a generált szerződést SharePointba
Authorization:          Bearer (accessToken a Login-ból)

Response - 200:
{
  "success": true,
  "spItemId": "string",
  "spWebUrl": "string"          // SharePoint URL a dokumentumhoz
}

Response - 400:
{
  "status": 400,
  "code": "UPLOAD_FAILED",
  "message": "Hibaüzenet"
}
```

---

## Teljes Lista - Másolásra

```
Login                          POST    /api/v1/auth/login
Register                       POST    /api/v1/auth/register
GetCurrentUser                 GET     /api/v1/auth/me

GetCases                       GET     /api/v1/cases
CreateCase                     POST    /api/v1/cases
GetCaseById                    GET     /api/v1/cases/{id}
UpdateCaseStatus               PATCH   /api/v1/cases/{id}/status
GetCaseHistory                GET     /api/v1/cases/{id}/history

GetDocuments                   GET     /api/v1/documents
GetDocumentById               GET     /api/v1/documents/{id}
UploadDocumentVersion          POST    /api/v1/documents/{id}/version
GetDocumentVersions           GET     /api/v1/documents/{id}/versions

GetUsers                       GET     /api/v1/users
CreateUser                     POST    /api/v1/users
GetUserById                    GET     /api/v1/users/{id}
GetUserSkills                  GET     /api/v1/users/{id}/skills
UpdateUserSkills               PUT     /api/v1/users/{id}/skills

GetClients                     GET     /api/v1/clients
CreateClient                   POST    /api/v1/clients
GetClientById                  GET     /api/v1/clients/{id}
GetClientRequests              GET     /api/v1/clients/{id}/requests

GetMessages                    GET     /api/v1/messages
SendMessage                    POST    /api/v1/messages
GetActivityFeed                GET     /api/v1/messages/feed
GetUnreadCount                 GET     /api/v1/messages/unread

GetTemplates                   GET     /api/v1/templates
CreateTemplate                 POST    /api/v1/templates
GetTemplateById                GET     /api/v1/templates/{id}

**Contracts (Szerződések)**
GetContractTemplates           GET     /api/v1/contracts/templates
GetContractTemplateById        GET     /api/v1/contracts/templates/{id}
GetAdasvetelVariables          GET     /api/v1/contracts/templates/adasvetel/variables
GenerateContract               POST    /api/v1/contracts/generate
GenerateContractPreview        POST    /api/v1/contracts/preview
GetCaseContracts               GET     /api/v1/contracts/case/{caseId}
DownloadContract               GET     /api/v1/contracts/{id}/download
UploadContractToSharePoint     POST    /api/v1/contracts/{id}/upload-sharepoint

GetMatters                     GET     /api/v1/matters
GetMatterById                  GET     /api/v1/matters/{id}

GetTimeEntries                 GET     /api/v1/time-entries
CreateTimeEntry                POST    /api/v1/time-entries

GetClientSummary               GET     /api/v1/client-portal/summary/{clientId}
GetClientDepartments           GET     /api/v1/client-portal/departments/{clientId}
GetClientMatters              GET     /api/v1/client-portal/departments/{deptId}/matters
GetClientMatterDetail          GET     /api/v1/client-portal/matters/{matterId}
GetClientTimeLog              GET     /api/v1/client-portal/matters/{matterId}/time-log
ExportClientData              GET     /api/v1/client-portal/export/{clientId}
```
