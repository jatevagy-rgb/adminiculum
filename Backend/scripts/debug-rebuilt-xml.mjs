/**
 * Debug: dump rebuilt DOCX XML to inspect
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use PowerShell to extract the XML
const docPath = path.join(__dirname, '..', 'templates', 'Bejegyzesi_engedely_rebuilt_v1.docx');
const outPath = path.join(__dirname, '..', 'tmp', 'rebuilt_document.xml');

// Use PowerShell to extract
const ps = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('${docPath.replace(/\\/g, '\\\\')}')
$entry = $zip.Entries | Where-Object { $_.FullName -eq 'word/document.xml' }
$stream = $entry.Open()
$reader = New-Object System.IO.StreamReader($stream)
$content = $reader.ReadToEnd()
$reader.Close()
$stream.Close()
$zip.Dispose()
$content
`;

const result = execSync(`powershell -Command "${ps}"`, { encoding: 'utf8' });
fs.writeFileSync(outPath, result, 'utf8');

console.log(`XML written to: ${outPath}`);
console.log(`Size: ${result.length} chars`);
console.log(`\n=== First 3000 characters ===`);
console.log(result.substring(0, 3000));