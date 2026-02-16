# Power Apps Custom Connector - OAuth 2.0 Beállítások

## Szükséges Azure AD Értékek (Már konfigurálva!)

| # | Mező | Érték |
|---|-------|-------|
| 🟩 1 | **Identity Provider** | `Azure Active Directory` |
| 🟩 2 | **Client ID** | `82b50ec7-3e89-48aa-af74-4831e1c651cd` |
| 🟩 3 | **Client Secret** | `O2O8Q~J6VGpoXqQqRYn-lwuvVFWWv8DMpKdSXcSV` |
| 🟩 4 | **Tenant ID** | `18b56834-dfea-4931-bdf8-e5ebb0cb4e0f` |
| 🟩 5 | **Resource URL** | `api://82b50ec7-3e89-48aa-af74-4831e1c651cd` |

---

## Power Apps Custom Connector - OAuth 2.0 Beállítások

### Security Fül

```yaml
Authentication type:        OAuth 2.0
Identity Provider:          Azure Active Directory

OAuth 2.0 Parameters:
├── Client ID:              82b50ec7-3e89-48aa-af74-4831e1c651cd
├── Client secret:          O2O8Q~J6VGpoXqQqRYn-lwuvVFWWv8DMpKdSXcSV
├── Tenant ID:              18b56834-dfea-4931-bdf8-e5ebb0cb4e0f
├── Resource URL:           api://82b50ec7-3e89-48aa-af74-4831e1c651cd
└── Scope:                  (üres maradhat)
```

### Token URL
```
https://login.microsoftonline.com/18b56834-dfea-4931-bdf8-e5ebb0cb4e0f/oauth2/v2.0/token
```

---

## Backend .env Fájl (Már konfigurálva)

```env
# ============================================================================
# Azure AD Configuration (SharePoint Integration)
# ============================================================================

SP_TENANT_ID="18b56834-dfea-4931-bdf8-e5ebb0cb4e0f"
SP_CLIENT_ID="82b50ec7-3e89-48aa-af74-4831e1c651cd"
SP_CLIENT_SECRET="O2O8Q~J6VGpoXqQqRYn-lwuvVFWWv8DMpKdSXcSV"

# ============================================================================
# SharePoint Site
# ============================================================================
SHAREPOINT_SITE_URL="https://baltars.sharepoint.com/sites/LegalCases"
```

---

## Power Apps Custom Connector - Complete Settings

### 1. General Info

| Mező | Érték |
|------|-------|
| **Title** | Adminiculum API |
| **Description** | Legal Document Management System API |
| **Host** | `lwp-backend-xxx.dev-tunnels.ms` (vagy ngrok URL) |
| **Base URL** | `/api/v1` |

### 2. Security

| Mező | Érték |
|------|-------|
| **Authentication type** | OAuth 2.0 |
| **Identity provider** | Azure Active Directory |
| **Client ID** | `82b50ec7-3e89-48aa-af74-4831e1c651cd` |
| **Client secret** | `O2O8Q~J6VGpoXqQqRYn-lwuvVFWWv8DMpKdSXcSV` |
| **Tenant ID** | `18b56834-dfea-4931-bdf8-e5ebb0cb4e0f` |
| **Resource URL** | `api://82b50ec7-3e89-48aa-af74-4831e1c651cd` |
| **Scope** | (üres) |

### 3. Token URL (automatikusan kitöltődik)

```
https://login.microsoftonline.com/18b56834-dfea-4931-bdf8-e5ebb0cb4e0f/oauth2/v2.0/token
```

---

## Quick Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│  Power Apps Custom Connector - OAuth 2.0 Settings                    │
├─────────────────────────────────────────────────────────────────────┤
│  Identity Provider:    Azure Active Directory                       │
│  Client ID:            82b50ec7-3e89-48aa-af74-4831e1c651cd          │
│  Client Secret:        O2O8Q~J6VGpoXqQqRYn-lwuvVFWWv8DMpKdSXcSV   │
│  Tenant ID:            18b56834-dfea-4931-bdf8-e5ebb0cb4e0f          │
│  Resource URL:         api://82b50ec7-3e89-48aa-af74-4831e1c651cd  │
│  Token URL:           https://login.microsoftonline.com/.../token   │
└─────────────────────────────────────────────────────────────────────┘
```
