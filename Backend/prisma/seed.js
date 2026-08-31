/**
 * Adminiculum Database Seed Script V2
 * Creates initial data for the SharePoint-hybrid architecture
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const prisma = new PrismaClient();

if ([process.env.NODE_ENV, process.env.ADMINICULUM_RUNTIME_ENVIRONMENT]
  .some((value) => String(value || '').toLowerCase() === 'production')) {
  throw new Error('prisma seed must never run in production.');
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MATTER_TYPES = [
  'REAL_ESTATE_SALE',
  'LEASE',
  'EMPLOYMENT',
  'CORPORATE',
  'LITIGATION',
  'OTHER'
];

const PRACTICE_AREAS = [
  { name: 'Banking, finance and capital markets', code: 'BANK', color: '#3b82f6' },
  { name: 'Commercial, corporate and M&A', code: 'CORP', color: '#6366f1' },
  { name: 'Competition', code: 'COMP', color: '#8b5cf6' },
  { name: 'Data privacy and data protection', code: 'DATA', color: '#ec4899' },
  { name: 'Dispute resolution', code: 'DISP', color: '#f59e0b' },
  { name: 'Employment', code: 'EMP', color: '#10b981' },
  { name: 'Intellectual property', code: 'IP', color: '#f97316' },
  { name: 'Projects and energy', code: 'PROJ', color: '#06b6d4' },
  { name: 'Real estate and construction', code: 'RE', color: '#22c55e' },
  { name: 'Tax', code: 'TAX', color: '#eab308' },
  { name: 'TMT', code: 'TMT', color: '#ef4444' },
];

const DEFAULT_SETTINGS = [
  {
    key: 'sharepoint_site',
    value: {
      name: 'Adminiculum - Legal Workflow',
      path: '/sites/AdminiculumLegalWorkflow',
      documentLibrary: 'Cases'
    },
    description: 'SharePoint site configuration'
  },
  {
    key: 'case_naming_pattern',
    value: 'CASE-<YEAR>-<NUMBER> – <CLIENT> – <TYPE>',
    description: 'Case folder naming pattern'
  },
  {
    key: 'app_config',
    value: {
      name: 'Adminiculum',
      theme: 'light',
      primaryColor: '#4F46E5'
    },
    description: 'Application configuration'
  }
];

const DOCUMENT_TEMPLATES = [
  {
    name: 'Alapvető Szerződés Sablon',
    description: 'Standard szerződés sablon',
    category: 'CONTRACT',
    filePath: './templates/contracts/basic-contract.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    variables: {
      clientName: 'string',
      contractDate: 'date',
      amount: 'currency',
      parties: 'array'
    }
  },
  {
    name: 'Hivatalos Levél Sablon',
    description: 'Hivatalos levél',
    category: 'LETTER',
    filePath: './templates/letters/official-letter.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    variables: {
      recipientName: 'string',
      recipientAddress: 'string',
      subject: 'string',
      body: 'text'
    }
  }
];

const REDACTION_RULES = [
  { key: 'PERSON_NAME', labelHu: 'Személynév', pattern: '[A-ZÁÉÍÓÖŰÚÜ][a-záéíóöűúü]+ [A-ZÁÉÍÓÖŰÚÜ][a-záéíóöűúü]+', enabled: true },
  { key: 'ADDRESS', labelHu: 'Cím', pattern: '\\d{4} [A-Za-záéíóöűúü\\s]+', enabled: true },
  { key: 'PHONE', labelHu: 'Telefonszám', pattern: '\\+36\\d{1,2}\\s?\\d{3}\\s?\\d{4}', enabled: true },
  { key: 'EMAIL', labelHu: 'Email cím', pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', enabled: true },
  { key: 'TAJ', labelHu: 'TAJ szám', pattern: '\\d{8}', enabled: true },
  { key: 'TAX_ID', labelHu: 'Adószám', pattern: '\\d{7}-[0-9]-[0-9]{2}', enabled: true },
  { key: 'ID_CARD', labelHu: 'Személyi igazolvány', pattern: '[A-Z]{2}\\d{6,7}', enabled: true },
  { key: 'PASSPORT', labelHu: 'Útlevél', pattern: '[A-Z]{1,2}\\d{6,8}', enabled: true },
  { key: 'BANK_ACCOUNT', labelHu: 'Bankszámlaszám', pattern: '\\d{8}-\\d{8}-\\d{8}', enabled: true }
];

const USERS = [
  {
    email: 'lawyer@adminiculum.com',
    name: 'Dr. Magyar Ügyvéd',
    role: 'LAWYER',
    title: 'Dr.',
    phone: '+36 1 234 5679',
    status: 'ACTIVE',
    hourlyRate: 15000,
    skills: {
      legalAnalysis: 5,
      drafting: 5,
      clientCommunication: 4,
      negotiation: 5,
      compliance: 4,
      research: 4
    }
  },
  {
    email: 'associate@adminiculum.com',
    name: 'Jogi Tanácsadó',
    role: 'COLLAB_LAWYER',
    title: 'Dr.',
    phone: '+36 1 234 5680',
    status: 'ACTIVE',
    hourlyRate: 10000,
    skills: {
      legalAnalysis: 4,
      drafting: 4,
      clientCommunication: 5,
      negotiation: 3,
      compliance: 4,
      research: 4
    }
  },
  {
    email: 'trainee@adminiculum.com',
    name: 'Ügyvédjelölt',
    role: 'TRAINEE',
    title: '',
    phone: '+36 1 234 5681',
    status: 'ACTIVE',
    hourlyRate: 5000,
    skills: {
      legalAnalysis: 3,
      drafting: 2,
      clientCommunication: 3,
      negotiation: 2,
      compliance: 3,
      research: 4
    }
  },
  {
    email: 'assistant@adminiculum.com',
    name: 'Jogi Asszisztens',
    role: 'LEGAL_ASSISTANT',
    title: '',
    phone: '+36 1 234 5682',
    status: 'ACTIVE',
    skills: {
      legalAnalysis: 2,
      drafting: 2,
      clientCommunication: 4,
      negotiation: 2,
      compliance: 3,
      research: 3
    }
  }
];

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

async function seedPracticeAreas() {
  console.log('\n📁 Creating practice areas...');
  for (const pa of PRACTICE_AREAS) {
    await prisma.practiceArea.upsert({
      where: { code: pa.code },
      update: {},
      create: {
        name: pa.name,
        code: pa.code,
        color: pa.color,
        description: `${pa.name} jogterület`,
      },
    });
    console.log(`  ✓ ${pa.name}`);
  }
}

async function seedSettings() {
  console.log('\n⚙️  Creating default settings...');
  for (const setting of DEFAULT_SETTINGS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
    console.log(`  ✓ ${setting.key}`);
  }
}

async function seedDocumentTemplates() {
  console.log('\n📄 Creating document templates...');
  for (const template of DOCUMENT_TEMPLATES) {
    await prisma.documentTemplate.upsert({
      where: { id: template.name.toLowerCase().replace(/\s+/g, '-') },
      update: {},
      create: {
        ...template,
        id: template.name.toLowerCase().replace(/\s+/g, '-'),
        isActive: true,
        version: 1
      },
    });
    console.log(`  ✓ ${template.name}`);
  }
}

async function seedUsers() {
  console.log('\n👥 Creating users...');
  for (const userData of USERS) {
    const { skills, ...userFields } = userData;

    await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        ...userFields,
        passwordHash: await bcrypt.hash(randomUUID(), 10),
        skillProfile: skills ? {
          create: skills
        } : undefined
      },
      include: {
        skillProfile: true
      }
    });
    console.log(`  ✓ ${userData.name} (${userData.role})`);
  }
}

async function seedRedactionRules() {
  console.log('\n🔒 Creating redaction rules...');
  for (const rule of REDACTION_RULES) {
    await prisma.redactionRule.upsert({
      where: { key: rule.key },
      update: {},
      create: rule,
    });
    console.log(`  ✓ ${rule.labelHu}`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('🌱 Starting Adminiculum database seed (V2)...');

  await prisma.factDefinition.upsert({
    where: { key: 'employee_count' },
    update: {
      status: 'ACTIVE',
      questionKey: 'employee_count',
      valueType: 'NUMBER',
      allowedScopeTypes: ['COMPANY'],
      determinationMethod: 'USER_PROVIDED',
      overlapPolicy: 'DISALLOW',
      temporalPolicy: 'OBSERVATION',
    },
    create: {
      key: 'employee_count',
      domainCode: 'ORGANIZATION_CLIENT_DISCOVERY',
      valueType: 'NUMBER',
      allowedScopeTypes: ['COMPANY'],
      determinationMethod: 'USER_PROVIDED',
      overlapPolicy: 'DISALLOW',
      temporalPolicy: 'OBSERVATION',
      questionKey: 'employee_count',
    },
  });

  await seedPracticeAreas();
  await seedSettings();
  await seedDocumentTemplates();
  await seedUsers();
  await seedRedactionRules();

  console.log('\n✅ Seed completed successfully!');
  console.log('\n📝 Test users created:');
  console.log('   - workforce identities are provisioned through the configured identity provider');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
