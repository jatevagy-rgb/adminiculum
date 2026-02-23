# Contracts Module

Contract template management and document generation for Adminiculum Legal Workflow Platform.

## Features

- **Template Management**: Upload, store, and manage contract templates (.docx files)
- **Document Generation**: Generate contracts from templates with variable substitution
- **Preview Mode**: Generate temporary previews that auto-expire after 24 hours
- **Hungarian Number Conversion**: Automatic conversion of numbers to Hungarian text (e.g., for prices)
- **SharePoint Integration**: Generated documents can be uploaded to SharePoint
- **Timeline Integration**: Automatic timeline events when contracts are generated

## API Endpoints

### Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/contracts/templates` | List all templates |
| GET | `/api/v1/contracts/templates/:id` | Get template by ID |
| GET | `/api/v1/contracts/templates/adasvetel/variables` | Get adásvételi variables |
| POST | `/api/v1/contracts/templates` | Upload new template |

### Document Generation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/contracts/generate` | Generate contract document |
| POST | `/api/v1/contracts/preview` | Generate preview (temporary) |
| GET | `/api/v1/contracts/case/:caseId` | Get contracts for case |
| GET | `/api/v1/contracts/:id/download` | Download generated contract |

### Administration

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/contracts/cleanup` | Cleanup expired previews (admin) |

## Usage Example

### Generate an Adásvételi Contract

```typescript
POST /api/v1/contracts/generate
{
  "templateId": "36a6c212-54f4-4aa9-b042-ffd3ce83b63c",
  "caseId": "case-uuid-here",
  "title": "Ingatlan adásvételi szerződés - 2026.02.11",
  "data": {
    "szerzodes_helye": "Budapest",
    "szerzodes_datuma": "2026-02-11",
    "elado_nev": "Kiss János",
    "elado_szul_nev": "Kiss János",
    "elado_anya_neve": "Nagy Mária",
    "elado_szul_hely": "Budapest",
    "elado_szul_ido": "1980-05-15",
    "elado_lakcim": "1101 Budapest, Fő utca 1.",
    "elado_szemelyi_ig": "123456AB",
    "elado_szemelyi_szam": "12345678",
    "elado_allampolgarsag": "magyar",
    "vevo_nev": "Nagy Péter",
    "vevo_szul_nev": "Nagy Péter",
    "vevo_anya_neve": "Szabó Anna",
    "vevo_szul_hely": "Debrecen",
    "vevo_szul_ido": "1985-08-20",
    "vevo_lakcim": "4024 Debrecen, Petőfi utca 5.",
    "vevo_szemelyi_ig": "876543CD",
    "vevo_szemelyi_szam": "87654321",
    "vevo_allampolgarsag": "magyar",
    "ingatlan_telepules": "Budapest",
    "ingatlan_helyrajzi_szam": "12345",
    "ingatlan_iranyitoszam": "1111",
    "ingatlan_utca": "Világos utca",
    "ingatlan_hazszam": "10",
    "ingatlan_emelet_ajto": "3. emelet 12.",
    "ingatlan_alapterulet": "75",
    "ingatlan_tipus_neve": "lakás",
    "ingatlan_tulajdoni_hanyad": "1/1",
    "tulajdoni_lap_sorszam": "12345/2026",
    "kormanyhivatal": "Budapest Főváros Kormányhivatala",
    "belterulet": "65",
    "vetelar": "45000000",
    "birtokbaadas_datuma": "2026-04-01",
    "kozos_tulajdoni_hanyad": null
  }
}
```

## Supported Template Categories

- `ADASVETEL` - Ingatlan adásvétel
- `BERLET` - Bérleti szerződés
- `MEGBIZAS` - Megbízási szerződés
- `MUNKASZERZODES` - Munkaszerződés
- `VALLALKOZAS` - Vállalkozási szerződés
- `EGYEB` - Egyéb

## Automatic Data Processing

The service automatically processes template data:

1. **Date Formatting**: Dates are formatted to Hungarian locale format (e.g., "2026. február 11.")
2. **Number to Words**: Prices are converted to Hungarian text (e.g., "45 000 000" → "negyvenötmillió forint")
3. **Address Construction**: Full addresses are built from components (zip, city, street, number)

## File Structure

```
src/modules/contracts/
├── index.ts          # Module exports
├── routes.ts         # API routes
├── services.ts       # Business logic
├── types.ts         # TypeScript types
└── README.md        # This file
```

## Dependencies

- `pizzip` - ZIP file manipulation
- `docxtemplater` - DOCX template processing
- `multer` - File upload handling
- `@prisma/client` - Database access
- `multer` - Multipart form data handling

## Database Tables

- `contract_templates` - Template definitions
- `contract_generations` - Generated document records
