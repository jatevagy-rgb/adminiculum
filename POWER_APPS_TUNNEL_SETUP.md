# Power Apps Custom Connector - Lokális Backend Elérés

## Probléma

A Power Apps Custom Connector nem fogadja el a `localhost` vagy `127.0.0.1` címeket a "Host" mezőben.

## Megoldás: Tunnel használata

---

## 1. VS Code Dev Tunnels (Ajánlott)

### Előfeltételek
- **VS Code** telepítve
- **Microsoft fiók** (GitHub vagy Azure AD)
- **Dev Tunnels bővítmény** telepítve

### Lépés 1: Bővítmény telepítése
1. VS Code → Extensions (`Ctrl+Shift+X`)
2. Keress rá: **"Dev Tunnels"**
3. Telepítsd a Microsoft-os bővítményt

### Lépés 2: Bejelentkezés
```bash
# VS Code terminalban
tunnel auth login
```
Kér fiók hitelesítésre (browser popup).

### Lépés 3: Tunnel létrehozása

**Port:** `3000` (ahol a backend fut)

**VS Code Command Palette (`Ctrl+Shift+P`):**
```
Dev Tunnels: Create Tunnel
```

**Vagy terminálból:**
```bash
# Telepítés ha kell
npm install -g @microsoft/dev-tunnels

# Tunnel létrehozása
tunnel create --name lwp-backend --port 3000 --domain ms
```

### Lépés 4: Kapott URL

A parancs outputja:
```
✅ Tunnel created successfully!
👉 URL: https://lwp-backend-abc123.dev-tunnels.ms
👉 Forwarding: https://lwp-backend-abc123.dev-tunnels.ms -> http://localhost:3000

Tunnel is ACTIVE. Share this URL for external access.
```

### Power Apps Custom Connector Beállítások

| Mező | Érték |
|------|-------|
| **Host** | `lwp-backend-abc123.dev-tunnels.ms` |
| **Base URL** | `/api/v1` |
| **OpenAPI URL** | `https://lwp-backend-abc123.dev-tunnels.ms/api/v1/openapi.json` |

---

## 2. Ngrok (Klasszikus módszer)

### Előfeltételek
- **Ngrok fiók** regisztráció: https://dashboard.ngrok.com/signup
- **Authtoken** beszerzése

### Lépés 1: Ngrok telepítése

**Option A: Chocolatey (Windows)**
```powershell
choco install ngrok
```

**Option B:winget**
```powershell
winget install ngrok.ngrok
```

**Option C: Manuális**
1. https://ngrok.com/download
2. Csomagold ki pl. `C:\tools\ngrok`
3. Add a PATH-hoz vagy használd teljes útvonallal

### Lépés 2: Authtoken beállítása

```bash
ngrok config add-authtoken YOUR_AUTHTOKEN
```

**Authtoken beszerzése:**
1. https://dashboard.ngrok.com/get-started/your-authtoken
2. Másold ki az authtoken-t
3. Futtasd a fenti parancsot

### Lépés 3: Tunnel indítása

**Local port:** `3000`

```bash
ngrok http 3000
```

Output:
```
Session Status                online
Account                       your-email@gmail.com
Version                       3.x.x
Region                        Europe (eu)
Latency                       15ms
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123def456.eu.ngrok.io -> http://localhost:3000
```

### Power Apps Custom Connector Beállítások

| Mező | Érték |
|------|-------|
| **Host** | `abc123def456.eu.ngrok.io` |
| **Base URL** | `/api/v1` |
| **OpenAPI URL** | `https://abc123def456.eu.ngrok.io/api/v1/openapi.json` |

---

## 3. localtunnel (Node.js alternatíva)

### Előfeltételek
- **Node.js** telepítve

### Telepítés és indítás

```bash
# Telepítés globálisan
npm install -g localtunnel

# Indítás
lt --port 3000
```

Output:
```
your url is: https://long-sheep-123.loca.lt
```

---

## Custom Connector Létrehozás Power Apps-ben

### 1. Új Connector
```
Power Platform → Custom Connectors → + New custom connector
```

### 2. OpenAPI Import
```
Import an OpenAPI file → Specify a URL
URL: https://<tunnel-url>/api/v1/openapi.json
```

### 3. General Info
| Mező | Érték |
|------|-------|
| **Title** | Adminiculum API |
| **Description** | Legal Document Management System API |
| **Host** | `<tunnel-host>` (pl. `lwp-backend-abc123.dev-tunnels.ms`) |
| **Base URL** | `/api/v1` |

### 4. Security (Authentication)
| Mező | Érték |
|------|-------|
| **Type** | JWT |
| **Authentication** | Bearer Token |
| **Header** | Authorization |
| **Token URL** | `https://<tunnel-url>/api/v1/auth/login` |

### 5. Definition
Az OpenAPI importálás után minden endpoint自动 megjelenik.

### 6. Test
Teszteld a connector létrehozás után.

---

## Backend Konfiguráció

### Environment Variables (.env)

```env
# Backend port (a tunnel erre a portra mutat)
PORT=3000

# Database
DATABASE_URL="postgresql://..."

# JWT
JWT_SECRET="your-secret"
JWT_EXPIRES_IN="1h"

# SharePoint (ha használod)
SP_TENANT_ID="..."
SP_CLIENT_ID="..."
SP_CLIENT_SECRET="..."
```

### Backend futtatása

```bash
cd ../lwp/backend
npm run dev
```

A backend már fut a `http://localhost:3000` címen.

---

## OpenAPI Endpoint

A létrehozott endpoint már működik:
```
GET /api/v1/openapi.json → Returns swagger spec as JSON
```

**Teljes URL:**
```
https://<tunnel-url>/api/v1/openapi.json
```

---

## Gyakori Hibák és Megoldások

### Hiba: "Host cannot be localhost"
**Ok:** Power Apps nem fogadja el a localhost-ot
**Megoldás:** Használj tunnel-t (Dev Tunnels vagy Ngrok)

### Hiba: "Tunnel expired"
**Ok:** Ngrok session lejárt (ingyenes terv: 2 óra)
**Megoldás:** Indítsd újra a tunnel-t

### Hiba: "CORS error"
**Ok:** A backend nem engedélyezi a Power Apps domain-t
**Megoldás:** Ellenőrizd a CORS beállításokat a backendben

### Hiba: "401 Unauthorized"
**Ok:** JWT token hiányzik vagy érvénytelen
**Megoldás:** A Power Apps Custom Connectorban add meg a token-t

---

## Production Átállás

Fejlesztés után:
1. **Deploy backend** Azure-ra vagy más cloud-ra
2. **Frissítsd** az OpenAPI servers URL-t
3. **Power Apps:** Frissítsd a Host mezőt

---

## Hasznos Linkek

| Erőforrás | URL |
|-----------|-----|
| Dev Tunnels VS Code | https://marketplace.visualstudio.com/items?itemName=ms-vscode.remote-explorer |
| Ngrok Download | https://ngrok.com/download |
| Ngrok Dashboard | https://dashboard.ngrok.com |
| Power Apps Custom Connectors | https://learn.microsoft.com/en-us/connectors/custom-connectors/ |
