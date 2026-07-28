# Client (Customer) External Identity Provider — Setup Runbook

Configure the **customer** identity provider (Microsoft Entra External ID / CIAM)
that the Client Portal browser-delegated sign-in consumes. This is the privileged
Entra-admin sequence a human must perform once, plus the exact production settings
the already-deployed code reads.

> **Scope guard.** The application implements a *browser-delegated* (MSAL
> authorization-code + PKCE, redirect flow) customer sign-in. **Registration,
> e-mail verification, and password reset all happen on the External ID hosted
> flow — Adminiculum never receives the customer password or one-time code.**
> The local `/portal/login`, `/portal/register`, `/portal/verify-email`,
> `/portal/forgot-password` and `/portal/reset-password` routes are **branded
> launcher pages** that start the hosted flow (`CustomerAuthLauncher` →
> `useCustomerAuth`); they contain no password, e-mail or verification-code
> inputs. The Adminiculum database never stores passwords, password hashes,
> verification codes, reset codes, or tokens — membership and portal grants are
> Adminiculum-side workflows, **not** provider claims. Do **not** create a
> workforce B2B guest as the customer model. Do **not** enable portal write
> actions as part of this runbook.

---

## 0. What the deployed code actually consumes

These are the real environment inputs. Names come directly from source.

### Frontend SPA — `Frontend/src/lib/authConfig.ts`
| Setting | Purpose | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_ENTRA_CLIENT_ID` | MSAL `clientId` — the **customer SPA** app registration's Application (client) ID | No |
| `NEXT_PUBLIC_ENTRA_AUTHORITY` | MSAL `authority` — **must** be the External ID (CIAM) authority. **Do not** rely on the `login.microsoftonline.com` default; that is the workforce endpoint. | No |
| `NEXT_PUBLIC_ENTRA_REDIRECT_URI` | MSAL `redirectUri` — where the provider returns the auth code | No |
| `NEXT_PUBLIC_ENTRA_POST_LOGOUT_REDIRECT_URI` | MSAL `postLogoutRedirectUri` | No |
| `NEXT_PUBLIC_ADMINICULUM_API_SCOPE` | Delegated scope requested for the backend API access token (`loginRequest.scopes` + `acquireTokenSilent`) | No |
| `NEXT_PUBLIC_BACKEND_BASE_URL` | Backend origin the portal API client calls | No |

Everything the frontend consumes is **non-secret and public** (`NEXT_PUBLIC_*`,
shipped to the browser). A **client secret must never be placed in frontend
configuration** — the SPA uses PKCE, no secret.

### Backend API — `Backend/src/middleware/clientPortalAuth.ts`
| Setting | Purpose | Secret? |
| --- | --- | --- |
| `CLIENT_IDENTITY_ISSUER` | Expected `iss` of customer tokens (JWT validation). Fallback name: `CLIENT_PORTAL_IDENTITY_ISSUER`. | No |
| `CLIENT_IDENTITY_AUDIENCE` | Expected `aud` of customer tokens. Fallback: `CLIENT_PORTAL_IDENTITY_AUDIENCE`. | No |
| `CLIENT_IDENTITY_JWKS_URI` | JWKS endpoint used to fetch signing keys. Fallback: `CLIENT_PORTAL_IDENTITY_JWKS_URI`. | No |
| `CLIENT_PORTAL_READ_ENABLED` | Read-only alpha gate (`publicationService`). Set `true` only when accepting. | No |
| `CLIENT_PORTAL_ACTIONS_ENABLED` | Portal **write** gate. **Leave unset / `false`.** | No |
| `CORS_ALLOWED_ORIGINS` | Must include the frontend origin (`Backend/src/index.ts`). | No |

The backend validates customer tokens purely via **JWKS** — it holds **no
customer client secret**. A backend client secret is required **only** if the
backend itself needs to call Microsoft Graph or acquire tokens as a confidential
client; the token-validation path here does not. See §5.

### Production hostnames (deployed)
- Frontend: `https://adminiculumfrontend-austriaeast-01.azurewebsites.net`
- Backend:  `https://adminiculumbackend-b1-01.azurewebsites.net`

---

## 1. App registrations required

Two registrations in the **External ID (customer) tenant**:

1. **Customer Portal SPA** (public client, PKCE, no secret)
   - Platform: **Single-page application**
   - Redirect URI: `https://adminiculumfrontend-austriaeast-01.azurewebsites.net/portal`
   - Front-channel logout / post-logout redirect: `https://adminiculumfrontend-austriaeast-01.azurewebsites.net/portal`
   - Supported account type: **customers of this external tenant only**
   - No client secret.

2. **Adminiculum Backend API** (resource / exposed API)
   - Application ID URI: `api://<BACKEND_APP_CLIENT_ID>`
   - Exposed delegated scope: `access_as_client` (full value `api://<BACKEND_APP_CLIENT_ID>/access_as_client`)
   - The SPA is granted this delegated scope (admin/user consent).

> The redirect URI is `/portal` because `Frontend/src/components/AppProviders.tsx`
> runs `handleRedirectPromise()` globally on every route, and
> `ClientPortalShell.signOut()` already returns to `origin + '/portal'`. Use the
> **exact** string above — no trailing slash, no query.

---

## 2. Exact production URL matrix

| Concern | Exact value |
| --- | --- |
| Portal entry (functional sign-in) | `https://adminiculumfrontend-austriaeast-01.azurewebsites.net/portal` |
| SPA redirect URI (Entra) | `https://adminiculumfrontend-austriaeast-01.azurewebsites.net/portal` |
| Post-logout redirect URI (Entra) | `https://adminiculumfrontend-austriaeast-01.azurewebsites.net/portal` |
| Backend API origin | `https://adminiculumbackend-b1-01.azurewebsites.net` |
| Backend CORS allow-origin | `https://adminiculumfrontend-austriaeast-01.azurewebsites.net` |
| API scope requested by SPA | `api://<BACKEND_APP_CLIENT_ID>/access_as_client` |

Registration / verify / reset are **provider-hosted** by the user flow (see §3);
the app does not host its own credential-collecting pages on the functional path.

---

## 3. External ID resource plan

- **External tenant**: create a *customer* (CIAM) tenant — e.g. subdomain
  `adminiculumclients` → `adminiculumclients.onmicrosoft.com`. Region per data
  residency requirements (EU).
- **User flow**: *Sign up and sign in*, identity provider **Email with password**,
  with **e-mail verification** and **self-service password reset** enabled.
  MFA: decide per risk posture (recommended: e-mail/OTP second factor for a legal
  client portal). Attributes collected: e-mail (required), display name.
- **Branding**: firm logo, background, privacy policy URL, terms URL, support
  contact — on the user-flow company branding.
- **Membership & grants stay in Adminiculum.** A verified customer identity maps
  to `ClientPortalIdentity` by `(issuer, subject)`; a workforce ADMIN/PARTNER
  approves membership and creates the `ClientPortalGrant`. No portal authorization
  is expressed as a provider claim.

---

## 4. Obtaining issuer / JWKS / endpoints (do not invent)

After the tenant + user flow exist, read the **OpenID Connect discovery
document** and copy the exact values:

```
https://<TENANT_SUBDOMAIN>.ciamlogin.com/<TENANT_ID>/v2.0/.well-known/openid-configuration
```

From that JSON, copy verbatim:
- `issuer`            → `CLIENT_IDENTITY_ISSUER`
- `jwks_uri`          → `CLIENT_IDENTITY_JWKS_URI`
- `authorization_endpoint`, `token_endpoint`, `end_session_endpoint` — informational

`CLIENT_IDENTITY_AUDIENCE` = the `aud` claim the API access token actually carries.
For an External ID access token issued for the exposed API scope this is the
backend Application ID URI `api://<BACKEND_APP_CLIENT_ID>` (confirm against a real
token's `aud` during acceptance — do **not** guess between the App ID URI and the
raw client id; verify).

**Isolation check:** the customer issuer/audience must differ from the workforce
values. Customer tokens must fail workforce validation and vice-versa
(`AuthIdentityType` split in `clientPortalAuth.ts`). §Verification enforces this.

---

## 5. Client-secret determination

- **Frontend SPA**: **no secret** (PKCE public client). Never place a secret in
  `NEXT_PUBLIC_*`.
- **Backend token validation**: **no customer secret** (JWKS only).
- A confidential-client secret is needed **only** if the backend later acquires
  tokens on its own behalf (e.g. Graph). Out of scope for portal sign-in.

---

## 6. Config matrix (every deployed setting)

| Setting | Consumer | Source | Secret | Restart |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_ENTRA_CLIENT_ID` | Frontend | SPA reg → Application (client) ID | No | Frontend redeploy |
| `NEXT_PUBLIC_ENTRA_AUTHORITY` | Frontend | External ID CIAM authority | No | Frontend redeploy |
| `NEXT_PUBLIC_ENTRA_REDIRECT_URI` | Frontend | §2 exact string | No | Frontend redeploy |
| `NEXT_PUBLIC_ENTRA_POST_LOGOUT_REDIRECT_URI` | Frontend | §2 exact string | No | Frontend redeploy |
| `NEXT_PUBLIC_ADMINICULUM_API_SCOPE` | Frontend | `api://<BACKEND_APP_CLIENT_ID>/access_as_client` | No | Frontend redeploy |
| `NEXT_PUBLIC_BACKEND_BASE_URL` | Frontend | `https://adminiculumbackend-b1-01.azurewebsites.net` | No | Frontend redeploy |
| `CLIENT_IDENTITY_ISSUER` | Backend | discovery `issuer` | No | App Service restart |
| `CLIENT_IDENTITY_AUDIENCE` | Backend | token `aud` = `api://<BACKEND_APP_CLIENT_ID>` | No | App Service restart |
| `CLIENT_IDENTITY_JWKS_URI` | Backend | discovery `jwks_uri` | No | App Service restart |
| `CLIENT_PORTAL_READ_ENABLED` | Backend | `true` for acceptance | No | App Service restart |
| `CLIENT_PORTAL_ACTIONS_ENABLED` | Backend | **leave off** | No | — |
| `CORS_ALLOWED_ORIGINS` | Backend | frontend origin | No | App Service restart |

Verify with `npx tsx scripts/verify-client-identity-provider-config.ts` (§8).

---

## 7. Exact Entra admin step sequence (privileged — human performs)

1. Sign in to the Microsoft Entra admin center with an account that can create external tenants.
2. Create an **External ID (customer) tenant**; record subdomain and tenant ID.
3. Switch directory to the new external tenant.
4. **App registrations → New registration**: name "Adminiculum Backend API". Record its Application (client) ID = `<BACKEND_APP_CLIENT_ID>`.
5. On that API app → **Expose an API** → set Application ID URI `api://<BACKEND_APP_CLIENT_ID>`.
6. **Add a scope** `access_as_client` (admin + user consent, enabled).
7. **App registrations → New registration**: name "Adminiculum Customer Portal SPA". Account type: customers of this tenant.
8. Add platform **Single-page application** with redirect URI `https://adminiculumfrontend-austriaeast-01.azurewebsites.net/portal`.
9. Set front-channel logout / post-logout redirect `https://adminiculumfrontend-austriaeast-01.azurewebsites.net/portal`.
10. Record the SPA Application (client) ID = `<SPA_CLIENT_ID>`. Confirm **no client secret** is created.
11. On the SPA → **API permissions** → add the backend API's `access_as_client` delegated scope; grant admin consent.
12. **External Identities → User flows → New user flow**: *Sign up and sign in*; identity provider **Email with password**; enable e-mail verification and password reset; decide MFA.
13. Add the SPA (and API) app to the user flow.
14. Configure **company branding** (logo, background, privacy/terms URLs, support contact).
15. Open the discovery document (§4); copy `issuer` and `jwks_uri`.
16. In the **backend** App Service settings, set `CLIENT_IDENTITY_ISSUER`, `CLIENT_IDENTITY_AUDIENCE` (= `api://<BACKEND_APP_CLIENT_ID>`), `CLIENT_IDENTITY_JWKS_URI`, `CORS_ALLOWED_ORIGINS` (frontend origin), `CLIENT_PORTAL_READ_ENABLED=true`; leave `CLIENT_PORTAL_ACTIONS_ENABLED` off. Restart.
17. In the **frontend** App Service settings, set the six `NEXT_PUBLIC_*` values (§0). Redeploy the frontend so they are baked into the client bundle.
18. Run `npx tsx scripts/verify-client-identity-provider-config.ts` — it must exit 0.
19. In the visible browser, open `/portal`, complete provider-hosted **sign-up + e-mail verification** as a test customer (the human types the credentials directly; never in chat).
20. As a workforce ADMIN/PARTNER, approve the membership request and create the portal grant; enable read for the matter/document.
21. Confirm the customer sees only granted resources; confirm workforce tokens cannot access the portal and customer tokens cannot access workforce APIs (isolation).

---

## 8. Verification

`scripts/verify-client-identity-provider-config.ts`:
- fetches the OIDC discovery document,
- confirms configured `CLIENT_IDENTITY_ISSUER` matches discovery `issuer`,
- confirms `CLIENT_IDENTITY_JWKS_URI` matches discovery `jwks_uri`,
- confirms authorization/token/end-session endpoints are present,
- confirms customer issuer differs from any configured workforce issuer,
- reads only **non-secret** env inputs and **never prints secrets**,
- exits non-zero on any mismatch.
