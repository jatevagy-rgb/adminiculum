# Adminiculum SharePoint Integration Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ADMINICULUM UI                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │   Timeline   │  │   Tasks      │  │   Case Detail + Docs     │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     ADMINICULUM BACKEND                              │
│  ┌─────────────────────┐  ┌─────────────────────────────────────────┐ │
│  │   PostgreSQL        │  │   SharePoint Integration Service      │ │
│  │   (Cases, Tasks,    │  │   (Graph API)                         │ │
│  │    Users, Timeline)  │  │   - Folder Management                 │ │
│  └─────────────────────┘  │   - Document Upload/Download           │ │
└───────────────────────────┘  │   - Version Control                  │ │
                               └───────────────────────────────────────┘
                                         │
                                         ▼
                               ┌─────────────────────┐
                               │    SharePoint       │
                               │    Online           │
                               │  / OneDrive         │
                               └─────────────────────┘
```

## SharePoint Structure

```
📁 Site
├── 📁 Cases
│   └── 📁 {YYYY-XXX} - {ClientName}
│       ├── 📁 01_Client_Input
│       ├── 📁 02_Drafts
│       ├── 📁 03_Review
│       ├── 📁 04_Approved
│       ├── 📁 05_Sent_to_Client
│       ├── 📁 06_Client_Feedback
│       ├── 📁 07_Final
│       └── 📁 08_Anonymized
├── 📁 Templates
│   └── 📁 {Category}
└── 📁 KnowledgeBase
```

## Azure AD App Registration Setup

### 1. Register Application

1. Go to **Azure Portal** → **Azure Active Directory** → **App registrations**
2. Click **New registration**
3. Fill in:
   - Name: `Adminiculum SharePoint Integration`
   - Supported account types: `Accounts in this organizational directory only`
   - Redirect URI: `http://localhost`

### 2. Create Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Add description and expiration
4. **Copy the secret value immediately** (won't be shown again)

### 3. Configure API Permissions

1. Go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph** → **Application permissions**
4. Add:
   - `Sites.ReadWrite.All` - Full control of all site collections
   - `Files.ReadWrite.All` - Read and write all files user can access
5. Click **Grant admin consent**

### 4. Note Required Values

```
Tenant ID: {your-tenant-id}
Client ID: {your-app-id}
Client Secret: {your-client-secret}
```

## Environment Configuration

Create `.env` file:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/adminiculum"

# JWT
JWT_SECRET="your-jwt-secret"
JWT_EXPIRY="7d"

# SharePoint Configuration
SP_TENANT_ID="your-tenant-id"
SP_CLIENT_ID="your-app-id"
SP_CLIENT_SECRET="your-client-secret"
SP_SITE_ID="your-sharepoint-site-id"
SP_DRIVE_ID="your-sharepoint-drive-id"

# Optional: Alternative document storage
USE_LOCAL_STORAGE=false
LOCAL_STORAGE_PATH="./documents"
```

## SharePoint Site ID Finding

### Option 1: Graph Explorer

1. Go to https://developer.microsoft.com/en-us/graph/graph-explorer
2. Sign in
3. Run: `GET https://graph.microsoft.com/v1.0/sites/root`
4. Copy the `id` from response

### Option 2: PowerShell

```powershell
Connect-PnPOnline -Url "https://yourtenant.sharepoint.com/sites/YourSite"
Get-PnPSite | Select Id
```

## Drive ID Finding

Run:
```
GET https://graph.microsoft.com/v1.0/sites/{site-id}/drives
```

Copy the `id` from the response (usually `documents` drive).

## Prisma Schema Integration

The schema includes SharePoint metadata fields:

```prisma
model Document {
  // SharePoint Integration
  spItemId        String?   @unique  // SharePoint DriveItem ID
  spWebUrl        String?   // SharePoint web URL
  spParentPath    String?   // SP folder path
  spVersionId     String?   // SP version ID
  spCheckOutUser  String?   // Who has it checked out
}

model Case {
  // SharePoint Integration
  spSiteId        String?
  spDriveId       String?
  spFolderPath    String?   // /Cases/{caseNumber} - {clientName}
  spMainFolderId  String?
}
```

## Integration Service Usage

### Initialize Service

```javascript
const { SharePointService } = require('./sharepointService');

const spService = new SharePointService({
  tenantId: process.env.SP_TENANT_ID,
  clientId: process.env.SP_CLIENT_ID,
  clientSecret: process.env.SP_CLIENT_SECRET,
  siteId: process.env.SP_SITE_ID,
  driveId: process.env.SP_DRIVE_ID
});
```

### Create Case Structure

```javascript
// When creating a new case
const { mainFolder, subfolders, path } = await spService.createCaseFolders(
  case.caseNumber,    // e.g., "2024-001"
  client.name         // e.g., "Acme Kft."
);

// Save to database
await prisma.case.update({
  where: { id: case.id },
  data: {
    spFolderPath: path,
    spMainFolderId: mainFolder.id
  }
});
```

### Upload Document

```javascript
const document = await spService.uploadFile(
  `/Cases/${case.caseNumber}/02_Drafts`,
  'contract_v1.docx',
  fileBuffer
);

// Save SharePoint metadata
await prisma.document.update({
  where: { id: documentId },
  data: {
    spItemId: document.id,
    spWebUrl: document.webUrl,
    spParentPath: `/Cases/${case.caseNumber}/02_Drafts`
  }
});

// Create timeline event
await prisma.timelineEvent.create({
  data: {
    eventType: 'DOCUMENT_UPLOADED',
    caseId: case.id,
    userId: currentUser.id,
    documentId: documentId,
    metadata: {
      spItemId: document.id,
      spWebUrl: document.webUrl
    }
  }
});
```

### Document Workflow Integration

```javascript
const { WorkflowToSPFolder } = require('./sharepointService');

// When status changes
const newFolder = WorkflowToSPFolder[newStatus];

// Move document to appropriate folder
await spService.moveFile(
  currentPath,
  `/Cases/${case.caseNumber}/${newFolder}`
);

// Update document metadata
await prisma.document.update({
  where: { id: documentId },
  data: {
    spParentPath: `/Cases/${case.caseNumber}/${newFolder}`
  }
});
```

## Error Handling

```javascript
try {
  await spService.uploadFile(path, name, content);
} catch (error) {
  if (error.message.includes('404')) {
    // Folder doesn't exist, create it
    await spService.createFolder(path);
    await spService.uploadFile(path, name, content);
  } else {
    // Log error and notify user
    console.error('SharePoint error:', error);
    throw error;
  }
}
```

## Testing

### Graph Explorer

Use https://developer.microsoft.com/en-us/graph/graph-explorer to test:

```http
GET /v1.0/sites/{site-id}/drive/root/children
POST /v1.0/sites/{site-id}/drive/root/children
```

### Unit Tests

```javascript
describe('SharePointService', () => {
  it('creates case folders', async () => {
    const result = await spService.createCaseFolders('2024-001', 'Test Kft.');
    expect(result.subfolders).toHaveLength(8);
  });
});
```

## Security Considerations

1. **Never expose Client Secret** in client-side code
2. **Use HTTPS** for all Graph API calls
3. **Implement retry logic** for transient failures
4. **Cache tokens** to avoid excessive authentication
5. **Log all operations** for audit trail
6. **Implement rate limiting** to avoid throttling

## Performance Tips

1. **Batch operations** when possible
2. **Use delta queries** for folder synchronization
3. **Implement caching** for frequently accessed documents
4. **Use streaming** for large file uploads

## Troubleshooting

### Authentication Errors

```
Error: Authentication failed: 401 Unauthorized
```

Check:
- Client secret is correct
- Tenant ID is correct
- App has required permissions

### Permission Errors

```
Error: Insufficient privileges to complete the operation
```

Check:
- Admin consent granted for permissions
- User has access to SharePoint site

### Throttling

```
Error: 429 Too Many Requests
```

Implement exponential backoff:
```javascript
async function withRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429 && i < maxRetries - 1) {
        const wait = Math.pow(2, i) * 1000;
        await new Promise(r => setTimeout(r, wait));
      } else {
        throw error;
      }
    }
  }
}
```
