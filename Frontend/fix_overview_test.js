const fs = require('fs');
let content = fs.readFileSync('tests/communicationsOverview.test.ts', 'utf8');

content = content.replace(/CommunicationsOverview/g, 'CommunicationWorkspace');
content = content.replace(/'src\/app\/notifications\/page.tsx'/g, "'src/components/communications/CommunicationWorkspace.tsx'");

fs.writeFileSync('tests/communicationsOverview.test.ts', content);
