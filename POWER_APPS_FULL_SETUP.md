# Power Apps Custom Connector - Teljes Beállítási Útmutató

## 1. Általános Beállítások (General)

| Mező | Érték |
|------|-------|
| **Title** | Adminiculum API |
| **Description** | Legal Workflow Platform API |
| **Host** | `lwp-backend-xxx.dev-tunnels.ms` |
| **Base URL** | `/api/v1` |

---

## 2. Security - OAuth 2.0 Beállítások

### 2.1 Security Fül

| Mező | Érték |
|------|-------|
| **Authentication type** | OAuth 2.0 |
| **Identity provider** | Azure Active Directory |

### 2.2 OAuth 2.0 Parameters

| Mező | Érték |
|------|-------|
| **Client ID** | `96872568-58a6-4ea5-8711-2d2c4ec7e16e` |
| **Client secret** | [REDACTED - stored in GitHub Secrets] |
| **Tenant ID** | `18b56834-dfea-4931-bdf8-e5ebb0cb4e0f` |
| **Resource URL** | `api://96872568-58a6-4ea5-8711-2d2c4ec7e16e` |
| **Scope** | `api://96872568-58a6-4ea5-8711-2d2c4ec7e16e/.default` |

### 2.3 OAuth 2.0 URLs

| Mező | Érték |
|------|-------|
| **Authorization URL** | `https://login.microsoftonline.com/18b56834-dfea-4931-bdf8-e5ebb0cb4e0f/oauth2/v2.0/authorize` |
| **Token URL** | `https://login.microsoftonline.com/18b56834-dfea-4931-bdf8-e5ebb0cb4e0f/oauth2/v2.0/token` |
| **Refresh URL** | `https://login.microsoftonline.com/18b56834-dfea-4931-bdf8-e5ebb0cb4e0f/oauth2/v2.0/token` |

---

## 3. Azure Portal - Redirect URI és API Expose Beállítása

### 3.1 Ugrás az Azure Portalra

1. Nyisd meg: https://portal.azure.com
2. Navigálj: **Azure Active Directory** → **App registrations**
3. Válaszd ki: `adminiculum-powerapps-client`

### 3.2 Redirect URI Hozzáadása

1. Kattints: **Authentication** (bal menü)
2. Kattints: **Add URI**
3. Add hozzá:
   ```
   https://global.consent.azure-apim.net/redirect/adminiculum-api
   ```
4. Kattints: **Save**

### 3.3 API Expose (Application ID URI)

1. Kattints: **Expose an API** (bal menü)
2. Kattints: **Add** az "Application ID URI" mellett
3. Javasolt érték: `api://96872568-58a6-4ea5-8711-2d2c4ec7e16e`
4. Kattints: **Save**

### 3.4 Scope Hozzáadása

1. Ugyanitt az "Expose an API" oldalon:
2. Kattints: **Add a scope**
3. Scope name: `access_as_user`
4. Admin consent required: **Yes**
5. Kattints: **Save**

### 3.5 Implicit Grant (ha kell)

Ugyanitt az **Authentication** oldalon:
- ✅ Engedélyezd: **ID tokens**
- ✅ Engedélyezd: **Access tokens**

---

## 4. Műveletek (Actions) Manuális Hozzáadása

### 4.1 Login Művelet

**Művelet azonosítója:** `Login`
**Verb:** `POST`
**URL path:** `/auth/login`

**Request Body:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Response (200):**
```json
{
  "accessToken": "string",
  "refreshToken": "string",
  "expiresIn": "integer",
  "user": {
    "id": "string",
    "email": "string",
    "name": "string",
    "role": "string"
  }
}
```

---

### 4.2 GetCases Művelet

**Művelet azonosítója:** `GetCases`
**Verb:** `GET`
**URL path:** `/cases`

---

### 4.3 CreateCase Művelet

**Művelet azonosítója:** `CreateCase`
**Verb:** `POST`
**URL path:** `/cases`

**Request Body:**
```json
{
  "title": "string",
  "type": "string",
  "description": "string",
  "clientId": "string",
  "priority": "low/normal/high/urgent",
  "dueDate": "string (date)"
}
```

---

### 4.4 GetCaseById Művelet

**Művelet azonosítója:** `GetCaseById`
**Verb:** `GET`
**URL path:** `/cases/{id}`

**Path Parameters:**
| Name | Type | Required |
|------|------|----------|
| id | string | Yes |

---

### 4.5 GetDocuments Művelet

**Művelet azonosítója:** `GetDocuments`
**Verb:** `GET`
**URL path:** `/documents`

---

### 4.6 GetUsers Művelet

**Művelet azonosítója:** `GetUsers`
**Verb:** `GET`
**URL path:** `/users`

---

### 4.7 GetClients Művelet

**Művelet azonosítója:** `GetClients`
**Verb:** `GET`
**URL path:** `/clients`

---

### 4.8 GetClientSummary Művelet

**Művelet azonosítója:** `GetClientSummary`
**Verb:** `GET`
**URL path:** `/client-portal/summary/{clientId}`

**Path Parameters:**
| Name | Type | Required |
|------|------|----------|
| clientId | string | Yes |

---

## 5. Teljes API Endpoint Lista

| # | Művelet | Verb | URL Path |
|---|---------|------|----------|
| 1 | Login | POST | /auth/login |
| 2 | Register | POST | /auth/register |
| 3 | GetCurrentUser | GET | /auth/me |
| 4 | GetCases | GET | /cases |
| 5 | CreateCase | POST | /cases |
| 6 | GetCaseById | GET | /cases/{id} |
| 7 | UpdateCaseStatus | PATCH | /cases/{id}/status |
| 8 | GetCaseHistory | GET | /cases/{id}/history |
| 9 | GetDocuments | GET | /documents |
| 10 | GetDocumentById | GET | /documents/{id} |
| 11 | UploadDocumentVersion | POST | /documents/{id}/version |
| 12 | GetDocumentVersions | GET | /documents/{id}/versions |
| 13 | GetUsers | GET | /users |
| 14 | CreateUser | POST | /users |
| 15 | GetUserById | GET | /users/{id} |
| 16 | GetUserSkills | GET | /users/{id}/skills |
| 17 | UpdateUserSkills | PUT | /users/{id}/skills |
| 18 | GetClients | GET | /clients |
| 19 | CreateClient | POST | /clients |
| 20 | GetClientById | GET | /clients/{id} |
| 21 | GetClientRequests | GET | /clients/{id}/requests |
| 22 | GetMessages | GET | /messages |
| 23 | SendMessage | POST | /messages |
| 24 | GetActivityFeed | GET | /messages/feed |
| 25 | GetTemplates | GET | /templates |
| 26 | GetClientSummary | GET | /client-portal/summary/{clientId} |
| 27 | GetClientDepartments | GET | /client-portal/departments/{clientId} |
| 28 | GetClientMatters | GET | /client-portal/departments/{deptId}/matters |
| 29 | GetClientMatterDetail | GET | /client-portal/matters/{matterId} |
| 30 | GetClientTimeLog | GET | /client-portal/matters/{matterId}/time-log |

---

## 6. Gyakori Hibák és Megoldások

### Hiba: "Refresh URL is required"
**Megoldás:** Add meg a Token URL-t Refresh URL-ként is.

### Hiba: "Scope is required"
**Megoldás:** Használd: `api://<client-id>/.default`

### Hiba: "Invalid client secret"
**Megoldás:** Ellenőrizd a secret-et az Azure Portalon.

### Hiba: "AADSTS50011 - Redirect URI mismatch"
**Megoldás:** Adj hozzá redirect URI-t az Azure Portalon.

---

## 7. Tesztelés

1. **Custom Connector** → **Test** fül
2. **Connections** → **+ New connection**
3. Jelentkezz be Microsoft fiókkal
4. Teszteld a `Login` műveletet
