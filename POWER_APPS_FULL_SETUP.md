# Power Apps Custom Connector - Teljes Beállítási Útmutató

## 1. Environment Ellenőrzés

1. Menj a Power Platform: https://make.powerapps.com
2. Nézd meg jobb felső sarokban az **Environment** mezőt
3. Válaszd azt, ahol a Power App fut (pl. "Bálintfy és Társai Ügyvédi Iroda (default)")
4. Győződj meg róla, hogy az appod látható az **Apps** menüben

---

## 2. Custom Connector Létrehozása

1. **Bal oldali menü** → **Egyéni összekötők**
2. **New custom connector** → **Create from blank**
3. **Név:** `Adminiculum API Connector`
4. Mentés, hogy a **General** / **Security** fül aktiválódjon

---

## 3. General / Általános Információk

| Mező | Érték |
|------|-------|
| **Icon** | PNG/JPG (<1MB) |
| **Icon background color** | #007ee5 |
| **Description** | "Connector for Adminiculum API integration with SharePoint" |
| **Host** | `adminiculumaustriaeast-01.azurewebsites.net` |
| **Base URL** | `/` |

---

## 4. Security / Hitelesítés (OAuth 2.0)

| Mező | Érték |
|------|-------|
| **Authentication type** | OAuth 2.0 |
| **Identity provider** | Azure Active Directory |
| **Client ID** | `a1e8b8a0-7690-4d09-9974-e4742d3de4e9` |
| **Client secret** | `<YOUR_CLIENT_SECRET>` |
| **Authorization URL** | `https://login.microsoftonline.com/18b56834-dfea-4931-bdf8-e5ebb0cb4e0f/oauth2/v2.0/authorize` |
| **Token URL** | `https://login.microsoftonline.com/18b56834-dfea-4931-bdf8-e5ebb0cb4e0f/oauth2/v2.0/token` |
| **Tenant ID** | `18b56834-dfea-4931-bdf8-e5ebb0cb4e0f` |
| **Resource URL** | `api://a1e8b8a0-7690-4d09-9974-e4742d3de4e9` |
| **Scope** | `api://a1e8b8a0-7690-4d09-9974-e4742d3de4e9/access_as_user` |
| **Enable on-behalf-of login** | `false` |

### Fontos:
- A **Scope NEM `.default`**, hanem `api://<client-id>/access_as_user`
- A **Tenant ID NEM `common`**, hanem a tényleges tenant ID

---

## 5. Azure Portal - Redirect URI Beállítása

### 5.1 Ugrás az Azure Portalra

1. Nyisd meg: https://portal.azure.com
2. Navigálj: **Azure Active Directory** → **App registrations**
3. Válaszd ki: `Adminiculum-SharePoint` (vagy az app neve)

### 5.2 Redirect URI Hozzáadása

1. Kattints: **Authentication** (bal menü)
2. Kattints: **Add URI**
3. Add hozzá:
   ```
   https://global.consent.azure-apim.net/redirect/adminiculum-api
   ```
4. Kattints: **Save**

### 5.3 Token Config (ha szükséges)

1. Kattints: **Token configuration** (bal menü)
2. **Add optional claim** → **ID token**
3. Adj hozzá: `upn`, `email`

---

## 6. Definition / API Végpontok

### 6.1 Login Művelet

| Mező | Érték |
|------|-------|
| **Operation ID** | `Login` |
| **Verb** | `POST` |
| **URL** | `/api/v1/auth/login` |

**Request Body:**
```json
{
  "email": { "type": "string" },
  "password": { "type": "string" }
}
```

**Response (200):**
```json
{
  "accessToken": { "type": "string" },
  "user": {
    "id": { "type": "string" },
    "email": { "type": "string" },
    "name": { "type": "string" },
    "role": { "type": "string" }
  }
}
```

### 6.2 OpenAPI Import (Ajánlott)

Ha van OpenAPI spec, importálhatod:
1. **Definition** fül
2. **Import from URL** vagy **Import from file**
3. URL: `https://adminiculumaustriaeast-01.azurewebsites.net/api/v1/openapi.json`

### 6.3 Gyakori Endpoint-ok

| # | Művelet | Verb | URL Path |
|---|---------|------|----------|
| 1 | Login | POST | /api/v1/auth/login |
| 2 | GetCases | GET | /api/v1/cases |
| 3 | CreateCase | POST | /api/v1/cases |
| 4 | GetCaseById | GET | /api/v1/cases/{id} |
| 5 | GetDocuments | GET | /api/v1/documents |
| 6 | GetUsers | GET | /api/v1/users |
| 7 | GetClients | GET | /api/v1/clients |
| 8 | GetContracts | GET | /api/v1/contracts |

---

## 7. Test / Tesztelés

1. **Mentés** → **Test** fül
2. **Create new connection**
3. OAuth flow lefut → bejelentkezés az irodai user-rel

### Token Ellenőrzés:
- `aud` = `a1e8b8a0-7690-4d09-9974-e4742d3de4e9`
- `scope` = `api://a1e8b8a0-7690-4d09-9974-e4742d3de4e9/access_as_user`

### Gyakori Hibák:

| Hiba | Megoldás |
|------|----------|
| "AADSTS50011 - Redirect URI mismatch" | Adj hozzá redirect URI-t az Azure Portalon |
| "AADSTS700016 - Application not found" | Ellenőrizd a Client ID-t |
| "AADSTS7000215 - Invalid client secret" | Ellenőrizd a secret-et |
| Scope hiba | Használd: `api://<client-id>/access_as_user` |
| Environment hiba | Ellenőrizd, hogy a megfelelő environment van kiválasztva |

---

## 8. Power App Használata

A connector létrehozása után:

1. **Power Apps** → **Apps** → Új app
2. **Data** → **Connectors** → `Adminiculum API Connector`
3. Használd a connector-t pl. `AdminiculumAPI.Login(...)`

---

## 9. Alternatív Megoldás (Egyszerűbb)

Ha az OAuth 2.0 nem működik, használhatsz **API Key** authentication-t:

| Mező | Érték |
|------|-------|
| **Authentication type** | API Key |
| **Key header name** | `Authorization` |
| **Key value** | `Bearer <jwt-token>` |

Vagy **No Authentication** és manuálisan kezeled a login-t a Power Apps-ben.

---

## 10. API Endpoint Lista

Teljes API endpoint lista: [API_DOCUMENTATION.md](src/API_DOCUMENTATION.md)

OpenAPI spec: https://adminiculumaustriaeast-01.azurewebsites.net/api/v1/openapi.json
